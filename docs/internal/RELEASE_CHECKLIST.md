# Release Checklist v2.3.0

**Release Date:** November 7, 2025
**Version:** 2.3.0 (MINOR - Security Enhancements)
**Previous Version:** 2.2.1

---

## Pre-Release Checklist

### Code Quality & Testing

- [ ] **All tests passing**

  ```bash
  npm test
  ```

  - [ ] JWT Validator tests: 44/44 passing
  - [ ] Input Sanitizer tests: 69/69 passing
  - [ ] All other test suites: passing
  - [ ] Total: 113+ security tests passing

- [ ] **Linting clean**

  ```bash
  npm run lint
  ```

  - [ ] No ESLint errors
  - [ ] No ESLint warnings (or documented exceptions)

- [ ] **Type checking (if applicable)**

  ```bash
  npm run typecheck
  ```

  - [ ] TypeScript definitions up to date
  - [ ] No type errors

- [ ] **Build succeeds**
  ```bash
  npm run build
  ```
  - [ ] dist/ folder generated correctly
  - [ ] Type definitions generated

### Security

- [ ] **Security audit clean**

  ```bash
  npm run security:check
  ```

  - [ ] Zero critical vulnerabilities in production dependencies
  - [ ] Document any acceptable dev dependency warnings

- [ ] **Verify security fixes**

  - [ ] JWT replay protection working correctly
  - [ ] Path traversal defense blocks all attack vectors
  - [ ] strictValidation behavior consistent
  - [ ] All 6 critical security issues resolved

- [ ] **Dependency updates**
  ```bash
  npm audit fix
  ```
  - [ ] All dependencies updated (if needed)
  - [ ] No breaking changes from dependency updates

### Documentation

- [ ] **README.md updated**

  - [ ] "What's New" section reflects v2.3.0
  - [ ] Security section updated with new features
  - [ ] Migration guide complete
  - [ ] All examples tested and working
  - [ ] Version numbers correct
  - [ ] Release date updated (November 7, 2025)

- [ ] **CHANGELOG.md updated**

  - [ ] Version 2.3.0 section complete
  - [ ] All security fixes documented
  - [ ] Breaking changes noted (none in this release)
  - [ ] Migration notes included
  - [ ] Release date set to 2025-11-07

- [ ] **VERSIONING.md created**

  - [ ] Semantic versioning strategy documented
  - [ ] v2.3.0 rationale explained
  - [ ] Version lifecycle documented

- [ ] **API documentation**
  ```bash
  npm run docs:generate
  ```
  - [ ] API docs regenerated
  - [ ] JWTValidator docs updated
  - [ ] InputSanitizer docs updated
  - [ ] Examples tested

### Version Control

- [ ] **package.json updated**

  - [ ] Version bumped to 2.3.0
  - [ ] Dependencies reviewed
  - [ ] Scripts working

- [ ] **Git status clean**

  ```bash
  git status
  ```

  - [ ] All changes committed
  - [ ] No untracked files (except intentional)
  - [ ] Working directory clean

- [ ] **Commit messages follow convention**
  - [ ] Conventional commits format used
  - [ ] Clear, descriptive commit messages
  - [ ] References to issues/PRs included

---

## Release Process

### Step 1: Final Verification

```bash
# Run full verification suite
npm run verify

# Run security checks
npm run security:check

# Build production artifacts
npm run build

# Verify package contents
npm run verify:pack
```

**Checklist:**

- [ ] All verification steps passed
- [ ] Build artifacts generated correctly
- [ ] Package size reasonable (check for bloat)
- [ ] No unnecessary files in dist/

### Step 2: Create Git Tag

```bash
# Ensure you're on main branch
git checkout main

# Pull latest changes
git pull origin main

# Create annotated tag
git tag -a v2.3.0 -m "Release v2.3.0 - Security Enhancements

Major security improvements:
- Advanced JWT replay protection with self-signed token reusability
- Hardened path traversal defense with iterative URL decoding
- Consistent validation behavior eliminating duplicate checks
- Race condition mitigation in concurrent token verification

See CHANGELOG.md for full details."

# Verify tag created
git tag -l -n9 v2.3.0
```

**Checklist:**

- [ ] Tag created with detailed message
- [ ] Tag message includes key changes
- [ ] Tag verified locally

### Step 3: Push to GitHub

```bash
# Push commits
git push origin main

# Push tag
git push origin v2.3.0
```

**Checklist:**

- [ ] Commits pushed successfully
- [ ] Tag pushed successfully
- [ ] Verify tag visible on GitHub

### Step 4: Create GitHub Release

1. Go to: https://github.com/DevilsDev/rag-pipeline-utils/releases/new
2. Select tag: `v2.3.0`
3. Release title: `v2.3.0 - Security Enhancements`
4. Description: (Use template below)

**Release Description Template:**

````markdown
## v2.3.0 - Security Enhancements

**Released:** November 7, 2025

### Highlights

This release includes critical security enhancements and fixes for JWT validation and input sanitization.

#### Major Security Fixes

**JWT Replay Protection**

- Self-signed tokens can now be verified multiple times (fixes refresh flows)
- External tokens properly blocked on replay attempts
- Race condition mitigation in concurrent verification
- Separate tracking for reusable vs. single-use tokens

**Path Traversal Defense**

- Iterative URL decoding (up to 5 passes) blocks sophisticated attacks
- Detects double/triple-encoded paths: `%252e%252e%252f` → `../`
- Malformed encoding treated as attack indicator
- Critical security violations always throw errors

**Validation Consistency**

- `strictValidation` flag now works as documented
- Eliminated duplicate validation logic
- Clear separation of concerns in JWT validation

