/**
 * Chinese and Japanese text: sentences end at 。！？ without a space, and
 * digits written next to Chinese or Japanese characters are numbers.
 */

const { checkAnswer } = require("../../../src/grounding/check-answer");
const {
  splitSentences,
  extractNumbers,
} = require("../../../src/evaluate/scoring");

describe("Chinese and Japanese text", () => {
  test("splits sentences at 。！？", () => {
    expect(
      splitSentences("员工每年享有二十天带薪假期。合同工有带薪假期。"),
    ).toEqual(["员工每年享有二十天带薪假期。", "合同工有带薪假期。"]);
    expect(splitSentences("本当ですか？はい！そうです。")).toEqual([
      "本当ですか？",
      "はい！",
      "そうです。",
    ]);
  });

  test("reads digits next to Chinese or Japanese characters", () => {
    expect(extractNumbers("年間20日の有給休暇").values).toEqual(["20"]);
    // Still not digits glued to a Latin word
    expect(extractNumbers("BM25 ranks").values).toEqual([]);
  });

  test("an added Chinese sentence is unsupported", async () => {
    const source =
      "全职员工每年享有二十天带薪假期。远程办公需经理批准。报销须在三十天内提交。";
    const check = await checkAnswer({
      answer: source + "合同工每年享有四十天带薪假期。",
      sources: [source],
      evaluate: false,
    });
    expect(check.unsupported).toEqual(["合同工每年享有四十天带薪假期。"]);
  });

  test("a wrong number in Japanese is unsupported", async () => {
    const source = "正社員は年間20日の有給休暇を取得できます。";
    const check = await checkAnswer({
      answer: "正社員は年間40日の有給休暇を取得できます。",
      sources: [source],
      evaluate: false,
    });
    expect(check.grounded).toBe(false);
    const same = await checkAnswer({
      answer: source,
      sources: [source],
      evaluate: false,
    });
    expect(same.grounded).toBe(true);
  });
});
