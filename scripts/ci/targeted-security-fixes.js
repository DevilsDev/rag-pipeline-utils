#!/usr/bin/env node
/**
 * Targeted GitHub Actions Security Fixes
 * Addresses specific issues found in audit_after.json that patches missed
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..', '..');
const WF_DIR = path.join(ROOT, '.github', 'workflows');
const AUDIT_JSON = path.join(ROOT, 'ci-reports', 'gha-hardening', 'audit_after.json');

// Common action SHA mappings for security
const ACTION_SHA_MAP = {
  'actions/checkout@v4': 'actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332', // v4.1.7
  'actions/checkout@v3': 'actions/checkout@f43a0e5ff2bd294095638e18286ca9a3d1956744', // v3.6.0
  'actions/setup-node@v4': 'actions/setup-node@60edb5dd545a775178f52524783378180af0d1f8', // v4.0.2
  'actions/setup-node@v3': 'actions/setup-node@5e21ff4d9bc1a8cf6de233a3057d20ec6b3fb69d', // v3.8.1
  'stefanzweifel/git-auto-commit-action@v5': 'stefanzweifel/git-auto-commit-action@8621497c8c39c72f3e2a999a26b4ca1b5058a842', // v5.0.1
  'peter-evans/create-or-update-comment@v4': 'peter-evans/create-or-update-comment@71345be0265236311c031f5c7866368bd1eff043', // v4.0.0
  'actions/cache@v4': 'actions/cache@0c45773b623bea8c8e75f6c82b208c3cf94ea4f9', // v4.0.2
  'actions/upload-artifact@v4': 'actions/upload-artifact@65462800fd760344b1a7b4382951275a0abb4808', // v4.3.3
  'actions/download-artifact@v4': 'actions/download-artifact@65a9edc5881444af0b9093a5e628f2fe47ea3b2e', // v4.1.7
};

function loadAuditResults() {
  if (!fs.existsSync(AUDIT_JSON)) {
    throw new Error('Audit results not found. Run audit first.');
  }
  return JSON.parse(fs.readFileSync(AUDIT_JSON, 'utf8'));
}

function loadWorkflow(name) {
  const filePath = path.join(WF_DIR, name);
  const content = fs.readFileSync(filePath, 'utf8');
  return { content, data: yaml.load(content) };
}

function saveWorkflow(name, data) {
  const filePath = path.join(WF_DIR, name);
  const yamlContent = yaml.dump(data, { 
    lineWidth: -1, 
    noRefs: true,
    quotingType: '"',
    forceQuotes: false
  });
  fs.writeFileSync(filePath, yamlContent, 'utf8');
}

function fixActionPinning(workflow) {
  let fixed = false;
  
  function processJobs(jobs) {
    for (const [jobName, job] of Object.entries(jobs)) {
      if (job.steps) {
        for (const step of job.steps) {
          if (step.uses) {
            const shaVersion = ACTION_SHA_MAP[step.uses];
            if (shaVersion) {
              console.log(`  📌 Pinning ${step.uses} → ${shaVersion}`);
              step.uses = shaVersion;
              fixed = true;
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

function fixPermissions(workflow) {
  let fixed = false;
  
  // Set minimal permissions at workflow level
  if (!workflow.permissions || Object.keys(workflow.permissions).length === 0) {
    workflow.permissions = {
      contents: 'read',
      actions: 'read'
    };
    fixed = true;
    console.log('  🔒 Set minimal workflow permissions');
  }
  
  // Check for overly broad permissions
  if (workflow.permissions) {
    const broad = ['write', 'admin'];
    for (const [perm, value] of Object.entries(workflow.permissions)) {
      if (broad.includes(value) && perm !== 'contents') {
        workflow.permissions[perm] = 'read';
        fixed = true;
        console.log(`  🔒 Reduced ${perm} permission: ${value} → read`);
      }
    }
  }
  
  return fixed;
}

function fixJobTimeouts(workflow) {
  let fixed = false;
  
  if (workflow.jobs) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (!job['timeout-minutes']) {
        job['timeout-minutes'] = 30; // Default 30 minutes
        fixed = true;
        console.log(`  ⏱️ Added timeout to job '${jobName}': 30 minutes`);
      }
    }
  }
  
  return fixed;
}

function fixShellHardening(workflow) {
  let fixed = false;
  
  if (workflow.jobs) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (job.steps) {
        for (const [stepIndex, step] of job.steps.entries()) {
          if (step.run && typeof step.run === 'string') {
            // Add shell hardening for bash scripts
            if (!step.shell) {
              step.shell = 'bash';
              fixed = true;
            }
            
            // Add error handling if not present
            const hasErrorHandling = step.run.includes('set -e') || step.run.includes('set -o pipefail');
            if (!hasErrorHandling && step.run.length > 20) {
              step.run = 'set -e\nset -o pipefail\n' + step.run;
              fixed = true;
              console.log(`  🛡️ Added shell hardening to job '${jobName}' step ${stepIndex}`);
            }
          }
        }
      }
    }
  }
  
  return fixed;
}

function fixConcurrency(workflow) {
  let fixed = false;
  
  if (!workflow.concurrency) {
    // Add concurrency control to prevent multiple runs
    workflow.concurrency = {
      group: '${{ github.workflow }}-${{ github.ref }}',
      'cancel-in-progress': true
    };
    fixed = true;
    console.log('  🔄 Added concurrency control');
  }
  
  return fixed;
}

function applyTargetedFixes(workflowName, issues) {
  console.log(`\n🔧 Fixing ${workflowName}...`);
  
  const { content, data } = loadWorkflow(workflowName);
  let totalFixed = 0;
  
  // Apply fixes based on detected issues
  const hasActionPinning = issues.some(i => i.type === 'action_pinning');
  const hasPermissions = issues.some(i => i.type === 'permissions');
  const hasTimeout = issues.some(i => i.type === 'timeout');
  const hasShellInjection = issues.some(i => i.type === 'shell_injection');
  
  if (hasActionPinning && fixActionPinning(data)) totalFixed++;
  if (hasPermissions && fixPermissions(data)) totalFixed++;
  if (hasTimeout && fixJobTimeouts(data)) totalFixed++;
  if (hasShellInjection && fixShellHardening(data)) totalFixed++;
  if (fixConcurrency(data)) totalFixed++;
  
  if (totalFixed > 0) {
    saveWorkflow(workflowName, data);
    console.log(`  ✅ Applied ${totalFixed} security fixes to ${workflowName}`);
    return true;
  } else {
    console.log(`  ℹ️ No fixes needed for ${workflowName}`);
    return false;
  }
}

async function main() {
  console.log('🎯 Starting Targeted GitHub Actions Security Remediation');
  console.log('============================================================');
  
  try {
    // Load audit results
    const auditData = loadAuditResults();
    const failingWorkflows = auditData.workflows.filter(w => w.issues && w.issues.length > 0);
    
    console.log(`📊 Found ${failingWorkflows.length} workflows with security issues`);
    
    let fixedCount = 0;
    
    // Apply targeted fixes to each failing workflow
    for (const workflow of failingWorkflows) {
      const fixed = applyTargetedFixes(workflow.name, workflow.issues);
      if (fixed) fixedCount++;
    }
    
    console.log(`\n🎉 Targeted remediation complete!`);
    console.log(`📈 Fixed ${fixedCount}/${failingWorkflows.length} workflows`);
    console.log(`\n📋 Next steps:`);
    console.log(`1. Run: npm run ci:audit`);
    console.log(`2. Verify security issues resolved`);
    console.log(`3. Commit changes if audit passes`);
    
  } catch (error) {
    console.error('❌ Targeted remediation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
