---
slug: security-enhancements-v2.3.1
title: "RAG Pipeline Utils v2.3.1: Advanced Security Enhancements"
authors: [ali]
tags: [release, security, jwt, path-traversal, defense-in-depth]
date: "2025-11-08"
---

RAG Pipeline Utils v2.3.1 delivers advanced security enhancements and production hardening improvements. This patch release includes critical updates to JWT validation, path traversal defense mechanisms, and race condition mitigation.

## Security Enhancements

### JWT Validation Hardening

**Advanced Replay Protection**

The release implements sophisticated replay protection that distinguishes between self-signed tokens (reusable for refresh flows) and external tokens (single-use only):

- Self-signed tokens support multiple verification operations for refresh flows and load balancer retries
- External tokens are tracked and blocked on replay attempts
- Race condition mitigation with optimized check-then-set pattern
- Separate tracking mechanisms for reusable versus single-use tokens

**Consistent Validation Behavior**

The `strictValidation` flag now consistently controls issuer and audience validation:

```javascript
const validator = new JWTValidator({
  secret: process.env.JWT_SECRET,
  algorithm: "HS256",
  issuer: "my-app",
  audience: "api-users",
  strictValidation: true, // Consistently enforces iss/aud validation
  enableJtiTracking: true, // Prevents replay attacks
});

// Self-signed tokens work correctly for refresh flows
const token = validator.sign({ sub: "user-123" });
validator.verify(token); // First verification
validator.verify(token); // Succeeds (refresh flow support)

// External tokens are blocked on replay
const externalToken = getTokenFromThirdParty();
validator.verify(externalToken); // First use succeeds
validator.verify(externalToken); // Throws "Token replay detected"
```

### Path Traversal Defense

**Multi-Layer Protection with Iterative Decoding**

Path sanitization includes iterative URL decoding (up to 5 passes) to detect sophisticated encoding attacks:

```javascript
const { sanitizePath } = require("@devilsdev/rag-pipeline-utils");

// Safe paths are normalized
sanitizePath("docs/README.md"); // Returns: "docs/README.md"

// Dangerous paths throw errors
sanitizePath("../../../etc/passwd"); // Throws
sanitizePath("%2e%2e%2f%2e%2e%2fpasswd"); // Throws (URL encoded)
sanitizePath("%252e%252e%252fconfig"); // Throws (double-encoded)
```

**Attack Vectors Blocked:**

- Standard traversal: `../../../etc/passwd`
- Windows paths: `..\\..\\windows\\system32`
- URL encoded: `%2e%2e%2f`, `%2e%2e%5c`
- Double encoded: `%252e%252e%252f` to `%2e%2e%2f` to `../`
- Mixed encoding combinations

### Defense-in-Depth Architecture

**Critical Security Errors Always Throw**

Path traversal violations always throw errors, even with `throwOnInvalid=false`:

```javascript
const sanitizer = new InputSanitizer({ throwOnInvalid: false });

try {
  const safePath = sanitizePath(userInput);
  // Use safePath
} catch (error) {
  if (error.message.includes("path traversal")) {
    // Handle attack attempt
    logger.warn("Path traversal blocked", { input: userInput });
    return res.status(400).json({ error: "Invalid path" });
  }
  throw error;
}
```

**Security Monitoring**

- All blocked attempts tracked in `stats.blocked` counter
- Audit events emitted for replay detection, algorithm mismatches, and validation failures
- Structured logging with security event correlation

## Quality Metrics

### Test Coverage

- 113 security tests passing across 2 dedicated security suites
- JWT Validator: 44 tests covering algorithm confusion, replay attacks, and validation edge cases
- Input Sanitizer: 69 tests covering XSS, SQL injection, command injection, and path traversal

### Zero Production Vulnerabilities

- `npm audit --production` returns clean on every release
- All CI workflows passing (lint, test, build, security)
- Comprehensive dependency scanning with Dependabot

### Node.js Support

Tested and supported on:

- Node.js 18.x
- Node.js 20.x
- Node.js 22.x

## Installation

```bash
npm install @devilsdev/rag-pipeline-utils@2.3.1
```

## Documentation

Visit the [Security Documentation](/docs/Security) for detailed information about:

- JWT best practices with replay protection
- Path traversal defense strategies
- Input validation and sanitization
- Audit logging and security monitoring

## Upgrading from v2.3.0

This release is 100% backward compatible with v2.3.0. The only breaking change affects advanced users relying on the previous inconsistent `strictValidation` behavior. See the [Migration Guide](/docs/Migration) for details.

## Credits

This release includes security enhancements based on OWASP best practices and industry-standard defense-in-depth principles. Security-focused community contributors provided valuable feedback.

---

RAG Pipeline Utils v2.3.1 provides essential security enhancements for production deployments. Upgrade to benefit from these critical security improvements.
