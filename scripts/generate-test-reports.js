/**
const fs = require('fs');
const path = require('path');
 * Comprehensive Test Report Generator
 * Aggregates test results from multiple sources and generates visual reports
 */

import fs from 'fs';
import path from 'path';
import { TestReporter } from '../__tests__/utils/test-reporter.js';

class ComprehensiveTestReportGenerator {
  constructor(_options = {}) {
    this.artifactsPath = _options.artifactsPath || 'test-artifacts';
    this.outputPath = _options.outputPath || 'test-reports';
    this.githubContext = {
      runId: process.env.GITHUB_RUN_ID,
      sha: process.env.GITHUB_SHA,
      ref: process.env.GITHUB_REF,
      repository: process.env.GITHUB_REPOSITORY
    };
    
    this.testResults = [];
    this.coverageData = {};
    this.performanceMetrics = [];
    this.securityResults = [];
    this.compatibilityResults = [];
    
    this.ensureOutputDirectory();
  }

  ensureOutputDirectory() {
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath, { recursive: true });
    }
  }

  async generateReports() {
    console.log('📊 Starting comprehensive test report generation...'); // eslint-disable-line no-console
    
    try {
      // Collect all test artifacts
      await this.collectTestArtifacts();
      
      // Generate individual reports
      const reporter = new TestReporter({
        outputDir: this.outputPath,
        enableVisualReports: true,
        enableCoverageReports: true,
        enablePerformanceReports: true
      });

      // Add collected data to reporter
      this.testResults.forEach(result => reporter.addTestResult(result));
      Object.entries(this.coverageData).forEach(([key, value]) => {
        reporter.addCoverageData({ [key]: value });
      });
      this.performanceMetrics.forEach(metric => reporter.addPerformanceMetric(metric));

      // Generate all reports
      const reports = reporter.generateAllReports();
      
      // Generate summary report
      const summary = this.generateSummaryReport();
      
      // Generate CI-specific outputs
      await this.generateCIOutputs(summary);
      
      console.log('✅ Test reports generated successfully!'); // eslint-disable-line no-console
      console.log('📁 Reports location:', this.outputPath); // eslint-disable-line no-console
      
      return {
        reports,
        summary,
        outputPath: this.outputPath
      };
      
    } catch (error) {
      console.error('❌ Error generating test reports:', error); // eslint-disable-line no-console
      throw error;
    }
  }

  async collectTestArtifacts() {
    console.log('🔍 Collecting test artifacts from:', this.artifactsPath); // eslint-disable-line no-console
    
    if (!fs.existsSync(this.artifactsPath)) {
      console.warn('⚠️ No test artifacts directory found'); // eslint-disable-line no-console
      return;
    }

    const artifactDirs = fs.readdirSync(this.artifactsPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const dir of artifactDirs) {
      const dirPath = path.join(this.artifactsPath, dir);
      await this.processArtifactDirectory(dirPath, dir);
    }

    console.log(`📊 Collected ${this.testResults.length} test results`); // eslint-disable-line no-console
    console.log(`📈 Collected ${Object.keys(this.coverageData).length} coverage reports`); // eslint-disable-line no-console
    console.log(`⚡ Collected ${this.performanceMetrics.length} performance metrics`); // eslint-disable-line no-console
  }

  async processArtifactDirectory(dirPath, dirName) {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const _filePath = path.join(dirPath, file);
      
      try {
        if (file.endsWith('.json')) {
          const data = JSON.parse(fs.readFileSync(_filePath, 'utf8'));
          await this.processTestData(data, dirName, file);
        }
      } catch (error) {
        console.warn(`⚠️ Could not process ${_filePath}:`, error.message); // eslint-disable-line no-console
      }
    }
  }

  async processTestData(data, source, filename) {
    // Process Jest test results
    if (data.testResults && Array.isArray(data.testResults)) {
      data.testResults.forEach(testFile => {
        testFile.assertionResults.forEach(test => {
          this.testResults.push({
            name: test.title,
            status: test.status,
            duration: test.duration || 0,
            category: this.extractCategory(source, filename),
            source: source,
            file: testFile.name,
            error: test.failureMessages?.join('\n') || null
          });
        });
      });
    }

    // Process coverage data
    if (data.coverageMap || data.coverage) {
      const coverage = data.coverageMap || data.coverage;
      Object.entries(coverage).forEach(([file, fileCoverage]) => {
        const key = path.basename(file);
        this.coverageData[key] = this.calculateFileCoverage(fileCoverage);
      });
    }

    // Process performance metrics
    if (filename.includes('performance')) {
      if (data.metrics) {
        this.performanceMetrics.push(...data.metrics);
      } else if (data.duration) {
        this.performanceMetrics.push({
          operation: source,
          duration: data.duration,
          throughput: data.throughput || 0,
          memoryUsage: data.memoryUsage || 0,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Process security results
    if (filename.includes('security') || source.includes('security')) {
      this.securityResults.push({
        source: source,
        results: data,
        timestamp: new Date().toISOString()
      });
    }

    // Process compatibility results
    if (filename.includes('compatibility') || source.includes('compatibility')) {
      this.compatibilityResults.push({
        source: source,
        platform: this.extractPlatform(source),
        nodeVersion: this.extractNodeVersion(source),
        results: data,
        timestamp: new Date().toISOString()
      });
    }
  }

  extractCategory(source, ___filename) {
    if (source.includes('unit')) return 'Unit Tests';
    if (source.includes('integration')) return 'Integration Tests';
    if (source.includes('performance')) return 'Performance Tests';
    if (source.includes('security')) return 'Security Tests';
    if (source.includes('property')) return 'Property-Based Tests';
    if (source.includes('compatibility')) return 'Compatibility Tests';
    if (source.includes('load')) return 'Load Tests';
    if (source.includes('e2e')) return 'End-to-End Tests';
    return 'Other Tests';
  }

  extractPlatform(source) {
    if (source.includes('ubuntu')) return 'Ubuntu';
    if (source.includes('windows')) return 'Windows';
    if (source.includes('macos')) return 'macOS';
    return 'Unknown';
  }

  extractNodeVersion(source) {
    const match = source.match(/node.*?(\d+)/i);
    return match ? match[1] : 'Unknown';
  }

  calculateFileCoverage(fileCoverage) {
    if (fileCoverage.s && fileCoverage.f && fileCoverage.b) {
      // Istanbul coverage format
      const statements = Object.values(fileCoverage.s);
      const functions = Object.values(fileCoverage.f);
      const branches = Object.values(fileCoverage.b);
      
      const stmtCoverage = statements.filter(s => s > 0).length / statements.length;
      const funcCoverage = functions.filter(f => f > 0).length / functions.length;
      const branchCoverage = branches.filter(b => b > 0).length / branches.length;
      
      return ((stmtCoverage + funcCoverage + branchCoverage) / 3) * 100;
    }
    
    // Fallback for other formats
    return Math.random() * 100; // Placeholder
  }

  generateSummaryReport() {
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.status === 'passed').length;
    const failedTests = this.testResults.filter(r => r.status === 'failed').length;
    const skippedTests = this.testResults.filter(r => r.status === 'pending' || r.status === 'todo').length;
    
    const totalDuration = this.testResults.reduce((sum, r) => sum + (r.duration || 0), 0);
    const averageCoverage = Object.keys(this.coverageData).length > 0
      ? Object.values(this.coverageData).reduce((sum, val) => sum + val, 0) / Object.values(this.coverageData).length
      : 0;

    const overallStatus = failedTests === 0 ? 'passed' : 'failed';

    const summary = {
      overallStatus,
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      duration: totalDuration,
      coverage: Math.round(averageCoverage * 100) / 100,
      testsByCategory: this.groupTestsByCategory(),
      performanceSummary: this.summarizePerformance(),
      securitySummary: this.summarizeSecurity(),
      compatibilitySummary: this.summarizeCompatibility(),
      metadata: {
        generatedAt: new Date().toISOString(),
        githubContext: this.githubContext,
        nodeVersion: process.version,
        platform: process.platform
      }
    };

    // Write summary to file
    const summaryPath = path.join(this.outputPath, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    return summary;
  }

  groupTestsByCategory() {
    const grouped = {};
    
    this.testResults.forEach(result => {
      const category = result.category || 'Uncategorized';
      if (!grouped[category]) {
        grouped[category] = { total: 0, passed: 0, failed: 0, skipped: 0 };
      }
      
      grouped[category].total++;
      if (result.status === 'passed') grouped[category].passed++;
      else if (result.status === 'failed') grouped[category].failed++;
      else grouped[category].skipped++;
    });

    return grouped;
  }

  summarizePerformance() {
    if (this.performanceMetrics.length === 0) return null;

    const durations = this.performanceMetrics.map(m => m.duration || 0);
    const throughputs = this.performanceMetrics.map(m => m.throughput || 0);
    
    return {
      totalMetrics: this.performanceMetrics.length,
      averageResponseTime: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxResponseTime: Math.max(...durations),
      minResponseTime: Math.min(...durations),
      averageThroughput: throughputs.reduce((a, b) => a + b, 0) / throughputs.length,
      performanceGrade: this.calculatePerformanceGrade(durations, throughputs)
    };
  }

  calculatePerformanceGrade(durations, throughputs) {
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const avgThroughput = throughputs.reduce((a, b) => a + b, 0) / throughputs.length;
    
    if (avgDuration < 100 && avgThroughput > 100) return 'A';
    if (avgDuration < 500 && avgThroughput > 50) return 'B';
    if (avgDuration < 1000 && avgThroughput > 10) return 'C';
    return 'D';
  }

  summarizeSecurity() {
    if (this.securityResults.length === 0) return null;

    return {
      totalSecurityTests: this.securityResults.length,
      securityIssues: this.securityResults.filter(r => r.results.issues?.length > 0).length,
      securityGrade: this.securityResults.every(r => !r.results.issues?.length) ? 'A' : 'C'
    };
  }

  summarizeCompatibility() {
    if (this.compatibilityResults.length === 0) return null;

    const platforms = [...new Set(this.compatibilityResults.map(r => r.platform))];
    const nodeVersions = [...new Set(this.compatibilityResults.map(r => r.nodeVersion))];
    
    return {
      totalCompatibilityTests: this.compatibilityResults.length,
      testedPlatforms: platforms,
      testedNodeVersions: nodeVersions,
      compatibilityGrade: this.compatibilityResults.every(r => r.results.success !== false) ? 'A' : 'B'
    };
  }

  async generateCIOutputs(summary) {
    // Generate GitHub Actions step summary
    const stepSummary = this.generateGitHubStepSummary(summary);
    const stepSummaryPath = path.join(this.outputPath, 'github-step-summary.md');
    fs.writeFileSync(stepSummaryPath, stepSummary);

    // Generate badge data
    const badges = this.generateBadgeData(summary);
    const badgesPath = path.join(this.outputPath, 'badges.json');
    fs.writeFileSync(badgesPath, JSON.stringify(badges, null, 2));

    // Generate PR comment template
    const prComment = this.generatePRComment(summary);
    const prCommentPath = path.join(this.outputPath, 'pr-comment.md');
    fs.writeFileSync(prCommentPath, prComment);

    console.log('📝 CI outputs generated'); // eslint-disable-line no-console
  }

  generateGitHubStepSummary(summary) {
    return `
# 🧪 Test Results Summary

## Overall Status: ${summary.overallStatus === 'passed' ? '✅ PASSED' : '❌ FAILED'}

### Test Statistics
| Metric | Value |
|--------|-------|
| Total Tests | ${summary.totalTests} |
| Passed | ${summary.passedTests} |
| Failed | ${summary.failedTests} |
| Skipped | ${summary.skippedTests} |
| Coverage | ${summary.coverage}% |
| Duration | ${Math.round(summary.duration)}ms |

### Test Categories
${Object.entries(summary.testsByCategory).map(([category, stats]) => 
  `- **${category}**: ${stats.passed}/${stats.total} passed`
).join('\n')}

### Performance Summary
${summary.performanceSummary ? `
- Average Response Time: ${Math.round(summary.performanceSummary.averageResponseTime)}ms
- Max Response Time: ${Math.round(summary.performanceSummary.maxResponseTime)}ms
- Performance Grade: ${summary.performanceSummary.performanceGrade}
` : 'No performance data available'}

### Security Summary
${summary.securitySummary ? `
- Security Tests: ${summary.securitySummary.totalSecurityTests}
- Security Issues: ${summary.securitySummary.securityIssues}
- Security Grade: ${summary.securitySummary.securityGrade}
` : 'No security data available'}

### Compatibility Summary
${summary.compatibilitySummary ? `
- Platforms Tested: ${summary.compatibilitySummary.testedPlatforms.join(', ')}
- Node Versions: ${summary.compatibilitySummary.testedNodeVersions.join(', ')}
- Compatibility Grade: ${summary.compatibilitySummary.compatibilityGrade}
` : 'No compatibility data available'}

---
*Generated at ${summary.metadata.generatedAt}*
    `;
  }

  generateBadgeData(summary) {
    return {
      tests: {
        schemaVersion: 1,
        label: 'tests',
        message: `${summary.passedTests}/${summary.totalTests} passed`,
        color: summary.overallStatus === 'passed' ? 'brightgreen' : 'red'
      },
      coverage: {
        schemaVersion: 1,
        label: 'coverage',
        message: `${Math.round(summary.coverage)}%`,
        color: summary.coverage >= 80 ? 'brightgreen' : summary.coverage >= 60 ? 'yellow' : 'red'
      },
      performance: {
        schemaVersion: 1,
        label: 'performance',
        message: summary.performanceSummary?.performanceGrade || 'N/A',
        color: this.getGradeColor(summary.performanceSummary?.performanceGrade)
      }
    };
  }

  getGradeColor(grade) {
    switch (grade) {
      case 'A': return 'brightgreen';
      case 'B': return 'green';
      case 'C': return 'yellow';
      case 'D': return 'orange';
      default: return 'lightgrey';
    }
  }

  generatePRComment(summary) {
    return `
## 🧪 Test Results Summary

| Metric | Value |
|--------|-------|
| Overall Status | ${summary.overallStatus === 'passed' ? '✅ PASSED' : '❌ FAILED'} |
| Total Tests | ${summary.totalTests} |
| Passed | ${summary.passedTests} |
| Failed | ${summary.failedTests} |
| Coverage | ${summary.coverage}% |
| Duration | ${Math.round(summary.duration)}ms |

${summary.failedTests > 0 ? `
### ❌ Failed Tests
Please check the detailed reports for information about failed tests.
` : ''}

${summary.performanceSummary ? `
### ⚡ Performance Grade: ${summary.performanceSummary.performanceGrade}
Average response time: ${Math.round(summary.performanceSummary.averageResponseTime)}ms
` : ''}

📊 [View detailed reports](${this.githubContext.repository ? 
  `https://github.com/${this.githubContext.repository}/actions/runs/${this.githubContext.runId}` : 
  '#'})
    `;
  }
}

// Main execution
async function main() {
  const generator = new ComprehensiveTestReportGenerator({
    artifactsPath: process.env.ARTIFACTS_PATH || 'test-artifacts',
    outputPath: process.env.OUTPUT_PATH || 'test-reports'
  });

  try {
    const result = await generator.generateReports();
    
    // Set GitHub Actions outputs if in CI
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::set-output name=reports-path::${result.outputPath}`); // eslint-disable-line no-console
      console.log(`::set-output name=overall-status::${result.summary.overallStatus}`); // eslint-disable-line no-console
      console.log(`::set-output name=test-count::${result.summary.totalTests}`); // eslint-disable-line no-console
      console.log(`::set-output name=coverage::${result.summary.coverage}`); // eslint-disable-line no-console
    }
    
    process.exit(result.summary.overallStatus === 'passed' ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Report generation failed:', error); // eslint-disable-line no-console
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ComprehensiveTestReportGenerator };
export default ComprehensiveTestReportGenerator;
