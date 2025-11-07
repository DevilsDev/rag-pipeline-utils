# Publishing Guide - npm Registry

## Publishing @devilsdev/rag-pipeline-utils to npmjs.com

This guide walks you through publishing version 2.3.0 to the npm registry at npmjs.com.

---

## Prerequisites

### 1. npm Account Setup

**If you don't have an npm account:**

1. Go to https://www.npmjs.com/signup
2. Create account with:

   - Username: Choose a username
   - Email: Your email address
   - Password: Strong password

3. **Verify your email** (check inbox for verification email)

**If you already have an account:**

- Ensure you have access to the `@devilsdev` organization scope
- Or ensure you can publish scoped packages

### 2. Two-Factor Authentication (RECOMMENDED)

**Enable 2FA for security:**

1. Go to https://www.npmjs.com/settings/YOUR_USERNAME/tfa
2. Click "Enable 2FA"
3. Choose "Authorization and Publishing" (most secure)
4. Scan QR code with authenticator app (Google Authenticator, Authy, etc.)
5. Enter verification code
6. Save recovery codes in a safe place

### 3. Login to npm CLI

```bash
# Login to npm
npm login

# You'll be prompted for:
# - Username
# - Password
# - Email
# - 2FA code (if enabled)

# Verify you're logged in
npm whoami
# Should display your username
```

### 4. Verify Organization Access

For scoped packages like `@devilsdev/rag-pipeline-utils`:

```bash
# Check if you have access to @devilsdev organization
npm org ls @devilsdev

# If you don't have access, you need to:
# 1. Create the organization at: https://www.npmjs.com/org/create
# 2. Or get invited by an existing org member
```

---

## Pre-Publishing Verification

### Step 1: Final Code Quality Check

```bash
# Ensure you're in the project directory
cd C:\Users\alika\workspace\rag-pipeline-utils

# Run all tests
npm test
# Expected: All 113+ tests should pass

# Run linting
npm run lint
# Expected: No errors

# Run security audit
npm run security:check
# Expected: 0 critical vulnerabilities in production dependencies
```

**Checklist:**

- [ ] All tests passing
- [ ] No linting errors
- [ ] Security audit clean
- [ ] Git working directory clean

### Step 2: Build the Package

```bash
# Build distribution files
npm run build

# Verify build output
ls -la dist/
# Should see:
# - index.cjs (CommonJS)
# - index.mjs (ES Modules)
# - index.d.ts (TypeScript definitions)
```

**Checklist:**

- [ ] Build completed successfully
- [ ] dist/ folder contains all required files
- [ ] No build errors or warnings

### Step 3: Verify package.json

Check these fields in `package.json`:

```json
{
  "name": "@devilsdev/rag-pipeline-utils",
  "version": "2.3.0", // ✓ Correct version
  "main": "dist/index.cjs", // ✓ Entry point
  "types": "dist/index.d.ts", // ✓ TypeScript definitions
  "files": [
    // ✓ Files to include in package
    "dist/",
    "src/",
    "bin/",
    "contracts/",
    ".ragrc.schema.json",
    "README.md",
    "LICENSE"
  ],
  "publishConfig": {
    "access": "public" // ✓ Required for scoped packages
  }
}
```

**Checklist:**

- [ ] Version is 2.3.0
- [ ] `publishConfig.access` is "public"
- [ ] `files` array includes necessary files
- [ ] Entry points correct

### Step 4: Preview Package Contents

```bash
# Dry run - see what will be published
npm publish --dry-run

# This shows:
# - Package size
# - Files that will be included
# - Shasum (integrity hash)
# - Total files count
```

**Review the output:**

- [ ] Package size reasonable (should be < 10MB)
- [ ] Only intended files included
- [ ] No sensitive files (secrets, .env, etc.)
- [ ] No unnecessary files (node_modules, tests, etc.)

**Alternative: Create tarball locally**

