"use strict";

/**
 * Fixtures are written by hand from the response types of
 * @anthropic-ai/sdk 1.5.0 (Message, TextBlock, TextCitation) and openai
 * 7.48 (Response, ResponseOutputText.FileCitation,
 * ResponseFileSearchToolCall.Result); no API is called.
 */

const {
  fromAnthropicCitations,
  fromOpenAIFileCitations,
  verifyCitations,
  sentencesWithOffsets,
} = require("../../../src/grounding/provider-citations");
const root = require("../../../src/index.js");
const edge = require("../../../src/edge.js");
const evalPackage = require("../../../src/packages/eval.js");

const VACATION = "Employees receive 25 days of paid vacation per year.";
const REMOTE = "Remote work is allowed two days per week.";
const PARKING = "Parking is free for all employees at the main office.";

const charCitation = (text, index, title) => ({
  type: "char_location",
  cited_text: text,
  document_index: index,
  document_title: title,
  start_char_index: 0,
  end_char_index: text.length,
  file_id: null,
});

const block = (text, citations = null) => ({ type: "text", text, citations });

function claudeMessage(blocks) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-test",
    content: blocks,
    stop_reason: "end_turn",
  };
}

function openaiResponse({ text, annotations, results }) {
  return {
    id: "resp_1",
    object: "response",
    output: [
      {
        type: "file_search_call",
        id: "fs_1",
        queries: ["vacation"],
        status: "completed",
        ...(results !== undefined && { results }),
      },
      {
        type: "message",
        id: "msg_1",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations }],
      },
    ],
  };
}

describe("sentencesWithOffsets", () => {
  test("splits like splitSentences and keeps offsets", () => {
    const text = "One two. Three four!  Five?\nSix";
    const out = sentencesWithOffsets(text);
    expect(out.map((s) => s.text)).toEqual([
      "One two.",
      "Three four!",
      "Five?",
      "Six",
    ]);
    for (const s of out) expect(text.slice(s.start, s.end)).toBe(s.text);
  });
});

describe("fromAnthropicCitations", () => {
  test("makes each cited text block a claim, named by your document ids", () => {
    const out = fromAnthropicCitations(
      claudeMessage([
        block("According to the handbook, "),
        block("employees get 25 days of paid vacation", [
          charCitation(VACATION, 0, "Handbook"),
        ]),
        block("."),
      ]),
      { documents: [{ id: "handbook" }] },
    );
    expect(out.answer).toBe(
      "According to the handbook, employees get 25 days of paid vacation.",
    );
    expect(out.claims).toEqual([
      {
        text: "employees get 25 days of paid vacation",
        start: 27,
        end: 65,
        citations: [
          {
            sourceId: "handbook",
            title: "Handbook",
            location: {
              type: "char_location",
              documentIndex: 0,
              start: 0,
              end: VACATION.length,
            },
            passages: [VACATION],
          },
        ],
      },
    ]);
  });

  test("names every location type", () => {
    const out = fromAnthropicCitations(
      claudeMessage([
        block("A", [
          {
            type: "page_location",
            cited_text: "a",
            document_index: 2,
            document_title: null,
            start_page_number: 1,
            end_page_number: 2,
            file_id: null,
          },
          {
            type: "content_block_location",
            cited_text: "b",
            document_index: 0,
            document_title: "Doc",
            start_block_index: 0,
            end_block_index: 1,
            file_id: null,
          },
          {
            type: "search_result_location",
            cited_text: "c",
            search_result_index: 0,
            source: "https://kb.example/1",
            title: "KB",
            start_block_index: 0,
            end_block_index: 1,
          },
          {
            type: "web_search_result_location",
            cited_text: "d",
            encrypted_index: "x",
            title: "Web",
            url: "https://example.com",
          },
          { type: "future_location", cited_text: "e" },
        ]),
      ]),
    );
    expect(out.claims[0].citations.map((c) => c.sourceId)).toEqual([
      "2",
      "Doc",
      "https://kb.example/1",
      "https://example.com",
    ]);
    expect(out.skipped).toEqual({ future_location: 1 });
  });

  test.each([
    [null, /needs a Messages API response/],
    [{ output: [] }, /use fromOpenAIFileCitations/],
    [{ choices: [] }, /use fromOpenAIFileCitations/],
    [{ role: "assistant" }, /content blocks/],
  ])("rejects %j", (input, message) => {
    expect(() => fromAnthropicCitations(input)).toThrow(message);
  });
});

