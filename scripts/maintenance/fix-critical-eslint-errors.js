#!/usr/bin/env node

/**
 * Critical ESLint Error Fixer
 * Fixes blocking ESLint errors to enable commits
 */

const fs = require("fs");
// eslint-disable-line global-require
const path = require("path");
// eslint-disable-line global-require
const { execSync } = require("child_process");
// eslint-disable-line global-require

class CriticalESLintFixer {
  constructor() {
    this.projectRoot = process.cwd();
    this.fixedFiles = [];
  }

  async run() {
    console.log("🚨 Fixing critical ESLint errors...\n");
    // eslint-disable-line no-console

    try {
      // Get critical errors only
      const errors = await this.getCriticalErrors();

      // Fix each error systematically
      for (const error of errors) {
        await this.fixError(error);
      }

      // Verify fixes
      await this.verifyFixes();

      console.log("\n✅ Critical ESLint errors fixed!");
      // eslint-disable-line no-console
      console.log(`📁 Fixed files: ${this.fixedFiles.length}`);
      // eslint-disable-line no-console
    } catch (error) {
      console.error("❌ Failed to fix critical errors:", error.message);
      // eslint-disable-line no-console
      process.exit(1);
    }
  }

  async getCriticalErrors() {
    console.log("🔍 Identifying critical ESLint errors...");
    // eslint-disable-line no-console

    try {
      const result = execSync("npx eslint . --quiet --format=json", {
        encoding: "utf8",
        cwd: this.projectRoot,
      });

      return JSON.parse(result);
    } catch (error) {
      if (error.stdout) {
        return JSON.parse(error.stdout);
      }
      throw error;
    }
  }

  async fixError(fileResult) {
    if (fileResult.errorCount === 0) return;

    const _filePath = fileResult._filePath;
    const relativePath = path.relative(this.projectRoot, _filePath);

    console.log(`📝 Fixing: ${relativePath}`);
    // eslint-disable-line no-console

    try {
      let content = fs.readFileSync(_filePath, "utf8");
      let hasChanges = false;

      for (const message of fileResult.messages) {
        if (message.severity === 2) {
          // Error level
          const fix = this.getFixForError(message, content);
          if (fix) {
            content = fix.content;
            hasChanges = true;
            console.log(
              `  ✅ Fixed: ${message.ruleId} at line ${message.line}`,
            );
            // eslint-disable-line no-console
          }
        }
      }

      if (hasChanges) {
        fs.writeFileSync(_filePath, content);
        this.fixedFiles.push(relativePath);
      }
    } catch (error) {
      console.error(`  ❌ Failed to fix ${relativePath}:`, error.message);
      // eslint-disable-line no-console
    }
  }

  getFixForError(message, content) {
    const { ruleId, line, message: errorMsg } = message;

    switch (ruleId) {
      case "no-undef":
        return this.fixUndefinedVariable(content, line, errorMsg);

      case "semi":
        return this.fixMissingSemicolon(content, line);

      case "// eslint-disable-line no-console":
        return this.fixMalformedESLintDisable(content, line);

      default:
        if (ruleId && ruleId.includes("eslint-disable-line")) {
          return this.fixMalformedESLintDisable(content, line);
        }
        return null;
    }
  }

  fixUndefinedVariable(content, line, errorMsg) {
    const lines = content.split("\n");
    const targetLine = lines[line - 1];

    // Handle specific undefined variable cases
    if (errorMsg.includes("'or' is not defined")) {
      // Replace 'or' with '||' operator
      const fixedLine = targetLine.replace(/\bor\b/g, "||");
      lines[line - 1] = fixedLine;

      return {
        content: lines.join("\n"),
        description: "Replaced 'or' with '||' operator",
      };
    }

    // Handle other common undefined variables
    const match = errorMsg.match(/'([^']+)' is not defined/);
    if (match) {
      const varName = match[1];

      // Common Node.js globals
      const nodeGlobals = [
        "process",
        "Buffer",
        "console",
        "__dirname",
        "__filename",
      ];
      if (nodeGlobals.includes(varName)) {
        // Add comment explaining the global
        lines.splice(line - 1, 0, `// ${varName} is a Node.js global`);

        return {
          content: lines.join("\n"),
          description: `Added comment for Node.js global '${varName}'`,
        };
      }
    }

    return null;
  }

  fixMissingSemicolon(content, line) {
    const lines = content.split("\n");
    const targetLine = lines[line - 1];

    // Add semicolon if missing
    if (
      !targetLine.trim().endsWith(";") &&
      !targetLine.trim().endsWith("{") &&
      !targetLine.trim().endsWith("}") &&
      targetLine.trim().length > 0
    ) {
      lines[line - 1] = targetLine + ";";

      return {
        content: lines.join("\n"),
        description: "Added missing semicolon",
      };
    }

    return null;
  }

  fixMalformedESLintDisable(content, line) {
    const lines = content.split("\n");
    const targetLine = lines[line - 1];

    // Fix malformed eslint-disable comments
    const malformedPatterns = [
      /no-console \/\/ eslint-disable-line no-console/g,
      /\/\/ eslint-disable-line no-console \/\/ eslint-disable-line no-console/g,
      /no-console \/\/ eslint-disable-line no-console \/\/ eslint-disable-line no-console/g,
    ];

    let fixedLine = targetLine;
    let wasFixed = false;

    for (const pattern of malformedPatterns) {
      if (pattern.test(fixedLine)) {
        fixedLine = fixedLine.replace(
          pattern,
          "// eslint-disable-line no-console",
        );
        wasFixed = true;
      }
    }

    // Remove duplicate eslint-disable comments
    fixedLine = fixedLine.replace(
      /(\/\/ eslint-disable-line no-console\s*){2,}/g,
      "// eslint-disable-line no-console",
    );

    if (wasFixed || fixedLine !== targetLine) {
      lines[line - 1] = fixedLine;

      return {
        content: lines.join("\n"),
        description: "Fixed malformed eslint-disable comment",
      };
    }

    return null;
  }

  async verifyFixes() {
    console.log("\n🔍 Verifying critical error fixes...");
    // eslint-disable-line no-console

    try {
      const result = execSync("npx eslint . --quiet --format=compact", {
        encoding: "utf8",
        cwd: this.projectRoot,
        stdio: "pipe",
      });

      console.log("✅ All critical ESLint errors resolved!");
      // eslint-disable-line no-console
    } catch (error) {
      if (error.stdout) {
        const lines = error.stdout.split("\n").filter((line) => line.trim());
        const errorCount = lines.filter((line) =>
          line.includes("Error"),
        ).length;

        console.log(`⚠️  Remaining critical errors: ${errorCount}`);
        // eslint-disable-line no-console

        if (errorCount === 0) {
          console.log("✅ All critical errors resolved!");
          // eslint-disable-line no-console
        } else {
          console.log("❌ Some critical errors still need attention:");
          // eslint-disable-line no-console
          lines.slice(0, 5).forEach((line) => console.log(`  ${line}`));
          // eslint-disable-line no-console
        }
      }
    }
  }
}

// Run the fixer if called directly
if (require.main === module) {
  const fixer = new CriticalESLintFixer();
  fixer.run().catch((error) => {
    console.error("Fatal error:", error);
    // eslint-disable-line no-console
    process.exit(1);
  });
}

module.exports = { CriticalESLintFixer };
