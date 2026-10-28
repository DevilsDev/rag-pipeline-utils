'use strict';

/**
 * Static security scan of a plugin's files. It reads source text only and
 * never executes plugin code. It finds capabilities a plugin uses (running
 * processes, evaluating strings as code, network and filesystem writes) so a
 * user can decide whether to trust it; it is not a sandbox or a malware
 * detector, and obfuscated code can evade it.
 */

const fs = require('fs');
const path = require('path');
const { relativeWithin } = require('./tar-extract');

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);

/** severity: high blocks installation unless explicitly allowed */
const RULES = [
  {
    id: 'eval',
    severity: 'high',
    pattern: /\beval\s*\(/,
    message: 'Evaluates strings as code (eval)',
  },
  {
    id: 'new-function',
    severity: 'high',
    pattern: /\bnew\s+Function\s*\(/,
    message: 'Evaluates strings as code (new Function)',
  },
  {
    id: 'child-process',
    severity: 'high',
    pattern: /(?:require\s*\(\s*|from\s+)['"](?:node:)?child_process['"]/,
    message: 'Runs external processes (child_process)',
  },
  {
    id: 'vm',
    severity: 'high',
    pattern: /(?:require\s*\(\s*|from\s+)['"](?:node:)?vm['"]/,
    message: 'Compiles code at runtime (vm)',
  },
  {
    id: 'process-binding',
    severity: 'high',
    pattern: /process\.binding\s*\(/,
    message: 'Uses internal Node bindings (process.binding)',
  },
  {
    id: 'dynamic-require',
    severity: 'medium',
    pattern: /\brequire\s*\(\s*[^'"`\s)]/,
    message: 'Loads modules from a computed path',
  },
  {
    id: 'network',
    severity: 'medium',
    pattern:
      /(?:require\s*\(\s*|from\s+)['"](?:node:)?(?:http|https|net|tls|dgram)['"]|\bfetch\s*\(|['"]axios['"]/,
    message: 'Makes network requests',
  },
  {
    id: 'fs-write',
    severity: 'medium',
    pattern:
      /\b(?:writeFile|appendFile|unlink|rmdir|rm|rename|chmod|createWriteStream)(?:Sync)?\s*\(/,
    message: 'Writes, moves or deletes files',
  },
  {
    id: 'env',
    severity: 'low',
    pattern: /process\.env\b/,
    message: 'Reads environment variables (may include API keys)',
  },
];

function listFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name !== '.git') walk(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files;
}

/**
 * @param {string} pluginPath - Plugin directory or single .js file
 * @returns {{
 *   findings: Array<{severity: string, rule: string, message: string, file: string, line?: number}>,
 *   counts: {high: number, medium: number, low: number},
 *   filesScanned: number
 * }}
 */
function scanPlugin(pluginPath) {
  const root = path.resolve(pluginPath);
  const isDir = fs.statSync(root).isDirectory();
  const baseDir = isDir ? root : path.dirname(root);
  const files = isDir ? listFiles(root) : [root];
  const findings = [];
  let filesScanned = 0;

  const add = (finding) =>
    findings.push({
      ...finding,
      file:
        relativeWithin(baseDir, finding.file) || path.basename(finding.file),
    });

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.node') {
      add({
        severity: 'high',
        rule: 'native-addon',
        message: 'Contains a compiled native addon (.node)',
        file,
      });
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    if (fs.statSync(file).size > MAX_FILE_BYTES) {
      add({
        severity: 'medium',
        rule: 'large-file',
        message: 'Source file over 2 MB was not scanned',
        file,
      });
      continue;
    }
    filesScanned++;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const rule of RULES) {
      const index = lines.findIndex((line) => rule.pattern.test(line));
      if (index !== -1) {
        add({
          severity: rule.severity,
          rule: rule.id,
          message: rule.message,
          file,
          line: index + 1,
        });
      }
    }
  }

  const manifest = path.join(baseDir, 'package.json');
  if (isDir && fs.existsSync(manifest)) {
    try {
      const scripts =
        JSON.parse(fs.readFileSync(manifest, 'utf8')).scripts || {};
      for (const hook of ['preinstall', 'install', 'postinstall']) {
        if (scripts[hook]) {
          add({
            severity: 'medium',
            rule: 'install-script',
            message: `Declares a "${hook}" script (rag-pipeline never runs it)`,
            file: manifest,
          });
        }
      }
    } catch {
      add({
        severity: 'medium',
        rule: 'bad-manifest',
        message: 'package.json is not valid JSON',
        file: manifest,
      });
    }
  }

  const counts = { high: 0, medium: 0, low: 0 };
  for (const finding of findings) counts[finding.severity]++;
  return { findings, counts, filesScanned };
}

module.exports = { scanPlugin, RULES };
