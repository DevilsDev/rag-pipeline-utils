# Contributing to RAG Pipeline Utils

## Branch Protection Rules & Governance

This project follows strict branch protection rules to ensure code quality and security:

### Protected Branches

#### `main` branch (Production)

- ✅ Require pull request reviews before merging (2 reviewers minimum)
- ✅ Require status checks to pass before merging:
  - Enhanced CI (lint, test, build)
  - Supply chain security (SBOM, dependency audit)
  - CodeQL analysis
  - All required CI gates must pass
- ✅ Require branches to be up to date before merging
- ✅ Require signed commits
- ✅ Include administrators in restrictions
- ✅ Restrict pushes that create files larger than 100MB
- ❌ No direct pushes allowed (PR required)

#### `develop` branch (Integration)

- ✅ Require pull request reviews before merging (1 reviewer minimum)
- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date before merging
- ✅ Allow administrators to bypass restrictions (for emergency fixes)

#### `workflow/*` branches (Architecture)

- ✅ Require pull request reviews before merging (2 reviewers minimum)
- ✅ Require status checks to pass before merging
- ✅ Require architectural review from @tech-lead

### Code Ownership

This project uses CODEOWNERS to enforce review requirements. See [CODEOWNERS](./CODEOWNERS) for details:

- **Security-sensitive areas**: Require @security team approval
- **Core architecture**: Require @tech-lead and @senior-dev approval
- **Enterprise features**: Require @security and @tech-lead approval
- **CI/CD**: Require @devops and @security approval

### Workflow Requirements

1. **All changes must go through pull requests**
2. **No direct commits to protected branches**
3. **All CI checks must pass**:

   - Linting (ESLint with zero errors)
   - Tests (100% passing, coverage maintained)
   - Security audit (no high/critical vulnerabilities)
   - SBOM generation
   - Build verification

4. **Security gates**:
   - Dependency vulnerability scanning
   - License compliance checks
   - Static analysis (CodeQL)
   - Supply chain security validation

### Emergency Procedures

For critical security fixes:

1. Create hotfix branch from `main`
2. Implement minimal fix
3. Emergency review process (reduced reviewers, expedited)
4. Deploy immediately after merge
5. Follow up with comprehensive fix in regular flow

### Release Process

1. Feature branches → `develop` via PR
2. `develop` → `release/vX.Y.Z` for release preparation
3. `release/vX.Y.Z` → `main` for production release
4. Tag release and generate CHANGELOG

### Development Workflow

```bash
# 1. Create feature branch from develop
git checkout develop
git pull origin develop
git checkout -b feat/your-feature-name

# 2. Make changes and commit
git add .
git commit -m "feat: implement your feature"

# 3. Push and create PR
git push -u origin feat/your-feature-name
# Create PR to develop branch

# 4. After review and CI passes, merge via GitHub
```

### Quality Gates

All PRs must pass these quality gates:

- [ ] ESLint with zero errors
- [ ] All tests passing
- [ ] Code coverage maintained/improved
- [ ] Security audit clean
- [ ] SBOM generated successfully
- [ ] Build artifacts verified
- [ ] Documentation updated (if public APIs changed)

### Security Requirements

- All commits must be signed
- No secrets in code or configuration
- Security-sensitive changes require security team review
- Regular dependency updates via Dependabot
- OSSF Scorecard compliance

### Getting Help

- For development questions: Create GitHub Discussion
- For security issues: Email security@devilsdev.com
- For urgent issues: Tag @tech-lead in GitHub issue
