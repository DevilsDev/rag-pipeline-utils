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

cli.run(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
