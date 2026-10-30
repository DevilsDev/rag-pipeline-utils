# Security Guide

This comprehensive security guide covers best practices, threat mitigation, and security configurations for **@devilsdev/rag-pipeline-utils**. From API key management to data privacy and plugin security, this guide ensures your RAG pipeline deployments are secure and compliant.

---

## **Security Overview**

### **Security Principles**

- **Defense in Depth**: Multiple layers of security controls
- **Least Privilege**: Minimal access rights for components
- **Zero Trust**: Verify everything, trust nothing
- **Data Privacy**: Protect sensitive information throughout the pipeline
- **Secure by Default**: Security-first configuration defaults

### **Threat Model**

**Common Threats**:

- API key exposure and misuse
- Prompt injection attacks
- Data exfiltration through embeddings
- Malicious plugin execution
- Man-in-the-middle attacks
- Unauthorized access to vector stores

---

## **Authentication & Authorization**

### **API Key Management**

**Secure Storage**:

```bash
# Use environment variables (recommended)
export OPENAI_API_KEY="sk-your-secure-key-here"
export PINECONE_API_KEY="your-pinecone-key"

# Use secure key management services
export OPENAI_API_KEY=$(aws secretsmanager get-secret-value --secret-id openai-key --query SecretString --output text)
```

**Configuration Security**:

Keep API keys out of `.ragrc.json`. The built-in connectors read their key from the environment when they are constructed (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `COHERE_API_KEY`) unless you pass `apiKey` explicitly, and a call without a key fails fast with the error code `MISSING_API_KEY`. `rag-pipeline doctor` reports missing API key variables for the configured stages.

```json
{
  "pipeline": [
    { "stage": "loader", "name": "auto" },
    { "stage": "embedder", "name": "openai" },
    { "stage": "retriever", "name": "file-store" },
    { "stage": "llm", "name": "openai", "config": { "model": "gpt-4o-mini" } }
  ]
}
```

Connectors retry only transient failures (network errors, 408/409/425/429/5xx) with exponential backoff and honour `Retry-After`.

**Key Rotation Strategy** (application code, not part of this package):

```javascript
// Implement automatic key rotation
class SecureKeyManager {
  constructor(options = {}) {
    this.keyRotationInterval = options.rotationInterval || 86400000; // 24 hours
    this.keyStore = options.keyStore; // AWS Secrets Manager, HashiCorp Vault, etc.
    this.currentKeys = new Map();
  }

  async rotateKeys() {
    const services = ["openai", "pinecone", "cohere"];

    for (const service of services) {
      try {
        const newKey = await this.generateNewKey(service);
        await this.updateServiceKey(service, newKey);
        await this.keyStore.storeKey(service, newKey);

        // Keep old key for graceful transition
        setTimeout(() => this.revokeOldKey(service), 300000); // 5 minutes

        console.log(`Successfully rotated key for ${service}`);
      } catch (error) {
        console.error(`Failed to rotate key for ${service}:`, error);
      }
    }
  }

  async getSecureKey(service) {
    // Check if key needs rotation
    const keyAge = Date.now() - this.currentKeys.get(service)?.timestamp;
    if (keyAge > this.keyRotationInterval) {
      await this.rotateKeys();
    }

    return this.keyStore.getKey(service);
  }
}
```

### **Access Control**

**Role-Based Access Control (RBAC)**:

```javascript
// Define user roles and permissions
const roles = {
  admin: {
    permissions: ["read", "write", "delete", "configure", "manage-users"],
    resources: ["*"],
  },
  developer: {
    permissions: ["read", "write", "configure"],
    resources: ["pipelines", "plugins", "evaluations"],
  },
  analyst: {
    permissions: ["read", "query"],
    resources: ["pipelines", "evaluations"],
  },
  viewer: {
    permissions: ["read"],
    resources: ["evaluations"],
  },
};

// Implement access control middleware
class AccessControl {
  constructor(roles) {
    this.roles = roles;
  }

  authorize(user, action, resource) {
    const userRole = this.roles[user.role];
    if (!userRole) return false;

    const hasPermission = userRole.permissions.includes(action);
    const hasResourceAccess =
      userRole.resources.includes("*") || userRole.resources.includes(resource);

    return hasPermission && hasResourceAccess;
  }

  middleware() {
    return (req, res, next) => {
      const { user, action, resource } = req;

      if (!this.authorize(user, action, resource)) {
        return res.status(403).json({ error: "Access denied" });
      }

      next();
    };
  }
}
```

