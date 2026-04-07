/**
 * Federated learning CLI commands
 * Handles federation creation, joining, rounds, and statistics
 */

const chalk = require("chalk");
const ora = require("ora");
const Table = require("cli-table3");
const { colorizeStatus } = require("./shared");

/**
 * Create a federated learning session
 * @param {FederatedLearningCoordinator} federatedLearning - The federated learning coordinator instance
 * @param {object} _options - Command options
 */
async function createFederation(federatedLearning, _options) {
  const spinner = ora("Creating federated learning session...").start();

  try {
    if (!_options.tenant) {
      spinner.fail("Tenant ID is required");
      return;
    }

    const modelConfig = {
      _type: _options.modelType,
      architecture: _options.architecture,
    };

    const federationOptions = {
      minParticipants: parseInt(_options.minParticipants),
      maxParticipants: parseInt(_options.maxParticipants),
    };

    const federationId = await federatedLearning.createFederation(
      _options.tenant,
      modelConfig,
      federationOptions,
    );

    spinner.succeed("Federation created successfully");

    console.log(chalk.green("\n✓ Federated learning session created"));
    // eslint-disable-line no-console
    console.log(chalk.blue(`Federation ID: ${federationId}`));
    // eslint-disable-line no-console
    console.log(chalk.blue(`Model Type: ${_options.modelType}`));
    // eslint-disable-line no-console
    console.log(
      chalk.blue(
        `Min/Max Participants: ${_options.minParticipants}/${_options.maxParticipants}`,
      ),
    );
    // eslint-disable-line no-console
  } catch (error) {
    spinner.fail(`Federation creation failed: ${error.message}`);
  }
}

/**
 * Join a federated learning session
 * @param {FederatedLearningCoordinator} federatedLearning - The federated learning coordinator instance
 * @param {string} federationId - Federation ID
 * @param {object} _options - Command options
 */
async function joinFederation(federatedLearning, federationId, _options) {
  const spinner = ora("Joining federated learning session...").start();

  try {
    if (!_options.tenant) {
      spinner.fail("Tenant ID is required");
      return;
    }

    const participantInfo = {
      tenantId: _options.tenant,
      dataSize: parseInt(_options.dataSize) || 1000,
      computeCapacity: parseFloat(_options.computeCapacity) || 0.8,
      networkBandwidth: 100,
      privacyLevel: _options.privacyLevel,
    };

    const participantId = await federatedLearning.registerParticipant(
      federationId,
      participantInfo,
    );

    spinner.succeed("Successfully joined federation");

    console.log(chalk.green("\n✓ Joined federated learning session"));
    // eslint-disable-line no-console
    console.log(chalk.blue(`Participant ID: ${participantId}`));
    // eslint-disable-line no-console
    console.log(chalk.blue(`Federation ID: ${federationId}`));
    // eslint-disable-line no-console
  } catch (error) {
    spinner.fail(`Failed to join federation: ${error.message}`);
  }
}

/**
 * Start a federated learning round
 * @param {FederatedLearningCoordinator} federatedLearning - The federated learning coordinator instance
 * @param {string} federationId - Federation ID
 */
async function startFederatedRound(federatedLearning, federationId) {
  const spinner = ora("Starting federated learning round...").start();

  try {
    const result = await federatedLearning.startFederatedRound(federationId);

    spinner.succeed("Federated round completed");

    console.log(chalk.green("\n✓ Federated learning round completed"));
    // eslint-disable-line no-console
    console.log(chalk.blue(`Round: ${result.round}`));
    // eslint-disable-line no-console
    console.log(chalk.blue(`Participants: ${result.participants}`));
    // eslint-disable-line no-console
    console.log(
      chalk.blue(`Converged: ${result.convergence.converged ? "Yes" : "No"}`),
    );
    // eslint-disable-line no-console
    console.log(
      chalk.blue(
        `Global Accuracy: ${result.convergence.globalAccuracy?.toFixed(4)}`,
      ),
    );
    // eslint-disable-line no-console
  } catch (error) {
    spinner.fail(`Federated round failed: ${error.message}`);
  }
}

/**
 * Show federation statistics
 * @param {FederatedLearningCoordinator} federatedLearning - The federated learning coordinator instance
 * @param {string} federationId - Federation ID
 * @param {object} _options - Command options
 */
async function showFederationStats(federatedLearning, federationId, _options) {
  const spinner = ora("Fetching federation statistics...").start();

  try {
    const stats = await federatedLearning.getFederationStats(federationId);

    spinner.succeed("Statistics retrieved");

    const table = new Table({
      head: ["Property", "Value"],
      colWidths: [25, 40],
    });

    table.push(
      ["Federation ID", stats.federation.id],
      ["Status", colorizeStatus(stats.federation.status)],
      ["Current Round", stats.federation.currentRound],
      ["Total Participants", stats.federation.totalParticipants],
      ["Active Participants", stats.federation.activeParticipants],
      ["Model Type", stats.federation.modelType],
      [
        "Average Accuracy",
        stats.performance.averageAccuracy?.toFixed(4) || "N/A",
      ],
      ["Total Data Size", stats.performance.totalDataSize],
      [
        "Privacy Enabled",
        stats.privacy.differentialPrivacyEnabled ? "Yes" : "No",
      ],
    );

    console.log(table.toString());
    // eslint-disable-line no-console

    if (_options.detailed && stats.participants.length > 0) {
      console.log(chalk.blue("\nParticipant Details:"));
      // eslint-disable-line no-console

      const participantTable = new Table({
        head: ["Tenant ID", "Data Size", "Accuracy", "Rounds", "Status"],
        colWidths: [15, 12, 12, 8, 12],
      });

      stats.participants.forEach((participant) => {
        participantTable.push([
          participant.tenantId,
          participant.dataSize,
          participant.performance.accuracy?.toFixed(4) || "N/A",
          participant.performance.rounds,
          participant.status,
        ]);
      });

      console.log(participantTable.toString());
      // eslint-disable-line no-console
    }
  } catch (error) {
    spinner.fail(`Failed to get statistics: ${error.message}`);
  }
}

module.exports = {
  createFederation,
  joinFederation,
  startFederatedRound,
  showFederationStats,
};
