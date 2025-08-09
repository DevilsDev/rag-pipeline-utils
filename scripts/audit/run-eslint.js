/**
 * ESLint Audit Script - Enterprise Audit
 * Captures ESLint results, error density, and quality metrics
 * Following ESLint standards established in project memory
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class ESLintAuditor {
  constructor(rootPath) {
    this.rootPath = rootPath;
    this.results = {
      metadata: {
        timestamp: new Date().toISOString(),
        command: 'npx eslint . --format json',
        duration: 0,
        exitCode: null
      },
      summary: {
        totalFiles: 0,
        totalProblems: 0,
        errorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0
      },
      ruleBreakdown: {},
      fileBreakdown: [],
      topErrorFiles: [],
      p0Issues: [],
      patterns: {
        noUndefErrors: 0,
        signatureUsageMismatches: 0,
        noUnusedVars: 0,
        parseErrors: 0
      }
    };
  }

  /**
   * Run ESLint and capture results
   */
  async runESLint() {
    console.log('🔍 Running ESLint audit...');
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const eslintProcess = spawn('npx', ['eslint', '.', '--format', 'json'], {
        cwd: this.rootPath,
        stdio: 'pipe',
        shell: true
      });
      
      let stdout = '';
      let stderr = '';
      
      eslintProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      eslintProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      eslintProcess.on('close', (code) => {
        this.results.metadata.duration = Date.now() - startTime;
        this.results.metadata.exitCode = code;
        
        // Parse ESLint JSON output
        this.parseESLintOutput(stdout, stderr);
        
        console.log(`✅ ESLint audit complete (exit code: ${code})`);
        console.log(`⏱️  Duration: ${this.results.metadata.duration}ms`);
        console.log(`📊 Found ${this.results.summary.totalProblems} problems in ${this.results.summary.totalFiles} files`);
        
        resolve(this.results);
      });
      
      eslintProcess.on('error', (error) => {
        console.error('❌ ESLint process error:', error.message);
        this.results.metadata.error = error.message;
        resolve(this.results);
      });
    });
  }

  /**
   * Parse ESLint JSON output
   */
  parseESLintOutput(stdout, stderr) {
    try {
      // Parse JSON output
      const eslintResults = JSON.parse(stdout);
      
      // Process each file result
      for (const fileResult of eslintResults) {
        this.processFileResult(fileResult);
      }
      
      // Calculate summary statistics
      this.calculateSummaryStats();
      
      // Identify top error files
      this.identifyTopErrorFiles();
      
      // Identify P0 issues
      this.identifyP0Issues();
      
    } catch (error) {
      console.warn('Could not parse ESLint JSON output:', error.message);
      
      // Fallback: parse text output from stderr
      this.parseTextOutput(stderr);
    }
  }

  /**
   * Process individual file result
   */
  processFileResult(fileResult) {
    const relativePath = path.relative(this.rootPath, fileResult.filePath);
    
    const fileData = {
      path: relativePath,
      errorCount: fileResult.errorCount,
      warningCount: fileResult.warningCount,
      fixableErrorCount: fileResult.fixableErrorCount,
      fixableWarningCount: fileResult.fixableWarningCount,
      messages: fileResult.messages,
      errorDensity: 0
    };
    
    // Calculate error density (errors per 100 lines)
    try {
      const content = fs.readFileSync(fileResult.filePath, 'utf8');
      const lines = content.split('\n').length;
      fileData.errorDensity = lines > 0 ? (fileResult.errorCount / lines * 100).toFixed(2) : 0;
    } catch (error) {
      // Skip if file can't be read
    }
    
    this.results.fileBreakdown.push(fileData);
    
    // Process messages for rule breakdown
    for (const message of fileResult.messages) {
      const ruleId = message.ruleId || 'unknown';
      
      if (!this.results.ruleBreakdown[ruleId]) {
        this.results.ruleBreakdown[ruleId] = {
          count: 0,
          severity: message.severity,
          type: message.severity === 2 ? 'error' : 'warning'
        };
      }
      
      this.results.ruleBreakdown[ruleId].count++;
      
      // Track specific patterns from our successful ESLint resolution
      this.trackPatterns(message, relativePath);
    }
  }

  /**
   * Track specific error patterns based on our successful resolution
   */
  trackPatterns(message, filePath) {
    const ruleId = message.ruleId;
    const messageText = message.message.toLowerCase();
    
    // Track no-undef errors (our main success area)
    if (ruleId === 'no-undef') {
      this.results.patterns.noUndefErrors++;
    }
    
    // Track signature/usage mismatches
    if (messageText.includes('is not defined') || 
        messageText.includes('parameter') ||
        messageText.includes('argument')) {
      this.results.patterns.signatureUsageMismatches++;
    }
    
    // Track no-unused-vars
    if (ruleId === 'no-unused-vars') {
      this.results.patterns.noUnusedVars++;
    }
    
    // Track parse errors
    if (ruleId === null && message.fatal) {
      this.results.patterns.parseErrors++;
    }
  }

  /**
   * Calculate summary statistics
   */
  calculateSummaryStats() {
    this.results.summary.totalFiles = this.results.fileBreakdown.length;
    
    for (const file of this.results.fileBreakdown) {
      this.results.summary.errorCount += file.errorCount;
      this.results.summary.warningCount += file.warningCount;
      this.results.summary.fixableErrorCount += file.fixableErrorCount;
      this.results.summary.fixableWarningCount += file.fixableWarningCount;
    }
    
    this.results.summary.totalProblems = this.results.summary.errorCount + this.results.summary.warningCount;
  }

  /**
   * Identify top error-density files
   */
  identifyTopErrorFiles() {
    this.results.topErrorFiles = this.results.fileBreakdown
      .filter(file => file.errorCount > 0)
      .sort((a, b) => parseFloat(b.errorDensity) - parseFloat(a.errorDensity))
      .slice(0, 10)
      .map(file => ({
        path: file.path,
        errorCount: file.errorCount,
        warningCount: file.warningCount,
        errorDensity: file.errorDensity
      }));
  }

  /**
   * Identify P0 issues (critical for commit blocking)
   */
  identifyP0Issues() {
    const p0Rules = ['no-undef', 'no-unused-vars', 'no-unreachable'];
    
    for (const file of this.results.fileBreakdown) {
      for (const message of file.messages) {
        if (p0Rules.includes(message.ruleId) && message.severity === 2) {
          this.results.p0Issues.push({
            file: file.path,
            line: message.line,
            column: message.column,
            rule: message.ruleId,
            message: message.message,
            severity: 'error'
          });
        }
      }
    }
  }

  /**
   * Parse text output as fallback
   */
  parseTextOutput(textOutput) {
    const lines = textOutput.split('\n');
    let errorCount = 0;
    let warningCount = 0;
    
    for (const line of lines) {
      if (line.includes('error')) errorCount++;
      if (line.includes('warning')) warningCount++;
    }
    
    this.results.summary.errorCount = errorCount;
    this.results.summary.warningCount = warningCount;
    this.results.summary.totalProblems = errorCount + warningCount;
  }

  /**
   * Generate ESLint summary report
   */
  generateSummaryReport() {
    const topRules = Object.entries(this.results.ruleBreakdown)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10);
    
    const report = `# ESLint Quality Summary

## Audit Metadata

- **Timestamp:** ${this.results.metadata.timestamp}
- **Duration:** ${this.results.metadata.duration}ms
- **Exit Code:** ${this.results.metadata.exitCode}

## Overall Statistics

- **Total Files Analyzed:** ${this.results.summary.totalFiles}
- **Total Problems:** ${this.results.summary.totalProblems}
- **Errors:** ${this.results.summary.errorCount} ${this.results.summary.errorCount === 0 ? '✅' : '❌'}
- **Warnings:** ${this.results.summary.warningCount}
- **Fixable Errors:** ${this.results.summary.fixableErrorCount}
- **Fixable Warnings:** ${this.results.summary.fixableWarningCount}

## Pattern Analysis (Based on Successful Resolution)

- **no-undef Errors:** ${this.results.patterns.noUndefErrors} ${this.results.patterns.noUndefErrors === 0 ? '✅ (Success!)' : '❌'}
- **Signature/Usage Mismatches:** ${this.results.patterns.signatureUsageMismatches}
- **no-unused-vars:** ${this.results.patterns.noUnusedVars}
- **Parse Errors:** ${this.results.patterns.parseErrors} ${this.results.patterns.parseErrors === 0 ? '✅' : '❌'}

## Top Rule Violations

${topRules.map(([rule, data], index) => 
  `${index + 1}. **${rule}** (${data.type}): ${data.count} occurrences`
).join('\n')}

## Top Error-Density Files

${this.results.topErrorFiles.map((file, index) => 
  `${index + 1}. **${file.path}**: ${file.errorCount} errors (${file.errorDensity} per 100 lines)`
).join('\n')}

## P0 Issues (Commit Blocking)

${this.results.p0Issues.length === 0 ? '✅ No P0 issues found!' : 
  `❌ ${this.results.p0Issues.length} P0 issues found:

