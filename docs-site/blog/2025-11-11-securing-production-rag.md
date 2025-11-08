---
slug: securing-production-rag-systems
title: "Securing Production RAG Systems: Lessons Learned"
authors: [ali]
tags: [security, production, best-practices, authentication]
date: "2025-11-11"
---

Production RAG systems handle sensitive data and require comprehensive security measures. This post shares hard-earned lessons from securing RAG deployments at scale, covering authentication, input validation, data privacy, and threat mitigation.

<!--truncate-->

## The Security Landscape

RAG systems introduce unique security challenges:

- **Data Exposure**: Vector databases contain embedded versions of sensitive documents
- **Prompt Injection**: Malicious queries can manipulate retrieval and generation
- **API Abuse**: High-cost LLM operations require rate limiting and authentication
- **Data Leakage**: Retrieved context may expose unauthorized information
- **Supply Chain**: Dependencies on external APIs and models

## Authentication & Authorization

### JWT-Based Authentication

RAG Pipeline Utils includes hardened JWT validation with security best practices:

```javascript
const { JwtValidator } = require("@devilsdev/rag-pipeline-utils");

const validator = new JwtValidator({
  issuer: "https://auth.example.com",
  audience: "rag-api",
  publicKeyUrl: "https://auth.example.com/.well-known/jwks.json",
  clockTolerance: 60, // 60 seconds for clock skew
  requiredClaims: ["sub", "scope"],
});

// Validate incoming requests
async function authenticateRequest(req) {
  const token = extractBearerToken(req.headers.authorization);

  try {
    const decoded = await validator.validate(token);

    // Check required scopes
    if (!decoded.scope?.includes("rag:query")) {
      throw new Error("Insufficient permissions");
    }

    return decoded;
  } catch (error) {
    throw new AuthenticationError("Invalid token: " + error.message);
  }
}
```

**Security Features**:

- Cryptographic signature verification (RS256, ES256)
- Automatic key rotation via JWKS
- Expiration and not-before validation
- Clock skew tolerance
- Audience and issuer verification

### API Key Management

For service-to-service authentication:

```javascript
const crypto = require("crypto");

class ApiKeyManager {
  constructor(options = {}) {
    this.keys = new Map(); // Use secure storage in production
    this.hashAlgorithm = "sha256";
  }

  generateKey(userId, scopes = []) {
    // Generate cryptographically secure key
    const key = crypto.randomBytes(32).toString("base64url");
    const hash = this.hashKey(key);

    this.keys.set(hash, {
      userId,
      scopes,
      createdAt: Date.now(),
      lastUsed: null,
    });

    // Return key only once
    return { key, hash };
  }

  hashKey(key) {
    return crypto.createHash(this.hashAlgorithm).update(key).digest("hex");
  }

  async validateKey(key) {
    const hash = this.hashKey(key);
    const keyData = this.keys.get(hash);

    if (!keyData) {
      throw new Error("Invalid API key");
    }

    // Update last used timestamp
    keyData.lastUsed = Date.now();

    return keyData;
  }
}
```

**Best Practices**:

- Never log or display keys after generation
- Store only hashed versions
- Implement key rotation policies
- Monitor key usage patterns
- Revoke compromised keys immediately

## Input Validation & Sanitization

### Preventing Prompt Injection

RAG Pipeline Utils includes robust input sanitization:

```javascript
const { InputSanitizer } = require("@devilsdev/rag-pipeline-utils");

const sanitizer = new InputSanitizer({
  maxLength: 2000,
  allowedPatterns: /^[a-zA-Z0-9\s.,!?'-]+$/,
  blockPatterns: [
    /ignore.*previous.*instructions/i,
    /system.*prompt/i,
    /you.*are.*now/i,
  ],
  stripHtml: true,
  normalizeWhitespace: true,
});

// Sanitize user queries
const query = sanitizer.sanitize(userInput);

// Additional validation
if (query.length < 3) {
  throw new ValidationError("Query too short");
}

if (sanitizer.containsBlockedPattern(query)) {
  throw new ValidationError("Query contains prohibited content");
}
```

**Protection Mechanisms**:

- Length limits (prevent resource exhaustion)
- Pattern blocking (detect injection attempts)
- HTML stripping (prevent XSS)
- Unicode normalization (prevent homoglyph attacks)
- Whitespace normalization (prevent evasion)

### SQL Injection Prevention

When integrating with databases:

```javascript
// NEVER do this:
const query = `SELECT * FROM docs WHERE id = ${userInput}`;

// ALWAYS use parameterized queries:
const query = "SELECT * FROM docs WHERE id = ?";
const results = await db.query(query, [userId]);

// Or use ORM with proper escaping:
const results = await Doc.findAll({
  where: { userId: db.escape(userId) },
});
```

## Data Privacy & Compliance

### Document-Level Access Control

