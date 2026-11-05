"use strict";

// Live API tests (npm run test:live). Unlike jest.config.js, no setup file
// blocks the network: these tests call real APIs with a key from
// __tests__/live/live-env.js, and are skipped without one.
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/__tests__/live/**/*.live.test.js"],
  transform: { "^.+\\.js$": "babel-jest" },
  modulePathIgnorePatterns: ["<rootDir>/.claude/", "<rootDir>/packages/"],
};
