module.exports = async function retry(
  fn,
  { retries = 3, delayMs = 250, onRetry } = {},
) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === retries) break;
      if (onRetry)
        try {
          onRetry({ attempt: i + 1, err });
        } catch {}
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
};
