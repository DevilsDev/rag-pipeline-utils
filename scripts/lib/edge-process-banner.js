"use strict";

/**
 * The first line of dist/edge.mjs: the `process` the bundled library sees.
 *
 * Vercel Edge has a `process` with `env` but no `emitWarning`; Workers
 * without nodejs_compat and browsers have no `process` at all. The library
 * reads `process.env` and warns through `process.emitWarning`, so:
 *
 * - Node's own `process` (it has `emitWarning`) is used as it is;
 * - a `process` without `emitWarning` is wrapped, not changed: the stand-in
 *   inherits everything from it and adds `emitWarning`;
 * - with no `process`, the stand-in has an empty `env` and `emitWarning`.
 *
 * The stand-in's `emitWarning` writes "[CODE] Type: message" with
 * console.warn, taking the same arguments as Node's.
 */
const EDGE_PROCESS_BANNER = `var process = (function (host) {
  if (host && typeof host.emitWarning === "function") return host;
  var shim = Object.create(host || null);
  if (!shim.env) shim.env = {};
  shim.emitWarning = function (warning, options, code) {
    var type = "Warning";
    if (typeof options === "string") type = options;
    else if (options && typeof options === "object") {
      if (options.type) type = options.type;
      if (options.code) code = options.code;
    }
    if (warning instanceof Error) {
      type = warning.name || type;
      warning = warning.message;
    }
    console.warn((code ? "[" + code + "] " : "") + type + ": " + warning);
  };
  return shim;
})(globalThis.process);`;

module.exports = { EDGE_PROCESS_BANNER };