**API Authentication**:

```javascript
// Implement JWT-based authentication
import jwt from "jsonwebtoken";

class AuthenticationManager {
  constructor(options = {}) {
    this.jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
    this.tokenExpiry = options.tokenExpiry || "1h";
    this.refreshTokenExpiry = options.refreshTokenExpiry || "7d";
  }

  generateTokens(user) {
    const accessToken = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        permissions: user.permissions,
      },
      this.jwtSecret,
      { expiresIn: this.tokenExpiry },
    );

    const refreshToken = jwt.sign(
      { userId: user.id, type: "refresh" },
      this.jwtSecret,
      { expiresIn: this.refreshTokenExpiry },
    );

    return { accessToken, refreshToken };
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error("Invalid or expired token");
    }
  }

  middleware() {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res
          .status(401)
          .json({ error: "Missing or invalid authorization header" });
      }

      const token = authHeader.substring(7);
      try {
        const decoded = this.verifyToken(token);
        req.user = decoded;
        next();
      } catch (error) {
        return res.status(401).json({ error: "Invalid token" });
      }
    };
  }
}
```

### **JWT Replay Protection**

The `JWTValidator` class includes replay protection that distinguishes between tokens it signed itself (reusable) and externally issued tokens (single-use by default):

**Setup:**

```javascript no-run
import { JWTValidator } from "@devilsdev/rag-pipeline-utils";

const validator = new JWTValidator({
  secret: process.env.JWT_SECRET,
  algorithm: "HS256",
  issuer: "my-app",
  audience: "api-users",
  strictValidation: true, // Enforces iss/aud validation (default true)
  enableJtiTracking: true, // Replay protection (default true)
  singleUseTokens: true, // External tokens are single-use (default true)
  maxTrackedJtis: 100000, // Bound on the replay store (default 100000)
});
```

With `singleUseTokens: true` (the default since 2.5.0), every externally issued token can be verified once; a second `verify()` of the same `jti` throws "Token replay detected". If your API accepts the same bearer token on many requests until it expires, pass `singleUseTokens: false`. The replay store is bounded by `maxTrackedJtis`: entries expire with the token, and when the store is full the least recently used entry is evicted (a `jti_evicted` event is emitted), so size it for your peak number of live tokens. An explicit `clockTolerance` or `notBeforeTolerance` of `0` is honoured (2.5.0 fix; it previously became 30 seconds).

**Self-Signed Tokens (Reusable):**

```javascript
// Generate a token that can be verified multiple times
const token = validator.sign({ sub: "user-123" });

// First verification - works
const decoded1 = validator.verify(token);

// Second verification - still works! (for refresh flows)
const decoded2 = validator.verify(token);
```

**External Tokens (Single-Use):**

```javascript
// External tokens from third parties
const externalToken = getTokenFromOAuthProvider();

// First use - works
validator.verify(externalToken);

// Second use - throws "Token replay detected"
try {
  validator.verify(externalToken);
} catch (error) {
  console.log("Replay attack prevented:", error.message);
}
```

**Key Features:**

- **Race Condition Mitigation**: a check-then-set pattern limits concurrent replays within one process
- **Separate Tracking**: Self-signed and external tokens tracked independently
- **Consistent Validation**: `strictValidation` flag now properly controls iss/aud checks
- **Replay events**: each replay attempt increments `stats.replayAttempts` and emits a `replay_detected` event; nothing is logged unless you listen for it. The JTI store is in memory per `JWTValidator` instance, so replays across processes or after a restart are not detected

---

## **Data Protection**

### **Encryption**

**Data at Rest**:

```javascript
// Application code: encrypt sensitive data before storage
// (use a random salt per key in production)
import crypto from "crypto";

class DataEncryption {
  constructor(encryptionKey) {
    this.algorithm = "aes-256-gcm";
    this.key = crypto.scryptSync(encryptionKey, "salt", 32);
  }

  encrypt(data) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
    };
  }

  decrypt(encryptedData) {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(encryptedData.iv, "hex"),
    );

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, "hex"));

    let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
  }
}

// Use encryption for sensitive configurations
const encryption = new DataEncryption(process.env.ENCRYPTION_KEY);
const encryptedConfig = encryption.encrypt(sensitiveConfig);
```

