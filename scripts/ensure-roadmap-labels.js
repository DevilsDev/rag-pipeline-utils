/**
 * Version: 1.1.0
 * File: scripts/ensure-roadmap-labels.js
 * Description: Creates or updates roadmap-related GitHub issue labels for syncing roadmap tasks.
 * Author: Ali Kahwaji
 */

const { Octokit } = require('octokit');

/**
 * Predefined roadmap labels grouped by priority and feature area.
 * These will be created if not already present in the repository.
 */
const ROADMAP_LABELS = [
  { name: 'priority: high', color: 'e11d48', description: 'High priority roadmap item' },
  { name: 'priority: medium', color: 'f59e0b', description: 'Medium priority roadmap item' },
  { name: 'priority: low', color: '10b981', description: 'Low priority roadmap item' },
  { name: 'group: docs', color: '6366f1', description: 'Documentation features' },
  { name: 'group: devx', color: '06b6d4', description: 'Developer experience improvements' },
  { name: 'group: community', color: 'ec4899', description: 'Community tools & engagement' },
  { name: 'group: blog', color: 'f97316', description: 'Blog & SEO enhancements' },
  { name: 'group: infra', color: '64748b', description: 'Infrastructure & deployment features' },
];

/**
 * Ensure roadmap labels exist in the repository.
 * Creates only missing labels.
 *
 * @param {object} options
 * @param {string} options.token - GitHub token
 * @param {string} options.owner - Repository owner
 * @param {string} options.repo - Repository name
 */
async function ensureRoadmapLabels({ token, owner, repo }) {
  const octokit = new Octokit({ auth: token });

  const existingLabels = await octokit.rest.issues.listLabelsForRepo({ owner, repo });
  const existingNames = new Set(existingLabels.data.map(label => label.name));

  for (const label of ROADMAP_LABELS) {
    if (!existingNames.has(label.name)) {
      try {
        await octokit.rest.issues.createLabel({ owner, repo, ...label });
        console.log(`✅ Created label: ${label.name}`);
      } catch (error) {
        if (error.status === 422 && error.message.includes('already_exists')) {
          console.warn(`⚠️ Label already exists: ${label.name}`);
        } else {
          console.error(`❌ Failed to create label: ${label.name}`, error.message);
          throw error;
        }
      }
    } else {
      console.log(`ℹ️ Label already present: ${label.name}`);
    }
  }
}

module.exports = { ensureRoadmapLabels, ROADMAP_LABELS };

// Optional CLI entrypoint
if (require.main === module) {
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
  const token = process.env.GITHUB_TOKEN;

  if (!token || !owner || !repo) {
    console.error('❌ Missing required GITHUB_TOKEN or GITHUB_REPOSITORY environment variables.');
    process.exit(1);
  }

  ensureRoadmapLabels({ token, owner, repo })
    .then(() => console.log('🎉 Roadmap label sync complete'))
    .catch(err => {
      console.error('❌ Label sync failed:', err.message);
      process.exit(1);
    });
}
