"use strict";
module.exports = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testMatch: ["**/__tests__/**/*.@(test|spec).js"],
  // worktree copies would otherwise collide in the module map
  modulePathIgnorePatterns: ["<rootDir>/.claude/", "<rootDir>/dist-packages/"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/__tests__/fixtures/",
    "/__tests__/__temp__/",
    "/__tests__/utils/",
    "/__tests__/mocks/",
    "/__tests__/e2e/_debug-open-handles.js",
    // git worktrees (e.g. agent checkouts) contain full copies of the tests
    "<rootDir>/.claude/",
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
  // Thresholds = Linux CI measurement minus a margin (Node 20, main @
  // run 40667154382: global 51.9 stmts / 48.1 branches / 47.0 funcs / 52.0
  // lines; create-pipeline.js 98.4 / 84.3 / 92.3 / 98.2). Margin is ~3 points
  // globally and ~5 on create-pipeline.js, which is being reworked. The
  // security and dag entries were already within ~3 points of measured.
  coverageThreshold: {
    global: {
      branches: 45,
      functions: 44,
      lines: 49,
      statements: 49,
    },
    "./src/security/": {
      branches: 58,
      functions: 52,
      lines: 59,
      statements: 58,
    },
    "./src/core/create-pipeline.js": {
      branches: 79,
      functions: 87,
      lines: 93,
      statements: 93,
    },
    "./src/dag/": {
      branches: 55,
      functions: 41,
      lines: 51,
      statements: 51,
    },
  },
};
