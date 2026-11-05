"use strict";

/**
 * Preloaded into every consumer-journey process (NODE_OPTIONS=--require) by
 * scripts/consumer-journeys.js, and into the live test suite by
 * __tests__/live/usage-ledger.js. It is harness instrumentation, like an APM
 * agent: the journey code stays exactly what a developer would write.
 *
 * For every call to the Claude Messages API, made through https.request
 * (axios, used by AnthropicConnector) or fetch (@anthropic-ai/sdk, the AI
 * SDK), it appends one line to the spend ledger:
 *   { ts, journey, model, input_tokens, output_tokens, status, via }
 * No prompt, answer or key is ever written.
 *
 * It also:
 * - stops calls once the ledger's spend reaches RAG_LEDGER_HARD_CAP_USD;
 * - records, as booleans only, whether a marker string from RAG_PROBE_MARKERS
 *   appeared in a request body (RAG_PROBE_FILE), so a journey can prove a
 *   restricted document never reached the model.
 */

const fs = require("fs");
const https = require("https");
const zlib = require("zlib");

const LEDGER = process.env.RAG_LEDGER;
const JOURNEY = process.env.RAG_JOURNEY || "unknown";
const PROBE_FILE = process.env.RAG_PROBE_FILE;
const MARKERS = (process.env.RAG_PROBE_MARKERS || "")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const HARD_CAP = Number(process.env.RAG_LEDGER_HARD_CAP_USD || 4.75);

// USD per million tokens (input, output), longest prefix first.
const PRICES = [
  ["claude-haiku-5-5", 0.1, 0.5],
  ["claude-haiku-4-5", 1, 5],
  ["claude-sonnet-5-5", 2, 10],
  ["claude-opus-5-5", 4, 20],
  ["claude-fable-5-1", 10, 50],
];

function priceOf(model) {
  const row = PRICES.find(([prefix]) => String(model).startsWith(prefix));
  // Unknown models are priced like Opus so the cap errs on the safe side.
  return row ? [row[1], row[2]] : [4, 20];
}

function ledgerSpend() {
  if (!LEDGER || !fs.existsSync(LEDGER)) return 0;
  let total = 0;
  for (const line of fs.readFileSync(LEDGER, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      const [i, o] = priceOf(e.model);
      total += ((e.input_tokens || 0) * i + (e.output_tokens || 0) * o) / 1e6;
    } catch {
      // ignore a malformed line
    }
  }
  return total;
}

function record(entry) {
  if (!LEDGER) return;
  const line = {
    ts: new Date().toISOString(),
    journey: JOURNEY,
    model: entry.model || "unknown",
    input_tokens: entry.input_tokens || 0,
    output_tokens: entry.output_tokens || 0,
    status: entry.status,
    via: entry.via,
  };
  if (typeof entry.latencyMs === "number") line.latency_ms = entry.latencyMs;
  if (entry.estimated) line.estimated = true;
  fs.appendFileSync(LEDGER, JSON.stringify(line) + "\n");
}

function probe(body) {
  if (!PROBE_FILE || MARKERS.length === 0 || !body) return;
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
  const seen = MARKERS.filter((m) => text.includes(m));
  fs.appendFileSync(
    PROBE_FILE,
    JSON.stringify({ request: true, markers: seen }) + "\n",
  );
}

/** Usage from a Messages API response body (JSON or SSE). */
function parseUsage(text, contentType) {
  const usage = { model: undefined, input_tokens: 0, output_tokens: 0 };
  const addInput = (u) => {
    usage.input_tokens +=
      (u.input_tokens || 0) +
      (u.cache_creation_input_tokens || 0) +
      (u.cache_read_input_tokens || 0);
  };
  if (/event-stream/.test(contentType || "") || /^event:/m.test(text)) {
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const event = JSON.parse(line.slice(5).trim());
        if (event.type === "message_start" && event.message) {
          usage.model = event.message.model;
          if (event.message.usage) {
            addInput(event.message.usage);
            usage.output_tokens = event.message.usage.output_tokens || 0;
          }
        } else if (event.type === "message_delta" && event.usage) {
          // output_tokens in message_delta is cumulative
          usage.output_tokens = event.usage.output_tokens || 0;
        }
      } catch {
        // not JSON
      }
    }
    return usage;
  }
  try {
    const json = JSON.parse(text);
    usage.model = json.model;
    if (json.usage) {
      addInput(json.usage);
      usage.output_tokens = json.usage.output_tokens || 0;
    }
  } catch {
    // an error page or empty body: no usage
  }
  return usage;
}

