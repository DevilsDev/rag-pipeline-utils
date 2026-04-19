# Hacker News — "Show HN" draft

## Title (keep ≤80 chars)

Primary:

> Show HN: Composable RAG for Node.js with built-in evaluation, citations, guardrails

Alternates if the primary doesn't get traction, in order of preference:

> Show HN: A Node.js RAG framework that ships with the evaluation metrics
> Show HN: Rag-pipeline-utils – Node.js RAG with OIDC-published provenance
> Show HN: I relicensed my RAG library from GPL to MIT — here's the full cleanup

## URL

`https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils`

(HN lets you submit either a URL or text. URL-only submissions need a strong title since the first comment becomes the discussion starter. Post this as URL submission, then immediately add the body below as the first comment.)

## First comment (posted by OP immediately after submission)

```
Hi HN. I've been building @devilsdev/rag-pipeline-utils — a Node.js framework
for RAG pipelines. Three primitives (pipeline, plugin, connector) and optional
layers for citations, evaluation, guardrails, agentic reasoning, and GraphRAG.

What's different from LangChain.js and LlamaIndex.TS:

* Built-in RAG evaluation metrics (faithfulness, relevance, context P/R,
  groundedness) that you turn on with {evaluate: true}, not a SaaS add-on
* Per-sentence citation tracking with groundedness scoring — every answer
  sentence maps back to its source chunks
* 3-layer guardrails (prompt-injection detection pre-retrieval, relevance
  gating at retrieval, PII + groundedness post-generation) in one wrapper
  class
* Dual ESM/CJS build, MIT-licensed, zero runtime vulnerabilities at
  release time
* Published via GitHub Actions OIDC with SLSA provenance (no standing
  npm token exists for the repo)

The honest comparison page includes where LangChain.js wins (ecosystem
breadth, agents) and where LlamaIndex.TS wins (indexing strategies):
https://devilsdev.github.io/rag-pipeline-utils/docs/Comparison

I submitted the project for community review a week ago and the feedback
was unanimous about the GPL license being a dealbreaker for commercial
evaluation, and about "utils" framing underselling the scope. This
release (v2.4.5) is the result of acting on that feedback: MIT license,
repositioned headline, removed unverified performance claims, added
SEMVER policy + security capability matrix + benchmarks methodology +
a runnable Fastify demo deployable to Fly/Railway.

Runnable demo (Fastify + OpenAI + guardrails + citations in ~150 LoC):
https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples/fastify-rag-demo

Honest non-goals:
- It's not a general LLM orchestration framework (use LangChain for
  agents, tool use, code generation)
- It's not a no-code builder (this is a Node.js library)
- It doesn't ship its own vector store (bring your own, or use the
  in-memory retriever for dev)

Happy to answer questions on the architecture, the repositioning process,
or the OIDC publish setup.
```

## Preparation checklist before posting

- [ ] Make sure the npm page looks right (latest version, MIT badge, new description)
- [ ] Make sure the GitHub repo's "About" blurb matches the new tagline
- [ ] Add repo topics: rag, retrieval-augmented-generation, graphrag, guardrails, citations, evaluation, mcp, nodejs
- [ ] Pin an issue welcoming feedback so first-time visitors have a soft landing
- [ ] Be ready to respond in the first 90 minutes — HN front-page windows are short and answering early comments is the single biggest predictor of visibility

## Timing

Best windows for Show HN:

- Tuesday / Wednesday / Thursday, **08:00–10:00 Pacific** (16:00–18:00 UTC)
- Avoid Friday afternoon, Saturday, or anything close to a major product launch from a big vendor

Avoid the 24h after a LangChain / LlamaIndex / OpenAI release — the RAG tag fills with their traffic and yours gets buried.

## Response patterns to prepare for

| Likely comment                            | Response shape                                                                                                                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Why not use LangChain?"                  | Point to the Comparison page, be specific about where LangChain wins (breadth of integrations, agents) and where this framework is differentiated (evaluation + citations + guardrails in the box). |
| "Can you show benchmarks?"                | Point to BENCHMARKS.md philosophy ("methodology not marketing numbers") and the E2E harness template. Offer to run the suite on their provided corpus if they share one.                            |
| "GraphRAG is overhyped"                   | Agree that it's not a panacea. It's useful for multi-hop questions where pure vector retrieval misses connections. Share a concrete query type where it helps.                                      |
| "How's this different from {vendor}?"     | The comparison page addresses LangChain.js and LlamaIndex.TS directly. For other vendors, ask what feature they need and answer specifically.                                                       |
| "Show me the code"                        | Link directly to [`examples/fastify-rag-demo/server.js`](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/examples/fastify-rag-demo/server.js) — it's ~150 lines and does the whole thing. |
| "Is the SLSA provenance actually useful?" | Yes for anyone running `npm audit signatures` as part of their supply-chain checks. Short link to the attestation URL and a one-liner on how it binds git commit → tarball bytes.                   |

## What NOT to do

- Don't ask for upvotes. This is a fast ban on HN.
- Don't argue with downvotes — they often get reversed when the comment is substantive.
- Don't cross-post to r/programming or Twitter/X until at least 2 hours after HN submission — if HN picks it up, you want to concentrate the initial discussion there.
- Don't over-explain the "why we relicensed from GPL" in the main post. It's a dev.to-scale story, not an HN-scale story. Mention briefly, link out.
