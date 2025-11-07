"use strict";
module.exports = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testMatch: ["**/__tests__/**/*.@(test|spec).js"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/__tests__/fixtures/",
    "/__tests__/__temp__/",
    "/__tests__/utils/",
    "/__tests__/mocks/",
    "/__tests__/e2e/_debug-open-handles.js",
  ],
  // transform ESM deps like inquirer to CJS so require() won't crash
  transform: { "^.+\\.js$": "babel-jest" },
  transformIgnorePatterns: ["node_modules/(?!(inquirer)/)"],
  // Coverage configuration
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/**/*.test.js",
    "!src/**/*.spec.js",
    "!**/node_modules/**",
    "!**/__tests__/**",
  ],
  coverageReporters: ["text", "lcov", "html"],
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: {
      branches: 39,
      functions: 40,
      lines: 40,
      statements: 40,
    },
  },
};
