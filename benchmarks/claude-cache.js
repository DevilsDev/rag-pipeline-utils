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
 * US$ per million tokens, standard tier, from
 * https://platform.claude.com/docs/en/about-claude/pricing (checked
 * 2026-11-05). Cache writes cost 1.25x input (5 minutes) or 2x (1 hour);
 * cache reads have their own price. Claude Haiku 5.5 costs more for
 * prompts over 100k tokens (`above100k`).
 */
const PRICES = {
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    above100k: { input: 0.5, output: 2.5, cacheRead: 0.05 },
  },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cacheRead: 0.1 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
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

/** The price of `model`; throws for a model with no price, never assumes 0. */
function priceOf(model) {
  const price = PRICES[model];
  if (!price)
    throw new Error(`No price for model "${model}"; add it to PRICES`);
  return price;
}

function costOf(model, usage) {
  let price = priceOf(model);
  if (!usage) throw new Error(`No usage in a ${model} response`);
  const read = usage.cache_read_input_tokens || 0;
  const creation = usage.cache_creation || {};
  const write1h = creation.ephemeral_1h_input_tokens || 0;
  const write5m = (usage.cache_creation_input_tokens || 0) - write1h;
  const prompt = (usage.input_tokens || 0) + read + write5m + write1h;
  if (price.above100k && prompt > 100000) price = price.above100k;
  const input =
    (usage.input_tokens || 0) * price.input +
    write5m * 1.25 * price.input +
    write1h * 2 * price.input +
    read * price.cacheRead;
  return (input + (usage.output_tokens || 0) * price.output) / 1e6;
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
   * @param {number} [options.capUSD=90] - Refuse new calls past this total
   */
  constructor({ dir = DEFAULT_DIR, apiKey = null, capUSD = 90 } = {}) {
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
    if (this.spent === undefined) {
      this.spent = this.entries().reduce(
        (sum, e) => sum + costOf(e.model, e.response && e.response.usage),
        0,
      );
    }
    return this.spent;
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
    priceOf(body.model); // throws before any call to an unpriced model
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
    this.spent = this.spentUSD() + costOf(entry.model, data.usage);
    this.used.push(entry);
    return { ...entry.http, cached: false };
  }

  /**
   * An axios adapter for a connector's client (`connector.client.defaults.adapter`),
   * so the library's own connector code builds the request and parses the
   * reply while the call goes through this cache. `onCall` receives
   * { latencyMs, usage, cached } for each call.
   */
  axiosAdapter(onCall, { omitTemperature = false } = {}) {
    return async (config) => {
      const body = JSON.parse(config.data);
      // Workaround, not a fix: AnthropicConnector sends the judge's
      // temperature 0, which Claude Sonnet 5.5, Opus 5.5 and Fable 5.1
      // reject with a 400. The rest of the body is the connector's own.
      if (omitTemperature) delete body.temperature;
      // messages() throws its own errors, without the config or headers an
      // axios error would carry (and with them the API key)
      const r = await this.messages(body);
      if (onCall) {
        onCall({
          latencyMs: r.latencyMs,
          usage: r.data.usage,
          stopReason: r.data.stop_reason,
          firstBlock:
            r.data.content && r.data.content[0] && r.data.content[0].type,
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

module.exports = { ClaudeCache, PRICES, costOf, priceOf, stable };
