// README use case: "Answer questions with sources your users can check".
// The same code as the README, run offline. Edit it, then run `npm run citations` in the terminal.

import { CitationTracker } from "@devilsdev/rag-pipeline-utils";

const sources = [
  {
    id: "policy",
    content: "Employees receive twenty days of paid vacation per year.",
  },
];
const tracker = new CitationTracker();

const good = tracker.track(
  "Employees receive twenty days of paid vacation per year.",
  sources,
);
const wrong = tracker.track(
  "Employees receive thirty days of paid vacation per year.",
  sources,
);

console.log(good.groundednessScore); // 1
console.log(wrong.groundednessScore); // 0: the number does not match the source
