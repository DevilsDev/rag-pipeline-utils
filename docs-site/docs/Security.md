# Security Guide

This comprehensive security guide covers best practices, threat mitigation, and security configurations for **@DevilsDev/rag-pipeline-utils**. From API key management to data privacy and plugin security, this guide ensures your RAG pipeline deployments are secure and compliant.

---

## 🔐 **Security Overview**

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

## 🔑 **Authentication & Authorization**

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
```json
{
  "plugins": {
    "embedder": {
      "name": "openai",
      "config": {
        "apiKey": "${OPENAI_API_KEY}",  // Environment variable reference
        "organization": "${OPENAI_ORG_ID}",
        "timeout": 30000,
        "retryAttempts": 3
      }
    }
  },
  "security": {
    "encryptConfig": true,
    "configEncryptionKey": "${CONFIG_ENCRYPTION_KEY}",
    "auditLogging": true
  }
}
```

**Key Rotation Strategy**:
```javascript
// Implement automatic key rotation
class SecureKeyManager {
  constructor(options = {}) {
    this.keyRotationInterval = options.rotationInterval || 86400000; // 24 hours
    this.keyStore = options.keyStore; // AWS Secrets Manager, HashiCorp Vault, etc.
    this.currentKeys = new Map();
  }

  async rotateKeys() {
    const services = ['openai', 'pinecone', 'cohere'];
    
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
  'admin': {
    permissions: ['read', 'write', 'delete', 'configure', 'manage-users'],
    resources: ['*']
  },
  'developer': {
    permissions: ['read', 'write', 'configure'],
    resources: ['pipelines', 'plugins', 'evaluations']
  },
  'analyst': {
    permissions: ['read', 'query'],
    resources: ['pipelines', 'evaluations']
  },
  'viewer': {
    permissions: ['read'],
    resources: ['evaluations']
  }
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
    const hasResourceAccess = userRole.resources.includes('*') || 
                             userRole.resources.includes(resource);

    return hasPermission && hasResourceAccess;
  }

  middleware() {
    return (req, res, next) => {
      const { user, action, resource } = req;
      
      if (!this.authorize(user, action, resource)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      next();
    };
  }
}
```

**API Authentication**:
```javascript
// Implement JWT-based authentication
import jwt from 'jsonwebtoken';

class AuthenticationManager {
  constructor(options = {}) {
    this.jwtSecret = options.jwtSecret || process.env.JWT_SECRET;
    this.tokenExpiry = options.tokenExpiry || '1h';
    this.refreshTokenExpiry = options.refreshTokenExpiry || '7d';
  }

  generateTokens(user) {
    const accessToken = jwt.sign(
      { 
        userId: user.id, 
        role: user.role,
        permissions: user.permissions 
      },
      this.jwtSecret,
      { expiresIn: this.tokenExpiry }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      this.jwtSecret,
      { expiresIn: this.refreshTokenExpiry }
    );

    return { accessToken, refreshToken };
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  middleware() {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const token = authHeader.substring(7);
      try {
        const decoded = this.verifyToken(token);
        req.user = decoded;
        next();
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    };
  }
}
```

---

## 🛡️ **Data Protection**

### **Encryption**

**Data at Rest**:
```javascript
// Encrypt sensitive data before storage
import crypto from 'crypto';

class DataEncryption {
  constructor(encryptionKey) {
    this.algorithm = 'aes-256-gcm';
    this.key = crypto.scryptSync(encryptionKey, 'salt', 32);
  }

  encrypt(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  decrypt(encryptedData) {
    const decipher = crypto.createDecipher(
      this.algorithm, 
      this.key, 
      Buffer.from(encryptedData.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }
}

// Use encryption for sensitive configurations
const encryption = new DataEncryption(process.env.ENCRYPTION_KEY);
const encryptedConfig = encryption.encrypt(sensitiveConfig);
```

