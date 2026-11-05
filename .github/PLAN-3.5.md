# Plan for 3.5 and 3.6

> Written 2026-11-04, after 3.4.0. It covers the six items moved from 3.4 ([PLAN-3.3.md](PLAN-3.3.md), section 3). The facts in section 2 were checked on 2026-11-04; recheck any that are more than a month old before starting the item. The rows in [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md) track the work; this file explains the order.

## Headline

**3.5 makes every check measurable and visible:** a detector contract, published precision and recall for the guards, evaluation scores in OpenTelemetry and Langfuse, and verification of the citations Claude and OpenAI return. All four live in the library and are tested in CI without accounts or new packages, so 3.5 can ship as soon as they are done.

**3.6 widens the way in:** a Pinecone retriever and `npm create rag-pipeline` starters. Both need steps only the maintainer can take (a Pinecone project and CI secret, a seventh npm package with its own trusted publisher), so they are split off rather than holding 3.5 back.

The maintainer agreed to this split and to the other recommendations in section 5 on 2026-11-04.

## 1. Order

| #   | Item                              | Release | Effort | Why this position                                                                                                    |
| --- | --------------------------------- | ------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| 1   | **Pluggable guard detectors**     | 3.5     | S–M    | Small, and item 2 measures detectors through it, so the numbers can compare the built-in patterns with a model       |
| 2   | **Measured guardrails**           | 3.5     | M      | Published numbers are the strongest claim for the launch posts, and they show where a model-based detector is needed |
| 3   | **Scores to observability tools** | 3.5     | S–M    | Unblocks the Langfuse and Phoenix recipes in Phase 3 of the growth plan                                              |
| 4   | **Verify provider citations**     | 3.5     | M      | Extends "answers you can check" to apps that let the model cite                                                      |
| 5   | **Pinecone retriever**            | 3.6     | M      | The most-used hosted vector database; needs a Pinecone project for its contract tests                                |
| 6   | **Starter templates**             | 3.6     | M–L    | A new package and three templates that each need a CI build; feeds the template gallery listings                     |

One PR per item, each branched from `main` (not stacked), each with the README, CHANGELOG, roadmap row and "Coming in" notes. Since 3.4.0 the full README is `.github/README.md`; the root `README.md` is the npm page, under 150 lines, and changes only when a feature belongs in its "What's in it" list.

## 2. The items

### 2.1 Pluggable guard detectors (3.5)

A detector is `{ name, detect(text, context) -> { flagged, score?, labels?, spans? } }`, sync or async. `PreRetrievalGuard`, `RetrievalGuard` and `PostGenerationGuard` take a `detectors` option that replaces or adds to the built-in pattern checks (`mode: "replace" | "add"`), and the built-in injection and PII checks become detectors themselves, so their behaviour is unchanged by default.

- A contract test kit entry (`runContractTests` covers loaders, embedders, retrievers, rerankers and LLMs today) so a community detector can be checked.
- Example adapters in the docs, not dependencies: a prompt-injection classifier (`protectai/deberta-v3-base-prompt-injection-v2`, Apache-2.0) and Presidio. Checked 2026-11-05: Hugging Face Text Embeddings Inference doesn't serve DeBERTa classifiers, so the example runs the model's ONNX export in-process with transformers.js; ProtectAI has archived the project the model came from, and its card says it is English-only and doesn't detect jailbreaks. Not content-safety models: OpenAI's moderation endpoint and Llama Guard flag harmful content and have no prompt-injection category, so they aren't injection detectors (Meta's injection model is Prompt Guard).
- Async detectors mean the guards' `check()` may return a promise. The guards are sync today, so this needs an additive API (`checkAsync()`, or a promise only when an async detector is configured); decide in the PR, and keep the sync path for existing callers.

### 2.2 Measured guardrails (3.5)

`rag-pipeline eval-guardrails <labelled.jsonl>` runs the injection and PII detectors over labelled examples and reports precision, recall and F1 per detector and per label, as JSON, Markdown and HTML like `rag-pipeline eval`.

