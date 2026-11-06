import { describe, expect, test } from "vitest";
import { checkAnswer } from "@devilsdev/rag-pipeline-utils";
import { createTestPipeline } from "@devilsdev/rag-pipeline-utils/testing";

describe("vacation answers", () => {
  test("are grounded in the handbook and cite it", async () => {
    const { pipeline } = await createTestPipeline();
    const result = await pipeline.run({
      query: "How many vacation days do I get?",
    });

    expect(result).toBeGroundedIn();
    expect(result).toCite("vacation");
    expect(result).toContainNoPII();
  });

  test("a wrong number is caught", async () => {
    const sources = [
      {
        pageContent:
          "Full-time employees receive twenty days of paid vacation per year.",
      },
    ];
    const answer =
      "Full-time employees receive thirty days of paid vacation per year.";

    expect(answer).not.toBeGroundedIn(sources);

    const check = await checkAnswer({ answer, sources });
    expect(check.grounded).toBe(false);
    expect(check.unsupported).toEqual([answer]);
  });
});