```bash
# Pack the package into a tarball
npm pack

# This creates: devilsdev-rag-pipeline-utils-2.3.0.tgz

# Extract and inspect
tar -tzf devilsdev-rag-pipeline-utils-2.3.0.tgz | head -20

# Clean up
rm devilsdev-rag-pipeline-utils-2.3.0.tgz
```

---

## Publishing Process

### Step 5: Commit and Tag

```bash
# Ensure all changes are committed
git add .
git commit -m "chore: release v2.3.0

- Updated package.json to v2.3.0
- Added comprehensive security enhancements
- Updated README and CHANGELOG

See CHANGELOG.md for full details."

# Push to GitHub
git push origin main

# Create annotated tag
git tag -a v2.3.0 -m "Release v2.3.0 - Security Enhancements

Major security improvements:
- Advanced JWT replay protection with self-signed token reusability
- Hardened path traversal defense with iterative URL decoding
- Consistent validation behavior eliminating duplicate checks
- Race condition mitigation in concurrent token verification

All 113 security tests passing.
See CHANGELOG.md for full details."

# Push tag
git push origin v2.3.0

# Verify tag on GitHub
# Go to: https://github.com/DevilsDev/rag-pipeline-utils/tags
```

**Checklist:**

- [ ] All changes committed
- [ ] Pushed to GitHub
- [ ] Tag created and pushed
- [ ] Tag visible on GitHub

### Step 6: Publish to npm

```bash
# Final check - are you logged in?
npm whoami
# Should show your username

# Publish to npm registry
npm publish --access public

# If you have 2FA enabled, you'll be prompted for a code
# Enter the 6-digit code from your authenticator app

# Wait for confirmation message:
# + @devilsdev/rag-pipeline-utils@2.3.0
```

**If you see errors:**

**Error: "You must verify your email"**

```bash
# Check your email and click verification link
# Then try publishing again
```

**Error: "You do not have permission to publish"**

```bash
# You need access to @devilsdev organization
# Either:
# 1. Create the org: https://www.npmjs.com/org/create
# 2. Get invited by an org admin
```

**Error: "Cannot publish over existing version"**

```bash
# The version 2.3.0 already exists
# You need to bump the version:
npm version patch  # For 2.3.1
# or
npm version minor  # For 2.4.0
```

**Checklist:**

- [ ] Publish command succeeded
- [ ] No errors during publish
- [ ] Confirmation message received

---

## Post-Publishing Verification

### Step 7: Verify on npm Registry

**Check the package page:**

1. Go to https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils
2. Verify:
   - [ ] Version shows 2.3.0
   - [ ] "Last publish" shows today's date
   - [ ] README displays correctly
   - [ ] Package stats visible (downloads, version, license)

**Check package details:**

```bash
# View package info from npm
npm view @devilsdev/rag-pipeline-utils

# Expected output:
# @devilsdev/rag-pipeline-utils@2.3.0 | GPL-3.0 | deps: X | versions: Y
```

**Checklist:**

- [ ] Package visible on npmjs.com
- [ ] Version is 2.3.0
- [ ] README renders correctly
- [ ] All metadata correct

### Step 8: Test Installation

**Test in a clean environment:**

```bash
# Create temporary test directory
mkdir /tmp/test-npm-install
cd /tmp/test-npm-install

# Initialize a new project
npm init -y

# Install your published package
npm install @devilsdev/rag-pipeline-utils@2.3.0

# Verify it installed correctly
ls node_modules/@devilsdev/rag-pipeline-utils/

# Test importing
node -e "const pkg = require('@devilsdev/rag-pipeline-utils'); console.log('Import successful!');"

# Test specific functionality
node -e "
const { JWTValidator } = require('@devilsdev/rag-pipeline-utils');
const validator = new JWTValidator({
  secret: 'test-secret-key-that-is-long-enough-for-hs256',
  algorithm: 'HS256',
  issuer: 'test',
  audience: 'test'
});
console.log('JWTValidator works!');
const token = validator.sign({ sub: 'test-user' });
console.log('Token generated:', token.substring(0, 20) + '...');
const payload = validator.verify(token);
console.log('Token verified! Subject:', payload.sub);
"

# Clean up
cd ..
rm -rf /tmp/test-npm-install
```

