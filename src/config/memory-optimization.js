"use strict";

/**
 * Memory Optimization Configuration Profiles
 *
 * Provides pre-configured profiles for different use cases,
 * from minimal overhead monitoring to comprehensive production debugging.
 *
 * @module config/memory-optimization
 * @since 2.3.0
 */

/**
 * Light Profile
 *
 * Minimal overhead monitoring for development and testing.
 * Focuses on basic memory tracking with infrequent sampling.
 *
 * Use when:
 * - Running in development environment
 * - Performance is critical
 * - Basic memory awareness is sufficient
 */
const LIGHT_PROFILE = {
  // Memory limits
  maxMemoryMB: 512,

  // Sampling intervals (infrequent for low overhead)
  samplingInterval: 5000, // 5 seconds
  snapshotInterval: 60000, // 1 minute

  // Thresholds (higher to avoid frequent alerts)
  warningThreshold: 0.8,
  criticalThreshold: 0.95,

  // History tracking (minimal)
  historySize: 50,

  // Features
  leakDetectionEnabled: false,
  gcHintsEnabled: false,
  autoGC: false,

  // Leak detection config (disabled but configured)
  leakThreshold: 10,
  leakRateThreshold: 0.1,

  // GC config (conservative)
  gcThreshold: 0.9,
  minGCInterval: 60000, // 1 minute

  // Backpressure (conservative)
  backpressure: {
    enabled: false,
    pauseThreshold: 0.85,
    resumeThreshold: 0.7,
    maxPauseDuration: 30000, // 30 seconds
  },
};

/**
 * Standard Profile (Default)
 *
 * Balanced monitoring suitable for most production workloads.
 * Provides good visibility with acceptable overhead.
 *
 * Use when:
 * - Running in production
 * - Need reliable memory monitoring
 * - Can tolerate <1% overhead
 * - Want leak detection and GC hints
 */
const STANDARD_PROFILE = {
  // Memory limits
  maxMemoryMB: 512,

  // Sampling intervals (balanced)
  samplingInterval: 1000, // 1 second
  snapshotInterval: 30000, // 30 seconds

  // Thresholds (standard)
  warningThreshold: 0.75,
  criticalThreshold: 0.9,

  // History tracking (good coverage)
  historySize: 100,

  // Features
  leakDetectionEnabled: true,
  gcHintsEnabled: true,
  autoGC: false,

  // Leak detection config
  leakThreshold: 5,
  leakRateThreshold: 0.05,

  // GC config
  gcThreshold: 0.85,
  minGCInterval: 30000, // 30 seconds

  // Backpressure
  backpressure: {
    enabled: true,
    pauseThreshold: 0.85,
    resumeThreshold: 0.7,
    maxPauseDuration: 10000, // 10 seconds
  },
};

/**
 * Heavy Profile
 *
 * Comprehensive monitoring for debugging and optimization.
 * High frequency sampling with all features enabled.
 *
 * Use when:
 * - Debugging memory issues
 * - Optimizing memory usage
 * - Need detailed memory analytics
 * - Overhead is acceptable (1-5%)
 * - Running performance testing
 */
const HEAVY_PROFILE = {
  // Memory limits
  maxMemoryMB: 512,

  // Sampling intervals (high frequency)
  samplingInterval: 200, // 200ms
  snapshotInterval: 10000, // 10 seconds

  // Thresholds (sensitive)
  warningThreshold: 0.7,
  criticalThreshold: 0.85,

  // History tracking (comprehensive)
  historySize: 200,

  // Features (all enabled)
  leakDetectionEnabled: true,
  gcHintsEnabled: true,
  autoGC: false, // Manual control preferred in debugging

  // Leak detection config (sensitive)
  leakThreshold: 3,
  leakRateThreshold: 0.03,

  // GC config (aggressive)
  gcThreshold: 0.8,
  minGCInterval: 15000, // 15 seconds

  // Backpressure (aggressive)
  backpressure: {
    enabled: true,
    pauseThreshold: 0.8,
    resumeThreshold: 0.65,
    maxPauseDuration: 5000, // 5 seconds
  },
};

/**
 * Custom Profile Template
 *
 * Starting point for custom configurations.
 * Copy and modify as needed for specific requirements.
 */
const CUSTOM_PROFILE_TEMPLATE = {
  // Memory limits
  maxMemoryMB: 512,

  // Sampling intervals
  samplingInterval: 1000,
  snapshotInterval: 30000,

  // Thresholds
  warningThreshold: 0.75,
  criticalThreshold: 0.9,

  // History tracking
  historySize: 100,

  // Features
  leakDetectionEnabled: true,
  gcHintsEnabled: true,
  autoGC: false,

  // Leak detection config
  leakThreshold: 5,
  leakRateThreshold: 0.05,

  // GC config
  gcThreshold: 0.85,
  minGCInterval: 30000,

  // Backpressure
  backpressure: {
    enabled: true,
    pauseThreshold: 0.85,
    resumeThreshold: 0.7,
    maxPauseDuration: 10000,
  },
};

/**
 * Profile Selection Guide
 *
 * Helps choose the right profile based on requirements.
 */
