/**
 * Config command handlers
 * Handles config show, set, and get commands
 */

const fs = require("fs/promises");
const { logger } = require("../../utils/logger.js");

/**
 * Handle config show command
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {object} options - Command-specific options
 */
async function handleConfigShow(globalOptions, options) {
  try {
    const config = JSON.parse(await fs.readFile(globalOptions.config, "utf-8"));

    let output = config;
    if (options.section) {
      const sections = options.section.split(".");
      for (const section of sections) {
        output = output[section];
        if (output === undefined) {
          console.log(`❌ Section not found: ${options.section}`);
          return;
        }
      }
    }

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    logger.error("❌ Failed to show configuration:", error.message);
    process.exit(1);
  }
}

/**
 * Handle config set command
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {string} key - Configuration key (dot notation)
 * @param {string} value - Configuration value
 */
async function handleConfigSet(globalOptions, key, value) {
  try {
    const config = JSON.parse(await fs.readFile(globalOptions.config, "utf-8"));

    // Parse value
    let parsedValue;
    try {
      parsedValue = JSON.parse(value);
    } catch (error) {
      parsedValue = value; // Keep as string
    }

    // Validate key segments against prototype pollution
    const keySegments = key.split(".");
    const forbidden = new Set(["__proto__", "constructor", "prototype"]);
    if (keySegments.some((k) => forbidden.has(k))) {
      logger.error("Invalid configuration key: contains restricted property");
      process.exit(1);
    }

    // Build a patch object from the key path, then merge via JSON round-trip
    // This avoids dynamic property assignment entirely (no prototype pollution risk)
    const patch = JSON.parse(
      keySegments.reduceRight(
        (val, seg) => JSON.stringify({ [seg]: JSON.parse(val) }),
        JSON.stringify(parsedValue),
      ),
    );

    // Shallow-merge at each level
    function safeMerge(target, source) {
      for (const k of Object.keys(source)) {
        if (
          source[k] &&
          typeof source[k] === "object" &&
          !Array.isArray(source[k]) &&
          target[k] &&
          typeof target[k] === "object"
        ) {
          safeMerge(target[k], source[k]);
        } else {
          target[k] = source[k];
        }
      }
    }
    safeMerge(config, patch);

    // Save configuration
    await fs.writeFile(globalOptions.config, JSON.stringify(config, null, 2));
    console.log("Configuration updated");
  } catch (error) {
    logger.error("Failed to set configuration:", error.message);
    process.exit(1);
  }
}

/**
 * Handle config get command
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {string} key - Configuration key (dot notation)
 */
async function handleConfigGet(globalOptions, key) {
  try {
    const config = JSON.parse(await fs.readFile(globalOptions.config, "utf-8"));

    const keys = key.split(".");
    let value = config;

    for (const k of keys) {
      value = value[k];
      if (value === undefined) {
        console.log("❌ Key not found");
        return;
      }
    }

    console.log(JSON.stringify(value, null, 2));
  } catch (error) {
    logger.error("❌ Failed to get configuration:", error.message);
    process.exit(1);
  }
}

module.exports = { handleConfigShow, handleConfigSet, handleConfigGet };
