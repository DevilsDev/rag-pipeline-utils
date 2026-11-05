'use strict';

/**
 * Load an optional peer dependency. `load` must be a literal
 * `() => require('name')`, so bundlers (esbuild, Wrangler, webpack) can see
 * and include the package; probing with require.resolve() instead fails in
 * bundles even when the package is there. A bundle of a project without the
 * package fails to build, though, because the require isn't inside a
 * `try`: loaders on the main entry's path use `missingPeer` with the
 * require in their own `try` instead.
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

/**
 * For a loader that requires an optional peer inside its own `try`, which
 * bundlers (esbuild, Wrangler) then include when the package is installed
 * and leave out, without failing the build, when it isn't:
 *
 *   try {
 *     return require('openai');
 *   } catch (error) {
 *     throw missingPeer(error, 'openai', hint);
 *   }
 *
 * @param {Error} error - What require() threw
 * @param {string} name - The package name
 * @param {string} hint - The error message when the package is missing
 * @returns {Error} A `MISSING_DEPENDENCY` error carrying `hint` when the package itself is absent; otherwise `error`
 */
function missingPeer(error, name, hint) {
  if (!isMissing(error, name)) return error;
  const err = new Error(hint);
  err.code = 'MISSING_DEPENDENCY';
  return err;
}

function isMissing(error, name) {
  if (!error || error.code !== 'MODULE_NOT_FOUND') return false;
  const message = String(error.message || '');
  return (
    message.startsWith(`Cannot find module '${name}'`) ||
    message.startsWith(`Cannot find module "${name}"`)
  );
}

module.exports = { loadOptionalPeer, missingPeer };
