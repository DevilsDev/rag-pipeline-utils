#!/usr/bin/env node

/**
 * Critical ESLint Blocker Fixer
 * 
 * Systematically fixes the remaining 29 ESLint errors that are blocking commits.
 * Focuses on parsing errors, malformed comments, and critical syntax issues.
 */

const fs = require('fs'); // eslint-disable-line global-require
const path = require('path'); // eslint-disable-line global-require
const { execSync } = require('child_process'); // eslint-disable-line global-require

class CriticalESLintFixer {
  constructor() {
    this.fixedFiles = [];
    this.errors = [];
    this.report = {
      totalErrors: 0,
      fixedErrors: 0,
      remainingErrors: 0,
      filesProcessed: 0
    };
  }

  async run() {
    console.log('🔧 Critical ESLint Blocker Fixer'); // eslint-disable-line no-console
    console.log('================================'); // eslint-disable-line no-console
    
    try {
      // Get current ESLint errors
      const eslintOutput = this.getESLintErrors();
      this.report.totalErrors = this.parseErrorCount(eslintOutput);
      
      console.log(`📊 Found ${this.report.totalErrors} ESLint errors to fix`); // eslint-disable-line no-console
      
      // Apply targeted fixes
      await this.fixMalformedComments();
      await this.fixParsingErrors();
      await this.fixUnusedVariables();
      
      // Run final ESLint check
      const finalErrors = this.getESLintErrors();
      this.report.remainingErrors = this.parseErrorCount(finalErrors);
      this.report.fixedErrors = this.report.totalErrors - this.report.remainingErrors;
      
      // Generate report
      this.generateReport();
      
      console.log(`✅ Fixed ${this.report.fixedErrors} errors, ${this.report.remainingErrors} remaining`); // eslint-disable-line no-console
      
    } catch (error) {
      console.error('❌ Error during ESLint fixing:', error.message); // eslint-disable-line no-console
      process.exit(1);
    }
  }

  getESLintErrors() {
    try {
      execSync('npx eslint . --quiet --format=compact', { 
        cwd: process.cwd(),
        encoding: 'utf8'
      });
      return '';
    } catch (error) {
      return error.stdout || error.message || '';
    }
  }

  parseErrorCount(output) {
    if (!output) return 0;
    const lines = output.split('\n').filter(line => line.trim());
    return lines.length;
  }

  async fixMalformedComments() {
    console.log('🔍 Fixing malformed ESLint disable comments...'); // eslint-disable-line no-console
    
    const patterns = [
      {
        // Double eslint-disable-line comments
        regex: /\/\/ eslint-disable-line \/\/ eslint-disable-line no-console/g,
        replacement: '// eslint-disable-line no-console'
      },
      {
        // Malformed no-console comments
        regex: /\/\/ eslint-disable-line no-consoleconst/g,
        replacement: '// eslint-disable-line no-console\n      const'
      },
      {
        // Malformed no-console comments at end of line
        regex: /\/\/ eslint-disable-line no-console\/\/ /g,
        replacement: '// eslint-disable-line no-console\n        // '
      },
      {
        // Invalid rule definitions
        regex: /Definition for rule '\/\/ eslint-disable-line no-console' was not found/g,
        replacement: ''
      }
    ];

    const filesToCheck = [
      'src/cli/commands/ai-ml.js',
      'src/cli/commands/dx.js',
      'src/cli/commands/docs.js'
    ];

    for (const _filePath of filesToCheck) {
      if (fs.existsSync(_filePath)) {
        let content = fs.readFileSync(_filePath, 'utf8');
        let modified = false;

        for (const pattern of patterns) {
          if (pattern.regex.test(content)) {
            content = content.replace(pattern.regex, pattern.replacement);
            modified = true;
          }
        }

        if (modified) {
          fs.writeFileSync(_filePath, content);
          this.fixedFiles.push(_filePath);
          console.log(`  ✅ Fixed malformed comments in ${_filePath}`); // eslint-disable-line no-console
        }
      }
    }
  }

  async fixParsingErrors() {
    console.log('🔍 Fixing parsing errors...'); // eslint-disable-line no-console
    
    // Fix specific parsing issues
    const fixes = [
      {
        file: 'scripts/maintenance/resolve-all-eslint-errors.js',
        pattern: /case 'no-unused-vars':\s*const/,
        replacement: "case 'no-unused-vars': {\n        const"
      }
    ];

    for (const fix of fixes) {
      if (fs.existsSync(fix.file)) {
        let content = fs.readFileSync(fix.file, 'utf8');
        
        if (fix.pattern.test(content)) {
          content = content.replace(fix.pattern, fix.replacement);
          fs.writeFileSync(fix.file, content);
          this.fixedFiles.push(fix.file);
          console.log(`  ✅ Fixed parsing error in ${fix.file}`); // eslint-disable-line no-console
        }
      }
    }
  }

  async fixUnusedVariables() {
    console.log('🔍 Fixing unused variables...'); // eslint-disable-line no-console
    
    try {
      // Run ESLint auto-fix for unused variables
      execSync('npx eslint . --fix --quiet', { 
        cwd: process.cwd(),
        stdio: 'pipe'
      });
      console.log('  ✅ Applied ESLint auto-fixes'); // eslint-disable-line no-console
    } catch (error) {
      // ESLint will exit with code 1 if there are remaining errors
      console.log('  ⚠️  Some errors could not be auto-fixed'); // eslint-disable-line no-console
    }
  }

  generateReport() {
    const reportPath = 'docs/CRITICAL_ESLINT_FIX_REPORT.md';
    
    const report = `# Critical ESLint Blocker Fix Report

## Summary
- **Total Errors Found**: ${this.report.totalErrors}
- **Errors Fixed**: ${this.report.fixedErrors}
- **Remaining Errors**: ${this.report.remainingErrors}
- **Files Processed**: ${this.fixedFiles.length}

## Files Modified
${this.fixedFiles.map(file => `- ${file}`).join('\n')}

## Fix Categories Applied
1. **Malformed ESLint Disable Comments**: Fixed double comments and invalid rule definitions
2. **Parsing Errors**: Resolved lexical declaration and syntax issues
3. **Auto-fixable Issues**: Applied ESLint auto-fixes for unused variables

## Next Steps
${this.report.remainingErrors > 0 ? 
  `⚠️  ${this.report.remainingErrors} errors remain and require manual review.` :
  '✅ All ESLint errors have been resolved. Commits should now be unblocked.'
}

## Commit Status
${this.report.remainingErrors === 0 ? 
  '🟢 **READY TO COMMIT** - All blocking ESLint errors resolved' :
  '🟡 **MANUAL REVIEW REQUIRED** - Some errors need individual attention'
}

---
Generated: ${new Date().toISOString()}
`;

    fs.writeFileSync(reportPath, report);
    console.log(`📋 Report saved to ${reportPath}`); // eslint-disable-line no-console
  }
}

// Run the fixer
if (require.main === module) {
  const fixer = new CriticalESLintFixer();
  fixer.run().catch(console.error);
}

module.exports = CriticalESLintFixer;
