"use strict";

/**
 * Trace Inspector
 *
 * Analyzes execution traces for bottlenecks and optimization opportunities.
 * Provides summary reports, comparisons, and anomaly detection across traces.
 */

const { EventEmitter } = require("events");

/**
 * Trace inspector that analyzes execution traces produced by ExecutionTracer
 * @extends EventEmitter
 */
class TraceInspector extends EventEmitter {
  /**
   * Create a new TraceInspector
   * @param {object} [options] - Inspector configuration
   */
  constructor(options = {}) {
    super();
    this.config = options;
  }

  /**
   * Analyze a single trace for performance and quality insights
   * @param {object} trace - Trace record from ExecutionTracer
   * @returns {object} Analysis result with summary, breakdown, bottleneck, quality, and recommendations
   */
  analyze(trace) {
    const totalDuration = trace.totalDurationMs || 0;
    const steps = trace.steps || [];

    // Time breakdown per step
    const timeBreakdown = {};
    for (const step of steps) {
      timeBreakdown[step.step] = step.durationMs || 0;
    }

    const stepDurationSum = steps.reduce(
      (sum, s) => sum + (s.durationMs || 0),
      0,
    );
    if (steps.length > 0) {
      timeBreakdown["overhead"] = Math.max(0, totalDuration - stepDurationSum);
    }

    // Identify bottleneck
    let bottleneck = null;
    if (steps.length > 0) {
      const slowest = steps.reduce((a, b) =>
        (a.durationMs || 0) >= (b.durationMs || 0) ? a : b,
      );
      bottleneck = {
        step: slowest.step,
        durationMs: slowest.durationMs || 0,
      };
    }

    // Result count
    const resultCount = (trace.metadata && trace.metadata.resultCount) || 0;

    // Quality metrics
    const qualityMetrics = {};
    const metadata = trace.metadata || {};

    if (metadata.citations) {
      const citations = metadata.citations;
      if (citations.groundedness !== undefined) {
        qualityMetrics.groundedness = citations.groundedness;
      }
      if (
        Array.isArray(citations) &&
        citations.length > 0 &&
        citations[0].groundedness !== undefined
      ) {
        qualityMetrics.groundedness = citations[0].groundedness;
      }
    }

    if (metadata.evaluation) {
      const evaluation = metadata.evaluation;
      if (evaluation.groundedness !== undefined) {
        qualityMetrics.groundedness = evaluation.groundedness;
      }
      if (evaluation.faithfulness !== undefined) {
        qualityMetrics.faithfulness = evaluation.faithfulness;
      }
      if (evaluation.relevance !== undefined) {
        qualityMetrics.relevance = evaluation.relevance;
      }
    }

    // Recommendations
    const recommendations = [];

    if (totalDuration > 5000) {
      recommendations.push("Consider caching frequent queries");
    }
    if (resultCount === 0) {
      recommendations.push(
        "No results retrieved - check retriever configuration",
      );
    }
    if (
      qualityMetrics.groundedness !== undefined &&
      qualityMetrics.groundedness < 0.5
    ) {
      recommendations.push(
        "Low groundedness - consider increasing retrieval topK",
      );
    }
    if (!metadata.hasCitations) {
      recommendations.push("Enable citations for source tracking");
    }
    if (!metadata.hasEvaluation) {
      recommendations.push("Enable evaluation for quality metrics");
    }

    const analysis = {
      summary: {
        totalDuration,
        stepCount: steps.length,
        resultCount,
      },
      timeBreakdown,
      bottleneck,
      qualityMetrics,
      recommendations,
    };

    this.emit("analyzed", analysis);
    return analysis;
  }

