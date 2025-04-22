// scripts/ensure-roadmap-labels.js
/**
 * Version: 1.0.2
 * Description: Ensure GitHub labels for roadmap automation (ESM-compatible)
 * Author: Ali Kahwaji
 */

import { Octokit } from 'octokit';

/**
 * Ensure all roadmap labels exist on the GitHub repo.
 * @param {string} authToken - GitHub token for authentication
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 */
export async function ensureRoadmapLabels(authToken, owner, repo) {
  const octokit = new Octokit({ auth: authToken });

  const labels = [
    { name: 'priority: high', color: 'e11d48', description: 'High priority roadmap item' },
    { name: 'priority: medium', color: 'f59e0b', description: 'Medium priority roadmap item' },
    { name: 'priority: low', color: '10b981', description: 'Low priority roadmap item' },
    { name: 'group: docs', color: '6366f1', description: 'Documentation features' },
    { name: 'group: devx', color: '06b6d4', description: 'Developer experience improvements' },
    { name: 'group: community', color: 'ec4899', description: 'Community tools & engagement' },
    { name: 'group: blog', color: 'f97316', description: 'Blog & SEO enhancements' },
    { name: 'group: infra', color: '64748b', description: 'Infrastructure & deployment features' }
  ];

  const existing = await octokit.rest.issues.listLabelsForRepo({ owner, repo });
  const existingNames = new Set(existing.data.map(label => label.name));

  for (const label of labels) {
    if (!existingNames.has(label.name)) {
      try {
        await octokit.rest.issues.createLabel({ owner, repo, ...label });
        console.log(`✅ Created label: ${label.name}`);
      } catch (err) {
        if (err?.response?.data?.errors?.[0]?.code === 'already_exists') {
          console.log(`ℹ️ Skipped existing label: ${label.name}`);
        } else {
          console.error(`❌ Failed to create label: ${label.name}`, err);
        }
      }
    } else {
      console.log(`ℹ️ Label exists: ${label.name}`);
    }
  }
}
