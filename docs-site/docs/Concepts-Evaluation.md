---
id: Concepts-Evaluation
title: Concept — rag-eval
sidebar_label: Evaluation (rag-eval)
description: Faithfulness, relevance, citation tracking, and groundedness scoring. The pieces that turn a working pipeline into one you can trust in production.
---

# Concept: rag-eval

A pipeline that returns answers is easy. A pipeline that returns
answers you can **trust to be grounded in your sources** is the
production-readiness gap. **rag-eval** is the framework's evaluation
and citation layer — the metrics, judges, and trackers that close
that gap.

## What's in rag-eval

| Surface                 | Purpose                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PipelineEvaluator`     | Run a query through the pipeline and produce a metrics report (faithfulness, relevance, context precision/recall, groundedness).    |
| `CitationTracker`       | Per-sentence attribution of generated answer back to source chunks.                                                                 |
| `computeGroundedness()` | Standalone function — score whether an answer is supported by the retrieved context.                                                |
| Evaluation datasets     | Helper utilities for loading and running standardized eval sets.                                                                    |
| LLM-judge primitives    | Pluggable judge models for faithfulness and relevance. Defaults to the same LLM as the pipeline; override for cost or independence. |

## Metrics

| Metric                | What it measures                                                  | When you care                                  |
| --------------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| **Faithfulness**      | Does the answer make claims supported by the retrieved context?   | Always. The #1 RAG quality signal.             |
| **Relevance**         | Is the answer actually addressing the question?                   | Always. Prevents "looks fluent, says nothing." |
| **Context precision** | Are the retrieved chunks relevant to the query?                   | Tuning your retriever / chunking.              |
| **Context recall**    | Did retrieval pull in everything it needed?                       | Diagnosing missed-answer cases.                |
| **Groundedness**      | What fraction of the answer's sentences trace back to a citation? | Compliance, audit, and trust UI.               |

## Two modes of use

### Online evaluation (per-query)

Score every production query — useful for monitoring quality drift and
gating responses below a threshold.

```js
const result = await pipeline.run({
  query: userQuestion,
  options: { evaluate: true, citations: true },
});

if (result.evaluation.scores.faithfulness < 0.7) {
  // Fall back, ask for clarification, or escalate to a human.
}
```

Online evaluation is the most expensive thing your pipeline does
(judge LLM calls). Sample it (e.g. evaluate 10% of queries) if cost
matters more than latency on every request.

### Offline evaluation (batch on a dataset)

Run a curated query set through the pipeline and produce a regression
report. Use this in CI for quality gates on PRs that touch retrieval
or prompting.

```js
import { PipelineEvaluator } from "@devilsdev/rag-pipeline-utils";

const evaluator = new PipelineEvaluator({ pipeline });
const report = await evaluator.runDataset("./eval-data/qa-dataset.json");

if (report.aggregateScores.faithfulness < baseline.faithfulness - 0.05) {
  process.exit(1); // CI gate
}
```

## Citations

Citations are produced by the `CitationTracker` and returned alongside
the answer:

```js
result.citations = [
  {
    sentence: "X is configured by setting Y to Z.",
    sourceChunkIds: ["doc-42-chunk-7"],
    confidence: 0.91,
  },
  // ...
  groundednessScore: 0.85, // overall, [0, 1]
];
```

UI typically renders these as superscript link-numbers next to each
sentence. The `confidence` field lets you visually de-emphasize weakly
attributed sentences without dropping them.

## When to extend rag-eval

You're operating in **rag-eval** territory when you:

- Add a custom metric (e.g. domain-specific factuality)
- Replace the default LLM judge with a smaller/cheaper/independent one
- Build a quality dashboard from accumulated evaluations
- Wire CI gates against evaluation regressions

## When to leave rag-eval alone

If you're not yet measuring quality, rag-eval is the most-leveraged
thing you can adopt next. If you _are_ measuring quality and the
metrics are healthy, leave it alone — don't add custom metrics
preemptively.

## Stability

`PipelineEvaluator`, `CitationTracker`, `computeGroundedness`, and the
metric names are part of the public API and follow the [SEMVER policy](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md).

The internal LLM-judge prompts may change in patch releases as we
improve them — this changes the **scores**, not the **API**, so it is
not a SemVer-breaking change. We document score-affecting changes in
the [CHANGELOG](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/CHANGELOG.md).
Pin the package version if you require score stability across upgrades.

## Related

- [Evaluation](./Evaluation) — full reference, metric formulas, dataset format
- [Benchmarks](./Benchmarks) — performance methodology (separate from quality)
- [Architecture](./Architecture) — how citation tracking is woven into the pipeline
