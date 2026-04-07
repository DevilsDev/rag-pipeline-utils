/**
 * Multi-modal processing CLI commands
 * Handles content processing, multi-modal search, and content description
 */

const chalk = require("chalk");
const ora = require("ora");
const fs = require("fs").promises;
const { detectContentType } = require("./shared");

/**
 * Process multi-modal content
 * @param {MultiModalProcessor} multiModalProcessor - The multi-modal processor instance
 * @param {string} contentPath - Path to the content file
 * @param {object} _options - Command options
 */
async function processMultiModalContent(
  multiModalProcessor,
  contentPath,
  _options,
) {
  const spinner = ora("Processing multi-modal content...").start();

  try {
    if (!_options.tenant) {
      spinner.fail("Tenant ID is required");
      return;
    }

    // Read content file
    const stats = await fs.stat(contentPath);
    const content = {
      _type: detectContentType(contentPath),
      size: stats.size,
      path: contentPath,
    };

    // Add additional content based on type
    if (content._type.startsWith("text/")) {
      content.text = await fs.readFile(contentPath, "utf-8");
    }

    spinner.text = "Processing content...";
    const result = await multiModalProcessor.processContent(
      _options.tenant,
      content,
    );

    spinner.succeed("Content processed successfully");

    console.log(chalk.green("\n✓ Multi-modal processing completed"));
    // eslint-disable-line no-console
    console.log(chalk.blue(`Content ID: ${result.id}`));
    // eslint-disable-line no-console
    console.log(
      chalk.blue(
        `Modalities detected: ${Object.keys(result.modalities).join(", ")}`,
      ),
    );
    // eslint-disable-line no-console
    console.log(
      chalk.blue(`Processing time: ${result.metadata.processingTime}ms`),
    );
    // eslint-disable-line no-console

    if (_options.output) {
      await fs.writeFile(_options.output, JSON.stringify(result, null, 2));
      console.log(chalk.gray(`Results saved to: ${_options.output}`));
      // eslint-disable-line no-console
    }
  } catch (error) {
    spinner.fail(`Content processing failed: ${error.message}`);
  }
}

/**
 * Perform multi-modal search
 * @param {MultiModalProcessor} multiModalProcessor - The multi-modal processor instance
 * @param {string} tenantId - Tenant ID
 * @param {object} _options - Command options
 */
async function multiModalSearch(multiModalProcessor, tenantId, _options) {
  const spinner = ora("Performing multi-modal search...").start();

  try {
    const query = {};

    if (_options.query) {
      query.text = _options.query;
      query._type = "text";
    }

    if (_options.image) {
      query.image = await fs.readFile(_options.image);
      query._type = "image";
    }

    if (_options.audio) {
      query.audio = await fs.readFile(_options.audio);
      query._type = "audio";
    }

    if (Object.keys(query).length === 0) {
      spinner.fail("At least one query _type must be provided");
      return;
    }

    const searchOptions = {
      maxResults: parseInt(_options.maxResults),
    };

    const results = await multiModalProcessor.multiModalSearch(
      tenantId,
      query,
      searchOptions,
    );

    spinner.succeed(`Found ${results.results.length} results`);

    console.log(chalk.blue("\nMulti-modal Search Results:"));
    // eslint-disable-line no-console
    console.log(chalk.gray("=".repeat(50)));
    // eslint-disable-line no-console

    results.results.forEach((result, index) => {
      console.log(
        chalk.green(`\n${index + 1}. Content ID: ${result.contentId}`),
      );
      // eslint-disable-line no-console
      console.log(
        chalk.gray(
          `   Multi-modal Score: ${result.multiModalScore?.toFixed(4)}`,
        ),
      );
      // eslint-disable-line no-console
      console.log(
        chalk.gray(`   Modalities: ${result.modalities?.join(", ")}`),
      );
      // eslint-disable-line no-console
      console.log(chalk.gray(`   Rank: ${result.rank}`));
      // eslint-disable-line no-console
    });
  } catch (error) {
    spinner.fail(`Multi-modal search failed: ${error.message}`);
  }
}

/**
 * Generate content description
 * @param {MultiModalProcessor} multiModalProcessor - The multi-modal processor instance
 * @param {string} contentId - Content ID
 * @param {object} _options - Command options
 */
async function describeContent(multiModalProcessor, contentId, _options) {
  const spinner = ora("Generating content description...").start();

  try {
    const descriptions = await multiModalProcessor.generateContentDescription(
      contentId,
      {
        detailed: !!_options.detailed,
      },
    );

    spinner.succeed("Description generated");

    console.log(chalk.blue("\nContent Descriptions:"));
    // eslint-disable-line no-console
    console.log(chalk.gray("=".repeat(50)));
    // eslint-disable-line no-console

    for (const [modality, description] of Object.entries(descriptions)) {
      console.log(chalk.green(`\n${modality.toUpperCase()}:`));
      // eslint-disable-line no-console
      console.log(description);
      // eslint-disable-line no-console
    }
  } catch (error) {
    spinner.fail(`Description generation failed: ${error.message}`);
  }
}

module.exports = {
  processMultiModalContent,
  multiModalSearch,
  describeContent,
};