**Checklist:**

- [ ] Package installs successfully
- [ ] No installation errors
- [ ] Imports work correctly
- [ ] Basic functionality works
- [ ] JWTValidator works
- [ ] InputSanitizer works

---

## Create GitHub Release

### Step 9: Create GitHub Release Page

1. Go to https://github.com/DevilsDev/rag-pipeline-utils/releases/new

2. **Choose tag:** Select `v2.3.0` from dropdown

3. **Release title:** `v2.3.0 - Security Enhancements`

4. **Description:** (Copy from below)

````markdown
## v2.3.0 - Security Enhancements

**Released:** November 7, 2025

### Highlights

This release includes critical security enhancements and fixes for JWT validation and input sanitization.

#### Major Security Fixes

**🔒 JWT Replay Protection**

- Self-signed tokens can now be verified multiple times (fixes refresh flows)
- External tokens properly blocked on replay attempts
- Race condition mitigation in concurrent verification
- Separate tracking for reusable vs. single-use tokens

**🛡️ Path Traversal Defense**

- Iterative URL decoding (up to 5 passes) blocks sophisticated attacks
- Detects double/triple-encoded paths: `%252e%252e%252f` → `../`
- Malformed encoding treated as attack indicator
- Critical security violations always throw errors

**✅ Validation Consistency**

- `strictValidation` flag now works as documented
- Eliminated duplicate validation logic
- Clear separation of concerns in JWT validation

### Testing

- **113 security-focused tests passing**
- 44 JWT validator tests
- 69 input sanitizer tests
- 100% coverage on critical security paths

### Migration

**Backward Compatible:** This release is 100% backward compatible for all documented use cases.

