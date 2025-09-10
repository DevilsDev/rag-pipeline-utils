/**
 * Plugin Analytics Dashboard
 * Real-time analytics and metrics visualization for plugin ecosystem
 */

const fs = require('fs').promises;
// eslint-disable-line global-require
const path = require('path');
// eslint-disable-line global-require
const { EventEmitter } = require('events');
// eslint-disable-line global-require

class PluginAnalyticsDashboard extends EventEmitter {
  constructor(_options = {}) {
    super();

    this._config = {
      port: _options.port || 3333,
      dataDir: _options.dataDir || path.join(process.cwd(), '.rag-analytics'),
      refreshInterval: _options.refreshInterval || 30000, // 30 seconds
      retentionDays: _options.retentionDays || 90,
      ..._options,
    };

    this.metrics = new Map();
    this.realTimeData = new Map();
    this.subscribers = new Set();

    this.initializeMetrics();
    this.startDataCollection();
  }

  /**
   * Initialize metric collectors
   */
  initializeMetrics() {
    // Plugin usage metrics
    this.metrics.set('plugin_installs', {
      type: 'counter',
      description: 'Total plugin installations',
      value: 0,
      history: [],
    });

    this.metrics.set('plugin_searches', {
      type: 'counter',
      description: 'Total plugin searches',
      value: 0,
      history: [],
    });

    this.metrics.set('plugin_ratings', {
      type: 'histogram',
      description: 'Plugin rating distribution',
      buckets: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      history: [],
    });

    this.metrics.set('active_plugins', {
      type: 'gauge',
      description: 'Currently active plugins',
      value: 0,
      history: [],
    });

    // Performance metrics
    this.metrics.set('installation_time', {
      type: 'histogram',
      description: 'Plugin installation time (ms)',
      buckets: {},
      history: [],
    });

    this.metrics.set('search_latency', {
      type: 'histogram',
      description: 'Search response time (ms)',
      buckets: {},
      history: [],
    });

    // Security metrics
    this.metrics.set('security_scans', {
      type: 'counter',
      description: 'Security scans performed',
      value: 0,
      history: [],
    });

    this.metrics.set('security_issues', {
      type: 'counter',
      description: 'Security issues detected',
      value: 0,
      history: [],
    });

    // Certification metrics
    this.metrics.set('certification_requests', {
      type: 'counter',
      description: 'Certification requests submitted',
      value: 0,
      history: [],
    });

    this.metrics.set('certified_plugins', {
      type: 'gauge',
      description: 'Total certified plugins',
      value: 0,
      history: [],
    });
  }

  /**
   * Start collecting analytics data
   */
  startDataCollection() {
    // Periodic data collection
    setInterval(() => {
      this.collectMetrics();
      this.updateRealTimeData();
      this.notifySubscribers();
    }, this._config.refreshInterval);

    // Daily cleanup
    setInterval(
      () => {
        this.cleanupOldData();
      },
      24 * 60 * 60 * 1000,
    ); // 24 hours
  }

  /**
   * Record plugin installation
   */
  recordInstallation(pluginId, version, metadata = {}) {
    const timestamp = Date.now();

    this.incrementMetric('plugin_installs');
    this.recordHistogram('installation_time', metadata.installTime || 0);

    this.realTimeData.set(`install_${timestamp}`, {
      type: 'installation',
      pluginId,
      version,
      timestamp,
      metadata,
    });

    this.emit('installation_recorded', { pluginId, version, metadata });
  }

  /**
   * Record plugin search
   */
  recordSearch(query, results, latency) {
    const timestamp = Date.now();

    this.incrementMetric('plugin_searches');
    this.recordHistogram('search_latency', latency);

    this.realTimeData.set(`search_${timestamp}`, {
      type: 'search',
      query,
      resultCount: results.length,
      latency,
      timestamp,
    });

    this.emit('search_recorded', { query, results, latency });
  }

  /**
   * Record plugin rating
   */
  recordRating(pluginId, rating, review = null) {
    const timestamp = Date.now();

    const ratingMetric = this.metrics.get('plugin_ratings');
    if (ratingMetric && ratingMetric.buckets[rating] !== undefined) {
      ratingMetric.buckets[rating]++;
    }

    this.realTimeData.set(`rating_${timestamp}`, {
      type: 'rating',
      pluginId,
      rating,
      review,
      timestamp,
    });

    this.emit('rating_recorded', { pluginId, rating, review });
  }