**Data in Transit**:
```javascript
// Enforce HTTPS and TLS
const pipeline = createRagPipeline({
  security: {
    enforceHTTPS: true,
    tlsVersion: '1.3',
    certificateValidation: true,
    
    // API client security
    apiClients: {
      openai: {
        timeout: 30000,
        validateCertificate: true,
        rejectUnauthorized: true
      },
      pinecone: {
        timeout: 10000,
        validateCertificate: true,
        customCA: process.env.PINECONE_CA_CERT
      }
    }
  }
});
```

### **Data Sanitization**

**Input Sanitization**:
```javascript
// Sanitize user inputs to prevent injection attacks
class InputSanitizer {
  constructor() {
    this.maxQueryLength = 1000;
    this.allowedCharacters = /^[a-zA-Z0-9\s\-_.,!?'"()]+$/;
    this.blockedPatterns = [
      /system\s*:/i,
      /assistant\s*:/i,
      /ignore\s+previous/i,
      /forget\s+everything/i,
      /<script/i,
      /javascript:/i
    ];
  }

  sanitizeQuery(query) {
    // Length validation
    if (query.length > this.maxQueryLength) {
      throw new Error('Query exceeds maximum length');
    }

    // Character validation
    if (!this.allowedCharacters.test(query)) {
      throw new Error('Query contains invalid characters');
    }

    // Pattern blocking
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(query)) {
        throw new Error('Query contains blocked patterns');
      }
    }

    // HTML encoding
    return query
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  sanitizeMetadata(metadata) {
    const sanitized = {};
    
    for (const [key, value] of Object.entries(metadata)) {
      // Validate key
      if (!/^[a-zA-Z0-9_]+$/.test(key)) {
        continue; // Skip invalid keys
      }
      
      // Sanitize value
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeQuery(value);
      } else if (typeof value === 'number') {
        sanitized[key] = value;
      } else if (typeof value === 'boolean') {
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
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g // UUID
    ];
  }

  filterSensitiveData(text) {
    let filtered = text;
    
    for (const pattern of this.sensitivePatterns) {
      filtered = filtered.replace(pattern, '[REDACTED]');
    }
    
    return filtered;
  }

  filterResponse(response) {
    return {
      ...response,
      content: this.filterSensitiveData(response.content),
      sources: response.sources?.map(source => ({
        ...source,
        content: this.filterSensitiveData(source.content)
      }))
    };
  }
}
```

---

## 🔒 **Plugin Security**

### **Plugin Sandboxing**

```javascript
// Implement secure plugin execution
import { VM } from 'vm2';

class SecurePluginRunner {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000;
    this.memoryLimit = options.memoryLimit || 128 * 1024 * 1024; // 128MB
    this.allowedModules = options.allowedModules || ['fs', 'path', 'crypto'];
  }

  async executePlugin(pluginCode, context = {}) {
    const vm = new VM({
      timeout: this.timeout,
      sandbox: {
        ...context,
        console: {
          log: (...args) => console.log('[Plugin]', ...args),
          error: (...args) => console.error('[Plugin]', ...args)
        },
        require: (module) => {
          if (!this.allowedModules.includes(module)) {
            throw new Error(`Module '${module}' is not allowed`);
          }
          return require(module);
        }
      },
      wasm: false,
      fixAsync: true
    });

    try {
      return await vm.run(pluginCode);
    } catch (error) {
      throw new Error(`Plugin execution failed: ${error.message}`);
    }
  }

  validatePlugin(plugin) {
    const validationRules = [
      {
        name: 'No eval usage',
        test: (code) => !code.includes('eval(')
      },
      {
        name: 'No Function constructor',
        test: (code) => !code.includes('new Function(')
      },
      {
        name: 'No process access',
        test: (code) => !code.includes('process.')
      },
      {
        name: 'No global access',
        test: (code) => !code.includes('global.')
      }
    ];

    const violations = validationRules.filter(rule => !rule.test(plugin.toString()));
    
    if (violations.length > 0) {
      throw new Error(`Plugin validation failed: ${violations.map(v => v.name).join(', ')}`);
    }
  }
}
```

### **Plugin Verification**