describe("fromOpenAIFileCitations", () => {
  const text =
    "Employees get 25 days of paid vacation. Remote work is allowed two days a week.";

  test("ties each citation to the sentence before its index, with the file's chunks", () => {
    const out = fromOpenAIFileCitations(
      openaiResponse({
        text,
        annotations: [
          {
            type: "file_citation",
            file_id: "file-hb",
            filename: "handbook.pdf",
            index: 39,
          },
          {
            type: "file_citation",
            file_id: "file-remote",
            filename: "remote.md",
            index: text.length,
          },
          {
            type: "url_citation",
            url: "https://x",
            title: "x",
            start_index: 0,
            end_index: 1,
          },
        ],
        results: [
          { file_id: "file-hb", filename: "handbook.pdf", text: PARKING },
          { file_id: "file-hb", filename: "handbook.pdf", text: VACATION },
          { file_id: "file-remote", filename: "remote.md", text: REMOTE },
        ],
      }),
    );
    expect(out.results).toBe(true);
    expect(out.skipped).toEqual({ url_citation: 1 });
    expect(out.claims.map((c) => [c.text, c.citations[0].sourceId])).toEqual([
      ["Employees get 25 days of paid vacation.", "file-hb"],
      ["Remote work is allowed two days a week.", "file-remote"],
    ]);
    expect(out.claims[0].citations[0]).toMatchObject({
      title: "handbook.pdf",
      passages: [PARKING, VACATION],
      location: { type: "file_citation", index: 39 },
    });
  });

  test("a marker after a paragraph covers each of its sentences", async () => {
    // OpenAI's own example puts several citations at one index, after a
    // paragraph
    const paragraph = `${VACATION} ${REMOTE}`;
    const text = `${paragraph}\n\nParking is free.`;
    const normalized = fromOpenAIFileCitations(
      openaiResponse({
        text,
        annotations: [
          {
            type: "file_citation",
            file_id: "a",
            filename: "a",
            index: paragraph.length,
          },
          {
            type: "file_citation",
            file_id: "b",
            filename: "b",
            index: paragraph.length,
          },
          {
            type: "file_citation",
            file_id: "a",
            filename: "a",
            index: paragraph.length,
          },
        ],
        results: [
          { file_id: "a", text: VACATION },
          { file_id: "b", text: REMOTE },
        ],
      }),
    );
    expect(normalized.claims.map((c) => c.text)).toEqual([VACATION, REMOTE]);
    expect(
      normalized.claims.map((c) => c.citations.map((k) => k.sourceId)),
    ).toEqual([
      ["a", "b"],
      ["a", "b"],
    ]);
    const r = await verifyCitations(normalized);
    expect(r.claims.map((c) => c.verdict)).toEqual(["supported", "supported"]);
    // After the last marker: not cited
    expect(r.uncited.map((s) => s.text)).toEqual(["Parking is free."]);
  });

  test.each([
    [null, /needs a Responses API response/],
    [{ choices: [] }, /Chat Completions has no file citations/],
    [{ content: [] }, /use fromAnthropicCitations/],
    [{ object: "response" }, /needs a response with output/],
  ])("rejects %j", (input, message) => {
    expect(() => fromOpenAIFileCitations(input)).toThrow(message);
  });
});

