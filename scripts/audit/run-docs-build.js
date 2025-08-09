/**
 * Docs Build Audit Script - Enterprise Audit
 * Tests documentation build and identifies MDX errors
 * Following ESLint standards established in project memory
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class DocsBuildAuditor {
  constructor(rootPath) {
    this.rootPath = rootPath;
    this.results = {
      metadata: {
        timestamp: new Date().toISOString(),
        command: 'npm run docs:build',
        duration: 0,
        exitCode: null,
        buildSuccess: false
      },
      errors: [],
      warnings: [],
      mdxErrors: [],
      buildOutput: '',
      fixes: []
    };
  }

  /**
   * Run docs build and capture results
   */
  async runDocsBuild() {
    console.log('📚 Running docs build audit...');
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      // Check if docs:build script exists
      const packageJsonPath = path.join(this.rootPath, 'package.json');
      let buildCommand = 'docs:build';
      
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (!packageJson.scripts || !packageJson.scripts['docs:build']) {
          // Try alternative commands
          if (packageJson.scripts['build:docs']) {
            buildCommand = 'build:docs';
          } else if (packageJson.scripts['docusaurus']) {
            buildCommand = 'docusaurus build';
          } else {
            this.results.errors.push({
              type: 'config_error',
              message: 'No docs build script found in package.json'
            });
            resolve(this.results);
            return;
          }
        }
      } catch (error) {
        this.results.errors.push({
          type: 'config_error',
          message: `Could not read package.json: ${error.message}`
        });
        resolve(this.results);
        return;
      }
      
      const docsProcess = spawn('npm', ['run', buildCommand], {
        cwd: this.rootPath,
        stdio: 'pipe',
        shell: true
      });
      
      let stdout = '';
      let stderr = '';
      
      docsProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        process.stdout.write(output); // Show real-time output
      });
      
      docsProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        process.stderr.write(output);
      });
      
      docsProcess.on('close', (code) => {
        this.results.metadata.duration = Date.now() - startTime;
        this.results.metadata.exitCode = code;
        this.results.metadata.buildSuccess = code === 0;
        this.results.buildOutput = stdout + stderr;
        
        // Parse build output for errors
        this.parseBuildOutput(stdout + stderr);
        
        console.log(`✅ Docs build audit complete (exit code: ${code})`);
        console.log(`⏱️  Duration: ${this.results.metadata.duration}ms`);
        console.log(`📊 Build ${code === 0 ? 'SUCCESS' : 'FAILED'}`);
        
        resolve(this.results);
      });
      
      docsProcess.on('error', (error) => {
        this.results.errors.push({
          type: 'process_error',
          message: error.message,
          stack: error.stack
        });
        
        console.error('❌ Docs build process error:', error.message);
        resolve(this.results);
      });
    });
  }

  /**
   * Parse build output for specific error patterns
   */
  parseBuildOutput(output) {
    const lines = output.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // MDX parsing errors
      if (this.isMDXError(line)) {
        const mdxError = this.parseMDXError(line, lines, i);
        if (mdxError) {
          this.results.mdxErrors.push(mdxError);
          
          // Generate fix suggestion
          const fix = this.suggestMDXFix(mdxError);
          if (fix) {
            this.results.fixes.push(fix);
          }
        }
      }
      
      // General build errors
      if (line.includes('Error:') || line.includes('ERROR')) {
        this.results.errors.push({
          type: 'build_error',
          message: line.trim(),
          context: this.getContext(lines, i)
        });
      }
      
      // Warnings
      if (line.includes('Warning:') || line.includes('WARN')) {
        this.results.warnings.push({
          type: 'build_warning',
          message: line.trim()
        });
      }
    }
  }

  /**
   * Check if line indicates MDX error
   */
  isMDXError(line) {
    const mdxPatterns = [
      /\.mdx?:/,
      /MDX/i,
      /Unexpected character/,
      /Expected/,
      /Parse error/,
      /Syntax error.*\.mdx?/
    ];
    
    return mdxPatterns.some(pattern => pattern.test(line));
  }

  /**
   * Parse specific MDX error details
   */
  parseMDXError(line, lines, index) {
    // Extract file path and line number
    const fileMatch = line.match(/([^:]+\.mdx?):(\d+):?(\d+)?/);
    if (!fileMatch) return null;
    
    const filePath = fileMatch[1];
    const lineNumber = parseInt(fileMatch[2]);
    const columnNumber = fileMatch[3] ? parseInt(fileMatch[3]) : null;
    
    // Extract error message
    let errorMessage = line;
    const context = [];
    
    // Get surrounding context
    for (let i = Math.max(0, index - 2); i <= Math.min(lines.length - 1, index + 2); i++) {
      context.push(lines[i]);
    }
    
    // Try to read the problematic file
    let fileContent = null;
    let problematicLine = null;
    
    try {
      const fullPath = path.resolve(this.rootPath, filePath);
      if (fs.existsSync(fullPath)) {
        fileContent = fs.readFileSync(fullPath, 'utf8');
        const fileLines = fileContent.split('\n');
        if (lineNumber <= fileLines.length) {
          problematicLine = fileLines[lineNumber - 1];
        }
      }
    } catch (error) {
      // Skip if can't read file
    }
    
    return {
      file: filePath,
      line: lineNumber,
      column: columnNumber,
      message: errorMessage,
      context: context,
      problematicLine: problematicLine,
      fileContent: fileContent
    };
  }

  /**
   * Suggest fixes for MDX errors
   */
  suggestMDXFix(mdxError) {
    if (!mdxError.problematicLine) return null;
    
    const line = mdxError.problematicLine;
    const fixes = [];
    
    // Common MDX issues and fixes
    
    // Unescaped < characters
    if (line.includes('<') && !line.includes('</') && !line.match(/<[a-zA-Z]/)) {
      fixes.push({
        type: 'escape_brackets',
        description: 'Escape < character',
        before: line,
        after: line.replace(/</g, '&lt;')
      });
    }
    
    // Unescaped { } characters
    if (line.includes('{') && !line.match(/\{[^}]*\}/)) {
      fixes.push({
        type: 'escape_braces',
        description: 'Escape { } characters',
        before: line,
        after: line.replace(/\{/g, '\\{').replace(/\}/g, '\\}')
      });
    }
    
    // Invalid JSX syntax
    if (line.includes('<') && line.includes('>') && !line.match(/<\/?\w+[^>]*>/)) {
      fixes.push({
        type: 'fix_jsx',
        description: 'Fix JSX syntax',
        before: line,
        after: line.replace(/<([^>]+)>/g, '&lt;$1&gt;')
      });
    }
    
    // Malformed code blocks
    if (line.includes('```') && !line.match(/^```\w*$/)) {
      fixes.push({
        type: 'fix_codeblock',
        description: 'Fix code block syntax',
        before: line,
        after: line.replace(/```(.*)/, '```$1\n')
      });
    }
    
    if (fixes.length === 0) return null;
    
    return {
      file: mdxError.file,
      line: mdxError.line,
      fixes: fixes
    };
  }

  /**
   * Get context lines around error
   */
  getContext(lines, index, contextSize = 2) {
    const start = Math.max(0, index - contextSize);
    const end = Math.min(lines.length - 1, index + contextSize);
    
    return lines.slice(start, end + 1);
  }

  /**
   * Generate docs build report
   */
  generateBuildReport() {
    const report = `# Documentation Build Report

## Build Metadata

- **Timestamp:** ${this.results.metadata.timestamp}
- **Command:** ${this.results.metadata.command}
- **Duration:** ${this.results.metadata.duration}ms
- **Exit Code:** ${this.results.metadata.exitCode}
- **Build Status:** ${this.results.metadata.buildSuccess ? '✅ SUCCESS' : '❌ FAILED'}

## Build Summary

- **Total Errors:** ${this.results.errors.length}
- **MDX Errors:** ${this.results.mdxErrors.length}
- **Warnings:** ${this.results.warnings.length}
- **Fixes Available:** ${this.results.fixes.length}

${this.results.mdxErrors.length > 0 ? `## MDX Errors (${this.results.mdxErrors.length})

${this.results.mdxErrors.map((error, index) => `### Error ${index + 1}: ${error.file}:${error.line}

**Message:** ${error.message}

**Problematic Line:**
\`\`\`
${error.problematicLine || 'Could not read line'}
\`\`\`

**Context:**
\`\`\`
${error.context.join('\n')}
\`\`\`
`).join('\n')}` : ''}

${this.results.fixes.length > 0 ? `## Suggested Fixes

${this.results.fixes.map((fix, index) => `### Fix ${index + 1}: ${fix.file}:${fix.line}

${fix.fixes.map(f => `**${f.description}:**

Before:
\`\`\`
${f.before}
\`\`\`

After:
\`\`\`
${f.after}
\`\`\`
`).join('\n')}
`).join('\n')}` : ''}

