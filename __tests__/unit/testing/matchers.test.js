"use strict";

const {
  ragMatchers,
  toBeGroundedIn,
  createTestPipeline,
  EchoLLM,
} = require("../../../src/testing");

expect.extend(ragMatchers);

const POLICY = {
  id: "vacation",
  content: "Full-time employees receive twenty days of paid vacation per year.",
};
const REMOTE = {
  id: "remote",
  content: "Remote work is allowed two days per week with manager approval.",
};

describe("toBeGroundedIn", () => {
  test("passes for a supported answer and fails for an unsupported one", () => {
    expect(POLICY.content).toBeGroundedIn([POLICY]);
    expect(
      "Full-time employees receive 20 days of paid vacation per year.",
    ).toBeGroundedIn([POLICY]);
    expect(
      "Full-time employees receive thirty days of paid vacation per year.",
    ).not.toBeGroundedIn([POLICY]);
    expect(
      "Full-time employees never receive paid vacation.",
    ).not.toBeGroundedIn([POLICY]);
  });

  test("accepts sources in the shapes checkAnswer accepts", () => {
    expect(POLICY.content).toBeGroundedIn([POLICY.content]);
    expect(POLICY.content).toBeGroundedIn([
      { pageContent: POLICY.content, metadata: { source: "handbook.md" } },
    ]);
    expect(POLICY.content).toBeGroundedIn([
      { node: { id_: "n1", text: POLICY.content }, score: 0.9 },
    ]);
  });

  test("reads the answer and results of a pipeline.run() result", async () => {
    const { pipeline } = await createTestPipeline();
    const result = await pipeline.run({
      query: "How many vacation days do I get?",
    });
    expect(result).toBeGroundedIn();
  });

  test("the failure message lists the unsupported sentences", () => {
    const { pass, message } = toBeGroundedIn(
      "Full-time employees receive twenty days of paid vacation per year. Contractors get a company car.",
      [POLICY],
    );
    expect(pass).toBe(false);
    expect(message()).toContain("1 of 2 sentence(s) are not supported");
    expect(message()).toContain("- Contractors get a company car.");
  });

  test("an empty answer is not grounded", () => {
    expect("").not.toBeGroundedIn([POLICY]);
  });

  test("threshold option", () => {
    const partial = "Full-time employees receive twenty days of leave.";
    expect(partial).toBeGroundedIn([POLICY], { threshold: 0.5 });
    expect(partial).not.toBeGroundedIn([POLICY], { threshold: 0.95 });
  });

  test("rejects input it cannot read", () => {
    expect(() => expect(42).toBeGroundedIn([POLICY])).toThrow(/answer string/);
    expect(() => expect("text").toBeGroundedIn()).toThrow(/pass the sources/);
  });
});

describe("toCite", () => {
  const answer =
    "Full-time employees receive twenty days of paid vacation per year. Remote work is allowed two days per week with manager approval.";

  test("passes when a sentence is supported by each id", () => {
    expect(answer).toCite("vacation", [POLICY, REMOTE]);
    expect(answer).toCite(["vacation", "remote"], [POLICY, REMOTE]);
    expect(POLICY.content).not.toCite("remote", [POLICY, REMOTE]);
  });

  test("a sentence that drops its source's condition does not cite it (3.9)", () => {
    expect("Remote work is allowed two days per week.").not.toCite("remote", [
      POLICY,
      REMOTE,
    ]);
  });

  test("works on a run() result", async () => {
    const llm = new EchoLLM({ answer: POLICY.content });
    const { pipeline } = await createTestPipeline({ llm });
    const result = await pipeline.run({
      query: "How many vacation days do I get?",
    });
    expect(result).toCite("vacation");
  });

  test("the failure message names the missing and the cited ids", () => {
    const { message } = ragMatchers.toCite(POLICY.content, "remote", [
      POLICY,
      REMOTE,
    ]);
    expect(message()).toBe(
      "expected the answer to cite remote, but no sentence is supported by it (cited: vacation)",
    );
  });

  test("needs an id", () => {
    expect(() => ragMatchers.toCite("x", [], [POLICY])).toThrow(/source id/);
  });
});

describe("toContainNoPII", () => {
  test("finds emails, phone numbers, SSNs and card numbers", () => {
    expect("Twenty days of paid vacation.").toContainNoPII();
    expect("Email jane.doe@example.com").not.toContainNoPII();
    expect("Call 555-123-4567").not.toContainNoPII();
    expect("SSN 123-45-6789").not.toContainNoPII();
    expect("Card 4111 1111 1111 1111").not.toContainNoPII();
  });

  test("checks every string in an object", () => {
    expect({
      answer: "Twenty days.",
      citations: [{ sentence: "Ask hr@example.com" }],
    }).not.toContainNoPII();
    expect({ answer: "Twenty days.", score: 1 }).toContainNoPII();
  });

  test("custom patterns, and the message lists what was found", () => {
    const patterns = { employeeId: /EMP-\d{5}/ };
    expect("Employee EMP-12345").not.toContainNoPII({ patterns });
    const { message } = ragMatchers.toContainNoPII("EMP-12345 and EMP-67890", {
      patterns,
    });
    expect(message()).toContain("found 2");
    expect(message()).toContain("- employeeId: EMP-12345");
  });
});
