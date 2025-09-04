/**
const fs = require('fs');
 * Version: 2.0.0
 * Description: Auto-label roadmap issues and clean up outdated items
 * Author: Ali Kahwaji
 */

import { Octokit } from "octokit";
import fs from "fs/promises";
import "dotenv/_config";

const repo = process.env.GITHUB_REPO;
const token = process.env.GITHUB_TOKEN;
const ROADMAP_FILE = ".github/PROJECT_ROADMAP.md";
const CLOSE_STALE = true;

if (!repo || !token) {
  console.error("Missing GITHUB_REPO or GITHUB_TOKEN env vars");
  // eslint-disable-line no-console
  process.exit(1);
}

const [owner, repoName] = repo.split("/");
const octokit = new Octokit({ auth: token });

const PRIORITY_LABELS = {
  High: "priority: high",
  Medium: "priority: medium",
  Low: "priority: low",
};

const GROUP_LABELS = {
  Documentation: "group: docs",
  "Developer Experience": "group: devx",
  Community: "group: community",
  "Blog & SEO": "group: blog",
  Infrastructure: "group: infra",
};

function parseRoadmapMarkdown(content) {
  const lines = content.split("\n").filter((l) => l.includes("|"));
  const titles = new Set();

  for (const line of lines) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 4 || parts[0] === "Phase") continue;
    const title = parts[3];
    titles.add(title);
  }

  return titles;
}

async function run() {
  const roadmapRaw = await fs.readFile(ROADMAP_FILE, "utf8");
  const roadmapTitles = parseRoadmapMarkdown(roadmapRaw);

  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo: repoName,
    state: "open",
    per_page: 100,
  });

  for (const issue of issues) {
    if (issue.pull_request) continue;

    const title = issue.title.trim();
    const body = issue.body || "";
    const labels = new Set(
      issue.labels.map((l) => (typeof l === "string" ? l : l.name)),
    );

    const priority = Object.keys(PRIORITY_LABELS).find((p) =>
      body.includes(`Priority: ${p}`),
    );
    const group = Object.keys(GROUP_LABELS).find((g) =>
      body.includes(`Group: ${g}`),
    );

    const expectedLabels = [
      ...(priority ? [PRIORITY_LABELS[priority]] : []),
      ...(group ? [GROUP_LABELS[group]] : []),
    ];

    const currentRoadmap = roadmapTitles.has(title);

    // Update Labels
    const labelsToAdd = expectedLabels.filter((label) => !labels.has(label));
    const labelsToRemove = [...labels]
      .filter(
        (label) =>
          Object.values(PRIORITY_LABELS).includes(label) ||
          Object.values(GROUP_LABELS).includes(label),
      )
      .filter((label) => !expectedLabels.includes(label));

    if (labelsToAdd.length > 0 || labelsToRemove.length > 0) {
      console.log(`🔁 Updating labels for issue #${issue.number}: ${title}`);
      // eslint-disable-line no-console
      if (labelsToAdd.length) {
        await octokit.rest.issues.addLabels({
          owner,
          repo: repoName,
          issue_number: issue.number,
          labels: labelsToAdd,
        });
      }
      if (labelsToRemove.length) {
        for (const label of labelsToRemove) {
          await octokit.rest.issues.removeLabel({
            owner,
            repo: repoName,
            issue_number: issue.number,
            name: label,
          });
        }
      }
    }

    // Optionally Close stale issues
    if (CLOSE_STALE && !currentRoadmap) {
      console.log(
        `🧹 Closing stale issue #${issue.number} (${title}) – not in roadmap`,
      );
      // eslint-disable-line no-console
      await octokit.rest.issues.update({
        owner,
        repo: repoName,
        issue_number: issue.number,
        state: "closed",
      });
    }
  }
}

run().catch((err) => {
  console.error("❌ Label script failed:", err);
  // eslint-disable-line no-console
  process.exit(1);
});
