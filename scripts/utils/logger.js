/* eslint-disable no-console */
const LEVELS = ["silent", "error", "warn", "info", "debug"];
const level = process.env.LOG_LEVEL || "info";
const idx = Math.max(0, LEVELS.indexOf(level));

function at(i, fn, ...args) {
  if (i <= idx) fn(...args);
}

module.exports = {
  error: (...a) => at(1, console.error, ...a),
  warn: (...a) => at(2, console.warn, ...a),
  info: (...a) => at(3, console.log, ...a),
  debug: (...a) => at(4, console.debug, ...a),
  level,
};
