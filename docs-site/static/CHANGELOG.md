# Changelog

All notable changes to the RAG Pipeline Utils project are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.1] - 2025-11-08

### Fixed

- Package Publishing: Resolved npm publishing conflict by updating version to 2.3.1
- Documentation: Updated all version references in README.md and documentation files
- Roadmap: Corrected release dates and version numbers to reflect accurate timeline

### Notes

Patch release republishing security enhancements from v2.3.0 with corrected version metadata. All features and security improvements from v2.3.0 are included.

## [2.3.0] - 2025-11-07

### Security

#### Fixed - Critical Security Issues

**JWT Replay Protection Logic Flaw (HIGH)**

- Fixed issue where self-signed tokens could only be verified once, breaking refresh flows and load balancer retries
- Self-signed tokens are now marked as reusable and can be verified multiple times
- External tokens (not signed by the validator instance) are properly tracked and blocked on replay attempts
- Improved race condition handling with optimized check-then-set pattern
- Added comprehensive test coverage for self-signed vs external token replay scenarios

**Path Traversal URL Decoding Bypass (CRITICAL)**

- Implemented iterative URL decoding (up to 5 passes) to catch multi-encoded attack vectors
- Now detects double-encoded paths: `%252e%252e%252f` → `%2e%2e%2f` → `../`
- Malformed URL encoding now treated as attack indicator and throws error
- Path traversal violations now **always throw** regardless of `throwOnInvalid` configuration
- Added defense against sophisticated encoding attacks (mixed encoding, triple encoding, etc.)

**Duplicate Issuer/Audience Validation (MEDIUM)**

- Fixed inconsistent behavior where `strictValidation` flag didn't properly control iss/aud validation
- Eliminated duplicate validation logic between custom validator and jsonwebtoken library
- `strictValidation=false` now truly disables issuer/audience validation as intended
- Improved code clarity with explicit delegation to jsonwebtoken for cryptographic validation

### Added

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

**Behavior Changes (Security Improvements)**

- Path traversal attempts now always throw errors (previously could return `null` with `throwOnInvalid=false`)
- `strictValidation=false` now properly disables issuer/audience validation (previously validated anyway)
- Self-signed tokens can now be verified multiple times (previously blocked as replay)

### Testing

- JWT Validator: 44 tests passing (98% suite coverage)
- Input Sanitizer: 69 tests passing (100% suite coverage)
- Added comprehensive test cases for security edge cases

## [2.2.0] - 2025-01-31

### Added

- **Enterprise-Grade Architecture**: Complete dependency injection container with IoC patterns
- **Advanced AI Capabilities**: Multi-modal processing, federated learning, and adaptive retrieval
- **SLO Monitoring System**: Production observability with error budget tracking and alerting
- **External API Mocking**: Deterministic testing infrastructure for reliable CI/CD
- **Plugin Marketplace**: Community-driven ecosystem with certification workflows
- **Developer Experience Tools**: Enhanced CLI with doctor diagnostics and interactive wizards
- **Comprehensive Documentation**: Enterprise-ready documentation with observability guides

### Enhanced

- **Security Infrastructure**: Comprehensive vulnerability scanning and remediation
- **Performance Optimization**: Advanced caching, streaming, and memory management
- **CI/CD Pipeline**: Hardened workflows with security scanning and automated deployment
- **Test Coverage**: 90%+ test coverage with enterprise-grade reliability testing

### Fixed

- **MDX Compilation**: Resolved all markdown syntax issues for proper documentation builds
- **Module System**: Fixed CommonJS/ESM compatibility issues across the codebase
- **ESLint Errors**: Resolved 163+ no-undef errors and critical parsing issues

## [2.1.6] - 2025-04-19

### Added

- Enhanced plugin architecture with improved error handling
- Advanced streaming capabilities for large document processing
- Performance monitoring and metrics collection

### Fixed

- Memory leaks in long-running processes
- Plugin loading race conditions
- Documentation build issues

## [2.1.1] - 2025-04-18

### Added

- Initial enterprise features
- Basic observability infrastructure
- Plugin system foundation

### Changed

- Improved error handling across core modules
- Enhanced configuration management
- Updated documentation structure

### Fixed

- Critical security vulnerabilities
- Performance bottlenecks in embedding generation
- Plugin compatibility issues

## [2.0.0] - 2025-04-01

### Added

- Complete rewrite with TypeScript support
- Modular plugin architecture
- Advanced RAG pipeline capabilities
- Comprehensive test suite

### Breaking Changes

- New plugin API (migration guide available)
- Updated configuration format
- Restructured project layout

## [1.0.0] - 2025-03-15

### Added

- Initial release of RAG Pipeline Utils
- Basic pipeline functionality
- Core plugin system
- Documentation and examples

---

For more detailed information about each release, visit our [GitHub Releases](https://github.com/DevilsDev/rag-pipeline-utils/releases) page.
