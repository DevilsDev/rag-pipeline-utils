/**
 * Version: 2.0.1
 * Path: scripts/ensure-roadmap-labels.js
 * Description: Ensures consistent GitHub labels for roadmap tracking and automation.
 * Author: Ali Kahwaji
 */

import { Octokit } from 'octokit';


/**
 * Label definitions for roadmap tracking.
 * Modify this array to add or update roadmap labels.
 * Each object must include: name, color (hex), description.
 */
const roadmapLabels = [
  { name: 'priority: high', color: 'e11d48', description: 'High priority roadmap item' },
  { name: 'priority: medium', color: 'f59e0b', description: 'Medium priority roadmap item' },
  { name: 'priority: low', color: '10b981', description: 'Low priority roadmap item' },
  { name: 'group: docs', color: '6366f1', description: 'Documentation features' },
  { name: 'group: devx', color: '06b6d4', description: 'Developer experience improvements' },
  { name: 'group: community', color: 'ec4899', description: 'Community tools & engagement' },
  { name: 'group: blog', color: 'f97316', description: 'Blog & SEO enhancements' },
  { name: 'group: infra', color: '64748b', description: 'Infrastructure & deployment features' },
  { name: 'group: hydra', color: '9333ea', description: 'Hydra runtime & configuration' },
  { name: 'status: done', color: '10b981', description: 'Issue has been completed' }
];

/**
 * Ensures all roadmap labels are present in the target GitHub repository.
 * Skips label creation if already present.
 *
 * @param {Object} params
 * @param {string} params.token - GitHub access token
 * @param {string} params.owner - Repository owner
 * @param {string} params.repo  - Repository name
 */
async function ensureRoadmapLabels({ token, owner, repo }) {
  const octokit = new Octokit({ auth: token });

  const { data: existingLabels } = await octokit.rest.issues.listLabelsForRepo({
    owner,
    repo
  });

  const existingNames = new Set(existingLabels.map((label) => label.name));

  for (const label of roadmapLabels) {
    if (!existingNames.has(label.name)) {
      await octokit.rest.issues.createLabel({ owner, repo, ...label });
    }
  }
}

// CLI support
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [owner, repo] = process.env.GITHUB_REPOSITORY?.split('/') || [];
  const token = process.env.GITHUB_TOKEN;

  if (!token || !owner || !repo) {
    console.error('Missing required GITHUB_TOKEN or GITHUB_REPOSITORY'); // eslint-disable-line no-console
    process.exit(1);
  }

  ensureRoadmapLabels({ token, owner, repo })
    .then(() => console.log('✅ Roadmap labels ensured')) // eslint-disable-line no-console
    .catch((err) => {
      console.error('Label sync failed:', err); // eslint-disable-line no-console
      process.exit(1);
    });
}

export { ensureRoadmapLabels, roadmapLabels };