function modelFromBody(body) {
  try {
    return JSON.parse(
      Buffer.isBuffer(body) ? body.toString("utf8") : String(body),
    ).model;
  } catch {
    return undefined;
  }
}

function rawHeader(res, name) {
  const raw = res.rawHeaders || [];
  for (let i = 0; i < raw.length; i += 2) {
    if (String(raw[i]).toLowerCase() === name) return String(raw[i + 1]);
  }
  return String(res.headers[name] || "");
}

function overCap() {
  return ledgerSpend() >= HARD_CAP;
}

// ---- https.request (axios via follow-redirects) ---------------------------

const originalRequest = https.request;
https.request = function patchedRequest(...args) {
  const req = originalRequest.apply(this, args);
  const host = String(req.host || "");
  const path = String(req.path || "");
  if (!host.includes("api.anthropic.com") || !path.includes("/v1/messages")) {
    return req;
  }
  if (overCap()) {
    process.nextTick(() =>
      req.destroy(
        new Error(`Claude usage-ledger spend cap of $${HARD_CAP} reached`),
      ),
    );
    return req;
  }
  const startedAt = Date.now();
  const sent = [];
  const write = req.write;
  const end = req.end;
  req.write = function (chunk, ...rest) {
    if (chunk && typeof chunk !== "function") sent.push(Buffer.from(chunk));
    return write.call(this, chunk, ...rest);
  };
  req.end = function (chunk, ...rest) {
    if (chunk && typeof chunk !== "function") sent.push(Buffer.from(chunk));
    probe(Buffer.concat(sent));
    return end.call(this, chunk, ...rest);
  };
  req.on("response", (res) => {
    // Observe 'data' events without adding a listener, so the stream's
    // flowing state (and what the consumer reads) is untouched.
    const received = [];
    const emit = res.emit;
    let done = false;
    res.emit = function (event, ...rest) {
      if (event === "data" && rest[0]) received.push(Buffer.from(rest[0]));
      if ((event === "end" || event === "close") && !done) {
        done = true;
        let raw = Buffer.concat(received);
        // axios deletes content-encoding from res.headers when it
        // decompresses, so read the raw headers.
        const enc = rawHeader(res, "content-encoding");
        try {
          if (enc.includes("gzip")) raw = zlib.gunzipSync(raw);
          else if (enc.includes("br")) raw = zlib.brotliDecompressSync(raw);
          else if (enc.includes("deflate")) raw = zlib.inflateSync(raw);
        } catch {
          // partial body (an aborted stream): try a lenient gunzip
          try {
            if (enc.includes("gzip")) {
              raw = zlib.gunzipSync(raw, {
                finishFlush: zlib.constants.Z_SYNC_FLUSH,
              });
            }
          } catch {
            // nothing usable
          }
        }
        const usage = parseUsage(
          raw.toString("utf8"),
          rawHeader(res, "content-type"),
        );
        record({
          ...usage,
          model: usage.model || modelFromBody(Buffer.concat(sent)),
          status: res.statusCode,
          via: "https",
          latencyMs: Date.now() - startedAt,
        });
      }
      return emit.call(this, event, ...rest);
    };
  });
  return req;
};

// ---- fetch (@anthropic-ai/sdk, @ai-sdk/anthropic) -------------------------

if (typeof globalThis.fetch === "function") {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function patchedFetch(input, init) {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input && input.url;
    if (!/api\.anthropic\.com\/v1\/messages(\?|$)/.test(String(url))) {
      return originalFetch.call(this, input, init);
    }
    if (overCap()) {
      throw new Error(`Claude usage-ledger spend cap of $${HARD_CAP} reached`);
    }
    const body = init && typeof init.body === "string" ? init.body : undefined;
    probe(body);
    const startedAt = Date.now();
    const response = await originalFetch.call(this, input, init);
    try {
      const copy = response.clone();
      copy
        .text()
        .then((text) => {
          const usage = parseUsage(text, response.headers.get("content-type"));
          record({
            ...usage,
            model: usage.model || modelFromBody(body),
            status: response.status,
            via: "fetch",
            latencyMs: Date.now() - startedAt,
          });
        })
        .catch(() => {
          record({
            model: modelFromBody(body),
            status: response.status,
            via: "fetch",
            estimated: true,
          });
        });
    } catch {
      // body already used: nothing to record
    }
    return response;
  };
}

module.exports = { parseUsage, priceOf, ledgerSpend };