const PROFILE_GUIDE = {
  light: {
    overhead: "<0.5%",
    sampling: "Infrequent (5s)",
    features: "Basic",
    useCase: "Development, testing, performance-critical",
  },
  standard: {
    overhead: "<1%",
    sampling: "Regular (1s)",
    features: "Leak detection, GC hints",
    useCase: "Production, general monitoring",
  },
  heavy: {
    overhead: "1-5%",
    sampling: "High frequency (200ms)",
    features: "All features, detailed analytics",
    useCase: "Debugging, optimization, testing",
  },
};

/**
 * Environment-based profile selection
 *
 * Automatically selects appropriate profile based on NODE_ENV
 * and other environment variables.
 *
 * @returns {Object} Selected profile configuration
 */
function selectProfileByEnvironment() {
  const env = process.env.NODE_ENV || "development";
  const memoryProfile = process.env.MEMORY_PROFILE;

  // Explicit profile override
  if (memoryProfile) {
    switch (memoryProfile.toLowerCase()) {
      case "light":
        return LIGHT_PROFILE;
      case "heavy":
        return HEAVY_PROFILE;
      case "standard":
        return STANDARD_PROFILE;
      default:
        console.warn(
          `Unknown MEMORY_PROFILE: ${memoryProfile}, using STANDARD`,
        );
        return STANDARD_PROFILE;
    }
  }

  // Environment-based defaults
  switch (env) {
    case "production":
      return STANDARD_PROFILE;
    case "test":
      return LIGHT_PROFILE;
    case "development":
      return LIGHT_PROFILE;
    default:
      return STANDARD_PROFILE;
  }
}

/**
 * Merge custom configuration with profile
 *
 * Allows overriding specific settings while keeping profile defaults.
 *
 * @param {Object} profile - Base profile
 * @param {Object} overrides - Custom settings
 * @returns {Object} Merged configuration
 */
function mergeConfig(profile, overrides = {}) {
  return {
    ...profile,
    ...overrides,
    backpressure: {
      ...profile.backpressure,
      ...(overrides.backpressure || {}),
    },
  };
}

/**
 * Validate configuration
 *
 * Ensures configuration values are within acceptable ranges.
 *
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result with errors if any
 */
function validateConfig(config) {
  const errors = [];

  // Memory limits
  if (config.maxMemoryMB < 64) {
    errors.push("maxMemoryMB must be at least 64 MB");
  }

  // Sampling intervals
  if (config.samplingInterval < 50) {
    errors.push("samplingInterval must be at least 50ms");
  }
  if (config.snapshotInterval < config.samplingInterval) {
    errors.push("snapshotInterval must be >= samplingInterval");
  }

  // Thresholds
  if (config.warningThreshold >= config.criticalThreshold) {
    errors.push("warningThreshold must be < criticalThreshold");
  }
  if (config.warningThreshold < 0.5 || config.warningThreshold > 1.0) {
    errors.push("warningThreshold must be between 0.5 and 1.0");
  }

  // Leak detection
  if (config.leakThreshold < 2) {
    errors.push("leakThreshold must be at least 2");
  }
  if (config.leakRateThreshold < 0 || config.leakRateThreshold > 1) {
    errors.push("leakRateThreshold must be between 0 and 1");
  }

  // GC config
  if (config.gcThreshold < 0.5 || config.gcThreshold > 1.0) {
    errors.push("gcThreshold must be between 0.5 and 1.0");
  }
  if (config.minGCInterval < 5000) {
    errors.push("minGCInterval must be at least 5000ms");
  }

  // Backpressure
  if (config.backpressure) {
    if (
      config.backpressure.pauseThreshold <= config.backpressure.resumeThreshold
    ) {
      errors.push("pauseThreshold must be > resumeThreshold");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get recommended configuration based on workload characteristics
 *
 * @param {Object} workload - Workload characteristics
 * @returns {Object} Recommended configuration
 */
function getRecommendedConfig(workload = {}) {
  const {
    expectedMemoryMB = 512,
    streamingIntensive = false,
    longRunning = false,
    performanceCritical = false,
  } = workload;

  // Start with standard profile
  let config = { ...STANDARD_PROFILE };

  // Adjust memory limit
  config.maxMemoryMB = expectedMemoryMB;

  // Streaming intensive workloads need more frequent monitoring
  if (streamingIntensive) {
    config.samplingInterval = 500;
    config.backpressure.enabled = true;
    config.backpressure.pauseThreshold = 0.8;
  }

  // Long-running workloads need leak detection
  if (longRunning) {
    config.leakDetectionEnabled = true;
    config.leakThreshold = 5;
    config.historySize = 200;
  }

  // Performance critical workloads need minimal overhead
  if (performanceCritical) {
    config.samplingInterval = 5000;
    config.snapshotInterval = 60000;
    config.leakDetectionEnabled = false;
    config.historySize = 50;
  }

  return config;
}

module.exports = {
  // Profiles
  LIGHT_PROFILE,
  STANDARD_PROFILE,
  HEAVY_PROFILE,
  CUSTOM_PROFILE_TEMPLATE,

  // Profile metadata
  PROFILE_GUIDE,

  // Utilities
  selectProfileByEnvironment,
  mergeConfig,
  validateConfig,
  getRecommendedConfig,
};
