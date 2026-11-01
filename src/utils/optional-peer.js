'use strict';

/**
 * Load an optional peer dependency. `load` must be a literal
 * `() => require('name')`, so bundlers (esbuild, Wrangler, webpack) can see
 * and include the package; probing with require.resolve() instead fails in
 * bundles even when the package is there.
 *
 * Only the package itself being absent becomes a `MISSING_DEPENDENCY` error
 * carrying `hint`; any other failure, including a module missing inside the
 * package, is rethrown as is.
 *
 * @param {string} name - The package name
 * @param {() => any} load - `() => require(name)`
 * @param {string} hint - The error message when the package is missing
 * @returns {any} The module
 */
function loadOptionalPeer(name, load, hint) {
  try {
    return load();
  } catch (error) {
    if (isMissing(error, name)) {
      const err = new Error(hint);
      err.code = 'MISSING_DEPENDENCY';
      throw err;
    }
    throw error;
  }
}

function isMissing(error, name) {
  if (!error || error.code !== 'MODULE_NOT_FOUND') return false;
  const message = String(error.message || '');
  return (
    message.startsWith(`Cannot find module '${name}'`) ||
    message.startsWith(`Cannot find module "${name}"`)
  );
}

module.exports = { loadOptionalPeer };
