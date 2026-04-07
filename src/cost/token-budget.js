"use strict";

const { EventEmitter } = require("events");

/**
 * Default budget configuration.
 * @type {{maxTokens: number, maxCost: number, softLimitPercent: number, trackingWindow: number}}
 */
const DEFAULT_CONFIG = {
  maxTokens: Infinity,
  maxCost: Infinity,
  softLimitPercent: 0.8, // warn at 80% of limit
  trackingWindow: 0, // 0 = no windowing, else ms for sliding window
};

/**
 * Configurable token and cost budgets with hard and soft limits.
 *
 * Emits:
 * - `usage`    — after every {@link record} call with the recorded entry.
 * - `warning`  — when usage crosses the soft limit threshold.
 * - `exceeded` — when usage crosses a hard limit.
 *
 * @example
 * const budget = new TokenBudget({ maxTokens: 100000, maxCost: 5.0 });
 * budget.on('warning', (msg) => console.warn(msg));
 * const status = budget.check(2000, 0.10);
 * if (status.allowed) budget.record(2000, 0.10);
 */
class TokenBudget extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {number} [options.maxTokens=Infinity] - Hard token limit.
   * @param {number} [options.maxCost=Infinity] - Hard cost limit (USD).
   * @param {number} [options.softLimitPercent=0.8] - Fraction (0-1) at which soft-limit warnings fire.
   * @param {number} [options.trackingWindow=0] - Sliding window in ms (0 disables).
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.usage = { tokens: 0, cost: 0, operations: 0, history: [] };
  }

  /**
   * Prune history entries outside the sliding window.
   * @private
   */
  _pruneWindow() {
    if (this.config.trackingWindow <= 0) return;

    const cutoff = Date.now() - this.config.trackingWindow;
    this.usage.history = this.usage.history.filter(
      (h) => h.timestamp >= cutoff,
    );

    // Recompute totals from remaining history
    this.usage.tokens = this.usage.history.reduce(
      (sum, h) => sum + h.tokens,
      0,
    );
    this.usage.cost = this.usage.history.reduce((sum, h) => sum + h.cost, 0);
    this.usage.operations = this.usage.history.length;
  }

  /**
   * Check whether a prospective usage fits within the budget.
   *
   * @param {number} [tokens=0] - Tokens about to be consumed.
   * @param {number} [cost=0] - Cost about to be incurred.
   * @returns {{allowed: boolean, reason?: string, remaining: {tokens: number, cost: number},
   *            warnings: string[], usage: {tokens: number, cost: number, operations: number}}}
   */
  check(tokens = 0, cost = 0) {
    this._pruneWindow();

    const projectedTokens = this.usage.tokens + tokens;
    const projectedCost = this.usage.cost + cost;
    const warnings = [];

    // Hard-limit checks
    if (projectedTokens > this.config.maxTokens) {
      return {
        allowed: false,
        reason: `Token limit exceeded: ${projectedTokens} > ${this.config.maxTokens}`,
        remaining: {
          tokens: Math.max(0, this.config.maxTokens - this.usage.tokens),
          cost: Math.max(0, this.config.maxCost - this.usage.cost),
        },
        warnings,
        usage: {
          tokens: this.usage.tokens,
          cost: this.usage.cost,
          operations: this.usage.operations,
        },
      };
    }

    if (projectedCost > this.config.maxCost) {
      return {
        allowed: false,
        reason: `Cost limit exceeded: ${projectedCost.toFixed(4)} > ${this.config.maxCost}`,
        remaining: {
          tokens: Math.max(0, this.config.maxTokens - this.usage.tokens),
          cost: Math.max(0, this.config.maxCost - this.usage.cost),
        },
        warnings,
        usage: {
          tokens: this.usage.tokens,
          cost: this.usage.cost,
          operations: this.usage.operations,
        },
      };
    }

    // Soft-limit checks
    const softTokens = this.config.maxTokens * this.config.softLimitPercent;
    const softCost = this.config.maxCost * this.config.softLimitPercent;

    if (isFinite(this.config.maxTokens) && projectedTokens > softTokens) {
      warnings.push(
        `Approaching token limit: ${projectedTokens} / ${this.config.maxTokens} (${((projectedTokens / this.config.maxTokens) * 100).toFixed(1)}%)`,
      );
    }

    if (isFinite(this.config.maxCost) && projectedCost > softCost) {
      warnings.push(
        `Approaching cost limit: $${projectedCost.toFixed(4)} / $${this.config.maxCost} (${((projectedCost / this.config.maxCost) * 100).toFixed(1)}%)`,
      );
    }

    return {
      allowed: true,
      remaining: {
        tokens: isFinite(this.config.maxTokens)
          ? this.config.maxTokens - projectedTokens
          : Infinity,
        cost: isFinite(this.config.maxCost)
          ? this.config.maxCost - projectedCost
          : Infinity,
      },
      warnings,
      usage: {
        tokens: this.usage.tokens,
        cost: this.usage.cost,
        operations: this.usage.operations,
      },
    };
  }

  /**
   * Record actual token and cost usage.
   *
   * @param {number} tokens - Tokens consumed.
   * @param {number} [cost=0] - Cost incurred (USD).
   */
  record(tokens, cost = 0) {
    const entry = { tokens, cost, timestamp: Date.now() };
    this.usage.history.push(entry);
    this.usage.tokens += tokens;
    this.usage.cost += cost;
    this.usage.operations += 1;

    this.emit("usage", entry);

    // Soft-limit warnings
    if (isFinite(this.config.maxTokens)) {
      const softTokens = this.config.maxTokens * this.config.softLimitPercent;
      if (
        this.usage.tokens > softTokens &&
        this.usage.tokens <= this.config.maxTokens
      ) {
        this.emit(
          "warning",
          `Token usage at ${((this.usage.tokens / this.config.maxTokens) * 100).toFixed(1)}% of limit`,
        );
      }
    }

    if (isFinite(this.config.maxCost)) {
      const softCost = this.config.maxCost * this.config.softLimitPercent;
      if (
        this.usage.cost > softCost &&
        this.usage.cost <= this.config.maxCost
      ) {
        this.emit(
          "warning",
          `Cost usage at ${((this.usage.cost / this.config.maxCost) * 100).toFixed(1)}% of limit`,
        );
      }
    }

    // Hard-limit exceeded
    if (this.usage.tokens > this.config.maxTokens) {
      this.emit(
        "exceeded",
        `Token limit exceeded: ${this.usage.tokens} > ${this.config.maxTokens}`,
      );
    }

    if (this.usage.cost > this.config.maxCost) {
      this.emit(
        "exceeded",
        `Cost limit exceeded: ${this.usage.cost.toFixed(4)} > ${this.config.maxCost}`,
      );
    }
  }

  /**
   * Reset all usage counters to zero.
   */
  reset() {
    this.usage = { tokens: 0, cost: 0, operations: 0, history: [] };
  }

  /**
   * Return current usage summary.
   *
   * @returns {{tokens: number, cost: number, operations: number,
   *            limits: {maxTokens: number, maxCost: number},
   *            remaining: {tokens: number, cost: number}}}
   */
  getUsage() {
    this._pruneWindow();

    return {
      tokens: this.usage.tokens,
      cost: this.usage.cost,
      operations: this.usage.operations,
      limits: {
        maxTokens: this.config.maxTokens,
        maxCost: this.config.maxCost,
      },
      remaining: {
        tokens: isFinite(this.config.maxTokens)
          ? Math.max(0, this.config.maxTokens - this.usage.tokens)
          : Infinity,
        cost: isFinite(this.config.maxCost)
          ? Math.max(0, this.config.maxCost - this.usage.cost)
          : Infinity,
      },
    };
  }
}

module.exports = { TokenBudget, DEFAULT_CONFIG };
