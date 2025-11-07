# Versioning Strategy

This document explains how we version `@devilsdev/rag-pipeline-utils` releases.

## Semantic Versioning

We follow [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html):

```
MAJOR.MINOR.PATCH
```

### MAJOR Version (X.0.0)

Incremented when making incompatible API changes:

- Removing or renaming public APIs
- Changing function signatures in breaking ways
- Removing support for Node.js versions
- Major architectural changes requiring code updates

**Example:** `2.3.0 → 3.0.0`

### MINOR Version (0.X.0)

Incremented when adding functionality in a backward-compatible manner:

- Adding new features or APIs
- Adding new plugin types or contracts
- Enhancing existing features without breaking compatibility
- Security improvements that add new behavior
- Deprecating APIs (but not removing them)

**Example:** `2.2.1 → 2.3.0`

### PATCH Version (0.0.X)

Incremented for backward-compatible bug fixes:

- Fixing bugs without adding features
- Performance improvements
- Documentation updates
- Dependency updates (non-breaking)

**Example:** `2.2.0 → 2.2.1`

---

## Special Cases

### Security Fixes

Security fixes are versioned based on their nature:

- **PATCH** if fixing a vulnerability without new behavior

  - Example: Fixing a validation bug that incorrectly accepted invalid input

- **MINOR** if adding new security features or changing behavior

  - Example: Adding iterative URL decoding (v2.3.0)
  - Example: Enhancing JWT replay protection (v2.3.0)

- **MAJOR** if security fix requires breaking changes
  - Example: Removing an insecure API entirely
  - Example: Changing default behavior in incompatible ways

### Behavior Changes vs. Breaking Changes

Not all behavior changes are "breaking changes." A change is only breaking if it affects **documented and valid use cases**.

**Examples of Non-Breaking Behavior Changes:**

```javascript
// v2.2.1: Path traversal silently failed (BUG)
const result = sanitizePath("../etc/passwd", { throwOnInvalid: false });
// result = null (WRONG - security violation ignored)

// v2.3.0: Path traversal now throws (CORRECT)
const result = sanitizePath("../etc/passwd", { throwOnInvalid: false });
// Throws "Potential path traversal detected" (SECURITY FIX)
```

This is a **MINOR** version change because:

- The previous behavior was a bug (security violations should never be silent)
- No valid/documented use case relied on this behavior
- The change improves security and correctness

**Examples of Breaking Changes:**

```javascript
// Hypothetical v3.0.0: Removing a public API
validator.sign(payload); // v2.x: Works
validator.sign(payload); // v3.0.0: Removed (BREAKING)

// Hypothetical v3.0.0: Changing function signature
validator.verify(token); // v2.x: Returns payload
validator.verify(token, options); // v3.0.0: Requires options (BREAKING)
```

---

## Release v2.3.0 Rationale (2025-11-07)

### Why Not 2.2.2 (PATCH)?

The v2.3.0 release includes:

- **New Features:**

  - Iterative URL decoding (up to 5 passes)
  - Enhanced replay protection with self-signed token support
  - Race condition mitigation in JTI tracking

- **Behavioral Enhancements:**
  - Self-signed tokens now reusable (fixes broken refresh flows)
  - Consistent `strictValidation` behavior
  - Critical security errors always throw

These are **new capabilities**, not just bug fixes, requiring a MINOR version bump.

### Why Not 3.0.0 (MAJOR)?

All changes are **backward compatible** for documented use cases:

- **Self-signed token reusability:** Fixes broken functionality (not breaking)
- **Path traversal always throws:** Fixes security bug (not breaking)
- **strictValidation consistency:** Fixes configuration bug (not breaking)

No valid user code will break when upgrading from 2.2.1 → 2.3.0.

### Summary

```
v2.2.1 (Previous)
  │
  ├─ Fixed: JWT replay protection bug
  ├─ Fixed: Path traversal security vulnerability
  ├─ Fixed: Duplicate validation logic
  ├─ Added: Iterative URL decoding
  ├─ Added: Enhanced replay protection
  └─ Enhanced: Security monitoring
  │
v2.3.0 (Current) ← MINOR version (new features, backward compatible)
```

---

## Version Lifecycle

### Support Policy

- **Current Release (2.3.x):** Full support with security updates and bug fixes
- **Previous Minor (2.2.x):** Security updates only for 6 months
- **Older Versions (2.1.x, 2.0.x):** End of life - upgrade recommended

### Deprecation Policy

When we need to remove functionality:

1. **Deprecate in MINOR release:** Mark as deprecated, add warnings
2. **Wait 6+ months:** Give users time to migrate
3. **Remove in MAJOR release:** Remove deprecated functionality

Example:

```javascript
// v2.3.0: Deprecate old API
validator.oldMethod(); // Works, but logs warning

// v2.4.0-2.9.0: Continued warnings

// v3.0.0: Remove deprecated API
validator.oldMethod(); // Error: Method removed
```

---

## Version Release Checklist

Before releasing a new version:

- [ ] Update version in `package.json`
- [ ] Update CHANGELOG.md with release date and version
- [ ] Run full test suite (`npm test`)
- [ ] Run security audit (`npm audit`)
- [ ] Update README.md if needed
- [ ] Create git tag: `git tag v2.3.0`
- [ ] Push tag: `git push origin v2.3.0`
- [ ] Publish to npm: `npm publish`
- [ ] Create GitHub release with changelog

---

## Questions?

If you're unsure about version numbering for a change:

1. Ask: "Will existing code break?"

   - Yes → MAJOR
   - No → MINOR or PATCH

2. Ask: "Does this add new functionality?"

   - Yes → MINOR
   - No → PATCH

3. Ask: "Is this fixing incorrect/buggy behavior?"
   - If fix adds features → MINOR
   - If fix only corrects → PATCH

When in doubt, discuss in [GitHub Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions).
