# Evaluation Framework

**@devilsdev/rag-pipeline-utils** ships a set of lexical evaluation metrics for RAG output: answer-level scores (BLEU, ROUGE), grounding metrics (faithfulness, answer relevance, context precision and recall, groundedness), citation tracking and hallucination detection. All of them run locally, synchronously and without calling a model.

Evaluation is a library API; the `rag-pipeline` CLI has no `evaluate` command.

---

## **How grounding is measured (2.5.0)**

The grounding metrics (citations, faithfulness, context precision and recall, groundedness, `PostGenerationGuard`, `SelfCritiqueChecker`) share one per-sentence support check:

- **Content-word coverage.** A sentence's support score is the share of its content words found in a document, optionally IDF-weighted. Before 2.5.0 this was Jaccard similarity against the whole document, which shrank with document length (an answer copied verbatim from a ~70-word chunk could score 0). Scores for grounded answers are now noticeably higher.
- **Threshold 0.5.** A sentence counts as supported when its score reaches the per-sentence threshold, now `0.5` by default (it was `0.3`). This applies to `CitationTracker.similarityThreshold`, `PipelineEvaluator`'s `threshold` and the `threshold` option of faithfulness, recall and the hallucination detector. Aggregate thresholds (`groundednessThreshold`, `approvalThreshold`) are unchanged.
- **Numeric consistency.** A sentence whose numbers (digits, decimals, percentages, number words) do not appear in the source scores below 0.4 and is not grounded. "20" and "twenty" are treated as equal, so "thirty days" is not supported by "twenty days" while "20 days" is.
- **Tokenizer.** Non-ASCII letters are kept (`Política` no longer becomes `poltica`), and words are split on newlines and hyphens. This also affects BM25, BLEU/ROUGE and the scoring reranker.

### Known limitations

Grounding is lexical plus a numeric-consistency check. It does not detect negation ("not twenty days"), units ("20 hours" vs "20 days"), ordinals, a lone "one", differently split decimals, or claims that combine facts from several documents. Document-side matching is lenient: "twenty-five" in a source also supports "twenty" or "five". Treat the scores as a regression signal, not as proof of correctness.

---

## **PipelineEvaluator**

`PipelineEvaluator` evaluates one pipeline result against several metrics in a single synchronous call:

```javascript no-run
const { PipelineEvaluator } = require("@devilsdev/rag-pipeline-utils");

const evaluator = new PipelineEvaluator({
  // defaults shown
  metrics: [
    "faithfulness",
    "relevance",
    "contextPrecision",
    "contextRecall",
    "groundedness",
  ],
  threshold: 0.5,
  includeBLEU: false, // add BLEU when a referenceAnswer is given
  includeROUGE: false, // add ROUGE when a referenceAnswer is given
});

evaluator.on("evaluated", (result) => console.log(result.scores));

const evaluation = evaluator.evaluate(
  { query, answer, results: retrievedDocs }, // retrievedDocs: [{ content, ... }]
  { referenceAnswer }, // optional ground truth; needed for context recall
);
```

The result has the shape `{ scores, details, metadata }`:

