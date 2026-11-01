# @devilsdev/rag-eval

RAG evaluation: faithfulness, relevance, context precision and recall, groundedness, datasets, reports and citation checks.

Part of [@devilsdev/rag-pipeline-utils](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils), split into packages so you install only what you use. The objects are the same ones the full package exports; versions move in lockstep.

```bash
npm install @devilsdev/rag-eval
```

Exports: `evaluateRagDataset`, `scoreAnswer`, `computeBLEU`, `computeROUGE`, `checkNumericConsistency`, `extractNumbers`, `computeFaithfulness`, `computeSemanticSimilarity`, `validateDataset`, `generateSyntheticDataset`, `runEvaluation`, `compareConfigurations`, `evaluationVerdict`, `renderEvaluationReport`, `computeAnswerRelevance`, `computeContextPrecision`, `computeContextRecall`, `computeGroundedness`, `PipelineEvaluator`, `checkAnswer`, `normalizeSources`, `CitationTracker`, `mapSentenceToSources`, `buildIDFWeights`, `detectHallucinations`.

Documentation: https://devilsdev.github.io/rag-pipeline-utils/

The other packages:

- [`@devilsdev/rag-core`](https://www.npmjs.com/package/@devilsdev/rag-core)
- [`@devilsdev/rag-connectors`](https://www.npmjs.com/package/@devilsdev/rag-connectors)
- [`@devilsdev/rag-guardrails`](https://www.npmjs.com/package/@devilsdev/rag-guardrails)
