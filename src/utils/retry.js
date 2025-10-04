/**
 * Version: 0.2.0
 * Path: /src/utils/retry.js
 * Description: Generic retry wrapper with exponential backoff and injectable sleep for testing
 * Author: Ali Kahwaji
 */

const { logger } = require("./logger.js");

// Keep a default sleeper that tests can override via options
const defaultSleep = (ms) =>
  new Promise((res) => {
    const t = setTimeout(res, ms);
    if (typeof t.unref === "function") t.unref();
  });

/**
 * Retry a function with exponential backoff.
 *
 * @param {Function} fn - async or sync function to call; receives (attempt)
 * @param {Object} [opts]
 * @param {number} [opts.retries=3] - number of *retries* (total attempts = retries + 1)
 * @param {number} [opts.baseDelay=100] - initial delay in ms
 * @param {number} [opts.multiplier=2] - backoff multiplier
 * @param {boolean} [opts.jitter=false] - add +/-50% jitter if true
 * @param {Function} [opts.sleep=defaultSleep] - injected sleeper for tests
 * @param {Function} [opts.onDelay] - callback (delayMs, attempt, error) before each sleep
 * @returns {Promise<*>}
 */
async function retry(fn, opts = {}) {
  const {
    retries = 3,
    baseDelay = 100,
    multiplier = 2,
    jitter = false,
    sleep: injectedSleep,
    onDelay,
  } = opts;

  const testNoopSleep = () => Promise.resolve();
  const sleep =
    injectedSleep ??
    (process.env.NODE_ENV === "test"
      ? testNoopSleep
      : (ms) =>
          new Promise((r) => {
            const t = setTimeout(r, ms);
            if (typeof t.unref === "function") t.unref();
          }));

  let attempt = 0; // 0-based attempt index

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries) throw err;

      // exponential backoff: base * multiplier^attempt
      const backoff = baseDelay * Math.pow(multiplier, attempt);
      const delay = jitter
        ? Math.round(backoff * (0.5 + Math.random())) // 50%..150%
        : backoff;

      if (typeof onDelay === "function") {
        onDelay(delay, attempt, err);
      }

      // IMPORTANT: call the *injected* sleeper so tests can spy on it
      await sleep(delay);

      attempt += 1;
    }
  }
}

// Legacy wrapper for backward compatibility
async function withRetry(
  _fn,
  { retries = 3, initialDelay = 300, label = "operation" } = {},
) {
  return retry(_fn, {
    retries,
    baseDelay: initialDelay,
    onDelay: (delay, attempt, err) => {
      if (attempt > 0) {
        logger.warn(
          { attempt: attempt + 1, label },
          `Retrying ${label} (attempt ${attempt + 1})`,
        );
      }
      if (attempt >= retries - 1) {
        logger.error(
          { label, error: err.message },
          `Failed ${label} after ${retries} retries`,
        );
      }
    },
  });
}

module.exports = {
  retry,
  withRetry,
  defaultSleep,
};
