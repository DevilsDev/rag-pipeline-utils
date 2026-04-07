/**
 * Certification Commands
 * Plugin certification and publisher verification operations
 */

const chalk = require("chalk");
const ora = require("ora");
const inquirer = require("inquirer");
const Table = require("cli-table3");

async function submitForCertification(certification, plugin, options) {
  try {
    const result = await certification.submitForCertification(
      plugin,
      options.level,
    );

    console.log(chalk.green("\n🏆 Certification submitted successfully!")); // eslint-disable-line no-console
    console.log(chalk.blue(`Certification ID: ${result.id}`)); // eslint-disable-line no-console
    console.log(chalk.blue(`Level: ${result.level}`)); // eslint-disable-line no-console
    console.log(chalk.blue(`Score: ${result.score}/100`)); // eslint-disable-line no-console
    console.log(chalk.blue(`Status: ${result.status || "Pending"}`)); // eslint-disable-line no-console

    if (result.estimatedCompletion) {
      console.log(
        chalk.blue(`Estimated completion: ${result.estimatedCompletion}`),
      ); // eslint-disable-line no-console
    }
  } catch (error) {
    console.error(
      chalk.red(`Certification submission failed: ${error.message}`),
    ); // eslint-disable-line no-console
    process.exit(1);
  }
}

async function verifyCertification(certification, plugin, certificationId) {
  const spinner = ora("Verifying certification...").start();

  try {
    const verification = await certification.verifyCertification(
      plugin,
      certificationId,
    );
    spinner.stop();

    if (verification.valid) {
      console.log(chalk.green("✅ Certification is valid!")); // eslint-disable-line no-console
      console.log(chalk.blue(`Plugin: ${plugin}`)); // eslint-disable-line no-console
      console.log(chalk.blue(`Level: ${verification.certification.level}`)); // eslint-disable-line no-console
      console.log(
        chalk.blue(
          `Expires: ${new Date(verification.expiresAt).toLocaleDateString()}`,
        ),
      ); // eslint-disable-line no-console
    } else {
      console.log(chalk.red("❌ Certification is invalid or expired")); // eslint-disable-line no-console
    }
  } catch (error) {
    spinner.stop();
    console.error(chalk.red(`Verification failed: ${error.message}`)); // eslint-disable-line no-console
    process.exit(1);
  }
}

async function showCertificationRequirements(certification, level) {
  const levels = level ? [level] : ["BASIC", "VERIFIED", "ENTERPRISE"];

  for (const certLevel of levels) {
    const requirements = certification.getCertificationRequirements(certLevel);

    if (!requirements) {
      console.log(chalk.red(`Unknown certification level: ${certLevel}`)); // eslint-disable-line no-console
      continue;
    }

    console.log(
      chalk.blue.bold(`\n${certLevel} Certification Requirements:\n`),
    ); // eslint-disable-line no-console

    console.log(chalk.green("Automated Checks:")); // eslint-disable-line no-console
    requirements.automated.forEach((check) => {
      console.log(chalk.gray(`  • ${check}`)); // eslint-disable-line no-console
    });

    if (requirements.manual.length > 0) {
      console.log(chalk.yellow("\nManual Review:")); // eslint-disable-line no-console
      requirements.manual.forEach((review) => {
        console.log(chalk.gray(`  • ${review}`)); // eslint-disable-line no-console
      });
    }

    if (requirements.audit.length > 0) {
      console.log(chalk.red("\nSecurity Audit:")); // eslint-disable-line no-console
      requirements.audit.forEach((audit) => {
        console.log(chalk.gray(`  • ${audit}`)); // eslint-disable-line no-console
      });
    }

    console.log(chalk.blue(`\nMinimum Score: ${requirements.minScore}/100`)); // eslint-disable-line no-console
    console.log(chalk.blue(`Validity Period: ${requirements.validityPeriod}`)); // eslint-disable-line no-console
  }
}

async function getPublisherStatus(certification, publisherId) {
  const spinner = ora("Checking publisher status...").start();

  try {
    const status = await certification.getPublisherStatus(publisherId || "me");
    spinner.stop();

    console.log(chalk.blue.bold("\nPublisher Status:\n")); // eslint-disable-line no-console

    const table = new Table({
      chars: {
        top: "",
        "top-mid": "",
        "top-left": "",
        "top-right": "",
        bottom: "",
        "bottom-mid": "",
        "bottom-left": "",
        "bottom-right": "",
        left: "",
        "left-mid": "",
        mid: "",
        "mid-mid": "",
        right: "",
        "right-mid": "",
        middle: " ",
      },
      style: { "padding-left": 0, "padding-right": 0 },
    });

    table.push(
      ["Verified:", status.verified ? chalk.green("Yes ✓") : chalk.gray("No")],
      ["Level:", status.level || chalk.gray("None")],
      ["Certified Plugins:", status.certifiedPlugins.toString()],
      ["Reputation:", status.reputation.toString()],
      ["Member Since:", new Date(status.joinedAt).toLocaleDateString()],
      ["Last Activity:", new Date(status.lastActivity).toLocaleDateString()],
    );

    console.log(table.toString()); // eslint-disable-line no-console

    if (status.badges && status.badges.length > 0) {
      console.log(chalk.blue("\nBadges:"), status.badges.join(", ")); // eslint-disable-line no-console
    }
  } catch (error) {
    spinner.stop();
    console.error(
      chalk.red(`Failed to get publisher status: ${error.message}`),
    ); // eslint-disable-line no-console
    process.exit(1);
  }
}

async function applyForPublisherVerification(certification) {
  console.log(chalk.blue("📝 Publisher Verification Application\n")); // eslint-disable-line no-console

  const answers = await inquirer.prompt([
    {
      _type: "input",
      name: "name",
      message: "Full name:",
      validate: (input) => input.length > 0,
    },
    {
      _type: "input",
      name: "email",
      message: "Email address:",
      validate: (input) => /\S+@\S+\.\S+/.test(input),
    },
    {
      _type: "input",
      name: "organization",
      message: "Organization (optional):",
    },
    {
      _type: "input",
      name: "website",
      message: "Website/Portfolio:",
    },
    {
      _type: "input",
      name: "github",
      message: "GitHub profile:",
    },
    {
      _type: "editor",
      name: "motivation",
      message: "Why do you want to become a verified publisher?",
    },
  ]);

  const spinner = ora("Submitting application...").start();

  try {
    const result = await certification.applyForPublisherVerification(answers);
    spinner.stop();

    console.log(chalk.green("\n✅ Application submitted successfully!")); // eslint-disable-line no-console
    console.log(chalk.blue(`Application ID: ${result.applicationId}`)); // eslint-disable-line no-console
    console.log(chalk.blue(`Status: ${result.status}`)); // eslint-disable-line no-console
    console.log(
      chalk.blue(`Estimated review time: ${result.estimatedReviewTime}`),
    ); // eslint-disable-line no-console
  } catch (error) {
    spinner.stop();
    console.error(chalk.red(`Application failed: ${error.message}`)); // eslint-disable-line no-console
    process.exit(1);
  }
}

module.exports = {
  submitForCertification,
  verifyCertification,
  showCertificationRequirements,
  getPublisherStatus,
  applyForPublisherVerification,
};
