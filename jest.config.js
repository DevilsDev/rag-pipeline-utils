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
      branches: 35,
      functions: 38,
      lines: 39,
      statements: 39,
    },
    "./src/security/": {
      branches: 58,
      functions: 52,
      lines: 59,
      statements: 58,
    },
    "./src/core/create-pipeline.js": {
      branches: 68,
      functions: 56,
      lines: 70,
      statements: 70,
    },
    "./src/dag/": {
      branches: 55,
      functions: 43,
      lines: 51,
      statements: 51,
    },
  },
};
