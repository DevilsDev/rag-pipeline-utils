# Bug hunt findings (3.9 cycle)

The six hunts in [bug-hunt-plan.md](bug-hunt-plan.md), run on 2026-11-06
against commit 53ca1f3 (3.8.0 plus the unreleased condition check). A bug
counts only once a deterministic, offline test reproduces it. The tests are
in `__tests__/bug-hunt/`, are left out of `npm test`, and run with
`npm run test:bug-hunt`; each fails until its bug is fixed. Nothing was
fixed in this pass.

Severity order: security, wrong result, crash, docs drift, cosmetic.
Security findings are recorded privately, not in this file; they are not
listed or described here.

## Summary

| ID    | Severity     | Hunt | Finding                                                                           | Test                                                                    |
| ----- | ------------ | ---- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| BH-1  | wrong result | 3    | Zero-width characters in a source split its words                                 | `__tests__/bug-hunt/metamorphic.test.js` (text normalisation)           |
| BH-2  | wrong result | 3    | Full-width digits in a source don't match ASCII digits                            | `__tests__/bug-hunt/metamorphic.test.js` (text normalisation)           |
| BH-3  | wrong result | 3    | No space after a period merges two sentences                                      | `__tests__/bug-hunt/metamorphic.test.js` (sentence splitter)            |
| BH-4  | wrong result | 3    | List lines without final punctuation merge into one sentence                      | `__tests__/bug-hunt/metamorphic.test.js` (sentence splitter)            |
| BH-5  | wrong result | 3    | "a.m." and "p.m." end a sentence                                                  | `__tests__/bug-hunt/metamorphic.test.js` (sentence splitter)            |
| BH-6  | wrong result | 3    | NBSP instead of spaces in a source loses one dropped-condition catch              | `__tests__/bug-hunt/metamorphic.test.js` (text normalisation)           |
| BH-7  | wrong result | 3    | Duplicating a source, or adding an unrelated one, flips borderline verdicts       | `__tests__/bug-hunt/metamorphic.test.js` (sources that support nothing) |
| BH-8  | wrong result | 4    | `packContext` drops the top document when the budget is smaller than its wrapper  | `__tests__/bug-hunt/docs-claims.test.js`                                |
| BH-9  | docs drift   | 4    | `checkNumericConsistency` examples show the wrong output                          | `__tests__/bug-hunt/docs-claims.test.js`                                |
| BH-10 | docs drift   | 4    | Usage.md says the pipeline has only `run` and `cleanup`; it also has `cacheStats` | `__tests__/bug-hunt/docs-claims.test.js`                                |
| BH-11 | docs drift   | 6    | Docs say the PII check finds "phone numbers"; it finds US 10-digit numbers only   | `__tests__/bug-hunt/docs-claims.test.js`                                |
| BH-12 | wrong result | 4    | `FileVectorStore` accepts a wrong-length query vector and scores every document 0 | `__tests__/bug-hunt/docs-claims.test.js`                                |

## Wrong results

### BH-1. Zero-width characters split words (395 of 399 sets changed)

- **What happens:** a zero-width space (U+200B) or joiner inside a source
  word makes it two tokens, so the source no longer supports sentences that
  quote it.
- **Root cause:** `tokenize()` in `src/evaluate/scoring.js` treats every
  character that isn't a letter or digit as a separator, and U+200B is
  neither. The injection detector strips these characters; claim support
  does not.
- **Suggested fix:** remove format characters (`\p{Cf}`) before tokenising
  and before the numeric, polarity and condition checks.

### BH-2. Full-width digits don't match (368 of 399)

- **What happens:** "２０ days" in a source doesn't support "20 days" in the
  answer, and a full-width number in the source counts as missing.
- **Root cause:** no Unicode normalisation; the numeric check reads ASCII
  digits.
- **Suggested fix:** NFKC-normalise the answer and sources once, at the
  start of claim support.

### BH-3. No space after a period (103 of 399)

- **What happens:** "Remote work is allowed two days per week.Approval is
  required." is one sentence, so the closest source sentence, and the
  numeric, polarity and condition checks that read it, see both statements.
- **Root cause:** `splitSentences()` splits only at `[.!?]` followed by
  whitespace.
- **Suggested fix:** also split at `[.!?]` followed directly by a capital
  letter when the period follows a lowercase word of two or more letters
  (so "U.S.A" and "e.g." are kept), with tests for decimals, initials and
  URLs. The condition check already splits there when it picks the source
  sentence (the Phase D follow-up, after the hunt); `splitSentences()`,
  which the rest of claim support uses, still does not.

### BH-4. List lines without punctuation merge (105 of 399)