**Data in Transit**:

`createRagPipeline` has no transport or TLS settings; it accepts only `{ loader, embedder, retriever, llm, reranker, cache, registry }`. The built-in connectors default to HTTPS endpoints (OpenAI through the optional `openai` SDK, Anthropic and Cohere through axios); a custom `baseURL` is your responsibility. Enforce TLS at your own HTTP layer (load balancer, reverse proxy or Node `https` server), and keep `rag-pipeline serve` / `DevServer` on loopback: they bind to `127.0.0.1` by default, accept JSON only with a 64 KB body limit, send no CORS headers and are meant for local use.

### **Data Sanitization**

**Input Validation with built-in helpers**:

```javascript no-run
import {
  validateInput,
  PreRetrievalGuard,
  detectInjection,
} from "@devilsdev/rag-pipeline-utils";

// Length and disallowed-token check: returns { valid, reasons, sanitized }
const basic = validateInput(userQuery, { maxLength: 2000 });
if (!basic.valid) throw new Error(basic.reasons.join("; "));

// Prompt-injection check on the query: returns
// { safe, issues, sanitizedQuery, injection: { detected, matches } }
const guard = new PreRetrievalGuard({ maxQueryLength: 2000 });
const check = guard.check(userQuery);
if (!check.safe) {
  // The query is never rewritten; blocking is up to you
  // (GuardrailsPipeline blocks in strict mode).
  throw new Error(`Blocked query: ${check.issues.join("; ")}`);
}

// Scan arbitrary text (e.g. a retrieved document) for indirect injection:
// returns { detected, matches: [{ id, pattern, match }], normalized }
const scan = detectInjection(documentText);
```

Detection normalises input first (homoglyphs, leetspeak folding and zero-width characters), and flags chat role markers, instruction overrides and prompt-exfiltration phrasing. It is pattern based, so treat it as one layer of defence, not a guarantee.

**Custom Input Sanitizer** (application code, not part of this package):

```javascript
// Sanitize user inputs to prevent injection attacks
class QuerySanitizer {
  constructor() {
    this.maxQueryLength = 1000;
    this.allowedCharacters = /^[a-zA-Z0-9\s\-_.,!?'"()]+$/;
    this.blockedPatterns = [
      /system\s*:/i,
      /assistant\s*:/i,
      /ignore\s+previous/i,
      /forget\s+everything/i,
      /<script/i,
      /javascript:/i,
    ];
  }

  sanitizeQuery(query) {
    // Length validation
    if (query.length > this.maxQueryLength) {
      throw new Error("Query exceeds maximum length");
    }

    // Character validation
    if (!this.allowedCharacters.test(query)) {
      throw new Error("Query contains invalid characters");
    }

    // Pattern blocking
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(query)) {
        throw new Error("Query contains blocked patterns");
      }
    }

    // HTML encoding
    return query
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  sanitizeMetadata(metadata) {
    const sanitized = {};

    for (const [key, value] of Object.entries(metadata)) {
      // Validate key
      if (!/^[a-zA-Z0-9_]+$/.test(key)) {
        continue; // Skip invalid keys
      }

      // Sanitize value
      if (typeof value === "string") {
        sanitized[key] = this.sanitizeQuery(value);
      } else if (typeof value === "number") {
        sanitized[key] = value;
      } else if (typeof value === "boolean") {
        sanitized[key] = value;
      }
      // Skip other types
    }

    return sanitized;
  }
}
```

**Output Filtering**:

```javascript
// Filter sensitive information from outputs
class OutputFilter {
  constructor() {
    this.sensitivePatterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
      /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card
      /\bsk-[a-zA-Z0-9]{48}\b/g, // OpenAI API key
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, // UUID
    ];
  }

  filterSensitiveData(text) {
    let filtered = text;

    for (const pattern of this.sensitivePatterns) {
      filtered = filtered.replace(pattern, "[REDACTED]");
    }

    return filtered;
  }

  filterResponse(response) {
    return {
      ...response,
      content: this.filterSensitiveData(response.content),
      sources: response.sources?.map((source) => ({
        ...source,
        content: this.filterSensitiveData(source.content),
      })),
    };
  }
}
```

