# GitHub Actions Lockfile

This file documents all third-party actions used in our workflows with their pinned SHA commits for supply chain security.

## Action Pinning Reference

| Action                              | Version  | SHA                                        | Release Date | Security Review                    |
| ----------------------------------- | -------- | ------------------------------------------ | ------------ | ---------------------------------- |
| `actions/checkout`                  | v4.1.7   | `692973e3d937129bcbf40652eb9f2f61becf3332` | 2024-07-16   | ✅ Official GitHub action          |
| `actions/setup-node`                | v4.0.3   | `1e60f620b9541d16bece96c5465dc8ee9832be0b` | 2024-08-15   | ✅ Official GitHub action          |
| `actions/configure-pages`           | v5.0.0   | `983d7736d9b0ae728b81ab479565c72886d7745b` | 2024-09-30   | ✅ Official GitHub action          |
| `actions/upload-pages-artifact`     | v3.0.1   | `56afc609e74202658d3ffba0e8f6dda462b719fa` | 2024-02-09   | ✅ Official GitHub action          |
| `actions/deploy-pages`              | v4.0.5   | `d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e` | 2024-03-22   | ✅ Official GitHub action          |
| `step-security/harden-runner`       | v2.10.1  | `91182cccc01eb5e619899d80e4e971d6181294a7` | 2024-10-01   | ✅ Security hardening action       |
| `github/codeql-action/init`         | v3.26.10 | `e2b3eafc8d227b0241d48be5f425d47c2d750a13` | 2024-10-25   | ✅ Official GitHub security action |
| `github/codeql-action/analyze`      | v3.26.10 | `e2b3eafc8d227b0241d48be5f425d47c2d750a13` | 2024-10-25   | ✅ Official GitHub security action |
| `github/codeql-action/autobuild`    | v3.26.10 | `e2b3eafc8d227b0241d48be5f425d47c2d750a13` | 2024-10-25   | ✅ Official GitHub security action |
| `github/codeql-action/upload-sarif` | v3.26.10 | `e2b3eafc8d227b0241d48be5f425d47c2d750a13` | 2024-10-25   | ✅ Official GitHub security action |
| `codecov/codecov-action`            | v4.5.0   | `e28ff129e5465c2c0dcc6f003fc735cb6ae0c673` | 2024-07-12   | ✅ Codecov official action         |
| `ossf/scorecard-action`             | v2.4.0   | `62b2cac7ed8198b15735ed49ab1e5cf35480ba46` | 2024-10-07   | ✅ OSSF security scorecard         |

## Security Review Process

1. **Action Source Verification**: All actions must be from verified publishers or well-established community maintainers
2. **SHA Pinning**: All actions are pinned to specific commit SHAs to prevent supply chain attacks
3. **Regular Updates**: Actions are reviewed and updated quarterly or when security advisories are published
4. **Permissions Audit**: Each action's required permissions are documented and minimized

## Update Process

When updating an action:

1. Check the action's release page for the latest stable version
2. Verify the SHA corresponds to the tagged release
3. Review the changelog for breaking changes or security fixes
4. Update both the SHA in workflows and this lockfile
5. Test the workflow in a safe environment before merging

## Security Contacts

- **Primary**: DevOps Security Team
- **Secondary**: Platform Engineering Team
- **Emergency**: Security Incident Response Team

## How to Bump Actions

To update an action to a newer version:

1. **Find the latest release**: Check the action's GitHub repository releases page
2. **Get the commit SHA**: Copy the full commit SHA for the release tag
3. **Update workflows**: Replace the SHA in all workflow files that use the action
4. **Update this lockfile**: Update the version, SHA, and release date in the table above
5. **Test thoroughly**: Run workflows in a test environment before merging
6. **Security review**: Verify the action source and review any permission changes

## Example Update Process

```bash
# Find the latest release SHA for actions/checkout
git ls-remote --tags https://github.com/actions/checkout.git
# Update workflow files with new SHA
# Update this lockfile with new version info
# Test in PR before merging
```

---

**Last Updated**: 2025-01-04  
**Next Review**: 2025-04-04  
**Maintained By**: DevOps Security Team
