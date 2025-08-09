/**
 * Pipeline Factory (Compatibility Wrapper)
 * Provides backward compatibility for renamed create-pipeline.js
 */

const { createRagPipeline } = require('./create-pipeline.js');

module.exports = {
  createRagPipeline
};