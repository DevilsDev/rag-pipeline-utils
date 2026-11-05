"use strict";

/**
 * Live tests against the Claude API: npm run test:live. They cost a few
 * cents (Haiku, short outputs) and are skipped without a key. See
 * live-env.js for where the key comes from.
 */

const { liveAnthropic, MODEL } = require("./live-env");
const {
  AnthropicConnector,
} = require("../../src/connectors/anthropic-connector");
const { createRagPipeline } = require("../../src/core/create-pipeline");
const { MemoryRetriever } = require("../../src/connectors/memory-retriever");
const { HashEmbedder } = require("../../src/testing");
const { checkAnswer } = require("../../src/grounding/check-answer");
const {
  fromAnthropicCitations,
  verifyCitations,
} = require("../../src/grounding/provider-citations");

const { apiKey, reason } = liveAnthropic();
const describeLive = apiKey ? describe : describe.skip;
if (!apiKey) {
  // eslint-disable-next-line no-console
  console.warn(`Skipping live Claude tests: ${reason}`);
}

const HANDBOOK =
  "Employees receive 25 days of paid vacation per year. Unused vacation days can be carried over for up to 12 months.";
const REMOTE =
  "Remote work is allowed two days per week with manager approval. Employees must be reachable during core hours, 10:00 to 15:00.";
const documents = [
  { id: "handbook", text: HANDBOOK },
  { id: "remote", text: REMOTE },
];

jest.setTimeout(60000);

describeLive("Claude API, live", () => {
  const connector = () =>
    new AnthropicConnector({ apiKey, model: MODEL, maxTokens: 300 });

  test("AnthropicConnector.generate answers from the context", async () => {
    const answer = await connector().generate(
      "How many vacation days do employees get?",
      [{ id: "handbook", content: HANDBOOK }],
    );
    expect(typeof answer).toBe("string");
    expect(answer).toMatch(/25/);
  });

  test("AnthropicConnector.generateStream streams the answer", async () => {
    let text = "";
    let chunks = 0;
    for await (const chunk of connector().generateStream(
      "How many remote days are allowed per week?",
      [{ id: "remote", content: REMOTE }],
    )) {
      const token = typeof chunk === "string" ? chunk : chunk.token || "";
      text += token;
      if (token) chunks += 1;
    }
    expect(chunks).toBeGreaterThan(0);
    expect(text.toLowerCase()).toMatch(/two|2/);
  });

  test("a pipeline run with Claude is grounded in what it retrieved", async () => {
    const embedder = new HashEmbedder();
    const retriever = new MemoryRetriever();
    await retriever.store(
      await Promise.all(
        documents.map(async (d) => ({
          id: d.id,
          content: d.text,
          vector: await embedder.embed(d.text),
        })),
      ),
    );
    const pipeline = createRagPipeline({
      embedder,
      retriever,
      llm: connector(),
    });
    const result = await pipeline.run({
      query: "How many vacation days do employees get per year?",
      options: { topK: 2, citations: true, evaluate: true },
    });
    expect(result.success).toBe(true);
    expect(result.answer).toMatch(/25/);
    expect(result.citations.groundednessScore).toBeGreaterThan(0);
    expect(result.evaluation.scores.faithfulness).toBeGreaterThan(0);
  });

  test("Claude as the checkAnswer judge accepts a paraphrase", async () => {
    // Too few shared words for the lexical check, so the judge decides
    const check = await checkAnswer({
      answer: "Staff get five weeks off annually.",
      sources: [
        {
          id: "leave",
          content: "Each worker may take five weeks of paid leave every year.",
        },
      ],
      judge: connector(),
      evaluate: false,
    });
    expect(check.judge.error).toBeUndefined();
    expect(check.judge.calls).toBe(1);
    expect(check.judge.verdicts[0]).toMatchObject({
      decidedBy: "judge",
      verdict: "supported",
      sourceId: "leave",
    });
    expect(check.grounded).toBe(true);
  });

  describe("citations", () => {
    let message;

    beforeAll(async () => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 400,
          messages: [
            {
              role: "user",
              content: [
                ...documents.map((d) => ({
                  type: "document",
                  source: {
                    type: "text",
                    media_type: "text/plain",
                    data: d.text,
                  },
                  title: d.id,
                  citations: { enabled: true },
                })),
                {
                  type: "text",
                  text: "How much vacation do employees get, can they carry it over, and how many remote days are allowed?",
                },
              ],
            },
          ],
        }),
      });
      message = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(message.error || message));
    });

    test("Claude's own citations verify", async () => {
      const normalized = fromAnthropicCitations(message, { documents });
      expect(normalized.claims.length).toBeGreaterThan(0);
      for (const claim of normalized.claims) {
        for (const c of claim.citations) {
          expect(["handbook", "remote"]).toContain(c.sourceId);
          expect(c.passages[0].length).toBeGreaterThan(0);
        }
      }
      const check = await verifyCitations(normalized);
      expect(check.summary.unverifiable).toBe(0);
      expect(check.verified).toBe(true);
    });

    test("a cited claim edited to the wrong number fails", async () => {
      // The same real response, with "25" changed in the text Claude wrote
      const edited = JSON.parse(JSON.stringify(message));
      const block = edited.content.find(
        (b) => b.type === "text" && /25/.test(b.text) && b.citations?.length,
      );
      expect(block).toBeDefined();
      block.text = block.text.replace("25", "40");
      const check = await verifyCitations(
        fromAnthropicCitations(edited, { documents }),
      );
      expect(check.verified).toBe(false);
      const claim = check.claims.find((c) => /40/.test(c.text));
      expect(claim).toMatchObject({
        verdict: "unsupported",
        lexicalReason: "number_mismatch",
      });
    });
  });
});
