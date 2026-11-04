// README use case: "Measure answer quality in CI".
// The same code as the README, run offline. Edit it, then run `npm run evaluate` in the terminal.

import { PipelineEvaluator } from "@devilsdev/rag-pipeline-utils";

const evaluator = new PipelineEvaluator();
const report = evaluator.evaluate(
  {
    query: "How many vacation days do employees get?",
    answer: "Employees receive twenty days of paid vacation per year.",
    results: [
      { content: "Employees receive twenty days of paid vacation per year." },
    ],
  },
  { referenceAnswer: "Twenty days of paid vacation per year." },
);

console.log(report.scores); // includes contextRecall because a reference was given
if (report.scores.faithfulness < 0.8) process.exitCode = 1;