- **Datasets, checked 2026-11-04:**
  - Injection: `deepset/prompt-injections` (Apache-2.0), test split. Jailbreaks: `jackhhao/jailbreak-classification` (Apache-2.0), its configured test split (`balanced/`, 262 rows), reported on its own because a jailbreak is a different task from an injection.
  - A model comparison must use a set the model wasn't trained on: `protectai/deberta-v3-base-prompt-injection-v2` lists `jackhhao/jailbreak-classification` in its training data (checked 2026-11-04), so its numbers are reported on `deepset/prompt-injections` only. Check the training data of any model before reporting it.
  - PII: `gretelai/synthetic_pii_finance_multilingual` (Apache-2.0).
  - RAG-specific attacks, such as poisoned chunks, indirect injection in a retrieved document and fabricated sources: a fixtures pack written for this project.
  - Not used: `ai4privacy/pii-masking-*` (custom licence) and Microsoft's BIPIA (archived, no licence), which can't be redistributed.
- **Credible numbers:** the detectors are not tuned on the sets that are reported; the published run uses held-out test splits, through `benchmarks.yml` and the Benchmarks page, so anyone can reproduce it. The numbers are published whatever they are. Pattern-based recall on indirect injection and on names is expected to be low, and saying so is the case for item 1.
- **ACL is not a classifier.** It enforces a permission rule, so it gets correctness tests (every document a user may not see is removed, every one they may see is kept), not precision and recall. The roadmap row is corrected to say this.

### 2.3 Scores to observability tools (3.5)

- **OpenTelemetry:** the GenAI semantic conventions define a `gen_ai.evaluation.result` event, with `gen_ai.evaluation.name` (required), `gen_ai.evaluation.score.value` and `gen_ai.evaluation.score.label` (conditionally required), and `gen_ai.evaluation.explanation` (recommended); see `reference/reports/gen-ai-evaluation-result-event.md` in open-telemetry/semantic-conventions-genai. With `telemetry` on and `evaluate` or `citations` in the run, each score becomes one such event on the run span. Spec names only; anything the spec lacks stays under `rag.*`.
- **Langfuse:** `toLangfuseScores(result, { traceId, observationId? })` returns plain objects in the shape `@langfuse/client`'s `langfuse.score.create()` takes (`name`, `value`, `dataType`, `comment`, `traceId`, `observationId`). Neither Langfuse SDK becomes a dependency.
- **Checked 2026-11-05, while building it:** the event is a log record (the Logs data model), not a span event, and SHOULD be parented to the operation it evaluates; so each score is parented to the `chat` or `retrieval` span it judges, not the run span. `@opentelemetry/api` 1.10 (2026-10-20) includes the logs API; `@opentelemetry/api-logs` registers its LoggerProvider under a different global, so it is taken only when passed (`telemetry: { logs }`), and is not a peer dependency (a peer range conflicts with apps that depend on api-logs 0.5x). Langfuse ingests OTel spans with the same trace and span ids, but its default filter keeps only spans with `gen_ai.*` attributes, which drops `rag.pipeline.run`.
- **Also check:** the conventions have pending changes to retrieval (the `gen_ai.retrieval.client` span is deprecated, and retrieval leaves `gen_ai.client.operation.duration`). Compare the 3.2 retrieval span with the spec when doing this item. Done 2026-11-05: the spec's `gen_ai.retrieval` span is named `retrieval` with kind internal, so the span was renamed from `retrieval <data source>` (kind client); its attributes already matched. The `gen_ai.retrieval.duration` metric is not implemented (the library emits no OTel metrics yet).

### 2.4 Verify provider citations (3.5)

`fromAnthropicCitations(message, documents)` and `fromOpenAIFileCitations(response)` normalise a provider's citations into `CitationTracker`'s format; `verifyCitations()` then checks each cited passage against its claim with the same lexical, number and negation checks (and the optional judge). A citation that exists can still fail to support its sentence; that is what this reports.

