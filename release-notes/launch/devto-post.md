---
title: "I relicensed my RAG framework from GPL-3.0 to MIT — and what the review told me next"
published: false
description: Why GPL was killing adoption of my Node.js RAG library, what the community review uncovered, and the supply-chain hardening I did along the way (OIDC trusted publishing + SLSA provenance).
tags: node, ai, opensource, rag
series:
canonical_url:
---

# I relicensed my RAG framework from GPL-3.0 to MIT — and what the review told me next

Three weeks ago I pushed `@devilsdev/rag-pipeline-utils@2.3.1` and kept building. Last week I shipped `2.4.5`, published through GitHub Actions OIDC with SLSA provenance, licensed MIT, with a completely rewritten README and five new docs pages.

None of that was on my roadmap. I submitted the package for community review and got back two detailed reviews that, politely, told me my positioning was hurting adoption. This is what happened next.

## The package

`@devilsdev/rag-pipeline-utils` is a Node.js framework for building Retrieval-Augmented Generation pipelines. Three primitives — `pipeline`, `plugin`, `connector` — with optional layers for citations, evaluation, guardrails, agentic reasoning, and GraphRAG.

The value prop I thought I was selling: "comprehensive enterprise-grade toolkit with 104 exports and 2,050+ tests."

The value prop the reviewers heard: "overengineered utility library with no clear buyer."

## The reviews

Two independent reviews came back with significant overlap. The five biggest hits:

### 1. The GPL-3.0 license was killing adoption

> _"The moment I saw GPL-3.0 my commercial evaluation stopped. You don't want that."_

GPL has strong copyleft. Any product that links against a GPL library must itself be released under a GPL-compatible license if distributed. That's a conversation most engineering leads don't want to have with their legal team for a supporting library. The chill on adoption is silent — nobody tells you "I chose LangChain because your license scared my lawyer."

Every comparable tool in this space (LangChain.js, LlamaIndex.TS, Vercel AI SDK) ships MIT. I was the outlier, and I didn't gain anything from being the outlier.

**Fix**: Relicense to MIT. Full LICENSE rewrite, badge change, package.json update, one commit.

### 2. "Utils" framing undersold the scope

> _"The name says toolkit. The code ships a pipeline framework, GraphRAG, and 3-layer guardrails. Stop underselling."_

My README led with export counts and lists of capabilities. The reviewers pointed out that this is vendor-brochure thinking, not developer thinking. What does it do? Why should I care in the first 30 seconds?

**Fix**: Rewrite the headline.

- Before: _"The complete Node.js toolkit for production-grade RAG."_
- After: _"Composable RAG for Node.js — with built-in evaluation, citations, guardrails, and observability."_

The new framing leads with three core primitives (`pipeline`, `plugin`, `connector`) and positions the advanced features as layers you opt into when you need them. Concrete > comprehensive.

### 3. The docs had unverified performance claims

> _"<200ms retrieval latency — against what corpus? What provider? On what hardware? Delete or prove."_

Retrieval latency in a RAG pipeline is dominated by factors the framework doesn't control: the embedding model, the vector store, the LLM provider, the region, the corpus size. Publishing a number without the full stack is marketing, not engineering. Reviewers called it out and I deserved it.

**Fix**: Delete the claims. Replace with a [BENCHMARKS.md](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/BENCHMARKS.md) that ships a methodology, a report schema, an environment disclosure template, and an end-to-end harness template. No headline numbers. Anyone who wants a number generates it themselves on their stack.

### 4. ESM/CJS inconsistency

Some docs used ESM `import`, others used CJS `require()`. The package exports both, but the docs-site homepage still led with `require()` while the README used `import`. That's a signal that the project doesn't know what its primary module system is.

**Fix**: ESM everywhere in documentation. CJS still works (dual-build via `package.json#exports`) but docs lead with `import`.

### 5. No stated stability policy, no security-capability matrix

Enterprise reviewers expect to see:

- A SEMVER policy defining what counts as breaking and how long deprecations run
- A security capability matrix distinguishing "implemented and battle-tested" from "recommended practice" from "example code that needs hardening"
- A responsible-disclosure process (not the same as a security policy!)