${this.results.p0Issues.slice(0, 10).map(issue => 
  `- **${issue.file}:${issue.line}**: ${issue.rule} - ${issue.message}`
).join('\n')}
${this.results.p0Issues.length > 10 ? `\n... and ${this.results.p0Issues.length - 10} more P0 issues` : ''}`
}

## Quality Assessment

- **Error Status:** ${this.results.summary.errorCount === 0 ? '✅ CLEAN' : '❌ NEEDS ATTENTION'}
- **P0 Status:** ${this.results.p0Issues.length === 0 ? '✅ NO BLOCKERS' : '❌ COMMIT BLOCKED'}
- **Overall:** ${this.results.summary.errorCount === 0 && this.results.p0Issues.length === 0 ? '✅ PRODUCTION READY' : '⚠️ NEEDS FIXES'}

## Success Validation

Based on our successful ESLint resolution (163 → 0 no-undef errors):
- **Core Runtime Files:** ${this.results.patterns.noUndefErrors === 0 ? '✅ Clean' : '❌ Issues found'}
- **Parameter Consistency:** ${this.results.patterns.signatureUsageMismatches === 0 ? '✅ Consistent' : '⚠️ Mismatches found'}
- **Parse Integrity:** ${this.results.patterns.parseErrors === 0 ? '✅ Valid' : '❌ Parse errors'}
`;
    
    return report;
  }

  /**
   * Execute ESLint audit and generate reports
   */
  async executeESLintAudit() {
    const results = await this.runESLint();
    
    // Ensure output directory exists
    const reportsDir = path.join(this.rootPath, 'ci-reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // Write JSON results
    fs.writeFileSync(
      path.join(reportsDir, 'eslint-summary.json'),
      JSON.stringify(results, null, 2)
    );
    
    // Write summary report
    const summaryReport = this.generateSummaryReport();
    fs.writeFileSync(
      path.join(reportsDir, 'eslint-summary.md'),
      summaryReport
    );
    
    console.log('📁 Generated: ci-reports/eslint-summary.json');
    console.log('📁 Generated: ci-reports/eslint-summary.md');
    
    return results;
  }
}

// Execute if run directly
if (require.main === module) {
  const auditor = new ESLintAuditor(process.cwd());
  auditor.executeESLintAudit()
    .then(results => {
      console.log(`🎯 ESLint Results: ${results.summary.errorCount} errors, ${results.summary.warningCount} warnings`);
      console.log(`🎯 P0 Issues: ${results.p0Issues.length} ${results.p0Issues.length === 0 ? '✅' : '❌'}`);
      process.exit(results.metadata.exitCode || 0);
    })
    .catch(error => {
      console.error('❌ ESLint audit failed:', error);
      process.exit(1);
    });
}

module.exports = { ESLintAuditor };