  /**
   * Record security scan
   */
  recordSecurityScan(pluginId, result) {
    const timestamp = Date.now();

    this.incrementMetric('security_scans');

    if (result.issues && result.issues.length > 0) {
      this.incrementMetric('security_issues', result.issues.length);
    }

    this.realTimeData.set(`security_${timestamp}`, {
      type: 'security_scan',
      pluginId,
      risk: result.risk,
      issueCount: result.issues?.length || 0,
      timestamp,
    });

    this.emit('security_scan_recorded', { pluginId, result });
  }

  /**
   * Record certification request
   */
  recordCertification(pluginId, level, result) {
    const timestamp = Date.now();

    this.incrementMetric('certification_requests');

    if (result.approved) {
      this.incrementMetric('certified_plugins');
    }

    this.realTimeData.set(`cert_${timestamp}`, {
      type: 'certification',
      pluginId,
      level,
      approved: result.approved,
      score: result.score,
      timestamp,
    });

    this.emit('certification_recorded', { pluginId, level, result });
  }

  /**
   * Get dashboard data
   */
  getDashboardData() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Recent activity
    const recentActivity = Array.from(this.realTimeData.values())
      .filter((item) => item.timestamp > oneHourAgo)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);

    // Time series data
    const timeSeriesData = this.generateTimeSeriesData();

    // Top plugins
    const topPlugins = this.getTopPlugins();

    // Performance summary
    const performanceSummary = this.getPerformanceSummary();

    // Security overview
    const securityOverview = this.getSecurityOverview();

    return {
      timestamp: now,
      metrics: Object.fromEntries(this.metrics),
      recentActivity,
      timeSeriesData,
      topPlugins,
      performanceSummary,
      securityOverview,
      summary: {
        totalInstalls: this.metrics.get('plugin_installs')?.value || 0,
        totalSearches: this.metrics.get('plugin_searches')?.value || 0,
        activePlugins: this.metrics.get('active_plugins')?.value || 0,
        certifiedPlugins: this.metrics.get('certified_plugins')?.value || 0,
        avgRating: this.calculateAverageRating(),
        securityScore: this.calculateSecurityScore(),
      },
    };
  }

  /**
   * Generate time series data for charts
   */
  generateTimeSeriesData() {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const interval = 60 * 60 * 1000; // 1 hour intervals

    const series = {
      installs: [],
      searches: [],
      ratings: [],
      securityScans: [],
    };

    for (let time = oneWeekAgo; time <= now; time += interval) {
      const hourData = Array.from(this.realTimeData.values()).filter(
        (item) => item.timestamp >= time && item.timestamp < time + interval,
      );

      series.installs.push({
        timestamp: time,
        value: hourData.filter((item) => item.type === 'installation').length,
      });

      series.searches.push({
        timestamp: time,
        value: hourData.filter((item) => item.type === 'search').length,
      });

      series.ratings.push({
        timestamp: time,
        value: hourData.filter((item) => item.type === 'rating').length,
      });

      series.securityScans.push({
        timestamp: time,
        value: hourData.filter((item) => item.type === 'security_scan').length,
      });
    }

    return series;
  }

  /**
   * Get top performing plugins
   */
  getTopPlugins() {
    const pluginStats = new Map();

    Array.from(this.realTimeData.values()).forEach((item) => {
      if (item.pluginId) {
        if (!pluginStats.has(item.pluginId)) {
          pluginStats.set(item.pluginId, {
            pluginId: item.pluginId,
            installs: 0,
            ratings: [],
            securityScans: 0,
            certifications: 0,
          });
        }

        const stats = pluginStats.get(item.pluginId);

        switch (item.type) {
          case 'installation':
            stats.installs++;
            break;
          case 'rating':
            stats.ratings.push(item.rating);
            break;
          case 'security_scan':
            stats.securityScans++;
            break;
          case 'certification':
            if (item.approved) stats.certifications++;
            break;
        }
      }
    });

    return Array.from(pluginStats.values())
      .map((stats) => ({
        ...stats,
        avgRating:
          stats.ratings.length > 0
            ? stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length
            : 0,
      }))
      .sort((a, b) => b.installs - a.installs)
      .slice(0, 10);
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    const installTimes = Array.from(this.realTimeData.values())
      .filter(
        (item) => item.type === 'installation' && item.metadata?.installTime,
      )
      .map((item) => item.metadata.installTime);

    const searchLatencies = Array.from(this.realTimeData.values())
      .filter((item) => item.type === 'search' && item.latency)
      .map((item) => item.latency);

    return {
      avgInstallTime:
        installTimes.length > 0
          ? installTimes.reduce((a, b) => a + b, 0) / installTimes.length
          : 0,
      p95InstallTime: this.calculatePercentile(installTimes, 95),
      avgSearchLatency:
        searchLatencies.length > 0
          ? searchLatencies.reduce((a, b) => a + b, 0) / searchLatencies.length
          : 0,
      p95SearchLatency: this.calculatePercentile(searchLatencies, 95),
    };
  }

  /**
   * Get security overview
   */
  getSecurityOverview() {
    const securityScans = Array.from(this.realTimeData.values()).filter(
      (item) => item.type === 'security_scan',
    );

    const riskDistribution = { low: 0, medium: 0, high: 0 };
    let totalIssues = 0;

    securityScans.forEach((scan) => {
      if (scan.risk) {
        riskDistribution[scan.risk]++;
      }
      totalIssues += scan.issueCount || 0;
    });

    return {
      totalScans: securityScans.length,
      riskDistribution,
      totalIssues,
      avgIssuesPerScan:
        securityScans.length > 0 ? totalIssues / securityScans.length : 0,
    };
  }

  /**
   * Generate HTML dashboard
   */
  async generateHTMLDashboard() {
    const data = this.getDashboardData();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RAG Pipeline Plugin Analytics</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .dashboard { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .metric-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric-value { font-size: 2em; font-weight: bold; color: #2563eb; }
        .metric-label { color: #6b7280; margin-top: 5px; }
        .chart-container { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .activity-feed { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .activity-item { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
        .activity-time { color: #6b7280; font-size: 0.9em; }
        .status-indicator { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; }
        .status-success { background: #10b981; }
        .status-warning { background: #f59e0b; }
        .status-error { background: #ef4444; }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="header">
            <h1>🔌 RAG Pipeline Plugin Analytics</h1>
            <p>Real-time insights into plugin ecosystem performance and usage</p>
            <p><strong>Last Updated:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
        </div>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-value">${data.summary.totalInstalls.toLocaleString()}</div>
                <div class="metric-label">Total Installations</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${data.summary.totalSearches.toLocaleString()}</div>
                <div class="metric-label">Total Searches</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${data.summary.activePlugins}</div>
                <div class="metric-label">Active Plugins</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${data.summary.certifiedPlugins}</div>
                <div class="metric-label">Certified Plugins</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${data.summary.avgRating.toFixed(1)}★</div>
                <div class="metric-label">Average Rating</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${data.summary.securityScore}%</div>
                <div class="metric-label">Security Score</div>
            </div>
        </div>
        
        <div class="chart-container">
            <h3>Plugin Activity Over Time</h3>
            <canvas id="activityChart" width="800" height="400"></canvas>
        </div>
        
        <div class="chart-container">
            <h3>Top Plugins by Installations</h3>
            <canvas id="topPluginsChart" width="800" height="400"></canvas>
        </div>
        
        <div class="activity-feed">
            <h3>Recent Activity</h3>
            ${data.recentActivity
              .map(
                (activity) => `
                <div class="activity-item">
                    <span class="status-indicator status-${this.getActivityStatus(activity)}"></span>
                    <strong>${activity.type.replace('_', ' ').toUpperCase()}</strong>
                    ${this.formatActivityDescription(activity)}
                    <div class="activity-time">${new Date(activity.timestamp).toLocaleString()}</div>
                </div>
            `,
              )
              .join('')}
        </div>
    </div>
    
    <script>
        // Activity Chart
        const activityCtx = document.getElementById('activityChart').getContext('2d');
        new Chart(activityCtx, {
            _type: 'line',
            data: {
                labels: ${JSON.stringify(data.timeSeriesData.installs.map((d) => new Date(d.timestamp).toLocaleDateString()))},
                datasets: [
                    {
                        label: 'Installations',
                        data: ${JSON.stringify(data.timeSeriesData.installs.map((d) => d.value))},
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)'
                    },
                    {
                        label: 'Searches',
                        data: ${JSON.stringify(data.timeSeriesData.searches.map((d) => d.value))},
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)'
                    }
                ]
            },
            _options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
        
        // Top Plugins Chart
        const topPluginsCtx = document.getElementById('topPluginsChart').getContext('2d');
        new Chart(topPluginsCtx, {
            _type: 'bar',
            data: {
                labels: ${JSON.stringify(data.topPlugins.map((p) => p.pluginId))},
                datasets: [{
                    label: 'Installations',
                    data: ${JSON.stringify(data.topPlugins.map((p) => p.installs))},
                    backgroundColor: 'rgba(37, 99, 235, 0.8)'
                }]
            },
            _options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
        
        // Auto-refresh every 30 seconds
        setTimeout(() => location.reload(), 30000);
    </script>
</body>
</html>`;

    return html;
  }

  // Helper methods
  incrementMetric(name, amount = 1) {
    const metric = this.metrics.get(name);
    if (metric && metric._type === 'counter') {
      metric.value += amount;
      metric.history.push({ timestamp: Date.now(), value: metric.value });
    }
  }

  recordHistogram(name, value) {
    const metric = this.metrics.get(name);
    if (metric && metric._type === 'histogram') {
      const bucket = Math.floor(value / 100) * 100; // 100ms buckets
      metric.buckets[bucket] = (metric.buckets[bucket] || 0) + 1;
      metric.history.push({ timestamp: Date.now(), value });
    }
  }

  calculateAverageRating() {
    const ratingMetric = this.metrics.get('plugin_ratings');
    if (!ratingMetric) return 0;

    let totalRatings = 0;
    let weightedSum = 0;

    Object.entries(ratingMetric.buckets).forEach(([rating, count]) => {
      totalRatings += count;
      weightedSum += parseInt(rating) * count;
    });

    return totalRatings > 0 ? weightedSum / totalRatings : 0;
  }

  calculateSecurityScore() {
    const scans = this.metrics.get('security_scans')?.value || 0;
    const issues = this.metrics.get('security_issues')?.value || 0;

    if (scans === 0) return 100;

    const issueRate = issues / scans;
    return Math.max(0, Math.round(100 - issueRate * 20)); // Penalty for issues
  }

  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;

    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  getActivityStatus(activity) {
    switch (activity.type) {
      case 'installation':
        return 'success';
      case 'security_scan':
        return activity.issueCount > 0 ? 'warning' : 'success';
      case 'certification':
        return activity.approved ? 'success' : 'error';
      default:
        return 'success';
    }
  }

  formatActivityDescription(activity) {
    switch (activity.type) {
      case 'installation':
        return `Plugin ${activity.pluginId}@${activity.version} installed`;
      case 'search':
        return `Search "${activity.query}" returned ${activity.resultCount} results`;
      case 'rating':
        return `Plugin ${activity.pluginId} rated ${activity.rating} stars`;
      case 'security_scan':
        return `Security scan for ${activity.pluginId} - ${activity.risk} risk, ${activity.issueCount} issues`;
      case 'certification':
        return `Certification ${activity.approved ? 'approved' : 'rejected'} for ${activity.pluginId} (${activity.level})`;
      default:
        return JSON.stringify(activity);
    }
  }

  async collectMetrics() {
    // Update active plugins count
    try {
      const pluginsDir = path.join(this._config.dataDir, 'plugins');
      const entries = await fs.readdir(pluginsDir).catch(() => []);

      const activeMetric = this.metrics.get('active_plugins');
      if (activeMetric) {
        activeMetric.value = entries.length;
        activeMetric.history.push({
          timestamp: Date.now(),
          value: entries.length,
        });
      }
    } catch (error) {
      // Ignore errors
    }
  }

  updateRealTimeData() {
    // Clean up old real-time data (keep last 24 hours)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    for (const [key, data] of this.realTimeData) {
      if (data.timestamp < cutoff) {
        this.realTimeData.delete(key);
      }
    }
  }

  notifySubscribers() {
    const data = this.getDashboardData();
    this.subscribers.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error notifying subscriber:', error);
        // eslint-disable-line no-console
      }
    });
  }

  async cleanupOldData() {
    const cutoff =
      Date.now() - this._config.retentionDays * 24 * 60 * 60 * 1000;

    // Clean up metric history
    for (const metric of this.metrics.values()) {
      if (metric.history) {
        metric.history = metric.history.filter(
          (entry) => entry.timestamp > cutoff,
        );
      }
    }
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
}

module.exports = { PluginAnalyticsDashboard };
