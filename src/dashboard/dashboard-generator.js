'use strict';

/**
 * Dashboard Generator
 *
 * Generates standalone HTML dashboards and plain-text reports from
 * pipeline metrics snapshots. The HTML output is fully self-contained
 * with inline CSS and SVG charts -- no external dependencies required.
 */

const { EventEmitter } = require('events');

/**
 * @typedef {Object} DashboardGeneratorConfig
 * @property {string} title - Dashboard title (default: 'RAG Pipeline Dashboard')
 * @property {number} refreshInterval - Auto-refresh interval in ms (default: 5000)
 * @property {'dark'|'light'} theme - Color theme (default: 'dark')
 */
const DEFAULT_CONFIG = {
  title: 'RAG Pipeline Dashboard',
  refreshInterval: 5000,
  theme: 'dark',
};

/**
 * Generates standalone HTML dashboards from pipeline metrics snapshots.
 * @extends EventEmitter
 */
class DashboardGenerator extends EventEmitter {
  /**
   * @param {Partial<DashboardGeneratorConfig>} options
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  /**
   * Generate a complete standalone HTML dashboard page.
   * @param {Object} metricsSnapshot - Snapshot from MetricsAggregator.getSnapshot()
   * @returns {string} Complete HTML document string
   */
  generate(metricsSnapshot) {
    const snapshot = metricsSnapshot || this._emptySnapshot();
    const theme = this.config.theme || 'dark';
    const styles = this._generateStyles(theme);

    const cards = [
      this._generateCard(
        'Total Queries',
        this._formatNumber(snapshot.counters.queries),
        `${this._formatNumber(snapshot.counters.embeddings)} embeddings | ${this._formatNumber(snapshot.counters.retrievals)} retrievals`,
        '#4fc3f7',
      ),
      this._generateCard(
        'Avg Latency',
        `${snapshot.latency.avg.toFixed(1)}ms`,
        `p50: ${snapshot.latency.p50.toFixed(1)}ms | p95: ${snapshot.latency.p95.toFixed(1)}ms | p99: ${snapshot.latency.p99.toFixed(1)}ms`,
        '#81c784',
      ),
      this._generateCard(
        'Error Rate',
        `${(snapshot.errorRate * 100).toFixed(2)}%`,
        `${this._formatNumber(snapshot.counters.errors)} total errors`,
        snapshot.errorRate > 0.05 ? '#ef5350' : '#66bb6a',
      ),
      this._generateCard(
        'Total Cost',
        `$${snapshot.cost.total.toFixed(4)}`,
        `Last 24h: $${snapshot.cost.last24h.toFixed(4)} | Avg/query: $${snapshot.cost.avgPerQuery.toFixed(6)}`,
        '#ffb74d',
      ),
      this._generateCard(
        'Memory Usage',
        `${(snapshot.memory.current / 1024 / 1024).toFixed(1)} MB`,
        `Peak: ${(snapshot.memory.peak / 1024 / 1024).toFixed(1)} MB | Trend: ${snapshot.memory.trend}`,
        '#ce93d8',
      ),
      this._generateCard(
        'Throughput',
        `${snapshot.throughput.queriesPerSec.toFixed(2)} q/s`,
        `${snapshot.throughput.embeddingsPerSec.toFixed(2)} embeddings/s`,
        '#4dd0e1',
      ),
    ];

    const latencyData = [
      { label: 'Min', value: snapshot.latency.min },
      { label: 'p50', value: snapshot.latency.p50 },
      { label: 'Avg', value: snapshot.latency.avg },
      { label: 'p95', value: snapshot.latency.p95 },
      { label: 'p99', value: snapshot.latency.p99 },
      { label: 'Max', value: snapshot.latency.max },
    ];
    const chart = this._generateBarChart(latencyData, 600, 200);

    const tableRows = [
      {
        label: 'Queries',
        value: this._formatNumber(snapshot.counters.queries),
        unit: 'count',
      },
      {
        label: 'Embeddings',
        value: this._formatNumber(snapshot.counters.embeddings),
        unit: 'count',
      },
      {
        label: 'Retrievals',
        value: this._formatNumber(snapshot.counters.retrievals),
        unit: 'count',
      },
      {
        label: 'Generations',
        value: this._formatNumber(snapshot.counters.generations),
        unit: 'count',
      },
      {
        label: 'Errors',
        value: this._formatNumber(snapshot.counters.errors),
        unit: 'count',
      },
      {
        label: 'Error Rate',
        value: (snapshot.errorRate * 100).toFixed(2),
        unit: '%',
      },
      {
        label: 'Avg Latency',
        value: snapshot.latency.avg.toFixed(2),
        unit: 'ms',
      },
      {
        label: 'p50 Latency',
        value: snapshot.latency.p50.toFixed(2),
        unit: 'ms',
      },
      {
        label: 'p95 Latency',
        value: snapshot.latency.p95.toFixed(2),
        unit: 'ms',
      },
      {
        label: 'p99 Latency',
        value: snapshot.latency.p99.toFixed(2),
        unit: 'ms',
      },
      {
        label: 'Min Latency',
        value: snapshot.latency.min.toFixed(2),
        unit: 'ms',
      },
      {
        label: 'Max Latency',
        value: snapshot.latency.max.toFixed(2),
        unit: 'ms',
      },
      {
        label: 'Total Cost',
        value: snapshot.cost.total.toFixed(6),
        unit: 'USD',
      },
      {
        label: 'Cost (24h)',
        value: snapshot.cost.last24h.toFixed(6),
        unit: 'USD',
      },
      {
        label: 'Avg Cost/Query',
        value: snapshot.cost.avgPerQuery.toFixed(6),
        unit: 'USD',
      },
      {
        label: 'Memory (Current)',
        value: (snapshot.memory.current / 1024 / 1024).toFixed(2),
        unit: 'MB',
      },
      {
        label: 'Memory (Peak)',
        value: (snapshot.memory.peak / 1024 / 1024).toFixed(2),
        unit: 'MB',
      },
      { label: 'Memory Trend', value: snapshot.memory.trend, unit: '' },
      {
        label: 'Throughput',
        value: snapshot.throughput.queriesPerSec.toFixed(3),
        unit: 'q/s',
      },
      { label: 'Uptime', value: this._formatUptime(snapshot.uptime), unit: '' },
    ];
    const table = this._generateTable(tableRows);

    const timestamp = new Date(snapshot.timestamp).toISOString();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this._escapeHtml(this.config.title)}</title>
  <style>${styles}</style>
</head>
<body>
  <header class="dashboard-header">
    <h1>${this._escapeHtml(this.config.title)}</h1>
    <span class="timestamp">Generated: ${timestamp}</span>
  </header>

