/**
 * eval-guardrails command handler
 * Runs injection and PII detectors over labelled cases (.jsonl or .json),
 * prints precision, recall and F1 per detector, and exits 1 when a
 * detector errors or a metric is below its --min.
 *
 * The built-in pattern detectors run unless --no-built-in; --detectors
 * loads more from a module that exports an array of detectors (or a
 * function returning one), as `module.exports`, `export default` or
 * `export const detectors`.
 */

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { readDataset } = require("./eval-handler.js");
const { reportCliError } = require("../shared/cli-errors.js");
const {
  evaluateDetectors,
  validateDetectorCases,
  detectorVerdict,
  renderDetectorReport,
} = require("../../guardrails/evaluate-detectors.js");
const {
  patternInjectionDetector,
  patternPIIDetector,
} = require("../../guardrails/detectors.js");

async function loadDetectors(file) {
  const mod = await import(pathToFileURL(path.resolve(file)).href);
  let exported = mod.detectors ?? mod.default ?? mod;
  if (exported && exported.detectors) exported = exported.detectors;
  if (typeof exported === "function") exported = await exported();
  if (!Array.isArray(exported)) {
    throw new Error(
      `${file} must export an array of detectors, or a function that returns one`,
    );
  }
  return exported;
}

const fixed = (v) => (typeof v === "number" ? v.toFixed(3) : "  -  ");

function printText(report, verdict, quiet) {
  if (!quiet) {
    console.log(
      `\n${report.cases.injection} injection case(s), ${report.cases.pii} PII case(s)\n`,
    );
    for (const [name, m] of Object.entries(report.detectors)) {
      console.log(
        `  ${name.padEnd(24)} P ${fixed(m.precision)}  R ${fixed(m.recall)}  F1 ${fixed(m.f1)}  (TP ${m.tp}, FP ${m.fp}, FN ${m.fn}, TN ${m.tn}${m.errors ? `, ${m.errors} errors` : ""})`,
      );
      if (m.spans) {
        console.log(
          `  ${"".padEnd(24)} spans: P ${fixed(m.spans.precision)} of ${m.spans.predicted} matches, R ${fixed(m.spans.recall)} of ${m.spans.gold} labelled`,
        );
      }
    }
  }
  if (verdict.passed) {
    console.log("\n✅ Guardrail evaluation passed");
  } else {
    console.log("\n❌ Guardrail evaluation failed");
    for (const reason of verdict.reasons) console.log(`  - ${reason}`);
  }
}

async function handleEvalGuardrails(globalOptions, casesPath, options = {}) {
  try {
    const cases = validateDetectorCases(readDataset(path.resolve(casesPath)));
    const detectors = [];
    if (options.builtIn !== false) {
      detectors.push(patternInjectionDetector(), patternPIIDetector());
    }
    if (options.detectors) {
      detectors.push(...(await loadDetectors(options.detectors)));
    }
    if (detectors.length === 0) {
      throw new Error("--no-built-in needs --detectors <module>");
    }

    if (globalOptions.dryRun) {
      console.log(
        `🧪 Dry run: would run ${detectors.map((d) => d.name).join(", ")} on ${cases.length} cases from ${casesPath}`,
      );
      return;
    }

    const report = await evaluateDetectors(cases, detectors, {
      concurrency: options.concurrency || 4,
      ...(options.covered && {
        coveredLabels: options.covered
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    const min = options.min || {};
    const verdict = detectorVerdict(report, min);

    if (options.output) {
      fs.writeFileSync(
        path.resolve(options.output),
        `${JSON.stringify(report, null, 2)}\n`,
      );
    }
    if (options.report) {
      const file = path.resolve(options.report);
      const format = /\.html?$/i.test(file) ? "html" : "markdown";
      fs.writeFileSync(file, renderDetectorReport(report, { format, min }));
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          { passed: verdict.passed, reasons: verdict.reasons, ...report },
          null,
          2,
        ),
      );
    } else {
      printText(report, verdict, Boolean(globalOptions.quiet));
      if (options.output) console.log(`Report saved to ${options.output}`);
      if (options.report) console.log(`Summary written to ${options.report}`);
    }
    if (!verdict.passed) process.exitCode = 1;
  } catch (error) {
    reportCliError("Guardrail evaluation failed", error, globalOptions);
  }
}

module.exports = { handleEvalGuardrails, loadDetectors };
