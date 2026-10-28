'use strict';

/**
 * Check that a plugin module exposes the methods its stage requires
 * (contracts/<stage>-contract.json). Loading a module runs its code, so the
 * check happens in a separate Node process with a timeout; this keeps the
 * calling process clean but is NOT a security sandbox.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const STAGE_METHODS = {
  loader: ['load'],
  embedder: ['embed'],
  retriever: ['store', 'retrieve'],
  llm: ['generate'],
  reranker: ['rerank'],
};

// Runs in the child: load the module the way buildComponents() does and
// report which methods the resulting object has.
const MARKER = '@@rag-probe@@';
const PROBE_SCRIPT = `
const MARKER = '${MARKER}';
const mod = require(process.argv[1]);
const exported = mod && mod.default ? mod.default : mod;
let instance = exported;
if (typeof exported === 'function') {
  instance = /^class\\s/.test(Function.prototype.toString.call(exported))
    ? new exported({})
    : exported({});
}
const methods = [];
for (let o = instance; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
  for (const key of Object.getOwnPropertyNames(o)) {
    try { if (key !== 'constructor' && typeof instance[key] === 'function') methods.push(key); } catch {}
  }
}
process.stdout.write(MARKER + JSON.stringify({ type: typeof instance, methods: [...new Set(methods)] }));
`;

/** The "Error: ..." line of a Node stack trace, else the first line. */
function firstErrorLine(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    lines.find((line) => /^\w*Error\b/.test(line)) ||
    lines[0] ||
    'unknown error'
  );
}

/**
 * @param {string} modulePath - Plugin entry file
 * @param {string} stage - loader | embedder | retriever | llm | reranker
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<{ok: boolean, missing: string[], methods: string[], error?: string}>}
 */
function probeContract(modulePath, stage, options = {}) {
  const required = STAGE_METHODS[stage];
  if (!required) {
    return Promise.reject(
      new Error(
        `Unknown stage "${stage}". Expected: ${Object.keys(STAGE_METHODS).join(', ')}`,
      ),
    );
  }
  const absolute = path.resolve(modulePath);
  if (!fs.existsSync(absolute)) {
    return Promise.resolve({
      ok: false,
      missing: required,
      methods: [],
      error: `Not found: ${modulePath}`,
    });
  }

  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['-e', PROBE_SCRIPT, absolute],
      {
        timeout: options.timeoutMs || 10000,
        cwd: path.dirname(absolute),
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const reason = error.killed
            ? 'timed out while loading'
            : firstErrorLine(stderr || error.message);
          resolve({
            ok: false,
            missing: required,
            methods: [],
            error: `Failed to load: ${reason}`,
          });
          return;
        }
        let parsed;
        try {
          // The module may print while loading; the result follows the marker.
          parsed = JSON.parse(
            stdout.slice(stdout.lastIndexOf(MARKER) + MARKER.length),
          );
        } catch {
          resolve({
            ok: false,
            missing: required,
            methods: [],
            error: 'Module printed unexpected output while loading',
          });
          return;
        }
        // An embedder may implement embedQuery only for queries; embed is required.
        const missing = required.filter((m) => !parsed.methods.includes(m));
        resolve({ ok: missing.length === 0, missing, methods: parsed.methods });
      },
    );
  });
}

module.exports = { probeContract, STAGE_METHODS };