- **What happens:** a source written as a list (`- Item one` on each line,
  no full stops) is one sentence.
- **Root cause:** `splitSentences()` doesn't split at line breaks.
- **Suggested fix:** treat a line break as a sentence boundary (or a line
  that starts with a list marker).

### BH-5. "a.m." and "p.m." end a sentence

- **What happens:** "The office opens at 10:00 a.m. and closes at 3:00
  p.m." splits after "a.m.", so "and closes at 3:00 p.m." is checked as a
  sentence of its own.
- **Root cause:** `splitSentences()` splits after any period followed by
  whitespace, whatever comes next.
- **Also seen:** it hid a bug while the condition fix was being written: a
  dev case with "9 a.m." in its source passed on the old code only because
  the split after "a.m." separated the two sentences; the case was
  reworded without the abbreviation.
- **Suggested fix:** don't split when the next word starts lowercase, or
  keep a short list of abbreviations (a.m., p.m., e.g., i.e., approx.,
  U.S.).

### BH-6. NBSP loses a dropped-condition catch (1 of 399)

- **What happens:** with NBSP in place of spaces, "After week 8, withdrawal
  is also permitted." is grounded against a source that permits it "only
  with written approval from the Dean of Students"; with ordinary spaces
  it is flagged.
- **Root cause:** not traced. JavaScript's `\s` matches NBSP, so the
  marker and boundary regexes are not the cause; a pattern with a literal
  space in the number or condition parsing is the likely one.
- **Suggested fix:** replace NBSP and other Unicode spaces with a plain
  space during the normalisation for BH-1 and BH-2.

### BH-7. Unrelated sources change verdicts (7 cases)

- **What happens:** adding a copy of a source (3 of 399) or an unrelated
  sentence (4 of 399) flips sentence verdicts. In one case it hides a
  negation ("New hires ... from their very first day").
- **Root cause:** term weights (IDF) are computed over the sources passed
  in, so a source that supports nothing still moves borderline scores past
  the threshold.
- **Suggested fix:** compute weights from a fixed reference, or per
  sentence against the source being compared; at least, document that
  scores depend on the whole source set.

### BH-8. `packContext` drops the top document with a small budget

- **What happens:** `packContext([{ id: "a", content: long }], { maxTokens: 10 })`
  returns `kept: []`, `dropped: ["a"]`. API-Reference.md says the top
  document is always included, cut at a word boundary, "so a small budget
  never leaves the model with no context". The same happens with
  `countTokens: (t) => t.length` and a 20-token budget.
- **Root cause:** `src/core/context-packing.js` (lines 106-128) cuts the
  top document to `maxTokens` minus the `<document index="n">` wrapper's
  cost; when what is left can't hold the first word, `cutToFit` returns an
  empty string and the document goes to `dropped`.
- **Suggested fix:** keep at least the first words of the top document
  whatever the budget (and report it in `truncated`), or document the
  minimum budget.

### BH-12. `FileVectorStore` doesn't check the query dimension

- **What happens:** after `store([{ id: "1", content: "a", vector: [1, 0, 0] }])`,
  `retrieve({ queryVector: [1, 0] })` resolves with every document at
  score 0, so retrieval returns arbitrary documents instead of failing.
  Plugins.md and Troubleshooting.md say `MemoryRetriever` and
  `FileVectorStore` reject query vectors of the wrong length;
  `MemoryRetriever` does.
- **Root cause:** `FileVectorStore.retrieve()`
  (`src/retrieval/file-vector-store.js`, line 178) compares the query
  with the embedder info recorded by `setEmbedderInfo()`, which the CLI's
  ingest sets and `store()` does not; with no info recorded there is no
  check.
- **Suggested fix:** record the vector dimension in `store()` (or read it
  from the stored vectors) and reject a query of another length, as
  `MemoryRetriever` does.

## Docs drift

### BH-9. `checkNumericConsistency` examples

- **What happens:** API-Reference.md (lines 449-460) and Evaluation.md
  (lines 173-177) show `claimNumbers: ["20"]` and `missing: ["45"]`; the
  code returns unit-tagged values (`"duration:20 day"`) and an extra
  `matchedWords` field, which the signature doesn't list.
- **Suggested fix:** update the examples and the signature (docs only).

### BH-10. Pipeline methods

- **What happens:** Usage.md (lines 56 and 160) says `createRagPipeline`
  returns `{ run, cleanup }` and "only exposes `run()` and `cleanup()`";
  it also returns `cacheStats()`, documented in Caching.md.
- **Suggested fix:** mention `cacheStats()` in Usage.md.

### BH-11. "Phone numbers"

