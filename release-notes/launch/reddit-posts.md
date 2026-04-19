# Reddit post drafts

Different subs want different tones. Same underlying information, different framing.

---

## r/node

**Title**:

> Built a RAG framework for Node.js with evaluation metrics + citations + guardrails baked in

**Body**:

```
Spent the last few months on @devilsdev/rag-pipeline-utils — a Node.js
framework for production RAG services. Just shipped v2.4.5 and wanted
to share with folks building in this space.

What's in it:

* createRagPipeline({ retriever, llm }) — the core factory, three
  primitives: pipeline, plugin, connector
* RAG evaluation built-in — faithfulness, relevance, context
  precision/recall, groundedness. No separate SaaS required.
* Per-sentence citation tracking with groundedness scoring — every
  answer sentence maps back to the source chunks
* 3-layer guardrails — prompt-injection detection pre-retrieval,
  relevance gating during retrieval, PII + groundedness post-generation
* GraphRAG for multi-hop questions
* Built-in connectors for OpenAI, Anthropic, Cohere, Ollama — plus a
  JSON Schema plugin contract for custom ones
* Dual ESM/CJS build, MIT, zero runtime vulnerabilities at release
* Published via GitHub Actions OIDC with SLSA provenance — no standing
  npm token

Runnable Fastify demo with Fly/Railway deploy configs in
~150 LoC of server.js:

https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples/fastify-rag-demo

The comparison page is intentionally honest about where LangChain.js
and LlamaIndex.TS win — it's meant to help you decide rather than sell:

https://devilsdev.github.io/rag-pipeline-utils/docs/Comparison

npm: https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils
repo: https://github.com/DevilsDev/rag-pipeline-utils

Feedback welcome, especially from folks building RAG in production
Node services. What's the thing that trips you up most right now?
```

**Flair**: Show and Tell / Project (whichever r/node uses currently)

**Best time**: Tuesday–Thursday 09:00–11:00 Pacific

---

## r/LocalLLaMA

**Title**:

> Node.js RAG framework with 3-layer guardrails + GraphRAG + Ollama support (MIT)

**Body**:

```
For the Node-leaning folks here: shipped v2.4.5 of
@devilsdev/rag-pipeline-utils, a RAG framework focused on:

* Local-first development via built-in Ollama connector — no
  required cloud dependency for the LLM
* TF-IDF in-memory retriever for dev/test, plus a plugin contract
  for any vector store (Pinecone / Weaviate / Qdrant / pgvector — you
  write ~50 lines of adapter)
* 3-layer guardrails you can turn on independently (pre-retrieval
  injection detection, retrieval-time relevance gating, post-gen PII
  and groundedness checks)
* GraphRAG for when vector retrieval misses multi-hop connections
* Per-sentence citation tracking with groundedness scoring
* RAG evaluation metrics (faithfulness, relevance, context P/R,
  groundedness) — run online for gating or offline for CI regression

What it's NOT: it's a developer library, not a GUI builder, and it's
Node.js only (no Python port).

The Ollama connector makes the dev story genuinely offline — you can
wire up a pipeline, ingest docs, run queries and see citations
without any cloud account.

Runnable Fastify + Ollama demo coming in the next release; for now
the Fastify + OpenAI demo is here:
https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples/fastify-rag-demo

Swap `OpenAIConnector` for `OllamaConnector` and point it at your
local Ollama server for the same demo running fully offline.

npm: https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils

Happy to answer anything about the architecture.
```

**Flair**: Resources / Project

**Best time**: Weekends are surprisingly active on r/LocalLLaMA; Saturday afternoon UTC is a decent window.

---

## r/LLMDevs

**Title**:

> Cut my RAG service's "trust surface" from "pile of prompts" to "measurable metrics + citations + guardrails" — here's what that actually looks like in code

**Body**:

```
Been frustrated with RAG pipelines that "work" in demos but have no
visible quality signal in production. Spent some time building the
missing middle layer as a Node.js framework. Sharing the design here
in case it's useful to others solving the same problem.

Three specific production problems I kept hitting:

1. "How do I know this answer is grounded?"
   → Per-sentence citation tracking + groundedness score. Every
   returned sentence has its source chunk IDs. Below-threshold
   sentences can be visually de-emphasized in UI or rejected
   outright.

2. "How do I detect quality drift?"
   → Online evaluation with faithfulness/relevance/context P/R
   scores attached to every response. Sample them, log them to
   your metrics stack, alert when they drop.

3. "How do I stop prompt injection from leaking other customers'
   data?"
   → 3-layer guardrails: input sanitization pre-retrieval, ACL-aware
   retrieval filtering (tenant ID honored), PII detection on output.

The whole thing is composable. Core pipeline is ~30 lines of config.
Each guardrail layer is opt-in. Evaluation is a single flag.

Code:
  const pipeline = createRagPipeline({
    retriever: new MemoryRetriever(),
    llm: new OpenAIConnector({ apiKey }),
  });

  const safe = new GuardrailsPipeline(pipeline, {
    preRetrieval: { enableInjectionDetection: true },
    retrieval: { minRelevanceScore: 0.5 },
    postGeneration: { enablePIIDetection: true, minGroundedness: 0.7 },
  });

  const result = await safe.run({
    query: userQuestion,
    options: { citations: true, evaluate: true },
  });

  // result.answer, result.citations, result.evaluation.scores

More details and a runnable Fastify demo in the repo. MIT-licensed,
zero runtime vulns, published via OIDC + SLSA provenance.

npm: https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils
repo: https://github.com/DevilsDev/rag-pipeline-utils
comparison vs LangChain/LlamaIndex: https://devilsdev.github.io/rag-pipeline-utils/docs/Comparison

Curious: what's your current approach to measuring RAG quality in
production? Are you sampling evaluation online, running offline
datasets in CI, or just relying on user feedback?
```

**Flair**: Discussion / Project

**Best time**: Weekday evenings UTC tend to be active.

---

## General posting notes

1. **Don't post all three the same day.** Space them across a week. Reddit sees cross-posts; if your first post gets traction, the second can still do well, but posting all three at once looks like spam.
2. **Engage every top-level comment in the first two hours.** That's where Reddit momentum lives.
3. **Link the docs-site Comparison page** from every post — that's your highest-leverage piece for fence-sitters.
4. **Ready to link to specific code**, not just the repo. If someone asks "how does the citation tracking work?", have `src/evaluation/citation-tracker.js` already bookmarked.
5. **If the OIDC trusted-publishing angle comes up** (it will on r/node), that's the conversation that shows you care about supply chain. Answer it, don't deflect.
6. **Decline to argue** about RAG being dead / agents being the future / whatever meta-debate. Answer substantively and move on.
7. **Accept the downvotes you'll get** for anything that reads as self-promotion. Reddit is noisier than HN. Quality of engagement > upvote count.
