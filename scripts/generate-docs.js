#!/usr/bin/env node
/**
 * @fileoverview Documentation Generation Pipeline
 * Generates comprehensive API documentation from JSDoc comments
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { performance } = require("perf_hooks");

/**
 * Documentation generator with multiple output formats
 */
class DocumentationGenerator {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.outputDir = options.outputDir || path.join(this.rootDir, "docs");
    this.sourceDir = options.sourceDir || path.join(this.rootDir, "src");
    this.formats = options.formats || ["html", "markdown", "json"];
    this.verbose = options.verbose || false;

    this.config = {
      title: "RAG Pipeline Utils API Documentation",
      version: this.getPackageVersion(),
      description:
        "Enterprise-grade JavaScript RAG toolkit with plugin ecosystem",
      author: "DevilsDev Team",
      repository: "https://github.com/DevilsDev/rag-pipeline-utils",
    };
  }

  /**
   * Get package version from package.json
   * @returns {string} Package version
   */
  getPackageVersion() {
    try {
      const packagePath = path.join(this.rootDir, "package.json");
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      return packageJson.version || "1.0.0";
    } catch (error) {
      return "1.0.0";
    }
  }

  /**
   * Log message if verbose mode is enabled
   * @param {string} message - Message to log
   */
  log(message) {
    if (this.verbose) {
      console.log(`[docs] ${message}`);
    }
  }

  /**
   * Find all JavaScript files in source directory
   * @returns {string[]} Array of file paths
   */
  findSourceFiles() {
    const files = [];

    const scanDirectory = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          scanDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
          files.push(fullPath);
        }
      }
    };

    scanDirectory(this.sourceDir);
    return files;
  }

  /**
   * Extract JSDoc comments from source files
   * @param {string[]} files - Array of file paths
   * @returns {Array} Extracted documentation data
   */
  extractDocumentation(files) {
    const docs = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, "utf8");
        const relativePath = path.relative(this.rootDir, file);

        // Extract JSDoc blocks using regex
        const jsdocRegex = /\/\*\*([^*]|[\r\n]|(\*+([^*/]|[\r\n])))*\*+\//g;
        const matches = content.match(jsdocRegex) || [];

        for (const match of matches) {
          const docBlock = this.parseJSDocBlock(match, file, relativePath);
          if (docBlock) {
            docs.push(docBlock);
          }
        }
      } catch (error) {
        console.warn(
          `Warning: Could not process file ${file}: ${error.message}`,
        );
      }
    }

    return docs;
  }

  /**
   * Parse individual JSDoc block
   * @param {string} docText - JSDoc comment text
   * @param {string} file - Source file path
   * @param {string} relativePath - Relative file path
   * @returns {Object|null} Parsed documentation object
   */
  parseJSDocBlock(docText, file, relativePath) {
    const lines = docText
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, "").trim())
      .filter((line) => line !== "");

    if (lines.length === 0) return null;

    const doc = {
      file: relativePath,
      fullPath: file,
      description: "",
      tags: {},
      params: [],
      returns: null,
      examples: [],
      since: null,
      author: null,
      throws: [],
    };

    let currentSection = "description";
    let currentExample = "";

    for (const line of lines) {
      if (line.startsWith("@")) {
        if (currentSection === "example" && currentExample) {
          doc.examples.push(currentExample.trim());
          currentExample = "";
        }

        const tagMatch = line.match(/^@(\w+)(?:\s+(.+))?/);
        if (tagMatch) {
          const [, tagName, tagValue] = tagMatch;

          switch (tagName) {
            case "param":
              doc.params.push(this.parseParamTag(tagValue || ""));
              currentSection = "param";
              break;
            case "returns":
            case "return":
              doc.returns = this.parseReturnTag(tagValue || "");
              currentSection = "returns";
              break;
            case "example":
              currentSection = "example";
              if (tagValue) currentExample += tagValue + "\n";
              break;
            case "throws":
            case "throw":
              doc.throws.push(tagValue || "");
              currentSection = "throws";
              break;
            case "since":
              doc.since = tagValue;
              currentSection = "since";
              break;
            case "author":
              doc.author = tagValue;
              currentSection = "author";
              break;
            case "fileoverview":
              doc.fileoverview = tagValue;
              currentSection = "fileoverview";
              break;
            default:
              doc.tags[tagName] = tagValue;
              currentSection = "other";
          }
        }
      } else {
        switch (currentSection) {
          case "description":
            doc.description += (doc.description ? " " : "") + line;
            break;
          case "example":
            currentExample += line + "\n";
            break;
        }
      }
    }

    // Add final example if exists
    if (currentExample) {
      doc.examples.push(currentExample.trim());
    }

    return doc.description || doc.fileoverview ? doc : null;
  }

  /**
   * Parse @param tag
   * @param {string} paramText - Parameter tag text
   * @returns {Object} Parsed parameter
   */
  parseParamTag(paramText) {
    const match = paramText.match(/^{([^}]+)}\s+(\[?[^\s\]]+\]?)\s*-?\s*(.+)?/);

    if (match) {
      const [, type, name, description] = match;
      const isOptional = name.startsWith("[") && name.endsWith("]");
      const cleanName = isOptional ? name.slice(1, -1) : name;

      return {
        type: type.trim(),
        name: cleanName,
        description: description ? description.trim() : "",
        optional: isOptional,
      };
    }

    return {
      type: "any",
      name: paramText,
      description: "",
      optional: false,
    };
  }

  /**
   * Parse @returns tag
   * @param {string} returnText - Return tag text
   * @returns {Object} Parsed return information
   */
  parseReturnTag(returnText) {
    const match = returnText.match(/^{([^}]+)}\s*(.+)?/);

    if (match) {
      const [, type, description] = match;
      return {
        type: type.trim(),
        description: description ? description.trim() : "",
      };
    }

    return {
      type: "any",
      description: returnText,
    };
  }

  /**
   * Generate HTML documentation
   * @param {Array} docs - Documentation data
   * @returns {string} HTML content
   */
  generateHTML(docs) {
    const fileGroups = this.groupDocsByFile(docs);

    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.config.title}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #e1e1e1; padding-bottom: 20px; margin-bottom: 30px; }
        .title { font-size: 2.5em; margin: 0; color: #2c3e50; }
        .subtitle { font-size: 1.2em; color: #7f8c8d; margin: 10px 0; }
        .nav { background: #34495e; margin: -30px -30px 30px -30px; padding: 15px 30px; }
        .nav a { color: white; text-decoration: none; margin-right: 20px; padding: 8px 15px; border-radius: 4px; }
        .nav a:hover { background: #2c3e50; }
        .file-section { margin-bottom: 40px; border-left: 4px solid #3498db; padding-left: 20px; }
        .file-title { font-size: 1.5em; color: #2c3e50; margin-bottom: 15px; }
        .doc-item { margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 6px; }
        .doc-title { font-size: 1.2em; font-weight: bold; color: #2c3e50; margin-bottom: 10px; }
        .description { margin-bottom: 15px; }
        .params, .returns, .examples { margin-top: 15px; }
        .param { margin: 8px 0; }
        .param-name { font-weight: bold; color: #e74c3c; }
        .param-type { color: #9b59b6; font-family: monospace; }
        .code-block { background: #2c3e50; color: #ecf0f1; padding: 15px; border-radius: 4px; overflow-x: auto; font-family: 'Courier New', monospace; margin: 10px 0; }
        .meta { font-size: 0.9em; color: #7f8c8d; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">${this.config.title}</h1>
            <p class="subtitle">${this.config.description}</p>
            <p class="meta">Version ${this.config.version} • Generated ${new Date().toLocaleDateString()}</p>
        </div>

        <nav class="nav">
            ${Object.keys(fileGroups)
              .map((file) => `<a href="#${this.sanitizeId(file)}">${file}</a>`)
              .join("")}
        </nav>

        ${Object.entries(fileGroups)
          .map(
            ([file, fileDocs]) => `
            <div class="file-section" id="${this.sanitizeId(file)}">
                <h2 class="file-title">${file}</h2>
                ${fileDocs.map((doc) => this.renderDocItem(doc)).join("")}
            </div>
        `,
          )
          .join("")}
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Render individual documentation item
   * @param {Object} doc - Documentation object
   * @returns {string} HTML for doc item
   */
  renderDocItem(doc) {
    return `
        <div class="doc-item">
            ${doc.fileoverview ? `<h3 class="doc-title">File Overview</h3>` : ""}
            <div class="description">${doc.description || doc.fileoverview || ""}</div>

            ${
              doc.params.length > 0
                ? `
                <div class="params">
                    <h4>Parameters:</h4>
                    ${doc.params
                      .map(
                        (param) => `
                        <div class="param">
                            <span class="param-name">${param.name}</span>
                            <span class="param-type">{${param.type}}</span>
                            ${param.optional ? "<em>(optional)</em>" : ""}
                            - ${param.description}
                        </div>
                    `,
                      )
                      .join("")}
                </div>
            `
                : ""
            }

            ${
              doc.returns
                ? `
                <div class="returns">
                    <h4>Returns:</h4>
                    <span class="param-type">{${doc.returns.type}}</span> ${doc.returns.description}
                </div>
            `
                : ""
            }

            ${
              doc.examples.length > 0
                ? `
                <div class="examples">
                    <h4>Examples:</h4>
                    ${doc.examples
                      .map(
                        (example) => `
                        <pre class="code-block">${this.escapeHtml(example)}</pre>
                    `,
                      )
                      .join("")}
                </div>
            `
                : ""
            }

            <div class="meta">
                ${doc.author ? `Author: ${doc.author} • ` : ""}
                ${doc.since ? `Since: ${doc.since}` : ""}
            </div>
        </div>
    `;
  }

  /**
   * Generate Markdown documentation
   * @param {Array} docs - Documentation data
   * @returns {string} Markdown content
   */
  generateMarkdown(docs) {
    const fileGroups = this.groupDocsByFile(docs);

    let markdown = `# ${this.config.title}\n\n`;
    markdown += `${this.config.description}\n\n`;
    markdown += `**Version:** ${this.config.version}  \n`;
    markdown += `**Generated:** ${new Date().toLocaleDateString()}\n\n`;

    // Table of contents
    markdown += `## Table of Contents\n\n`;
    for (const file of Object.keys(fileGroups)) {
      markdown += `- [${file}](#${this.sanitizeId(file)})\n`;
    }
    markdown += "\n";

    // File sections
    for (const [file, fileDocs] of Object.entries(fileGroups)) {
      markdown += `## ${file}\n\n`;

      for (const doc of fileDocs) {
        if (doc.fileoverview) {
          markdown += `### File Overview\n\n${doc.fileoverview}\n\n`;
        }

        if (doc.description && !doc.fileoverview) {
          markdown += `${doc.description}\n\n`;
        }

        if (doc.params.length > 0) {
          markdown += `**Parameters:**\n\n`;
          for (const param of doc.params) {
            markdown += `- \`${param.name}\` \`{${param.type}}\``;
            if (param.optional) markdown += ` *(optional)*`;
            markdown += ` - ${param.description}\n`;
          }
          markdown += "\n";
        }

        if (doc.returns) {
          markdown += `**Returns:** \`{${doc.returns.type}}\` ${doc.returns.description}\n\n`;
        }

        if (doc.examples.length > 0) {
          markdown += `**Examples:**\n\n`;
          for (const example of doc.examples) {
            markdown += "```javascript\n" + example + "\n```\n\n";
          }
        }

        if (doc.author || doc.since) {
          markdown += `*`;
          if (doc.author) markdown += `Author: ${doc.author}`;
          if (doc.author && doc.since) markdown += ` • `;
          if (doc.since) markdown += `Since: ${doc.since}`;
          markdown += `*\n\n`;
        }

        markdown += "---\n\n";
      }
    }

    return markdown;
  }

  /**
   * Generate JSON documentation
   * @param {Array} docs - Documentation data
   * @returns {string} JSON content
   */
  generateJSON(docs) {
    const output = {
      meta: {
        title: this.config.title,
        description: this.config.description,
        version: this.config.version,
        generated: new Date().toISOString(),
        author: this.config.author,
      },
      files: this.groupDocsByFile(docs),
    };

    return JSON.stringify(output, null, 2);
  }

  /**
   * Group documentation by file
   * @param {Array} docs - Documentation data
   * @returns {Object} Grouped documentation
   */
  groupDocsByFile(docs) {
    const groups = {};

    for (const doc of docs) {
      if (!groups[doc.file]) {
        groups[doc.file] = [];
      }
      groups[doc.file].push(doc);
    }

    return groups;
  }

  /**
   * Sanitize string for use as HTML ID
   * @param {string} str - String to sanitize
   * @returns {string} Sanitized string
   */
  sanitizeId(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, "-");
  }

  /**
   * Escape HTML characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Ensure output directory exists
   */
  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      this.log(`Created output directory: ${this.outputDir}`);
    }
  }

  /**
   * Generate all documentation formats
   */
  async generate() {
    const startTime = performance.now();

    this.log("Starting documentation generation...");
    this.ensureOutputDir();

    // Find source files
    const sourceFiles = this.findSourceFiles();
    this.log(`Found ${sourceFiles.length} source files`);

    // Extract documentation
    const docs = this.extractDocumentation(sourceFiles);
    this.log(`Extracted ${docs.length} documentation blocks`);

    // Generate each format
    for (const format of this.formats) {
      this.log(`Generating ${format} documentation...`);

      let content = "";
      let filename = "";

      switch (format) {
        case "html":
          content = this.generateHTML(docs);
          filename = "api.html";
          break;
        case "markdown":
          content = this.generateMarkdown(docs);
          filename = "api.md";
          break;
        case "json":
          content = this.generateJSON(docs);
          filename = "api.json";
          break;
        default:
          console.warn(`Unknown format: ${format}`);
          continue;
      }

      const outputPath = path.join(this.outputDir, filename);
      fs.writeFileSync(outputPath, content, "utf8");
      this.log(`Generated: ${outputPath}`);
    }

    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);

    console.log(`✅ Documentation generation completed in ${duration}ms`);
    console.log(`📁 Output directory: ${this.outputDir}`);
    console.log(`📄 Generated formats: ${this.formats.join(", ")}`);
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes("--verbose") || args.includes("-v"),
    formats: ["html", "markdown", "json"],
  };

  // Parse format options
  const formatIndex = args.findIndex(
    (arg) => arg === "--formats" || arg === "-f",
  );
  if (formatIndex !== -1 && args[formatIndex + 1]) {
    options.formats = args[formatIndex + 1].split(",");
  }

  const generator = new DocumentationGenerator(options);
  generator.generate().catch(console.error);
}

module.exports = {
  DocumentationGenerator,
};
