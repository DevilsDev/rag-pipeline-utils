# API Stability Policy

This document defines what counts as a breaking change for
`@devilsdev/rag-pipeline-utils`, how long each release line is
supported, and the deprecation process for public API surface.

It is the contract you can plan against.

## Versioning

We follow [Semantic Versioning 2.0](https://semver.org/spec/v2.0.0.html):

| Release           | When it lands                                                                 | What changes                                                                |
| ----------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Patch** (2.4.x) | Bug fixes, security patches, docs, internal refactors                         | Nothing public-facing breaks. Safe to adopt without reading release notes.  |
| **Minor** (2.x.0) | New features, additive API surface, new plugins, non-breaking behavior tweaks | Review the [CHANGELOG](CHANGELOG.md) before upgrading. Backward compatible. |
| **Major** (x.0.0) | Breaking changes to public API or required Node versions                      | Requires active migration. Each major ships with a migration guide.         |

Pre-release versions (`x.y.z-rc.N`, `-beta.N`, `-alpha.N`) are for
testing. They have no stability guarantees and may change or disappear
before general availability.

## Public API surface

The **public API surface** — everything covered by SemVer — is
everything reachable from the package entry point:

```js
import { ... } from "@devilsdev/rag-pipeline-utils";
```

Plus the CLI (`npx rag-pipeline …`) and the plugin contract schemas
in `contracts/`.

The following are **not** part of the public API surface and may
change in any release, including patches:

- Any import path with `/internal/` in it
- Default export behavior of submodules not documented in the
  [API reference](https://devilsdev.github.io/rag-pipeline-utils/docs/API-Reference)
- Imports reaching into `dist/` or `src/` directly (e.g.
  `@devilsdev/rag-pipeline-utils/src/core/dag/executor.js`)
- Behavior of items marked `@internal` in JSDoc
- Behavior marked **experimental** in release notes or JSDoc
- The on-disk format of internal caches, logs, or temporary files
- Exact wording of log messages and error `message` strings
- Node version support _below_ the documented minimum (see "Supported
  runtime" below)

If you depend on any of the above, you accept that patch-level upgrades
may break your integration.

## Breaking changes

A **breaking change** is any change that would force a user of the
public API surface to modify their code, configuration, or deployment.
Concretely:

- Removing or renaming a public export
- Removing a method or property on a public class
- Changing the signature of a public method in a way existing callers
  can't satisfy (added required parameter, removed optional parameter
  type, etc.)
- Changing the shape of a public configuration object
- Tightening a type that was previously accepting
- Changing the default value of a public option when the new default
  produces different behavior
- Throwing a new error class from a public method where callers
  previously got a different class or a string
- Raising the minimum Node.js version
- Raising the minimum TypeScript version for typed consumers
- Removing support for a bundler or module format (ESM/CJS)

The following are **not** breaking changes (they ship in minors and
patches freely):

- Adding new exports, methods, or options
- Relaxing a type that was previously restrictive
- Widening an accepted input (e.g. accepting `Buffer` where we
  previously only accepted `string`)
- Adding new optional parameters at the end of a signature
- Improving error messages or adding context to them
- Changing the shape of _logs_ (not errors)
- Performance improvements that don't change observable behavior
- Internal refactors invisible to the public API

## Deprecation process

When we need to remove public API surface, the removal is preceded by
at least **one minor release** with a deprecation warning.

Timeline:

1. **Minor X.Y.0** — API marked deprecated
   - JSDoc `@deprecated` tag with migration guidance
   - TypeScript `@deprecated` in type declarations (strikethrough in
     IDEs)
   - Runtime warning printed once per process when the API is called
     (`util.deprecate` or equivalent)
   - Documentation updated with the recommended replacement
   - Mentioned in the [CHANGELOG](CHANGELOG.md)
2. **Minor X.Y.Z** and beyond — API still present, still warning
3. **Major (X+1).0.0** — API removed

The minimum one-minor window means a user running `npm update`
regularly will see deprecation warnings before the next major ships.
We will extend the window longer than one minor for widely-used API
surface.

## Supported runtime

The minimum supported Node.js version is declared in
[`package.json` `engines.node`](./package.json). We support Node LTS
versions that are in active maintenance at the time of each major
release.

Dropping support for a Node version is a **breaking change** and
lands only in major releases.

Current: **Node.js ≥ 18**. The next major release is planned to
require **Node.js ≥ 20** to track LTS support timelines.

## Supported release lines

See [SECURITY.md](SECURITY.md#supported-versions). In summary:

- **Latest minor** receives bug fixes and security patches
- **Previous minor** receives a 30-day security-only patch window
  after a new minor ships
- **Older minors** are unsupported

The same matrix applies to non-security bug fixes.

## TypeScript

Type declarations ship in `dist/index.d.ts` and are considered part of
the public API surface. Breaking changes to _types_ that require
consumer code changes follow the same SemVer rules as runtime API.

Type-widening changes (making a type more permissive) are not breaking.
Type-narrowing changes (making a type more restrictive, causing
previously-compiling code to fail) are breaking.

We target the TypeScript version currently listed in
`package.json` `devDependencies`. Consumers using older TypeScript
versions may see type errors that are not regressions.

## ESM and CommonJS

The package ships **dual-module builds** — both ESM (`dist/index.mjs`)
and CommonJS (`dist/index.cjs`). `package.json` `exports` resolves the
correct entry point based on how the consumer imports it.

The ESM build is the primary development target. The CommonJS build
is a compatibility layer. When a feature can only be expressed in ESM
(e.g. top-level await, real dynamic imports), we ship it in ESM and
document the CJS limitation.

Dropping CommonJS support is a breaking change and will land only in
a major release, with a full minor of deprecation warnings first.

## What this means for you

If you are building on top of this package, you can:

- **Auto-merge patch updates** with confidence. Nothing public-facing
  breaks.
- **Review minor updates** via the CHANGELOG before merging. No
  required code changes, but new features may be worth adopting.
- **Plan for major updates.** Each major ships with a
  `docs-site/docs/Migration.md` covering every breaking change and the
  new call site.

If you find a case where a patch or minor change broke your
integration without a deprecation warning, open an issue — we treat
that as a bug against this policy.

## See also

- [SECURITY.md](SECURITY.md) — supported version windows and CVE
  handling
- [CHANGELOG.md](CHANGELOG.md) — what actually changed per release
- [Migration guide](https://devilsdev.github.io/rag-pipeline-utils/docs/Migration)
  — upgrade instructions between majors
