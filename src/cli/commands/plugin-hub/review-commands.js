/**
 * Review Commands
 * Plugin rating and review operations
 */

const chalk = require("chalk");
const ora = require("ora");

async function ratePlugin(hub, plugin, rating, _options) {
  if (rating < 1 || rating > 5) {
    console.error(chalk.red("Rating must be between 1 and 5")); // eslint-disable-line no-console
    process.exit(1);
  }

  try {
    await hub.ratePlugin(plugin, rating, _options.review);

    const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
    console.log(chalk.green(`✅ Rated ${plugin}: ${stars}`)); // eslint-disable-line no-console

    if (_options.review) {
      console.log(chalk.blue("Review submitted successfully!")); // eslint-disable-line no-console
    }
  } catch (error) {
    console.error(chalk.red(`Rating failed: ${error.message}`)); // eslint-disable-line no-console
    process.exit(1);
  }
}

async function getPluginReviews(hub, plugin, _options) {
  const spinner = ora("Loading reviews...").start();

  try {
    const reviews = await hub.getPluginReviews(plugin, _options);
    spinner.stop();

    if (reviews.reviews.length === 0) {
      console.log(chalk.yellow("No reviews found for this plugin.")); // eslint-disable-line no-console
      return;
    }

    console.log(chalk.green(`Reviews for ${plugin}:\n`)); // eslint-disable-line no-console

    for (const review of reviews.reviews) {
      const stars = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
      const date = new Date(review.createdAt).toLocaleDateString();

      console.log(chalk.blue(`${stars} by ${review.author} on ${date}`)); // eslint-disable-line no-console

      if (review.review) {
        console.log(chalk.gray(`"${review.review}"`)); // eslint-disable-line no-console
      }

      if (review.helpful > 0) {
        console.log(chalk.green(`👍 ${review.helpful} found this helpful`)); // eslint-disable-line no-console
      }

      console.log(); // eslint-disable-line no-console
    }

    if (reviews.hasMore) {
      console.log(
        chalk.blue(
          `Showing ${reviews.reviews.length} of ${reviews.total} reviews.`,
        ),
      ); // eslint-disable-line no-console
    }
  } catch (error) {
    spinner.stop();
    console.error(chalk.red(`Failed to load reviews: ${error.message}`)); // eslint-disable-line no-console
    process.exit(1);
  }
}

module.exports = {
  ratePlugin,
  getPluginReviews,
};
