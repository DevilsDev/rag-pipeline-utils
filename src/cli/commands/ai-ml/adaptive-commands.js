/**
 * Adaptive retrieval CLI commands
 * Handles user profiles, adaptive search, and feedback processing
 */

const chalk = require("chalk");
const ora = require("ora");
const inquirer = require("inquirer");
const Table = require("cli-table3");

/**
 * Manage user profile (view or create)
 * @param {AdaptiveRetrievalEngine} adaptiveRetrieval - The adaptive retrieval engine instance
 * @param {string} userId - User ID
 * @param {object} _options - Command options
 */
async function manageUserProfile(adaptiveRetrieval, userId, _options) {
  const spinner = ora("Managing user profile...").start();

  try {
    let profile;

    try {
      profile = await adaptiveRetrieval.getUserProfile(userId);
      spinner.succeed("User profile found");
    } catch {
      // Profile doesn't exist, create new one
      const profileData = {};

      if (_options.interests) {
        profileData.interests = _options.interests
          .split(",")
          .map((i) => i.trim());
      }

      if (_options.expertise) {
        profileData.expertise = _options.expertise;
      }

      profile = await adaptiveRetrieval.initializeUserProfile(
        userId,
        profileData,
      );
      spinner.succeed("User profile created");
    }

    const table = new Table({
      head: ["Property", "Value"],
      colWidths: [20, 50],
    });

    table.push(
      ["User ID", profile.userId],
      ["Interests", profile.preferences?.interests?.join(", ") || "None"],
      ["Expertise", profile.preferences?.expertise || "Not set"],
      [
        "Learning History",
        `${profile.learningHistory?.length || 0} interactions`,
      ],
      ["Created", profile.createdAt || "Unknown"],
    );

    console.log(table.toString());
    // eslint-disable-line no-console
  } catch (error) {
    spinner.fail(`Profile management failed: ${error.message}`);
  }
}

/**
 * Perform adaptive search
 * @param {AdaptiveRetrievalEngine} adaptiveRetrieval - The adaptive retrieval engine instance
 * @param {string} userId - User ID
 * @param {string} query - Search query
 * @param {object} _options - Command options
 */
async function adaptiveSearch(adaptiveRetrieval, userId, query, _options) {
  const spinner = ora("Performing adaptive search...").start();

  try {
    const searchOptions = {
      maxResults: parseInt(_options.maxResults),
      explain: !!_options.explain,
    };

    const results = await adaptiveRetrieval.adaptiveRetrieve(
      userId,
      query,
      searchOptions,
    );

    spinner.succeed(`Found ${results.documents.length} results`);

    // Display results
    console.log(chalk.blue(`\nSearch Results for: "${query}"`));
    // eslint-disable-line no-console
    console.log(chalk.gray("=".repeat(50)));
    // eslint-disable-line no-console

    results.documents.forEach((doc, index) => {
      console.log(chalk.green(`\n${index + 1}. ${doc.title || doc.id}`));
      // eslint-disable-line no-console
      console.log(chalk.gray(`   Score: ${doc.score?.toFixed(4) || "N/A"}`));
      // eslint-disable-line no-console
      console.log(
        chalk.gray(
          `   Personalized Score: ${doc.personalizedScore?.toFixed(4) || "N/A"}`,
        ),
      );
      // eslint-disable-line no-console
      console.log(`   ${doc.content?.substring(0, 200)}...`);
      // eslint-disable-line no-console
    });

    if (_options.explain && results.adaptationMetadata) {
      console.log(chalk.blue("\nAdaptation Explanation:"));
      // eslint-disable-line no-console
      console.log(
        chalk.gray(JSON.stringify(results.adaptationMetadata, null, 2)),
      );
      // eslint-disable-line no-console
    }
  } catch (error) {
    spinner.fail(`Adaptive search failed: ${error.message}`);
  }
}

/**
 * Provide feedback for learning
 * @param {AdaptiveRetrievalEngine} adaptiveRetrieval - The adaptive retrieval engine instance
 * @param {string} userId - User ID
 * @param {object} _options - Command options
 */
async function provideFeedback(adaptiveRetrieval, userId, _options) {
  if (!_options.query) {
    const answers = await inquirer.prompt([
      {
        _type: "input",
        name: "query",
        message: "Enter the original query:",
      },
      {
        _type: "input",
        name: "ratings",
        message: "Enter ratings for results (comma-separated, 1-5):",
      },
    ]);
    _options.query = answers.query;
    _options.ratings = answers.ratings;
  }

  const spinner = ora("Processing feedback...").start();

  try {
    const ratings = _options.ratings.split(",").map((r) => parseInt(r.trim()));

    const feedback = {
      query: _options.query,
      ratings,
      clickedResults: [0], // Assume first result was clicked
      dwellTime: [120], // Assume 2 minutes dwell time
    };

    await adaptiveRetrieval.processFeedback(userId, feedback);

    spinner.succeed("Feedback processed successfully");
    console.log(chalk.green("\n✓ User profile updated with feedback"));
    // eslint-disable-line no-console
  } catch (error) {
    spinner.fail(`Feedback processing failed: ${error.message}`);
  }
}

module.exports = {
  manageUserProfile,
  adaptiveSearch,
  provideFeedback,
};
