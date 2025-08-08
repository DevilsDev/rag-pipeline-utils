# Third-Party Actions Security Review

This document tracks all third-party GitHub Actions used in our workflows and their security review status.

## Security Classification

- 🟢 **APPROVED**: Official actions from GitHub, Docker, major cloud providers
- 🟡 **REVIEWED**: Community actions that have been security reviewed and approved
- 🔴 **RESTRICTED**: Actions requiring special approval or with known security concerns

## Current Actions Inventory

### Official GitHub Actions 🟢
| Action | Repository | Last Updated | Security Notes |
|--------|------------|--------------|----------------|
| `actions/checkout` | github.com/actions/checkout | 2024-11-18 | Official, widely used, minimal permissions |
| `actions/setup-node` | github.com/actions/setup-node | 2024-10-07 | Official, handles Node.js installation securely |
| `actions/cache` | github.com/actions/cache | 2024-11-15 | Official, secure caching implementation |
| `actions/upload-artifact` | github.com/actions/upload-artifact | 2024-12-19 | Official, secure artifact storage |
| `actions/download-artifact` | github.com/actions/download-artifact | 2024-09-30 | Official, secure artifact retrieval |
| `actions/github-script` | github.com/actions/github-script | 2024-01-30 | Official, requires careful script review |
| `github/codeql-action` | github.com/github/codeql-action | 2024-12-19 | Official security scanning action |
| `actions/dependency-review-action` | github.com/actions/dependency-review-action | 2024-11-25 | Official dependency security scanner |

### Official Cloud Provider Actions 🟢
| Action | Repository | Last Updated | Security Notes |
|--------|------------|--------------|----------------|
| `docker/setup-buildx-action` | github.com/docker/setup-buildx-action | 2024-10-29 | Official Docker action, secure build setup |
| `docker/login-action` | github.com/docker/login-action | 2024-09-17 | Official Docker action, handles registry auth |
| `docker/metadata-action` | github.com/docker/metadata-action | 2024-09-03 | Official Docker action, metadata generation |
| `docker/build-push-action` | github.com/docker/build-push-action | 2024-10-11 | Official Docker action, secure build/push |
| `azure/setup-helm` | github.com/Azure/setup-helm | 2024-06-05 | Official Azure action, Helm installation |
| `azure/setup-kubectl` | github.com/Azure/setup-kubectl | 2024-01-30 | Official Azure action, kubectl setup |

### Security Tools 🟢
| Action | Repository | Last Updated | Security Notes |
|--------|------------|--------------|----------------|
| `aquasecurity/trivy-action` | github.com/aquasecurity/trivy-action | 2024-11-28 | Official Trivy security scanner |
| `anchore/sbom-action` | github.com/anchore/sbom-action | 2024-10-15 | Official SBOM generation tool |
| `codecov/codecov-action` | github.com/codecov/codecov-action | 2024-11-25 | Official Codecov coverage reporting |

### Community Actions (Reviewed) 🟡
| Action | Repository | Last Updated | Security Review | Notes |
|--------|------------|--------------|-----------------|-------|
| `peaceiris/actions-gh-pages` | github.com/peaceiris/actions-gh-pages | 2024-02-29 | 2024-08-08 | High-trust community action, 10k+ stars, well-maintained |
| `8398a7/action-slack` | github.com/8398a7/action-slack | 2024-01-08 | 2024-08-08 | Popular Slack notification action, reviewed for webhook security |
| `softprops/action-gh-release` | github.com/softprops/action-gh-release | 2024-09-24 | 2024-08-08 | Trusted release automation, 3k+ stars, active maintenance |

## Security Review Criteria

### Automatic Approval 🟢
Actions that meet these criteria are automatically approved:
- Published by GitHub, Microsoft, Google, Amazon, Docker
- Part of GitHub's official marketplace "Verified Creator" program
- Security-focused tools from established security vendors

### Manual Review Required 🟡
Community actions require review for:
- **Code Quality**: Well-structured, documented code
- **Maintenance**: Active maintenance, recent updates, responsive issues
- **Popularity**: Significant adoption (1k+ stars or 10k+ uses)
- **Security Practices**: Proper secret handling, minimal permissions
- **Transparency**: Open source, clear licensing

### Restricted/Prohibited 🔴
Actions that are not permitted:
- Unmaintained actions (no updates >1 year)
- Actions with known security vulnerabilities
- Actions requiring excessive permissions
- Actions from unverified or suspicious sources
- Actions that execute arbitrary code from external sources

## Security Requirements for All Actions

### 1. SHA Pinning
- All actions MUST be pinned to specific commit SHAs
- No `@main`, `@master`, or `@latest` references allowed
- SHAs must correspond to tagged releases

### 2. Minimal Permissions
- Actions should request only necessary permissions
- Workflow permissions should be explicitly defined
- No blanket `write-all` or `admin` permissions

### 3. Input Validation
- All user inputs to actions must be validated
- No direct interpolation of user-controlled data in shell commands
- Use environment variables for passing sensitive data

### 4. Secret Handling
- Secrets must be passed through GitHub Secrets only
- No hardcoded credentials or tokens
- Prefer OIDC/short-lived tokens over long-lived secrets

## Review Process

### New Action Addition
1. **Security Assessment**: Evaluate against security criteria
2. **Code Review**: Review action source code if available
3. **Permission Analysis**: Verify minimal permission requirements
4. **Testing**: Test action in isolated environment
5. **Documentation**: Update this file and actions-lockfile.md
6. **Approval**: Get approval from security team for 🟡 actions

### Regular Reviews
- **Quarterly**: Review all community actions for updates/security issues
- **On Incident**: Immediate review if security vulnerability reported
- **On Update**: Re-review when updating action versions

## Incident Response

If a security issue is discovered in any action:

1. **Immediate**: Remove or disable affected workflows
2. **Assessment**: Evaluate impact and exposure
3. **Mitigation**: Update to secure version or find alternative
4. **Documentation**: Update security status in this file
5. **Communication**: Notify relevant teams

## Contacts

- **Security Reviews**: DevOps Security Team
- **Action Updates**: Platform Engineering Team
- **Incident Response**: Security Incident Response Team

---

**Document Owner**: Developer Experience & Quality Automation Lead  
**Last Review**: 2025-08-08  
**Next Review**: 2025-11-08
