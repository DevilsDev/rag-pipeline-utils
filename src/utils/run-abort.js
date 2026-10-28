'use strict';

/** Message used for a run that exceeded its timeout. */
const TIMEOUT_MESSAGE = 'Execution timeout';
/** Message used for a run cancelled through the caller's AbortSignal. */
const ABORTED_MESSAGE = 'Execution aborted';

function timeoutError() {
  const err = new Error(TIMEOUT_MESSAGE);
  err.name = 'TimeoutError';
  err.code = 'ETIMEDOUT';
  return err;
}

function callerAbortError(signal) {
  const err = new Error(ABORTED_MESSAGE);
  err.name = 'AbortError';
  err.code = 'ABORT_ERR';
  if (signal && signal.reason !== undefined) err.cause = signal.reason;
  return err;
}

/**
 * Per-run cancellation: one AbortController that is aborted when `timeout`
 * elapses or when the caller's `signal` aborts. Its `signal` is handed to
 * every component call; `race()` makes the run settle as soon as it is
 * aborted even if a component ignores the signal; `throwIfAborted()` stops
 * work between stages.
 *
 * @param {object} [options]
 * @param {number} [options.timeout] - Milliseconds before the run is aborted
 * @param {AbortSignal} [options.signal] - Caller's signal to follow
 * @returns {{
 *   signal: AbortSignal,
 *   race: (promise: Promise<any>) => Promise<any>,
 *   throwIfAborted: () => void,
 *   clearTimer: () => void,
 *   detach: () => void,
 *   cleanup: () => void
 * }}
 */
function createRunAbort({ timeout, signal } = {}) {
  const controller = new AbortController();
  let timer = null;
  let onCallerAbort = null;
  let rejectAborted;
  const aborted = new Promise((_, reject) => {
    rejectAborted = reject;
  });
  // The rejection is observed through race(); never report it as unhandled.
  aborted.catch(() => {});

  const abort = (error) => {
    if (controller.signal.aborted) return;
    controller.abort(error);
    rejectAborted(error);
  };

  if (typeof timeout === 'number' && timeout > 0) {
    timer = setTimeout(() => abort(timeoutError()), timeout);
  }
  if (signal && typeof signal.addEventListener === 'function') {
    if (signal.aborted) {
      abort(callerAbortError(signal));
    } else {
      onCallerAbort = () => abort(callerAbortError(signal));
      signal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const detach = () => {
    if (onCallerAbort) signal.removeEventListener('abort', onCallerAbort);
    onCallerAbort = null;
  };

  return {
    signal: controller.signal,
    race(promise) {
      if (controller.signal.aborted) {
        // Swallow the late outcome of work that is no longer awaited.
        Promise.resolve(promise).catch(() => {});
        return Promise.reject(controller.signal.reason);
      }
      return Promise.race([promise, aborted]);
    },
    throwIfAborted() {
      if (controller.signal.aborted) throw controller.signal.reason;
    },
    clearTimer,
    detach,
    cleanup() {
      clearTimer();
      detach();
    },
  };
}

module.exports = { createRunAbort, TIMEOUT_MESSAGE, ABORTED_MESSAGE };
