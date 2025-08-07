/**
 * Version: 0.2.0
 * Path: /jest.config.js
 * Description: Jest configuration for CommonJS compatibility with AI/ML modules
 * Author: Ali Kahwaji
 */

// jest.config.js - CommonJS format for compatibility

module.exports = {
  fakeTimers: {
    enableGlobally: true,
    advanceTimers: true
  },
  // Disable transforms that break CommonJS module.exports
  transform: {
    // Only transform static assets, not JS files
    '\\.(png|jpg|jpeg|gif|eot|ttf|woff|woff2)$': 'jest-transform-stub'
  },
  // Ensure CommonJS modules are not transformed
  transformIgnorePatterns: [
    'node_modules/(?!(@devilsdev/rag-pipeline-utils)/)',
    'src/.*\\.js$' // Don't transform our source files
  ],
  verbose: true,
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: 'coverage',
  moduleFileExtensions: ['js', 'json'],
  testMatch: ['**/__tests__/**/*.test.js'],
  roots: ['<rootDir>/__tests__'],
  // Explicitly support CommonJS
  extensionsToTreatAsEsm: [],
  // Disable ESM loader that breaks CommonJS
  preset: null
};