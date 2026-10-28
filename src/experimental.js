'use strict';

/**
 * @devilsdev/rag-pipeline-utils/experimental
 *
 * Modules that are simulated, incomplete or not safe for production. They
 * are kept for experimentation and are NOT covered by the semver guarantees
 * in SEMVER.md. See docs-site/docs/Experimental.md for what each one really
 * does. Do not use them for authentication, tenant isolation, compliance or
 * plugin isolation.
 *
 * - Model training / federated learning: metrics and weights are random.
 * - MultiModalProcessor: returns random embeddings; only stores content.
 * - AdaptiveRetrievalEngine: in-memory placeholder strategy.
 * - SSO providers: OAuth2/OIDC/AD accept any code when NODE_ENV is not
 *   "production"; SAML assertions are not verified; OIDC id_tokens are not
 *   validated.
 * - TenantManager / ResourceMonitor: usage figures are random.
 * - DataGovernanceManager: random classification; erasure deletes nothing.
 * - PluginSandbox: execute() is not functional; plugins are not isolated.
 * - PluginCertification: automated checks return fixed scores (use
 *   `rag-pipeline hub certify check` for computed scores).
 */

const { MultiModalProcessor } = require('./ai/multimodal');
const { AdaptiveRetrievalEngine } = require('./ai/retrieval-engine');
const {
  FederatedLearningCoordinator,
} = require('./ai/federation/federated-learning-coordinator');
const {
  ModelTrainingOrchestrator,
} = require('./ai/training/model-training-orchestrator');
const { DataGovernanceManager } = require('./enterprise/data-governance');
const {
  TenantManager,
  ResourceMonitor,
} = require('./enterprise/multi-tenancy');
const {
  SSOManager,
  SAMLProvider,
  OAuth2Provider,
  ActiveDirectoryProvider,
  OIDCProvider,
} = require('./enterprise/sso-integration');
const { PluginSandbox } = require('./security/plugin-sandbox');
const { PluginCertification } = require('./ecosystem/plugin-certification');

module.exports = {
  // AI/ML
  MultiModalProcessor,
  AdaptiveRetrievalEngine,
  FederatedLearningCoordinator,
  ModelTrainingOrchestrator,

  // Enterprise
  DataGovernanceManager,
  DataGovernance: DataGovernanceManager,
  TenantManager,
  ResourceMonitor,
  SSOManager,
  SAMLProvider,
  OAuth2Provider,
  ActiveDirectoryProvider,
  OIDCProvider,

  // Security / ecosystem
  PluginSandbox,
  PluginCertification,
};
