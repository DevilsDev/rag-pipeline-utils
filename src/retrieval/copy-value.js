'use strict';

/**
 * A deep copy of a value (metadata, access lists), so a store never shares
 * objects with its callers. Copies by hand rather than with structuredClone,
 * which builds objects in another realm under Jest and similar sandboxes.
 *
 * - Plain objects and arrays are copied into this module's own {} and [].
 *   Keys are defined with Object.defineProperty, so a "__proto__" or
 *   "constructor" key becomes an ordinary own property and never reaches a
 *   prototype.
 * - Map and Set are copied to a new Map and Set; their keys and values are
 *   copied the same way.
 * - Date, typed arrays (Float32Array and the rest), Buffer, ArrayBuffer and
 *   DataView are copied to a new value of the same type.
 * - Other class instances become plain objects holding their own enumerable
 *   string-keyed properties; their prototype and methods are not kept.
 *   Functions and symbols are returned as they are.
 * - Identity is preserved for every object above: a value reachable more
 *   than once is copied once and shared in the copy, and a circular
 *   reference becomes the same cycle among the copies.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function copyValue(value) {
  return copyInto(value, new WeakMap());
}

function copyInto(value, seen) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  // Tag checks (not instanceof) so values from another realm are recognised
  const tag = Object.prototype.toString.call(value);
  let out;
  if (tag === '[object Date]') {
    out = new Date(value.getTime());
  } else if (Buffer.isBuffer(value)) {
    out = Buffer.from(value);
  } else if (tag === '[object ArrayBuffer]') {
    out = value.slice(0);
  } else if (tag === '[object DataView]') {
    out = new DataView(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  } else if (ArrayBuffer.isView(value)) {
    out = value.slice();
  } else {
    // The copy is registered before its children, so a cycle reaches it
    if (tag === '[object Map]') {
      out = new Map();
      seen.set(value, out);
      for (const [k, v] of value) out.set(copyInto(k, seen), copyInto(v, seen));
    } else if (tag === '[object Set]') {
      out = new Set();
      seen.set(value, out);
      for (const v of value) out.add(copyInto(v, seen));
    } else if (Array.isArray(value)) {
      out = [];
      seen.set(value, out);
      for (let i = 0; i < value.length; i++) out[i] = copyInto(value[i], seen);
    } else {
      out = {};
      seen.set(value, out);
      for (const key of Object.keys(value)) {
        Object.defineProperty(out, key, {
          value: copyInto(value[key], seen),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    return out;
  }
  seen.set(value, out);
  return out;
}

module.exports = { copyValue };
