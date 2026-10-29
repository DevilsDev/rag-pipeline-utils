/**
 * Eval command handler
 * Runs an evaluation dataset through the configured pipeline, prints the
 * scores and exits 1 when the run fails: a case errors, a metric is below
 * its --min, or the run regressed from the --baseline report.
 *
 * Options: --baseline <report.json>, --output <report.json>, --report
 * <file.html|file.md>, --min <metric=value> (repeatable), --tolerance,
 * --case-tolerance, --concurrency, --timeout, --top-k, --json.
 */

const fs = require("fs");
const path = require("path");
const { loadCliConfig } = require("../shared/config-context.js");
const { createPipeline } = require("../services/rag-service.js");
const { validateDataset } = require("../../evaluate/dataset.js");
const {
  runEvaluation,
  compareConfigurations,
  EVALUATION_METRICS,
} = require("../../evaluate/compare.js");
const {
  evaluationVerdict,
  renderEvaluationReport,
} = require("../../evaluate/report.js");

/** Reads a dataset from .json (array or { cases }) or .jsonl (a case per line). */
function readDataset(file) {
  const text = fs.readFileSync(file, "utf8");
  if (/\.jsonl$/i.test(file)) {
    return text
      .split(/\r?\n/)
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => line.length > 0)
      .map(({ line, n }) => {
        try {
          return JSON.parse(line);
        } catch (err) {
          throw new Error(`${file}:${n}: not valid JSON (${err.message})`);
        }
      });
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${file}: not valid JSON (${err.message})`);
  }
}

function printText({ report, comparison, verdict, quiet }) {
  const { summary } = report;
  if (!quiet) {
    console.log(
      `\n${summary.cases} case${summary.cases === 1 ? "" : "s"}, ${summary.failed} failed`,
    );
    const names = EVALUATION_METRICS.filter((m) => summary.metrics[m]);
    if (names.length > 0) {
      console.log("");
      for (const name of names) {
        const mean = summary.metrics[name].mean.toFixed(3);
        const cmp = comparison && comparison.metrics[name];
        const change = cmp
          ? `  (baseline ${cmp.baseline.toFixed(3)}, ${cmp.delta >= 0 ? "+" : ""}${cmp.delta.toFixed(3)}${cmp.regressed ? ", regressed" : ""})`
          : "";
        console.log(`  ${name.padEnd(17)} ${mean}${change}`);
      }
    }
    const failed = report.cases.filter((c) => !c.success);
    for (const c of failed.slice(0, 10)) {
      console.log(`\n  ✗ ${c.id}: ${c.error}`);
    }
    if (comparison) {
      const worse = comparison.regressions.filter((r) => r.metric);
      if (worse.length > 0) {
        console.log("\nCases that got worse:");
        for (const r of worse.slice(0, 10)) {
          console.log(
            `  ${r.id}: ${r.metric} ${r.baseline.toFixed(3)} -> ${r.candidate.toFixed(3)}`,
          );
        }
        if (worse.length > 10)
          console.log(`  ...and ${worse.length - 10} more`);
      }
      for (const w of comparison.warnings) console.log(`  ! ${w}`);
    }
  }
  if (verdict.passed) {
    console.log("\n✅ Evaluation passed");
  } else {
    console.log("\n❌ Evaluation failed");
    for (const reason of verdict.reasons) console.log(`  - ${reason}`);
  }
}

async function handleEval(globalOptions, datasetPath, options = {}) {
  try {
    const datasetFile = path.resolve(datasetPath);
    const dataset = readDataset(datasetFile);
    const checked = validateDataset(dataset);
    for (const w of checked.warnings) console.warn(`! ${w.message}`);
    if (!checked.valid) {
      console.error(`❌ Invalid dataset ${datasetPath}:`);
      for (const e of checked.errors) console.error(`  - ${e.message}`);
      process.exitCode = 1;
      return;
    }

    let baseline;
    if (options.baseline) {
      baseline = JSON.parse(
        fs.readFileSync(path.resolve(options.baseline), "utf8"),
      );
    }

    if (globalOptions.dryRun) {
      console.log(
        `🧪 Dry run: would evaluate ${checked.cases.length} cases from ${datasetPath}${baseline ? ` against ${options.baseline}` : ""}`,
      );
      return;
    }

    const { config, configDir } = loadCliConfig(globalOptions);
    const { pipeline } = createPipeline({ config, configDir });
    const quiet = Boolean(globalOptions.quiet) || Boolean(options.json);
    let done = 0;
    const report = await runEvaluation(checked.cases, pipeline, {
      concurrency: options.concurrency || 1,
      ...(options.timeout && { timeout: options.timeout }),
      runOptions: { topK: options.topK || 3 },
      onCase: () => {
        done += 1;
        if (!quiet && process.stderr.isTTY) {
          process.stderr.write(`\rEvaluating ${done}/${checked.cases.length}`);
        }
      },
    });
    if (!quiet && process.stderr.isTTY) process.stderr.write("\n");

    const comparison = baseline
      ? await compareConfigurations(null, {
          baseline,
          candidate: report,
          ...(options.tolerance !== undefined && {
            tolerance: options.tolerance,
          }),
          ...(options.caseTolerance !== undefined && {
            caseTolerance: options.caseTolerance,
          }),
        })
      : undefined;
    const min = options.min || {};
    const verdict = evaluationVerdict({ report, comparison, min });

    if (options.output) {
      fs.writeFileSync(
        path.resolve(options.output),
        `${JSON.stringify(report, null, 2)}\n`,
      );
    }
    if (options.report) {
      const file = path.resolve(options.report);
      const format = /\.html?$/i.test(file) ? "html" : "markdown";
      fs.writeFileSync(
        file,
        renderEvaluationReport({ report, comparison, min }, { format }),
      );
    }

    if (options.json) {
      const { baseline: _b, candidate: _c, ...rest } = comparison || {};
      console.log(
        JSON.stringify(
          {
            passed: verdict.passed,
            reasons: verdict.reasons,
            thresholds: verdict.thresholds,
            summary: report.summary,
            ...(comparison && { comparison: rest }),
          },
          null,
          2,
        ),
      );
    } else {
      printText({
        report,
        comparison,
        verdict,
        quiet: Boolean(globalOptions.quiet),
      });
      if (options.output) console.log(`Report saved to ${options.output}`);
      if (options.report) console.log(`Summary written to ${options.report}`);
    }
    if (!verdict.passed) process.exitCode = 1;
  } catch (error) {
    console.error(`❌ Evaluation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { handleEval, readDataset };
