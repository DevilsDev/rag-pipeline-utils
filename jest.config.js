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
      branches: 33,
      functions: 36,
      lines: 37,
      statements: 37,
    },
    "./src/security/": {
      branches: 58,
      functions: 52,
      lines: 59,
      statements: 58,
    },
    "./src/core/create-pipeline.js": {
      branches: 60,
      functions: 54,
      lines: 67,
      statements: 67,
    },
    "./src/dag/": {
      branches: 55,
      functions: 43,
      lines: 51,
      statements: 51,
    },
  },
};
