#!/usr/bin/env node
/**
 * Comprehensive GitHub Actions Security Hardening
 * Applies all security best practices to workflows regardless of current state
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..', '..');
const WF_DIR = path.join(ROOT, '.github', 'workflows');

// Comprehensive action SHA mappings for security
const ACTION_SHA_MAP = {
  'actions/checkout@v4': 'actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332', // v4.1.7
  'actions/checkout@v3': 'actions/checkout@f43a0e5ff2bd294095638e18286ca9a3d1956744', // v3.6.0
  'actions/setup-node@v4': 'actions/setup-node@60edb5dd545a775178f52524783378180af0d1f8', // v4.0.2
  'actions/setup-node@v3': 'actions/setup-node@5e21ff4d9bc1a8cf6de233a3057d20ec6b3fb69d', // v3.8.1
  'stefanzweifel/git-auto-commit-action@v5': 'stefanzweifel/git-auto-commit-action@8621497c8c39c72f3e2a999a26b4ca1b5058a842', // v5.0.1
  'peter-evans/create-or-update-comment@v4': 'peter-evans/create-or-update-comment@71345be0265236311c031f5c7866368bd1eff043', // v4.0.0
  'actions/cache@v4': 'actions/cache@0c45773b623bea8c8e75f6c82b208c3cf94ea4f9', // v4.0.2
  'actions/cache@v3': 'actions/cache@88522ab9f39a2ea568f7027eddc7d8d8bc9d59c8', // v3.3.1
  'actions/upload-artifact@v4': 'actions/upload-artifact@65462800fd760344b1a7b4382951275a0abb4808', // v4.3.3
  'actions/upload-artifact@v3': 'actions/upload-artifact@a8a3f3ad30e3422c9c7b888a15615d19a852ae32', // v3.1.3
  'actions/download-artifact@v4': 'actions/download-artifact@65a9edc5881444af0b9093a5e628f2fe47ea3b2e', // v4.1.7
  'actions/download-artifact@v3': 'actions/download-artifact@9bc31d5ccc31df68ecc42ccf4149144866c47d8a', // v3.0.2
  'github/super-linter@v4': 'github/super-linter@45fc0d88288beee4701c62761281edfee85655d7', // v4.10.1
  'codecov/codecov-action@v4': 'codecov/codecov-action@125fc84a9a348dbcf27d130839486846dcb55234', // v4.2.0
  'peaceiris/actions-gh-pages@v3': 'peaceiris/actions-gh-pages@373f7f263a76c20808c831209c920827a82a2847', // v3.9.3
};

function getAllWorkflows() {
  return fs.readdirSync(WF_DIR)
    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map(file => path.join(WF_DIR, file));
}

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

function hardenActionPinning(workflow) {
  let fixed = 0;
  
  function processJobs(jobs) {
    for (const [jobName, job] of Object.entries(jobs)) {
      if (job.steps) {
        for (const [stepIndex, step] of job.steps.entries()) {
          if (step.uses) {
            const shaVersion = ACTION_SHA_MAP[step.uses];
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

function hardenPermissions(workflow) {
  let fixed = 0;
  
  // Set minimal permissions at workflow level
  const currentPerms = workflow.permissions || {};
  
  // Define minimal required permissions
  const minimalPerms = {
    contents: 'read',
    actions: 'read'
  };
  
  // Add specific permissions based on workflow needs
  if (workflow.name && workflow.name.includes('deploy')) {
    minimalPerms.contents = 'write';
    minimalPerms.pages = 'write';
    minimalPerms['id-token'] = 'write';
  }
  
  if (workflow.name && (workflow.name.includes('release') || workflow.name.includes('blog'))) {
    minimalPerms.contents = 'write';
    minimalPerms.issues = 'write';
    minimalPerms['pull-requests'] = 'write';
  }
  
  // Apply minimal permissions
  workflow.permissions = minimalPerms;
  fixed++;
  console.log(`    🔒 Set minimal permissions: ${Object.keys(minimalPerms).join(', ')}`);
  
  return fixed;
}

function hardenJobTimeouts(workflow) {
  let fixed = 0;
  
  if (workflow.jobs) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (!job['timeout-minutes']) {
        // Set appropriate timeout based on job type
        let timeout = 30; // Default
        
        if (jobName.includes('test') || jobName.includes('build')) {
          timeout = 45;
        } else if (jobName.includes('deploy') || jobName.includes('release')) {
          timeout = 60;
        }
        
        job['timeout-minutes'] = timeout;
        fixed++;
        console.log(`    ⏱️ Added timeout to job '${jobName}': ${timeout} minutes`);
      }
    }
  }
  
  return fixed;
}

function hardenShellSecurity(workflow) {
  let fixed = 0;
  
  if (workflow.jobs) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (job.steps) {
        for (const [stepIndex, step] of job.steps.entries()) {
          if (step.run && typeof step.run === 'string') {
            let stepFixed = false;
            
            // Set explicit shell
            if (!step.shell) {
              step.shell = 'bash';
              stepFixed = true;
            }
            
            // Add error handling for multi-line scripts
            const lines = step.run.split('\n');
            if (lines.length > 1 && !step.run.includes('set -e')) {
              step.run = 'set -e\nset -o pipefail\n' + step.run;
              stepFixed = true;
            }
            
            if (stepFixed) {
              fixed++;
              console.log(`    🛡️ Hardened shell in job '${jobName}' step ${stepIndex}`);
            }
          }
        }
      }
    }
  }
  
  return fixed;
}

function hardenConcurrency(workflow) {
  let fixed = 0;
  
  if (!workflow.concurrency) {
    // Add concurrency control to prevent multiple runs
    workflow.concurrency = {
      group: '${{ github.workflow }}-${{ github.ref }}',
      'cancel-in-progress': true
    };
    fixed++;
    console.log(`    🔄 Added concurrency control`);
  }
  
  return fixed;
}

function hardenEnvironmentSecrets(workflow) {
  let fixed = 0;
  
  if (workflow.jobs) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (job.steps) {
        for (const [stepIndex, step] of job.steps.entries()) {
          if (step.env) {
            // Check for potential secret exposure
            for (const [envKey, envValue] of Object.entries(step.env)) {
              if (typeof envValue === 'string' && envValue.includes('secrets.')) {
                // Already using secrets properly
                continue;
              }
              
              // Check for hardcoded tokens/keys
              if (envKey.includes('TOKEN') || envKey.includes('KEY') || envKey.includes('SECRET')) {
                if (!envValue.includes('secrets.')) {
                  console.log(`    ⚠️ Warning: ${envKey} may need to use secrets in job '${jobName}' step ${stepIndex}`);
                }
              }
            }
          }
        }
      }
    }
  }
  
  return fixed;
}

function hardenWorkflow(filePath) {
  const { data, name } = loadWorkflow(filePath);
  console.log(`\n🔧 Hardening ${name}...`);
  
  let totalFixed = 0;
  
  // Apply all security hardening measures
  totalFixed += hardenActionPinning(data);
  totalFixed += hardenPermissions(data);
  totalFixed += hardenJobTimeouts(data);
  totalFixed += hardenShellSecurity(data);
  totalFixed += hardenConcurrency(data);
  totalFixed += hardenEnvironmentSecrets(data);
  
  if (totalFixed > 0) {
    saveWorkflow(filePath, data);
    console.log(`  ✅ Applied ${totalFixed} security improvements to ${name}`);
    return true;
  } else {
    console.log(`  ℹ️ No improvements needed for ${name}`);
    return false;
  }
}

async function main() {
  console.log('🛡️ Comprehensive GitHub Actions Security Hardening');
  console.log('==================================================');
  
  try {
    const workflows = getAllWorkflows();
    console.log(`📊 Found ${workflows.length} workflow files to harden`);
    
    let hardenedCount = 0;
    
    for (const workflowPath of workflows) {
      const hardened = hardenWorkflow(workflowPath);
      if (hardened) hardenedCount++;
    }
    
    console.log(`\n🎉 Comprehensive hardening complete!`);
    console.log(`📈 Hardened ${hardenedCount}/${workflows.length} workflows`);
    console.log(`\n🔒 Security improvements applied:`);
    console.log(`  • Action SHA pinning for supply chain security`);
    console.log(`  • Minimal permissions (least privilege principle)`);
    console.log(`  • Job timeouts to prevent runaway processes`);
    console.log(`  • Shell hardening with error handling`);
    console.log(`  • Concurrency control to prevent race conditions`);
    console.log(`  • Environment secret validation`);
    
    console.log(`\n📋 Next steps:`);
    console.log(`1. Run: npm run ci:audit`);
    console.log(`2. Verify all security issues resolved`);
    console.log(`3. Commit changes when audit passes`);
    
  } catch (error) {
    console.error('❌ Comprehensive hardening failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
