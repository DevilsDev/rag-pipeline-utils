#!/usr/bin/env node

/**
 * Version: 1.0.0
 * Path: scripts/sync-roadmap-labels.js
 * Description: Chains roadmap label + issue creation in CI
 * Author: Ali Kahwaji
 */

import { ensureRoadmapLabels } from './ensure-roadmap-labels.js';
import { createRoadmapIssues } from './create-roadmap-issues.js';

const [owner, repo] = process.env.GITHUB_REPOSITORY?.split('/') || ['DevilsDev', 'rag-pipeline-utils'];
const token = process.env.GITHUB_TOKEN;

if (!token) {
  console.error('[❌] Missing GITHUB_TOKEN env variable.');
  process.exit(1);
}

console.log('🔖 Syncing roadmap labels...');
await ensureRoadmapLabels({ token, owner, repo });

console.log('📝 Creating/updating roadmap issues...');
await createRoadmapIssues({ token, owner, repo });

console.log('✅ Roadmap synchronization complete.');