I had none of these.

**Fix**: Wrote all three.

- [SEMVER.md](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md) — public API stability contract, minimum one-minor deprecation window
- [SECURITY.md](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SECURITY.md) — triage SLAs, safe-harbor, supported versions
- [Security Capabilities matrix](https://devilsdev.github.io/rag-pipeline-utils/docs/Security-Capabilities) — 🟢 implemented / 🟡 recommended / 🟠 example / 🔴 not in scope across 6 categories

## The bonus round: OIDC trusted publishing

Since I was already in the supply-chain headspace, I killed the `NPM_TOKEN` ritual for good.

Old flow: generate token on npmjs.com → paste in `.npmrc` → `npm publish` → scrub `.npmrc` → revoke token. Every release. Tokens drift into chat histories and Slack DMs.

New flow: `gh release create v2.4.5 ...` → GitHub Actions obtains a short-lived OIDC token from its identity provider → npm accepts it because this repo + workflow + environment is configured as a Trusted Publisher → tarball ships with SLSA provenance attached.

```bash
npm audit signatures @devilsdev/rag-pipeline-utils
# 7 packages have verified attestations
```

The provenance attestation cryptographically binds the published bytes to:

- The git repository (`DevilsDev/rag-pipeline-utils`)
- The workflow file (`.github/workflows/release.yml`)
- The commit SHA
- The runner environment

After the first OIDC release verified successfully, I deleted the `NPM_TOKEN` repository secret. No long-lived credential exists anywhere for this repo anymore.

The setup is roughly 20 minutes, one-time:

1. GitHub Actions workflow with `permissions: id-token: write` and `environment: npm`
2. npm CLI 11.5.1+ in the workflow (Node 22 ships older, `npm install -g npm@11.5.1` at job start)
3. `npm publish --access public --provenance`
4. Configure Trusted Publisher on the npm package settings page
5. Create a `npm` environment in the GitHub repo settings

The [release.yml](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/.github/workflows/release.yml) is ~80 lines and has a commented header explaining each step.

## What actually changed in the numbers

| Metric                             | Before (2.3.1)       | After (2.4.5)                          |
| ---------------------------------- | -------------------- | -------------------------------------- |
| License                            | GPL-3.0              | MIT                                    |
| README length                      | 15,972 chars         | 8,067 chars                            |
| Unverified performance claims      | 4                    | 0                                      |
| Stability policy                   | None                 | SEMVER.md published                    |
| Security disclosure policy         | None                 | SECURITY.md published                  |
| Security capability matrix         | None                 | 6-category scorecard                   |
| Benchmarks methodology             | None                 | BENCHMARKS.md + E2E harness            |
| Comparison vs LangChain/LlamaIndex | None                 | Published, honest                      |
| Runnable demo                      | None                 | Fastify + Docker + Fly/Railway configs |
| Publish auth                       | Long-lived NPM_TOKEN | OIDC, no standing credential           |
| Tarball provenance                 | None                 | SLSA v1, verifiable                    |

## The meta-lesson

The reviewers were right about everything.

I had been optimizing for "completeness of feature list" when I should have been optimizing for "time from package-page-visit to first successful pipeline run." Every piece of friction I defended — the license, the "utils" framing, the export-counting, the unverified stats — was visible to anyone evaluating the project and invisible to me.

The cost to fix all of it was real but bounded: about 15 hours of focused work across a week. The cost of _not_ fixing it was unknowable but permanent — every serious reviewer who walked away without opening an issue.

If you're maintaining an open-source library and haven't done a cold-read review in a while, do one. You'll find at least one thing on this list.

---

**Links**

- Package: [@devilsdev/rag-pipeline-utils](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils) on npm
- Source: [DevilsDev/rag-pipeline-utils](https://github.com/DevilsDev/rag-pipeline-utils) on GitHub
- Docs: [devilsdev.github.io/rag-pipeline-utils](https://devilsdev.github.io/rag-pipeline-utils/)
- Runnable demo: [`examples/fastify-rag-demo`](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples/fastify-rag-demo)

Feedback always welcome. If you're doing a similar cleanup, drop what you learned in the comments.
