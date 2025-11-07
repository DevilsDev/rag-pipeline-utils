# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0] - 2025-11-07

**Version Numbering:** This release bumps from 2.2.1 → 2.3.0 (MINOR version) because:

- New security features added (iterative URL decoding, enhanced replay protection)
- Behavioral enhancements (self-signed token reusability)
- Backward compatible for all documented/valid use cases
- No breaking API changes (only security improvements to undocumented edge cases)

### 🔒 Security

#### Fixed - Critical Security Issues

**JWT Replay Protection Logic Flaw (HIGH)**

- Fixed issue where self-signed tokens could only be verified once, breaking refresh flows and load balancer retries
- Self-signed tokens are now marked as reusable and can be verified multiple times
- External tokens (not signed by the validator instance) are properly tracked and blocked on replay attempts
- Improved race condition handling with optimized check-then-set pattern
- Added comprehensive test coverage for self-signed vs external token replay scenarios
- Files: `src/security/jwt-validator.js`, `__tests__/unit/security/jwt-validator.test.js`

**Path Traversal URL Decoding Bypass (CRITICAL)**

- Implemented iterative URL decoding (up to 5 passes) to catch multi-encoded attack vectors
- Now detects double-encoded paths: `%252e%252e%252f` → `%2e%2e%2f` → `../`
- Malformed URL encoding now treated as attack indicator and throws error
- Path traversal violations now **always throw** regardless of `throwOnInvalid` configuration
- Added defense against sophisticated encoding attacks (mixed encoding, triple encoding, etc.)
- Files: `src/utils/input-sanitizer.js`, `__tests__/unit/utils/input-sanitizer.test.js`

**Duplicate Issuer/Audience Validation (MEDIUM)**

- Fixed inconsistent behavior where `strictValidation` flag didn't properly control iss/aud validation
- Eliminated duplicate validation logic between custom validator and jsonwebtoken library
- `strictValidation=false` now truly disables issuer/audience validation as intended
- Improved code clarity with explicit delegation to jsonwebtoken for cryptographic validation
- Files: `src/security/jwt-validator.js`

#### Enhanced - Security Monitoring

**JWT Validation Events**

- Added `isSelfSigned` flag to `replay_detected` event for better security monitoring
- Improved audit logging for algorithm mismatches and validation failures
- Enhanced statistics tracking for replay attempts

**Input Sanitization Monitoring**

- Blocked attempts now tracked in `stats.blocked` counter
- Added telemetry for malformed encoding detection
- Path traversal attempts logged with detailed context

### ✨ Added

**JWT Validator Enhancements**

- Self-signed tokens support for refresh flows and distributed systems
- Separate JTI tracking for reusable (self-signed) vs single-use (external) tokens
- Race condition mitigation in concurrent token verification scenarios
- Comprehensive documentation of security model and trade-offs

**Input Sanitizer Enhancements**

- Multi-pass URL decoding for sophisticated attack detection
- Critical security violations prioritized over configuration settings
- Enhanced error messages with attack context
- Defense-in-depth architecture with multiple validation layers

### Changed

**Behavior Changes (Security Improvements - Not Breaking)**

These changes fix incorrect/undocumented behaviors and improve security. They are not considered "breaking" because they only affect edge cases or incorrect usage:

- **Path traversal attempts now always throw errors** (previously could return `null` with `throwOnInvalid=false`)

  - Rationale: Silent failures for critical security violations are dangerous
  - Impact: Only affects code that was incorrectly handling path traversal as non-critical
  - Migration: Wrap path sanitization in try-catch (see migration guide)

- **`strictValidation=false` now properly disables issuer/audience validation** (previously validated anyway)

  - Rationale: Configuration should work as documented
  - Impact: Only affects users who explicitly set `strictValidation=false` AND relied on the buggy behavior
  - Migration: Set `strictValidation=true` explicitly if you need iss/aud validation

- **Self-signed tokens can now be verified multiple times** (previously blocked as replay)
  - Rationale: This was a bug - self-signed tokens should be reusable for refresh flows
  - Impact: Enables correct behavior for distributed systems and load balancers
  - Migration: No action needed - this fixes broken functionality

**Other Changes**

- Improved error messages for security violations
- Better separation of concerns in JWT validation logic
- Enhanced code documentation

### 📊 Testing

**Test Coverage Improvements**

- JWT Validator: 44 tests passing (98% suite coverage)
- Input Sanitizer: 69 tests passing (100% suite coverage)
- Added comprehensive test cases for:
  - Self-signed token reusability
  - External token replay blocking
  - Multi-encoded path traversal attacks
  - Malformed encoding detection
  - Race condition scenarios

### 📖 Documentation

**README Updates**

- Added "What's New in v2.3.0" section with security highlights
- Expanded "Security and Quality" section with detailed security feature documentation
- Added comprehensive migration guide for v2.2.x → v2.3.0 upgrade
- Added code examples for JWT replay protection and path traversal defense
- Updated feature descriptions to reflect security enhancements

**Code Documentation**

- Added inline comments explaining security trade-offs
- Documented race condition handling in JTI tracking
- Clarified defense-in-depth approach in error handling
- Added JSDoc examples for new security behaviors

### 🛠️ Internal

**Code Quality**

- Refactored JWT replay protection logic for clarity and maintainability
- Improved error handling consistency across security modules
- Enhanced code comments with security rationale
- Better separation of configuration validation and runtime validation

---

## [2.2.1] - 2024-10-15

### Fixed

- Minor bug fixes and dependency updates
- Improved error messages in plugin validation

### Security

- Updated dependencies to address minor security advisories

### Note

Current stable version before v2.3.0 security enhancements.

---

## [2.2.0] - 2024-XX-XX

### Added

- Plugin marketplace infrastructure
- Enhanced CLI with interactive wizard
- Multi-tenant workspace support
- Advanced retry policies for DAG engine

### Changed

- Improved plugin contract validation
- Enhanced observability with structured logging
- Better error handling across core modules

---

## [2.1.0] - 2024-XX-XX

### Added

- DAG workflow engine for complex pipelines
- Plugin sandboxing with resource limits
- Prometheus metrics integration
- OpenTelemetry tracing support

### Changed

- Refactored core architecture for better modularity
- Improved plugin loading performance

---

## [2.0.0] - 2024-XX-XX

### Added

- Complete rewrite with modular plugin architecture
- Type-safe contracts for all components
- Enterprise observability features
- Comprehensive security hardening

### Changed

- **BREAKING:** New plugin API (see migration guide)
- **BREAKING:** Configuration schema changes
- Improved performance across all modules

---

## [1.x.x] - 2023-XX-XX

Legacy versions. See git history for details.

---

## Security Advisories

For security-related changes and vulnerability disclosures, please see:

- [Security Policy](SECURITY.md) - How to report vulnerabilities
- [Security Advisories](https://github.com/DevilsDev/rag-pipeline-utils/security/advisories) - Published CVEs

## Migration Guides

- [v2.2.x → v2.3.0](README.md#upgrading-from-v22x) - Security enhancements and behavior changes
- [v2.1.x → v2.2.0](docs/migrations/v2.1-to-v2.2.md) - Plugin contract updates
- [v2.0.x → v2.1.0](docs/migrations/v2.0-to-v2.1.md) - DAG engine integration
- [v1.x → v2.0.0](docs/migrations/v1-to-v2.md) - Architecture rewrite
