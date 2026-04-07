#!/usr/bin/env node

/**
 * ESM Build Verification Script
 * Validates that the ESM build output works correctly
 * and all exports are accessible via import syntax.
 */

import { createRequire } from "module";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load CJS source to get the authoritative list of exports
const cjsModule = require("../src/index.js");
const cjsExports = Object.keys(cjsModule);

// Dynamically import the ESM build
const esmModule = await import("../dist/index.mjs");
const esmExports = Object.keys(esmModule);

let errors = 0;

// Check every CJS export exists in ESM
for (const name of cjsExports) {
  if (!(name in esmModule)) {
    console.error(`MISSING in ESM: ${name}`);
    errors++;
  }
}

// Check types of key exports match
const classExports = [
  "JWTValidator",
  "PluginSandbox",
  "PluginSignatureVerifier",
  "BatchProcessor",
  "RateLimiter",
  "ConnectionPoolManager",
  "MultiModalProcessor",
  "AdaptiveRetrievalEngine",
  "FederatedLearningCoordinator",
  "ModelTrainingOrchestrator",
  "DAGEngine",
  "AuditLogger",
  "DataGovernance",
  "TenantManager",
  "ResourceMonitor",
  "SSOManager",
  "PluginHub",
  "PluginCertification",
  "PluginAnalyticsDashboard",
  "HotReloadManager",
  "DevServer",
];

for (const name of classExports) {
  if (name in esmModule && typeof esmModule[name] !== "function") {
    console.error(
      `TYPE MISMATCH: ${name} should be function/class, got ${typeof esmModule[name]}`
    );
    errors++;
  }
}

const functionExports = [
  "createRagPipeline",
  "loadConfig",
  "validateRagrc",
  "normalizeConfig",
  "createError",
  "wrapError",
  "retry",
  "withRetry",
  "evaluateRagDataset",
  "scoreAnswer",
  "computeBLEU",
  "computeROUGE",
  "validateInput",
  "createHotReloadManager",
  "createDevServer",
];

for (const name of functionExports) {
  if (name in esmModule && typeof esmModule[name] !== "function") {
    console.error(
      `TYPE MISMATCH: ${name} should be function, got ${typeof esmModule[name]}`
    );
    errors++;
  }
}

if (errors > 0) {
  console.error(`\nESM verification failed with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log(
    `ESM verification passed - ${cjsExports.length} CJS exports, ${esmExports.length} ESM exports.`
  );
}
