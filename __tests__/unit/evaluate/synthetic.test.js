"use strict";

// jest.setup.js resets modules after every test, so load per test.
let generateSyntheticDataset;
let parsePairs;
let validateDataset;

beforeEach(() => {
  ({
    generateSyntheticDataset,
    parsePairs,
  } = require("../../../src/evaluate/synthetic"));
  ({ validateDataset } = require("../../../src/evaluate/dataset"));
});

const DOCS = [
  {
    id: "vacation#0",
    content:
      "Full-time employees receive twenty days of paid vacation per year. Unused days carry over for one year.",
    metadata: { source: "docs/vacation.md" },
  },
  {
    id: "remote",
    content:
      "Employees may work remotely up to three days a week with approval from their manager.",
  },
  { id: "tiny", content: "Too short." },
];

/** An llm that answers from a table keyed by the document's first word. */
function scriptedLlm(replies) {
  const calls = [];
  return {
    calls,
    async generate(query, docs, options) {
      calls.push({ query, docs, options });
      const key = docs[0].content.split(" ")[0];
      const reply = replies[key];
      if (reply instanceof Error) throw reply;
      return typeof reply === "function" ? reply() : reply;
    },
  };
}

describe("generateSyntheticDataset", () => {
  it("writes cases with their source and marks them for review", async () => {
    const llm = scriptedLlm({
      "Full-time": JSON.stringify([
        {
          question: "How many paid vacation days do full-time employees get?",
          answer:
            "Full-time employees receive twenty days of paid vacation per year.",
        },
      ]),
      Employees:
        'Here you go:\n```json\n[{"question": "How many days a week can I work remotely?", "answer": "Up to three days a week with approval from their manager."}]\n```',
    });
    const dataset = await generateSyntheticDataset(DOCS, { llm, count: 5 });

    expect(dataset.cases).toEqual([
      {
        id: "synthetic-docs/vacation.md",
        prompt: "How many paid vacation days do full-time employees get?",
        expected:
          "Full-time employees receive twenty days of paid vacation per year.",
        sourceIds: ["docs/vacation.md"],
        tags: ["synthetic"],
        reviewed: false,
      },
      expect.objectContaining({
        id: "synthetic-remote",
        sourceIds: ["remote"],
      }),
    ]);
    expect(dataset.skipped).toEqual([
      { sourceId: "tiny", reason: "shorter than 80 characters" },
    ]);
    // One request per document, with only that document as context.
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[0].docs).toEqual([DOCS[0]]);
    expect(llm.calls[0].query).toMatch(/^Write 1 question\(s\)/);
    // The result is a valid dataset.
    expect(validateDataset(dataset).valid).toBe(true);
  });

  it("drops answers the document doesn't support, repeats and malformed pairs", async () => {
    const llm = scriptedLlm({
      "Full-time": JSON.stringify([
        {
          question: "How many vacation days?",
          answer: "Thirty days per year.",
        },
        {
          question: "Do unused days carry over?",
          answer: "Unused days carry over for one year.",
        },
        {
          question: "Do unused days carry over?",
          answer: "Unused days carry over for one year.",
        },
        { question: "", answer: "No question." },
      ]),
      Employees: "I can't help with that.",
    });
    const dataset = await generateSyntheticDataset(DOCS, {
      llm,
      perDocument: 4,
    });
    expect(dataset.cases.map((c) => c.prompt)).toEqual([
      "Do unused days carry over?",
    ]);
    expect(dataset.skipped.map((s) => s.reason)).toEqual([
      "shorter than 80 characters",
      "the document does not support the answer (faithfulness 0.00)",
      "repeats an earlier question",
      "a pair without a question or answer",
      "the reply had no JSON array of pairs",
    ]);
    expect(llm.calls[0].query).toMatch(/^Write 4 question\(s\)/);
  });

  it("stops at count and numbers cases from the same source", async () => {
    let n = 0;
    const llm = scriptedLlm({
      "Full-time": () =>
        JSON.stringify([
          {
            question: `Question ${(n += 1)} about vacation?`,
            answer:
              "Full-time employees receive twenty days of paid vacation per year.",
          },
        ]),
    });
    const docs = [DOCS[0], { ...DOCS[0] }, { ...DOCS[0] }];
    const dataset = await generateSyntheticDataset(docs, { llm, count: 2 });
    expect(dataset.cases.map((c) => c.id)).toEqual([
      "synthetic-docs/vacation.md",
      "synthetic-docs/vacation.md-2",
    ]);
    expect(llm.calls).toHaveLength(2);
  });

  it("records llm failures, passes options through and can be aborted", async () => {
    const llm = scriptedLlm({
      "Full-time": new Error("rate limited"),
      Employees: "[]",
    });
    const dataset = await generateSyntheticDataset(DOCS, {
      llm,
      generateOptions: { temperature: 0.7 },
    });
    expect(dataset.cases).toEqual([]);
    expect(dataset.skipped[1]).toEqual({
      sourceId: "docs/vacation.md",
      reason: "the llm failed: rate limited",
    });
    expect(llm.calls[0].options).toEqual({ temperature: 0.7 });

    const controller = new AbortController();
    const aborting = {
      async generate() {
        controller.abort();
        return "[]";
      },
    };
    await expect(
      generateSyntheticDataset(DOCS, {
        llm: aborting,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "ABORT_ERR" });
  });

  it("validates its arguments", async () => {
    const llm = scriptedLlm({});
    await expect(generateSyntheticDataset("docs", { llm })).rejects.toThrow(
      "documents must be an array",
    );
    await expect(generateSyntheticDataset(DOCS, {})).rejects.toThrow(
      "needs an llm with generate()",
    );
    await expect(
      generateSyntheticDataset(DOCS, { llm, count: 0 }),
    ).rejects.toThrow("count must be a positive integer");
  });
});

describe("parsePairs", () => {
  it("reads bare, fenced and wrapped arrays", () => {
    const pairs = [{ question: "q", answer: "a" }];
    expect(parsePairs(JSON.stringify(pairs))).toEqual(pairs);
    expect(parsePairs("```json\n" + JSON.stringify(pairs) + "\n```")).toEqual(
      pairs,
    );
    expect(
      parsePairs(`Sure! ${JSON.stringify(pairs)} Hope that helps.`),
    ).toEqual(pairs);
    expect(parsePairs(JSON.stringify({ questions: pairs }))).toEqual(pairs);
    expect(parsePairs("no json here")).toBeNull();
    expect(parsePairs(null)).toBeNull();
  });
});
