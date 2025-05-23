/**
 * Version: 0.1.0
 * Path: /jest.config.js
 * Description: Jest configuration for native ESM test support
 * Author: Ali Kahwaji
 */

// jest.config.js

export default {
  transform: {
    '^.+\\.[t|j]sx?$': 'babel-jest', // Existing transform for JS files
    '\\.(png|jpg|jpeg|gif|eot|ttf|woff|woff2)$': 'jest-transform-stub', // this for static files
  },
  verbose: true,
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: 'coverage',
  moduleFileExtensions: ['js', 'json'],
  testMatch: ['**/__tests__/**/*.test.js'],
  roots: ['<rootDir>/__tests__'],
};

  