# Security Policy

Thank you for helping keep `@devilsdev/rag-pipeline-utils` and its users safe.

## Supported Versions

Only the latest minor release line receives security patches. When a new
minor version ships, the previous line receives one more patch window of
30 days before support ends.

| Version | Supported          |
| ------- | ------------------ |
| 2.4.x   | :white_check_mark: |
| 2.3.x   | :x:                |
| < 2.3   | :x:                |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately via one of the following channels:

1. **GitHub private vulnerability reporting** (preferred) —
   https://github.com/DevilsDev/rag-pipeline-utils/security/advisories/new
2. **Email** — open a draft security advisory on GitHub and tag
   @DevilsDev maintainers; we'll respond within 72 hours.

Include, at minimum:

- A clear description of the issue and its potential impact
- Reproduction steps or a minimal proof-of-concept
- The affected version(s) and runtime environment (Node.js version, OS)
- Any suggested remediation if you have one

## What to Expect

| Stage                                         | Target turnaround                     |
| --------------------------------------------- | ------------------------------------- |
| Initial acknowledgement                       | 72 hours                              |
| Triage + severity rating                      | 7 days                                |
| Patch release (for confirmed critical / high) | 14 days                               |
| Public disclosure                             | Coordinated with reporter after patch |

Confirmed vulnerabilities receive a CVE via GitHub Security Advisories and
are credited in the release notes unless the reporter requests otherwise.

## Scope

In scope:

- Source code in `src/`
- Published npm artifacts (`dist/`)
- Default plugin implementations (retrievers, embedders, LLM connectors,
  rerankers, loaders)
- CLI (`bin/cli.js`)

Out of scope:

- Third-party dependencies — report upstream; we track via Dependabot
- Example/demo code in `docs-site/`
- Issues that require the attacker to already have full control of the
  host environment running the pipeline

## Hardening Practices

This project applies the following controls to reduce supply-chain risk:

- **Pinned GitHub Actions** by commit SHA in all workflows
- **Dependabot** alerts on the default branch with automatic PRs for
  patch-level bumps
- **npm audit** runs on every CI build (`--omit=dev`, fails on high+)
- **License allowlist** enforced for all runtime dependencies
- **SBOM generation** (`npm run sbom`) for release provenance
- **2FA-gated publishing** to npm via granular, scoped tokens

## Safe Harbor

Good-faith security research conducted under this policy is welcomed and
will not be pursued legally. Please give us a reasonable window to
remediate before any public disclosure.
