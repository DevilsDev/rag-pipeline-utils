'use strict';

const { STAGE_CONTRACTS } = require('./stage-contracts');

/**
 * @typedef {Object} PluginValidationResult
 * @property {boolean} valid - True when there are no errors
 * @property {string[]} errors - Problems that stop the plugin from working
 * @property {string[]} warnings - Methods some commands need, e.g. `store`
 *   for `rag-pipeline ingest`
 */

/**
 * Checks that an object can be used as a pipeline stage, without throwing,
 * so plugin authors can assert on it in their own tests.
 *
 * By default it checks what createRagPipeline() calls. With
 * `{ registry: true }` it also applies the rules pluginRegistry.register()
 * enforces: `metadata` with a string `name` and `version` and a `type`
 * equal to the stage, plus the methods in the stage's contract.
 *
 * @example
 * const { validatePlugin } = require('@devilsdev/rag-pipeline-utils');
 * const result = validatePlugin('llm', myLlm, { registry: true });
 * expect(result.errors).toEqual([]);
 *
 * @param {'loader'|'embedder'|'retriever'|'reranker'|'llm'} stage
 * @param {object} plugin - Plugin instance or object
 * @param {Object} [options]
 * @param {boolean} [options.registry=false] - Also check registry rules
 * @returns {PluginValidationResult}
 */
function validatePlugin(stage, plugin, options = {}) {
  const contract = STAGE_CONTRACTS[stage];
  if (!contract) {
    return {
      valid: false,
      errors: [
        `Unknown stage "${stage}". Expected one of: ${Object.keys(STAGE_CONTRACTS).join(', ')}`,
      ],
      warnings: [],
    };
  }

  if (
    plugin === null ||
    (typeof plugin !== 'object' && typeof plugin !== 'function')
  ) {
    return {
      valid: false,
      errors: [`A ${stage} plugin must be an object or class instance`],
      warnings: [],
    };
  }

  const has = (method) => typeof plugin[method] === 'function';
  const errors = [];
  const warnings = [];

  if (!contract.anyOf.some(has)) {
    errors.push(
      `A ${stage} needs ${contract.anyOf.map((m) => `${m}()`).join(' or ')}`,
    );
  }
  for (const [method, why] of Object.entries(contract.recommended)) {
    if (!has(method)) warnings.push(`No ${method}() method: ${why}`);
  }

  if (options.registry) {
    // Reuse the registry's own check so the two cannot drift. It stops at
    // the first problem, so this reports one registry error at a time.
    // eslint-disable-next-line global-require
    const { PluginRegistry } = require('./plugin-registry');
    try {
      new PluginRegistry()._validatePluginContract(stage, plugin);
    } catch (error) {
      const message = `pluginRegistry.register(): ${error.message}`;
      if (!errors.includes(message)) errors.push(message);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = { validatePlugin };