- **Built 2026-11-05:** the functions normalise into their own shape (`{ provider, answer, claims: [{ text, start, end, citations: [{ sourceId, title, location, passages }] }] }`), not CitationTracker's, because CitationTracker's has no passage text to verify against; `documents` became an option. Each claim is checked against only the passages it cites, together (a claim may take one fact from each of two passages); `runJudge` gained an `allowed` list per claim so the judge can't support a claim with another claim's passage. An OpenAI claim is the sentence ending at the citation's index, an inferred boundary.

- **Anthropic:** each citation carries `cited_text` and a `document_index`, with a `char_location`, `page_location` or `content_block_location`, so it can be verified from the response alone.
- **OpenAI file search:** a `file_citation` annotation carries only `file_id`, `filename` and `index`, with no cited text. Verifying it needs the search results, which the caller requests with `include: ["file_search_call.results"]`. Without them the function reports the citation as unverifiable rather than guessing. Effort is M, not S–M, because of this.

### 2.5 Pinecone retriever (3.6)

`PineconeRetriever` on the retriever contract, with `@pinecone-database/pinecone` (9.x, Node 22 or later) as an optional peer dependency like `openai` and `pg`.

- **Testing:** Pinecone Local, the in-memory emulator, reached end of life on 2026-10-07. The suggested replacement, a Prism mock of the OpenAPI spec, returns the same canned response to every call, so it can check requests and error handling but not store-then-query. Unit tests use that mock (or a fetch stub); the shared retriever contract suite (`__tests__/utils/retriever-contract.js`) can only run against a real Pinecone project, with an API key as a CI secret, in the non-required "Vector stores" job. **This needs the maintainer** (section 5).

### 2.6 Starter templates (3.6)

`npm create rag-pipeline` (the package `create-rag-pipeline` was free on npm on 2026-11-04; the fallback is `@devilsdev/create-rag-pipeline`, run as `npm create @devilsdev/rag-pipeline`) with three templates: Next.js with the AI SDK and `groundingMiddleware`, Mastra with the scorers, and a Cloudflare Worker.

- A **seventh package:** the maintainer publishes its first version by hand and adds a trusted publisher with "npm publish" ticked; `release.yml` gets a publish step after the MCP server's; `sync-package-versions.js` lists it as standalone.
- Each template is built and its test run in CI, because Next.js and Mastra change quickly; Dependabot keeps them current.
- The template gallery submissions (Vercel, Cloudflare) come after, and need the maintainer's yes.

## 3. Outward-facing steps (the maintainer's yes first)

- MCP directory listings for `@devilsdev/rag-mcp-server` (its `mcpName` is set; publishing to the MCP registry is a separate step). Moved out of 3.5.0 on 2026-11-05 at the maintainer's decision, then done the same day: the official MCP Registry (published by `.github/workflows/mcp-registry.yml` with GitHub OIDC after each release), Glama, and a pull request to awesome-mcp-servers.
- A Pinecone project and its API key (3.6). Done: the live contract ran on real indexes of both kinds; CI uses an in-memory Pinecone, so no repository secret.
- The first publish of the starter package and its trusted publisher (3.6).
- Template gallery submissions (after 3.6).

## 4. Risks

- **The guard numbers may look weak.** That is expected for pattern matching, and publishing them is the point; the detector contract is the answer in the same release.
- **Async detectors** touch the guards' API (section 2.1); the sync path must stay for existing callers, or it becomes a breaking change.
- **Pinecone without an emulator:** if no CI secret is set, the retriever ships with mocked tests only, which is weaker than pgvector and Qdrant; the docs would say so.
- **Starters go stale** quickly; without per-template CI and Dependabot they will break within weeks.

## 5. Decisions (agreed 2026-11-04)

The maintainer agreed to every recommendation below.

1. **Split 3.5 and 3.6 as above, or all six in 3.5?** Recommended: split, so 3.5 isn't held by account and publishing steps.
2. **Publish the guardrail numbers whatever they show?** Recommended: yes.
3. **Pinecone:** test against a real (free tier) Pinecone project with a CI secret, or ship with mocked tests only? Recommended: a real project.
4. **Starter package name:** `create-rag-pipeline` (`npm create rag-pipeline`) or the scoped fallback? Recommended: the unscoped name, if it is still free.
