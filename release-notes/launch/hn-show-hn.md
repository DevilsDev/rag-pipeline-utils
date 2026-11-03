# Hacker News — "Show HN" draft

Updated for 3.3.0 (2026-11-04).

## Title (keep ≤80 chars)

Primary:

> Show HN: Test RAG answers in CI – grounding, eval and guardrails for Node.js

Alternates, in order of preference:

> Show HN: A benchmark found my RAG library ignoring most words, so I built eval-in-CI
> Show HN: Rag-pipeline-utils – Node.js RAG where every answer is checked against sources

## URL

`https://github.com/DevilsDev/rag-pipeline-utils`

(Submit the GitHub repo rather than npm: HN readers want the source, and the README's first screen has a runnable example. Post the body below as the first comment straight after submitting.)

## First comment (posted by OP immediately after submission)

```
Hi HN. I maintain @devilsdev/rag-pipeline-utils, a RAG library for Node.js
built around one question: did this change make the answers worse?

The motivation: my unit tests were green, then I ran the offline retriever
on BEIR SciFact and got nDCG@10 0.12 (BM25 gets 0.665). The TF-IDF embedder
kept the rarest words when the vocabulary hit its limit, so most queries
embedded to zeros. No small test corpus ever hit the limit. Fixed, it
scores 0.47. The same run caught a ~40 ms per-request stall in the Qdrant
store and pgvector capping results at 40 rows, before either shipped.

What's in it:

* Grounding: each answer sentence is mapped to supporting passages, and
  numbers in the answer must appear in the sources. checkAnswer() does the
  same for answers from LangChain, LlamaIndex, Mastra or the AI SDK.
* Eval in CI: `rag-pipeline eval tests.json --baseline main.json` fails
  the job when faithfulness, relevance or retrieval drop from main; a
  GitHub Action posts the comparison on each PR.
* Offline testing: a deterministic embedder and a recording LLM, plus
  runContractTests() for your own retrievers/LLM wrappers.
* Guardrails: ACL filtering before generation, prompt-injection detection,
  PII redaction.
* 3.3 added: AI SDK middleware (wrapLanguageModel), Jest/Vitest
  matchers like toBeGroundedIn, Mastra scorers, and a negation check.
* 3.2 added: four installable sub-packages (eval alone is ~6 MB),
  per-query model routing by estimated cost, OpenTelemetry GenAI spans,
  time to first token, and Cloudflare Workers (tested in workerd in CI).

Retrieval numbers and method: https://devilsdev.github.io/rag-pipeline-utils/docs/Benchmarks
Comparison with LangChain.js / LlamaIndex.TS / Mastra, including where
they win: https://devilsdev.github.io/rag-pipeline-utils/docs/Comparison

Non-goals: not an agent framework, no hosted service, no vector database
of its own (pgvector, Qdrant and in-memory are supported; anything with a
retrieve() method plugs in).

MIT, published from GitHub Actions with npm provenance. Happy to talk
about the eval design, the benchmarks or the edge-runtime work.
```

## Preparation checklist before posting

- [ ] The npm page shows the latest version and the README matches `main` (README fixes merged after 3.2.0 appear on npm only with the next release)
- [ ] The GitHub "About" description and topics are updated (suggested text in [listings.md](listings.md))
- [ ] The dev.to post is published first, so the Show HN comment can link it if asked
- [ ] Issue templates are live (PR #164), so first-time visitors land on a structured form
- [ ] Be ready to answer in the first 90 minutes

## Timing

- Tuesday, Wednesday or Thursday, **08:00–10:00 Pacific** (16:00–18:00 UTC)
- Avoid Friday afternoon, weekends, and the 24 hours after a big LangChain / LlamaIndex / OpenAI / Anthropic release

## Response patterns to prepare for

| Likely comment                           | Response shape                                                                                                                                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Why not LangChain?"                     | You can use both: `checkAnswer` and `@devilsdev/rag-eval` check answers from a LangChain chain. Point to the Comparison page for where LangChain wins (integrations, agents).                                              |
| "LLM-as-judge metrics are unreliable"    | Agree that they're noisy. Faithfulness here is computed against the retrieved text, not by asking a model for a score; the number check is deterministic. Baselines compare against your own main branch, not an absolute. |
| "Word overlap can't judge meaning"       | Agree for paraphrases: a correct paraphrase fails, and the docs say so. Numbers and negation are checked (since 3.3). An opt-in LLM-judge mode for what words can't settle is planned for 3.4.                             |
| "nDCG 0.47 is low"                       | It's the offline TF-IDF embedder, meant for tests and air-gapped dev. With a real embedder use pgvector/Qdrant. The point of publishing it is that the number is reproducible (`npm run bench:quality`).                   |
| "Is the guardrail injection check real?" | It's pattern- and heuristic-based, not a model; say so, and point to the Security Capabilities matrix for what is and isn't covered.                                                                                       |
| "Show me the code"                       | README first screen (runs offline), `examples/fastify-rag-demo`, `examples/cloudflare-worker`, `examples/mcp-server`.                                                                                                      |

## What NOT to do

- Don't ask for upvotes.
- Don't argue with downvotes.
- Don't cross-post to Reddit or X until at least 2 hours after the HN submission.
