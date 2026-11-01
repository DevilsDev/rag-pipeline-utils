'use strict';

/**
 * pino for the /edge build: the library's logger, written to the console
 * (pino writes to a Node stream). Same levels and child(); `silent` (the
 * default under NODE_ENV=test) logs nothing.
 */
const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
const CONSOLE = {
  trace: 'debug',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
};

function create(options = {}, bindings = {}) {
  const logger = {
    level: options.level || 'info',
    child(more) {
      return create(
        { ...options, level: logger.level },
        { ...bindings, ...more },
      );
    },
    isLevelEnabled(level) {
      return (
        logger.level !== 'silent' &&
        LEVELS.indexOf(level) >= LEVELS.indexOf(logger.level)
      );
    },
  };
  for (const level of LEVELS) {
    logger[level] = (objOrMsg, msg) => {
      if (!logger.isLevelEnabled(level)) return;
      const fields =
        objOrMsg && typeof objOrMsg === 'object' ? objOrMsg : { msg: objOrMsg };
      console[CONSOLE[level]](
        JSON.stringify({
          level,
          time: Date.now(),
          ...(options.name && { name: options.name }),
          ...bindings,
          ...fields,
          ...(msg !== undefined && { msg }),
        }),
      );
    };
  }
  return logger;
}

function pino(options) {
  return create(options);
}
pino.stdTimeFunctions = {
  isoTime: () => `,"time":"${new Date().toISOString()}"`,
};
pino.stdSerializers = { err: (e) => e, req: (r) => r, res: (r) => r };

module.exports = pino;
module.exports.default = pino;
module.exports.pino = pino;
