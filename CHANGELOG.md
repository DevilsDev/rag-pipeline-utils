# Changelog

## [2.1.7](https://github.com/DevilsDev/rag-pipeline-utils/compare/v2.1.6...v2.1.7) (2025-04-25)


### Bug Fixes

* **ci:** patch blog release workflow with DRY_RUN and safer outputs ([18f1b7d](https://github.com/DevilsDev/rag-pipeline-utils/commit/18f1b7dd4019022d76de9097db1ff8cfd858d83e))

<<<<<<< HEAD
## 2.1.5 - 2025-04-22
### Features
- Synced roadmap labels + issues via CI
- Added auto-close for Done roadmap entries

### Fixes
- ES module compatibility fixes for roadmap scripts
- Improved test isolation and mocking for Octokit

### DevOps
- CI chain includes roadmap validation and label sync
- CLI tools support changelog generation + blog linking


=======
## [2.1.5](https://github.com/DevilsDev/rag-pipeline-utils/compare/v2.1.4...v2.1.5) (2025-04-22)


### Bug Fixes

* **scripts:** prevent null status crash in roadmap issue closer ([89d5a0b](https://github.com/DevilsDev/rag-pipeline-utils/commit/89d5a0bc4cac554975974558b97974297816f169))

>>>>>>> 6475a97d362f7cd9779e1268f1c816764a7fd62c
## [2.1.4](https://github.com/DevilsDev/rag-pipeline-utils/compare/v2.1.3...v2.1.4) (2025-04-21)


### Bug Fixes

* update CI and deployment workflows for docs build and GitHub Pages deployment ([11739ba](https://github.com/DevilsDev/rag-pipeline-utils/commit/11739ba222669e359232807e461bc84d68d913cb))
* update CI and deployment workflows for docs build and GitHub Pages deployment ([8de276f](https://github.com/DevilsDev/rag-pipeline-utils/commit/8de276f8cb6c91a291322783dc944b0f4799974f))

## [2.1.3](https://github.com/DevilsDev/rag-pipeline-utils/compare/v2.1.2...v2.1.3) (2025-04-21)


### Bug Fixes

* Refactor CI workflows for better separation of concerns ([ef2954b](https://github.com/DevilsDev/rag-pipeline-utils/commit/ef2954b9161a73367cafa04d29f2e56164e4b1c0))

## [2.1.2](https://github.com/DevilsDev/rag-pipeline-utils/compare/v2.1.1...v2.1.2) (2025-04-21)


### Bug Fixes

* resolve build/test errors, update jest configuration, and ensure compatibility with ECMAScript modules ([e6259f9](https://github.com/DevilsDev/rag-pipeline-utils/commit/e6259f924f38da66f9fc9cb7c01a8d6665bf5cbd))

## [2.1.1](https://github.com/DevilsDev/rag-pipeline-utils/compare/v2.1.0...v2.1.1) (2025-04-18)


### Bug Fixes

* **blog:** convert tags.yml to valid object format for Docusaurus v3 ([6a7a9bf](https://github.com/DevilsDev/rag-pipeline-utils/commit/6a7a9bfa3501d30529b21e36fa51ab47d151f7a3))
* **blog:** convert tags.yml to valid object format for Docusaurus v3 ([fa2fff9](https://github.com/DevilsDev/rag-pipeline-utils/commit/fa2fff969dc242e66d92a80b4aa2ff8e07f9fd0f))

## [2.1.0] - 2025-04-18 (2025-04-18)


### Features

* **docs-site:** add Storybook integration with BlogCard + LQIP image automation ([80965b8](https://github.com/DevilsDev/rag-pipeline-utils/commit/80965b8ef1d26372852ee0f39b56a73f337e0cea))

## [2.0.1](https://github.com/DevilsDev/rag-pipeline-utils/compare/v2.0.0...v2.0.1) (2025-04-17)


### Bug Fixes

* add @docusaurus/preset-classic to enable CI builds ([ed5e771](https://github.com/DevilsDev/rag-pipeline-utils/commit/ed5e771f919face4693a6a7abfed4cf0fe1325ca))

## [2.0.0] - 2025-04-17 (2025-04-17)


### Bug Fixes

* **ci:** correct .ragrc.json plugin paths and CLI test cwd to resolve plugin loading in CI ([911c23b](https://github.com/DevilsDev/rag-pipeline-utils/commit/911c23b1d3ddb9e2d938b37f4422a5d81995e97f))
* **ci:** resolve plugin path error in .ragrc.json for GitHub Actions compatibility ([affc739](https://github.com/DevilsDev/rag-pipeline-utils/commit/affc739d5c4ff2070b1a1ca0ccf3f9137d6cee5a))
* **ci:** resolve plugin path failures in .ragrc.json during CLI integration tests ([04b977b](https://github.com/DevilsDev/rag-pipeline-utils/commit/04b977b3b745fa3d3ab47c84b2aeee3285896068))
* **cli:** correct path to load-plugin-config.js after moving to /src/config ([f743498](https://github.com/DevilsDev/rag-pipeline-utils/commit/f743498ec32e03151eda9ba7fe5886bda8da792f))
* **config:** use default export when importing plugin registry ([ef8dce1](https://github.com/DevilsDev/rag-pipeline-utils/commit/ef8dce12bfab62bc9faec764198b98c0c356472e))
* **test:** ensure .ragrc.json copied to project root for CLI fallback in CI ([31bd2b8](https://github.com/DevilsDev/rag-pipeline-utils/commit/31bd2b844279fb0404056d9929e5f28f9127eb12))
* **tests:** define __dirname manually for ESM compatibility in CLI integration test ([18b8dad](https://github.com/DevilsDev/rag-pipeline-utils/commit/18b8dadabb852243dda2b78de048c71106a759fc))


### Features

* **ci:** integrate full fixture validation, schema contracts, and CLI test flow ([2b57fe9](https://github.com/DevilsDev/rag-pipeline-utils/commit/2b57fe90e64a806815c1f66f5e2a745780270ce6))
* **cli:** dynamic plugin registration with config fallback and middleware injection ([cc24b7e](https://github.com/DevilsDev/rag-pipeline-utils/commit/cc24b7e74d0a2630eb1c6d2def69b370329dcc2b))
* **plugins:** enable dynamic plugin registration from JSON config ([d81d6d7](https://github.com/DevilsDev/rag-pipeline-utils/commit/d81d6d7d5f2d21b5a46b379b530c162ba9c30398))
* **testing:** integrate full fixture and validation setup for CLI + reranker ([ab96037](https://github.com/DevilsDev/rag-pipeline-utils/commit/ab9603765594e7718e2688b80797e1f5e8afe86f))


### BREAKING CHANGES

* **cli:**  now requires named options for middleware injection; existing usage must be updated.

## [1.0.2] - 2025-04-15
### Fixed
- Corrected plugin path resolution in `.ragrc.json` fixture for CI compatibility.
- Resolved `ERR_MODULE_NOT_FOUND` during CLI integration tests in GitHub Actions.
- Ensured consistent module resolution across environments (Windows, Linux, CI).


## [1.0.1](https://github.com/DevilsDev/rag-pipeline-utils/compare/v1.0.0...v1.0.1) (2025-04-14)


### Bug Fixes

* **ci:** initialize release pipeline and scaffold changelog ([179b486](https://github.com/DevilsDev/rag-pipeline-utils/commit/179b486effb0751b8735a9f849825eb63930ad01))
* **tests:** add missing sample PDF fixture and pre-test setup script ([de8e2b2](https://github.com/DevilsDev/rag-pipeline-utils/commit/de8e2b2c19034b521fc5ae1cdebbe3884a2fd15f))

All notable changes to this project will be documented in this file.

The format is based on [Semantic Versioning](https://semver.org/), and this project uses [semantic-release](https://github.com/semantic-release/semantic-release) for automated versioning and changelog generation.

## v2.1.6

- chore: remove legacy changelog workflow and finalize blog badge
- ci(workflows): add blog badge verification workflow
- ci(workflows): add blog badge verification workflow
- ci(workflows): add blog badge verification workflow
- docs(blog): add release post for v2.1.5

---
