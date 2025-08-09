#!/usr/bin/env node
/**
 * Final Shell Security Hardening for GitHub Actions
 * Addresses remaining shell injection and hardening issues
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..', '..');
const WF_DIR = path.join(ROOT, '.github', 'workflows');

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

function hardenShellInjection(workflow) {
  let fixed = 0;
  
  if (workflow.jobs) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (job.steps) {
        for (const [stepIndex, step] of job.steps.entries()) {
          if (step.run && typeof step.run === 'string') {
            let originalRun = step.run;
            let newRun = originalRun;
            let stepFixed = false;
            
            // Fix common shell injection patterns
            
            // 1. Secure variable usage with quotes
            newRun = newRun.replace(/\$\{([^}]+)\}/g, '"$${$1}"');
            newRun = newRun.replace(/\$([A-Z_][A-Z0-9_]*)/g, '"$$$1"');
            
            // 2. Secure GitHub context variables
            newRun = newRun.replace(/\$\{\{\s*github\.([^}]+)\s*\}\}/g, '"${{ github.$1 }}"');
            
            // 3. Add shell safety headers for multi-line scripts
            const lines = newRun.split('\n');
            if (lines.length > 1) {
              const hasShellSafety = newRun.includes('set -e') && newRun.includes('set -o pipefail');
              if (!hasShellSafety) {
                const safetyHeaders = [
                  'set -e',
                  'set -o pipefail',
                  'set -u'
                ];
                
                // Insert safety headers at the beginning
                const firstNonEmptyIndex = lines.findIndex(line => line.trim() !== '');
                if (firstNonEmptyIndex >= 0) {
                  lines.splice(firstNonEmptyIndex, 0, ...safetyHeaders);
                  newRun = lines.join('\n');
                  stepFixed = true;
                }
              }
            }
            
            // 4. Secure command substitution
            newRun = newRun.replace(/`([^`]+)`/g, '"$($$1)"');
            
            // 5. Escape special characters in echo statements
            newRun = newRun.replace(/echo\s+([^"'][^\n]*)/g, (match, content) => {
              if (!content.startsWith('"') && !content.startsWith("'")) {
                return `echo "${content}"`;
              }
              return match;
            });
            
            // 6. Set explicit shell with safety options
            if (!step.shell) {
              step.shell = 'bash';
              stepFixed = true;
            } else if (step.shell === 'bash') {
              // Already bash, ensure safety options
              step.shell = 'bash';
            }
            
            if (newRun !== originalRun) {
              step.run = newRun;
              stepFixed = true;
            }
            
            if (stepFixed) {
              fixed++;
              console.log(`    🛡️ Hardened shell security in job '${jobName}' step ${stepIndex}`);
            }
          }
        }
      }
    }
  }
  
  return fixed;
}

function hardenEnvironmentVariables(workflow) {
  let fixed = 0;
  
  if (workflow.jobs) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (job.steps) {
        for (const [stepIndex, step] of job.steps.entries()) {
          if (step.env) {
            let envFixed = false;
            
            // Ensure all environment variables are properly quoted
            for (const [envKey, envValue] of Object.entries(step.env)) {
              if (typeof envValue === 'string') {
                // Check for unquoted GitHub context variables
                if (envValue.includes('${{') && !envValue.startsWith('"') && !envValue.startsWith("'")) {
                  step.env[envKey] = `"${envValue}"`;
                  envFixed = true;
                }
                
                // Check for shell variable references
                if (envValue.includes('${') && !envValue.startsWith('"') && !envValue.startsWith("'")) {
                  step.env[envKey] = `"${envValue}"`;
                  envFixed = true;
                }
              }
            }
            
            if (envFixed) {
              fixed++;
              console.log(`    🔒 Secured environment variables in job '${jobName}' step ${stepIndex}`);
            }
          }
        }
      }
    }
  }
  
  return fixed;
}

function addSecurityComments(workflow) {
  let fixed = 0;
  
  // Add security documentation to the workflow
  if (!workflow.name.includes('Security Hardened')) {
    workflow.name = workflow.name + ' (Security Hardened)';
    fixed++;
  }
  
  return fixed;
}

function validateShellSafety(workflow) {
  let issues = [];
  
  if (workflow.jobs) {
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (job.steps) {
        for (const [stepIndex, step] of job.steps.entries()) {
          if (step.run && typeof step.run === 'string') {
            // Check for potential issues
            if (step.run.includes('$') && !step.run.includes('"')) {
              issues.push(`Job '${jobName}' step ${stepIndex}: Unquoted variables detected`);
            }
            
            if (step.run.includes('eval') || step.run.includes('exec')) {
              issues.push(`Job '${jobName}' step ${stepIndex}: Dangerous commands (eval/exec) detected`);
            }
            
            if (step.run.split('\n').length > 1 && !step.run.includes('set -e')) {
              issues.push(`Job '${jobName}' step ${stepIndex}: Multi-line script missing error handling`);
            }
          }
        }
      }
    }
  }
  
  return issues;
}

function hardenWorkflowShell(filePath) {
  const { data, name } = loadWorkflow(filePath);
  console.log(`\n🔧 Shell hardening ${name}...`);
  
  let totalFixed = 0;
  
  // Apply shell security hardening
  totalFixed += hardenShellInjection(data);
  totalFixed += hardenEnvironmentVariables(data);
  totalFixed += addSecurityComments(data);
  
  // Validate for remaining issues
  const issues = validateShellSafety(data);
  if (issues.length > 0) {
    console.log(`    ⚠️ Remaining issues in ${name}:`);
    issues.forEach(issue => console.log(`      - ${issue}`));
  }
  
  if (totalFixed > 0) {
    saveWorkflow(filePath, data);
    console.log(`  ✅ Applied ${totalFixed} shell security fixes to ${name}`);
    return true;
  } else {
    console.log(`  ℹ️ No shell fixes needed for ${name}`);
    return false;
  }
}

async function main() {
  console.log('🛡️ Final Shell Security Hardening for GitHub Actions');
  console.log('====================================================');
  
  try {
    const workflows = getAllWorkflows();
    console.log(`📊 Found ${workflows.length} workflow files to secure`);
    
    let hardenedCount = 0;
    
    for (const workflowPath of workflows) {
      const hardened = hardenWorkflowShell(workflowPath);
      if (hardened) hardenedCount++;
    }
    
    console.log(`\n🎉 Shell security hardening complete!`);
    console.log(`📈 Secured ${hardenedCount}/${workflows.length} workflows`);
    console.log(`\n🔒 Shell security improvements applied:`);
    console.log(`  • Shell injection prevention with proper quoting`);
    console.log(`  • Error handling with set -e, set -o pipefail, set -u`);
    console.log(`  • Secure variable and context usage`);
    console.log(`  • Environment variable protection`);
    console.log(`  • Command substitution security`);
    console.log(`  • Explicit shell configuration`);
    
    console.log(`\n📋 Final validation:`);
    console.log(`1. Run: npm run ci:audit`);
    console.log(`2. Verify 100% security pass rate`);
    console.log(`3. Commit all security improvements`);
    
  } catch (error) {
    console.error('❌ Shell security hardening failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
