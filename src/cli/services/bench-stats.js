"use strict";

/**
 * Summary statistics for latency samples measured by `rag-pipeline ai
 * benchmark`. Pure functions so the math can be unit-tested.
 */

/**
 * Nearest-rank percentile: the smallest sample such that at least p% of the
 * samples are less than or equal to it. Always returns an observed value.
 *
 * @param {number[]} samples - Unsorted samples (not modified)
 * @param {number} p - Percentile in (0, 100]
 * @returns {number}
 */
function percentile(samples, p) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error("percentile() needs at least one sample");
  }
  if (!(p > 0 && p <= 100)) {
    throw new Error(`Percentile must be in (0, 100], got ${p}`);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[rank - 1];
}

/**
 * @param {number[]} samples
 * @returns {number} Arithmetic mean
 */
function mean(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error("mean() needs at least one sample");
  }
  return samples.reduce((sum, x) => sum + x, 0) / samples.length;
}

/**
 * @param {number[]} samples - Latencies in milliseconds
 * @returns {{count: number, mean: number, p50: number, p95: number, min: number, max: number}}
 */
function summarize(samples) {
  return {
    count: samples.length,
    mean: mean(samples),
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    min: Math.min(...samples),
    max: Math.max(...samples),
  };
}

module.exports = { percentile, mean, summarize };
