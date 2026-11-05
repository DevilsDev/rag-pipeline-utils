/**
 * Cached, metered Claude API calls for the Claude benchmarks
 * (benchmarks/judge.js, benchmarks/claude-citations.js).
 *
 * Every response is kept in benchmarks/.data/claude-cache/ (gitignored),
 * keyed by a SHA-256 of the request body (which names the model), so a
 * rerun or a change to the tables costs nothing. Each entry records the
 * model, the request body, the response body, its HTTP status and the
 * measured latency; never a header, so never the API key.
 *
 * Spend is summed from the `usage` of every cached response and checked
 * against a cap before each new call.
 *
 * The API key comes from __tests__/live/live-env.js (ANTHROPIC_API_KEY or
 * ~/.config/rag-pipeline-utils/live-test.env).
 */

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_DIR = path.join(__dirname, ".data", "claude-cache");
const API = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";

/**
 * US$ per million tokens, from Anthropic's pricing (checked 2026-11-05):
 * Claude Haiku 4.5 $1 input / $5 output, Claude Sonnet 5.5 $2 / $10.
 */
const PRICES = {
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

/** Stable JSON: object keys sorted, so the cache key doesn't depend on key order. */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function costOf(model, usage) {
  const price = PRICES[model];
  if (!price || !usage) return 0;
  const input =
    (usage.input_tokens || 0) +
    1.25 * (usage.cache_creation_input_tokens || 0) +
    0.1 * (usage.cache_read_input_tokens || 0);
  return (
    (input * price.input + (usage.output_tokens || 0) * price.output) / 1e6
  );
}

/** An error that carries the status and the API's message, and nothing else. */
function apiError(status, data, message) {
  const detail =
    data && data.error && data.error.message ? data.error.message : message;
  const error = new Error(`Claude API ${status || "error"}: ${detail}`);
  if (status) error.response = { status, data };
  return error;
}

class ClaudeCache {
  /**
   * @param {object} options
   * @param {string} [options.dir]
   * @param {string|null} [options.apiKey] - Needed only for uncached calls
   * @param {number} [options.capUSD=5] - Refuse new calls past this total
   */
  constructor({ dir = DEFAULT_DIR, apiKey = null, capUSD = 5 } = {}) {
    this.dir = dir;
    this.apiKey = apiKey;
    this.capUSD = capUSD;
    fs.mkdirSync(dir, { recursive: true });
    // What this process used: cache hits and new calls alike
    this.used = [];
  }

  key(body) {
    return sha256(stable(body));
  }

  file(key) {
    return path.join(this.dir, `${key}.json`);
  }

  read(key) {
    const file = this.file(key);
    return fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : null;
  }

  /** Every cached entry, i.e. every paid call ever made into this cache. */
  entries() {
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf8")));
  }

  /** Total spend over every cached call. */
  spentUSD() {
    return this.entries().reduce(
      (sum, e) => sum + costOf(e.model, e.response && e.response.usage),
      0,
    );
  }

  /**
   * POST /v1/messages with `body`, from the cache when it holds the same
   * body. Resolves to { status, data, latencyMs, cached }.
   */
  async messages(body) {
    const key = this.key(body);
    const hit = this.read(key);
    if (hit) {
      this.used.push(hit);
      return { ...hit.http, cached: true };
    }
    if (!this.apiKey) {
      throw new Error(
        "Not in the cache and no API key: see __tests__/live/live-env.js",
      );
    }
    const spent = this.spentUSD();
    if (spent >= this.capUSD) {
      throw new Error(
        `Spend cap reached: US$${spent.toFixed(4)} of US$${this.capUSD}`,
      );
    }
    const started = Date.now();
    let res;
    try {
      res = await fetch(`${API}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      // fetch errors don't carry the request headers, but keep only the message
      throw apiError(null, null, error.message);
    }
    const data = await res.json().catch(() => null);
    const latencyMs = Date.now() - started;
    if (!res.ok) throw apiError(res.status, data, res.statusText);
    const entry = {
      model: body.model,
      createdAt: new Date().toISOString(),
      request: body,
      response: data,
      http: { status: res.status, data, latencyMs },
    };
    fs.writeFileSync(this.file(key), JSON.stringify(entry) + "\n");
    this.used.push(entry);
    return { ...entry.http, cached: false };
  }

  /**
   * An axios adapter for a connector's client (`connector.client.defaults.adapter`),
   * so the library's own connector code builds the request and parses the
   * reply while the call goes through this cache. `onCall` receives
   * { latencyMs, usage, cached } for each call.
   */
  axiosAdapter(onCall) {
    return async (config) => {
      const body = JSON.parse(config.data);
      // messages() throws its own errors, without the config or headers an
      // axios error would carry (and with them the API key)
      const r = await this.messages(body);
      if (onCall) {
        onCall({
          latencyMs: r.latencyMs,
          usage: r.data.usage,
          stopReason: r.data.stop_reason,
          cached: r.cached,
        });
      }
      return {
        data: r.data,
        status: r.status,
        statusText: "OK",
        headers: {},
        config,
        request: {},
      };
    };
  }

  /** Calls, tokens and cost of what this process used. */
  usageSummary(filter = () => true) {
    const out = {};
    for (const e of this.used.filter(filter)) {
      const m = (out[e.model] = out[e.model] || {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUSD: 0,
      });
      const u = e.response.usage || {};
      m.calls += 1;
      m.inputTokens += u.input_tokens || 0;
      m.outputTokens += u.output_tokens || 0;
      m.costUSD += costOf(e.model, u);
    }
    for (const m of Object.values(out))
      m.costUSD = Number(m.costUSD.toFixed(4));
    return out;
  }
}

module.exports = { ClaudeCache, PRICES, costOf, stable };
