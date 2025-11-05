"use strict";

/**
 * Connection Pool Manager
 *
 * High-performance HTTP/HTTPS connection pooling for external API calls.
 * Provides connection reuse, keep-alive, and intelligent pool management
 * to reduce latency and improve throughput.
 *
 * Features:
 * - Connection reuse with keep-alive
 * - Configurable pool size limits
 * - Timeout management
 * - Pool utilization metrics
 * - Graceful degradation
 * - Per-host connection limits
 *
 * @module utils/connection-pool
 * @since 2.3.0
 */

const http = require("http");
const https = require("https");
const { EventEmitter } = require("events");

/**
 * Connection Pool Configuration
 */
const DEFAULT_CONFIG = {
  // Pool size limits
  maxSockets: 50, // Maximum total sockets
  maxFreeSockets: 10, // Maximum idle sockets
  maxSocketsPerHost: 10, // Maximum sockets per host

  // Timeout settings (milliseconds)
  timeout: 30000, // Socket timeout (30s)
  freeSocketTimeout: 15000, // Idle socket timeout (15s)
  keepAliveTimeout: 60000, // Keep-alive timeout (60s)

  // Keep-alive settings
  keepAlive: true,
  keepAliveMsecs: 1000,

  // Scheduling algorithm
  scheduling: "lifo", // 'lifo' or 'fifo'

  // Monitoring
  trackMetrics: true,
  metricsInterval: 60000, // Metrics collection interval (1 minute)
};

/**
 * Connection Pool Manager Class
 */
class ConnectionPoolManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
    };

    // HTTP and HTTPS agents
    this.httpAgent = null;
    this.httpsAgent = null;

    // Pool state
    this.pools = new Map(); // host -> pool state
    this.activeConnections = 0;
    this.totalConnections = 0;

    // Metrics
    this.metrics = {
      totalRequests: 0,
      cachedConnections: 0,
      newConnections: 0,
      connectionReuse: 0,
      timeouts: 0,
      errors: 0,
      avgResponseTime: 0,
      totalResponseTime: 0,
      poolExhausted: 0,
      connectionsCreated: 0,
      connectionsDestroyed: 0,
      currentPoolSize: 0,
      peakPoolSize: 0,
    };

    // Performance tracking
    this.requestTimings = [];
    this.maxTimingsSamples = 1000;

    // Initialize agents
    this._initializeAgents();

    // Start metrics collection
    if (this.config.trackMetrics) {
      this._startMetricsCollection();
    }
  }

  /**
   * Initialize HTTP and HTTPS agents with connection pooling
   * @private
   */
  _initializeAgents() {
    // HTTP Agent configuration
    const httpConfig = {
      keepAlive: this.config.keepAlive,
      keepAliveMsecs: this.config.keepAliveMsecs,
      maxSockets: this.config.maxSockets,
      maxFreeSockets: this.config.maxFreeSockets,
      timeout: this.config.timeout,
      freeSocketTimeout: this.config.freeSocketTimeout,
      scheduling: this.config.scheduling,
    };

    // HTTPS Agent configuration (inherits from HTTP)
    const httpsConfig = {
      ...httpConfig,
      // Additional HTTPS-specific settings
      rejectUnauthorized: true,
    };

    // Create agents
    this.httpAgent = new http.Agent(httpConfig);
    this.httpsAgent = new https.Agent(httpsConfig);

    // Instrument agents for metrics
    this._instrumentAgent(this.httpAgent, "http");
    this._instrumentAgent(this.httpsAgent, "https");

    this.emit("agents_initialized", {
      http: this.httpAgent,
      https: this.httpsAgent,
    });
  }

  /**
   * Instrument agent for metrics collection
   * @private
   */
  _instrumentAgent(agent, protocol) {
    // Track socket creation
    const originalCreateConnection = agent.createConnection;
    agent.createConnection = (...args) => {
      this.metrics.connectionsCreated++;
      this.metrics.newConnections++;
      this.activeConnections++;
      this.totalConnections++;

      // Update peak pool size
      if (this.activeConnections > this.metrics.peakPoolSize) {
        this.metrics.peakPoolSize = this.activeConnections;
      }

      this.emit("connection_created", {
        protocol,
        active: this.activeConnections,
        total: this.totalConnections,
      });

      return originalCreateConnection.apply(agent, args);
    };

    // Track socket lifecycle
    agent.on("free", (socket, options) => {
      this.activeConnections--;
      this.metrics.cachedConnections++;

      this.emit("connection_freed", {
        protocol,
        host: options.host,
        port: options.port,
        active: this.activeConnections,
      });
    });

    // Track socket removal
    const originalRemoveSocket = agent.removeSocket;
    agent.removeSocket = function (socket, options) {
      this.metrics.connectionsDestroyed++;
      this.activeConnections = Math.max(0, this.activeConnections - 1);

      this.emit("connection_removed", {
        protocol,
        host: options?.host,
        active: this.activeConnections,
      });

      return originalRemoveSocket.call(agent, socket, options);
    }.bind(this);
  }

  /**
   * Get HTTP agent
   *
   * @returns {http.Agent} HTTP agent with connection pooling
   */
  getHttpAgent() {
    return this.httpAgent;
  }

  /**
   * Get HTTPS agent
   *
   * @returns {https.Agent} HTTPS agent with connection pooling
   */
  getHttpsAgent() {
    return this.httpsAgent;
  }

  /**
   * Get agent for URL
   *
   * @param {string} url - URL to get agent for
   * @returns {http.Agent|https.Agent} Appropriate agent
   */
  getAgentForUrl(url) {
    const protocol = url.startsWith("https") ? "https" : "http";
    return protocol === "https" ? this.httpsAgent : this.httpAgent;
  }

  /**
   * Track request timing
   *
   * @param {number} duration - Request duration in milliseconds
   */
  trackRequest(duration) {
    this.metrics.totalRequests++;
    this.metrics.totalResponseTime += duration;
    this.metrics.avgResponseTime =
      this.metrics.totalResponseTime / this.metrics.totalRequests;

    // Store timing sample (with circular buffer)
    this.requestTimings.push(duration);
    if (this.requestTimings.length > this.maxTimingsSamples) {
      this.requestTimings.shift();
    }

    // Check for connection reuse
    const reuseRate =
      this.metrics.cachedConnections / Math.max(1, this.metrics.totalRequests);
    if (reuseRate > 0) {
      this.metrics.connectionReuse = reuseRate * 100; // Percentage
    }

    this.emit("request_completed", {
      duration,
      avgResponseTime: this.metrics.avgResponseTime,
      connectionReuse: this.metrics.connectionReuse,
    });
  }

  /**
   * Track request error
   *
   * @param {Error} error - Request error
   * @param {string} type - Error type (timeout, network, etc.)
   */
  trackError(error, type = "error") {
    this.metrics.errors++;

    if (type === "timeout") {
      this.metrics.timeouts++;
    }

    this.emit("request_error", {
      error: error.message,
      type,
      totalErrors: this.metrics.errors,
    });
  }

  /**
   * Track pool exhaustion
   */
  trackPoolExhaustion() {
    this.metrics.poolExhausted++;

    this.emit("pool_exhausted", {
      maxSockets: this.config.maxSockets,
      active: this.activeConnections,
      exhaustedCount: this.metrics.poolExhausted,
    });
  }

  /**
   * Get current pool metrics
   *
   * @returns {Object} Current metrics
   */
  getMetrics() {
    // Calculate percentiles from timing samples
    const sortedTimings = [...this.requestTimings].sort((a, b) => a - b);
    const p50 = sortedTimings[Math.floor(sortedTimings.length * 0.5)] || 0;
    const p95 = sortedTimings[Math.floor(sortedTimings.length * 0.95)] || 0;
    const p99 = sortedTimings[Math.floor(sortedTimings.length * 0.99)] || 0;

    // Get agent statistics
    const httpSockets = this._getAgentStats(this.httpAgent);
    const httpsSockets = this._getAgentStats(this.httpsAgent);

    return {
      ...this.metrics,
      currentPoolSize: this.activeConnections,
      poolUtilization: (this.activeConnections / this.config.maxSockets) * 100,
      connectionReuseRate: this.metrics.connectionReuse,

      // Response time percentiles
      responseTime: {
        avg: this.metrics.avgResponseTime,
        p50,
        p95,
        p99,
      },

      // Agent-specific stats
      agents: {
        http: httpSockets,
        https: httpsSockets,
      },

      // Pool configuration
      config: {
        maxSockets: this.config.maxSockets,
        maxFreeSockets: this.config.maxFreeSockets,
        timeout: this.config.timeout,
      },
    };
  }

  /**
   * Get agent statistics
   * @private
   */
  _getAgentStats(agent) {
    const sockets = agent.sockets;
    const freeSockets = agent.freeSockets;
    const requests = agent.requests;

    let totalSockets = 0;
    let totalFreeSockets = 0;
    let totalRequests = 0;

    // Count sockets per host
    for (const [, socketArray] of Object.entries(sockets)) {
      totalSockets += socketArray.length;
    }

    // Count free sockets per host
    for (const [, socketArray] of Object.entries(freeSockets)) {
      totalFreeSockets += socketArray.length;
    }

    // Count pending requests per host
    for (const [, requestArray] of Object.entries(requests)) {
      totalRequests += requestArray.length;
    }

    return {
      active: totalSockets,
      idle: totalFreeSockets,
      pending: totalRequests,
      total: totalSockets + totalFreeSockets,
    };
  }

  /**
   * Get pool status
   *
   * @returns {Object} Pool status information
   */
  getStatus() {
    const metrics = this.getMetrics();

    return {
      healthy: metrics.poolUtilization < 90,
      utilization: metrics.poolUtilization,
      activeConnections: this.activeConnections,
      maxConnections: this.config.maxSockets,
      connectionReuse: metrics.connectionReuseRate,
      avgResponseTime: metrics.avgResponseTime,
      errors: metrics.errors,
      timeouts: metrics.timeouts,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    const currentPoolSize = this.activeConnections;
    const peakPoolSize = this.metrics.peakPoolSize;

    this.metrics = {
      totalRequests: 0,
      cachedConnections: 0,
      newConnections: 0,
      connectionReuse: 0,
      timeouts: 0,
      errors: 0,
      avgResponseTime: 0,
      totalResponseTime: 0,
      poolExhausted: 0,
      connectionsCreated: 0,
      connectionsDestroyed: 0,
      currentPoolSize,
      peakPoolSize,
    };

    this.requestTimings = [];

    this.emit("metrics_reset");
  }

  /**
   * Start periodic metrics collection
   * @private
   */
  _startMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      const metrics = this.getMetrics();

      this.emit("metrics_collected", metrics);

      // Warn if pool utilization is high
      if (metrics.poolUtilization > 80) {
        this.emit("high_utilization", {
          utilization: metrics.poolUtilization,
          active: this.activeConnections,
          max: this.config.maxSockets,
        });
      }

      // Warn if error rate is high
      const errorRate =
        (metrics.errors / Math.max(1, metrics.totalRequests)) * 100;
      if (errorRate > 5) {
        this.emit("high_error_rate", {
          errorRate,
          errors: metrics.errors,
          requests: metrics.totalRequests,
        });
      }
    }, this.config.metricsInterval);

    // Don't block process exit
    if (this.metricsInterval.unref) {
      this.metricsInterval.unref();
    }
  }

  /**
   * Destroy all connections and cleanup
   */
  destroy() {
    // Stop metrics collection
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    // Destroy agents
    if (this.httpAgent) {
      this.httpAgent.destroy();
      this.httpAgent = null;
    }

    if (this.httpsAgent) {
      this.httpsAgent.destroy();
      this.httpsAgent = null;
    }

    // Clear state
    this.pools.clear();
    this.activeConnections = 0;
    this.requestTimings = [];

    this.emit("destroyed");
    this.removeAllListeners();
  }

  /**
   * Get connection pool report
   *
   * @returns {string} Human-readable pool report
   */
  getReport() {
    const metrics = this.getMetrics();
    const status = this.getStatus();

    return `
Connection Pool Report
======================
Status: ${status.healthy ? "Healthy ✓" : "Warning ⚠"}
Pool Utilization: ${status.utilization.toFixed(1)}%
Active Connections: ${status.activeConnections} / ${status.maxConnections}
Connection Reuse Rate: ${status.connectionReuse.toFixed(1)}%

Performance Metrics
-------------------
Total Requests: ${metrics.totalRequests}
Avg Response Time: ${metrics.avgResponseTime.toFixed(2)}ms
P50: ${metrics.responseTime.p50.toFixed(2)}ms
P95: ${metrics.responseTime.p95.toFixed(2)}ms
P99: ${metrics.responseTime.p99.toFixed(2)}ms

Connection Stats
----------------
New Connections: ${metrics.newConnections}
Cached Connections: ${metrics.cachedConnections}
Connections Created: ${metrics.connectionsCreated}
Connections Destroyed: ${metrics.connectionsDestroyed}
Peak Pool Size: ${metrics.peakPoolSize}

Errors
------
Total Errors: ${metrics.errors}
Timeouts: ${metrics.timeouts}
Pool Exhausted: ${metrics.poolExhausted}

Agent Stats
-----------
HTTP:  Active: ${metrics.agents.http.active}, Idle: ${metrics.agents.http.idle}, Pending: ${metrics.agents.http.pending}
HTTPS: Active: ${metrics.agents.https.active}, Idle: ${metrics.agents.https.idle}, Pending: ${metrics.agents.https.pending}
    `.trim();
  }
}

