'use strict';

/**
 * Shared helpers for the built-in connectors: AbortSignal handling, retry
 * classification and backoff, and API key resolution.
 *
 * Everything here must run on Node 18 (no AbortSignal.any, no crypto.hash).
 */

/** HTTP status codes that are worth retrying. */
const RETRYABLE_STATUS = new Set([408, 409, 425, 429]);

/** Error codes produced by Node, axios and undici for transient network failures. */
const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNABORTED',
  'EPIPE',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ENETDOWN',
  'EHOSTUNREACH',
  'ERR_NETWORK',
]);

/** Error names (openai SDK) that signal a connection-level failure. */
const RETRYABLE_NAMES = new Set([
  'APIConnectionError',
  'APIConnectionTimeoutError',
]);

/**
 * Create an AbortError for the given signal.
 * Reuses signal.reason when it already is an AbortError.
 *
 * @param {AbortSignal} [signal]
 * @returns {Error} Error with name 'AbortError' and code 'ABORT_ERR'
 */
function createAbortError(signal) {
  const reason = signal ? signal.reason : undefined;
  if (reason instanceof Error && reason.name === 'AbortError') {
    return reason;
  }
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  err.code = 'ABORT_ERR';
  if (reason !== undefined) err.cause = reason;
  return err;
}

/**
 * @param {*} err
 * @returns {boolean} True when err represents a cancellation.
 */
function isAbortError(err) {
  if (!err) return false;
  return (
    err.name === 'AbortError' ||
    err.code === 'ABORT_ERR' ||
    err.name === 'CanceledError' ||
    err.code === 'ERR_CANCELED' ||
    err.name === 'APIUserAbortError'
  );
}

/**
 * Throw an AbortError when the signal is already aborted.
 * @param {AbortSignal} [signal]
 */
function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    throw createAbortError(signal);
  }
}

/**
 * Race a promise against an AbortSignal so callers reject promptly even when
 * the underlying SDK or HTTP client ignores the signal. The abort listener is
 * removed once the promise settles.
 *
 * @template T
 * @param {Promise<T>|(() => Promise<T>)} work - Promise or function returning one
 * @param {AbortSignal} [signal]
 * @returns {Promise<T>}
 */
function raceAbort(work, signal) {
  if (!signal) {
    return typeof work === 'function' ? Promise.resolve().then(work) : work;
  }
  if (signal.aborted) {
    return Promise.reject(createAbortError(signal));
  }
  const promise =
    typeof work === 'function' ? Promise.resolve().then(work) : work;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(createAbortError(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        // Normalise SDK/axios cancellation errors to AbortError.
        reject(
          signal.aborted || isAbortError(err) ? createAbortError(signal) : err,
        );
      },
    );
  });
}

/**
 * Sleep that rejects with AbortError as soon as the signal aborts.
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
function abortableSleep(ms, signal) {
  if (signal && signal.aborted) {
    return Promise.reject(createAbortError(signal));
  }
  return new Promise((resolve, reject) => {
    let onAbort = null;
    const timer = setTimeout(() => {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal) {
      onAbort = () => {
        clearTimeout(timer);
        reject(createAbortError(signal));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Extract the HTTP status from an openai SDK error or an axios error.
 * @param {*} err
 * @returns {number|undefined}
 */
function getErrorStatus(err) {
  if (!err) return undefined;
  const status =
    (err.response && err.response.status) ?? err.status ?? err.statusCode;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Read a header from a plain object, an AxiosHeaders instance or a fetch Headers.
 * @param {*} headers
 * @param {string} name - Lower-case header name
 * @returns {string|undefined}
 */
function getHeader(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') {
    const value = headers.get(name);
    if (value != null) return String(value);
  }
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name && headers[key] != null) {
      return String(headers[key]);
    }
  }
  return undefined;
}

/**
 * Parse Retry-After / retry-after-ms from an error's response headers.
 *
 * @param {*} err
 * @param {number} [now=Date.now()]
 * @returns {number|undefined} Delay in milliseconds, or undefined when absent
 */
function getRetryAfterMs(err, now = Date.now()) {
  if (!err) return undefined;
  const headers = (err.response && err.response.headers) || err.headers;
  const ms = getHeader(headers, 'retry-after-ms');
  if (ms !== undefined && /^\d+(\.\d+)?$/.test(ms.trim())) {
    return Math.max(0, Number(ms));
  }
  const value = getHeader(headers, 'retry-after');
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.max(0, Number(trimmed) * 1000);
  }
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
  return undefined;
}

