/**
 * Performance Profiler
 *
 * Detailed bottleneck analysis and performance monitoring for RAG pipelines.
 * Provides comprehensive metrics, flame graphs, and optimization recommendations.
 */

const EventEmitter = require("events");
// eslint-disable-line global-require
const fs = require("fs").promises;
// eslint-disable-line global-require
const path = require("path");
// eslint-disable-line global-require

class PerformanceProfiler extends EventEmitter {
  constructor(_options = {}) {
    super();

    this._options = {
      enableCPUProfiling: _options.enableCPUProfiling !== false,
      enableMemoryProfiling: _options.enableMemoryProfiling !== false,
      enableNetworkProfiling: _options.enableNetworkProfiling !== false,
      sampleInterval: _options.sampleInterval || 100, // ms
      maxSamples: _options.maxSamples || 10000,
      outputDir: _options.outputDir || "./profiling-reports",
      ..._options,
    };

    this.profiles = new Map();
    this.currentProfile = null;
    this.samples = [];
    this.metrics = new Map();
    this.isProfileing = false;

    this.initializeProfiler();
  }

  /**
   * Initialize profiler components
   */
  initializeProfiler() {
    this.baselineMetrics = {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      timestamp: Date.now(),
    };

    this.performanceCounters = {
      totalExecutions: 0,
      totalDuration: 0,
      averageDuration: 0,
      minDuration: Infinity,
      maxDuration: 0,
      errorCount: 0,
      successCount: 0,
    };
  }

  /**
   * Start profiling session
   */
  startProfiling(sessionId, _config = {}) {
    if (this.isProfileing) {
      throw new Error("Profiling session already active");
    }

    const profile = {
      id: sessionId,
      _config,
      startTime: Date.now(),
      endTime: null,
      samples: [],
      metrics: new Map(),
      components: new Map(),
      flamegraph: null,
      recommendations: [],
      status: "active",
    };

    this.profiles.set(sessionId, profile);
    this.currentProfile = profile;
    this.isProfileing = true;
    this.samples = [];

    // Start sampling if enabled
    if (
      this._options.enableCPUProfiling ||
      this._options.enableMemoryProfiling
    ) {
      this.startSampling();
    }

    this.emit("profilingStarted", { sessionId, profile });

    return sessionId;
  }

  /**
   * Start performance sampling
   */
  startSampling() {
    this.samplingInterval = setInterval(() => {
      if (
        !this.isProfileing ||
        this.samples.length >= this._options.maxSamples
      ) {
        return;
      }

      const sample = this.collectSample();
      this.samples.push(sample);
      this.currentProfile.samples.push(sample);
    }, this._options.sampleInterval);
  }

