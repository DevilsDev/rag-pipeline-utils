"use strict";

// Bug-hunt reproductions (npm run test:bug-hunt): failing tests that each
// reproduce a confirmed bug from benchmarks/fixtures/bug-hunt-findings.md,
// offline. They fail on purpose until the bug is fixed, so the default
// `npm test` (jest.config.js) excludes them.
const base = require("./jest.config.js");

module.exports = {
  ...base,
  testMatch: ["<rootDir>/__tests__/bug-hunt/**/*.test.js"],
  testPathIgnorePatterns: base.testPathIgnorePatterns.filter(
    (p) => p !== "/__tests__/bug-hunt/",
  ),
};