/**
 * Default retry classification: network failures and HTTP
 * 408/409/425/429/5xx are retried; aborts, other 4xx (400, 401, 403, 404,
 * 422, ...) and errors without a status or network code are not.
 *
 * @param {*} err
 * @returns {boolean}
 */
function isRetryableError(err) {
  if (!err || isAbortError(err)) return false;
  if (err.code === 'MISSING_API_KEY') return false;
  const status = getErrorStatus(err);
  if (status !== undefined) {
    return RETRYABLE_STATUS.has(status) || (status >= 500 && status <= 599);
  }
  // Network failures arrive wrapped: openai 5+ throws an APIConnectionError
  // whose cause is fetch's TypeError('fetch failed'), whose cause carries
  // the socket error code. Look a few levels down the cause chain.
  for (let e = err, depth = 0; e && depth < 4; e = e.cause, depth++) {
    if (typeof e.code === 'string') {
      if (RETRYABLE_CODES.has(e.code) || e.code.startsWith('UND_ERR_')) {
        return true;
      }
    }
    // The SDK's error classes keep name 'Error'; match the class name too.
    const className = e.constructor && e.constructor.name;
    if (RETRYABLE_NAMES.has(e.name) || RETRYABLE_NAMES.has(className)) {
      return true;
    }
    if (e.name === 'TypeError' && /fetch failed/i.test(e.message || '')) {
      return true;
    }
  }
  return false;
}

/**
 * Compute the delay before the next retry attempt.
 * Honours Retry-After (capped at maxDelay); otherwise uses exponential backoff
 * with full jitter: random() * min(maxDelay, baseDelay * 2^attempt).
 *
 * @param {*} err - The error that triggered the retry
 * @param {number} attempt - Zero-based retry attempt
 * @param {object} [opts]
 * @param {number} [opts.baseDelay=1000]
 * @param {number} [opts.maxDelay=30000]
 * @param {() => number} [opts.random=Math.random]
 * @returns {number} Delay in milliseconds
 */
function computeRetryDelay(err, attempt, opts = {}) {
  const baseDelay = opts.baseDelay ?? 1000;
  const maxDelay = opts.maxDelay ?? 30000;
  const random = opts.random || Math.random;
  const retryAfter = getRetryAfterMs(err);
  if (retryAfter !== undefined) {
    return Math.min(retryAfter, maxDelay);
  }
  const exp = Math.min(maxDelay, baseDelay * 2 ** attempt);
  return Math.floor(random() * exp);
}

/**
 * Resolve an API key at construction time. An explicit option (even '')
 * wins over the environment variable.
 *
 * @param {object} options - Connector options
 * @param {string} envVar - Environment variable name
 * @returns {string}
 */
function resolveApiKey(options, envVar) {
  if (options && options.apiKey !== undefined) return options.apiKey || '';
  return process.env[envVar] || '';
}

/**
 * Adds a `keyId` to cache-identity fields so connectors that differ only in
 * API key never share cached results. It is the first 16 hex characters
 * (64 bits) of the key's SHA-256: enough to tell keys apart with no
 * realistic chance of a clash, and the raw key can't be read back from it.
 * With no key the fields are returned unchanged.
 *
 * @param {object} fields - Cache-identity fields
 * @param {string} [apiKey]
 * @returns {object}
 */
function withKeyId(fields, apiKey) {
  if (!apiKey) return fields;
  const keyId = require('crypto') // eslint-disable-line global-require
    .createHash('sha256')
    .update(String(apiKey))
    .digest('hex')
    .slice(0, 16);
  return { ...fields, keyId };
}

/**
 * Error thrown when a provider call is attempted without an API key.
 * @param {string} provider - Display name, e.g. 'OpenAI'
 * @param {string} envVar - Environment variable name
 * @returns {Error}
 */
function missingApiKeyError(provider, envVar) {
  return Object.assign(
    new Error(
      `${provider} API key required. Set ${envVar} or pass the apiKey option.`,
    ),
    // provider and envVar: for callers that word their own message, e.g.
    // the CLI
    { code: 'MISSING_API_KEY', provider, envVar },
  );
}

/**
 * Build request options carrying the signal only when one was supplied, so
 * calls without a signal look exactly as before.
 * @param {AbortSignal} [signal]
 * @returns {object}
 */
