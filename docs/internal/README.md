# Internal Documentation

This directory contains internal project documentation used during development, planning, and release processes. These files are **not published** to npm.

## Contents

### Planning & Strategy

- **BRANCHING_STRATEGY.md** - Git branching workflow and merge policies
- **PROPOSED_CHANGES.md** - Planned features and architectural changes
- **Use-Cases.md** - Internal use case analysis

### Development Guidelines

- **CLAUDE.md** - AI assistant instructions and project rules
- **CONTRIBUTING.md** - Internal contribution guidelines (different from public docs)
- **PLUGIN_ECOSYSTEM_GUIDE.md** - Plugin development detailed guide

### Release Documentation

- **RELEASE_ENGINEERING_REPORT.md** - Release process and automation
- **RELEASE_NOTES_ESM_FIX.md** - ESM compatibility release notes
- **RELEASE_NOTES_v3.md** - Version 3.0 release notes
- **CHANGELOG.md** - Detailed change history

### Deployment & Operations

- **DEPLOYMENT_GUIDE.md** - Internal deployment procedures
- **DEPLOYMENT_SUMMARY_v2.2.0.md** - Version 2.2.0 deployment summary

### Quality & Security

- **PRODUCTION_READINESS_CERTIFICATION.md** - Production readiness checklist
- **SECURITY_VULNERABILITY_TABLE.md** - Security assessment and remediation
- **LESSONS_LEARNED_AND_BEST_PRACTICES.md** - Post-mortems and learnings

### Project Reviews

- **FINAL_PRE_MERGE_REVIEW.md** - Pre-merge quality gate checklist
- **PROJECT_COMPLETION_SUMMARY.md** - Project milestone summaries

### Temporary/Test Files

- **test-change.md** - Temporary test file (should be removed)

## For Contributors

These documents are maintained for internal reference and are subject to change without notice. For public-facing documentation, see:

- **README.md** (root) - User-facing documentation
- **docs/** - Published documentation

## Notes

- These files are excluded from npm packages via `.npmignore`
- Sensitive information should never be committed here
- Keep documentation up-to-date with code changes
