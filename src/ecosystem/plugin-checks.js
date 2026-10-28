'use strict';

/**
 * Automated certification checks for a local plugin. Every score is computed
 * from the plugin's files: the stage contract (checked in a separate
 * process), the static security scan, tests and documentation. Nothing is
 * assumed; checks that cannot be computed score 0 with a reason.
 */

const fs = require('fs');
const path = require('path');
const { scanPlugin } = require('./plugin-scanner');
const { probeContract } = require('./plugin-probe');
const { relativeWithin } = require('./tar-extract');

/** Automated score needed for each level (manual review/audit are separate). */
const LEVELS = [
  {
    level: 'ENTERPRISE',
    score: 95,
    requires: 'manual review and security audit',
  },
  { level: 'VERIFIED', score: 80, requires: 'manual review' },
  { level: 'BASIC', score: 60, requires: null },
];

const TEST_FILE = /(^|[\\/])(__tests__|tests?)[\\/]|\.(test|spec)\.[cm]?js$/;

function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(relativeWithin(dir, full));
    }
  };
  walk(dir);
  return out;
}

function securityCheck(root) {
  const scan = scanPlugin(root);
  const { high, medium, low } = scan.counts;
  const score = Math.max(0, 100 - 40 * high - 10 * medium - 2 * low);
  return {
    id: 'security',
    label: 'Security scan',
    weight: 30,
    score,
    details: scan.findings.map(
      (f) =>
        `${f.severity}: ${f.message} (${f.file}${f.line ? `:${f.line}` : ''})`,
    ),
  };
}

function testsCheck(files, manifest) {
  const testFiles = files.filter((f) => TEST_FILE.test(f));
  const script = manifest.scripts?.test;
  const realScript = Boolean(script) && !/no test specified/.test(script);
  let score = 0;
  if (testFiles.length > 0) score = realScript ? 100 : 60;
  return {
    id: 'tests',
    label: 'Tests',
    weight: 15,
    score,
    details: [
      `${testFiles.length} test file(s)`,
      realScript
        ? `test script: ${script}`
        : 'no "test" script in package.json',
    ],
  };
}

function docsCheck(root, files, manifest) {
  const readme = files.find((f) => /^readme(\.md|\.txt)?$/i.test(f));
  const readmeLength = readme
    ? fs.readFileSync(path.join(root, readme), 'utf8').trim().length
    : 0;
  const parts = [
    [Boolean(readme), 50, readme ? `${readme} present` : 'no README'],
    [
      readmeLength >= 300,
      20,
      `README length ${readmeLength} chars (300+ expected)`,
    ],
    [
      Boolean(manifest.description),
      15,
      manifest.description
        ? 'package description present'
        : 'no package description',
    ],
    [
      Boolean(manifest.license),
      15,
      manifest.license ? `license: ${manifest.license}` : 'no license field',
    ],
  ];
  return {
    id: 'documentation',
    label: 'Documentation',
    weight: 20,
    score: parts.reduce((sum, [ok, points]) => sum + (ok ? points : 0), 0),
    details: parts.map(([ok, , text]) => `${ok ? 'ok' : 'missing'}: ${text}`),
  };
}

/**
 * @param {string} pluginPath - Plugin directory or single .js file
 * @param {object} options
 * @param {string} [options.stage] - Overrides package.json "ragPipeline.stage"
 * @returns {Promise<{plugin: string, stage: string, checks: object[], score: number, level: string|null, nextLevel: object|null}>}
 */
async function runPluginChecks(pluginPath, options = {}) {
  const absolute = path.resolve(pluginPath);
  if (!fs.existsSync(absolute))
    throw new Error(`Plugin not found: ${pluginPath}`);
  const isDir = fs.statSync(absolute).isDirectory();
  const root = isDir ? absolute : path.dirname(absolute);
  const manifestPath = path.join(root, 'package.json');
  const manifest =
    isDir && fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      : {};
  const stage = options.stage || manifest.ragPipeline?.stage;
  if (!stage) {
    throw new Error(
      'Unknown stage. Pass --stage or set "ragPipeline.stage" in package.json.',
    );
  }
  const entry = isDir
    ? path.resolve(root, manifest.main || 'index.js')
    : absolute;
  const files = isDir ? listFiles(root) : [path.basename(absolute)];

  const probe = await probeContract(entry, stage);
  const contract = {
    id: 'contract',
    label: `${stage} contract`,
    weight: 35,
    score: probe.ok ? 100 : 0,
    details: probe.ok
      ? [`methods: ${probe.methods.join(', ')}`]
      : [probe.error || `missing: ${probe.missing.join(', ')}`],
  };

  const checks = [
    contract,
    isDir ? securityCheck(root) : securityCheck(absolute),
    testsCheck(files, manifest),
    docsCheck(root, isDir ? files : [], manifest),
  ];
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const score = Math.round(
    checks.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight,
  );

  // A failed contract means the plugin cannot run, whatever else scores.
  const eligible =
    contract.score === 100 ? LEVELS.filter((l) => score >= l.score) : [];
  const best = eligible[0] || null;
  const nextLevel = [...LEVELS].reverse().find((l) => score < l.score) || null;

  return {
    plugin: manifest.name || path.basename(absolute),
    version: manifest.version || null,
    stage,
    checks,
    score,
    level: best ? best.level : null,
    pendingReview: best ? best.requires : null,
    nextLevel: nextLevel && { level: nextLevel.level, score: nextLevel.score },
  };
}

module.exports = { runPluginChecks, LEVELS };
