"use strict";

/**
 * @module templates/scaffold
 * @description Creates complete project directories from templates.
 */

const { EventEmitter } = require("events");
const fs = require("fs");
const path = require("path");
const { TemplateRegistry } = require("./template-registry");

/** @type {Object} Default configuration for the project scaffolder */
const DEFAULT_CONFIG = {
  installDependencies: false,
  overwrite: false,
};

/**
 * Creates complete project directories from registered templates.
 *
 * @extends EventEmitter
 * @fires ProjectScaffolder#created
 *
 * @example
 * const scaffolder = new ProjectScaffolder();
 * const result = scaffolder.create('document-qa', '/path/to/my-project');
 * console.log(result.files); // list of created files
 */
class ProjectScaffolder extends EventEmitter {
  /**
   * @param {Object} [options={}] - Scaffolder configuration
   * @param {boolean} [options.installDependencies=false] - Whether to auto-run npm install
   * @param {boolean} [options.overwrite=false] - Allow overwriting existing directories
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.registry = new TemplateRegistry();
  }

  /**
   * Create a new project from a template.
   *
   * @param {string} templateKey - Key of the template to use
   * @param {string} projectDir - Target directory for the new project
   * @param {Object} [options={}] - Per-call overrides
   * @param {boolean} [options.overwrite] - Override the instance-level overwrite setting
   * @returns {{projectDir: string, files: string[], template: string}} Creation result
   * @throws {Error} If template is not found or directory already exists
   */
  create(templateKey, projectDir, options = {}) {
    const template = this.registry.get(templateKey);
    if (!template) {
      throw new Error(`Unknown template: "${templateKey}"`);
    }

    const resolvedDir = path.resolve(projectDir);
    const allowOverwrite =
      options.overwrite !== undefined
        ? options.overwrite
        : this.config.overwrite;

    if (fs.existsSync(resolvedDir) && !allowOverwrite) {
      throw new Error(
        `Directory already exists: ${resolvedDir}. Use overwrite option to replace.`,
      );
    }

    fs.mkdirSync(resolvedDir, { recursive: true });

    const createdFiles = [];

    // Write package.json
    const projectName = path.basename(resolvedDir);
    const packageJson = {
      name: projectName,
      version: "1.0.0",
      description: template.description,
      main: "index.js",
      scripts: {
        start: "node index.js",
      },
      dependencies: template.dependencies || {},
      devDependencies: template.devDependencies || {},
    };

    const packageJsonPath = path.join(resolvedDir, "package.json");
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2) + "\n",
    );
    createdFiles.push("package.json");

    // Write template files
    const files = template.files || {};
    for (const [fileName, content] of Object.entries(files)) {
      const filePath = path.join(resolvedDir, fileName);
      const fileDir = path.dirname(filePath);

      if (fileDir !== resolvedDir) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      fs.writeFileSync(filePath, content + "\n");
      createdFiles.push(fileName);
    }

    // Write .ragrc.json from template config
    if (template.config) {
      const ragrcPath = path.join(resolvedDir, ".ragrc.json");
      fs.writeFileSync(
        ragrcPath,
        JSON.stringify(template.config, null, 2) + "\n",
      );
      createdFiles.push(".ragrc.json");
    }

    const result = {
      projectDir: resolvedDir,
      files: createdFiles,
      template: templateKey,
    };

    /**
     * @event ProjectScaffolder#created
     * @type {Object}
     * @property {string} projectDir - Absolute path to created project
     * @property {string[]} files - List of created file names
     * @property {string} template - Template key that was used
     */
    this.emit("created", result);

    return result;
  }

  /**
   * List all available templates.
   *
   * @returns {Array<{key: string, name: string, description: string}>} Available templates
   */
  listTemplates() {
    return this.registry.list();
  }
}

module.exports = { ProjectScaffolder, DEFAULT_CONFIG };
