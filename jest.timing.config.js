"use strict";
// The timing-sensitive tests listed in jest.timing-tests.js, on their own:
// npm run test:timing (with --runInBand).
const base = require("./jest.config.js");
const timingTests = require("./jest.timing-tests.js");

module.exports = {
  ...base,
  testMatch: timingTests.map((file) => `<rootDir>/${file}`),
  testPathIgnorePatterns: base.testPathIgnorePatterns.filter(
    (pattern) => !base.timingTestPatterns.includes(pattern),
  ),
  coverageThreshold: undefined,
};
