/**
 * Repository Inventory Script - Enterprise Audit
 * Generates comprehensive file and folder inventories
 * Following ESLint standards established in project memory
 */

const fs = require('fs');
const path = require('path');

class RepositoryInventory {
  constructor(rootPath) {
    this.rootPath = rootPath;
    this.files = [];
    this.folders = [];
    this.heavyDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build']);
  }

  /**
   * Walk directory tree and collect inventory
   */
  walkDirectory(dirPath, depth = 0) {
    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      const relativePath = path.relative(this.rootPath, dirPath);
      
      let filesCount = 0;
      let dirsCount = 0;
      let totalSize = 0;
      let summarized = false;

      // Check if this is a heavy directory
      const dirName = path.basename(dirPath);
      if (this.heavyDirs.has(dirName) && depth > 0) {
        const stats = this.summarizeHeavyDirectory(dirPath);
        this.folders.push({
          path: relativePath || '.',
          depth,
          files_count: stats.filesCount,
          dirs_count: stats.dirsCount,
          size_bytes: stats.totalSize,
          summarized: true
        });
        return;
      }

      // Process each item
      for (const item of items) {
        const itemPath = path.join(dirPath, item.name);
        const relativeItemPath = path.relative(this.rootPath, itemPath);

        try {
          if (item.isDirectory()) {
            dirsCount++;
            this.walkDirectory(itemPath, depth + 1);
          } else if (item.isFile()) {
            filesCount++;
            const fileStats = this.analyzeFile(itemPath, relativeItemPath);
            this.files.push(fileStats);
            totalSize += fileStats.size_bytes;
          }
        } catch (error) {
          console.warn(`Warning: Could not process ${itemPath}: ${error.message}`);
        }
      }

      // Record folder stats
      this.folders.push({
        path: relativePath || '.',
        depth,
        files_count: filesCount,
        dirs_count: dirsCount,
        size_bytes: totalSize,
        summarized
      });

    } catch (error) {
      console.error(`Error walking directory ${dirPath}: ${error.message}`);
    }
  }

  /**
   * Summarize heavy directories without full traversal
   */
  summarizeHeavyDirectory(dirPath) {
    let filesCount = 0;
    let dirsCount = 0;
    let totalSize = 0;

    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        try {
          const itemPath = path.join(dirPath, item.name);
          const stats = fs.statSync(itemPath);
          
          if (item.isDirectory()) {
            dirsCount++;
            // Recursively count for heavy dirs but don't add to main inventory
            const subStats = this.summarizeHeavyDirectory(itemPath);
            filesCount += subStats.filesCount;
            dirsCount += subStats.dirsCount;
            totalSize += subStats.totalSize;
          } else {
            filesCount++;
            totalSize += stats.size;
          }
        } catch (error) {
          // Skip inaccessible files
        }
      }
    } catch (error) {
      console.warn(`Could not summarize heavy directory ${dirPath}: ${error.message}`);
    }

    return { filesCount, dirsCount, totalSize };
  }

  /**
   * Analyze individual file
   */
  analyzeFile(filePath, relativePath) {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath);
    
    let approxLOC = 0;
    let exportsCount = 0;
    let importsCount = 0;
    let hasTests = false;
    let eslintErrors = 0;
    let notes = '';

    try {
      // Only analyze text files
      if (this.isTextFile(ext)) {
        const content = fs.readFileSync(filePath, 'utf8');
        approxLOC = content.split('\n').length;
        
        // Count exports and imports for JS files
        if (['.js', '.ts', '.mjs', '.cjs'].includes(ext)) {
          exportsCount = this.countExports(content);
          importsCount = this.countImports(content);
        }
        
        // Check if it's a test file
        hasTests = this.isTestFile(relativePath, content);
        
        // Quick ESLint error check (basic patterns)
        eslintErrors = this.quickESLintCheck(content);
      }
    } catch (error) {
      notes = `Analysis error: ${error.message}`;
    }

    return {
      path: relativePath,
      kind: 'file',
      size_bytes: stats.size,
      ext: ext || 'none',
      approx_LOC: approxLOC,
      exports_count: exportsCount,
      imports_count: importsCount,
      hasTests,
      eslintErrors,
      notes
    };
  }

  /**
   * Check if file is text-based
   */
  isTextFile(ext) {
    const textExts = ['.js', '.ts', '.json', '.md', '.txt', '.yml', '.yaml', 
                     '.css', '.html', '.xml', '.svg', '.gitignore', '.env'];
    return textExts.includes(ext) || ext === '';
  }

  /**
   * Count export statements
   */
  countExports(content) {
    const exportPatterns = [
      /module\.exports\s*=/g,
      /exports\.\w+\s*=/g,
      /export\s+(default\s+)?/g,
      /export\s*\{[^}]*\}/g
    ];
    
    let count = 0;
    for (const pattern of exportPatterns) {
      const matches = content.match(pattern);
      if (matches) count += matches.length;
    }
    return count;
  }

  /**
   * Count import statements
   */
  countImports(content) {
    const importPatterns = [
      /require\s*\([^)]+\)/g,
      /import\s+[^;]+from\s+[^;]+/g,
      /import\s*\([^)]+\)/g
    ];
    
    let count = 0;
    for (const pattern of importPatterns) {
      const matches = content.match(pattern);
      if (matches) count += matches.length;
    }
    return count;
  }

  /**
   * Check if file is test-related
   */
  isTestFile(filePath, content) {
    const testPatterns = [
      /__tests__/,
      /\.test\./,
      /\.spec\./,
      /test/i
    ];
    
    const hasTestPath = testPatterns.some(pattern => pattern.test(filePath));
    const hasTestContent = /describe\s*\(|it\s*\(|test\s*\(/i.test(content);
    
    return hasTestPath || hasTestContent;
  }

  /**
   * Quick ESLint error detection
   */
  quickESLintCheck(content) {
    let errorCount = 0;
    
    // Check for common no-undef patterns (based on our successful resolution)
    const undefPatterns = [
      /\b\w+\s+is not defined/g,
      /ReferenceError/g
    ];
    
    for (const pattern of undefPatterns) {
      const matches = content.match(pattern);
      if (matches) errorCount += matches.length;
    }
    
    return errorCount;
  }

  /**
   * Convert to CSV format
   */
  toCSV(data, headers) {
    const csvRows = [headers.join(',')];
    
    for (const row of data) {
      const values = headers.map(header => {
        let value = row[header];
        if (typeof value === 'string' && value.includes(',')) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
        return value || '';
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  }

  /**
   * Generate all inventory files
   */
  async generateInventory() {
    console.log('Starting repository inventory...');
    
    // Ensure output directories exist
    const reportsDir = path.join(this.rootPath, 'ci-reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // Walk the repository
    this.walkDirectory(this.rootPath);
    
    // Generate files inventory
    const fileHeaders = ['path', 'kind', 'size_bytes', 'ext', 'approx_LOC', 
                        'exports_count', 'imports_count', 'hasTests', 'eslintErrors', 'notes'];
    const filesCSV = this.toCSV(this.files, fileHeaders);
    
    // Generate folders inventory  
    const folderHeaders = ['path', 'depth', 'files_count', 'dirs_count', 'size_bytes', 'summarized'];
    const foldersCSV = this.toCSV(this.folders, folderHeaders);
    
    // Write CSV files
    fs.writeFileSync(path.join(reportsDir, 'full-inventory.csv'), filesCSV);
    fs.writeFileSync(path.join(reportsDir, 'folder-inventory.csv'), foldersCSV);
    
    // Write JSON files
    fs.writeFileSync(path.join(reportsDir, 'full-inventory.json'), 
                     JSON.stringify(this.files, null, 2));
    fs.writeFileSync(path.join(reportsDir, 'folder-inventory.json'), 
                     JSON.stringify(this.folders, null, 2));
    
    console.log(`✅ Inventory complete: ${this.files.length} files, ${this.folders.length} folders`);
    console.log('📁 Generated: ci-reports/full-inventory.csv, full-inventory.json');
    console.log('📁 Generated: ci-reports/folder-inventory.csv, folder-inventory.json');
    
    return {
      filesCount: this.files.length,
      foldersCount: this.folders.length,
      totalSize: this.files.reduce((sum, file) => sum + file.size_bytes, 0)
    };
  }
}

// Execute inventory if run directly
if (require.main === module) {
  const inventory = new RepositoryInventory(process.cwd());
  inventory.generateInventory()
    .then(stats => {
      console.log('📊 Repository Stats:', stats);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Inventory failed:', error);
      process.exit(1);
    });
}

module.exports = { RepositoryInventory };
