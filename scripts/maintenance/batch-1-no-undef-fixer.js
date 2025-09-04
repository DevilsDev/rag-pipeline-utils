#!/usr/bin/env node

/**
 * Batch 1: P0 no-undef (core runtime) Fixer
 *
 * Targets the 163 no-undef errors with surgical fixes:
 * - Add correct imports/definitions
 * - Fix parameter name mismatches
 * - Add safe defaults only where intent is clear
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

class Batch1NoUndefFixer {
  constructor() {
    this.timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.fixedFiles = [];
    this.localDisables = [];
    this.report = {
      beforeCount: 0,
      afterCount: 0,
      filesChanged: [],
      rulesFixed: ["no-undef"],
      disablesAdded: [],
    };
  }

  async run() {
    console.log("🔧 Batch 1: P0 no-undef (core runtime) Fixes");
    console.log("=============================================");

    try {
      // Get initial count
      this.report.beforeCount = this.getNoUndefCount();
      console.log(`📊 Initial no-undef errors: ${this.report.beforeCount}`);

      // Apply targeted fixes
      await this.fixKnownPatterns();
      await this.fixParameterMismatches();
      await this.fixMissingImports();

      // Self-check on touched files
      await this.selfCheck();

      // Get final count
      this.report.afterCount = this.getNoUndefCount();
      console.log(`📊 Final no-undef errors: ${this.report.afterCount}`);
      console.log(
        `✅ Fixed ${this.report.beforeCount - this.report.afterCount} no-undef errors`,
      );

      // Write batch report
      this.writeBatchReport();

      return this.report.afterCount === 0;
    } catch (error) {
      console.error("❌ Batch 1 failed:", error.message);
      throw error;
    }
  }

  getNoUndefCount() {
    try {
      execSync("npx eslint . --quiet --format=compact", {
        encoding: "utf8",
        stdio: "pipe",
      });
      return 0;
    } catch (error) {
      const output = error.stdout || "";
      const noUndefLines = output
        .split("\n")
        .filter(
          (line) =>
            line.includes("is not defined") && line.includes("no-undef"),
        );
      return noUndefLines.length;
    }
  }

  async fixKnownPatterns() {
    console.log("🔍 Fixing known no-undef patterns...");

    const knownFixes = [
      // Common undefined variables with clear fixes
      {
        file: /src\/.*\.js$/,
        patterns: [
          {
            find: /\b_config\b(?!\s*[=:])/g,
            replace: "config",
            condition: (content) =>
              content.includes("function") && content.includes("config"),
          },
          {
            find: /\buserWorkloads\b/g,
            replace: "_userWorkloads",
            condition: (content) =>
              content.includes("_userWorkloads") ||
              content.includes("userWorkloads"),
          },
          {
            find: /\bpipeline\b(?!\s*[=:.])/g,
            replace: "_pipeline",
            condition: (content) => content.includes("_pipeline"),
          },
        ],
      },
      // Test files specific fixes
      {
        file: /__tests__\/.*\.js$/,
        patterns: [
          {
            find: /\bexpect\b/g,
            replace: "expect",
            addImport: "const { expect } = require('@jest/globals');",
            condition: (content) =>
              !content.includes("require('@jest/globals')"),
          },
          {
            find: /\bdescribe\b/g,
            replace: "describe",
            addImport:
              "const { describe, it, beforeEach, afterEach } = require('@jest/globals');",
            condition: (content) =>
              !content.includes("require('@jest/globals')"),
          },
        ],
      },
    ];

    const allFiles = this.getAllJSFiles();

    for (const filePath of allFiles) {
      if (!fs.existsSync(filePath)) continue;

      let content = fs.readFileSync(filePath, "utf8");
      let modified = false;
      let importsToAdd = [];

      for (const fixGroup of knownFixes) {
        if (fixGroup.file.test(filePath)) {
          for (const pattern of fixGroup.patterns) {
            if (pattern.condition && !pattern.condition(content)) continue;

            if (pattern.find.test(content)) {
              content = content.replace(pattern.find, pattern.replace);
              modified = true;

              if (pattern.addImport && !content.includes(pattern.addImport)) {
                importsToAdd.push(pattern.addImport);
              }
            }
          }
        }
      }

      // Add imports at the top of the file
      if (importsToAdd.length > 0) {
        const lines = content.split("\n");
        const insertIndex = this.findImportInsertIndex(lines);
        lines.splice(insertIndex, 0, ...importsToAdd);
        content = lines.join("\n");
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(filePath, content);
        this.fixedFiles.push(filePath);
        this.report.filesChanged.push(path.relative(process.cwd(), filePath));
        console.log(
          `  ✅ Fixed patterns in ${path.relative(process.cwd(), filePath)}`,
        );
      }
    }
  }

  async fixParameterMismatches() {
    console.log("🔍 Fixing parameter name mismatches...");

    // Get specific no-undef errors from ESLint
    let eslintOutput = "";
    try {
      execSync("npx eslint . --format=compact", { encoding: "utf8" });
    } catch (error) {
      eslintOutput = error.stdout || "";
    }

    const fileErrors = new Map();
    const lines = eslintOutput.split("\n");

    for (const line of lines) {
      const match = line.match(/^([^:]+):.*'([^']+)' is not defined.*no-undef/);
      if (match) {
        const [, filePath, varName] = match;
        if (!fileErrors.has(filePath)) {
          fileErrors.set(filePath, new Set());
        }
        fileErrors.get(filePath).add(varName);
      }
    }

    for (const [filePath, undefinedVars] of fileErrors) {
      if (!fs.existsSync(filePath)) continue;

      let content = fs.readFileSync(filePath, "utf8");
      let modified = false;

      for (const varName of undefinedVars) {
        // Look for underscore-prefixed version
        const underscoreVar = `_${varName}`;

        if (content.includes(underscoreVar)) {
          // Replace usage in function body (not in parameter list)
          const lines = content.split("\n");

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Skip function declarations and parameter lists
            if (
              line.includes("function") ||
              line.includes("=>") ||
              line.trim().startsWith("//") ||
              line.includes("*")
            ) {
              continue;
            }

            // Replace standalone variable usage
            const regex = new RegExp(`\\b${varName}\\b(?![\\w_])`, "g");
            if (regex.test(line)) {
              lines[i] = line.replace(regex, underscoreVar);
              modified = true;
            }
          }

          content = lines.join("\n");
        }
      }

      if (modified) {
        fs.writeFileSync(filePath, content);
        this.fixedFiles.push(filePath);
        this.report.filesChanged.push(path.relative(process.cwd(), filePath));
        console.log(
          `  ✅ Fixed parameter mismatches in ${path.relative(process.cwd(), filePath)}`,
        );
      }
    }
  }

  async fixMissingImports() {
    console.log("🔍 Adding missing imports...");

    const commonImports = [
      {
        pattern: /\bfs\b/,
        import: "const fs = require('fs');",
        condition: (content) => !content.includes("require('fs')"),
      },
      {
        pattern: /\bpath\b/,
        import: "const path = require('path');",
        condition: (content) => !content.includes("require('path')"),
      },
      {
        pattern: /\bchalk\b/,
        import: "const chalk = require('chalk');",
        condition: (content) => !content.includes("require('chalk')"),
      },
    ];

    const allFiles = this.getAllJSFiles();

    for (const filePath of allFiles) {
      if (!fs.existsSync(filePath)) continue;

      let content = fs.readFileSync(filePath, "utf8");
      let importsToAdd = [];

      for (const importDef of commonImports) {
        if (importDef.pattern.test(content) && importDef.condition(content)) {
          importsToAdd.push(importDef.import);
        }
      }

      if (importsToAdd.length > 0) {
        const lines = content.split("\n");
        const insertIndex = this.findImportInsertIndex(lines);
        lines.splice(insertIndex, 0, ...importsToAdd);
        content = lines.join("\n");

        fs.writeFileSync(filePath, content);
        this.fixedFiles.push(filePath);
        this.report.filesChanged.push(path.relative(process.cwd(), filePath));
        console.log(
          `  ✅ Added imports to ${path.relative(process.cwd(), filePath)}`,
        );
      }
    }
  }

  findImportInsertIndex(lines) {
    // Find the best place to insert imports
    let insertIndex = 0;

    // Skip shebang and initial comments
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (
        line.startsWith("#!") ||
        line.startsWith("//") ||
        line.startsWith("/*") ||
        line === ""
      ) {
        insertIndex = i + 1;
      } else if (line.startsWith("const") || line.startsWith("require")) {
        // Insert before existing requires
        insertIndex = i;
        break;
      } else {
        break;
      }
    }

    return insertIndex;
  }

  async selfCheck() {
    console.log("🔍 Self-checking touched files...");

    if (this.fixedFiles.length === 0) {
      console.log("  No files were modified");
      return;
    }

    const uniqueFiles = [...new Set(this.fixedFiles)];

    try {
      const fileList = uniqueFiles.map((f) => `"${f}"`).join(" ");
      execSync(`npx eslint ${fileList} --format stylish`, {
        encoding: "utf8",
        stdio: "pipe",
      });
      console.log("  ✅ All touched files pass ESLint");
    } catch (error) {
      const output = error.stdout || "";
      console.log("  ⚠️  Some touched files still have ESLint errors:");
      console.log(output.split("\n").slice(0, 10).join("\n"));
    }
  }

  writeBatchReport() {
    console.log("📝 Writing batch report...");

    const reportPath = path.join(
      "ci-reports",
      `eslint-fixes-${this.timestamp}.json`,
    );
    const report = {
      batch: 1,
      timestamp: this.timestamp,
      target: "no-undef (core runtime)",
      ...this.report,
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Append to log
    const logPath = path.join("ci-reports", "eslint-fixes-log.md");
    const logEntry = `
## Batch 1 - ${this.timestamp}
- **Target**: no-undef (core runtime)
- **Before**: ${this.report.beforeCount} errors
- **After**: ${this.report.afterCount} errors
- **Fixed**: ${this.report.beforeCount - this.report.afterCount} errors
- **Files Changed**: ${this.report.filesChanged.length}
- **Local Disables**: ${this.report.disablesAdded.length}
`;

    fs.appendFileSync(logPath, logEntry);
    console.log(`✅ Batch report saved to: ${reportPath}`);
  }

  getAllJSFiles() {
    const files = [];

    const scanDirectory = (dir) => {
      if (!fs.existsSync(dir)) return;

      const items = fs.readdirSync(dir);

      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);

        if (
          stat.isDirectory() &&
          !item.startsWith(".") &&
          item !== "node_modules"
        ) {
          scanDirectory(itemPath);
        } else if (item.endsWith(".js")) {
          files.push(itemPath);
        }
      }
    };

    // Focus on first-party code only
    ["src", "__tests__", "bin", "scripts"].forEach((dir) => {
      scanDirectory(dir);
    });

    return files;
  }
}

// Run Batch 1 if called directly
if (require.main === module) {
  const fixer = new Batch1NoUndefFixer();
  fixer
    .run()
    .then((success) => {
      if (success) {
        console.log("🎉 Batch 1 completed successfully!");
        process.exit(0);
      } else {
        console.log("⚠️  Batch 1 completed with remaining errors");
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("❌ Batch 1 failed:", error);
      process.exit(1);
    });
}

module.exports = Batch1NoUndefFixer;