  /**
   * Collect performance sample
   */
  collectSample() {
    const timestamp = Date.now();
    const sample = {
      timestamp,
      relativeTime: timestamp - this.currentProfile.startTime,
    };

    // CPU metrics
    if (this._options.enableCPUProfiling) {
      const cpuUsage = process.cpuUsage();
      sample.cpu = {
        user: cpuUsage.user,
        system: cpuUsage.system,
        userDelta: cpuUsage.user - this.baselineMetrics.cpu.user,
        systemDelta: cpuUsage.system - this.baselineMetrics.cpu.system,
      };
    }

    // Memory metrics
    if (this._options.enableMemoryProfiling) {
      const memoryUsage = process.memoryUsage();
      sample.memory = {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
        heapUsedDelta:
          memoryUsage.heapUsed - this.baselineMetrics.memory.heapUsed,
        rssDelta: memoryUsage.rss - this.baselineMetrics.memory.rss,
      };
    }

    // Event loop lag
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
      sample.eventLoopLag = lag;
    });

    return sample;
  }

  /**
   * Profile component execution
   */
  async profileComponent(
    componentId,
    componentType,
    executionFunc,
    input = null,
  ) {
    if (!this.isProfileing) {
      throw new Error("No active profiling session");
    }

    const componentProfile = {
      id: componentId,
      _type: componentType,
      executions: [],
      totalDuration: 0,
      averageDuration: 0,
      minDuration: Infinity,
      maxDuration: 0,
      errorCount: 0,
      successCount: 0,
      memoryPeak: 0,
      cpuUsage: { user: 0, system: 0 },
    };

    const executionId = `exec_${Date.now()}`;
    const execution = {
      id: executionId,
      startTime: Date.now(),
      startMemory: process.memoryUsage(),
      startCpu: process.cpuUsage(),
      input: this.serializeInput(input),
      output: null,
      error: null,
      duration: 0,
      memoryUsage: null,
      cpuUsage: null,
      networkCalls: [],
      customMetrics: new Map(),
    };

    componentProfile.executions.push(execution);

    try {
      // Execute the component function
      const startHrTime = process.hrtime.bigint();
      const result = await executionFunc();
      const endHrTime = process.hrtime.bigint();

      // Calculate metrics
      execution.duration = Number(endHrTime - startHrTime) / 1000000; // Convert to ms
      execution.endTime = Date.now();
      execution.endMemory = process.memoryUsage();
      execution.endCpu = process.cpuUsage(execution.startCpu);
      execution.output = this.serializeOutput(result);

      // Update component profile
      componentProfile.totalDuration += execution.duration;
      componentProfile.successCount++;
      componentProfile.minDuration = Math.min(
        componentProfile.minDuration,
        execution.duration,
      );
      componentProfile.maxDuration = Math.max(
        componentProfile.maxDuration,
        execution.duration,
      );
      componentProfile.averageDuration =
        componentProfile.totalDuration /
        (componentProfile.successCount + componentProfile.errorCount);

      // Memory metrics
      const memoryDelta =
        execution.endMemory.heapUsed - execution.startMemory.heapUsed;
      componentProfile.memoryPeak = Math.max(
        componentProfile.memoryPeak,
        execution.endMemory.heapUsed,
      );

      // CPU metrics
      componentProfile.cpuUsage.user += execution.endCpu.user;
      componentProfile.cpuUsage.system += execution.endCpu.system;

      this.emit("componentProfiled", {
        componentId,
        executionId,
        duration: execution.duration,
        memoryDelta,
        success: true,
      });

      return result;
    } catch (error) {
      execution.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;

      componentProfile.errorCount++;
      componentProfile.averageDuration =
        componentProfile.totalDuration /
        (componentProfile.successCount + componentProfile.errorCount);

      this.emit("componentProfiled", {
        componentId,
        executionId,
        duration: execution.duration,
        error: error.message,
        success: false,
      });

      throw error;
    } finally {
      // Store component profile
      this.currentProfile.components.set(componentId, componentProfile);
    }
  }

  /**
   * Add custom metric
   */
  addMetric(name, value, tags = {}) {
    if (!this.isProfileing) {
      return;
    }

    const metric = {
      name,
      value,
      tags,
      timestamp: Date.now(),
      relativeTime: Date.now() - this.currentProfile.startTime,
    };

    if (!this.currentProfile.metrics.has(name)) {
      this.currentProfile.metrics.set(name, []);
    }

    this.currentProfile.metrics.get(name).push(metric);
    this.emit("metricAdded", { name, value, tags });
  }

  /**
   * Profile network call
   */
  profileNetworkCall(
    url,
    method,
    duration,
    statusCode,
    requestSize = 0,
    responseSize = 0,
  ) {
    if (!this.isProfileing || !this._options.enableNetworkProfiling) {
      return;
    }

    const networkCall = {
      url,
      method,
      duration,
      statusCode,
      requestSize,
      responseSize,
      timestamp: Date.now(),
      relativeTime: Date.now() - this.currentProfile.startTime,
    };

    // Add to current execution if available
    const currentComponent = Array.from(
      this.currentProfile.components.values(),
    ).pop();
    if (currentComponent && currentComponent.executions.length > 0) {
      const currentExecution =
        currentComponent.executions[currentComponent.executions.length - 1];
      currentExecution.networkCalls.push(networkCall);
    }

    this.emit("networkCallProfiled", networkCall);
  }

  /**
   * Stop profiling session
   */
  stopProfiling() {
    if (!this.isProfileing) {
      throw new Error("No active profiling session");
    }

    this.isProfileing = false;

    if (this.samplingInterval) {
      clearInterval(this.samplingInterval);
      this.samplingInterval = null;
    }

    this.currentProfile.endTime = Date.now();
    this.currentProfile.status = "completed";

    // Generate analysis
    this.analyzeProfile(this.currentProfile);

    const sessionId = this.currentProfile.id;
    this.emit("profilingStopped", { sessionId, profile: this.currentProfile });

    this.currentProfile = null;

    return sessionId;
  }

  /**
   * Analyze profile data
   */
  analyzeProfile(profile) {
    const analysis = {
      summary: this.generateSummary(profile),
      bottlenecks: this.identifyBottlenecks(profile),
      recommendations: this.generateRecommendations(profile),
      flamegraph: this.generateFlamegraph(profile),
      trends: this.analyzeTrends(profile),
    };

    profile.analysis = analysis;
    return analysis;
  }

  /**
   * Generate profile summary
   */
  generateSummary(profile) {
    const totalDuration = profile.endTime - profile.startTime;
    const components = Array.from(profile.components.values());

    const totalExecutions = components.reduce(
      (sum, comp) => sum + comp.executions.length,
      0,
    );
    const totalErrors = components.reduce(
      (sum, comp) => sum + comp.errorCount,
      0,
    );
    const avgComponentDuration =
      components.reduce((sum, comp) => sum + comp.averageDuration, 0) /
      components.length;

    const memoryPeak = Math.max(
      ...profile.samples.map((s) => s.memory?.heapUsed || 0),
    );
    const memoryGrowth =
      profile.samples.length > 0
        ? profile.samples[profile.samples.length - 1].memory?.heapUsed -
          profile.samples[0].memory?.heapUsed
        : 0;

    return {
      totalDuration,
      totalExecutions,
      totalErrors,
      errorRate:
        totalExecutions > 0 ? (totalErrors / totalExecutions) * 100 : 0,
      avgComponentDuration,
      memoryPeak,
      memoryGrowth,
      samplesCollected: profile.samples.length,
      componentsProfiled: components.length,
    };
  }

  /**
   * Identify performance bottlenecks
   */
  identifyBottlenecks(profile) {
    const components = Array.from(profile.components.values());
    const bottlenecks = [];

    // Slow components
    const avgDuration =
      components.reduce((sum, comp) => sum + comp.averageDuration, 0) /
      components.length;
    const slowComponents = components.filter(
      (comp) => comp.averageDuration > avgDuration * 2,
    );

    slowComponents.forEach((comp) => {
      bottlenecks.push({
        _type: "slow_component",
        severity: "high",
        component: comp.id,
        description: `Component ${comp.id} is ${(comp.averageDuration / avgDuration).toFixed(1)}x slower than average`,
        metric: "duration",
        value: comp.averageDuration,
        threshold: avgDuration * 2,
      });
    });

    // Memory leaks
    if (profile.samples.length > 10) {
      const memoryTrend = this.calculateTrend(
        profile.samples.map((s) => s.memory?.heapUsed || 0),
      );
      if (memoryTrend > 0.1) {
        // Growing trend
        bottlenecks.push({
          _type: "memory_leak",
          severity: "medium",
          description:
            "Potential memory leak detected - heap usage is consistently growing",
          metric: "memory_growth_rate",
          value: memoryTrend,
          threshold: 0.1,
        });
      }
    }

    // High error rates
    const highErrorComponents = components.filter((comp) => {
      const totalExecs = comp.successCount + comp.errorCount;
      return totalExecs > 0 && comp.errorCount / totalExecs > 0.1;
    });

    highErrorComponents.forEach((comp) => {
      const errorRate =
        (comp.errorCount / (comp.successCount + comp.errorCount)) * 100;
      bottlenecks.push({
        _type: "high_error_rate",
        severity: "high",
        component: comp.id,
        description: `Component ${comp.id} has high error rate: ${errorRate.toFixed(1)}%`,
        metric: "error_rate",
        value: errorRate,
        threshold: 10,
      });
    });

    // Event loop lag
    const avgEventLoopLag =
      profile.samples
        .filter((s) => s.eventLoopLag !== undefined)
        .reduce((sum, s) => sum + s.eventLoopLag, 0) / profile.samples.length;

    if (avgEventLoopLag > 10) {
      // More than 10ms average lag
      bottlenecks.push({
        _type: "event_loop_lag",
        severity: "medium",
        description: `High event loop lag detected: ${avgEventLoopLag.toFixed(1)}ms average`,
        metric: "event_loop_lag",
        value: avgEventLoopLag,
        threshold: 10,
      });
    }

    return bottlenecks.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(profile) {
    const recommendations = [];
    const bottlenecks = this.identifyBottlenecks(profile);

    bottlenecks.forEach((bottleneck) => {
      switch (bottleneck._type) {
        case "slow_component":
          recommendations.push({
            priority: "high",
            category: "performance",
            title: `Optimize ${bottleneck.component} component`,
            description: `Consider caching, parallel processing, or algorithm optimization for ${bottleneck.component}`,
            impact: "high",
            effort: "medium",
          });
          break;

        case "memory_leak":
          recommendations.push({
            priority: "high",
            category: "memory",
            title: "Investigate memory leak",
            description:
              "Review object lifecycle management and ensure proper cleanup of resources",
            impact: "high",
            effort: "high",
          });
          break;

        case "high_error_rate":
          recommendations.push({
            priority: "critical",
            category: "reliability",
            title: `Fix error handling in ${bottleneck.component}`,
            description: "Improve error handling and add retry mechanisms",
            impact: "high",
            effort: "medium",
          });
          break;

        case "event_loop_lag":
          recommendations.push({
            priority: "medium",
            category: "concurrency",
            title: "Reduce event loop blocking",
            description:
              "Move CPU-intensive operations to worker threads or break into smaller chunks",
            impact: "medium",
            effort: "medium",
          });
          break;
      }
    });

    // General recommendations
    const components = Array.from(profile.components.values());
    const totalNetworkCalls = components.reduce(
      (sum, comp) =>
        sum +
        comp.executions.reduce(
          (execSum, exec) => execSum + exec.networkCalls.length,
          0,
        ),
      0,
    );

    if (totalNetworkCalls > 10) {
      recommendations.push({
        priority: "medium",
        category: "network",
        title: "Optimize network calls",
        description:
          "Consider request batching, connection pooling, or caching for frequent API calls",
        impact: "medium",
        effort: "low",
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Generate flamegraph data
   */
  generateFlamegraph(profile) {
    const components = Array.from(profile.components.values());
    const flamegraphData = {
      name: "Pipeline",
      value: profile.endTime - profile.startTime,
      children: [],
    };

    components.forEach((component) => {
      const componentNode = {
        name: component.id,
        value: component.totalDuration,
        children: [],
      };

      // Group executions by similar duration
      const executionGroups = this.groupExecutionsByDuration(
        component.executions,
      );

      executionGroups.forEach((group) => {
        componentNode.children.push({
          name: `${group.executions.length} executions`,
          value: group.totalDuration,
          avgDuration: group.avgDuration,
          count: group.executions.length,
        });
      });

      flamegraphData.children.push(componentNode);
    });

    return flamegraphData;
  }

  /**
   * Group executions by similar duration for flamegraph
   */
  groupExecutionsByDuration(executions) {
    const groups = [];
    const sortedExecutions = executions.sort((a, b) => a.duration - b.duration);

    let currentGroup = null;

    sortedExecutions.forEach((execution) => {
      if (
        !currentGroup ||
        Math.abs(execution.duration - currentGroup.avgDuration) >
          currentGroup.avgDuration * 0.5
      ) {
        currentGroup = {
          executions: [execution],
          totalDuration: execution.duration,
          avgDuration: execution.duration,
        };
        groups.push(currentGroup);
      } else {
        currentGroup.executions.push(execution);
        currentGroup.totalDuration += execution.duration;
        currentGroup.avgDuration =
          currentGroup.totalDuration / currentGroup.executions.length;
      }
    });

    return groups;
  }

  /**
   * Analyze trends in performance data
   */
  analyzeTrends(profile) {
    const trends = {};

    if (profile.samples.length > 5) {
      // Memory trend
      const memoryValues = profile.samples.map((s) => s.memory?.heapUsed || 0);
      trends.memory = {
        trend: this.calculateTrend(memoryValues),
        direction: this.getTrendDirection(memoryValues),
        volatility: this.calculateVolatility(memoryValues),
      };

      // CPU trend
      const cpuValues = profile.samples.map(
        (s) => (s.cpu?.userDelta || 0) + (s.cpu?.systemDelta || 0),
      );
      trends.cpu = {
        trend: this.calculateTrend(cpuValues),
        direction: this.getTrendDirection(cpuValues),
        volatility: this.calculateVolatility(cpuValues),
      };

      // Event loop lag trend
      const lagValues = profile.samples
        .filter((s) => s.eventLoopLag !== undefined)
        .map((s) => s.eventLoopLag);
      if (lagValues.length > 0) {
        trends.eventLoopLag = {
          trend: this.calculateTrend(lagValues),
          direction: this.getTrendDirection(lagValues),
          volatility: this.calculateVolatility(lagValues),
        };
      }
    }

    return trends;
  }

  /**
   * Calculate trend (linear regression slope)
   */
  calculateTrend(values) {
    if (values.length < 2) return 0;

    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, i) => sum + i * val, 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  /**
   * Get trend direction
   */
  getTrendDirection(values) {
    const trend = this.calculateTrend(values);
    if (Math.abs(trend) < 0.01) return "stable";
    return trend > 0 ? "increasing" : "decreasing";
  }

  /**
   * Calculate volatility (standard deviation)
   */
  calculateVolatility(values) {
    if (values.length < 2) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      values.length;
    return Math.sqrt(variance);
  }

  /**
   * Export profile report
   */
  async exportReport(sessionId, format = "json") {
    const profile = this.profiles.get(sessionId);
    if (!profile) {
      throw new Error(`Profile ${sessionId} not found`);
    }

    await fs.mkdir(this._options.outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `profile-${sessionId}-${timestamp}`;

    if (format === "json") {
      const _filePath = path.join(this._options.outputDir, `${filename}.json`);
      await fs.writeFile(_filePath, JSON.stringify(profile, null, 2));
      return _filePath;
    } else if (format === "html") {
      const htmlReport = this.generateHTMLReport(profile);
      const _filePath = path.join(this._options.outputDir, `${filename}.html`);
      await fs.writeFile(_filePath, htmlReport);
      return _filePath;
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Generate HTML report
   */
  generateHTMLReport(profile) {
    const summary = profile.analysis?.summary || {};
    const bottlenecks = profile.analysis?.bottlenecks || [];
    const recommendations = profile.analysis?.recommendations || [];

    return `<!DOCTYPE html>
<html>
<head>
    <title>Performance Profile Report - ${profile.id}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #e9ecef; border-radius: 3px; }
        .bottleneck { padding: 10px; margin: 5px 0; border-left: 4px solid #dc3545; background: #f8d7da; }
        .recommendation { padding: 10px; margin: 5px 0; border-left: 4px solid #28a745; background: #d4edda; }
        .high { border-color: #dc3545; }
        .medium { border-color: #ffc107; }
        .low { border-color: #28a745; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Performance Profile Report</h1>
        <p><strong>Session:</strong> ${profile.id}</p>
        <p><strong>Duration:</strong> ${summary.totalDuration || 0}ms</p>
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
    </div>
    
    <div class="section">
        <h2>Summary</h2>
        <div class="metric">Total Executions: ${summary.totalExecutions || 0}</div>
        <div class="metric">Error Rate: ${(summary.errorRate || 0).toFixed(1)}%</div>
        <div class="metric">Avg Duration: ${(summary.avgComponentDuration || 0).toFixed(1)}ms</div>
        <div class="metric">Memory Peak: ${Math.round((summary.memoryPeak || 0) / 1024 / 1024)}MB</div>
    </div>
    
    <div class="section">
        <h2>Bottlenecks</h2>
        ${bottlenecks
          .map(
            (b) => `
            <div class="bottleneck ${b.severity}">
                <strong>${b._type.replace(/_/g, " ").toUpperCase()}</strong>: ${b.description}
            </div>
        `,
          )
          .join("")}
    </div>
    
    <div class="section">
        <h2>Recommendations</h2>
        ${recommendations
          .map(
            (r) => `
            <div class="recommendation ${r.priority}">
                <strong>${r.title}</strong>: ${r.description}
                <br><small>Impact: ${r.impact}, Effort: ${r.effort}</small>
            </div>
        `,
          )
          .join("")}
    </div>
</body>
</html>`;
  }

  /**
   * Serialize input for storage
   */
  serializeInput(input) {
    try {
      return JSON.parse(JSON.stringify(input));
    } catch (error) {
      return {
        _serializationError: "Unable to serialize input",
        _type: typeof input,
      };
    }
  }

  /**
   * Serialize output for storage
   */
  serializeOutput(output) {
    try {
      return JSON.parse(JSON.stringify(output));
    } catch (error) {
      return {
        _serializationError: "Unable to serialize output",
        _type: typeof output,
      };
    }
  }

  /**
   * Get all profiles
   */
  getAllProfiles() {
    return Array.from(this.profiles.values());
  }

  /**
   * Get profile by ID
   */
  getProfile(sessionId) {
    return this.profiles.get(sessionId);
  }

  /**
   * Clear old profiles
   */
  clearProfiles(olderThanMs = 24 * 60 * 60 * 1000) {
    // 24 hours default
    const cutoffTime = Date.now() - olderThanMs;

    for (const [sessionId, profile] of this.profiles) {
      if (profile.startTime < cutoffTime) {
        this.profiles.delete(sessionId);
      }
    }
  }

  /**
   * Get profiler status
   */
  getStatus() {
    return {
      isProfileing: this.isProfileing,
      currentProfile: this.currentProfile?.id || null,
      totalProfiles: this.profiles.size,
      samplesCollected: this.samples.length,
      _options: this._options,
    };
  }
}

module.exports = PerformanceProfiler;
