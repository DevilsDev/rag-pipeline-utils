#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const REQUIRED = [
  path.join(ROOT, "__tests__"),
  path.join(ROOT, "package.json"),
];

function ok(msg) {
  console.log("[OK]", msg);
}
function err(msg) {
  console.error("[ERR]", msg);
}

(async () => {
  try {
    ok("Test setup starting...");
    for (const p of REQUIRED) {
      if (!fs.existsSync(p)) throw new Error(`Required path missing: ${p}`);
    }
    ok("All fixture files are present.");
    ok("Test setup completed successfully.");
    process.exit(0);
  } catch (e) {
    err(`Test setup failed: ${e.message}`);
    process.exit(1);
  }
})();