**Action Required:** None for most users. See [migration guide](https://github.com/DevilsDev/rag-pipeline-utils#upgrading-from-v22x) if:

- You explicitly set `strictValidation=false`
- You handle path traversal errors in custom ways

### Installation

```bash
npm install @devilsdev/rag-pipeline-utils@2.3.0
```
````

Or update your `package.json`:

```json
{
  "dependencies": {
    "@devilsdev/rag-pipeline-utils": "^2.3.0"
  }
}
```

### What's Changed

**Security:**

- Fixed JWT replay protection logic flaw by @AliKahwaji in #XXX
- Hardened path traversal defense with iterative decoding by @AliKahwaji in #XXX
- Fixed duplicate issuer/audience validation by @AliKahwaji in #XXX

**Documentation:**

- Updated README with security enhancements
- Added comprehensive migration guide
- Created versioning strategy documentation

**Full Changelog:** https://github.com/DevilsDev/rag-pipeline-utils/blob/main/CHANGELOG.md#230---2025-11-07

---

**Previous release:** [v2.2.1](https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.2.1)

### Contributors

Thank you to everyone who contributed to this release! 🎉

````

5. **Check "Set as the latest release"**

6. Click **"Publish release"**

**Checklist:**
- [ ] Release created on GitHub
- [ ] Release description complete
- [ ] Tagged as latest release
- [ ] Visible at: https://github.com/DevilsDev/rag-pipeline-utils/releases

---

## Post-Release Announcements

### Step 10: Announce the Release

**GitHub Discussions:**

1. Go to https://github.com/DevilsDev/rag-pipeline-utils/discussions/new
2. Category: "Announcements"
3. Title: "v2.3.0 Released - Major Security Enhancements"
4. Content:

```markdown
We're excited to announce the release of v2.3.0! 🎉

This release includes critical security enhancements that improve JWT validation and input sanitization.

### Key Highlights

- **Advanced JWT replay protection** - Self-signed tokens now reusable for refresh flows
- **Hardened path traversal defense** - Iterative URL decoding blocks sophisticated attacks
- **Consistent validation behavior** - Fixed duplicate validation logic

### Install Now

```bash
npm install @devilsdev/rag-pipeline-utils@2.3.0
````

### Learn More

- 📝 [Release Notes](https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.3.0)
- 📖 [Migration Guide](https://github.com/DevilsDev/rag-pipeline-utils#upgrading-from-v22x)
- 📊 [Full Changelog](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/CHANGELOG.md)

### Feedback

Let us know how the upgrade goes! Report any issues or share your feedback in this discussion.

````

**npm Package Page:**

Your package README will automatically update on npmjs.com within a few minutes of publishing.

**Checklist:**
- [ ] Announcement posted on GitHub Discussions
- [ ] npm page shows updated README
- [ ] Version visible on npmjs.com

---

## Monitoring & Support

### Step 11: Monitor Release

**For the first 24-48 hours after release:**

1. **Monitor npm downloads:**
   - https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils
   - Check "Downloads" graph

2. **Watch for issues:**
   - https://github.com/DevilsDev/rag-pipeline-utils/issues
   - Respond quickly to installation problems
   - Address bug reports

3. **Check npm install logs:**
   ```bash
   # Check for installation errors
   npm info @devilsdev/rag-pipeline-utils
````

4. **Monitor GitHub notifications:**
   - Watch for questions in Discussions
   - Respond to comments on release page

**Checklist:**

- [ ] Monitoring download stats
- [ ] Watching for issues
- [ ] Ready to respond to problems
- [ ] No critical issues reported

---

## Troubleshooting

### Common Publishing Issues

**Issue: "402 Payment Required"**

```bash
# This means the package name is reserved
# Solutions:
# 1. Use a different package name
# 2. Or verify you have access to the scope
```

**Issue: "403 Forbidden"**

```bash
# You don't have permission
# Solutions:
# 1. Login: npm login
# 2. Check organization access: npm org ls @devilsdev
# 3. Ensure publishConfig.access is "public"
```

**Issue: "Package name too similar to existing package"**

```bash
# npm prevents typosquatting
# Solutions:
# 1. Choose a different name
# 2. Or contact npm support if legitimate
```

**Issue: "Version already published"**

```bash
# You cannot republish the same version
# Solutions:
# 1. Bump version: npm version patch
# 2. Then publish again
```

**Issue: "Invalid package.json"**

```bash
# Validate your package.json
npm run verify:pack

# Or check manually
node -e "console.log(require('./package.json'))"
```

---

## Rollback Procedure

**If you need to unpublish (EMERGENCY ONLY):**

```bash
# CAUTION: Only works within 72 hours of publishing
# This is destructive and should be avoided

# Unpublish specific version
npm unpublish @devilsdev/rag-pipeline-utils@2.3.0

# Better alternative: Deprecate and patch
npm deprecate @devilsdev/rag-pipeline-utils@2.3.0 "Critical bug - use 2.3.1 instead"

# Then fix and publish 2.3.1
npm version patch
npm publish --access public
```

**When to rollback:**

- Critical security vulnerability discovered
- Package completely broken
- Accidental publish of wrong code

**When NOT to rollback:**

- Minor bugs (fix with patch instead)
- Documentation issues (update README)
- Performance issues (fix in next version)

---

## Success Checklist

Your package is successfully published when:

- [x] Version 2.3.0 visible on https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils
- [x] Package installs successfully: `npm install @devilsdev/rag-pipeline-utils@2.3.0`
- [x] README displays correctly on npm page
- [x] GitHub release created
- [x] Tag v2.3.0 visible on GitHub
- [x] All tests passing
- [x] No critical issues reported

---

## Next Steps

After successful release:

1. **Update local dependencies** in other projects
2. **Monitor feedback** for next 1-2 weeks
3. **Plan next release** (v2.4.0 or v2.3.1)
4. **Update roadmap** with completed features
5. **Celebrate!** 🎉 You've shipped a secure, well-tested release

---

## Support

**Need Help?**

- npm documentation: https://docs.npmjs.com/
- npm support: https://www.npmjs.com/support
- GitHub Issues: https://github.com/DevilsDev/rag-pipeline-utils/issues

**For this specific package:**

- Discussions: https://github.com/DevilsDev/rag-pipeline-utils/discussions
- Security: See SECURITY.md for vulnerability reporting
