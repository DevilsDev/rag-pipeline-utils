#!/usr/bin/env node

/**
 * Test Categorizer Script
 * Parses Jest output and categorizes failures for systematic fixing
 */

const fs = require('fs');
const path = require('path');

class TestCategorizer {
  constructor() {
    this.categories = {
      'module-resolution': [],
      'implementation': [],
      'async-timing': [],
      'mock-contract': [],
      'performance': [],
      'environment': []
    };
    
    this.patterns = {
      'module-resolution': [
        /Cannot find module/i,
        /Module not found/i,
        /empty exports/i,
        /SyntaxError.*import/i,
        /require.*is not a function/i,
        /Cannot resolve module/i
      ],
      'implementation': [
        /is not a function/i,
        /undefined.*property/i,
        /TypeError.*not a function/i,
        /Missing required/i,
        /Expected.*but received/i,
        /Property.*does not exist/i,
        /signature mismatch/i
      ],
      'async-timing': [
        /timeout/i,
        /Promise.*rejected/i,
        /async.*await/i,
        /streaming/i,
        /backpressure/i,
        /race condition/i
      ],
      'mock-contract': [
        /mock.*not.*function/i,
        /jest\.fn/i,
        /mockReturnValue/i,
        /mockImplementation/i,
        /toHaveBeenCalled/i,
        /spy.*not.*called/i
      ],
      'performance': [
        /benchmark/i,
        /threshold/i,
        /memory.*limit/i,
        /execution.*time/i,
        /performance/i
      ],
      'environment': [
        /ENOENT/i,
        /permission.*denied/i,
        /file.*not.*found/i,
        /network.*error/i,
        /connection.*refused/i
      ]
    };
  }

  categorizeFailure(testName, errorMessage, stackTrace) {
    const fullText = `${testName} ${errorMessage} ${stackTrace}`.toLowerCase();
    
    for (const [category, patterns] of Object.entries(this.patterns)) {
      if (patterns.some(pattern => pattern.test(fullText))) {
        return category;
      }
    }
    
    return 'uncategorized';
  }

  parseJestResults(resultsPath) {
    if (!fs.existsSync(resultsPath)) {
      console.error(`Jest results file not found: ${resultsPath}`);
      return null;
    }

    let results;
    try {
      const rawData = fs.readFileSync(resultsPath, 'utf8');
      
      // Check if the file contains valid JSON
      if (!rawData.trim().startsWith('{') && !rawData.trim().startsWith('[')) {
        console.error(`Invalid JSON in results file: ${resultsPath}`);
        console.error('File appears to contain console output instead of JSON');
        console.log('Running fresh test with JSON output...');
        
        // Run a fresh test with JSON output
        const { execSync } = require('child_process');
        try {
          execSync('npm test -- --json --outputFile=test-results-fresh.json --passWithNoTests', 
                   { cwd: process.cwd(), stdio: 'inherit' });
          
          // Try to read the fresh results
          if (fs.existsSync('test-results-fresh.json')) {
            const freshData = fs.readFileSync('test-results-fresh.json', 'utf8');
            results = JSON.parse(freshData);
          } else {
            throw new Error('Fresh test results not generated');
          }
        } catch (testError) {
          console.error('Failed to run fresh test:', testError.message);
          return null;
        }
      } else {
        results = JSON.parse(rawData);
      }
    } catch (error) {
      console.error(`Error parsing Jest results: ${error.message}`);
      return null;
    }
    
    results.testResults.forEach(suite => {
      if (suite.status === 'failed') {
        suite.assertionResults.forEach(test => {
          if (test.status === 'failed') {
            const category = this.categorizeFailure(
              test.title,
              test.failureMessages.join(' '),
              test.location ? JSON.stringify(test.location) : ''
            );
            
            this.categories[category].push({
              suite: suite.name,
              test: test.title,
              error: test.failureMessages[0],
              duration: test.duration,
              location: test.location
            });
          }
        });
      }
    });

    return {
      summary: results.numFailedTestSuites + ' failed suites, ' + 
               results.numFailedTests + ' failed tests',
      categories: this.categories,
      timestamp: new Date().toISOString()
    };
  }

  generateReport(categorizedResults) {
    const reportPath = path.join(process.cwd(), 'docs', 'TEST_STABILIZATION_ANALYSIS.md');
    
    let report = `# Test Stabilization Analysis\n\n`;
    report += `**Generated**: ${categorizedResults.timestamp}\n`;
    report += `**Summary**: ${categorizedResults.summary}\n\n`;
    
    Object.entries(categorizedResults.categories).forEach(([category, failures]) => {
      if (failures.length > 0) {
        report += `## ${category.toUpperCase()} (${failures.length} failures)\n\n`;
        
        failures.forEach(failure => {
          report += `### ${failure.test}\n`;
          report += `- **Suite**: ${failure.suite}\n`;
          report += `- **Error**: ${failure.error.substring(0, 200)}...\n`;
          report += `- **Duration**: ${failure.duration}ms\n\n`;
        });
      }
    });
    
    // Ensure docs directory exists
    const docsDir = path.dirname(reportPath);
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, report);
    console.log(`Report generated: ${reportPath}`);
    
    return reportPath;
  }

  saveCategories(categorizedResults) {
    const outputPath = path.join(process.cwd(), 'ci-reports', 'test-categories.json');
    
    // Ensure ci-reports directory exists
    const reportsDir = path.dirname(outputPath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(categorizedResults, null, 2));
    console.log(`Categories saved: ${outputPath}`);
    
    return outputPath;
  }
}

// Main execution
if (require.main === module) {
  const categorizer = new TestCategorizer();
  const resultsPath = process.argv[2] || path.join(process.cwd(), 'test-results-current.json');
  
  console.log('Categorizing test failures...');
  const results = categorizer.parseJestResults(resultsPath);
  
  if (results) {
    categorizer.saveCategories(results);
    categorizer.generateReport(results);
    
    console.log('\nCategorization Summary:');
    Object.entries(results.categories).forEach(([category, failures]) => {
      console.log(`  ${category}: ${failures.length} failures`);
    });
  }
}

module.exports = TestCategorizer;
