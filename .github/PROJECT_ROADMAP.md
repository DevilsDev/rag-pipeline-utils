# 🛣️ Project Roadmap - RAG Pipeline Utils

> Version: 1.2.0  
> Status: In Progress  
> Last Updated: 2025-04-22

This roadmap guides the feature evolution, developer tooling, CI/CD automation, and community integration for the `@devilsdev/rag-pipeline-utils` project. Changes here are synchronized to GitHub Issues and CI workflows.

---

## ✅ Legend

| Symbol | Meaning |
|--------|---------|
| ✅     | Done    |
| 🚧     | In Progress |
| 🔜     | Upcoming |
| 🧪     | Experimental |

---

## 📦 Phase 1: Foundation & CI/CD

| Feature | Status | Target Version | Tags |
|---------|--------|----------------|------|
| Automated test coverage with Jest | ✅ Done | v2.0.0 | test, ci |
| Codecov integration + badge | ✅ Done | v2.0.0 | ci, badge |
| GitHub Actions CI: lint, test, release | ✅ Done | v2.0.0 | ci |
| GitHub Pages deploy for Docusaurus | ✅ Done | v2.0.0 | docs, deploy |
| CHANGELOG auto-generation | ✅ Done | v2.0.0 | release |
| Blog post sync from changelog | ✅ Done | v2.1.0 | blog, release |

---

## 🚀 Phase 2: Community & Docs

| Feature | Status | Target Version | Tags |
|---------|--------|----------------|------|
| Interactive onboarding via CLI | 🚧 In Progress | v2.2.0 | devx, onboarding |
| GitHub Discussions integration | 🔜 | v2.2.0 | community |
| Contributor guide & issue templates | ✅ Done | v2.0.0 | community, docs |
| Roadmap → GitHub Issues sync | ✅ Done | v2.1.0 | ci, roadmap |
| Label sync from roadmap | ✅ Done | v2.1.0 | ci, labels |
| Manual & automated blog generation | ✅ Done | v2.1.1 | blog, release |

---

## 🧠 Phase 3: Developer Tooling

| Feature | Status | Target Version | Tags |
|---------|--------|----------------|------|
| CLI for `release:tag` with changelog preview | ✅ Done | v2.1.1 | cli, release |
| Hydra.js integration for dynamic RAG config | 🚧 In Progress | v2.2.0 | config, hydra |
| CLI for roadmap issue tagging | ✅ Done | v2.1.1 | cli, roadmap |
| Status badge: Release Review Passed | ✅ Done | v2.1.1 | badge, ci |
| Kanban sync for roadmap issues | ✅ Done | v2.1.1 | roadmap, ci |
| Custom VS Code snippets & workspace | 🔜 | v2.3.0 | devx |

---

## 🌐 Phase 4: International & Advanced UX

| Feature | Status | Target Version | Tags |
|---------|--------|----------------|------|
| Blog subscribe + RSS | ✅ Done | v2.1.1 | blog |
| i18n translation support | 🔜 | v2.3.0 | i18n |
| SEO optimization + open graph cards | ✅ Done | v2.1.1 | seo, meta |
| Comment system on blog posts | 🔜 | v2.3.0 | blog, community |
| Performance tuning + SSR check | ✅ Done | v2.1.0 | perf, ssr |
| Multilingual toggle in header | 🔜 | v2.3.0 | i18n, ui |

---

## 🧩 Future Enhancements

| Feature | Status | Target Version | Tags |
|---------|--------|----------------|------|
| Plugin support via CLI | 🔜 | v2.4.0 | cli, plugin |
| Graph-based pipeline UI | 🔜 | v2.5.0 | ux, devx |
| Real-world RAG examples + use cases | 🔜 | v2.3.0 | docs, showcase |
| Prebuilt Docker image | 🔜 | v2.4.0 | infra, deploy |
| Slack/Discord webhook for releases | 🔜 | v2.3.0 | infra, notify |

---

## 📊 Contributor Stats

- GitHub Insights Badge: ![Contributors](https://img.shields.io/github/contributors/DevilsDev/rag-pipeline-utils)
- Roadmap Sync: `scripts/create-roadmap-issues.js`
- Label Sync: `scripts/ensure-roadmap-labels.js`
- CLI Integration: `scripts/release-changelog.js`, `scripts/sync-roadmap-cli.js`

---

## 📁 Files

- `.github/PROJECT_ROADMAP.md` ← source
- `scripts/ensure-roadmap-labels.js` ← label sync
- `scripts/create-roadmap-issues.js` ← issue sync
- `scripts/close-roadmap-done.js` ← close done items
- `.github/workflows/sync-roadmap.yml` ← automation trigger

