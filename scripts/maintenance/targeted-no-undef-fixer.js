#!/usr/bin/env node

/**
 * Targeted no-undef Parameter Fixer
 * 
 * Systematically fixes parameter mismatch patterns causing no-undef errors
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class TargetedNoUndefFixer {
  constructor() {
    this.fixedFiles = [];
    this.fixedErrors = 0;
  }

  async run() {
    console.log('🎯 Targeted no-undef Parameter Fixer');
    console.log('====================================');
    
    const beforeCount = this.getNoUndefCount();
    console.log(`📊 Initial no-undef errors: ${beforeCount}`);
    
    // Get specific undefined variables from ESLint output
    const undefinedVars = this.getUndefinedVariables();
    console.log(`🔍 Found ${undefinedVars.size} files with undefined variables`);
    
    // Fix each file's specific issues
    for (const [filePath, variables] of undefinedVars) {
      await this.fixFileUndefinedVars(filePath, variables);
    }
    
    const afterCount = this.getNoUndefCount();
    const fixed = beforeCount - afterCount;
    
    console.log(`✅ Fixed ${fixed} no-undef errors (${beforeCount} → ${afterCount})`);
    console.log(`📁 Modified ${this.fixedFiles.length} files`);
    
    return afterCount;
  }

  getNoUndefCount() {
    try {
      execSync('npx eslint . --quiet --format=compact', { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      return 0;
    } catch (error) {
      const output = error.stdout || '';
      const noUndefLines = output.split('\n').filter(line => 
        line.includes('is not defined') && line.includes('no-undef')
      );
      return noUndefLines.length;
    }
  }

  getUndefinedVariables() {
    const undefinedVars = new Map();
    
    try {
      execSync('npx eslint . --format=compact', { encoding: 'utf8' });
    } catch (error) {
      const output = error.stdout || '';
      const lines = output.split('\n');
      
      for (const line of lines) {
        const match = line.match(/^([^:]+):.*'([^']+)' is not defined.*no-undef/);
        if (match) {
          const [, filePath, varName] = match;
          if (!undefinedVars.has(filePath)) {
            undefinedVars.set(filePath, new Set());
          }
          undefinedVars.get(filePath).add(varName);
        }
      }
    }
    
    return undefinedVars;
  }

  async fixFileUndefinedVars(filePath, variables) {
    if (!fs.existsSync(filePath)) return;
    
    console.log(`🔧 Fixing ${path.relative(process.cwd(), filePath)}`);
    console.log(`   Variables: ${Array.from(variables).join(', ')}`);
    
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Strategy 1: Fix parameter mismatches (underscore prefix)
    for (const varName of variables) {
      const underscoreVar = `_${varName}`;
      
      if (content.includes(underscoreVar)) {
        modified = this.fixParameterMismatch(content, varName, underscoreVar) || modified;
      }
    }

    // Strategy 2: Fix common missing imports
    modified = this.addMissingImports(content, variables) || modified;

    // Strategy 3: Fix function scope issues
    modified = this.fixFunctionScopeIssues(content, variables) || modified;

    if (modified) {
      // Apply the fixes
      content = this.applyFixes(content, variables);
      fs.writeFileSync(filePath, content);
      this.fixedFiles.push(filePath);
      console.log(`   ✅ Fixed undefined variables`);
    } else {
      console.log(`   ⚠️  No automatic fixes available`);
    }
  }

  fixParameterMismatch(content, varName, underscoreVar) {
    // Check if this is a parameter mismatch pattern
    const functionRegex = new RegExp(`function\\s+\\w+\\s*\\([^)]*\\b${underscoreVar}\\b[^)]*\\)`, 'g');
    const arrowFunctionRegex = new RegExp(`\\([^)]*\\b${underscoreVar}\\b[^)]*\\)\\s*=>`, 'g');
    
    return functionRegex.test(content) || arrowFunctionRegex.test(content);
  }

  addMissingImports(content, variables) {
    const commonModules = {
      'fs': "const fs = require('fs');",
      'path': "const path = require('path');",
      'chalk': "const chalk = require('chalk');",
      'ora': "const ora = require('ora');",
      'expect': "const { expect } = require('@jest/globals');",
      'describe': "const { describe, it, beforeEach, afterEach } = require('@jest/globals');",
      'it': "const { describe, it, beforeEach, afterEach } = require('@jest/globals');"
    };

    for (const varName of variables) {
      if (commonModules[varName] && !content.includes(`require('${varName}')`)) {
        return true;
      }
    }
    
    return false;
  }

  fixFunctionScopeIssues(content, variables) {
    // Look for variables that might be defined in outer scopes
    for (const varName of variables) {
      // Check if variable is defined elsewhere in the file
      const defineRegex = new RegExp(`\\b(const|let|var)\\s+${varName}\\b`, 'g');
      if (defineRegex.test(content)) {
        return true; // Might be a scope issue
      }
    }
    
    return false;
  }

  applyFixes(content, variables) {
    const lines = content.split('\n');
    let modified = false;

    // Fix parameter mismatches
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip function declarations and parameter lists
      if (line.includes('function') || line.includes('=>') || 
          line.trim().startsWith('//') || line.includes('*')) {
        continue;
      }
      
      for (const varName of variables) {
        const underscoreVar = `_${varName}`;
        
        // If underscore version exists in file, replace usage
        if (content.includes(underscoreVar)) {
          const regex = new RegExp(`\\b${varName}\\b(?![\\w_])`, 'g');
          if (regex.test(line)) {
            lines[i] = line.replace(regex, underscoreVar);
            modified = true;
          }
        }
      }
    }

    // Add missing imports at the top
    const importsToAdd = [];
    const commonModules = {
      'fs': "const fs = require('fs');",
      'path': "const path = require('path');",
      'chalk': "const chalk = require('chalk');",
      'ora': "const ora = require('ora');"
    };

    for (const varName of variables) {
      if (commonModules[varName] && !content.includes(`require('${varName}')`)) {
        importsToAdd.push(commonModules[varName]);
      }
    }

    if (importsToAdd.length > 0) {
      const insertIndex = this.findImportInsertIndex(lines);
      lines.splice(insertIndex, 0, ...importsToAdd);
      modified = true;
    }

    return modified ? lines.join('\n') : content;
  }

  findImportInsertIndex(lines) {
    let insertIndex = 0;
    
    // Skip shebang and initial comments
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#!') || line.startsWith('//') || line.startsWith('/*') || line === '') {
        insertIndex = i + 1;
      } else if (line.startsWith('const') || line.startsWith('require')) {
        insertIndex = i;
        break;
      } else {
        break;
      }
    }
    
    return insertIndex;
  }
}

// Run if called directly
if (require.main === module) {
  const fixer = new TargetedNoUndefFixer();
  fixer.run().then(remainingErrors => {
    if (remainingErrors === 0) {
      console.log('🎉 All no-undef errors resolved!');
      process.exit(0);
    } else {
      console.log(`⚠️  ${remainingErrors} no-undef errors remain`);
      process.exit(1);
    }
  }).catch(error => {
    console.error('❌ Fixer failed:', error);
    process.exit(1);
  });
}

module.exports = TargetedNoUndefFixer;
