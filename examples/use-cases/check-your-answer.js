// Check an answer of your own: paste it and the passages it was generated
// from, then run `npm start` in the terminal. Every sentence that no passage
// supports is listed: its words or numbers are missing from the passages, or
// it negates what they say.
//
// The check compares words, numbers and negation, with no model calls, so it
// gives the same result every run. It misses paraphrases: a correct sentence
// in very different words can be listed as unsupported.

import { checkAnswer } from "@devilsdev/rag-pipeline-utils";

// Paste your answer here.
const answer = `Full-time employees receive twenty days of paid vacation per year.
Contractors receive paid vacation.
Up to ten unused days carry over to the next year.`;

// Paste the passages here: strings, { id, content }, LangChain Documents
// ({ pageContent, metadata }) or LlamaIndex nodes.
const sources = [
  {
    id: "vacation",
    content:
      "Full-time employees receive twenty days of paid vacation per year. Contractors do not receive paid vacation.",
  },
  {
    id: "carry-over",
    content: "Up to five unused vacation days carry over to the next year.",
  },
];

const check = await checkAnswer({ answer, sources, evaluate: false });

console.log(`Grounded: ${check.grounded}`);
console.log(`Groundedness: ${check.groundedness.toFixed(2)}`);
console.log(check.unsupported.length); // 2
for (const sentence of check.unsupported) {
  console.log(`Not supported: ${sentence}`);
}
