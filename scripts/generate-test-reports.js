#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

try {
  const outDir = path.join(process.cwd(), ".artifacts");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const reportPath = path.join(outDir, "test-report.json");
  const payload = {
    generatedAt: new Date().toISOString(),
    note: "Placeholder report for CI; replace with real aggregation later.",
  };
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
  console.log("[OK] Wrote", reportPath);
  process.exit(0);
} catch (e) {
  console.error("[ERR] generate-test-reports failed:", e.message);
  // Do not fail CI for reporting hiccups:
  process.exit(0);
}
