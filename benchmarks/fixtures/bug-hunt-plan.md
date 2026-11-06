# Bug hunt (pre-registered)

Committed before any input is generated. Six hunts, in order. Models:
`claude-sonnet-5-5` generates inputs, `claude-haiku-5-5` runs bulk and live
checks, `claude-opus-5-5` only for hunt 2. No `claude-fable-5-1`. Every call
goes through `benchmarks/claude-cache.js` with `--cap`.

## Budget

REMAINING = $50 − $5 reserve − new spend since the BASELINE of $62.9264
(all-time, `npm run claude:usage`) = **$43.29** when this plan was written.
That is at least $26, so the per-hunt caps are as given:

| Hunt                           | Cap | Estimate | Basis of the estimate                                    |
| ------------------------------ | --- | -------- | -------------------------------------------------------- |
| 1. ACL and cache leakage       | $3  | $0.30    | 3 Sonnet batches of 10 corpora, ~1.5k in / 8k out each   |
| 2. Independent security review | $6  | $1.50    | ~6 Opus requests, ~25k in / 4k out each, plus follow-ups |
| 3. Metamorphic testing         | $2  | $1.00    | 16 Sonnet batches of 25 sets, ~1.5k in / 6k out each     |
| 4. Docs claims                 | $4  | $3.60    | ~45 pages, one Sonnet request each, ~10k in / 6k out     |
| 5. Live end-to-end             | $7  | $0.30    | Haiku 5.5 on a small corpus, a few hundred short calls   |
| 6. Adversarial guardrails      | $4  | $0.40    | ~6 Sonnet batches                                        |

A hunt whose estimate exceeds its cap stops and asks first. Hunt 4 is close
to its cap: it processes pages in order and stops at the cap, reporting the
pages it didn't reach.

## Rules

- **A bug counts only once a deterministic, offline, failing test
  reproduces it** (no API call to rerun it). Generated inputs are leads, not
  evidence.
- Each confirmed bug is triaged (security / wrong result / crash / docs
  drift / cosmetic), deduplicated and recorded in
  `benchmarks/fixtures/bug-hunt-findings.md` with its failing test, root
  cause and a suggested fix.
- **Nothing is fixed**, except trivial docs typos. Failing tests go in
  `__tests__/bug-hunt/`, which the default test run excludes, so the suite
  stays green.
- **Security findings** go only to the gitignored
  `benchmarks/.data/security-findings.md`: no public issue, commit message
  or committed file describes an exploit. Their failing tests are kept out
  of the repository too (in the same gitignored folder), so the maintainer
  can file a private advisory per SECURITY.md.
- Every number is reported, flattering or not, including leads that could
  not be reproduced and how many.

## Hunts

1. **ACL and cache leakage.** ~30 multi-tenant corpora (documents with ACL
   metadata; users with different `userPermissions`), then offline: every
   path (`createRagPipeline` run and stream, with and without each cache
   layer, `GuardrailsPipeline`, `groundingMiddleware`, `checkAnswer`, the
   CLI `query` and `serve` endpoints) with interleaved users on one shared
   `MemoryCache`. Assert no forbidden document appears in results,
   citations, packed context, the prompt sent to the LLM (a recording
   stub), or a cache hit served to another user.
2. **Independent security review.** `claude-opus-5-5` reads the plugin hub
   install and certify path, config set and load, `serve`,
   `packages/rag-mcp-server`, and the JWT/ACL code, with their direct
   imports only, and proposes concrete vulnerabilities with a
   proof-of-concept input (prototype pollution, path traversal, command
   injection, missing auth or size limits on HTTP, ReDoS, checksum or
   signature bypass). Each is kept only if a failing test reproduces it;
   the number discarded is reported.
3. **Metamorphic testing.** ~400 answer/source sets (grounded, wrong number,
   negated, dropped condition). Transforms that must not change per-sentence
   verdicts: shuffle sources; duplicate one; add an unrelated one; change
   ids; split a source at a sentence boundary; curly vs straight quotes,
   NBSP, CRLF, zero-width characters, full-width digits; trailing
   whitespace; sources as strings, `{ id, content }`, LangChain Documents and
   LlamaIndex nodes. Every set also through each entry point (require and
   import of the main package, `/edge`, and `@devilsdev/rag-eval` from
   `packages/`), asserting identical results.
4. **Docs claims.** For each docs-site page (not the generated `api/` pages)
   and the README, Sonnet extracts every checkable behavioural claim and
   writes an offline test for it with the `/testing` helpers. A failure is
   a code bug or a docs bug, and the report says which, with the claims
   checked per page.
5. **Live end-to-end.** `AnthropicConnector` with `claude-haiku-5-5` on a
   small corpus: run vs stream give the same citations, evaluation and
   sources for the same answer; the final stream chunk carries citations
   and evaluation; an abort mid-stream starts no later stage, and timeouts
   fire; CostTracker's cost equals the API's usage × the PRICES table;
   `timing.firstTokenMs` is set; `createModelRouter` picks the cheapest
   priced model per class; `packContext`'s token estimate against the
   token-counting endpoint (used only after confirming in Anthropic's docs
   that it isn't billed); `verifyCitations` on real Citations responses.
   Live results are leads; each bug still needs an offline failing test
   (from a recorded response).
6. **Adversarial guardrails.** Indirect prompt injections in retrieved
   documents (homoglyphs, base64, HTML comments, markdown links, other
   languages, split across two chunks); PII beyond the US formats (NZ IRD,
   Australian TFN, UK NI numbers, IBANs, international phone numbers,
   emails with +tags); harmless look-alikes (security docs that discuss
   injection, order numbers that resemble card numbers). Misses and false
   alarms per category, through the existing `eval-guardrails` reporting
   where possible.
