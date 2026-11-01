'use strict';

/**
 * @devilsdev/rag-guardrails: prompt-injection detection and the pre-
 * retrieval, retrieval and post-generation guards.
 */

const { PreRetrievalGuard } = require('../guardrails/pre-retrieval-guard');
const { detectInjection } = require('../guardrails/injection-detector');
const { RetrievalGuard } = require('../guardrails/retrieval-guard');
const { PostGenerationGuard } = require('../guardrails/post-generation-guard');
const { GuardrailsPipeline } = require('../guardrails/guardrails-pipeline');

module.exports = {
  PreRetrievalGuard,
  detectInjection,
  RetrievalGuard,
  PostGenerationGuard,
  GuardrailsPipeline,
};