${this.results.errors.length > 0 ? `## Build Errors (${this.results.errors.length})

${this.results.errors.slice(0, 10).map((error, index) => 
  `${index + 1}. **${error.type}:** ${error.message}`
).join('\n')}
${this.results.errors.length > 10 ? `\n... and ${this.results.errors.length - 10} more errors` : ''}
` : ''}

${this.results.warnings.length > 0 ? `## Warnings (${this.results.warnings.length})

${this.results.warnings.slice(0, 5).map((warning, index) => 
  `${index + 1}. ${warning.message}`
).join('\n')}
${this.results.warnings.length > 5 ? `\n... and ${this.results.warnings.length - 5} more warnings` : ''}
` : ''}

## Quality Assessment

- **Build Status:** ${this.results.metadata.buildSuccess ? '✅ PASSING' : '❌ FAILING'}
- **MDX Quality:** ${this.results.mdxErrors.length === 0 ? '✅ CLEAN' : '❌ NEEDS FIXES'}
- **Documentation:** ${this.results.metadata.buildSuccess ? '✅ DEPLOYABLE' : '⚠️ BLOCKED'}

## Next Steps

${this.results.metadata.buildSuccess ? 
  '✅ Documentation build is successful and ready for deployment.' : 
  `❌ Documentation build failed. Please address the following:

${this.results.mdxErrors.length > 0 ? '1. Fix MDX parsing errors using the suggested fixes above' : ''}
${this.results.errors.length > 0 ? '2. Resolve build errors listed above' : ''}
3. Re-run the build to verify fixes`
}
`;
    
    return report;
  }

  /**
   * Execute docs build audit and generate report
   */
  async executeDocsBuildAudit() {
    const results = await this.runDocsBuild();
    
    // Ensure output directory exists
    const reportsDir = path.join(this.rootPath, 'ci-reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // Write build report
    const buildReport = this.generateBuildReport();
    fs.writeFileSync(
      path.join(reportsDir, 'docs-build-report.md'),
      buildReport
    );
    
    console.log('📁 Generated: ci-reports/docs-build-report.md');
    
    return results;
  }
}

// Execute if run directly
if (require.main === module) {
  const auditor = new DocsBuildAuditor(process.cwd());
  auditor.executeDocsBuildAudit()
    .then(results => {
      console.log(`🎯 Docs Build: ${results.metadata.buildSuccess ? 'SUCCESS' : 'FAILED'}`);
      console.log(`🎯 MDX Errors: ${results.mdxErrors.length}`);
      process.exit(results.metadata.exitCode || 0);
    })
    .catch(error => {
      console.error('❌ Docs build audit failed:', error);
      process.exit(1);
    });
}

module.exports = { DocsBuildAuditor };
