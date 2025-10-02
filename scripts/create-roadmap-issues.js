/**
 * Version: 2.2.0
 * Description: Create GitHub issues from roadmap file
 * Author: Ali Kahwaji
 */

const { Octokit } = require("octokit");
const { readFileSync } = require("fs");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO =
  process.env.GITHUB_REPOSITORY || "DevilsDev/rag-pipeline-utils";
const [owner, repo] = GITHUB_REPO.split("/");
const ROADMAP_FILE = ".github/PROJECT_ROADMAP.md";

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function createRoadmapIssues() {
  const content = readFileSync(ROADMAP_FILE, "utf-8");
  const lines = content.split("\n").filter((line) => line.startsWith("|"));
  const rows = lines.slice(2);

  for (const row of rows) {
    const cols = row.split("|").map((col) => col.trim());
    const title = cols[3];
    const description = cols[4];
    const status = cols[5];

    if (!title || status.toLowerCase().includes("✅")) continue;

    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      per_page: 100,
    });
    const exists = issues.some((issue) => issue.title === title);

    if (!exists) {
      await octokit.rest.issues.create({
        owner,
        repo,
        title,
        body: description,
        labels: ["roadmap"],
      });
      console.log(`✅ Created issue: ${title}`);
      // eslint-disable-line no-console
    }
  }
}

// Execute if run directly
if (require.main === module) {
  createRoadmapIssues().catch((err) => {
    console.error("❌ Error creating roadmap issues:", err);
    // eslint-disable-line no-console
    process.exit(1);
  });
}

module.exports = { createRoadmapIssues };
