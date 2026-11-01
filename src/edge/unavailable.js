'use strict';

/**
 * Stands in for Node built-ins (fs, path, os, ...) in the /edge build. The
 * library loads some of them on import but only uses them for files and
 * plugins on disk, which the edge build leaves out; any use fails clearly.
 */
const fail = (name) => () => {
  throw new Error(
    `${name} is not available in the edge build (@devilsdev/rag-pipeline-utils/edge); use the Node.js entry`,
  );
};

module.exports = new Proxy(
  {},
  {
    get(target, prop) {
      if (prop === '__esModule' || typeof prop === 'symbol') return undefined;
      return fail(`Node.js API "${String(prop)}"`);
    },
  },
);