```javascript
// Verify plugin integrity and authenticity
import crypto from 'crypto';

class PluginVerifier {
  constructor(trustedPublishers = []) {
    this.trustedPublishers = trustedPublishers;
    this.signatureAlgorithm = 'sha256';
  }

  verifySignature(plugin, signature, publicKey) {
    const verify = crypto.createVerify(this.signatureAlgorithm);
    verify.update(plugin);
    verify.end();
    
    return verify.verify(publicKey, signature, 'hex');
  }

  async verifyPlugin(pluginPath) {
    const plugin = await fs.readFile(pluginPath, 'utf8');
    const metadata = await this.extractMetadata(plugin);
    
    // Check if publisher is trusted
    if (!this.trustedPublishers.includes(metadata.publisher)) {
      throw new Error(`Untrusted publisher: ${metadata.publisher}`);
    }
    
    // Verify digital signature
    const signature = metadata.signature;
    const publicKey = await this.getPublisherPublicKey(metadata.publisher);
    
    if (!this.verifySignature(plugin, signature, publicKey)) {
      throw new Error('Plugin signature verification failed');
    }
    
    // Check for known vulnerabilities
    await this.scanForVulnerabilities(plugin);
    
    return { verified: true, metadata };
  }

  async scanForVulnerabilities(plugin) {
    const vulnerabilityPatterns = [
      /require\(['"]child_process['"]\)/,
      /require\(['"]fs['"]\).*unlinkSync/,
      /require\(['"]net['"]\).*createServer/,
      /Buffer\.from\(.*base64.*\)/
    ];

    for (const pattern of vulnerabilityPatterns) {
      if (pattern.test(plugin)) {
        throw new Error(`Potential security vulnerability detected: ${pattern}`);
      }
    }
  }
}
```

---

## 🔍 **Monitoring & Auditing**

### **Security Logging**

```javascript
// Implement comprehensive security logging
class SecurityLogger {
  constructor(options = {}) {
    this.logLevel = options.logLevel || 'info';
    this.logFile = options.logFile || './security.log';
    this.enableAuditTrail = options.enableAuditTrail || true;
  }

  logSecurityEvent(event, details = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      severity: this.getSeverity(event),
      source: 'rag-pipeline-utils',
      version: process.env.npm_package_version
    };

    // Log to file
    fs.appendFileSync(this.logFile, JSON.stringify(logEntry) + '\n');

    // Send to SIEM if configured
    if (process.env.SIEM_ENDPOINT) {
      this.sendToSIEM(logEntry);
    }

    // Alert on high severity events
    if (logEntry.severity === 'high' || logEntry.severity === 'critical') {
      this.sendAlert(logEntry);
    }
  }

  getSeverity(event) {
    const severityMap = {
      'authentication_failure': 'medium',
      'authorization_failure': 'medium',
      'plugin_execution_failure': 'high',
      'api_key_rotation': 'low',
      'suspicious_query': 'medium',
      'data_access_violation': 'high',
      'configuration_change': 'medium'
    };

    return severityMap[event] || 'low';
  }

  auditApiCall(req, res, next) {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      this.logSecurityEvent('api_call', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        user: req.user?.id
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
    this.metrics.set(name, values.filter(v => v.timestamp > cutoff));
  }

  detectAnomaly(name, currentValue) {
    const values = this.metrics.get(name);
    if (!values || values.length < 10) return false; // Need baseline
    
    const nums = values.map(v => v.value);
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const variance = nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / nums.length;
    const stdDev = Math.sqrt(variance);
    
    const zScore = Math.abs(currentValue - mean) / stdDev;
    
    if (zScore > this.anomalyThreshold) {
      this.alertAnomaly(name, currentValue, mean, zScore);
      return true;
    }
    
    return false;
  }

  alertAnomaly(metric, value, baseline, zScore) {
    console.warn(`Anomaly detected in ${metric}: ${value} (baseline: ${baseline}, z-score: ${zScore})`);
    
    // Send alert to monitoring system
    if (process.env.ALERT_WEBHOOK) {
      fetch(process.env.ALERT_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert: 'anomaly_detected',
          metric,
          value,
          baseline,
          zScore,
          timestamp: new Date().toISOString()
        })
      });
    }
  }
}
```

---

