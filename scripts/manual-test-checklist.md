# ✅ Manual Test Checklist for RAG Pipeline Utils

This document outlines manual test points for validating roadmap automation, documentation builds, CI/CD, blog sync, and changelog generation.

---

## 1. 🔄 Roadmap Sync + Label Automation

| ✅ Task                                           | Command or Trigger                                       | Notes                                     |
| ------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| Sync `PROJECT_ROADMAP.md` to GitHub Issues        | `git push` or `workflow_dispatch` for `sync-roadmap.yml` | Issues, assignees, labels should match    |
| Auto-create missing roadmap labels                | `sync-roadmap.yml` step: `ensure-roadmap-labels.js`      | Should not error even if labels exist     |
| Label updates reflect correct color & description | Rerun roadmap sync                                       | Existing labels should be updated         |
| Roadmap issue closed on ✅ Done status            | Modify `PROJECT_ROADMAP.md` status and sync              | Corresponding issue should be auto-closed |

---

## 2. 🧭 CLI + Manual Utilities

| ✅ Task                          | Command                                             | Notes                               |
| -------------------------------- | --------------------------------------------------- | ----------------------------------- |
| Create roadmap issues manually   | `node scripts/create-roadmap-issues.js`             | Creates GitHub Issues               |
| Ensure labels via CLI            | `node scripts/ensure-roadmap-labels.js`             | Must succeed with idempotency       |
| Generate changelog and preview   | `npm run release:tag`                               | Prompt for tag + generate CHANGELOG |
| Preview auto-generated blog post | Preview `.md` file in `/docs-site/blog` before push |

---

## 3. 📚 Docs + Deployment

| ✅ Task                     | Command                                       | Notes                                        |
| --------------------------- | --------------------------------------------- | -------------------------------------------- |
| Build Docusaurus            | `npm run docs:build`                          | No broken links, light/dark theme OK         |
| Deploy to GitHub Pages      | `npm run docs:deploy`                         | Check rendered site at `/rag-pipeline-utils` |
| Verify CHANGELOG link works | Test `/blog` page post link to `CHANGELOG.md` |

---

## 4. 🧪 CI/CD Validation

| ✅ Task                   | Check                | Notes                                |
| ------------------------- | -------------------- | ------------------------------------ |
| CI Lint + Test runs       | ✅ `ci.yml`          | Lint passes, all Jest tests green    |
| Docs CI runs correctly    | ✅ `docs-ci.yml`     | No script missing error, build valid |
| Docs auto-deploys on push | ✅ `docs-deploy.yml` | Publishes to GitHub Pages            |

---

## 5. 🏷 GitHub Releases

| ✅ Task                       | Trigger                              | Notes                                              |
| ----------------------------- | ------------------------------------ | -------------------------------------------------- |
| Generate blog post on release | Publish GitHub tag                   | `publish-release-blog.yml` should commit new `.md` |
| Auto-fill blog content        | From `CHANGELOG.md` and compare link | Author + commit stats populated                    |

---

## 6. 🛡 Release Gatekeeping & Metadata

| ✅ Task                         | Outcome                          | Notes                                |
| ------------------------------- | -------------------------------- | ------------------------------------ |
| Badge renders in README         | `![Release Review Passed]`       | Should point to last workflow run    |
| Protected branch config for PRs | Status check on `release:review` | Prevents push without passing review |

---

## 7. 🧾 Filesystem and Cleanup

| ✅ Task                                             | Notes                                     |
| --------------------------------------------------- | ----------------------------------------- |
| `src/stories/` removed                              | No Storybook assets in GH Pages           |
| `postcss.config.cjs` & `tailwind.config.js` removed | Confirm no broken styling or build errors |

---

## 🔁 Optional Manual Commands

```bash
# Sync roadmap manually
node scripts/create-roadmap-issues.js

# Ensure roadmap labels
node scripts/ensure-roadmap-labels.js

# Trigger changelog + blog post flow
npm run release:tag

# Build and deploy docs
npm run docs:build && npm run docs:deploy
```
