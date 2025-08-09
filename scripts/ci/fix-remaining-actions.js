#!/usr/bin/env node
/**
 * Fix Remaining Unpinned Actions
 * Addresses specific actions missed by comprehensive hardening
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..', '..');
const WF_DIR = path.join(ROOT, '.github', 'workflows');

// Additional action SHA mappings for missed actions
const ADDITIONAL_ACTION_SHA_MAP = {
  'actions/github-script@v6': 'actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea', // v6.4.1
  'actions/github-script@v7': 'actions/github-script@35b1cdd1b2c1fc704b1cd442536d6e4b28b2ba4e', // v7.0.1
  '8398a7/action-slack@v3': '8398a7/action-slack@28ba43ae48961b90ced0e7aac97fc847a4ab1666', // v3.16.2
};

function loadWorkflow(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return { content, data: yaml.load(content), name: path.basename(filePath) };
}

function saveWorkflow(filePath, data) {
  const yamlContent = yaml.dump(data, { 
    lineWidth: -1, 
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
    indent: 2
  });
  fs.writeFileSync(filePath, yamlContent, 'utf8');
}

function fixRemainingActions(workflow) {
  let fixed = 0;
  
  function processJobs(jobs) {
    for (const [jobName, job] of Object.entries(jobs)) {
      if (job.steps) {
        for (const [stepIndex, step] of job.steps.entries()) {
          if (step.uses) {
            const shaVersion = ADDITIONAL_ACTION_SHA_MAP[step.uses];
            if (shaVersion) {
              console.log(`    📌 Pinning ${step.uses} → ${shaVersion.split('@')[1].substring(0, 8)}...`);
              step.uses = shaVersion;
              fixed++;
            }
          }
        }
      }
    }
  }
  
  if (workflow.jobs) {
    processJobs(workflow.jobs);
  }
  
  return fixed;
}

function fixWorkflow(filePath) {
  const { data, name } = loadWorkflow(filePath);
  console.log(`\n🔧 Fixing remaining actions in ${name}...`);
  
  const fixesApplied = fixRemainingActions(data);
  
  if (fixesApplied > 0) {
    saveWorkflow(filePath, data);
    console.log(`  ✅ Fixed ${fixesApplied} unpinned actions in ${name}`);
    return true;
  } else {
    console.log(`  ℹ️ No unpinned actions found in ${name}`);
    return false;
  }
}

async function main() {
  console.log('🎯 Fixing Remaining Unpinned Actions');
  console.log('====================================');
  
  // Target specific workflows that failed testing
  const targetWorkflows = [
    'comprehensive-testing.yml',
    'contract-validation.yml',
    'docs-deploy.yml',
    'release-protection.yml'
  ];
  
  let fixedCount = 0;
  
  for (const workflowName of targetWorkflows) {
    const workflowPath = path.join(WF_DIR, workflowName);
    if (fs.existsSync(workflowPath)) {
      const fixed = fixWorkflow(workflowPath);
      if (fixed) fixedCount++;
    } else {
      console.log(`⚠️ Workflow not found: ${workflowName}`);
    }
  }
  
  console.log(`\n🎉 Action pinning fixes complete!`);
  console.log(`📈 Fixed workflows: ${fixedCount}/${targetWorkflows.length}`);
  console.log(`\n📋 Next steps:`);
  console.log(`1. Run: npm run ci:test-workflows`);
  console.log(`2. Verify 100% test pass rate`);
  console.log(`3. Commit final fixes`);
}

if (require.main === module) {
  main();
}

module.exports = { main };