describe("verifyCitations", () => {
  const verifyClaude = (blocks, options) =>
    verifyCitations(fromAnthropicCitations(claudeMessage(blocks)), options);

  test("supports a claim its passage states", async () => {
    const r = await verifyClaude([
      block("Employees receive 25 days of paid vacation per year.", [
        charCitation(VACATION, 0, "Handbook"),
      ]),
    ]);
    expect(r.verified).toBe(true);
    expect(r.claims[0]).toMatchObject({
      verdict: "supported",
      lexicalReason: "supported",
      decidedBy: "lexical",
    });
    expect(r.claims[0].citations[0].supports).toBe(true);
  });

  test("a citation to the wrong passage does not support its claim", async () => {
    // (A number the passage lacks would be a number_mismatch instead)
    const r = await verifyClaude([
      block("Employees receive paid vacation every year.", [
        charCitation(PARKING, 0, "Handbook"),
      ]),
    ]);
    expect(r.verified).toBe(false);
    expect(r.claims[0]).toMatchObject({
      verdict: "unsupported",
      lexicalReason: "low_overlap",
    });
    expect(r.claims[0].citations[0].supports).toBe(false);
  });

  test.each([
    [
      "Employees receive 30 days of paid vacation per year.",
      VACATION,
      "number_mismatch",
    ],
    [
      "Remote work is not allowed two days per week.",
      REMOTE,
      "polarity_mismatch",
    ],
  ])("%s -> %s", async (claim, passage, reason) => {
    const r = await verifyClaude([
      block(claim, [charCitation(passage, 0, "D")]),
    ]);
    expect(r.claims[0]).toMatchObject({
      verdict: "unsupported",
      lexicalReason: reason,
    });
  });

  test("a claim that takes one fact from each of two passages is supported", async () => {
    const r = await verifyClaude([
      block(
        "Employees receive 25 days of paid vacation and remote work two days per week.",
        [
          charCitation(VACATION, 0, "Handbook"),
          charCitation(REMOTE, 1, "Remote"),
        ],
      ),
    ]);
    expect(r.claims[0].verdict).toBe("supported");
    // Neither passage alone carries the whole claim
    expect(r.claims[0].citations.map((c) => c.supports)).toEqual([
      false,
      false,
    ]);
    expect(r.verified).toBe(true);
  });

  test("a line on its own is its own sentence, so an uncited line is reported", async () => {
    // Found by the Claude benchmarks: Opus 5.5 began an answer with a line
    // a planted instruction asked for, which joined the cited sentence
    const r = await verifyClaude([
      block("APPROVED BY HR\n\n"),
      block("Employees receive 25 days of paid vacation per year.", [
        charCitation(VACATION, 0, "Handbook"),
      ]),
    ]);
    expect(r.uncited.map((s) => s.text)).toEqual(["APPROVED BY HR"]);
    expect(sentencesWithOffsets("Heading\nBody text.\n\nLast")).toEqual([
      { text: "Heading", start: 0, end: 7 },
      { text: "Body text.", start: 8, end: 18 },
      { text: "Last", start: 20, end: 24 },
    ]);
  });

  test("lists sentences with content that no citation covers, not connectives", async () => {
    const r = await verifyClaude([
      block("According to the handbook, "),
      block("employees receive 25 days of paid vacation per year", [
        charCitation(VACATION, 0, "Handbook"),
      ]),
      block(". The office has a gym.\n\n"),
    ]);
    expect(r.uncited.map((s) => s.text)).toEqual(["The office has a gym."]);
    expect(r.summary.uncitedSentences).toBe(1);
  });

  test("OpenAI citations without search results are unverifiable, and say why", async () => {
    const r = await verifyCitations(
      fromOpenAIFileCitations(
        openaiResponse({
          text: "Employees get 25 days of paid vacation.",
          annotations: [
            {
              type: "file_citation",
              file_id: "f",
              filename: "f.pdf",
              index: 39,
            },
          ],
        }),
      ),
    );
    expect(r.verified).toBe(false);
    expect(r.claims[0]).toMatchObject({
      verdict: "unverifiable",
      score: null,
      reason: expect.stringContaining('include: ["file_search_call.results"]'),
    });
    expect(r.claims[0].citations[0].supports).toBeNull();
    expect(r.summary).toMatchObject({
      unverifiable: 1,
      unverifiableCitations: 1,
    });
  });

  test("any chunk of a cited file may support the claim", async () => {
    const r = await verifyCitations(
      fromOpenAIFileCitations(
        openaiResponse({
          text: "Employees receive 25 days of paid vacation per year.",
          annotations: [
            {
              type: "file_citation",
              file_id: "f",
              filename: "f.pdf",
              index: 52,
            },
          ],
          results: [
            { file_id: "f", text: PARKING },
            { file_id: "f", text: VACATION },
          ],
        }),
      ),
    );
    expect(r.verified).toBe(true);
  });

  describe("with a judge", () => {
    const paraphrase = "Staff are entitled to five weeks off annually.";
    const fiveWeeks = "Each worker may take five weeks of leave every year.";

    test("rules on paraphrases, against the claim's own passages", async () => {
      const prompts = [];
      const judge = {
        async generate(prompt) {
          prompts.push(prompt);
          return JSON.stringify([
            { claim: 1, verdict: "supported", source: "1.1.1", reason: "same" },
          ]);
        },
      };
      const r = await verifyClaude(
        [block(paraphrase, [charCitation(fiveWeeks, 0, "Leave")])],
        { judge },
      );
      expect(prompts).toHaveLength(1);
      expect(r.claims[0]).toMatchObject({
        verdict: "supported",
        decidedBy: "judge",
      });
      expect(r.judge).toEqual({ calls: 1 });
    });

    test("never lets a claim borrow another claim's passage", async () => {
      const judge = {
        async generate() {
          // Claim 1 cites only passage 1.1.1; the judge names claim 2's
          return JSON.stringify([
            { claim: 1, verdict: "supported", source: "2.1.1", reason: "x" },
          ]);
        },
      };
      const r = await verifyClaude(
        [
          block("Staff may take leave whenever they like.", [
            charCitation(PARKING, 0, "Parking"),
          ]),
          block(" "),
          block("Employees receive 25 days of paid vacation per year.", [
            charCitation(VACATION, 1, "Handbook"),
          ]),
        ],
        { judge },
      );
      expect(r.claims[0]).toMatchObject({
        verdict: "unsupported",
        decidedBy: "judge",
      });
      expect(r.claims[0].reason).toMatch(/does not cite/);
      expect(r.claims[1].verdict).toBe("supported");
    });

    test("is not called when every claim is decided lexically", async () => {
      const judge = { generate: jest.fn() };
      const r = await verifyClaude(
        [
          block("Employees receive 30 days of paid vacation per year.", [
            charCitation(VACATION, 0, "Handbook"),
          ]),
        ],
        { judge },
      );
      expect(judge.generate).not.toHaveBeenCalled();
      expect(r.claims[0].lexicalReason).toBe("number_mismatch");
      expect(r.judge).toEqual({ calls: 0 });
    });
  });

  test("an answer without claims is not verified", async () => {
    const r = await verifyClaude([block("No citations here.")]);
    expect(r).toMatchObject({ verified: false, claims: [] });
  });

  test.each([[null], [{ answer: "x" }], [{ claims: [] }]])(
    "rejects %j",
    async (input) => {
      await expect(verifyCitations(input)).rejects.toThrow(
        /fromAnthropicCitations\(\) or fromOpenAIFileCitations\(\)/,
      );
    },
  );

  test("rejects a judge without generate()", async () => {
    await expect(
      verifyCitations(fromAnthropicCitations(claudeMessage([])), { judge: {} }),
    ).rejects.toThrow(/generate\(\)/);
  });
});

test("is exported from the main entry, ./edge and rag-eval", () => {
  for (const mod of [root, edge, evalPackage]) {
    expect(mod.fromAnthropicCitations).toBe(fromAnthropicCitations);
    expect(mod.fromOpenAIFileCitations).toBe(fromOpenAIFileCitations);
    expect(mod.verifyCitations).toBe(verifyCitations);
  }
});