/**
 * Global connection pool instance
 */
let globalPool = null;

/**
 * Get or create global connection pool
 *
 * @param {Object} options - Pool configuration options
 * @returns {ConnectionPoolManager} Global pool instance
 */
function getGlobalPool(options = {}) {
  if (!globalPool) {
    globalPool = new ConnectionPoolManager(options);
  }
  return globalPool;
}

/**
 * Reset global connection pool
 */
function resetGlobalPool() {
  if (globalPool) {
    globalPool.destroy();
    globalPool = null;
  }
}

/**
 * Create fetch wrapper with connection pooling
 *
 * @param {ConnectionPoolManager} pool - Connection pool manager
 * @returns {Function} Fetch function with pooling
 */
function createPooledFetch(pool) {
  return async function pooledFetch(url, options = {}) {
    const agent = pool.getAgentForUrl(url);
    const startTime = Date.now();

    try {
      // Add agent to fetch options
      const fetchOptions = {
        ...options,
        agent,
      };

      // Make request (assuming fetch or node-fetch is available)
      const response = await fetch(url, fetchOptions);

      // Track successful request
      const duration = Date.now() - startTime;
      pool.trackRequest(duration);

      return response;
    } catch (error) {
      // Track error
      const errorType =
        error.code === "ETIMEDOUT" || error.code === "ESOCKETTIMEDOUT"
          ? "timeout"
          : "error";
      pool.trackError(error, errorType);

      throw error;
    }
  };
}

module.exports = {
  ConnectionPoolManager,
  getGlobalPool,
  resetGlobalPool,
  createPooledFetch,
  DEFAULT_CONFIG,
};
