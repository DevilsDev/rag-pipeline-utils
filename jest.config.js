/**
 * Version: 0.1.0
 * Path: /jest.config.js
 * Description: Jest configuration for native ESM test support
 * Author: Ali Kahwaji
 */

// jest.config.js

export default {
  verbose: true,
  testEnvironment: 'node',
  transform: {},
  collectCoverage: true,
  coverageDirectory: 'coverage',
  moduleFileExtensions: ['js', 'json'],
  testMatch: ['**/__tests__/**/*.test.js'],
  roots: ['<rootDir>/__tests__'],
};

  