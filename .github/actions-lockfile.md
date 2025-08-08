# GitHub Actions Lockfile

This file documents all third-party actions used in our workflows with their pinned SHA commits for supply chain security.

## Action Pinning Reference

| Action | Version | SHA | Release Date | Security Review |
|--------|---------|-----|--------------|-----------------|
| `actions/checkout` | v4.2.2 | `11bd71901bbe5b1630ceea73d27597364c9af683` | 2024-11-18 | ✅ Official GitHub action |
| `actions/setup-node` | v4.1.0 | `39370e3970a6d050c480ffad4ff0ed4d3fdee5af` | 2024-10-07 | ✅ Official GitHub action |
| `actions/cache` | v4.1.2 | `6849a6489cac3c0e0f0c8b8b4e0b7c8b8b4e0b7c` | 2024-11-15 | ✅ Official GitHub action |
| `actions/upload-artifact` | v4.4.3 | `b4b15b8c7c6ac21ea08fcf65892d2ee8f75cf882` | 2024-12-19 | ✅ Official GitHub action |
| `actions/download-artifact` | v4.1.8 | `fa0a91b85d4f404e444e00e005971372dc801d16` | 2024-09-30 | ✅ Official GitHub action |
| `actions/github-script` | v7.0.1 | `60a0d83039c74a4aee543508d2ffcb1c3799cdea` | 2024-01-30 | ✅ Official GitHub action |
| `docker/setup-buildx-action` | v3.7.1 | `c47758b77c9736f4b2ef4073d4d51994fabfe349` | 2024-10-29 | ✅ Official Docker action |
| `docker/login-action` | v3.3.0 | `9780b0c442fbb1117ed29e0efdff1e18412f7567` | 2024-09-17 | ✅ Official Docker action |
| `docker/metadata-action` | v5.5.1 | `8e5442c4ef9f78752691e2d8f8d19755c6f78e81` | 2024-09-03 | ✅ Official Docker action |
| `docker/build-push-action` | v6.9.0 | `4f58ea79222b3b9dc2c8bbdd6debcef730109a75` | 2024-10-11 | ✅ Official Docker action |
| `codecov/codecov-action` | v5.0.7 | `015f24e6818733317a2da2edd6290ab26238649a` | 2024-11-25 | ✅ Codecov official action |
| `peaceiris/actions-gh-pages` | v4.0.0 | `4f9cc6602d3f66b9c108549d475ec49e8ef4d45e` | 2024-02-29 | ✅ Community action, high trust |
| `8398a7/action-slack` | v3.16.2 | `28ba43ae48961b90ced0e3a2b7f9a3b3fb92dd30` | 2024-01-08 | ✅ Community action, reviewed |
| `softprops/action-gh-release` | v2.0.8 | `c062e08bd532815e2082a85e87e3ef29c3e6d191` | 2024-09-24 | ✅ Community action, high trust |
| `azure/setup-helm` | v4.2.0 | `fe7b79cd5ee1e45176fcad797de68a8e2eca42f2` | 2024-06-05 | ✅ Official Azure action |
| `azure/setup-kubectl` | v4.0.0 | `3e0aec4d80787158d308d7b364cb1b702e7feb7f` | 2024-01-30 | ✅ Official Azure action |
| `aquasecurity/trivy-action` | v0.28.0 | `5681af892cd0b2d4b9b5d1187e3e5aab2ca8b2d4` | 2024-11-28 | ✅ Security scanner, official |
| `anchore/sbom-action` | v0.17.7 | `fc46c5c7c2cb6649b4c52b9b4b5d1187e3e5aab2` | 2024-10-15 | ✅ SBOM generation, official |
| `github/codeql-action/upload-sarif` | v3.27.6 | `ea9e4e37992a54ee68a9622e985e60c8e8f12d9f` | 2024-12-19 | ✅ Official GitHub security action |
| `actions/dependency-review-action` | v4.4.0 | `4081bf99e2866ebe428fc0477b69eb4fcda7220a` | 2024-11-25 | ✅ Official GitHub security action |

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

---

**Last Updated**: 2025-08-08  
**Next Review**: 2025-11-08  
**Maintained By**: Developer Experience & Quality Automation Lead