Implement fine-grained permissions:

```javascript
class SecureRetriever {
  constructor(baseRetriever) {
    this.baseRetriever = baseRetriever;
  }

  async retrieve(query, userId, options = {}) {
    // Get all relevant documents
    const results = await this.baseRetriever.retrieve(query, options);

    // Filter based on user permissions
    const filtered = await this.filterByPermissions(results, userId);

    return filtered;
  }

  async filterByPermissions(documents, userId) {
    const permissions = await this.getUserPermissions(userId);

    return documents.filter((doc) => {
      // Check document-level ACL
      if (doc.metadata.acl) {
        return (
          doc.metadata.acl.includes(userId) || doc.metadata.acl.includes("*")
        );
      }

      // Check department/group access
      if (doc.metadata.department) {
        return permissions.departments.includes(doc.metadata.department);
      }

      return false;
    });
  }

  async getUserPermissions(userId) {
    // Fetch from auth service or cache
    return {
      departments: ["engineering", "product"],
      roles: ["developer"],
      customScopes: [],
    };
  }
}
```

### PII Detection & Redaction

Automatically detect and redact sensitive information:

```javascript
class PiiRedactor {
  constructor() {
    this.patterns = {
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
      creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
      phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    };
  }

  redact(text, options = {}) {
    let redacted = text;

    for (const [type, pattern] of Object.entries(this.patterns)) {
      if (options.preserve?.includes(type)) continue;

      redacted = redacted.replace(pattern, (match) => {
        return options.replacement || `[REDACTED_${type.toUpperCase()}]`;
      });
    }

    return redacted;
  }

  detect(text) {
    const findings = [];

    for (const [type, pattern] of Object.entries(this.patterns)) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        findings.push({
          type,
          value: match[0],
          index: match.index,
        });
      }
    }

    return findings;
  }
}

// Usage in pipeline
const redactor = new PiiRedactor();

async function queryWithPiiProtection(query, context) {
  // Check for PII in query
  const queryPii = redactor.detect(query);
  if (queryPii.length > 0) {
    logger.warn("PII detected in query", {
      types: queryPii.map((p) => p.type),
    });
  }

  // Redact PII from retrieved context
  const sanitizedContext = context.map((doc) => ({
    ...doc,
    content: redactor.redact(doc.content),
  }));

  return sanitizedContext;
}
```

## Rate Limiting & Abuse Prevention

### Token Bucket Algorithm

Implement fair rate limiting:

```javascript
class RateLimiter {
  constructor(options = {}) {
    this.capacity = options.capacity || 100;
    this.refillRate = options.refillRate || 10; // tokens per second
    this.buckets = new Map();
  }

  async checkLimit(userId) {
    const now = Date.now();
    let bucket = this.buckets.get(userId);

    if (!bucket) {
      bucket = {
        tokens: this.capacity,
        lastRefill: now,
      };
      this.buckets.set(userId, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = Math.floor(elapsed * this.refillRate);

    bucket.tokens = Math.min(this.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Check if request allowed
    if (bucket.tokens < 1) {
      const waitTime = (1 - bucket.tokens) / this.refillRate;
      throw new RateLimitError(`Rate limit exceeded. Retry in ${waitTime}s`);
    }

    // Consume token
    bucket.tokens -= 1;

    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      resetAt: now + ((this.capacity - bucket.tokens) / this.refillRate) * 1000,
    };
  }
}

// Apply to routes
const limiter = new RateLimiter({
  capacity: 100,
  refillRate: 10, // 10 requests per second
});

app.post("/api/query", async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = await limiter.checkLimit(userId);

    res.setHeader("X-RateLimit-Remaining", limit.remaining);
    res.setHeader("X-RateLimit-Reset", limit.resetAt);

    // Process query...
  } catch (error) {
    if (error instanceof RateLimitError) {
      return res.status(429).json({ error: error.message });
    }
    throw error;
  }
});
```

### Cost-Based Limiting

Limit based on computational cost:

```javascript
class CostBasedLimiter {
  constructor(options = {}) {
    this.monthlyBudget = options.monthlyBudget || 1000; // USD
    this.userBudgets = new Map();
  }

  async checkBudget(userId, estimatedCost) {
    const budget = this.getUserBudget(userId);

    if (budget.spent + estimatedCost > budget.limit) {
      throw new BudgetExceededError(
        `Monthly budget exceeded. Used $${budget.spent.toFixed(2)} of $${budget.limit}`,
      );
    }

    return budget;
  }

  async recordCost(userId, actualCost) {
    const budget = this.getUserBudget(userId);
    budget.spent += actualCost;

    logger.info("Cost recorded", {
      userId,
      cost: actualCost,
      totalSpent: budget.spent,
      remaining: budget.limit - budget.spent,
    });
  }

  getUserBudget(userId) {
    if (!this.userBudgets.has(userId)) {
      this.userBudgets.set(userId, {
        limit: this.monthlyBudget,
        spent: 0,
        resetAt: this.getNextMonthStart(),
      });
    }
    return this.userBudgets.get(userId);
  }

  getNextMonthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
}
```

