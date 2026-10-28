"use strict";

/**
 * Deprecation wrappers for public exports (see SEMVER.md, "Deprecation
 * process"): the export keeps working and warns once per process when used.
 */

const wrapped = new WeakMap();
const warned = new Set();

function warnOnce(code, message) {
  if (warned.has(code)) return;
  warned.add(code);
  process.emitWarning(message, { type: "DeprecationWarning", code });
}

/**
 * Wrap a class so constructing it (or calling a static method) emits a
 * one-time DeprecationWarning. A Proxy keeps the original's identity for
 * prototype, name, statics, `extends` and `instanceof`, so instances created
 * inside the library still satisfy `instanceof Wrapped`. The same class
 * always gets the same wrapper, so aliases stay identical.
 *
 * @param {Function} Class - Class to wrap
 * @param {object} info
 * @param {string} info.name - Export name, used in the message and code
 * @param {string} info.message - Full warning text
 * @returns {Function} The wrapped class
 */
function deprecateClass(Class, { name, message }) {
  if (wrapped.has(Class)) return wrapped.get(Class);
  // SSOManager -> RAG_DEP_SSO_MANAGER, OAuth2Provider -> RAG_DEP_O_AUTH2_PROVIDER
  const snake = name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
  const code = `RAG_DEP_${snake}`;
  const proxy = new Proxy(Class, {
    construct(target, args, newTarget) {
      warnOnce(code, message);
      return Reflect.construct(
        target,
        args,
        newTarget === proxy ? target : newTarget,
      );
    },
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      // Only the class's own static methods; inherited Function.prototype
      // members (call, bind, toString, Symbol.hasInstance for instanceof)
      // must not warn.
      const ownStatic =
        typeof value === "function" &&
        property !== "prototype" &&
        Object.prototype.hasOwnProperty.call(target, property);
      if (ownStatic) {
        return function deprecatedStatic(...args) {
          warnOnce(code, message);
          return value.apply(this === proxy ? target : this, args);
        };
      }
      return value;
    },
  });
  wrapped.set(Class, proxy);
  return proxy;
}

module.exports = { deprecateClass };