### Testing

- 113 security-focused tests passing
- 44 JWT validator tests
- 69 input sanitizer tests
- 100% coverage on critical security paths

### Migration

**Backward Compatible:** This release is 100% backward compatible for all documented use cases.

**Action Required:** None for most users. See [migration guide](https://github.com/DevilsDev/rag-pipeline-utils#upgrading-from-v22x) if:

- You explicitly set `strictValidation=false`
- You handle path traversal errors in custom ways

### Full Changelog

See [CHANGELOG.md](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/CHANGELOG.md#230---2025-11-07) for complete details.

### Installation

```bash
npm install @devilsdev/rag-pipeline-utils@2.3.0
```
````

### Contributors

Thank you to everyone who contributed to this release!

---

**Previous release:** [v2.2.1](https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.2.1)

````

**Checklist:**
- [ ] Release created on GitHub
- [ ] Release description complete
- [ ] Changelog linked
- [ ] Migration guide linked
- [ ] Installation instructions included

### Step 5: Publish to npm

```bash
# Ensure you're logged in
npm whoami

# If not logged in
npm login

# Dry run to verify package contents
npm publish --dry-run

# Review what will be published
# Check dist/ folder, files list, etc.

# Publish to npm (public)
npm publish --access public
````

**Checklist:**

- [ ] Logged into npm registry
- [ ] Dry run verified package contents
- [ ] Published successfully
- [ ] Verify on npmjs.com: https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils

### Step 6: Verify Release

```bash
# Install from npm in a test directory
mkdir /tmp/test-v2.3.0
cd /tmp/test-v2.3.0
npm init -y
npm install @devilsdev/rag-pipeline-utils@2.3.0

# Verify version
node -p "require('@devilsdev/rag-pipeline-utils/package.json').version"
# Should output: 2.3.0

# Test basic functionality
node -e "const { JWTValidator } = require('@devilsdev/rag-pipeline-utils'); console.log('Import successful');"
```

**Checklist:**

- [ ] Package installs from npm
- [ ] Version correct
- [ ] Imports work
- [ ] Basic functionality tested

---

## Post-Release Tasks

### Announcements

- [ ] **GitHub Discussions**

  - Post announcement: https://github.com/DevilsDev/rag-pipeline-utils/discussions
  - Category: Announcements
  - Include security highlights and migration guide link

- [ ] **Update Documentation Site** (if applicable)

  ```bash
  npm run docs:deploy
  ```

  - [ ] Latest version documented
  - [ ] Migration guide published
  - [ ] API docs updated

- [ ] **Social Media** (if applicable)
  - [ ] Tweet/post about security enhancements
  - [ ] Highlight key features
  - [ ] Link to release notes

### Monitoring

- [ ] **Monitor npm downloads**

  - Check: https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils
  - Watch for installation issues

- [ ] **Monitor GitHub issues**

  - Watch for bug reports related to v2.3.0
  - Respond to questions about migration
  - Track feedback on security changes

- [ ] **Security monitoring**
  - Monitor npm audit results
  - Watch for new security advisories
  - Check Dependabot alerts

### Cleanup

- [ ] **Close related issues**

  - Close fixed security issues
  - Update issue labels
  - Link to release in issue comments

- [ ] **Update project board** (if applicable)

  - Move completed items to "Done"
  - Archive old milestones
  - Create v2.4.0 milestone if needed

- [ ] **Update roadmap**
  - Mark v2.3.0 features as shipped
  - Update timeline for next release
  - Gather feedback for future releases

---

## Rollback Plan (Emergency)

If critical issues are discovered after release:

### Option 1: Deprecate and Patch

```bash
# Deprecate broken version
npm deprecate @devilsdev/rag-pipeline-utils@2.3.0 "Critical bug - use 2.3.1 instead"

# Fix issues and release patch
# Update to 2.3.1
npm version patch
git push && git push --tags
npm publish
```

### Option 2: Unpublish (within 72 hours only)

```bash
# Only if absolutely necessary and within 72 hours
npm unpublish @devilsdev/rag-pipeline-utils@2.3.0

# Important: This is destructive and should be last resort
# Better to deprecate and fix with a patch
```

**Rollback Checklist:**

- [ ] Issue severity assessed (Critical? High? Medium?)
- [ ] Rollback plan chosen
- [ ] Stakeholders notified
- [ ] Fix implemented
- [ ] New version released
- [ ] Incident documented

---

## Sign-off

**Release Manager:** **\*\*\*\***\_\_\_**\*\*\*\*** Date: \***\*\_\_\_\*\***

**QA Verification:** **\*\*\*\***\_\_\_**\*\*\*\*** Date: \***\*\_\_\_\*\***

**Security Review:** **\*\*\*\***\_\_\_**\*\*\*\*** Date: \***\*\_\_\_\*\***

---

## Notes

### Pre-Release Testing Results

```
Test Suite Results (2025-11-07):
- JWT Validator: 44/44 PASS
- Input Sanitizer: 69/69 PASS
- Total Security Tests: 113 PASS
- Overall Coverage: 100% on critical paths

Security Audit:
- Production dependencies: 0 vulnerabilities
- Dev dependencies: 0 critical, X moderate (acceptable)

Build Verification:
- Build size: [INSERT SIZE]
- Build time: [INSERT TIME]
- No build warnings
```

### Known Issues

None identified in pre-release testing.

### Post-Release Issues

(To be filled in after release if any issues are reported)

---

**Release Completed:** **\_** / **\_** / **\_**
**Released by:** ****\*\*****\_****\*\*****
