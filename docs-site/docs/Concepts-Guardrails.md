---
id: Concepts-Guardrails
title: Concept — rag-guardrails
sidebar_label: Guardrails (rag-guardrails)
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
│  guardrails  │   → reject before any embedding or LLM spend
└──────┬───────┘
       ▼
┌──────────────┐
│  retrieval   │   Hybrid vector + BM25 with RRF
└──────┬───────┘
       ▼
┌──────────────┐
│  retrieval-  │   Min relevance score? Tenant ACL?
│ time filter  │   → reject if no chunk meets the bar
└──────┬───────┘
       ▼
┌──────────────┐
│  generation  │   LLM produces the answer
└──────┬───────┘
       ▼
┌──────────────┐
│ post-gen     │   PII in output? Grounded in citations?
│  guardrails  │   → redact, refuse, or pass with warning
└──────┬───────┘
       ▼
   Response
```

Each layer is independently configurable. Skip a layer and the others
still run.

## What's in rag-guardrails

| Surface                             | Purpose                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `GuardrailsPipeline`                | Wraps a `Pipeline` and adds the three guardrail layers.                          |
| Pre-retrieval: injection detection  | Pattern-matching + heuristic detection of jailbreak / prompt-injection attempts. |
| Pre-retrieval: topic filter         | Cosine-similarity gate against a configurable allowed-topics embedding set.      |
| Pre-retrieval: query-length limit   | Hard limit before embedding spend.                                               |
| Retrieval-time: minimum relevance   | Drop chunks below threshold.                                                     |
| Retrieval-time: ACL filter          | Honor `tenantId` / `aclTags` from the retrieval options.                         |
| Retrieval-time: max context size    | Token cap.                                                                       |
| Post-generation: PII detection      | Regex + named-entity heuristics for emails, phones, SSNs, credit cards.          |
| Post-generation: groundedness check | Reject answers below a groundedness threshold.                                   |
| Post-generation: classifier hook    | Pluggable toxicity / safety classifier slot.                                     |

## Wiring it up

```js
import {
  createRagPipeline,
  GuardrailsPipeline,
  MemoryRetriever,
  OpenAIConnector,
} from "@devilsdev/rag-pipeline-utils";

const base = createRagPipeline({
  retriever: new MemoryRetriever(),
  llm: new OpenAIConnector({ apiKey: process.env.OPENAI_API_KEY }),
});

const safe = new GuardrailsPipeline(base, {
  preRetrieval: {
    enableInjectionDetection: true,
    maxQueryLength: 1000,
    topicAllowlist: { embeddings: businessTopicEmbeddings, threshold: 0.6 },
  },
  retrieval: {
    minRelevanceScore: 0.5,
    maxContextTokens: 4000,
  },
  postGeneration: {
    enablePIIDetection: true,
    minGroundedness: 0.7,
  },
});

const result = await safe.run({ query: userQuestion });
// result.blocked = true if any guardrail rejected
// result.blockReason = "pre_retrieval.injection_detected" etc.
```

## When to enable which layer

| Scenario                                | Pre-retrieval             | Retrieval-time          | Post-gen                  |
| --------------------------------------- | ------------------------- | ----------------------- | ------------------------- |
| Internal employee tool, trusted users   | optional                  | recommended (relevance) | optional                  |
| Customer-facing chatbot                 | **required**              | **required**            | **required**              |
| Public API, untrusted callers           | **required** + rate limit | **required**            | **required** + classifier |
| Compliance-regulated (HIPAA, GDPR, PCI) | **required**              | **required** + ACL      | **required** + audit log  |

## What guardrails don't fix

Guardrails reduce a class of risks; they don't eliminate them. See the
[Security Capabilities matrix](./Security-Capabilities) for the
detailed scorecard. Headlines:

- Guardrails are **defense in depth**, not a single point of safety.
- Pattern-based injection detection catches known patterns; novel
  attacks may slip through. Combine with output-side checks.
- PII detection uses heuristics; high-stakes compliance needs a
  dedicated classifier and human review.
- Groundedness scoring depends on the LLM judge; it's a confidence
  signal, not a guarantee.

## Stability

`GuardrailsPipeline`, the configuration shape, and the documented
guardrail layers are part of the public API and follow the
[SEMVER policy](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md).

Detection patterns and judge prompts may improve in patch releases
without bumping the major. If you require stable detection behavior,
pin the package version.

## Related

- [Security guide](./Security) — cookbook patterns and code examples
- [Security Capabilities matrix](./Security-Capabilities) — what's
  battle-tested vs. recommended vs. example
- [Evaluation](./Evaluation) — quality metrics that complement guardrails
- [Architecture](./Architecture#guardrails) — internal design