  <main class="dashboard-main">
    <section class="cards-grid">
      ${cards.join('\n      ')}
    </section>

    <section class="chart-section">
      <h2>Latency Distribution</h2>
      <div class="chart-container">
        ${chart}
      </div>
    </section>

    <section class="table-section">
      <h2>Detailed Metrics</h2>
      ${table}
    </section>
  </main>

  <footer class="dashboard-footer">
    <span>RAG Pipeline Utils &mdash; Performance Dashboard</span>
    <span>Snapshot: ${timestamp}</span>
  </footer>
</body>
</html>`;

    this.emit('generated', { html, timestamp: snapshot.timestamp });
    return html;
  }

  /**
   * Generate a single metric card HTML snippet.
   * @param {string} title - Card title
   * @param {string} value - Primary display value
   * @param {string} subtitle - Secondary info line
   * @param {string} color - Accent color (CSS value)
   * @returns {string} HTML string
   */
  _generateCard(title, value, subtitle, color) {
    return `<div class="metric-card" style="border-top: 3px solid ${color};">
        <div class="card-title">${this._escapeHtml(title)}</div>
        <div class="card-value" style="color: ${color};">${this._escapeHtml(value)}</div>
        <div class="card-subtitle">${this._escapeHtml(subtitle)}</div>
      </div>`;
  }

  /**
   * Generate an inline SVG bar chart.
   * @param {Array<{label: string, value: number}>} data - Chart data points
   * @param {number} width - SVG width in pixels
   * @param {number} height - SVG height in pixels
   * @returns {string} SVG markup string
   */
  _generateBarChart(data, width, height) {
    if (!data || data.length === 0) {
      return '<svg></svg>';
    }

    const maxVal = Math.max(...data.map((d) => d.value), 1);
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const barWidth = Math.floor(chartWidth / data.length) - 4;
    const colors = [
      '#4fc3f7',
      '#81c784',
      '#ffb74d',
      '#ef5350',
      '#ce93d8',
      '#4dd0e1',
    ];

    let bars = '';
    let labels = '';
    let valueLabels = '';

    data.forEach((d, i) => {
      const barHeight = maxVal > 0 ? (d.value / maxVal) * chartHeight : 0;
      const x = padding.left + i * (barWidth + 4) + 2;
      const y = padding.top + chartHeight - barHeight;
      const color = colors[i % colors.length];

      bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" rx="2" />`;
      labels += `<text x="${x + barWidth / 2}" y="${height - 8}" text-anchor="middle" class="chart-label">${this._escapeHtml(d.label)}</text>`;

