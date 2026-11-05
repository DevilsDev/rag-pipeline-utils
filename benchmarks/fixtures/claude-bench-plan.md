# Claude benchmarks: second round (pre-registered)

Committed before any of the runs below. Every number these runs produce goes
on the Benchmarks page, whatever it shows. Nothing in `src/` is tuned on these
cases; the library runs as shipped (the 3.5.0 code on `main`). Models:
`claude-haiku-4-5-20251001`, `claude-haiku-5-5`, `claude-sonnet-5-5`,
`claude-opus-5-5`, `claude-fable-5-1`. Spend stops at US$88 in total
(everything since the first run included).

## 1. RAGTruth, full test split

- All test answers annotated as good quality (the 25 refusals and truncated
  answers excluded, as before): n is recorded in the report.
- Lexical, Haiku 5.5, Haiku 4.5 and Sonnet 5.5 on all of them; Opus 5.5 and
  Fable 5.1 stay on the 450-answer sample (seed 20261105), and all five are
  also reported on that sample.
- Per-task rows (QA, Summary, Data2txt) for the full split.

## 2. Run-to-run variance

- Subset: 300 answers from the 450-answer sample, 50 per task and label,
  seed 20261106 (first 50 of a seeded shuffle of each of the six groups).
- Haiku 5.5 and Sonnet 5.5, three runs each: run 1 is the cached first run;
  runs 2 and 3 carry a run index in the cache key, so they are new calls.
- Reported: each run's precision, recall and F1, min/max/mean F1, and how
  many answer verdicts and sentence verdicts changed between runs.

## 3. HaluEval (qa)

- `pminervini/HaluEval`, config `qa`, revision
  `12a856119f03975a94509091e8cada3e6be6ead7`, file
  `qa/data-00000-of-00001.parquet`, SHA-256
  `1b7118e6dcc3881e5fc87b77b48d9334f0a24d51073ea9dc05baf5a74814580f`;
  Apache-2.0 on the card (upstream RUCAIBox/HaluEval is MIT). Used, not
  redistributed.
- 500 cases, seed 20261107: a seeded shuffle of the 10,000 rows; the first
  250 rows give their `right_answer` (label supported), the next 250 their
  `hallucinated_answer` (label unsupported). Source: the row's `knowledge`;
  the question is passed as `question`.
- Lexical, Haiku 5.5, Haiku 4.5 and Sonnet 5.5.

## 4. Citations, more claims

- SciFact claims: the same seeded shuffle (seed 20261105), first 150 for
  Haiku 4.5, Haiku 5.5 and Sonnet 5.5, first 100 for Opus 5.5 and Fable 5.1.
  The first 50 are the ones already run. All five are also reported on the
  first 100.
- Hand review: every claim the lexical check marks unsupported, for every
  model (no sampling), with the committed criteria.
- Mutations on every claim the lexical check supports.

## 5. Edge cases, second batch

- `benchmarks/fixtures/judge-edge-cases-2.jsonl` and
  `benchmarks/fixtures/citation-edge-cases-2.json`, committed with this plan:
  at least 3 more cases per existing category, plus judge categories
  `table-or-list`, `quoted-speech`, `numeric-range`, `currency-percent`, and
  citation categories `calculation` and `other-language-document`.
- All five models. Reported per batch and combined.

## 6. Latency through the library

- 30 fixed queries: the first 30 SciFact claims of the seeded shuffle, asked
  as "What do the documents say about this claim: <claim>". Corpus: the
  abstracts selected for those claims (3 each), indexed with `LocalEmbedder`
  and `MemoryRetriever`; `createRagPipeline` with `AnthropicConnector`
  (default `maxTokens`), `topK: 3`, `stream: true`.
- Time to first token and total time from the pipeline's own `timing`, p50
  and p95 per model; one warm-up query per model, not counted. Live calls,
  never cached; their token usage is written to the cache folder as a ledger.
  One machine, one network, one date.
