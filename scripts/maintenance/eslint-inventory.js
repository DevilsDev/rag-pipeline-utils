#!/usr/bin/env node

/**
 * ESLint Inventory Generator
 *
 * Generates a comprehensive inventory of ESLint errors for batch resolution
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

class ESLintInventory {
  constructor() {
    this.timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.results = [];
    this.summary = {
      totalFiles: 0,
      totalErrors: 0,
      ruleFrequency: {},
      fileErrorCounts: {},
      priorityFiles: [],
    };
  }

  async generateInventory() {
    console.log("📊 Generating ESLint Inventory...");

    try {
      // Get ESLint output in JSON format
      const eslintOutput = execSync("npx eslint . --format json", {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });

      this.results = JSON.parse(eslintOutput);
    } catch (error) {
      // ESLint exits with code 1 when there are errors, but still outputs JSON
      if (error.stdout) {
        try {
          this.results = JSON.parse(error.stdout);
        } catch (parseError) {
          console.error(
            "❌ Failed to parse ESLint output:",
            parseError.message,
          );
          return;
        }
      } else {
        console.error("❌ ESLint execution failed:", error.message);
        return;
      }
    }

    this.analyzeResults();
    this.writeReports();
    this.displaySummary();
  }

  analyzeResults() {
    console.log("🔍 Analyzing ESLint results...");

    for (const result of this.results) {
      if (result.messages && result.messages.length > 0) {
        this.summary.totalFiles++;
        this.summary.fileErrorCounts[result.filePath] = result.messages.length;

        for (const message of result.messages) {
          this.summary.totalErrors++;

          // Count rule frequency
          const ruleId = message.ruleId || "no-rule";
          this.summary.ruleFrequency[ruleId] =
            (this.summary.ruleFrequency[ruleId] || 0) + 1;
        }
      }
    }

    // Sort files by error count for prioritization
    this.summary.priorityFiles = Object.entries(this.summary.fileErrorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20) // Top 20 files with most errors
      .map(([filePath, errorCount]) => ({ filePath, errorCount }));
  }

  writeReports() {
    console.log("📝 Writing inventory reports...");

    // Ensure ci-reports directory exists
    const reportsDir = path.join(process.cwd(), "ci-reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Write detailed JSON inventory
    const inventoryPath = path.join(
      reportsDir,
      `eslint-inventory-${this.timestamp}.json`,
    );
    fs.writeFileSync(
      inventoryPath,
      JSON.stringify(
        {
          timestamp: this.timestamp,
          summary: this.summary,
          results: this.results,
        },
        null,
        2,
      ),
    );

    // Write human-readable summary
    const summaryPath = path.join(reportsDir, "eslint-fixes-log.md");
    const summaryContent = this.generateSummaryMarkdown();

    if (fs.existsSync(summaryPath)) {
      fs.appendFileSync(summaryPath, "\n\n" + summaryContent);
    } else {
      fs.writeFileSync(summaryPath, summaryContent);
    }

    console.log(`✅ Inventory saved to: ${inventoryPath}`);
    console.log(`✅ Summary logged to: ${summaryPath}`);
  }

  generateSummaryMarkdown() {
    const topRules = Object.entries(this.summary.ruleFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    return `# ESLint Inventory - ${this.timestamp}

## Summary
- **Total Files with Errors**: ${this.summary.totalFiles}
- **Total Errors**: ${this.summary.totalErrors}
- **Average Errors per File**: ${(this.summary.totalErrors / this.summary.totalFiles).toFixed(1)}

## Top Error Rules
${topRules.map(([rule, count]) => `- **${rule}**: ${count} errors`).join("\n")}

## Priority Files (Top 10)
${this.summary.priorityFiles
  .slice(0, 10)
  .map(
    ({ filePath, errorCount }) =>
      `- **${path.relative(process.cwd(), filePath)}**: ${errorCount} errors`,
  )
  .join("\n")}

## Batch Planning
- **Batch 1 (no-undef)**: ${this.summary.ruleFrequency["no-undef"] || 0} errors
- **Batch 2 (signature/usage)**: ${(this.summary.ruleFrequency["no-unused-vars"] || 0) + (this.summary.ruleFrequency["no-undef"] || 0)} combined
- **Batch 3 (unused vars)**: ${this.summary.ruleFrequency["no-unused-vars"] || 0} errors
- **Batch 4 (correctness)**: ${Object.entries(this.summary.ruleFrequency)
      .filter(([rule]) => !["no-undef", "no-unused-vars"].includes(rule))
      .reduce((sum, [, count]) => sum + count, 0)} other errors`;
  }

  displaySummary() {
    console.log("\n📊 ESLint Inventory Summary");
    console.log("============================");
    console.log(`Total Files with Errors: ${this.summary.totalFiles}`);
    console.log(`Total Errors: ${this.summary.totalErrors}`);
    console.log(
      `Average Errors per File: ${(this.summary.totalErrors / this.summary.totalFiles).toFixed(1)}`,
    );

    console.log("\n🔥 Top Error Rules:");
    Object.entries(this.summary.ruleFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .forEach(([rule, count]) => {
        console.log(`  ${rule}: ${count} errors`);
      });

    console.log("\n📁 Priority Files (Top 5):");
    this.summary.priorityFiles
      .slice(0, 5)
      .forEach(({ filePath, errorCount }) => {
        console.log(
          `  ${path.relative(process.cwd(), filePath)}: ${errorCount} errors`,
        );
      });

    console.log("\n🎯 Batch 1 Target (no-undef):");
    const noUndefCount = this.summary.ruleFrequency["no-undef"] || 0;
    console.log(`  ${noUndefCount} no-undef errors to fix`);

    if (noUndefCount > 0) {
      console.log("\n🚀 Ready to proceed with Batch 1!");
    } else {
      console.log("\n✅ No no-undef errors found. Ready for next batch.");
    }
  }
}

// Run the inventory generator
if (require.main === module) {
  const inventory = new ESLintInventory();
  inventory.generateInventory().catch(console.error);
}

module.exports = ESLintInventory;
