// src/scripts/script-utilities.js

// default sleeper uses real timers (prod) - unref'd to not block process exit
const sleep = (ms) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    // critical: don't keep the process alive just because of a timer
    if (typeof t.unref === "function") t.unref();
  });

async function retry(fn, opts = {}) {
  const {
    retries = 3,
    baseDelay = 100,
    factor = 2,
    onDelay = () => {},
    sleeper = sleep, // <-- inject for tests
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // pass attempt if useful for logging/logic
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const delay = baseDelay * Math.pow(factor, attempt);
      onDelay(delay, attempt);
      await sleeper(delay); // <-- no-op in tests
    }
  }
  throw lastErr;
}

module.exports = { retry, sleep };
