"use strict";

/**
 * One-line CLI messages for failed commands. A missing or refused API key
 * names the provider, the environment variable to set and what the API said;
 * anything else prints its message. Neither ever prints a key: the values of
 * the key variables, and anything shaped like an sk- key (OpenAI's 401 echoes
 * part of the key), are redacted. --verbose adds the stack, also redacted.
 */

// Provider name on connector errors -> the variable the CLI reads the key from
const KEY_ENV = {
  Anthropic: "ANTHROPIC_API_KEY",
  OpenAI: "OPENAI_API_KEY",
  Cohere: "COHERE_API_KEY",
};

// One character class with a single quantifier: linear on any input
const KEY_SHAPE = /\bsk-[\w*-]+/g;

function redact(text) {
  let out = String(text == null ? "" : text);
  for (const name of Object.values(KEY_ENV)) {
    const value = process.env[name];
    if (value && value.length >= 8) out = out.split(value).join("[redacted]");
  }
  return out.replace(KEY_SHAPE, "sk-[redacted]");
}

/** What the API said: "authentication_error: invalid x-api-key". */
function apiDetail(error) {
  // openai SDK errors carry the body's error object as error.error
  const body =
    error.error && typeof error.error === "object"
      ? error.error
      : error.response &&
          error.response.data &&
          typeof error.response.data === "object"
        ? error.response.data.error || error.response.data
        : undefined;
  if (typeof body === "string") return body;
  if (body && typeof body === "object") {
    const kind = body.code || body.type;
    const text = typeof body.message === "string" ? body.message : "";
    const detail = [kind, text].filter(Boolean).join(": ");
    if (detail) return detail;
  }
  // "Anthropic API error 401: authentication_error: ..." -> after the status
  const message = String(error.message || "");
  const colon = message.indexOf(": ");
  return colon === -1 ? "" : message.slice(colon + 2);
}

function errorStatus(error) {
  if (typeof error.status === "number") return error.status;
  if (error.response && typeof error.response.status === "number") {
    return error.response.status;
  }
  return undefined;
}

/** A provider's key is missing, or the API refused it (401/403). */
function isKeyError(error) {
  if (!error || typeof error !== "object" || !error.provider) return false;
  if (error.code === "MISSING_API_KEY") return true;
  const status = errorStatus(error);
  return status === 401 || status === 403;
}

/**
 * The one-line description of a failure.
 * @param {*} error
 * @returns {string}
 */
function describeCliError(error) {
  if (!error || typeof error !== "object") return redact(error);
  if (!isKeyError(error)) return redact(error.message || String(error));
  const { provider } = error;
  const envVar = error.envVar || KEY_ENV[provider];

  if (error.code === "MISSING_API_KEY") {
    return envVar
      ? `no ${provider} API key. Set ${envVar} and run the command again.`
      : `no ${provider} API key configured.`;
  }

  const detail = apiDetail(error);
  const said = `${errorStatus(error)}${detail ? ` ${detail}` : ""}`;
  const fix = envVar
    ? `Check ${envVar}.`
    : 'Check the "apiKey" in the stage\'s config.';
  return redact(`${provider} rejected the API key (${said}). ${fix}`);
}

/**
 * Print "❌ <prefix>: <description>" on stderr, the stack with --verbose,
 * and set a failing exit code.
 * @param {string} prefix - e.g. "Query failed"
 * @param {*} error
 * @param {object} [globalOptions] - program.opts(); reads `verbose`
 */
function reportCliError(prefix, error, globalOptions = {}) {
  console.error(`❌ ${prefix}: ${describeCliError(error)}`);
  if (globalOptions && globalOptions.verbose && error && error.stack) {
    console.error(redact(error.stack));
  }
  process.exitCode = 1;
}

module.exports = {
  describeCliError,
  reportCliError,
  isKeyError,
  redact,
  KEY_ENV,
};
