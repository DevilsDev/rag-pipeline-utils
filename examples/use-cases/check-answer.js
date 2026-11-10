// README use case: "Check answers from another framework".
// The same code as the README, run offline. Edit it, then run `npm run check-answer` in the terminal.

import { checkAnswer } from "@devilsdev/rag-pipeline-utils";

const check = await checkAnswer({
  question: "How many vacation days do I get, and can I work remotely?",
  answer:
    "Full-time employees receive thirty days of paid vacation per year. " +
    "Remote work is allowed two days per week.",
  sources: [
    {
      pageContent:
        "Full-time employees receive twenty days of paid vacation per year.",
      metadata: { source: "handbook.md" },
    },
    {
      pageContent:
        "Remote work is allowed two days per week with manager approval.",
      metadata: { source: "handbook.md" },
    },
  ],
});

console.log(check.grounded); // false
console.log(check.unsupported.length); // 2