- **`scores.faithfulness`** -- share of answer sentences supported by the retrieved documents
- **`scores.relevance`** -- how directly the answer addresses the query
- **`scores.contextPrecision`** -- share of retrieved documents that are relevant to the query
- **`scores.contextRecall`** -- share of the **reference answer's** sentences that the retrieved documents support (did retrieval find everything needed?)
- **`scores.groundedness`** -- composite score (see [`computeGroundedness`](#computegroundedness))
- **`details.<metric>`** -- the full output of each metric function
- **`metadata`** -- `{ metricsComputed, metricsSkipped, threshold, timestamp }`

### Context recall needs a reference answer

Since 2.5.0, context recall measures how much of a reference (ground-truth) answer the retrieved documents support. Pass it as `referenceAnswer`. Without one:

- `scores.contextRecall` is omitted,
- `details.contextRecall` is `{ score: null, skipped: true, reason }`,
- `metadata.metricsSkipped` contains `{ metric: "contextRecall", reason }`,
- `groundedness` is computed from the remaining components.

---

## **Metric Functions**

The metrics behind `PipelineEvaluator` are exported individually. Retrieved documents are objects with a `content` string.

```javascript
const {
  computeFaithfulness,
  computeAnswerRelevance,
  computeContextPrecision,
  computeContextRecall,
} = require("@devilsdev/rag-pipeline-utils");

const docs = [
  { id: "policy", content: "Refunds are accepted within 30 days of purchase." },
  { id: "weather", content: "Tomorrow will be sunny." },
];
const query = "What is the refund window?";
const answer = "Refunds are accepted within 30 days. Shipping is free.";

computeFaithfulness(answer, docs);
// { score: 0.5, faithfulSentences: 1, totalSentences: 2,
//   details: [{ sentence, score, isFaithful, bestSource }, ...] }

computeAnswerRelevance(query, answer);
// { score, jaccardSimilarity, queryTokensCovered, totalQueryTokens, missingQueryTerms }

computeContextPrecision(query, docs);
// { score, relevantDocs, totalDocs, perDocScores: [{ index, score, isRelevant }] }

computeContextRecall("Refunds are accepted within 30 days.", docs);
// { score: 1, supportedClaims: 1, totalClaims: 1,
//   details: [{ claim, score, isSupported, bestDocIndex }] }
```

Signatures:

| Function                                                        | Arguments                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `computeFaithfulness(answer, retrievedDocs, options)`           | `options.threshold` (default 0.5)                                 |
| `computeAnswerRelevance(query, answer, options)`                |                                                                   |
| `computeContextPrecision(query, retrievedDocs, options)`        |                                                                   |
| `computeContextRecall(referenceAnswer, retrievedDocs, options)` | `options.threshold` (default 0.5)                                 |
| `computeGroundedness(query, answer, retrievedDocs, options)`    | `options.weights`, `options.threshold`, `options.referenceAnswer` |

### Numeric consistency helpers

The numeric check used by the grounding metrics is exported as well:

```javascript
const {
  checkNumericConsistency,
  extractNumbers,
} = require("@devilsdev/rag-pipeline-utils");

checkNumericConsistency("Returns within thirty days", "Returns within 30 days");
// { consistent: true, claimNumbers: ["30"], missing: [] }  ("thirty" equals "30")

checkNumericConsistency("Returns within 45 days", "Returns within 30 days");
// { consistent: false, claimNumbers: ["45"], missing: ["45"] }

extractNumbers("20 items, 3.5% and twenty");
// { values: ["20", "3.5", "20"], parts: [...] }
```

---

## **computeGroundedness**

`computeGroundedness(query, answer, retrievedDocs, options)` combines the component metrics into one rating and returns `{ score, components, weights }`:

1. **Faithfulness** -- the answer's sentences are supported by the retrieved context
2. **Context Precision** -- the retrieved chunks are relevant rather than noisy
3. **Context Recall** -- the retrieved chunks support the reference answer (only with `options.referenceAnswer`)

The score is a weighted mean over the available components, `sum(w * m) / sum(w)`. With the default weights (0.4, 0.3, 0.3) and a reference answer:

```
groundedness = 0.4 * faithfulness + 0.3 * contextPrecision + 0.3 * contextRecall
```

Without a reference answer, context recall is left out and the weights are renormalised:

```
groundedness = (0.4 * faithfulness + 0.3 * contextPrecision) / 0.7
```

```javascript no-run
const { computeGroundedness } = require("@devilsdev/rag-pipeline-utils");

const { score, components } = computeGroundedness(
  query,
  answer,
  retrievedDocs,
  {
    referenceAnswer, // optional
  },
);
```

---

## **BLEU and ROUGE**

`scoreAnswer(actual, expected)` tokenizes both strings and returns BLEU and ROUGE-L style scores between 0 and 1. These are surface-overlap metrics: they reward matching words and miss paraphrases.

```javascript
const { scoreAnswer } = require("@devilsdev/rag-pipeline-utils");

const { bleu, rouge } = scoreAnswer(
  "Refunds are accepted within 30 days",
  "Refunds are accepted for 30 days after purchase",
);
```

`computeBLEU(candidateTokens, referenceTokens)` and `computeROUGE(candidateTokens, referenceTokens)` take **token arrays**, not strings, and return a number:

```javascript no-run
const { computeBLEU, computeROUGE } = require("@devilsdev/rag-pipeline-utils");

const tokens = (s) => s.toLowerCase().split(/\s+/).filter(Boolean);
const bleu = computeBLEU(tokens(answer), tokens(reference));
const rouge = computeROUGE(tokens(answer), tokens(reference));
```

### Semantic similarity

`computeSemanticSimilarity(answer, reference, { embedder })` is the cosine similarity of the two texts' embeddings, from 0 to 1. Unlike BLEU and ROUGE it does not penalise a correct answer that is worded differently. Any embedder works: a built-in connector, an AI SDK adapter, or `HashEmbedder` from [`/testing`](./Testing.md) in tests.

```javascript
import { computeSemanticSimilarity } from "@devilsdev/rag-pipeline-utils";
import { HashEmbedder } from "@devilsdev/rag-pipeline-utils/testing";

const embedder = new HashEmbedder();
const reference = "Employees get twenty days of paid vacation per year.";

const same = await computeSemanticSimilarity(reference, reference, {
  embedder,
});
console.log(same); // 1
```

Embeddings capture meaning, not facts: "twenty days" and "thirty days" come out as very similar. Use semantic similarity next to the grounding checks (faithfulness, `checkAnswer`), not instead of them. `checkAnswer` adds `evaluation.scores.semanticSimilarity` when you pass a `referenceAnswer` and an `embedder`.

There is no BERTScore metric in the package.

---

## **Inline Evaluation**

Pass `evaluate: true` in the run options and `createRagPipeline` scores the response before returning it:

```javascript
const result = await pipeline.run({
  query,
  options: { evaluate: true, referenceAnswer }, // referenceAnswer is optional
});
// result.evaluation: { scores, details, metadata } from PipelineEvaluator
```

Use `evaluateOptions` to pass `PipelineEvaluator` options (for example `{ metrics: ["faithfulness"] }`). In stream mode (`stream: true`) with `citations` or `evaluate`, the stream ends with one chunk `{ token: '', done: true, citations, evaluation }` computed from the full streamed answer. A pipeline without an LLM returns `answer: null`, skips citations and evaluates the retrieval metrics (context precision, and context recall when a reference answer is given) only.

---

## **Batch Evaluation**

To evaluate a test set, run each case through your pipeline and score it with `PipelineEvaluator` and `scoreAnswer`:

```javascript no-run
const fs = require("fs");
const {
  createRagPipeline,
  PipelineEvaluator,
  scoreAnswer,
} = require("@devilsdev/rag-pipeline-utils");

// test-set.json: [{ "prompt": "...", "expected": "..." }, ...]
const cases = JSON.parse(fs.readFileSync("./test-set.json", "utf8"));
const pipeline = createRagPipeline({ embedder, retriever, llm });
const evaluator = new PipelineEvaluator();

const rows = [];
for (const { prompt, expected } of cases) {
  const result = await pipeline.run({ query: prompt });
  if (!result.success) {
    rows.push({ prompt, error: result.error });
    continue;
  }
  const evaluation = evaluator.evaluate(result, { referenceAnswer: expected });
  rows.push({
    prompt,
    ...evaluation.scores,
    ...scoreAnswer(result.answer, expected), // { bleu, rouge }
  });
}

console.table(rows);
```

`pipeline.run()` resolves `{ success: false, error }` instead of throwing, so check `success` before scoring. To compare two configurations, run the same loop against each pipeline and compare the averaged scores; keep the test set and the evaluator options identical between runs.

### Dataset format

A JSON array of cases is enough. The loop above reads `prompt` and `expected`; any extra fields (ids, categories) are yours to use for grouping results:

```json
[
  {
    "id": "query-001",
    "prompt": "What is a vector index?",
    "expected": "A data structure for fast similarity search in vector spaces.",
    "category": "technical"
  }
]
```

| Field       | Required | Meaning                                                                                                            |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `prompt`    | Yes      | The question. `question` is accepted too                                                                           |
| `expected`  | No       | The reference answer, used for context recall, BLEU/ROUGE and semantic similarity. `referenceAnswer` works too     |
| `sourceIds` | No       | Ids of the documents that should be retrieved for this question, matching a result's `id` or its `metadata.source` |
| `id`        | No       | A stable id for the case; defaults to `case-1`, `case-2` and so on                                                 |
| `tags`      | No       | Strings for grouping results                                                                                       |

The file can also be an object, `{ "cases": [...] }`, which leaves room for fields of your own such as a version.

### Validate a test set

`validateDataset(dataset)` checks a test set before anything runs, and reports every problem with the case it is in rather than failing on the first:

```javascript
import { validateDataset } from "@devilsdev/rag-pipeline-utils";

const report = validateDataset([
  { prompt: "How many vacation days do I get?", expected: "Twenty." },
  { question: "", sourceIds: "vacation" },
]);

console.log(report.valid); // false
console.log(report.errors.length); // 2
console.log(report.errors[0].field); // "prompt"
console.log(report.errors[0].index); // 1
```

It returns:

- `valid`;
- `errors`, each with the case's `index` and `id`, the `field` and a `message` such as `Case 2: "question" must be a non-empty string`;
- `warnings` for likely mistakes that don't stop a run, such as a duplicate question or an empty `sourceIds`;
- `cases`, the normalised cases when the dataset is valid: aliases resolved to `prompt` and `expected`, ids filled in, and other fields kept.

It never throws. Pass `{ requireExpected: true }` or `{ requireSourceIds: true }` when a run needs reference answers or source ids for every case.

### Generate a test set

Writing questions by hand is the slowest part of starting. `generateSyntheticDataset(documents, { llm })` has an LLM write question and answer pairs about your documents, one document at a time, so each case knows which document it came from:

```javascript
import { generateSyntheticDataset } from "@devilsdev/rag-pipeline-utils";
import { EchoLLM, fixtures } from "@devilsdev/rag-pipeline-utils/testing";

// In a real run, pass your llm (OpenAIConnector, an AI SDK adapter, ...).
// This stand-in replies with the same JSON pair for every document.
const llm = new EchoLLM({
  answer: JSON.stringify([
    {
      question: "How many paid vacation days do full-time employees get?",
      answer:
        "Full-time employees receive twenty days of paid vacation per year.",
    },
  ]),
});

const dataset = await generateSyntheticDataset(fixtures.documents, {
  llm,
  count: 10,
});

console.log(dataset.cases.length); // 1
console.log(dataset.cases[0].sourceIds); // ["vacation.md"]
console.log(dataset.cases[0].reviewed); // false
console.log(dataset.skipped.length); // 2
```

Each generated answer is checked against its document with `computeFaithfulness`, and a pair is dropped when the document doesn't support its answer. Above, the same answer came back for the remote-work and expenses documents, which don't support it. Repeated questions, malformed replies and documents shorter than 80 characters are dropped too. Each is listed in `skipped` with its reason.

Every case gets:

- `sourceIds`: the document's `metadata.source`, or its `id`, so `sourceRecall` checks that retrieval finds it;
- `expected`: the generated answer, which serves as the reference;
- `tags: ["synthetic"]` and `reviewed: false`.

The result is a dataset (`{ cases }`) that `validateDataset`, `runEvaluation` and `rag-pipeline eval` accept.

| Option             | Default | Description                                                                |
| ------------------ | ------- | -------------------------------------------------------------------------- |
| `llm`              |         | Any `llm` stage                                                            |
| `count`            | 20      | Cases to write at most                                                     |
| `perDocument`      | 1       | Questions to ask per document                                              |
| `minFaithfulness`  | 1       | Share of an answer's sentences its document must support                   |
| `minLength`        | 80      | Documents shorter than this many characters are skipped                    |
| `prompt`           |         | Replaces the instruction; `{count}` becomes `perDocument`                  |
| `concurrency`      | 1       | Documents processed at the same time                                       |
| `generateOptions`  |         | Extra options for every `llm.generate()` call, e.g. `{ temperature: 0.7 }` |
| `signal`, `onCase` |         | Cancellation, and a callback for each case kept                            |

Generated cases are a starting point, not ground truth. The model writes the questions it thinks of, which may not be the ones your users ask. Read them, fix or delete the wrong ones, add the questions that matter to you, and set `reviewed: true` on the ones you've checked. The instruction asks for a JSON reply; models that ignore it produce cases that are skipped with "the reply had no JSON array of pairs".

From the command line, `rag-pipeline generate-dataset --output tests.json` does the same with the chunks in your index and the `llm` in your config; see [the CLI reference](./CLI.md#generate-dataset).

### Run a test set and compare configurations

`runEvaluation(dataset, pipeline)` runs every case with citations and evaluation on, using the case's `expected` answer as the reference. It returns a report that is plain JSON, so you can save it:

```javascript
import { runEvaluation } from "@devilsdev/rag-pipeline-utils";
import { createTestPipeline } from "@devilsdev/rag-pipeline-utils/testing";

const { pipeline } = await createTestPipeline();
const report = await runEvaluation(
  [
    {
      id: "vacation",
      prompt: "How many vacation days do I get?",
      expected: "Full-time employees receive twenty days of paid vacation.",
      sourceIds: ["vacation"],
    },
  ],
  pipeline,
);

console.log(report.summary.failed); // 0
console.log(report.summary.metrics.faithfulness.mean); // 1
console.log(report.cases[0].scores.sourceRecall); // 1
```

Each case records the scores it has:

| Score              | Meaning                                                                             |
| ------------------ | ----------------------------------------------------------------------------------- |
| `faithfulness`     | Share of the answer's sentences supported by the retrieved documents                |
| `relevance`        | How well the answer addresses the question                                          |
| `contextPrecision` | Share of retrieved documents that support the answer                                |
| `contextRecall`    | How much of the `expected` answer the retrieved documents support; needs `expected` |
| `groundedness`     | The weighted combination of the above                                               |
| `citationCoverage` | Share of the answer's sentences with a supporting citation                          |
| `sourceRecall`     | Share of the case's `sourceIds` that were retrieved; needs `sourceIds`              |

A retrieval-only pipeline (no `llm`) gets `sourceRecall` only. The report also holds each case's answer, retrieved ids, duration and, for a failed run, its `error`; a failed case is recorded rather than thrown. `summary` has the case counts and each metric's mean. Options: `concurrency` (default 1), a per-case `timeout`, a `signal` to stop the run, `runOptions` for every `run()` call and an `onCase` callback for progress. An invalid dataset throws a `DatasetError` (`code: "RAG_INVALID_DATASET"`) carrying the errors from `validateDataset`.

`compareConfigurations(dataset, { baseline, candidate })` runs the dataset through both and reports what got worse. Here the candidate's LLM gives an answer the documents don't support:

```javascript
import { compareConfigurations } from "@devilsdev/rag-pipeline-utils";
import {
  createTestPipeline,
  EchoLLM,
} from "@devilsdev/rag-pipeline-utils/testing";

const dataset = [
  { id: "vacation", prompt: "How many vacation days do I get?" },
];
const { pipeline: baseline } = await createTestPipeline();
const { pipeline: candidate } = await createTestPipeline({
  llm: new EchoLLM({ answer: "The office is in Paris." }),
});

const comparison = await compareConfigurations(dataset, {
  baseline,
  candidate,
});

console.log(comparison.regressed); // true
console.log(comparison.metrics.faithfulness.delta); // -1
console.log(comparison.regressions[0].id); // "vacation"
```

Either side can be a saved report instead of a pipeline. In CI, save the report from your main branch and compare each pull request against it, so the main branch's pipeline doesn't run again:

```javascript no-run
import fs from "node:fs";

const comparison = await compareConfigurations(dataset, {
  baseline: JSON.parse(fs.readFileSync("eval-main.json", "utf8")),
  candidate: pipeline,
});
if (comparison.regressed) process.exitCode = 1;
```

The result:

| Field                   | Meaning                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `regressed`             | A metric's mean dropped by more than `tolerance` (default 0.02), or a case that passed now fails    |
| `metrics`               | For each metric in both runs: `baseline`, `candidate`, `delta` and `regressed`                      |
| `regressions`           | Cases that now fail, or whose score for a metric dropped by more than `caseTolerance` (default 0.1) |
| `improvements`          | Cases that no longer fail, or whose score rose by more than `caseTolerance`                         |
| `warnings`              | Cases in only one run, a case whose prompt changed, a requested metric that is missing              |
| `baseline`, `candidate` | The two reports                                                                                     |

Cases are matched by `id`, so give cases stable ids when you compare runs over time. Each report records the `libraryVersion` that produced it, and the comparison warns when the two differ: scoring can change between releases, so save a new baseline after upgrading. Pass `metrics: ["faithfulness", "sourceRecall"]` to compare only some metrics. Answers from a model vary between runs; run the same configuration a few times to see how much the scores move, and set the tolerances above that.

`renderEvaluationReport({ report, comparison, min }, { format })` renders a run as Markdown (the default, for a pull request comment) or a standalone HTML page, and `evaluationVerdict({ report, comparison, min })` returns the `{ passed, reasons, thresholds }` the page shows. The [`rag-pipeline eval`](./CLI.md#eval) command does all of this from the command line.

---

## **Citation & Grounding**

`CitationTracker` maps each sentence of an answer to the retrieved documents that support it:

```javascript no-run
const {
  CitationTracker,
  detectHallucinations,
} = require("@devilsdev/rag-pipeline-utils");

const tracker = new CitationTracker({ similarityThreshold: 0.5 }); // default 0.5
const cited = tracker.track(answer, retrievedDocs);

// cited.citations          -- [{ sentence, sources: [{ docId, docIndex, score }] }]
// cited.groundednessScore  -- share of sentences with at least one supporting source
// cited.hallucinationReport -- { hallucinationRate, sentences, summary }
// cited.metadata

const report = detectHallucinations(cited.citations, { threshold: 0.5 });
// report.summary: { grounded, likely_hallucination, definite_hallucination }
```

With zero retrieved documents, `track()` does not throw; every sentence is reported as unsupported. `retrievedDocs` must be an array.

---

## **Dashboards**

The CLI has no `dashboard` command. `MetricsAggregator` collects pipeline metrics and `DashboardGenerator` renders a snapshot as a self-contained HTML page (inline CSS and SVG charts) or a plain-text report:

```javascript
const fs = require("fs");
const {
  MetricsAggregator,
  DashboardGenerator,
} = require("@devilsdev/rag-pipeline-utils");

const aggregator = new MetricsAggregator();
aggregator.recordQuery({ duration: 420, tokens: 812, success: true });

const generator = new DashboardGenerator({ title: "Evaluation run" });
const snapshot = aggregator.getSnapshot();
fs.writeFileSync("dashboard.html", generator.generate(snapshot));
console.log(generator.generateReport(snapshot));
```

To expose metrics from your own HTTP server, return `aggregator.getSnapshot()` (or `aggregator.getTimeSeries("latency")`) as JSON from a route.

---

## **Performance Benchmarking**

The CLI command `rag-pipeline ai benchmark` reports measured p50/p95/mean latency per stage for the configured pipeline and index (see [CLI Reference](./CLI.md)).

The repository also contains a benchmark script (not shipped in the npm package) that measures the DAG engine, retry policy and monitoring overhead and writes JSON results to `benchmark-results/`:

```bash
# From a clone of the repository
npm run benchmark:quick   # 20 iterations
npm run benchmark         # 100 iterations, verbose
npm run benchmark:full    # 500 iterations, verbose
```

See [Benchmarks](./Benchmarks.md) for methodology and for benchmarking your own pipeline end to end.

---

## **Best Practices**

- **Use a reference answer.** Without one, context recall is skipped and groundedness rests on faithfulness and precision alone.
- **Combine metrics.** Faithfulness catches unsupported claims; context precision and recall tell you whether retrieval or generation is the problem.
- **Track trends, not absolutes.** Lexical scores depend on your corpus and phrasing. Compare runs on the same test set and evaluator options; scores from before 2.5.0 are not comparable with 2.5.0 scores.
- **Review failures by hand.** Check the `details` of low-scoring cases, and keep the known limitations (negation, units, multi-document claims) in mind.

---

_For pipeline options see the [Usage Guide](./Usage.md) and [API Reference](./API-Reference.md); for command-line tools see the [CLI Reference](./CLI.md)._
