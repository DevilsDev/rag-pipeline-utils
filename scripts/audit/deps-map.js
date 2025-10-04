/**
 * Dependency Mapping Script - Enterprise Audit
 * Builds lightweight import graph (ESM/CommonJS aware)
 * Following ESLint standards established in project memory
 */

const fs = require("fs");
const path = require("path");

class DependencyMapper {
  constructor(rootPath) {
    this.rootPath = rootPath;
    this.dependencyGraph = new Map();
    this.moduleStats = new Map();
    this.importCounts = new Map();
    this.exportCounts = new Map();
  }

  /**
   * Analyze all JavaScript files for dependencies
   */
  analyzeDependencies() {
    console.log("🔍 Analyzing dependency graph...");

    const jsFiles = this.findJavaScriptFiles();
    console.log(`Found ${jsFiles.length} JavaScript files to analyze`);

    for (const filePath of jsFiles) {
      try {
        this.analyzeFile(filePath);
      } catch (error) {
        console.warn(
          `Warning: Could not analyze ${filePath}: ${error.message}`,
        );
      }
    }

    return this.buildDependencyReport();
  }

  /**
   * Find all JavaScript files in the repository
   */
  findJavaScriptFiles() {
    const jsFiles = [];
    const jsExtensions = [".js", ".mjs", ".cjs", ".ts"];

    const walkDir = (dirPath) => {
      try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const item of items) {
          const itemPath = path.join(dirPath, item.name);

          // Skip heavy directories
          if (item.isDirectory()) {
            const dirName = item.name;
            if (
              !["node_modules", ".git", ".next", "dist", "build"].includes(
                dirName,
              )
            ) {
              walkDir(itemPath);
            }
          } else if (item.isFile()) {
            const ext = path.extname(item.name);
            if (jsExtensions.includes(ext)) {
              jsFiles.push(itemPath);
            }
          }
        }
      } catch (error) {
        console.warn(`Could not read directory ${dirPath}: ${error.message}`);
      }
    };

    walkDir(this.rootPath);
    return jsFiles;
  }

  /**
   * Analyze individual file for imports and exports
   */
  analyzeFile(filePath) {
    const relativePath = path.relative(this.rootPath, filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const stats = fs.statSync(filePath);

    const imports = this.extractImports(content);
    const exports = this.extractExports(content);

    // Store in dependency graph
    this.dependencyGraph.set(relativePath, {
      imports: imports,
      exports: exports,
      size: stats.size,
      lines: content.split("\n").length,
    });

    // Update import counts for popularity tracking
    for (const importPath of imports) {
      const count = this.importCounts.get(importPath) || 0;
      this.importCounts.set(importPath, count + 1);
    }

    // Update export counts
    this.exportCounts.set(relativePath, exports.length);

    // Module stats
    this.moduleStats.set(relativePath, {
      size: stats.size,
      lines: content.split("\n").length,
      importsCount: imports.length,
      exportsCount: exports.length,
    });
  }

  /**
   * Extract import statements (CommonJS and ESM)
   */
  extractImports(content) {
    const imports = [];

    // CommonJS require patterns
    const requirePattern = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    let match;
    while ((match = requirePattern.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // ESM import patterns
    const importPattern = /import\s+(?:[^'"`]*from\s+)?['"`]([^'"`]+)['"`]/g;
    while ((match = importPattern.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // Dynamic imports
    const dynamicImportPattern = /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    while ((match = dynamicImportPattern.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  /**
   * Extract export statements
   */
  extractExports(content) {
    const exports = [];

    // CommonJS exports
    const moduleExportsPattern = /module\.exports\s*=\s*([^;]+)/g;
    const namedExportsPattern = /exports\.(\w+)\s*=/g;

    let match;
    while ((match = moduleExportsPattern.exec(content)) !== null) {
      exports.push("default");
    }

    while ((match = namedExportsPattern.exec(content)) !== null) {
      exports.push(match[1]);
    }

    // ESM exports
    const esmExportPattern =
      /export\s+(?:default\s+)?(?:(?:const|let|var|function|class)\s+)?(\w+)/g;
    while ((match = esmExportPattern.exec(content)) !== null) {
      exports.push(match[1]);
    }

    // Named exports
    const namedExportPattern = /export\s*\{\s*([^}]+)\s*\}/g;
    while ((match = namedExportPattern.exec(content)) !== null) {
      const names = match[1]
        .split(",")
        .map((name) => name.trim().split(" as ")[0]);
      exports.push(...names);
    }

    return exports;
  }

  /**
   * Build comprehensive dependency report
   */
  buildDependencyReport() {
    const report = {
      metadata: {
        timestamp: new Date().toISOString(),
        totalFiles: this.dependencyGraph.size,
        totalImports: Array.from(this.importCounts.values()).reduce(
          (sum, count) => sum + count,
          0,
        ),
        totalExports: Array.from(this.exportCounts.values()).reduce(
          (sum, count) => sum + count,
          0,
        ),
      },
      topModulesBySize: this.getTopModulesBySize(10),
      topModulesByImports: this.getTopModulesByImports(10),
      mostImportedModules: this.getMostImportedModules(10),
      dependencyGraph: Object.fromEntries(this.dependencyGraph),
      moduleStats: Object.fromEntries(this.moduleStats),
      patterns: this.analyzePatterns(),
    };

    return report;
  }

  /**
   * Get top modules by file size
   */
  getTopModulesBySize(limit) {
    return Array.from(this.moduleStats.entries())
      .sort(([, a], [, b]) => b.size - a.size)
      .slice(0, limit)
      .map(([path, stats]) => ({ path, ...stats }));
  }

  /**
   * Get top modules by number of imports
   */
  getTopModulesByImports(limit) {
    return Array.from(this.moduleStats.entries())
      .sort(([, a], [, b]) => b.importsCount - a.importsCount)
      .slice(0, limit)
      .map(([path, stats]) => ({ path, ...stats }));
  }

  /**
   * Get most imported modules
   */
  getMostImportedModules(limit) {
    return Array.from(this.importCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([path, count]) => ({ path, importCount: count }));
  }

  /**
   * Analyze architectural patterns
   */
  analyzePatterns() {
    const patterns = {
      commonjsFiles: 0,
      esmFiles: 0,
      mixedFiles: 0,
      circularDependencies: [],
      layerViolations: [],
      pluginBoundaries: [],
    };

    for (const [filePath, data] of this.dependencyGraph) {
      const content = fs.readFileSync(
        path.join(this.rootPath, filePath),
        "utf8",
      );

      const hasRequire = /require\s*\(/.test(content);
      const hasImport = /import\s+/.test(content);
      const hasModuleExports = /module\.exports/.test(content);
      const hasExport = /export\s+/.test(content);

      if ((hasRequire || hasModuleExports) && (hasImport || hasExport)) {
        patterns.mixedFiles++;
      } else if (hasRequire || hasModuleExports) {
        patterns.commonjsFiles++;
      } else if (hasImport || hasExport) {
        patterns.esmFiles++;
      }

      // Check for plugin boundaries
      if (filePath.includes("/plugins/") || filePath.includes("/src/")) {
        patterns.pluginBoundaries.push({
          file: filePath,
          type: filePath.includes("/plugins/") ? "plugin" : "core",
          imports: data.imports.length,
          exports: data.exports.length,
        });
      }
    }

    return patterns;
  }

  /**
   * Generate dependency map and save to file
   */
  async generateDependencyMap() {
    const report = this.analyzeDependencies();

    // Ensure output directory exists
    const reportsDir = path.join(this.rootPath, "ci-reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Write dependency map
    const outputPath = path.join(reportsDir, "deps-map.json");
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

    console.log("✅ Dependency analysis complete");
    console.log(`📁 Generated: ci-reports/deps-map.json`);
    console.log(`📊 Analyzed ${report.metadata.totalFiles} files`);
    console.log(
      `📊 Found ${report.metadata.totalImports} imports, ${report.metadata.totalExports} exports`,
    );

    return report;
  }
}

// Execute if run directly
if (require.main === module) {
  const mapper = new DependencyMapper(process.cwd());
  mapper
    .generateDependencyMap()
    .then((report) => {
      console.log(
        "🎯 Top modules by size:",
        report.topModulesBySize.slice(0, 3),
      );
      console.log("🎯 Most imported:", report.mostImportedModules.slice(0, 3));
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Dependency mapping failed:", error);
      process.exit(1);
    });
}

module.exports = { DependencyMapper };