      if (d.value > 0) {
        valueLabels += `<text x="${x + barWidth / 2}" y="${y - 4}" text-anchor="middle" class="chart-value">${d.value.toFixed(1)}</text>`;
      }
    });

    // Y-axis grid lines
    let gridLines = '';
    const gridCount = 4;
    for (let i = 0; i <= gridCount; i++) {
      const y = padding.top + (chartHeight / gridCount) * i;
      const val = maxVal - (maxVal / gridCount) * i;
      gridLines += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="grid-line" />`;
      gridLines += `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" class="axis-label">${val.toFixed(0)}</text>`;
    }

    return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="bar-chart">
      <style>
        .chart-label { font-family: monospace; font-size: 11px; fill: #aaa; }
        .chart-value { font-family: monospace; font-size: 10px; fill: #ddd; }
        .axis-label { font-family: monospace; font-size: 10px; fill: #888; }
        .grid-line { stroke: #333; stroke-width: 0.5; stroke-dasharray: 3,3; }
      </style>
      ${gridLines}
      ${bars}
      ${labels}
      ${valueLabels}
      <text x="${width / 2}" y="${height - 24}" text-anchor="middle" class="chart-label" style="font-size: 9px;">Latency (ms)</text>
    </svg>`;
  }

  /**
   * Generate CSS styles for the specified theme.
   * @param {'dark'|'light'} theme
   * @returns {string} CSS string
   */
  _generateStyles(theme) {
    const isDark = theme === 'dark';
    const bg = isDark ? '#1a1a2e' : '#f5f5f5';
    const cardBg = isDark ? '#16213e' : '#ffffff';
    const textPrimary = isDark ? '#e0e0e0' : '#212121';
    const textSecondary = isDark ? '#9e9e9e' : '#757575';
    const headerBg = isDark ? '#0f3460' : '#1565c0';
    const footerBg = isDark ? '#0a0a1a' : '#e0e0e0';
    const footerText = isDark ? '#666' : '#999';
    const tableBorder = isDark ? '#2a2a4a' : '#e0e0e0';
    const tableStripe = isDark ? '#1e1e3a' : '#fafafa';

    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: ${bg};
        color: ${textPrimary};
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }
      .dashboard-header {
        background: ${headerBg};
        color: #fff;
        padding: 20px 32px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
      }
      .dashboard-header h1 {
        font-size: 22px;
        font-weight: 600;
        letter-spacing: 0.5px;
      }
      .timestamp {
        font-family: 'Courier New', monospace;
        font-size: 13px;
        opacity: 0.8;
      }
      .dashboard-main {
        flex: 1;
        padding: 24px 32px;
        max-width: 1200px;
        margin: 0 auto;
        width: 100%;
      }
      .cards-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-bottom: 32px;
      }
      @media (max-width: 900px) {
        .cards-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 600px) {
        .cards-grid { grid-template-columns: 1fr; }
        .dashboard-main { padding: 16px; }
      }
      .metric-card {
        background: ${cardBg};
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        transition: transform 0.15s ease;
      }
      .metric-card:hover {
        transform: translateY(-2px);
      }
      .card-title {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: ${textSecondary};
        margin-bottom: 8px;
      }
      .card-value {
        font-family: 'Courier New', monospace;
        font-size: 28px;
        font-weight: 700;
        margin-bottom: 6px;
      }
      .card-subtitle {
        font-size: 11px;
        color: ${textSecondary};
        font-family: 'Courier New', monospace;
      }
      .chart-section, .table-section {
        margin-bottom: 32px;
      }
      .chart-section h2, .table-section h2 {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 16px;
        color: ${textSecondary};
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .chart-container {
        background: ${cardBg};
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        overflow: hidden;
      }
      .bar-chart {
        width: 100%;
        height: auto;
        max-width: 600px;
      }
      .metrics-table {
        width: 100%;
        border-collapse: collapse;
        background: ${cardBg};
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      }
      .metrics-table th,
      .metrics-table td {
        padding: 10px 16px;
        text-align: left;
        border-bottom: 1px solid ${tableBorder};
      }
      .metrics-table th {
        background: ${isDark ? '#1e1e3e' : '#eeeeee'};
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: ${textSecondary};
        font-weight: 600;
      }
      .metrics-table td {
        font-family: 'Courier New', monospace;
        font-size: 13px;
      }
      .metrics-table tr:nth-child(even) td {
        background: ${tableStripe};
      }
      .metrics-table tr:last-child td {
        border-bottom: none;
      }
      .dashboard-footer {
        background: ${footerBg};
        color: ${footerText};
        padding: 12px 32px;
        font-size: 11px;
        display: flex;
        justify-content: space-between;
        font-family: 'Courier New', monospace;
      }
    `;
  }

  /**
   * Generate an HTML table for detailed metrics.
   * @param {Array<{label: string, value: string|number, unit: string}>} rows
   * @returns {string} HTML table string
   */
  _generateTable(rows) {
    const rowsHtml = rows
      .map(
        (r) =>
          `<tr><td>${this._escapeHtml(r.label)}</td><td>${this._escapeHtml(String(r.value))}</td><td>${this._escapeHtml(r.unit)}</td></tr>`,
      )
      .join('\n        ');

    return `<table class="metrics-table">
      <thead>
        <tr><th>Metric</th><th>Value</th><th>Unit</th></tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>`;
  }

  /**
   * Generate a plain-text summary report (for CLI/logs).
   * @param {Object} metricsSnapshot - Snapshot from MetricsAggregator.getSnapshot()
   * @returns {string} Formatted text report
   */
  generateReport(metricsSnapshot) {
    const s = metricsSnapshot || this._emptySnapshot();
    const divider = '='.repeat(52);
    const line = '-'.repeat(52);

    const lines = [
      divider,
      `  ${this.config.title} - Report`,
      `  ${new Date(s.timestamp).toISOString()}`,
      divider,
      '',
      '  COUNTERS',
      line,
      `  Queries:       ${this._padLeft(s.counters.queries, 12)}`,
      `  Embeddings:    ${this._padLeft(s.counters.embeddings, 12)}`,
      `  Retrievals:    ${this._padLeft(s.counters.retrievals, 12)}`,
      `  Generations:   ${this._padLeft(s.counters.generations, 12)}`,
      `  Errors:        ${this._padLeft(s.counters.errors, 12)}`,
      '',
      '  LATENCY (ms)',
      line,
      `  Average:       ${this._padLeft(s.latency.avg.toFixed(2), 12)}`,
      `  p50:           ${this._padLeft(s.latency.p50.toFixed(2), 12)}`,
      `  p95:           ${this._padLeft(s.latency.p95.toFixed(2), 12)}`,
      `  p99:           ${this._padLeft(s.latency.p99.toFixed(2), 12)}`,
      `  Min:           ${this._padLeft(s.latency.min.toFixed(2), 12)}`,
      `  Max:           ${this._padLeft(s.latency.max.toFixed(2), 12)}`,
      '',
      '  COST (USD)',
      line,
      `  Total:         ${this._padLeft('$' + s.cost.total.toFixed(6), 12)}`,
      `  Last 24h:      ${this._padLeft('$' + s.cost.last24h.toFixed(6), 12)}`,
      `  Avg/Query:     ${this._padLeft('$' + s.cost.avgPerQuery.toFixed(6), 12)}`,
      '',
      '  SYSTEM',
      line,
      `  Memory:        ${this._padLeft((s.memory.current / 1024 / 1024).toFixed(2) + ' MB', 12)}`,
      `  Memory Peak:   ${this._padLeft((s.memory.peak / 1024 / 1024).toFixed(2) + ' MB', 12)}`,
      `  Memory Trend:  ${this._padLeft(s.memory.trend, 12)}`,
      `  Throughput:    ${this._padLeft(s.throughput.queriesPerSec.toFixed(3) + ' q/s', 12)}`,
      `  Error Rate:    ${this._padLeft((s.errorRate * 100).toFixed(2) + '%', 12)}`,
      `  Uptime:        ${this._padLeft(this._formatUptime(s.uptime), 12)}`,
      '',
      divider,
    ];

    const report = lines.join('\n');
    this.emit('report', { report, timestamp: s.timestamp });
    return report;
  }

  /**
   * Return an empty metrics snapshot with zeroed values.
   * @returns {Object}
   * @private
   */
  _emptySnapshot() {
    return {
      counters: {
        queries: 0,
        embeddings: 0,
        retrievals: 0,
        generations: 0,
        errors: 0,
      },
      latency: { avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 },
      throughput: { queriesPerSec: 0, embeddingsPerSec: 0 },
      cost: { total: 0, last24h: 0, avgPerQuery: 0 },
      memory: { current: 0, peak: 0, trend: 'stable' },
      errorRate: 0,
      uptime: 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Escape HTML special characters.
   * @param {string} str
   * @returns {string}
   * @private
   */
  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Format a number with locale-aware separators.
   * @param {number} n
   * @returns {string}
   * @private
   */
  _formatNumber(n) {
    return Number(n).toLocaleString('en-US');
  }

  /**
   * Format uptime duration to human-readable string.
   * @param {number} ms - Uptime in milliseconds
   * @returns {string}
   * @private
   */
  _formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Right-align a value within a given width.
   * @param {string|number} val
   * @param {number} width
   * @returns {string}
   * @private
   */
  _padLeft(val, width) {
    return String(val).padStart(width);
  }
}

module.exports = { DashboardGenerator, DEFAULT_CONFIG };