- **What happens:** Concepts-Guardrails.md, Security.md,
  Security-Capabilities.md, Testing.md and Integrations.md say the built-in
  PII check finds "phone numbers". The pattern
  (`src/guardrails/detectors.js`) matches US-style 10-digit numbers only:
  0 of 15 international numbers (+64, +61, +44, +49, +81, +91) were found.
- **Suggested fix:** say "US-format phone numbers", like "US SSNs", or add
  an international pattern.

## Per hunt

### Hunt 1: ACL (claude-sonnet-5-5 corpora, offline checks), US$0.35

30 multi-tenant corpora, 48,600 retrieval checks: 0 violations. Results:
`benchmarks/results/bug-hunt-acl.json`.

### Hunt 2: security review (claude-opus-5-5), US$0.64

8 leads; all 8 reproduced with offline scripts, 0 discarded. Recorded
privately; not described here.

### Hunt 3: metamorphic (claude-sonnet-5-5 sets), US$1.97

399 sets (100 grounded, 100 wrong number, 100 negated, 99 dropped
condition). Changed verdicts per transform:

| Transform                                                                                     | Changed    |
| --------------------------------------------------------------------------------------------- | ---------- |
| zero-width characters in sources                                                              | 395/399    |
| full-width digits in sources                                                                  | 368/399    |
| list items without final punctuation                                                          | 105/399    |
| no space after a period                                                                       | 103/399    |
| split a source at a sentence boundary                                                         | 78/399     |
| add an unrelated source                                                                       | 4/399      |
| duplicate a source                                                                            | 3/399      |
| NBSP in sources                                                                               | 1/399      |
| shuffle sources, curly or straight quotes, CRLF, trailing whitespace, abbreviations, decimals | 0/399 each |
| sources as `{ id, content }`, changed ids, LangChain, LlamaIndex node, `{ node, score }`      | 0/399 each |

Every entry point (main by require and import, `/edge`,
`@devilsdev/rag-eval`) agreed on all 399 sets. Splitting a source in two
(78) is the documented limitation that claims combining two sources are not
grounded, not a bug. The abbreviation transform inserted "U.S.", "e.g." and
"approx." without changing a verdict; BH-5 comes from the sources' own
"a.m." and "p.m.". Results: `benchmarks/results/bug-hunt-metamorphic.json`.

### Hunt 4: docs claims (claude-sonnet-5-5 tests), US$2.46

483 claims from 40 docs pages and the README; 415 passed and 68 failed.
Concepts-Core.md's 12 tests first didn't run (a generated test called the
asynchronous `pluginRegistry.register()` without `await`, and the unhandled
rejection ended the worker); with that one test awaited, the page ran alone:
11 passed, 1 failed. Every failure was checked against the docs and the code
(a per-failure list is kept with the generated tests). 7 failures are the
bugs above (BH-8: 2, BH-9: 3, BH-10: 1, BH-12: 1). The other 61 are
mistakes in the generated tests, for example: methods that don't exist (`guard.process`), the wrong return shape
of `createTestPipeline`, plain strings passed to `computeFaithfulness` (it
takes `{ content }` documents), `retrieve()` called with a bare vector,
`FileVectorStore` expected to write without `save()` (documented in
API-Reference.md), `src/edge.js` compared with the main entry (the docs
mean the built `/edge` bundle), and a custom stream with no `{ done }` chunk
(the plugin contract requires one).

