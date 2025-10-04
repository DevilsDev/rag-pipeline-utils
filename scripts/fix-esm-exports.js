#!/usr/bin/env node

/**
 * Comprehensive ESM Export to CommonJS Conversion Script
 *
 * Converts all ES6 export statements to CommonJS module.exports
 * to complete the Jest test suite loading fixes.
 */

const fs = require("fs").promises;
// eslint-disable-line global-require
const path = require("path");
// eslint-disable-line global-require

class ESMExportToCommonJSConverter {
  constructor() {
    this.conversions = 0;
    this.filesProcessed = 0;
  }

  /**
   * Convert ES6 exports to CommonJS module.exports
   */
  convertExportsToModuleExports(content) {
    let converted = content;
    let conversionCount = 0;
    const exports = [];

    // Pattern 1: export class ClassName
    converted = converted.replace(
      /export\s+class\s+(\w+)/g,
      (match, className) => {
        conversionCount++;
        exports.push(className);
        return `class ${className}`;
      },
    );

    // Pattern 2: export function functionName
    converted = converted.replace(
      /export\s+function\s+(\w+)/g,
      (match, functionName) => {
        conversionCount++;
        exports.push(functionName);
        return `function ${functionName}`;
      },
    );

    // Pattern 3: export const/let/var variableName
    converted = converted.replace(
      /export\s+(const|let|var)\s+(\w+)/g,
      (match, keyword, variableName) => {
        conversionCount++;
        exports.push(variableName);
        return `${keyword} ${variableName}`;
      },
    );

    // Pattern 4: export { namedExport1, namedExport2 }
    const namedExportMatches = converted.match(/export\s*\{\s*([^}]+)\s*\}/g);
    if (namedExportMatches) {
      namedExportMatches.forEach((match) => {
        const namedExports = match
          .match(/export\s*\{\s*([^}]+)\s*\}/)[1]
          .split(",")
          .map((name) => name.trim());
        exports.push(...namedExports);
        conversionCount++;
      });
      converted = converted.replace(/export\s*\{\s*[^}]+\s*\}/g, "");
    }

    // Pattern 5: export default
    converted = converted.replace(
      /export\s+default\s+(\w+)/g,
      (match, defaultExport) => {
        conversionCount++;
        exports.push(`default: ${defaultExport}`);
        return "";
      },
    );

    // Add module.exports at the end if we found exports
    if (exports.length > 0) {
      const moduleExports = exports
        .filter((exp) => exp.includes("default:"))
        .map((exp) => exp.replace("default: ", ""))
        .concat(
          exports
            .filter((exp) => !exp.includes("default:"))
            .map((exp) => `  ${exp}`),
        );

      if (
        moduleExports.length === 1 &&
        exports.some((exp) => exp.includes("default:"))
      ) {
        // Single default export
        converted += `\n\nmodule.exports = ${moduleExports[0]};`;
      } else {
        // Multiple exports or named exports
        const exportsObj = exports
          .filter((exp) => !exp.includes("default:"))
          .map((exp) => `  ${exp}`)
          .join(",\n");

        if (exportsObj) {
          converted += `\n\nmodule.exports = {\n${exportsObj}\n};`;
        }
      }
    }

    this.conversions += conversionCount;
    return converted;
  }

  /**
   * Process a single file
   */
  async processFile(_filePath) {
    try {
      const content = await fs.readFile(_filePath, "utf8");
      const originalContent = content;

      // Skip if no exports found
      if (!content.includes("export ")) {
        return;
      }

      const convertedContent = this.convertExportsToModuleExports(content);

      // Only write if content changed
      if (convertedContent !== originalContent) {
        await fs.writeFile(_filePath, convertedContent, "utf8");
        console.log(
          `✅ Converted exports in: ${path.relative(process.cwd(), _filePath)}`,
        );
        // eslint-disable-line no-console
        this.filesProcessed++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${_filePath}:`, error.message);
      // eslint-disable-line no-console
    }
  }

  /**
   * Recursively find all JavaScript files
   */
  async findJavaScriptFiles(dir, files = []) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== "node_modules"
      ) {
        await this.findJavaScriptFiles(fullPath, files);
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Convert all files in src directory
   */
  async convertAllFiles() {
    console.log("🔄 Starting ESM export to CommonJS conversion...\n");
    // eslint-disable-line no-console

    const srcDir = path.join(process.cwd(), "src");
    const files = await this.findJavaScriptFiles(srcDir);

    console.log(`📁 Found ${files.length} JavaScript files to process\n`);
    // eslint-disable-line no-console

    for (const file of files) {
      await this.processFile(file);
    }

    console.log("\n📊 Export Conversion Summary:");
    // eslint-disable-line no-console
    console.log(`   Files processed: ${this.filesProcessed}`);
    // eslint-disable-line no-console
    console.log(`   Export statements converted: ${this.conversions}`);
    // eslint-disable-line no-console
    console.log("✅ ESM export to CommonJS conversion complete!\n");
    // eslint-disable-line no-console
  }
}

// Run the conversion
async function main() {
  const converter = new ESMExportToCommonJSConverter();
  await converter.convertAllFiles();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { ESMExportToCommonJSConverter };