### **Path Handling**

The package does not export a path sanitizer. If your application turns user input into file paths (for example a document viewer or an ingestion endpoint), resolve the path against a fixed base directory and reject anything that escapes it:

```javascript
import path from "node:path";

function resolveInside(baseDir, userPath) {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, userPath);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error("Path escapes the base directory");
  }
  return target;
}
```

Decode URL-encoded input once before this check, and reject input that still contains `%` sequences, NUL bytes or absolute paths if your application does not need them.

---

## **Plugin Security**

### **Plugins run in-process**

Plugins (loaders, embedders, retrievers, LLMs, rerankers) run in the same Node.js process as your application, with its permissions. There is no working sandbox: `PluginSandbox` is an experimental module that cannot currently be constructed (its constructor throws), and it does not isolate plugins (see [Experimental](./Experimental.md)). Only install plugins you have reviewed or whose publisher you trust, and run the pipeline under an operating-system account or container with the least privileges it needs.

### **Installing plugins with the CLI**

`rag-pipeline hub install <source>` (alias `plugin install`) installs a plugin from a local directory, a `.tgz`, a single `.js` file, `npm:<package>` or a registry (registry downloads are sha256-verified). The installer:

- extracts into `.rag/plugins` and refuses entries that would escape that directory;
- runs a static security scan; high-risk findings block the install unless you pass `--allow-risky`;
- checks the stage contract (for example `embed()` for an embedder) in a separate process;
- registers the plugin in `.ragrc.json`.

There is no default registry: registry operations need `--registry <url>` or `RAG_PLUGIN_REGISTRY`. `rag-pipeline hub certify check <path>` scores a local plugin from its files (contract, security scan, tests, documentation). These checks reduce risk; they do not make untrusted code safe to run. See the [CLI reference](./CLI.md) for all options.

### **Plugin Signature Verification**

`pluginRegistry.register(category, name, impl, manifest, { content })` verifies an Ed25519-signed manifest when signature verification is enabled. The exported `pluginRegistry` singleton enables verification and fails closed when `NODE_ENV` is `production`.

- **Empty trust store**: since 2.5.0 the trust store starts empty (the placeholder key was removed). Nothing verifies until you add a signer, either with `addTrustedSigner(signerId, publicKey, name)` on a `PluginSignatureVerifier` or through a `trustedKeysPath` JSON file.
- **Binding the code**: the signed manifest can contain a `contentDigest` that covers the plugin's files. When a manifest declares one, the plugin content must be supplied (`register(..., { content })`) and must match, otherwise verification fails. `requireContentDigest: true` rejects signed manifests that do not bind the code.
- **Unsigned plugins**: by default a plugin registered without a manifest is still accepted. A registry created with `requireSignedPlugins: true` refuses them while verification is enabled.
- Plugins listed in a JSON plugin config are verified (signed manifest and plugin files) before they are imported.

```javascript no-run
import { PluginSignatureVerifier } from "@devilsdev/rag-pipeline-utils";

const verifier = new PluginSignatureVerifier({ requireContentDigest: true });
verifier.addTrustedSigner("acme", acmePublicKeyPem, "Acme Plugins");

const result = await verifier.verifyPluginSignature(
  manifest, // includes contentDigest
  manifest.signature, // base64 Ed25519 signature
  "acme",
  { files: ["index.js"], baseDir: pluginDir },
);
if (!result.verified) throw new Error(result.error);
```

---

## **Monitoring & Auditing**

### **Audit Logging with AuditLogger**

`AuditLogger` records authentication, authorization, data access, data modification, system change, API access and compliance events, and can query them, build compliance reports and verify their integrity.

```javascript no-run
import { AuditLogger } from "@devilsdev/rag-pipeline-utils";

const audit = new AuditLogger({
  encryptionKey: process.env.RAG_AUDIT_ENCRYPTION_KEY, // or set the env var
  requireEncryption: true, // a missing key is an error instead of a warning
  signingKey: process.env.RAG_AUDIT_SIGNING_KEY, // stable HMAC key across restarts
});

// Event and query fields use the underscore names the logger reads
await audit.logDataAccess({
  _action: "query",
  _tenantId: "acme",
  _userId: "u-42",
  dataType: "document",
  recordCount: 3,
  result: "success",
});
const records = await audit.queryLogs({ _tenantId: "acme", limit: 100 });
const integrity = await audit.verifyIntegrity();
```