| Page                             | Claims | Passed | Failed |
| -------------------------------- | ------ | ------ | ------ |
| README.md                        | 12     | 12     | 0      |
| API-Reference.md                 | 36     | 32     | 4      |
| Architecture.md                  | 12     | 12     | 0      |
| Benchmarks.md                    | 12     | 6      | 6      |
| CLI.md                           | 12     | 7      | 5      |
| Caching.md                       | 12     | 9      | 3      |
| Comparison.md                    | 12     | 10     | 2      |
| Concepts-Connectors.md           | 25     | 23     | 2      |
| Concepts-Core.md                 | 12     | 11     | 1      |
| Concepts-Evaluation.md           | 12     | 11     | 1      |
| Concepts-Guardrails.md           | 12     | 12     | 0      |
| Config-Builder.mdx               | 3      | 3      | 0      |
| Deployment-AWS.md                | 7      | 7      | 0      |
| Deployment-Azure.md              | 5      | 4      | 1      |
| Deployment-Cloudflare-Workers.md | 12     | 9      | 3      |
| Deployment-Docker.md             | 3      | 3      | 0      |
| Deployment-Edge.md               | 12     | 10     | 2      |
| Deployment-GCP.md                | 7      | 6      | 1      |
| Deployment-Kubernetes.md         | 3      | 3      | 0      |
| Enterprise.md                    | 12     | 7      | 5      |
| Evaluation.md                    | 22     | 20     | 2      |
| Examples.md                      | 12     | 9      | 3      |
| Experimental.md                  | 9      | 9      | 0      |
| FAQ.md                           | 12     | 11     | 1      |
| Integrations.md                  | 12     | 11     | 1      |
| Introduction.md                  | 12     | 11     | 1      |
| Migration-LlamaIndex.md          | 12     | 12     | 0      |
| Migration.md                     | 12     | 11     | 1      |
| Observability.md                 | 12     | 9      | 3      |
| Packages.md                      | 11     | 11     | 0      |
| Performance.md                   | 12     | 12     | 0      |
| Plugins.md                       | 12     | 11     | 1      |
| Security-Capabilities.md         | 12     | 4      | 8      |
| Security.md                      | 12     | 11     | 1      |
| Starter-Templates.md             | 8      | 4      | 4      |
| Testing-RAG-TypeScript.md        | 12     | 12     | 0      |
| Testing.md                       | 18     | 18     | 0      |
| Troubleshooting.md               | 12     | 9      | 3      |
| Tutorials.md                     | 5      | 5      | 0      |
| Usage.md                         | 12     | 10     | 2      |
| Use-Cases.md                     | 9      | 8      | 1      |

The generated tests are kept out of the repository (they are scratch
output); the confirmed bugs are restated as tests in
`__tests__/bug-hunt/docs-claims.test.js`.

### Hunt 5: live end to end (claude-haiku-5-5, claude-sonnet-5-5), about US$0.002

No bugs. `run()` and the stream give the same answer, citations and
evaluation; the final chunk carries citations, evaluation and timing
(`firstTokenMs` 599 ms); abort and timeout work; the router picks the
cheapest model; `verifyCitations` marks 4 of 4 citations supported.
Temperature retry: `claude-sonnet-5-5` and `claude-haiku-5-5` reject
`temperature`, and `AnthropicConnector` pays one failed request per model
per process (about +1.5 s on the first Sonnet call, +0.4 s on Haiku), then
remembers it; later calls make one request. Not a per-call cost, so not a
finding; pre-seeding the models known to reject `temperature` would remove
the first failed request. Observations, not bugs: the stream's done chunk
has no `results` (documented); `CostTracker` estimates about 20% under the
billed tokens, and `packContext`'s default count about 21% under Haiku
5.5's tokenizer (documented as an estimate; pass `countTokens` for exact
counts). Results: `benchmarks/results/bug-hunt-live.json`.

### Hunt 6: adversarial guardrails (claude-sonnet-5-5 cases), US$0.17

210 cases: 12 categories of 15 and 15 pairs split across two chunks; the base64 category
returned no usable cases (the model's JSON was cut off). Built-in pattern
detectors, by category (TP / FN, or FP / TN for look-alikes):

| Category                       | Caught     | Missed  | Notes                                                   |
| ------------------------------ | ---------- | ------- | ------------------------------------------------------- |
| injection: homoglyphs          | 8          | 7       | homoglyph folding works; the 7 use wording with no rule |
| injection: HTML comment        | 1          | 14      | wording with no rule                                    |
| injection: markdown link       | 0          | 15      | wording with no rule                                    |
| injection: other language      | 0          | 15      | English rules only                                      |
| injection: split across chunks | 2/15 pairs | 13      | neither chunk alone matches a rule                      |
| PII: email with +tag           | 15         | 0       |                                                         |
| PII: IBAN                      | 4          | 11      | no IBAN pattern; the 4 hits are the card pattern        |
| PII: AU tax file number        | 1          | 14      | no pattern; the 1 hit is an email in the text           |
| PII: NZ IRD, UK NI             | 0          | 15 each | no pattern                                              |
| PII: international phone       | 0          | 15      | BH-11                                                   |
| look-alike: security training  | 7 FP       | 8 TN    | quoted attack phrases match the rules                   |
| look-alike: order number       | 15 FP      | 0 TN    | 16-digit order numbers match the card pattern           |

The misses are the documented limits of pattern rules (Concepts-Guardrails:
"they miss what they don't have a rule for"; Benchmarks: card and phone
patterns "match long digit runs"), so they aren't counted as bugs, except
BH-11, where the docs claim more than the pattern does. A card pattern with
a Luhn check would clear 13 of the 15 order-number false alarms (2 happen to pass it).
Results: `benchmarks/results/bug-hunt-guardrails.json` and `.md`; cases:
`benchmarks/fixtures/bug-hunt-guardrail-cases.jsonl`.
