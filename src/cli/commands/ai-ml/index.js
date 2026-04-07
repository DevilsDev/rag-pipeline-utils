/**
 * AI/ML domain module barrel export
 */

const trainingCommands = require("./training-commands");
const adaptiveCommands = require("./adaptive-commands");
const multimodalCommands = require("./multimodal-commands");
const federatedCommands = require("./federated-commands");
const shared = require("./shared");

module.exports = {
  trainingCommands,
  adaptiveCommands,
  multimodalCommands,
  federatedCommands,
  shared,
};
