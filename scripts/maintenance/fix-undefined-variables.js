#!/usr/bin/env node

/**
 * Undefined Variable Fixer
 * 
 * Systematically fixes all remaining undefined variable errors (no-undef) 
 * that are blocking commits in the pre-commit hook.
 */

const fs = require('fs'); // eslint-disable-line global-require
const path = require('path'); // eslint-disable-line global-require
const { execSync } = require('child_process'); // eslint-disable-line global-require

class UndefinedVariableFixer {
  constructor() {
    this.fixedFiles = [];
    this.report = {
      initialErrors: 0,
      finalErrors: 0,
      fixedErrors: 0
    };
  }

  async run() {
    console.log('🔧 Undefined Variable Fixer'); // eslint-disable-line no-console
    console.log('==========================='); // eslint-disable-line no-console
    
    try {
      // Get initial error count
      this.report.initialErrors = this.getUndefinedVariableCount();
      console.log(`📊 Initial undefined variable errors: ${this.report.initialErrors}`); // eslint-disable-line no-console
      
      // Apply systematic fixes
      await this.fixParameterMismatches();
      await this.fixCommonUndefinedVariables();
      
      // Get final error count
      this.report.finalErrors = this.getUndefinedVariableCount();
      this.report.fixedErrors = this.report.initialErrors - this.report.finalErrors;
      
      console.log(`✅ Fixed ${this.report.fixedErrors} undefined variable errors`); // eslint-disable-line no-console
      console.log(`📊 Remaining errors: ${this.report.finalErrors}`); // eslint-disable-line no-console
      
      if (this.report.finalErrors === 0) {
        console.log('🎉 All undefined variable errors resolved!'); // eslint-disable-line no-console
      }
      
    } catch (error) {
      console.error('❌ Error during undefined variable fixing:', error.message); // eslint-disable-line no-console
      process.exit(1);
    }
  }

  getUndefinedVariableCount() {
    try {
      const output = execSync('npx eslint . --quiet --format=compact', { 
        cwd: process.cwd(),
        encoding: 'utf8'
      });
      return 0;
    } catch (error) {
      const output = error.stdout || error.message || '';
      const undefinedErrors = output.split('\n').filter(line => 
        line.includes('is not defined') && line.includes('no-undef')
      );
      return undefinedErrors.length;
    }
  }

  async fixParameterMismatches() {
    console.log('🔍 Fixing parameter name mismatches...'); // eslint-disable-line no-console
    
    const commonMismatches = [
      // Functions with underscore prefixed parameters
      {
        pattern: /function\s+\w+\s*\(([^)]*_[^)]*)\)/g,
        handler: (_filePath, content) => {
          // Find functions with underscore parameters and fix their usage
          const lines = content.split('\n');
          let modified = false;
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Common patterns of underscore parameter usage errors
            const fixes = [
              { from: /\btype\b/g, to: '_type' },
              { from: /\binstance\b/g, to: '_instance' },
              { from: /\bfilePath\b/g, to: '_filePath' },
              { from: /\bfn\b/g, to: '_fn' },
              { from: /\bconfig\b/g, to: '_config' },
              { from: /\boptions\b/g, to: '_options' }
            ];
            
            for (const fix of fixes) {
              if (fix.from.test(line) && !line.includes('function') && !line.includes('//')) {
                lines[i] = line.replace(fix.from, fix.to);
                modified = true;
              }
            }
          }
          
          return modified ? lines.join('\n') : content;
        }
      }
    ];

    const jsFiles = this.getAllJSFiles();
    
    for (const _filePath of jsFiles) {
      if (fs.existsSync(_filePath)) {
        let content = fs.readFileSync(_filePath, 'utf8');
        let modified = false;

        for (const mismatch of commonMismatches) {
          const newContent = mismatch.handler(_filePath, content);
          if (newContent !== content) {
            content = newContent;
            modified = true;
          }
        }

        if (modified) {
          fs.writeFileSync(_filePath, content);
          this.fixedFiles.push(_filePath);
          console.log(`  ✅ Fixed parameter mismatches in ${_filePath}`); // eslint-disable-line no-console
        }
      }
    }
  }

  async fixCommonUndefinedVariables() {
    console.log('🔍 Fixing common undefined variable patterns...'); // eslint-disable-line no-console
    
    // Get specific undefined variable errors from ESLint
    let eslintOutput = '';
    try {
      execSync('npx eslint . --quiet --format=compact', { 
        cwd: process.cwd(),
        encoding: 'utf8'
      });
    } catch (error) {
      eslintOutput = error.stdout || error.message || '';
    }

    // Parse specific undefined variables from ESLint output
    const undefinedVars = new Set();
    const lines = eslintOutput.split('\n');
    
    for (const line of lines) {
      const match = line.match(/'([^']+)' is not defined/);
      if (match) {
        undefinedVars.add(match[1]);
      }
    }

    console.log(`  Found undefined variables: ${Array.from(undefinedVars).join(', ')}`); // eslint-disable-line no-console

    // Fix specific files with known undefined variable issues
    const specificFixes = [
      {
        file: 'src/utils/validate-plugin-contract.js',
        fixes: [
          { from: /\btype\b/g, to: '_type' },
          { from: /\binstance\b/g, to: '_instance' },
          { from: /\bfilePath\b/g, to: '_filePath' }
        ]
      },
      {
        file: 'src/utils/retry.js',
        fixes: [
          { from: /\bfn\b/g, to: '_fn' },
          { from: /\bconfig\b/g, to: '_config' }
        ]
      }
    ];

    for (const fix of specificFixes) {
      if (fs.existsSync(fix.file)) {
        let content = fs.readFileSync(fix.file, 'utf8');
        let modified = false;

        for (const replacement of fix.fixes) {
          const lines = content.split('\n');
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Only replace in non-comment, non-function-declaration lines
            if (!line.trim().startsWith('//') && 
                !line.includes('function') && 
                replacement.from.test(line)) {
              lines[i] = line.replace(replacement.from, replacement.to);
              modified = true;
            }
          }
          
          content = lines.join('\n');
        }

        if (modified) {
          fs.writeFileSync(fix.file, content);
          this.fixedFiles.push(fix.file);
          console.log(`  ✅ Fixed undefined variables in ${fix.file}`); // eslint-disable-line no-console
        }
      }
    }
  }

  getAllJSFiles() {
    const files = [];
    
    const scanDirectory = (dir) => {
      if (!fs.existsSync(dir)) return;
      
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          scanDirectory(itemPath);
        } else if (item.endsWith('.js')) {
          files.push(itemPath);
        }
      }
    };
    
    // Focus on key directories
    ['src', 'scripts'].forEach(dir => {
      scanDirectory(dir);
    });
    
    return files;
  }
}

// Run the fixer
if (require.main === module) {
  const fixer = new UndefinedVariableFixer();
  fixer.run().catch(console.error);
}

module.exports = UndefinedVariableFixer;
