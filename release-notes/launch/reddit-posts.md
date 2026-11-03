# Reddit post drafts

Updated for 3.3.0 (2026-11-04). Different subs want different tones; same facts, different framing. Check each sub's self-promotion rules before posting (several require a 9:1 ratio of other activity or a specific flair or weekly thread).

---

## r/node

**Title**:

> I put RAG answer quality in CI for my Node.js project — eval, grounding checks and offline test doubles (MIT)

**Body**:

```
I maintain @devilsdev/rag-pipeline-utils, a RAG library for Node.js. 3.3
came out this week, and the thing I most want feedback on is how it tests
RAG, because that's where my own project was weakest.

My unit tests were green, but on a public benchmark (BEIR SciFact) the
offline retriever scored 0.12 nDCG@10. The TF-IDF embedder kept the rarest
words once the vocabulary hit its limit, so most queries embedded to
zeros. Fixed, it's 0.47. No unit test could see it.

So the library is built around catching that kind of drift:

* `rag-pipeline eval tests.json --baseline main.json` fails CI when
  faithfulness, relevance or retrieval get worse than main. A GitHub Action
  posts the comparison on each PR.
* `/testing` has a deterministic embedder and an LLM double that records
  its calls, so tests need no network or keys.
* `runContractTests("retriever", () => new MyRetriever())` tests your own
  plugin against what the pipeline relies on (Jest/Vitest/Mocha/node:test).
* `checkAnswer()` checks answers from LangChain, LlamaIndex, Mastra or the
  AI SDK against their sources, if you don't want to switch.
* New in 3.3: `expect(result).toBeGroundedIn()` matchers for Jest and
  Vitest, and middleware that adds all of this to any AI SDK model.

Also in 3.2: four sub-packages (eval alone is ~6 MB; full install 48 -> 33
MB), per-query model routing by estimated cost, OpenTelemetry spans, time
to first token, Cloudflare Workers support tested in workerd.

npm: https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils
repo: https://github.com/DevilsDev/rag-pipeline-utils
write-up: <dev.to link>

How do you test RAG or LLM features in your Node services today?
```

**Flair**: whichever project / show-and-tell flair r/node uses

**Best time**: Tuesday–Thursday 09:00–11:00 Pacific

---

## r/LocalLLaMA

**Title**:

> Node.js RAG library that runs fully offline (TF-IDF + Ollama) and scores its own answers — v3.3, MIT

**Body**:

```
For the Node-leaning folks: @devilsdev/rag-pipeline-utils 3.3.

Local-first bits:

* Runs with no cloud at all: an offline TF-IDF embedder, a persistent
  local index, and the Ollama connector for generation (embeddings via
  Ollama too).
* `npx rag-pipeline init --template ollama`, `ingest docs/`, `query "..."`
  and `serve` from the CLI.
* Every answer comes back with sentence-level citations and a groundedness
  score, including a check that numbers in the answer appear in the
  sources, which catches a lot of small-model hallucination.
* `rag-pipeline eval` scores a question set so you can compare two local
  models (or quantisations) on your own documents instead of vibes.
* Retrieval numbers on BEIR SciFact, with the method:
  https://devilsdev.github.io/rag-pipeline-utils/docs/Benchmarks
  (BM25 matches the published 0.665; the offline TF-IDF embedder is 0.47,
  fine for tests and air-gapped use, not a replacement for a real embedder.)
* pgvector and Qdrant stores when you outgrow the local index.

repo: https://github.com/DevilsDev/rag-pipeline-utils

What local embedding models are people pairing with Ollama for RAG these
days?
```

**Flair**: Resources / Project

**Best time**: weekends are active; Saturday afternoon UTC is a decent window.

---

## r/LLMDevs

**Title**:

> How I catch RAG quality regressions in CI: baselines from main, grounding checks, and per-PR comments

**Body**:

```
Sharing the approach (and the library) I use to stop RAG answers from
silently getting worse when someone changes a prompt, chunk size, model
or embedder.

1. A question set in JSON: { prompt, expected, sourceIds }. A generator
   drafts one from your documents; you review it.
2. On main: score it and save the report as the baseline.
3. On every PR: score again and fail if any metric's mean drops more than
   a tolerance, listing the individual cases that got worse.
4. Metrics: faithfulness (answer sentences supported by retrieved text,
   computed from the text, not an LLM judge), relevance, context
   precision/recall, and whether the expected documents were retrieved.
5. A GitHub Action posts the comparison as a PR comment.

It's part of @devilsdev/rag-pipeline-utils (Node.js, MIT). If you're on
another framework, `@devilsdev/rag-eval` and checkAnswer() work on its
outputs without switching.

What made me take this seriously: the library's own embedder scored 0.12
nDCG@10 on BEIR SciFact with every unit test green.

repo: https://github.com/DevilsDev/rag-pipeline-utils
eval docs: https://devilsdev.github.io/rag-pipeline-utils/docs/Evaluation
write-up: <dev.to link>

What are you using for regression testing: offline sets in CI, sampled
production traffic with an LLM judge, or user feedback?
```

**Flair**: Discussion / Project

**Best time**: weekday evenings UTC.

---

## General posting notes

1. **Space the posts across a week.** Posting all three at once looks like spam.
2. **Answer every top-level comment in the first two hours.**
3. **Link specific code when asked**, not just the repo: `src/evaluate/faithfulness.js`, `src/citation/`, `src/guardrails/injection-detector.js`.
4. **Be precise about limits.** Injection detection is pattern-based; faithfulness is lexical support, not entailment, so it misses paraphrases (negation is checked since 3.3). Saying so up front earns more trust than defending it later.
5. **Skip meta-debates** (RAG is dead, agents are the future). Answer substantively and move on.
