# JWT Security Guide

## Overview

This guide covers the hardened JWT (JSON Web Token) validation implementation in rag-pipeline-utils, designed to protect against common JWT vulnerabilities and attacks.

**Version**: 2.3.0
**Security Focus**: Algorithm confusion, replay attacks, weak algorithms, timing attacks

---

## Table of Contents

1. [Security Features](#security-features)
2. [Quick Start](#quick-start)
3. [Configuration](#configuration)
4. [Usage Examples](#usage-examples)
5. [Attack Prevention](#attack-prevention)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)
8. [API Reference](#api-reference)

---

## Security Features

### 1. Algorithm Confusion Protection

**Threat**: Attackers may attempt to change the JWT algorithm (e.g., from RS256 to HS256) to bypass signature verification.

**Protection**:

- Explicit algorithm allowlist
- Header algorithm verification before token validation
- Automatic rejection of `none` algorithm
- Per-token algorithm enforcement

### 2. Token Replay Attack Prevention

**Threat**: Reuse of valid tokens after logout or compromise.

**Protection**:

- JWT ID (JTI) tracking to detect token reuse
- Automatic cleanup of expired JTI records
- Configurable JTI expiration windows
- Replay detection with audit logging

### 3. Weak Algorithm Rejection

**Threat**: Use of cryptographically weak signing algorithms.

**Protection**:

- Minimum key size enforcement (256 bits for HS256, 2048 bits for RS256)
- Support for strong algorithms only (HS256+, RS256+, ES256+, PS256+)
- Automatic key strength validation
- Configuration validation at startup

### 4. Comprehensive Claims Validation

**Threat**: Missing or invalid token claims leading to authorization bypass.

**Protection**:

- Required claims enforcement (iat, exp, iss, aud)
- Custom claim validation with patterns and functions
- Subject (sub) and JWT ID (jti) requirement options
- Issuer and audience matching

### 5. Timing Attack Mitigation

**Threat**: Clock skew and timing-based attacks.

**Protection**:

- Configurable clock tolerance (default: 30 seconds)
- Not-before (nbf) claim validation
- Strict expiration enforcement
- Configurable token maximum age

---

## Quick Start

### Installation

The JWT validator is built into rag-pipeline-utils. No additional installation required.

### Basic Usage

```javascript
const {
  JWTValidator,
} = require("rag-pipeline-utils/src/security/jwt-validator");
const {
  createJWTConfig,
} = require("rag-pipeline-utils/src/security/jwt-config");

// Create validator with secure defaults
const validator = new JWTValidator(
  createJWTConfig({
    secret: process.env.JWT_SECRET, // Minimum 32 bytes for HS256
    algorithm: "HS256",
    issuer: "my-app",
    audience: "my-api",
  }),
);

// Generate token
const token = validator.sign({
  sub: "user-123",
  roles: ["admin"],
  email: "user@example.com",
});

// Verify token
try {
  const payload = validator.verify(token);
  console.log("Valid token for user:", payload.sub);
} catch (error) {
  console.error("Invalid token:", error.message);
}

// Cleanup when done
validator.destroy();
```

---

## Configuration

### Environment Variables

Configure JWT security through environment variables:

```bash
# Required in production
JWT_SECRET="your-64-byte-hex-secret"

# Optional configuration
JWT_ALGORITHM="HS256"                    # Default: HS256
JWT_ALLOWED_ALGORITHMS="HS256,HS384"    # Comma-separated list
JWT_ISSUER="rag-pipeline-utils"         # Token issuer
JWT_AUDIENCE="rag-pipeline-api"         # Token audience
JWT_EXPIRY="3600"                        # Expiration in seconds (1 hour)
JWT_CLOCK_TOLERANCE="30"                 # Clock skew tolerance in seconds

# Security options
JWT_REQUIRE_JTI="true"                   # Require JWT ID
JWT_REQUIRE_SUB="true"                   # Require subject claim
JWT_ENABLE_JTI_TRACKING="true"          # Enable replay protection
JWT_ENABLE_AUDIT_LOG="true"             # Enable audit logging
```

### Generating Secrets

**For HMAC algorithms (HS256, HS384, HS512):**

```bash
# Generate a 64-byte (512-bit) secret for HS256/HS384/HS512
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**For RSA algorithms (RS256, RS384, RS512):**

```bash
# Generate RSA key pair (2048-bit minimum)
openssl genrsa -out jwt-private.pem 2048
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
```

**For ECDSA algorithms (ES256, ES384, ES512):**

```bash
# Generate ECDSA key pair (prime256v1 for ES256)
openssl ecparam -genkey -name prime256v1 -out jwt-private-ec.pem
openssl ec -in jwt-private-ec.pem -pubout -out jwt-public-ec.pem
```

### Programmatic Configuration

```javascript
const {
  createJWTConfig,
} = require("rag-pipeline-utils/src/security/jwt-config");
const {
  JWTValidator,
} = require("rag-pipeline-utils/src/security/jwt-validator");

const config = createJWTConfig({
  // Algorithm configuration
  algorithm: "HS256",
  allowedAlgorithms: ["HS256"],

  // Secrets/Keys
  secret: process.env.JWT_SECRET,

  // Issuer and audience
  issuer: "my-app",
  audience: "my-api",

  // Timing
  clockTolerance: 30, // 30 seconds
  maxTokenAge: 3600, // 1 hour

  // Security
  requireJti: true, // Require JWT ID
  requireSub: true, // Require subject
  strictValidation: true, // Strict validation

  // Replay protection
  enableJtiTracking: true,

  // Audit logging
  enableAuditLog: true,
});

const validator = new JWTValidator(config);
```

---

## Usage Examples

### Example 1: Basic Token Generation and Validation

```javascript
const validator = new JWTValidator(
  createJWTConfig({
    secret: process.env.JWT_SECRET,
    algorithm: "HS256",
    issuer: "my-app",
    audience: "my-api",
  }),
);

// Generate token
const token = validator.sign({
  sub: "user-123",
  email: "user@example.com",
  roles: ["user", "admin"],
});

// Verify token
const payload = validator.verify(token);
console.log("User:", payload.sub);
console.log("Roles:", payload.roles);

validator.destroy();
```

### Example 2: Custom Token Expiration

```javascript
// Short-lived token (5 minutes)
const shortToken = validator.sign(
  { sub: "user-123" },
  { expiresIn: 300 }, // 5 minutes
);

// Long-lived token (24 hours)
const longToken = validator.sign(
  { sub: "user-123" },
  { expiresIn: 86400 }, // 24 hours
);
```

### Example 3: Custom Claims Validation

```javascript
const validator = new JWTValidator(
  createJWTConfig({
    secret: process.env.JWT_SECRET,
    algorithm: "HS256",
    issuer: "my-app",
    audience: "my-api",
    validateClaims: {
      // Exact match
      tenant: "acme-corp",

      // Array of allowed values
      role: ["admin", "moderator"],

      // Custom validation function
      age: (value) => typeof value === "number" && value >= 18,
    },
  }),
);

// This token will be accepted
const validToken = validator.sign({
  sub: "user-123",
  tenant: "acme-corp",
  role: "admin",
  age: 25,
});

// This token will be rejected (role not in allowed list)
try {
  const invalidToken = validator.sign({
    sub: "user-123",
    tenant: "acme-corp",
    role: "user", // Not in ['admin', 'moderator']
    age: 25,
  });
  validator.verify(invalidToken);
} catch (error) {
  console.error("Validation failed:", error.message);
}
```

### Example 4: Asymmetric Key Usage (RS256)

```javascript
const fs = require("fs");

const validator = new JWTValidator({
  algorithm: "RS256",
  allowedAlgorithms: ["RS256"],
  publicKey: fs.readFileSync("jwt-public.pem", "utf8"),
  privateKey: fs.readFileSync("jwt-private.pem", "utf8"),
  issuer: "my-app",
  audience: "my-api",
});

// Generate token (requires private key)
const token = validator.sign({ sub: "user-123" });

// Verify token (requires public key)
const payload = validator.verify(token);

validator.destroy();
```

### Example 5: Audit Logging

```javascript
const validator = new JWTValidator(
  createJWTConfig({
    secret: process.env.JWT_SECRET,
    algorithm: "HS256",
    issuer: "my-app",
    audience: "my-api",
    enableAuditLog: true,
  }),
);

// Subscribe to audit events
validator.on("token_generated", (event) => {
  console.log("Token generated:", {
    jti: event.jti,
    sub: event.sub,
    timestamp: event.timestamp,
  });
});

validator.on("token_validated", (event) => {
  console.log("Token validated:", {
    jti: event.jti,
    sub: event.sub,
  });
});

validator.on("validation_failed", (event) => {
  console.error("Validation failed:", {
    error: event.error,
    errorType: event.errorType,
  });
});

validator.on("replay_detected", (event) => {
  console.warn("SECURITY: Token replay detected:", {
    jti: event.jti,
    sub: event.sub,
  });
});

validator.on("algorithm_mismatch", (event) => {
  console.warn("SECURITY: Algorithm mismatch detected:", {
    expected: event.expected,
    received: event.received,
  });
});
```

### Example 6: Statistics and Monitoring

```javascript
// Get validator statistics
const stats = validator.getStats();

console.log("JWT Validator Statistics:", {
  tokensGenerated: stats.tokensGenerated,
  tokensValidated: stats.tokensValidated,
  validationFailures: stats.validationFailures,
  algorithmMismatch: stats.algorithmMismatch,
  expiredTokens: stats.expiredTokens,
  invalidSignature: stats.invalidSignature,
  replayAttempts: stats.replayAttempts,
  trackedJtis: stats.trackedJtis,
});

// Reset statistics
validator.resetStats();
```

---

## Attack Prevention

### 1. Algorithm Confusion Attack

**Attack Scenario**:

```javascript
// Attacker modifies token header to use 'none' algorithm
// Header: { "alg": "none", "typ": "JWT" }
```

**Prevention**:

```javascript
// Validator automatically rejects 'none' algorithm
try {
  validator.verify(maliciousToken);
} catch (error) {
  // Error: Algorithm "none" is not allowed
}

// Validator checks header algorithm before verification
validator.on("algorithm_mismatch", (event) => {
  console.warn("Attack detected!", event);
});
```

### 2. Token Replay Attack

**Attack Scenario**:

```javascript
// Attacker captures a valid token and reuses it
const stolenToken = "..."; // Intercepted token
```

**Prevention**:

```javascript
// First use: succeeds
validator.verify(stolenToken); // ✓ Valid

// Second use: fails (replay detected)
try {
  validator.verify(stolenToken);
} catch (error) {
  // Error: Token replay detected: JTI has already been used
}
```

### 3. Weak Key Attack

**Attack Scenario**:

```javascript
// Attacker tries to brute-force weak secret
const weakSecret = "password123";
```

**Prevention**:

```javascript
// Validator rejects weak secrets at initialization
try {
  new JWTValidator({
    secret: "password123", // Only 11 bytes
    algorithm: "HS256", // Requires 32 bytes minimum
    issuer: "test",
    audience: "test",
  });
} catch (error) {
  // Error: Secret is too weak for HS256. Minimum 256 bits required
}
```

### 4. Algorithm Switching Attack (RS256 to HS256)

**Attack Scenario**:

```javascript
// Attacker changes RS256 token to HS256 using public key as secret
// If server accepts HS256 where RS256 was expected, signature can be forged
```

**Prevention**:

```javascript
// Validator enforces allowed algorithms
const validator = new JWTValidator({
  algorithm: "RS256",
  allowedAlgorithms: ["RS256"], // Only RS256 accepted
  publicKey: rsaPublicKey,
  issuer: "test",
  audience: "test",
});

// Token with HS256 algorithm is rejected
try {
  validator.verify(hs256Token);
} catch (error) {
  // Error: Algorithm mismatch: expected one of [RS256], got HS256
}
```

---

## Best Practices

### 1. Secret Management

✅ **DO**:

- Generate secrets with `crypto.randomBytes(64).toString('hex')`
- Store secrets in environment variables or secret management systems (AWS Secrets Manager, HashiCorp Vault)
- Use different secrets for different environments (dev, staging, prod)
- Rotate secrets regularly (e.g., quarterly)
- Use asymmetric algorithms (RS256, ES256) in production for easier key rotation

❌ **DON'T**:

- Hard-code secrets in source code
- Use weak or predictable secrets
- Share secrets across applications
- Commit secrets to version control

### 2. Algorithm Selection

**Recommended algorithms by use case**:

| Use Case                               | Recommended Algorithm | Key Size     | Notes                   |
| -------------------------------------- | --------------------- | ------------ | ----------------------- |
| Internal services (same secret)        | HS256, HS384          | 256-384 bits | Fast, simple            |
| Public APIs (distributed verification) | RS256, ES256          | 2048+ bits   | Public key distribution |
| High security requirements             | RS512, ES512          | 4096+ bits   | Maximum security        |
| Performance-critical                   | ES256                 | 256 bits     | Fast ECDSA              |

### 3. Token Expiration

**Recommended expiration times**:

| Token Type    | Expiration    | Use Case           |
| ------------- | ------------- | ------------------ |
| Access Token  | 15-60 minutes | API authentication |
| Refresh Token | 7-30 days     | Token renewal      |
| Session Token | 8-24 hours    | User sessions      |
| API Key       | No expiration | Service-to-service |

```javascript
// Short-lived access tokens
const accessToken = validator.sign(
  { sub: "user-123" },
  { expiresIn: 900 }, // 15 minutes
);

// Long-lived refresh tokens (separate validator recommended)
const refreshToken = validator.sign(
  { sub: "user-123", type: "refresh" },
  { expiresIn: 604800 }, // 7 days
);
```

### 4. Claims to Include

**Required claims**:

- `sub` (subject): User ID or principal
- `iss` (issuer): Application identifier
- `aud` (audience): Intended recipient
- `iat` (issued at): Token creation time
- `exp` (expiration): Token expiration time
- `jti` (JWT ID): Unique token identifier

**Recommended custom claims**:

- `roles` or `permissions`: User authorization
- `tenant`: Multi-tenant identifier
- `email`: User email (if needed)
- `session_id`: Session tracking

**Avoid including**:

- Sensitive data (passwords, credit cards, SSNs)
- Large data structures (keep tokens small)
- Mutable data (preferences that change frequently)

### 5. Production Deployment

```javascript
// Production configuration example
const validator = new JWTValidator(
  createJWTConfig({
    algorithm: "RS256", // Asymmetric algorithm
    allowedAlgorithms: ["RS256"], // Strict algorithm enforcement
    publicKey: loadFromSecretStore(), // Load from secure storage
    privateKey: loadFromSecretStore(),
    issuer: "production-app",
    audience: "production-api",
    clockTolerance: 30, // Minimal tolerance
    maxTokenAge: 900, // 15 minutes
    requireJti: true, // Mandatory JWT ID
    requireSub: true, // Mandatory subject
    strictValidation: true, // Strict mode
    enableJtiTracking: true, // Replay protection
    enableAuditLog: true, // Security auditing
  }),
);

// Set up monitoring
validator.on("replay_detected", (event) => {
  alertSecurityTeam("Token replay detected", event);
});

validator.on("algorithm_mismatch", (event) => {
  alertSecurityTeam("Algorithm confusion attack", event);
});

// Periodic statistics logging
setInterval(() => {
  const stats = validator.getStats();
  logToMonitoringSystem("jwt_stats", stats);
}, 60000); // Every minute
```

---

## Troubleshooting

### Common Errors

#### 1. "Secret is too weak for HS256"

**Cause**: JWT secret has fewer than 256 bits (32 bytes) for HS256.

**Solution**:

```bash
# Generate a strong secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Set in environment
export JWT_SECRET="generated-secret-here"
```

#### 2. "Algorithm mismatch: expected [HS256], got HS384"

**Cause**: Token was signed with a different algorithm than configured.

**Solution**:

```javascript
// Ensure algorithm matches token signing
const validator = new JWTValidator({
  algorithm: "HS256",
  allowedAlgorithms: ["HS256", "HS384"], // Allow both
  // ...
});
```

#### 3. "Token replay detected: JTI has already been used"

**Cause**: Token is being reused (possible attack or client error).

**Solution**:

```javascript
// If legitimate use case, disable JTI tracking
const validator = new JWTValidator({
  enableJtiTracking: false, // Disable replay protection
  requireJti: false,
  // ...
});

// Or clear tracking for testing
validator.clearJtiTracking();
```

#### 4. "JWT token has expired"

**Cause**: Token's `exp` claim has passed.

**Solution**:

```javascript
// Option 1: Increase token expiration
const token = validator.sign(
  { sub: "user-123" },
  { expiresIn: 3600 }, // 1 hour instead of default
);

// Option 2: Implement token refresh mechanism
function refreshToken(expiredToken) {
  const payload = validator.decode(expiredToken); // Decode without verification
  return validator.sign({
    sub: payload.sub,
    // Copy other non-sensitive claims
  });
}
```

#### 5. "Missing required claims: jti, sub"

**Cause**: Token doesn't include required JTI or subject claims.

**Solution**:

```javascript
// Option 1: Include required claims
const token = validator.sign({
  sub: "user-123", // Subject is required
  // jti is auto-generated
});

// Option 2: Disable requirement
const validator = new JWTValidator({
  requireJti: false,
  requireSub: false,
  // ...
});
```

### Debug Mode

```javascript
// Enable detailed logging
const validator = new JWTValidator({
  secret: process.env.JWT_SECRET,
  algorithm: "HS256",
  issuer: "my-app",
  audience: "my-api",
  enableAuditLog: true, // Enable all events
});

// Log all events
validator.on("token_generated", console.log);
validator.on("token_validated", console.log);
validator.on("validation_failed", console.error);
validator.on("replay_detected", console.warn);
validator.on("algorithm_mismatch", console.warn);
validator.on("signing_error", console.error);
```

---

## API Reference

### JWTValidator Class

#### Constructor

```typescript
new JWTValidator(options: JWTValidatorOptions)
```

**Options**:

```typescript
interface JWTValidatorOptions {
  // Algorithm configuration
  algorithm: string; // Default: 'HS256'
  allowedAlgorithms: string[]; // Default: ['HS256']

  // Secret/Key configuration
  secret?: string; // Required for HMAC (HS*)
  publicKey?: string; // Required for asymmetric (RS*, ES*, PS*)
  privateKey?: string; // Required for signing with asymmetric

  // Issuer and audience
  issuer: string; // Token issuer
  audience: string; // Token audience

  // Timing configuration
  clockTolerance?: number; // Default: 30 seconds
  maxTokenAge?: number; // Default: 3600 seconds (1 hour)
  notBeforeTolerance?: number; // Default: 30 seconds

  // Security options
  requireJti?: boolean; // Default: true
  requireSub?: boolean; // Default: true
  strictValidation?: boolean; // Default: true

  // JTI tracking
  enableJtiTracking?: boolean; // Default: true
  jtiExpirationMs?: number; // Default: 7 days

  // Validation
  validateClaims?: Record<string, any>; // Custom claim validation

  // Audit logging
  enableAuditLog?: boolean; // Default: true
}
```

#### Methods

**sign(payload, options?)**

Generate a signed JWT token.

```typescript
sign(payload: object, options?: SignOptions): string

interface SignOptions {
  expiresIn?: number;    // Expiration in seconds
  notBefore?: number;    // Not before timestamp
  jti?: string;          // Custom JWT ID
}
```

**verify(token, options?)**

Verify and decode a JWT token.

```typescript
verify(token: string, options?: VerifyOptions): object

interface VerifyOptions {
  maxAge?: string;       // Maximum token age (e.g., '1h')
}
```

**decode(token)**

Decode token without verification (use with caution).

```typescript
decode(token: string): object
```

**getStats()**

Get validator statistics.

```typescript
getStats(): JWTStats

interface JWTStats {
  tokensGenerated: number;
  tokensValidated: number;
  validationFailures: number;
  algorithmMismatch: number;
  expiredTokens: number;
  invalidSignature: number;
  replayAttempts: number;
  trackedJtis: number;
}
```

**resetStats()**

Reset statistics counters.

```typescript
resetStats(): void
```

**clearJtiTracking()**

Clear JTI replay tracking.

```typescript
clearJtiTracking(): void
```

**destroy()**

Cleanup resources and stop background tasks.

```typescript
destroy(): void
```

#### Events

```typescript
// Token generated
validator.on('token_generated', (event: TokenGeneratedEvent) => void)

// Token validated
validator.on('token_validated', (event: TokenValidatedEvent) => void)

// Validation failed
validator.on('validation_failed', (event: ValidationFailedEvent) => void)

// Replay detected
validator.on('replay_detected', (event: ReplayDetectedEvent) => void)

// Algorithm mismatch
validator.on('algorithm_mismatch', (event: AlgorithmMismatchEvent) => void)

// Signing error
validator.on('signing_error', (event: SigningErrorEvent) => void)

// JTI cleanup
validator.on('jti_cleanup', (event: JtiCleanupEvent) => void)
```

---

## Security Checklist

Before deploying to production, verify:

- [ ] Strong secret generated (64+ bytes for HMAC)
- [ ] Secret stored securely (environment variable or secret manager)
- [ ] Algorithm explicitly configured (not using defaults)
- [ ] `allowedAlgorithms` list is restrictive
- [ ] `none` algorithm explicitly rejected
- [ ] JTI tracking enabled for replay protection
- [ ] Token expiration appropriate for use case
- [ ] Required claims configured (`requireJti`, `requireSub`)
- [ ] Audit logging enabled
- [ ] Event handlers configured for security events
- [ ] Statistics monitoring configured
- [ ] Error handling implemented
- [ ] Token refresh mechanism implemented
- [ ] Rate limiting applied to token endpoints
- [ ] HTTPS enforced for token transmission

---

## Additional Resources

- [RFC 7519 - JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)
- [RFC 7515 - JSON Web Signature (JWS)](https://tools.ietf.org/html/rfc7515)
- [OWASP JWT Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [JWT.io Debugger](https://jwt.io/)

---

## Support

For questions or security concerns:

- File an issue: [GitHub Issues](https://github.com/your-org/rag-pipeline-utils/issues)
- Security vulnerabilities: security@your-org.com
