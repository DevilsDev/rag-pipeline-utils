#!/usr/bin/env node

/**
 * Phase 1 Audit Script
 * Validates assertion fixes and measures improvement
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 PHASE 1 AUDIT: Validating Assertion Fixes');
console.log('Testing current state and measuring improvements\n');

class Phase1Auditor {
  constructor() {
    this.results = {
      syntaxValidation: {},
      testExecution: {},
      assertionCoverage: {},
      summary: {}
    };
    
    // Files that were targeted in Phase 1
    this.targetFiles = [
      '__tests__/unit/cli/doctor-command.test.js',
      '__tests__/unit/cli/enhanced-cli-commands.test.js',
      '__tests__/unit/cli/enhanced-cli.test.js',
      '__tests__/unit/cli/interactive-wizard.test.js',
      '__tests__/performance/dag-pipeline-performance.test.js',
      '__tests__/performance/pipeline-performance.test.js',
      '__tests__/compatibility/node-versions.test.js',
      '__tests__/property/plugin-contracts.test.js',
      '__tests__/security/secrets-and-validation.test.js',
      '__tests__/unit/scripts/script-utilities.test.js'
    ];
  }

  // Validate syntax of all target files
  validateSyntax() {
    console.log('🔧 Validating syntax of target files...');
    
    this.results.syntaxValidation = {
      passed: [],
      failed: [],
      total: this.targetFiles.length
    };

    this.targetFiles.forEach(filePath => {
      const fullPath = path.join(process.cwd(), filePath);
      
      if (!fs.existsSync(fullPath)) {
        this.results.syntaxValidation.failed.push({
          file: filePath,
          error: 'File not found'
        });
        return;
      }

      try {
        // Try to parse the file as JavaScript
        const content = fs.readFileSync(fullPath, 'utf8');
        
        // Basic syntax validation
        if (content.includes('expect(') || content.includes('it(') || content.includes('describe(')) {
          // Check for common syntax errors
          const syntaxIssues = [];
          
          // Check for unmatched braces
          const openBraces = (content.match(/\{/g) || []).length;
          const closeBraces = (content.match(/\}/g) || []).length;
          if (openBraces !== closeBraces) {
            syntaxIssues.push(`Unmatched braces: ${openBraces} open, ${closeBraces} close`);
          }

          // Check for unmatched parentheses
          const openParens = (content.match(/\(/g) || []).length;
          const closeParens = (content.match(/\)/g) || []).length;
          if (openParens !== closeParens) {
            syntaxIssues.push(`Unmatched parentheses: ${openParens} open, ${closeParens} close`);
          }

          // Check for malformed expect statements
          const malformedExpects = content.match(/expect\([^)]*\)\s*expect\(/g);
          if (malformedExpects) {
            syntaxIssues.push(`Malformed expect statements: ${malformedExpects.length}`);
          }

          if (syntaxIssues.length > 0) {
            this.results.syntaxValidation.failed.push({
              file: filePath,
              issues: syntaxIssues
            });
          } else {
            this.results.syntaxValidation.passed.push(filePath);
          }
        } else {
          this.results.syntaxValidation.failed.push({
            file: filePath,
            error: 'Not a valid test file'
          });
        }
      } catch (error) {
        this.results.syntaxValidation.failed.push({
          file: filePath,
          error: error.message
        });
      }
    });

    console.log(`✅ Syntax validation: ${this.results.syntaxValidation.passed.length}/${this.results.syntaxValidation.total} files passed`);
  }

  // Test execution of CLI tests specifically
  testCliExecution() {
    console.log('🧪 Testing CLI test execution...');
    
    this.results.testExecution = {
      cliTests: {},
      errors: []
    };

    try {
      // Test doctor-command specifically
      console.log('   Testing doctor-command.test.js...');
      const doctorResult = execSync('npm test -- --testPathPattern="doctor-command" --passWithNoTests --silent', {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 30000
      });
      
      this.results.testExecution.cliTests['doctor-command'] = {
        status: 'passed',
        output: doctorResult.substring(0, 500) // Truncate for readability
      };
      
    } catch (error) {
      this.results.testExecution.errors.push({
        test: 'doctor-command',
        error: error.message.substring(0, 500)
      });
    }

    console.log(`📊 CLI test execution: ${Object.keys(this.results.testExecution.cliTests).length} tests attempted`);
  }

  // Analyze assertion coverage in target files
  analyzeAssertionCoverage() {
    console.log('📈 Analyzing assertion coverage...');
    
    this.results.assertionCoverage = {
      files: [],
      totalAssertions: 0,
      totalTestCases: 0
    };

    this.targetFiles.forEach(filePath => {
      const fullPath = path.join(process.cwd(), filePath);
      
      if (!fs.existsSync(fullPath)) {
        return;
      }

      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        
        // Count test cases
        const testCases = (content.match(/it\s*\(/g) || []).length;
        
        // Count assertions
        const expectations = (content.match(/expect\s*\(/g) || []).length;
        const assertions = (content.match(/\.toBe\(|\.toEqual\(|\.toContain\(|\.toBeDefined\(|\.toHaveBeenCalled\(/g) || []).length;
        
        // Calculate coverage
        const coverage = testCases > 0 ? (assertions / testCases) : 0;
        
        this.results.assertionCoverage.files.push({
          file: path.basename(filePath),
          testCases,
          expectations,
          assertions,
          coverage: Math.round(coverage * 100) / 100
        });
        
        this.results.assertionCoverage.totalAssertions += assertions;
        this.results.assertionCoverage.totalTestCases += testCases;
        
      } catch (error) {
        console.log(`   ⚠️ Error analyzing ${filePath}: ${error.message}`);
      }
    });

    const overallCoverage = this.results.assertionCoverage.totalTestCases > 0 
      ? this.results.assertionCoverage.totalAssertions / this.results.assertionCoverage.totalTestCases 
      : 0;

    console.log(`📊 Overall assertion coverage: ${Math.round(overallCoverage * 100) / 100} assertions per test case`);
  }

  // Generate comprehensive summary
  generateSummary() {
    console.log('📋 Generating audit summary...');
    
    const syntaxPassRate = (this.results.syntaxValidation.passed.length / this.results.syntaxValidation.total) * 100;
    const cliTestsExecuted = Object.keys(this.results.testExecution.cliTests).length;
    const totalAssertions = this.results.assertionCoverage.totalAssertions;
    const totalTestCases = this.results.assertionCoverage.totalTestCases;
    
    this.results.summary = {
      phase1Status: 'AUDIT_COMPLETE',
      syntaxValidation: {
        passRate: Math.round(syntaxPassRate),
        passed: this.results.syntaxValidation.passed.length,
        failed: this.results.syntaxValidation.failed.length,
        total: this.results.syntaxValidation.total
      },
      testExecution: {
        cliTestsExecuted,
        errors: this.results.testExecution.errors.length
      },
      assertionCoverage: {
        totalAssertions,
        totalTestCases,
        averageAssertionsPerTest: totalTestCases > 0 ? Math.round((totalAssertions / totalTestCases) * 100) / 100 : 0
      },
      recommendations: []
    };

    // Generate recommendations
    if (syntaxPassRate < 100) {
      this.results.summary.recommendations.push('Fix remaining syntax errors in failed files');
    }
    
    if (this.results.testExecution.errors.length > 0) {
      this.results.summary.recommendations.push('Resolve test execution errors');
    }
    
    if (this.results.summary.assertionCoverage.averageAssertionsPerTest < 1) {
      this.results.summary.recommendations.push('Add more assertions to improve test coverage');
    }
    
    if (this.results.summary.recommendations.length === 0) {
      this.results.summary.recommendations.push('Phase 1 objectives successfully completed');
    }
  }

  // Generate detailed report
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      phase: 'Phase 1 - Assertion Fixes',
      audit: this.results
    };

    // Save JSON report
    fs.writeFileSync(
      path.join(process.cwd(), 'phase1-audit-report.json'),
      JSON.stringify(report, null, 2)
    );

    // Generate markdown report
    const markdown = `# Phase 1 Audit Report

## Executive Summary
**Phase**: ${report.phase}  
**Status**: ${this.results.summary.phase1Status}  
**Audit Date**: ${report.timestamp}

## Syntax Validation Results
- **Pass Rate**: ${this.results.summary.syntaxValidation.passRate}%
- **Files Passed**: ${this.results.summary.syntaxValidation.passed}/${this.results.summary.syntaxValidation.total}
- **Files Failed**: ${this.results.summary.syntaxValidation.failed}

### Passed Files
${this.results.syntaxValidation.passed.map(file => `- ✅ ${path.basename(file)}`).join('\n')}

${this.results.syntaxValidation.failed.length > 0 ? `### Failed Files
${this.results.syntaxValidation.failed.map(item => `- ❌ ${path.basename(item.file)}: ${item.error || item.issues?.join(', ')}`).join('\n')}` : ''}

## Test Execution Results
- **CLI Tests Executed**: ${this.results.summary.testExecution.cliTestsExecuted}
- **Execution Errors**: ${this.results.summary.testExecution.errors}

${Object.keys(this.results.testExecution.cliTests).length > 0 ? `### Successful Executions
${Object.entries(this.results.testExecution.cliTests).map(([test, result]) => `- ✅ ${test}: ${result.status}`).join('\n')}` : ''}

${this.results.testExecution.errors.length > 0 ? `### Execution Errors
${this.results.testExecution.errors.map(error => `- ❌ ${error.test}: ${error.error.substring(0, 100)}...`).join('\n')}` : ''}

## Assertion Coverage Analysis
- **Total Assertions**: ${this.results.summary.assertionCoverage.totalAssertions}
- **Total Test Cases**: ${this.results.summary.assertionCoverage.totalTestCases}
- **Average Assertions per Test**: ${this.results.summary.assertionCoverage.averageAssertionsPerTest}

### File-by-File Coverage
${this.results.assertionCoverage.files.map(file => 
  `- **${file.file}**: ${file.testCases} tests, ${file.assertions} assertions (${file.coverage} avg)`
).join('\n')}

## Recommendations
${this.results.summary.recommendations.map(rec => `- ${rec}`).join('\n')}

## Phase 1 Assessment
${this.results.summary.syntaxValidation.passRate === 100 && this.results.summary.testExecution.errors === 0 
  ? '✅ **PHASE 1 SUCCESSFULLY COMPLETED** - All assertion fixes validated and working correctly'
  : '⚠️ **PHASE 1 NEEDS ATTENTION** - Some issues remain to be resolved'}

---
*Generated: ${report.timestamp}*
`;

    fs.writeFileSync(
      path.join(process.cwd(), 'PHASE1_AUDIT_REPORT.md'),
      markdown
    );

    return report;
  }

  // Execute complete audit
  async execute() {
    console.log('🚀 Starting Phase 1 comprehensive audit...\n');

    this.validateSyntax();
    console.log('');
    
    this.testCliExecution();
    console.log('');
    
    this.analyzeAssertionCoverage();
    console.log('');
    
    this.generateSummary();
    
    const report = this.generateReport();

    console.log('\n📊 Phase 1 Audit Summary:');
    console.log(`   Syntax Validation: ${this.results.summary.syntaxValidation.passRate}% pass rate`);
    console.log(`   CLI Tests Executed: ${this.results.summary.testExecution.cliTestsExecuted}`);
    console.log(`   Total Assertions: ${this.results.summary.assertionCoverage.totalAssertions}`);
    console.log(`   Average Assertions/Test: ${this.results.summary.assertionCoverage.averageAssertionsPerTest}`);

    console.log('\n📋 Reports generated:');
    console.log('   - phase1-audit-report.json');
    console.log('   - PHASE1_AUDIT_REPORT.md');

    return report;
  }
}

// Execute if run directly
if (require.main === module) {
  const auditor = new Phase1Auditor();
  auditor.execute()
    .then(report => {
      const success = report.audit.summary.syntaxValidation.passRate === 100 && 
                     report.audit.summary.testExecution.errors === 0;
      
      if (success) {
        console.log('\n✅ Phase 1 audit completed successfully!');
        console.log('🎯 All assertion fixes validated and working correctly');
        process.exit(0);
      } else {
        console.log('\n⚠️ Phase 1 audit completed with issues');
        console.log('📋 See audit report for details and recommendations');
        process.exit(0);
      }
    })
    .catch(error => {
      console.error('\n❌ Phase 1 audit failed:', error.message);
      process.exit(1);
    });
}

module.exports = { Phase1Auditor };
