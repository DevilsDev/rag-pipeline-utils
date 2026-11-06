#!/usr/bin/env node
"use strict";
// The published package runs the bundled CLI (dist/cli.cjs, built by
// `npm run build`). A development checkout without a build runs src/.
const fs = require("fs");
const path = require("path");

const bundled = path.join(__dirname, "..", "dist", "cli.cjs");
const cli = fs.existsSync(bundled)
  ? require(bundled)
  : require("../src/cli.js");

// An error no command handled: one line, the stack only with --verbose.
cli.run(process.argv).catch((err) => {
  if (!cli.describeCliError) {
    console.error(err);
  } else {
    console.error(`❌ ${cli.describeCliError(err)}`);
    if (process.argv.includes("--verbose") && err && err.stack) {
      console.error(cli.redactCliText(err.stack));
    }
  }
  process.exit(1);
});