## Network Security

### TLS/SSL Configuration

Always use HTTPS in production:

```javascript
const https = require("https");
const fs = require("fs");

const options = {
  key: fs.readFileSync("certs/private-key.pem"),
  cert: fs.readFileSync("certs/certificate.pem"),
  ca: fs.readFileSync("certs/ca-bundle.pem"),

  // Modern security settings
  minVersion: "TLSv1.3",
  ciphers: [
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
  ].join(":"),

  // Security headers
  honorCipherOrder: true,
  sessionTimeout: 300,
};

const server = https.createServer(options, app);
```

### CORS Configuration

Restrict cross-origin requests:

```javascript
const cors = require("cors");

app.use(
  cors({
    origin: ["https://app.example.com", "https://admin.example.com"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["X-RateLimit-Remaining"],
    credentials: true,
    maxAge: 86400, // 24 hours
  }),
);
```

## Monitoring & Incident Response

### Security Event Logging

Log all security-relevant events:

```javascript
const logger = require("./logger");

class SecurityLogger {
  logAuthFailure(userId, reason, metadata = {}) {
    logger.warn("Authentication failed", {
      event: "auth.failure",
      userId,
      reason,
      ip: metadata.ip,
      userAgent: metadata.userAgent,
      timestamp: new Date().toISOString(),
    });
  }

  logRateLimitExceeded(userId, endpoint) {
    logger.warn("Rate limit exceeded", {
      event: "rate_limit.exceeded",
      userId,
      endpoint,
      timestamp: new Date().toISOString(),
    });
  }

  logSuspiciousQuery(userId, query, reason) {
    logger.warn("Suspicious query detected", {
      event: "query.suspicious",
      userId,
      queryHash: this.hashQuery(query),
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  hashQuery(query) {
    return require("crypto")
      .createHash("sha256")
      .update(query)
      .digest("hex")
      .substring(0, 16);
  }
}
```

### Anomaly Detection

Monitor for unusual patterns:

```javascript
class AnomalyDetector {
  constructor() {
    this.baselines = new Map();
  }

  async detectAnomalies(userId, metrics) {
    const baseline = this.getBaseline(userId);
    const anomalies = [];

    // Check query rate
    if (metrics.queryRate > baseline.avgQueryRate * 3) {
      anomalies.push({
        type: "high_query_rate",
        severity: "medium",
        value: metrics.queryRate,
        baseline: baseline.avgQueryRate,
      });
    }

    // Check query complexity
    if (metrics.avgQueryLength > baseline.avgQueryLength * 2) {
      anomalies.push({
        type: "unusually_long_queries",
        severity: "low",
        value: metrics.avgQueryLength,
        baseline: baseline.avgQueryLength,
      });
    }

    // Check failure rate
    if (metrics.errorRate > 0.1) {
      anomalies.push({
        type: "high_error_rate",
        severity: "high",
        value: metrics.errorRate,
      });
    }

    return anomalies;
  }

  getBaseline(userId) {
    // Calculate from historical data
    return {
      avgQueryRate: 10, // queries per minute
      avgQueryLength: 50, // characters
      avgErrorRate: 0.02, // 2%
    };
  }
}
```

## Security Checklist

Before deploying to production:

- [ ] **Authentication**: JWT validation with proper key rotation
- [ ] **Authorization**: Document-level access control implemented
- [ ] **Input Validation**: Query sanitization and length limits
- [ ] **Rate Limiting**: Token bucket or cost-based limiting
- [ ] **TLS/SSL**: HTTPS with modern cipher suites
- [ ] **CORS**: Whitelist allowed origins
- [ ] **Secrets**: Use environment variables or secret managers
- [ ] **Dependencies**: Regular security updates (`npm audit`)
- [ ] **Logging**: Security events logged to SIEM
- [ ] **Monitoring**: Anomaly detection alerts configured
- [ ] **PII Protection**: Redaction policies enforced
- [ ] **Incident Response**: Runbooks and escalation paths defined
- [ ] **Penetration Testing**: Third-party security assessment completed

## Lessons Learned

1. **Defense in Depth**: No single security measure is sufficient
2. **Fail Secure**: Default to denying access, not granting it
3. **Least Privilege**: Grant minimum necessary permissions
4. **Audit Everything**: Comprehensive logging enables forensics
5. **Automate Security**: Manual processes are error-prone
6. **Stay Updated**: Security is an ongoing process, not a one-time task

## Further Reading

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [RAG Pipeline Utils Security](/docs/Security)
- [API Reference](/docs/API-Reference)