Behaviour since 2.5.0:

- The encryption key comes from `encryptionKey` or `RAG_AUDIT_ENCRYPTION_KEY`. With encryption enabled and no key, encryption is disabled with a warning (it previously used a throwaway per-process key that made logs unreadable after a restart); `requireEncryption: true` turns this into an error.
- Encryption uses `createCipheriv` with a random IV per field; legacy `createCipher` records still decrypt on Node 22+.
- Tenant, user and action filters in queries and compliance reports now match correctly (they previously returned every tenant's records).
- The integrity hash covers action and tenant, and HMAC signatures are compared in constant time.
- Without `signingKey`, the HMAC key is random per process, so `verifyIntegrity` flags records written before a restart. Pass a stable `signingKey` in production.

### **Security Logging** (application code)

```javascript
// Implement comprehensive security logging
class SecurityLogger {
  constructor(options = {}) {
    this.logLevel = options.logLevel || "info";
    this.logFile = options.logFile || "./security.log";
    this.enableAuditTrail = options.enableAuditTrail || true;
  }

  logSecurityEvent(event, details = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      severity: this.getSeverity(event),
      source: "rag-pipeline-utils",
      version: process.env.npm_package_version,
    };

    // Log to file
    fs.appendFileSync(this.logFile, JSON.stringify(logEntry) + "\n");

    // Send to SIEM if configured
    if (process.env.SIEM_ENDPOINT) {
      this.sendToSIEM(logEntry);
    }

    // Alert on high severity events
    if (logEntry.severity === "high" || logEntry.severity === "critical") {
      this.sendAlert(logEntry);
    }
  }

  getSeverity(event) {
    const severityMap = {
      authentication_failure: "medium",
      authorization_failure: "medium",
      plugin_execution_failure: "high",
      api_key_rotation: "low",
      suspicious_query: "medium",
      data_access_violation: "high",
      configuration_change: "medium",
    };

    return severityMap[event] || "low";
  }

  auditApiCall(req, res, next) {
    const startTime = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - startTime;

      this.logSecurityEvent("api_call", {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get("User-Agent"),
        ip: req.ip,
        user: req.user?.id,
      });
    });

    next();
  }
}
```

### **Anomaly Detection**

```javascript
// Detect suspicious activities
class AnomalyDetector {
  constructor(options = {}) {
    this.baselineWindow = options.baselineWindow || 3600000; // 1 hour
    this.anomalyThreshold = options.anomalyThreshold || 2.5; // Standard deviations
    this.metrics = new Map();
  }

  recordMetric(name, value) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const values = this.metrics.get(name);
    values.push({ value, timestamp: Date.now() });

    // Keep only recent values
    const cutoff = Date.now() - this.baselineWindow;
    this.metrics.set(
      name,
      values.filter((v) => v.timestamp > cutoff),
    );
  }

  detectAnomaly(name, currentValue) {
    const values = this.metrics.get(name);
    if (!values || values.length < 10) return false; // Need baseline

    const nums = values.map((v) => v.value);
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const variance =
      nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / nums.length;
    const stdDev = Math.sqrt(variance);

    const zScore = Math.abs(currentValue - mean) / stdDev;

    if (zScore > this.anomalyThreshold) {
      this.alertAnomaly(name, currentValue, mean, zScore);
      return true;
    }

    return false;
  }

  alertAnomaly(metric, value, baseline, zScore) {
    console.warn(
      `Anomaly detected in ${metric}: ${value} (baseline: ${baseline}, z-score: ${zScore})`,
    );

    // Send alert to monitoring system
    if (process.env.ALERT_WEBHOOK) {
      fetch(process.env.ALERT_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert: "anomaly_detected",
          metric,
          value,
          baseline,
          zScore,
          timestamp: new Date().toISOString(),
        }),
      });
    }
  }
}
```

---

## **Security Configuration**

### **Security-relevant settings in this package**

There is no global `security` block in `.ragrc.json` or in `createRagPipeline`. Security behaviour is configured on the individual components:

| Setting                                                            | Where                                                | Default                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------- |
| Signature verification / fail closed                               | `pluginRegistry` singleton                           | On when `NODE_ENV=production`, off otherwise            |
| `requireSignedPlugins`, `requireContentDigest`                     | `PluginRegistry` / `PluginSignatureVerifier` options | `false` (opt-in)                                        |
| Trusted signers                                                    | `addTrustedSigner()` or `trustedKeysPath`            | Empty trust store                                       |
| `singleUseTokens`, `maxTrackedJtis`, `strictValidation`            | `JWTValidator`                                       | `true`, `100000`, `true`                                |
| `encryptionKey`, `requireEncryption`, `signingKey`                 | `AuditLogger`                                        | `RAG_AUDIT_ENCRYPTION_KEY`, `false`, random per process |
| `enableInjectionDetection`, `maxQueryLength`                       | `PreRetrievalGuard`                                  | `true`, `10000`                                         |
| `enforceACL`, `detectInjection`, `minRelevanceScore`, `maxAgeDays` | `RetrievalGuard`                                     | `false`, `false`, `0`, `0`                              |
| `enablePIIDetection`, `enableGroundednessCheck`                    | `PostGenerationGuard`                                | `true`, `true`                                          |
| `strict`                                                           | `GuardrailsPipeline`                                 | `false` (issues are reported as warnings)               |
| Host / port / body limit                                           | `DevServer`, `rag-pipeline serve`                    | `127.0.0.1`, `3000`, 64 KB                              |

### **Environment-Specific Settings**

```javascript no-run
import {
  createRagPipeline,
  GuardrailsPipeline,
} from "@devilsdev/rag-pipeline-utils";

const isProduction = process.env.NODE_ENV === "production";

const safe = new GuardrailsPipeline(
  createRagPipeline({ embedder, retriever, llm }),
  {
    strict: isProduction, // block instead of warn in production
    retrieval: { enforceACL: true, detectInjection: true },
  },
);

// enforceACL fails closed: pass the caller's permissions on every run
const result = await safe.run({
  query: userQuestion,
  context: { userPermissions: user.roles },
});
```

Set `NODE_ENV=production` in production so the exported `pluginRegistry` verifies plugin signatures and fails closed.

---

## **Incident Response**

### **Security Incident Handling**

```javascript
// Automated incident response
class IncidentResponse {
  constructor(options = {}) {
    this.alertThresholds = options.alertThresholds || {
      failedLogins: 5,
      suspiciousQueries: 10,
      pluginFailures: 3,
    };
    this.responseActions = options.responseActions || {};
  }

  handleSecurityIncident(incident) {
    const { type, severity, details } = incident;

    // Log incident
    this.logIncident(incident);

    // Execute response actions
    switch (type) {
      case "authentication_failure":
        if (details.attempts >= this.alertThresholds.failedLogins) {
          this.blockIP(details.ip);
          this.notifyAdmins(incident);
        }
        break;

      case "suspicious_query":
        this.quarantineQuery(details.query);
        this.alertSecurityTeam(incident);
        break;

      case "plugin_compromise":
        this.disablePlugin(details.pluginId);
        this.initiateForensics(incident);
        break;

      case "data_breach":
        this.emergencyShutdown();
        this.notifyStakeholders(incident);
        break;
    }
  }

  blockIP(ip) {
    // Add IP to blocklist
    console.log(`Blocking IP: ${ip}`);
    // Implementation depends on your infrastructure
  }

  emergencyShutdown() {
    console.log("Initiating emergency shutdown");
    process.exit(1);
  }
}
```

---

## **Security Checklist**

### **Deployment Security**

- [ ] API keys stored securely (environment variables/secrets manager)
- [ ] HTTPS enforced for all communications
- [ ] Input validation and sanitization implemented
- [ ] Output filtering for sensitive data
- [ ] Plugins reviewed before install; signature verification enabled (`NODE_ENV=production`) with trusted signers configured
- [ ] `GuardrailsPipeline` with `enforceACL` and `context.userPermissions` where documents are access-controlled
- [ ] Authentication and authorization configured
- [ ] Audit logging enabled
- [ ] Anomaly detection active
- [ ] Incident response plan in place
- [ ] Regular security updates scheduled

### **Operational Security**

- [ ] Regular key rotation implemented
- [ ] Security monitoring dashboard configured
- [ ] Backup and recovery procedures tested
- [ ] Penetration testing completed
- [ ] Security training for team members
- [ ] Compliance requirements met
- [ ] Third-party security assessments conducted

---

## **Security Support**

### **Reporting Security Issues**

Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/DevilsDev/rag-pipeline-utils/security/advisories/new). The disclosure policy and response times are in [SECURITY.md](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SECURITY.md).