  /**
   * Compare multiple traces for consistency and trends
   * @param {Array<object>} traces - Array of trace records
   * @returns {object} Comparison result with averages, ranges, and quality trend
   */
  compare(traces) {
    if (!traces || traces.length === 0) {
      return {
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        avgResultCount: 0,
        qualityTrend: {},
      };
    }

    const durations = traces.map((t) => t.totalDurationMs || 0);
    const resultCounts = traces.map(
      (t) => (t.metadata && t.metadata.resultCount) || 0,
    );

    const sum = (arr) => arr.reduce((a, b) => a + b, 0);

    const avgDuration = sum(durations) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const avgResultCount = sum(resultCounts) / resultCounts.length;

    // Quality trend: collect quality metrics across traces
    const qualityTrend = {};
    const metricAccumulators = {};

    for (const trace of traces) {
      const metadata = trace.metadata || {};
      const evaluation = metadata.evaluation || {};
      for (const key of ["groundedness", "faithfulness", "relevance"]) {
        if (evaluation[key] !== undefined) {
          if (!metricAccumulators[key]) {
            metricAccumulators[key] = [];
          }
          metricAccumulators[key].push(evaluation[key]);
        }
      }
    }

    for (const [key, values] of Object.entries(metricAccumulators)) {
      qualityTrend[key] = sum(values) / values.length;
    }

    const comparison = {
      avgDuration,
      minDuration,
      maxDuration,
      avgResultCount,
      qualityTrend,
    };

    this.emit("compared", comparison);
    return comparison;
  }

  /**
   * Find anomalous traces that deviate significantly from the norm
   * @param {Array<object>} traces - Array of trace records
   * @returns {Array<object>} Array of anomaly descriptors with traceId, anomalyType, details
   */
  findAnomalies(traces) {
    if (!traces || traces.length === 0) {
      return [];
    }

    const anomalies = [];

    const durations = traces.map((t) => t.totalDurationMs || 0);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    const resultCounts = traces.map(
      (t) => (t.metadata && t.metadata.resultCount) || 0,
    );
    const hasResults = resultCounts.some((c) => c > 0);

    // Collect quality scores for average calculation
    const qualityScores = {};
    for (const trace of traces) {
      const evaluation = (trace.metadata && trace.metadata.evaluation) || {};
      for (const key of ["groundedness", "faithfulness", "relevance"]) {
        if (evaluation[key] !== undefined) {
          if (!qualityScores[key]) {
            qualityScores[key] = [];
          }
          qualityScores[key].push({
            traceId: trace.id,
            score: evaluation[key],
          });
        }
      }
    }

    const qualityAverages = {};
    for (const [key, entries] of Object.entries(qualityScores)) {
      qualityAverages[key] =
        entries.reduce((sum, e) => sum + e.score, 0) / entries.length;
    }

    for (const trace of traces) {
      const duration = trace.totalDurationMs || 0;
      const resultCount = (trace.metadata && trace.metadata.resultCount) || 0;

      // Duration > 2x average
      if (avgDuration > 0 && duration > 2 * avgDuration) {
        anomalies.push({
          traceId: trace.id,
          anomalyType: "slow_execution",
          details: `Duration ${duration}ms is more than 2x the average ${Math.round(avgDuration)}ms`,
        });
      }

      // Zero results when others have results
      if (hasResults && resultCount === 0) {
        anomalies.push({
          traceId: trace.id,
          anomalyType: "no_results",
          details: "No results retrieved while other traces returned results",
        });
      }

      // Quality score significantly lower than average (> 0.3 below)
      const evaluation = (trace.metadata && trace.metadata.evaluation) || {};
      for (const [key, avg] of Object.entries(qualityAverages)) {
        if (evaluation[key] !== undefined && evaluation[key] < avg - 0.3) {
          anomalies.push({
            traceId: trace.id,
            anomalyType: "low_quality",
            details: `${key} score ${evaluation[key].toFixed(2)} is significantly below average ${avg.toFixed(2)}`,
          });
        }
      }
    }

    this.emit("anomaliesFound", anomalies);
    return anomalies;
  }
}

module.exports = { TraceInspector };