## 🛠️ **Security Configuration**

### **Secure Defaults**

```json
{
  "security": {
    "authentication": {
      "required": true,
      "method": "jwt",
      "tokenExpiry": "1h",
      "refreshTokenExpiry": "7d"
    },
    "authorization": {
      "rbac": true,
      "defaultRole": "viewer",
      "requireExplicitPermissions": true
    },
    "encryption": {
      "dataAtRest": true,
      "dataInTransit": true,
      "algorithm": "aes-256-gcm",
      "keyRotationInterval": "30d"
    },
    "plugins": {
      "sandboxing": true,
      "signatureVerification": true,
      "trustedPublishersOnly": true,
      "maxExecutionTime": 30000,
      "memoryLimit": "128MB"
    },
    "logging": {
      "auditTrail": true,
      "securityEvents": true,
      "logLevel": "info",
      "logRetention": "90d"
    },
    "networking": {
      "enforceHTTPS": true,
      "tlsVersion": "1.3",
      "certificateValidation": true,
      "timeout": 30000
    }
  }
}
```

### **Environment-Specific Security**

```javascript
// Development environment
const devSecurityConfig = {
  authentication: { required: false },
  plugins: { signatureVerification: false },
  logging: { logLevel: 'debug' }
};

// Staging environment
const stagingSecurityConfig = {
  authentication: { required: true },
  plugins: { signatureVerification: true },
  logging: { logLevel: 'info' }
};

// Production environment
const prodSecurityConfig = {
  authentication: { required: true, mfa: true },
  plugins: { 
    signatureVerification: true,
    trustedPublishersOnly: true,
    sandboxing: true
  },
  logging: { 
    logLevel: 'warn',
    auditTrail: true,
    siemIntegration: true
  },
  encryption: {
    dataAtRest: true,
    dataInTransit: true,
    keyRotationInterval: '7d'
  }
};
```

---

## 🚨 **Incident Response**

### **Security Incident Handling**

```javascript
// Automated incident response
class IncidentResponse {
  constructor(options = {}) {
    this.alertThresholds = options.alertThresholds || {
      failedLogins: 5,
      suspiciousQueries: 10,
      pluginFailures: 3
    };
    this.responseActions = options.responseActions || {};
  }

  handleSecurityIncident(incident) {
    const { type, severity, details } = incident;
    
    // Log incident
    this.logIncident(incident);
    
    // Execute response actions
    switch (type) {
      case 'authentication_failure':
        if (details.attempts >= this.alertThresholds.failedLogins) {
          this.blockIP(details.ip);
          this.notifyAdmins(incident);
        }
        break;
        
      case 'suspicious_query':
        this.quarantineQuery(details.query);
        this.alertSecurityTeam(incident);
        break;
        
      case 'plugin_compromise':
        this.disablePlugin(details.pluginId);
        this.initiateForensics(incident);
        break;
        
      case 'data_breach':
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
    console.log('Initiating emergency shutdown');
    process.exit(1);
  }
}
```

---

## ✅ **Security Checklist**

### **Deployment Security**

- [ ] API keys stored securely (environment variables/secrets manager)
- [ ] HTTPS enforced for all communications
- [ ] Input validation and sanitization implemented
- [ ] Output filtering for sensitive data
- [ ] Plugin sandboxing enabled
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

## 📞 **Security Support**

### **Reporting Security Issues**

- **Security Email**: security@devilsdev.com
- **PGP Key**: Available at https://devilsdev.com/security/pgp
- **Bug Bounty**: https://devilsdev.com/security/bounty

### **Security Resources**

- **Security Documentation**: [Complete security docs](https://docs.rag-pipeline-utils.dev/security)
- **Security Advisories**: [GitHub Security Advisories](https://github.com/DevilsDev/rag-pipeline-utils/security/advisories)
- **Compliance Guides**: [SOC2, GDPR, HIPAA compliance](https://docs.rag-pipeline-utils.dev/compliance)

---

*This security guide provides comprehensive protection strategies for @DevilsDev/rag-pipeline-utils deployments. For additional security concerns, consult our security team or review the latest security advisories.*
