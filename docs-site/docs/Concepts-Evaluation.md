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
and citation layer — the metrics and trackers that close
that gap.

## What's in rag-eval

| Surface                                          | Purpose                                                                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `PipelineEvaluator`                              | Score a pipeline result (`{ query, answer, results }`) on faithfulness, relevance, context precision, context recall and groundedness.         |
| `CitationTracker`                                | Per-sentence attribution of the generated answer to source documents, plus a hallucination report.                                             |
| `compute*()` functions                           | Standalone metrics: `computeFaithfulness`, `computeAnswerRelevance`, `computeContextPrecision`, `computeContextRecall`, `computeGroundedness`. |
| `checkNumericConsistency()` / `extractNumbers()` | The numeric check used by claim support: numbers in a claim must appear in the source ("20" equals "twenty").                                  |
| `evaluateRagDataset()`                           | Batch helper: runs `[{ prompt, expected }]` from a JSON file through a pipeline and scores each case with BLEU/ROUGE.                          |

All metrics are computed locally and deterministically; no judge LLM is called. Grounding is lexical (the share of a sentence's content words found in a document, optionally IDF-weighted) plus a numeric-consistency check. Negation ("not twenty days"), units ("20 hours" vs "20 days") and claims that combine several documents are not checked.

## Metrics

| Metric                | What it measures                                                                                                               | When you care                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| **Faithfulness**      | Share of answer sentences supported by a retrieved document.                                                                   | Always. The #1 RAG quality signal.                |
| **Relevance**         | How well the answer covers the query's terms.                                                                                  | Always. Prevents "looks fluent, says nothing."    |
| **Context precision** | Share of retrieved documents relevant to the query.                                                                            | Tuning your retriever / chunking.                 |
| **Context recall**    | How much of a **reference (ground-truth) answer** the retrieved documents support. Needs `referenceAnswer`; skipped otherwise. | Diagnosing missed-answer cases on a labelled set. |
| **Groundedness**      | Weighted mean of the available components; without a reference, `(0.4 * faithfulness + 0.3 * contextPrecision) / 0.7`.         | Compliance, audit, and trust UI.                  |

The default per-sentence similarity threshold is 0.5 (raised from 0.3 in 2.5.0). Since 2.5.0 scores for grounded answers are noticeably higher than in 2.4.x, because support no longer shrinks with document length; re-baseline any thresholds you set on older versions.

## Two modes of use

### Online evaluation (per-query)

Score production queries — useful for monitoring quality drift and
gating responses below a threshold.

```js
const result = await pipeline.run({
  query: userQuestion,
  options: { evaluate: true, citations: true },
});

if (result.success && result.evaluation.scores.faithfulness < 0.7) {
  // Fall back, ask for clarification, or escalate to a human.
}
```

The metrics are lexical and cheap compared with the LLM call, so you can usually evaluate every query.

### Offline evaluation (batch on a labelled set)

Run a curated query set through the pipeline and produce a regression
report. Use this in CI for quality gates on PRs that touch retrieval
or prompting. Passing each case's reference answer enables context recall.

```js
import { PipelineEvaluator } from "@devilsdev/rag-pipeline-utils";

const evaluator = new PipelineEvaluator();
const cases = JSON.parse(await fs.readFile("./eval-data/qa.json", "utf8"));

let total = 0;
for (const { question, reference } of cases) {
  const result = await pipeline.run({ query: question });
  const { scores } = evaluator.evaluate(result, { referenceAnswer: reference });
  total += scores.faithfulness;
}

if (total / cases.length < baseline.faithfulness - 0.05) {
  process.exit(1); // CI gate
}
```

## Citations

Citations are produced by the `CitationTracker` and returned alongside
the answer when you pass `options: { citations: true }`:

```js
result.citations = {
  citations: [
    {
      sentence: "Refunds are allowed within 30 days of purchase.",
      sources: [{ docId: "d1", docIndex: 0, score: 0.58 }],
    },
    { sentence: "The moon is cheese.", sources: [] },
  ],
  groundednessScore: 0.5, // share of sentences with a source, [0, 1]
  hallucinationReport: {
    hallucinationRate: 0.5,
    sentences: [
      /* classification per sentence */
    ],
  },
  metadata: {
    sentenceCount: 2,
    docCount: 1,
    config: { similarityThreshold: 0.5 },
  },
};
```

UI typically renders these as superscript link-numbers next to each
sentence. The per-source `score` lets you visually de-emphasize weakly
attributed sentences without dropping them. With zero retrieved documents,
every sentence is reported as unsupported.

## When to extend rag-eval

You're operating in **rag-eval** territory when you:

- Add a custom metric (e.g. domain-specific factuality)
- Add an LLM-judged metric of your own on top of the lexical ones
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

Scoring internals may change in minor releases as we improve them — this
changes the **scores**, not the **API**. We document score-affecting changes
in the [CHANGELOG](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/CHANGELOG.md)
(2.5.0 changed grounding scores, thresholds, context recall and the tokenizer).
Pin the package version if you require score stability across upgrades.

## Related

- [Evaluation](./Evaluation) — full reference, metric formulas, dataset format
- [Benchmarks](./Benchmarks) — performance methodology (separate from quality)
- [Architecture](./Architecture) — how citation tracking is woven into the pipeline
