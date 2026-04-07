/**
 * Project Setup Step
 * Handles project metadata configuration in the interactive wizard
 */

const path = require("path");

/**
 * Run the project setup step
 * @param {object} config - Current wizard configuration state
 * @param {object} inquirer - Inquirer instance for prompting
 * @returns {Promise<object>} Updated configuration state
 */
async function setupProject(config, inquirer) {
  console.log("📋 Project Setup\n");
  // eslint-disable-line no-console

  const answers = await inquirer.prompt([
    {
      _type: "input",
      name: "name",
      message: "Project name:",
      default: path.basename(process.cwd()),
      validate: (input) => input.length > 0 || "Project name is required",
    },
    {
      _type: "input",
      name: "description",
      message: "Project description:",
      default: "A RAG pipeline project",
    },
    {
      _type: "input",
      name: "author",
      message: "Author:",
      default: "Unknown",
    },
    {
      _type: "list",
      name: "environment",
      message: "Target environment:",
      choices: [
        { name: "Development", value: "development" },
        { name: "Production", value: "production" },
        { name: "Testing", value: "testing" },
      ],
      default: "development",
    },
  ]);

  config.metadata = {
    name: answers.name,
    version: "1.0.0",
    description: answers.description,
    author: answers.author,
    environment: answers.environment,
    createdAt: new Date().toISOString(),
  };

  console.log(`\n✅ Project "${answers.name}" configured\n`);
  // eslint-disable-line no-console

  return config;
}

module.exports = { setupProject };
