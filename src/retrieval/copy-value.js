'use strict';

/**
 * A deep copy of a plain value (metadata, access lists), so a store never
 * shares objects with its callers. Falls back to a manual copy for values
 * structuredClone rejects (functions, class instances with methods).
 * @template T
 * @param {T} value
 * @returns {T}
 */
function copyValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // fall through to the manual copy
    }
  }
  if (Array.isArray(value)) return value.map(copyValue);
  const out = {};
  for (const key of Object.keys(value)) {
    Object.defineProperty(out, key, {
      value: copyValue(value[key]),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}

module.exports = { copyValue };