### **Security Resources**

- **Security Advisories**: [GitHub Security Advisories](https://github.com/DevilsDev/rag-pipeline-utils/security/advisories)
- **Capability status**: [Security Capabilities](./Security-Capabilities.md) lists what is implemented, partial or experimental.
- **Experimental modules**: [Experimental](./Experimental.md) documents the simulated SSO, tenancy, governance and sandbox modules. Do not rely on them for authentication, tenant isolation, compliance or plugin isolation.

---

## **3-Layer Guardrails**

`GuardrailsPipeline` (added in 2.4.0) wraps an existing pipeline with pre-retrieval, retrieval-time and post-generation checks:

```javascript no-run
import {
  createRagPipeline,
  GuardrailsPipeline,
} from "@devilsdev/rag-pipeline-utils";

const pipeline = createRagPipeline({ embedder, retriever, llm });

const safePipeline = new GuardrailsPipeline(pipeline, {
  preRetrieval: { enableInjectionDetection: true },
  retrieval: {
    minRelevanceScore: 0.6,
    enforceACL: true,
    detectInjection: true,
  },
  postGeneration: { enablePIIDetection: true, enableGroundednessCheck: true },
  strict: true,
});

const result = await safePipeline.run({
  query: userQuestion,
  context: { userPermissions: ["engineering"] },
});
```

### **Layer 1 -- Pre-Retrieval**

Runs on the query before anything is retrieved:

- **Prompt injection detection**: matches the query, after normalisation (NFKC, zero-width and control characters removed, homoglyph and leetspeak folding), against built-in rules such as chat role markers, instruction overrides and prompt-exfiltration phrasing. Since 2.5.0 the query is returned unchanged (no partial deletion) and findings are reported in `injection`; strict mode blocks. To cut false positives, bare "act as", "jailbreak", uppercase "DAN", a mid-line "system:" and "you are now ready" are no longer flagged.
- **Topic filtering** (opt-in): `blockedTopics` / `allowedTopics`.
- **Length limit**: `maxQueryLength` (default 10000).

### **Layer 2 -- Retrieval-Time**

Runs between retrieval and generation: `GuardrailsPipeline` passes the retrieval guard to the pipeline as the `options.filterResults` hook, so the LLM never sees documents the guard removes. Removed documents are reported by id only.

- **Relevance threshold**: drops results whose score is below `minRelevanceScore`.
- **Freshness filtering**: drops documents older than `maxAgeDays` (0 disables it).
- **ACL-based access control**: with `enforceACL: true`, documents are checked against `context.userPermissions`. Since 2.5.0 this fails closed: if `userPermissions` is missing, restricted documents are removed. The guard reads `acl` / `requiredRole` from each result or its `metadata`, which is where `MemoryRetriever` and `FileVectorStore` return them (see [Examples](./Examples.md)).
- **Indirect injection scan** (opt-in): `detectInjection: true` scans retrieved document text; `injectionAction: 'remove'` (default) drops flagged documents, `'flag'` keeps and marks them.

### **Layer 3 -- Post-Generation**

Checks the generated answer:

- **PII detection**: email addresses, phone numbers, Social Security numbers and credit card numbers. Since 2.5.0 PII is also redacted in citations and evaluation details, and strict-mode blocks no longer return the raw answer.
- **Groundedness check**: scores how much of each sentence is supported by the retrieved documents (lexical support plus a numeric-consistency check; negation and units are not checked), against `groundednessThreshold` (default 0.3).
- **Length validation**: `minResponseLength` / `maxResponseLength` (characters).

### **Combining Guardrails with Existing Security**

Guardrails complement, and do not replace, authentication, authorization, plugin review and audit logging in your application.

---

_For reporting vulnerabilities see [SECURITY.md](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SECURITY.md)._
