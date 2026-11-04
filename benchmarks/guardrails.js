#!/usr/bin/env node
/**
 * Guardrail benchmark: precision, recall and F1 for the built-in injection
 * and PII patterns, and optionally a prompt-injection classifier, on
 * public labelled sets (benchmarks/guard-datasets.js).
 *
 * The detectors are not tuned on these sets: the patterns are the ones
 * the library ships, and the classifier uses its default threshold of 0.5.
 * Every set is a held-out test split.
 *
 *   node benchmarks/guardrails.js [--model] [--data-dir=dir] [--output=file.json]
 *
 * --model adds protectai/deberta-v3-base-prompt-injection-v2 (needs
 * `npm install --no-save @huggingface/transformers`; downloads 738 MB).
 * Set TRANSFORMERS_LOCAL_MODELS to load it from a folder instead.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  patternInjectionDetector,
  patternPIIDetector,
} = require("../src/guardrails/detectors.js");
const {
  evaluateDetectors,
} = require("../src/guardrails/evaluate-detectors.js");
const { version } = require("../package.json");
const {
  loadDeepset,
  loadJailbreaks,
  loadGretel,
  loadRagFixtures,
  PATTERN_PII_COVERS,
} = require("./guard-datasets");

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v = "true"] = a.slice(2).split("=");
      return [k, v];
    }),
);

function environment() {
  let commit = null;
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: path.join(__dirname, ".."),
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    // not a git checkout
  }
  return {
    libraryVersion: version,
    commit,
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    runner: process.env.GITHUB_ACTIONS
      ? `GitHub Actions ${process.env.RUNNER_OS || ""}`.trim()
      : "local",
  };
}

async function main() {
  const dir = args["data-dir"];
  const [deepset, jailbreaks, gretel] = await Promise.all([
    loadDeepset(dir),
    loadJailbreaks(dir),
    loadGretel(dir),
  ]);
  const fixtures = loadRagFixtures();

  const pattern = patternInjectionDetector();
  const injection = [pattern];
  let model = null;
  if (args.model) {
    // eslint-disable-next-line global-require
    const { createInjectionClassifier } = require("./injection-classifier");
    const classifier = await createInjectionClassifier({
      localModelPath: process.env.TRANSFORMERS_LOCAL_MODELS,
    });
    model = classifier.info;
    injection.push(classifier);
  }

  const suites = {
    injection: {
      title: "Prompt injection",
      ...deepset,
      detectors: injection,
    },
    jailbreak: {
      title: "Jailbreak prompts",
      note: "A jailbreak is a role-play prompt that talks a model out of its rules, which is a different task from injection. The classifier is not run here: jackhhao/jailbreak-classification is in its training data, and its model card says it does not detect jailbreaks.",
      ...jailbreaks,
      detectors: [pattern],
    },
    ragAttacks: {
      title: "RAG attacks (project fixtures)",
      ...fixtures,
      detectors: injection,
    },
    pii: {
      title: "PII in documents",
      note: `Spans match when they overlap. Precision counts a match as correct when it overlaps a labelled span of any label. Headline recall counts the labels the patterns are meant to find: ${Object.entries(
        PATTERN_PII_COVERS,
      )
        .map(([gold, ours]) => `${gold} (${ours})`)
        .join(
          ", ",
        )}. Gretel does not label every occurrence (an email repeated in a mailto: link, for one), so span precision is a lower bound; the misses also include digit runs in EDI and SWIFT messages that the phone and card patterns match.`,
      ...gretel,
      detectors: [patternPIIDetector()],
      coveredLabels: Object.keys(PATTERN_PII_COVERS),
    },
  };

  const report = {
    benchmark: "guardrails",
    createdAt: new Date().toISOString(),
    environment: environment(),
    ...(model && { model }),
    suites: {},
  };
  for (const [key, s] of Object.entries(suites)) {
    const result = await evaluateDetectors(s.cases, s.detectors, {
      concurrency: 1,
      ...(s.coveredLabels && { coveredLabels: s.coveredLabels }),
    });
    report.suites[key] = {
      title: s.title,
      source: s.source,
      ...(s.note && { note: s.note }),
      cases: s.cases.length,
      positives: s.cases.filter((c) => (c.spans ? c.spans.length : c.flagged))
        .length,
      detectors: result.detectors,
    };
    for (const [name, m] of Object.entries(result.detectors)) {
      console.log(
        `${s.title.padEnd(32)} ${name.padEnd(20)} P ${m.precision}  R ${m.recall}  F1 ${m.f1}  (TP ${m.tp} FP ${m.fp} FN ${m.fn} TN ${m.tn})` +
          (m.spans ? `  spans P ${m.spans.precision} R ${m.spans.recall}` : ""),
      );
    }
  }

  if (args.output) {
    fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
    fs.writeFileSync(args.output, JSON.stringify(report, null, 2) + "\n");
    console.log(`Report written to ${args.output}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
