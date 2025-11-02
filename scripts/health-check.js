#!/usr/bin/env node
/* eslint-disable no-console */
const { sh } = require("./lib/sh.js");

try {
  sh("node", ["-v"], { throwOnError: false });
  console.log("[OK] Node available");
  process.exit(0);
} catch (e) {
  console.error("[ERR] Node not available:", e.message);
  process.exit(1);
}
