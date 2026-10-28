---
id: Concepts-Guardrails
title: "Guardrails"
sidebar_label: Guardrails
description: Three-layer defense — prompt-injection detection pre-retrieval, relevance gating during retrieval, PII and groundedness checks post-generation.
---

# Concept: rag-guardrails

If [rag-eval](./Concepts-Evaluation) tells you _whether_ an answer is
trustworthy, **rag-guardrails** is what stops bad inputs from becoming
bad outputs in the first place. It's the framework's safety layer —
applied at three points in the pipeline.

## The three layers

```
User query
   │
   ▼
┌──────────────┐
│ pre-retrieval│   Prompt injection? Off-topic? Too long?
│  guardrails  │   → strict mode rejects before any embedding or LLM spend
└──────┬───────┘
       ▼
┌──────────────┐
│  retrieval   │   Your retriever (e.g. hybrid vector + BM25 with RRF)
└──────┬───────┘
       ▼
┌──────────────┐
│  retrieval-  │   Min relevance score? ACL? Freshness? Injected text?
│ time filter  │   → runs via options.filterResults, before generation
└──────┬───────┘
       ▼
┌──────────────┐
│  generation  │   LLM produces the answer from the filtered documents
└──────┬───────┘
       ▼
┌──────────────┐
│ post-gen     │   PII in output? Grounded in the documents? Length?
│  guardrails  │   → redact, or block in strict mode
└──────┬───────┘
       ▼
   Response
```

`GuardrailsPipeline` wraps the pipeline: the pre-retrieval check runs before
`run()` is called, the retrieval guard is handed to the pipeline as the
`options.filterResults` hook (so the LLM never sees documents it removes),
and the post-generation check runs on the answer. Pass `false` for a
layer to disable it; the others still run.

## What's in rag-guardrails

| Surface                                  | Purpose                                                                                                                                                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GuardrailsPipeline`                     | Wraps any object with a `run()` method (e.g. from `createRagPipeline`) and adds the three layers.                                                                                                                                              |
| `PreRetrievalGuard`: injection detection | Pattern rules on normalised text (homoglyphs, leetspeak, zero-width characters). Reports matches in `injection`; never rewrites the query.                                                                                                     |
| `PreRetrievalGuard`: topic filter        | Keyword lists: `blockedTopics` / `allowedTopics` with `enableTopicFiltering: true`.                                                                                                                                                            |
| `PreRetrievalGuard`: query-length limit  | `maxQueryLength` (default 10000).                                                                                                                                                                                                              |
| `RetrievalGuard`: minimum relevance      | Drop results whose `score` is below `minRelevanceScore`.                                                                                                                                                                                       |
| `RetrievalGuard`: ACL filter             | `enforceACL: true` checks each document's `requiredRole` / `acl` (on the result or in its `metadata`, as `MemoryRetriever` and `FileVectorStore` return it) against `context.userPermissions`. Fails closed when `userPermissions` is missing. |
| `RetrievalGuard`: freshness              | `maxAgeDays` (0 disables it).                                                                                                                                                                                                                  |
| `RetrievalGuard`: injection scan         | `detectInjection: true` scans retrieved text; `injectionAction: 'remove'` (default) or `'flag'`.                                                                                                                                               |
| `PostGenerationGuard`: PII detection     | Regex patterns for emails, phone numbers, SSNs and credit cards; detected PII is redacted in the answer, citations and evaluation details.                                                                                                     |
| `PostGenerationGuard`: groundedness      | Flags answers below `groundednessThreshold` (default 0.3).                                                                                                                                                                                     |
| `PostGenerationGuard`: length            | `minResponseLength` / `maxResponseLength`.                                                                                                                                                                                                     |
| `detectInjection(text)`                  | The injection detector as a standalone function.                                                                                                                                                                                               |

## Wiring it up

```js no-run
import {
  createRagPipeline,
  GuardrailsPipeline,
  MemoryRetriever,
  OpenAIConnector,
} from "@devilsdev/rag-pipeline-utils";

const openai = new OpenAIConnector({ apiKey: process.env.OPENAI_API_KEY });

const base = createRagPipeline({
  embedder: openai,
  retriever: new MemoryRetriever(),
  llm: openai,
});

const safe = new GuardrailsPipeline(base, {
  preRetrieval: {
    enableInjectionDetection: true,
    maxQueryLength: 1000,
    enableTopicFiltering: true,
    allowedTopics: ["billing", "refund", "invoice"],
  },
  retrieval: {
    minRelevanceScore: 0.5,
    enforceACL: true,
    detectInjection: true,
  },
  postGeneration: {
    enablePIIDetection: true,
    groundednessThreshold: 0.5,
  },
  strict: true, // block instead of warn
});

const result = await safe.run({
  query: userQuestion,
  context: { userPermissions: ["support"] },
});
// Blocked: { success: false, error: "Pre-retrieval guard blocked query", guardrails }
// Passed:  { success: true, answer, results, citations, guardrails: {
//            preRetrieval, retrieval, postGeneration } }
```

Without `strict`, issues are reported in `result.guardrails` and the run
continues (PII is still redacted).

## When to enable which layer

| Scenario                                | Pre-retrieval             | Retrieval-time          | Post-gen                           |
| --------------------------------------- | ------------------------- | ----------------------- | ---------------------------------- |
| Internal employee tool, trusted users   | optional                  | recommended (relevance) | optional                           |
| Customer-facing chatbot                 | **required**              | **required**            | **required**                       |
| Public API, untrusted callers           | **required** + rate limit | **required**            | **required** + your own classifier |
| Compliance-regulated (HIPAA, GDPR, PCI) | **required**              | **required** + ACL      | **required** + audit log           |

## What guardrails don't fix

Guardrails reduce a class of risks; they don't eliminate them. See the
[Security Capabilities matrix](./Security-Capabilities) for the
detailed scorecard. Headlines:

- Guardrails are **defense in depth**, not a single point of safety.
- Pattern-based injection detection catches known patterns; novel
  attacks may slip through. Combine with output-side checks.
- PII detection uses heuristics; high-stakes compliance needs a
  dedicated classifier and human review.
- Groundedness scoring is lexical plus a numeric-consistency check (no
  LLM judge); negation and units are not checked. It's a confidence
  signal, not a guarantee.

## Stability

`GuardrailsPipeline`, the configuration shape, and the documented
guardrail layers are part of the public API and follow the
[SEMVER policy](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md).

Detection patterns may improve in patch releases
without bumping the major. If you require stable detection behavior,
pin the package version.

## Related

- [Security guide](./Security) — cookbook patterns and code examples
- [Security Capabilities matrix](./Security-Capabilities) — what's
  battle-tested vs. recommended vs. example
- [Evaluation](./Evaluation) — quality metrics that complement guardrails
- [Architecture](./Architecture.md#guardrails) — internal design