function signalOptions(signal) {
  return signal ? { signal } : {};
}

/**
 * The text of a streamed response body, chunk by chunk. Handles what axios
 * returns for `responseType: 'stream'` on each runtime: a Node stream of
 * Buffers, a web ReadableStream of Uint8Arrays (Cloudflare Workers), or a
 * string. Bytes are decoded as UTF-8 across chunk boundaries, so a character
 * split between two chunks stays whole.
 *
 * @param {AsyncIterable<Uint8Array|string>|ReadableStream|string} data
 * @yields {string}
 */
async function* textChunks(data) {
  if (typeof data === 'string') {
    if (data) yield data;
    return;
  }
  const decoder = new TextDecoder();
  const chunks =
    data && typeof data[Symbol.asyncIterator] === 'function'
      ? data
      : readerChunks(data);
  for await (const chunk of chunks) {
    const text =
      typeof chunk === 'string'
        ? chunk
        : decoder.decode(chunk, { stream: true });
    if (text) yield text;
  }
  const rest = decoder.decode();
  if (rest) yield rest;
}

/** A ReadableStream without async iteration, read through its reader. */
async function* readerChunks(stream) {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * An axios error without what it carries from the request. axios errors
 * keep the request config, headers included, so logging or serializing one
 * prints the API key. This copies what callers and the retry logic use
 * (the response status, headers and body, and the network error code)
 * into a plain Error, and puts the API's own explanation in the message:
 * "Anthropic API error 401: authentication_error: invalid x-api-key".
 *
 * @param {*} err
 * @param {string} provider - Name for the message, e.g. "Anthropic"
 * @returns {*} A clean Error for an axios error; anything else unchanged
 */
function toConnectorError(err, provider) {
  if (!err || typeof err !== 'object' || err.isAxiosError !== true) {
    return err;
  }
  if (isAbortError(err)) {
    const aborted = new Error('The operation was aborted');
    aborted.name = 'AbortError';
    aborted.code = 'ABORT_ERR';
    return aborted;
  }
  const response = err.response;
  let message;
  if (response) {
    const data = response.data;
    const apiError =
      data && typeof data === 'object' && typeof data.pipe !== 'function'
        ? data.error
        : undefined;
    let detail = '';
    if (apiError && typeof apiError === 'object') {
      detail = [apiError.type, apiError.message].filter(Boolean).join(': ');
    } else if (typeof apiError === 'string') {
      detail = apiError;
    } else if (
      data &&
      typeof data === 'object' &&
      typeof data.message === 'string'
    ) {
      detail = data.message;
    }
    message = `${provider} API error ${response.status}${detail ? `: ${detail}` : ''}`;
  } else {
    message = `${provider} request failed: ${err.message}`;
  }
  const error =
    /** @type {Error & { provider?: string, code?: string, status?: number, response?: Object }} */ (
      new Error(message)
    );
  error.provider = provider;
  if (err.code) error.code = err.code;
  if (response) {
    error.status = response.status;
    // A new object: axios's response links back to the request config
    error.response = {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
    };
  }
  return error;
}

/**
 * Read a streamed error body (responseType 'stream') into its parsed JSON
 * or text, up to 64 KB. The stream itself must not be kept: it links back
 * to the request, headers included.
 * @private
 */
async function readErrorBody(stream) {
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > 65536) break;
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
  } catch {
    // Keep what was read
  } finally {
    if (typeof stream.destroy === 'function') stream.destroy();
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    return text || undefined;
  }
}

/**
 * Make every error from an axios client a toConnectorError() one.
 * @param {Object} client - From axios.create()
 * @param {string} provider
 * @returns {Object} The client
 */
function cleanAxiosErrors(client, provider) {
  client.interceptors.response.use(undefined, async (err) => {
    const data = err && err.response && err.response.data;
    if (data && typeof data.pipe === 'function') {
      err.response.data = await readErrorBody(data);
    }
    throw toConnectorError(err, provider);
  });
  return client;
}

module.exports = {
  withKeyId,
  toConnectorError,
  cleanAxiosErrors,
  textChunks,
  createAbortError,
  isAbortError,
  throwIfAborted,
  raceAbort,
  abortableSleep,
  getErrorStatus,
  getRetryAfterMs,
  isRetryableError,
  computeRetryDelay,
  resolveApiKey,
  missingApiKeyError,
  signalOptions,
  RETRYABLE_STATUS,
  RETRYABLE_CODES,
};
