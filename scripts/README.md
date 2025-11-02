# Scripts Directory

Scripts are CommonJS, cross-platform, idempotent, and CI-safe.

## Core Scripts

- **setup.js** - Pre-test sanity checks and environment validation
- **health-check.js** - Node.js availability verification
- **generate-test-reports.js** - Placeholder test report generation for CI

## Utilities

- **utils/logger.js** - Minimal logging with LOG_LEVEL support
- **utils/retry.js** - Simple retry utility with exponential backoff
- **utils/cli.js** - CLI argument parsing and dry-run support

## Standards

- All scripts use `require()` and `module.exports` (CommonJS)
- Windows-compatible with `path.join()` usage
- Fail-fast with clear error messages and `process.exit(1)`
- No network calls or external dependencies
- Idempotent execution safe for CI/CD

## Usage

```bash
# Run setup
npm run pretest

# Generate reports
npm run posttest

# Health check
node scripts/health-check.js
```
