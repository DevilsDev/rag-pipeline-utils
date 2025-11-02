/**
 * Version: 1.1.0
 * Description: Syncs GitHub labels based on roadmap-labels.yml; updates existing, creates missing.
 * Author: Ali Kahwaji
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { Octokit } = require("@octokit/rest");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;

if (!GITHUB_TOKEN || !REPO) {
  console.error(
    "❌ GITHUB_TOKEN or GITHUB_REPOSITORY not defined in environment.",
  );
  // eslint-disable-line no-console
  process.exit(1);
}

const [owner, repo] = REPO.split("/");
const octokit = new Octokit({ auth: GITHUB_TOKEN });

const LABELS_FILE = path.join(".github", "roadmap-labels.yml");

function loadLabelsFromYAML(filePath) {
  try {
    const file = fs.readFileSync(filePath, "utf8");
    return yaml.load(file);
  } catch (err) {
    console.error("❌ Failed to load roadmap-labels.yml:", err);
    // eslint-disable-line no-console
    process.exit(1);
  }
}

async function syncLabels() {
  const labels = loadLabelsFromYAML(LABELS_FILE);
  const existingLabels = await octokit.paginate(
    octokit.rest.issues.listLabelsForRepo,
    {
      owner,
      repo,
    },
  );

  for (const label of labels) {
    const existing = existingLabels.find((l) => l.name === label.name);

    try {
      if (existing) {
        console.log(`🔁 Updating label: ${label.name}`);
        // eslint-disable-line no-console
        await octokit.rest.issues.updateLabel({
          owner,
          repo,
          name: label.name,
          color: label.color,
          description: label.description,
        });
      } else {
        console.log(`➕ Creating label: ${label.name}`);
        // eslint-disable-line no-console
        await octokit.rest.issues.createLabel({
          owner,
          repo,
          name: label.name,
          color: label.color,
          description: label.description,
        });
      }
    } catch (err) {
      console.error(`❌ Failed to process label: ${label.name}`, err.message);
      // eslint-disable-line no-console
    }
  }
}

syncLabels();
