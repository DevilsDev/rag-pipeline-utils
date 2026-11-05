"use strict";

// Live API tests (npm run test:live). Unlike jest.config.js, no setup file
// blocks the network: these tests call real APIs with a key from
// __tests__/live/live-env.js, and are skipped without one.
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/__tests__/live/**/*.live.test.js"],
  // Logs every Claude call's usage (no content) for the usage report
  setupFiles: ["<rootDir>/__tests__/live/usage-ledger.js"],
  transform: { "^.+\\.js$": "babel-jest" },
  modulePathIgnorePatterns: ["<rootDir>/.claude/", "<rootDir>/packages/"],
};
