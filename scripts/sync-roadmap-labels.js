// scripts/sync-roadmap-labels.js

/**
 * Version: 1.1.0
 * Description: Sync roadmap labels and issues
 * Author: Ali Kahwaji
 */

const { ensureRoadmapLabels } = require("./ensure-roadmap-labels.js");
const { createRoadmapIssues } = require("./create-roadmap-issues.js");

const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
const token = process.env.GITHUB_TOKEN;

if (!token) {
  console.error("❌ Missing GITHUB_TOKEN");
  // eslint-disable-line no-console
  process.exit(1);
}

(async () => {
  await ensureRoadmapLabels({ token, owner, repo });
  await createRoadmapIssues({ token, owner, repo });
})();
