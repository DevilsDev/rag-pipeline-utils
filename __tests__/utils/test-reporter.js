/**
 * Visual Test Reporting Infrastructure
 * Generates HTML reports, coverage metrics, and streaming performance visualizations
 */

const fs = require("fs");
const path = require("path");

class TestReporter {
  constructor(options = {}) {
    this.outputDir =
      options.outputDir || path.join(process.cwd(), "test-reports");
    this.enableVisualReports = options.enableVisualReports !== false;
    this.enableCoverageReports = options.enableCoverageReports !== false;
    this.enablePerformanceReports = options.enablePerformanceReports !== false;

    this.testResults = [];
    this.coverageData = {};
    this.performanceMetrics = [];

    this.ensureOutputDirectory();
  }

  ensureOutputDirectory() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  addTestResult(result) {
    this.testResults.push({
      ...result,
      timestamp: new Date().toISOString(),
    });
  }

  addCoverageData(coverage) {
    this.coverageData = { ...this.coverageData, ...coverage };
  }

  addPerformanceMetric(metric) {
    this.performanceMetrics.push({
      ...metric,
      timestamp: new Date().toISOString(),
    });
  }

  generateHTMLReport() {
    if (!this.enableVisualReports) return;

    const htmlContent = this.createHTMLReportContent();
    const reportPath = path.join(this.outputDir, "test-report.html");

    fs.writeFileSync(reportPath, htmlContent);
    console.log(`HTML test report generated: ${reportPath}`);

    return reportPath;
  }

  createHTMLReportContent() {
    const summary = this.generateSummary();
    const testResultsHTML = this.generateTestResultsHTML();
    const coverageHTML = this.generateCoverageHTML();
    const performanceHTML = this.generatePerformanceHTML();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RAG Pipeline Test Report</title>
    <style>
        ${this.getCSS()}
    </style>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <div class="container">
        <header>
            <h1>🧪 RAG Pipeline Test Report</h1>
            <p class="subtitle">Generated on ${new Date().toLocaleString()}</p>
        </header>

        <section class="summary">
            <h2>📊 Test Summary</h2>
            <div class="summary-grid">
                <div class="summary-card ${summary.overallStatus}">
                    <h3>Overall Status</h3>
                    <div class="status-badge ${summary.overallStatus}">${summary.overallStatus.toUpperCase()}</div>
                </div>
                <div class="summary-card">
                    <h3>Tests Passed</h3>
                    <div class="metric">${summary.passed}/${summary.total}</div>
                </div>
                <div class="summary-card">
                    <h3>Coverage</h3>
                    <div class="metric">${summary.coverage}%</div>
                </div>
                <div class="summary-card">
                    <h3>Duration</h3>
                    <div class="metric">${summary.duration}ms</div>
                </div>
            </div>
        </section>

        <section class="test-results">
            <h2>🔍 Test Results</h2>
            ${testResultsHTML}
        </section>

        <section class="coverage">
            <h2>📈 Coverage Report</h2>
            ${coverageHTML}
        </section>

        <section class="performance">
            <h2>⚡ Performance Metrics</h2>
            ${performanceHTML}
        </section>
    </div>

    <script>
        ${this.getJavaScript()}
    </script>
</body>
</html>
    `;
  }

  generateSummary() {
    const total = this.testResults.length;
    const passed = this.testResults.filter((r) => r.status === "passed").length;
    const failed = this.testResults.filter((r) => r.status === "failed").length;
    const duration = this.testResults.reduce(
      (sum, r) => sum + (r.duration || 0),
      0,
    );

    const coverage = this.calculateOverallCoverage();
    const overallStatus = failed === 0 ? "passed" : "failed";

    return {
      total,
      passed,
      failed,
      duration,
      coverage: Math.round(coverage * 100) / 100,
      overallStatus,
    };
  }

  calculateOverallCoverage() {
    if (Object.keys(this.coverageData).length === 0) return 0;

    const coverageValues = Object.values(this.coverageData);
    return (
      coverageValues.reduce((sum, val) => sum + val, 0) / coverageValues.length
    );
  }

  generateTestResultsHTML() {
    if (this.testResults.length === 0) {
      return "<p>No test results available.</p>";
    }

    const groupedResults = this.groupTestsByCategory();
    let html = "";

    for (const [category, tests] of Object.entries(groupedResults)) {
      const categoryPassed = tests.filter((t) => t.status === "passed").length;
      const categoryTotal = tests.length;
      const categoryStatus =
        categoryPassed === categoryTotal ? "passed" : "failed";

      html += `
        <div class="test-category">
          <h3 class="category-header ${categoryStatus}">
            ${category} (${categoryPassed}/${categoryTotal})
          </h3>
          <div class="test-list">
            ${tests.map((test) => this.generateTestItemHTML(test)).join("")}
          </div>
        </div>
      `;
    }

    return html;
  }

  groupTestsByCategory() {
    const grouped = {};

    this.testResults.forEach((result) => {
      const category = result.category || "Uncategorized";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(result);
    });

    return grouped;
  }

  generateTestItemHTML(test) {
    const statusIcon = test.status === "passed" ? "✅" : "❌";
    const errorHTML = test.error
      ? `<div class="error-message">${test.error}</div>`
      : "";

    return `
      <div class="test-item ${test.status}">
        <div class="test-header">
          <span class="status-icon">${statusIcon}</span>
          <span class="test-name">${test.name}</span>
          <span class="test-duration">${test.duration || 0}ms</span>
        </div>
        ${errorHTML}
      </div>
    `;
  }

  generateCoverageHTML() {
    if (Object.keys(this.coverageData).length === 0) {
      return "<p>No coverage data available.</p>";
    }

    const coverageItems = Object.entries(this.coverageData)
      .map(([component, coverage]) => {
        const percentage = Math.round(coverage * 100) / 100;
        const statusClass =
          percentage >= 80 ? "good" : percentage >= 60 ? "medium" : "poor";

        return `
        <div class="coverage-item">
          <div class="coverage-label">${component}</div>
          <div class="coverage-bar">
            <div class="coverage-fill ${statusClass}" style="width: ${percentage}%"></div>
          </div>
          <div class="coverage-percentage">${percentage}%</div>
        </div>
      `;
      })
      .join("");

    return `
      <div class="coverage-chart">
        <canvas id="coverageChart" width="400" height="200"></canvas>
      </div>
      <div class="coverage-details">
        ${coverageItems}
      </div>
    `;
  }

  generatePerformanceHTML() {
    if (this.performanceMetrics.length === 0) {
      return "<p>No performance data available.</p>";
    }

    const performanceCharts = `
      <div class="performance-charts">
        <div class="chart-container">
          <h4>Response Times</h4>
          <canvas id="responseTimeChart" width="400" height="200"></canvas>
        </div>
        <div class="chart-container">
          <h4>Throughput</h4>
          <canvas id="throughputChart" width="400" height="200"></canvas>
        </div>
      </div>
    `;

    const performanceTable = this.generatePerformanceTable();

    return performanceCharts + performanceTable;
  }

  generatePerformanceTable() {
    const tableRows = this.performanceMetrics
      .map(
        (metric) => `
      <tr>
        <td>${metric.operation || "Unknown"}</td>
        <td>${metric.duration || 0}ms</td>
        <td>${metric.throughput || 0} ops/sec</td>
        <td>${metric.memoryUsage || 0}MB</td>
        <td>${new Date(metric.timestamp).toLocaleTimeString()}</td>
      </tr>
    `,
      )
      .join("");

    return `
      <div class="performance-table">
        <table>
          <thead>
            <tr>
              <th>Operation</th>
              <th>Duration</th>
              <th>Throughput</th>
              <th>Memory</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    `;
  }

  getCSS() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        color: #333;
        background-color: #f5f5f5;
      }

      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
      }

      header {
        text-align: center;
        margin-bottom: 40px;
        padding: 20px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }

      h1 {
        color: #2c3e50;
        margin-bottom: 10px;
      }

      .subtitle {
        color: #7f8c8d;
        font-size: 14px;
      }

      .summary {
        margin-bottom: 40px;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin-top: 20px;
      }

      .summary-card {
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        text-align: center;
      }

      .summary-card h3 {
        color: #7f8c8d;
        font-size: 14px;
        margin-bottom: 10px;
        text-transform: uppercase;
      }

      .metric {
        font-size: 24px;
        font-weight: bold;
        color: #2c3e50;
      }

      .status-badge {
        padding: 8px 16px;
        border-radius: 20px;
        font-weight: bold;
        font-size: 14px;
        text-transform: uppercase;
      }

      .status-badge.passed {
        background-color: #d4edda;
        color: #155724;
      }

      .status-badge.failed {
        background-color: #f8d7da;
        color: #721c24;
      }

      .test-results, .coverage, .performance {
        background: white;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin-bottom: 30px;
      }

      .test-category {
        margin-bottom: 30px;
      }

      .category-header {
        padding: 15px;
        border-radius: 6px;
        margin-bottom: 15px;
        font-weight: bold;
      }

      .category-header.passed {
        background-color: #d4edda;
        color: #155724;
      }

      .category-header.failed {
        background-color: #f8d7da;
        color: #721c24;
      }

      .test-item {
        padding: 12px;
        border-left: 4px solid #ddd;
        margin-bottom: 8px;
        background-color: #f8f9fa;
      }

      .test-item.passed {
        border-left-color: #28a745;
      }

      .test-item.failed {
        border-left-color: #dc3545;
      }

      .test-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .test-name {
        flex: 1;
        margin-left: 10px;
      }

      .test-duration {
        color: #6c757d;
        font-size: 12px;
      }

      .error-message {
        margin-top: 10px;
        padding: 10px;
        background-color: #f8d7da;
        color: #721c24;
        border-radius: 4px;
        font-family: monospace;
        font-size: 12px;
      }

      .coverage-item {
        display: flex;
        align-items: center;
        margin-bottom: 15px;
      }

      .coverage-label {
        width: 200px;
        font-weight: 500;
      }

      .coverage-bar {
        flex: 1;
        height: 20px;
        background-color: #e9ecef;
        border-radius: 10px;
        overflow: hidden;
        margin: 0 15px;
      }

      .coverage-fill {
        height: 100%;
        transition: width 0.3s ease;
      }

      .coverage-fill.good {
        background-color: #28a745;
      }

      .coverage-fill.medium {
        background-color: #ffc107;
      }

      .coverage-fill.poor {
        background-color: #dc3545;
      }

      .coverage-percentage {
        width: 60px;
        text-align: right;
        font-weight: bold;
      }

      .performance-charts {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 30px;
        margin-bottom: 30px;
      }

      .chart-container {
        text-align: center;
      }

      .chart-container h4 {
        margin-bottom: 15px;
        color: #495057;
      }

      .performance-table table {
        width: 100%;
        border-collapse: collapse;
      }

      .performance-table th,
      .performance-table td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid #dee2e6;
      }

      .performance-table th {
        background-color: #f8f9fa;
        font-weight: 600;
        color: #495057;
      }

      .performance-table tr:hover {
        background-color: #f8f9fa;
      }

      @media (max-width: 768px) {
        .summary-grid {
          grid-template-columns: 1fr;
        }
        
        .performance-charts {
          grid-template-columns: 1fr;
        }
        
        .test-header {
          flex-direction: column;
          align-items: flex-start;
        }
        
        .test-duration {
          margin-top: 5px;
        }
      }
    `;
  }

  getJavaScript() {
    return `
      // Coverage Chart
      if (document.getElementById('coverageChart')) {
        const coverageCtx = document.getElementById('coverageChart').getContext('2d');
        const coverageData = ${JSON.stringify(this.coverageData)};
        
        new Chart(coverageCtx, {
          type: 'doughnut',
          data: {
            labels: Object.keys(coverageData),
            datasets: [{
              data: Object.values(coverageData),
              backgroundColor: [
                '#28a745', '#17a2b8', '#ffc107', '#dc3545', '#6f42c1', '#fd7e14'
              ]
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: {
                position: 'bottom'
              }
            }
          }
        });
      }

      // Performance Charts
      if (document.getElementById('responseTimeChart')) {
        const responseTimeCtx = document.getElementById('responseTimeChart').getContext('2d');
        const performanceData = ${JSON.stringify(this.performanceMetrics)};
        
        new Chart(responseTimeCtx, {
          type: 'line',
          data: {
            labels: performanceData.map((_, i) => \`Test \${i + 1}\`),
            datasets: [{
              label: 'Response Time (ms)',
              data: performanceData.map(p => p.duration || 0),
              borderColor: '#007bff',
              backgroundColor: 'rgba(0, 123, 255, 0.1)',
              tension: 0.4
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: true
              }
            }
          }
        });
      }

      if (document.getElementById('throughputChart')) {
        const throughputCtx = document.getElementById('throughputChart').getContext('2d');
        const performanceData = ${JSON.stringify(this.performanceMetrics)};
        
        new Chart(throughputCtx, {
          type: 'bar',
          data: {
            labels: performanceData.map((_, i) => \`Test \${i + 1}\`),
            datasets: [{
              label: 'Throughput (ops/sec)',
              data: performanceData.map(p => p.throughput || 0),
              backgroundColor: '#28a745'
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: true
              }
            }
          }
        });
      }
    `;
  }

  generateJSONReport() {
    const report = {
      summary: this.generateSummary(),
      testResults: this.testResults,
      coverage: this.coverageData,
      performance: this.performanceMetrics,
      metadata: {
        generatedAt: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
      },
    };

    const reportPath = path.join(this.outputDir, "test-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    return reportPath;
  }

  generateCoverageReport() {
    if (!this.enableCoverageReports) return;

    const coverageReport = {
      summary: {
        total: this.calculateOverallCoverage(),
        byComponent: this.coverageData,
      },
      details: this.generateDetailedCoverage(),
      timestamp: new Date().toISOString(),
    };

    const reportPath = path.join(this.outputDir, "coverage-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(coverageReport, null, 2));

    return reportPath;
  }

  generateDetailedCoverage() {
    return Object.entries(this.coverageData).map(([component, coverage]) => ({
      component,
      coverage,
      status: coverage >= 80 ? "good" : coverage >= 60 ? "medium" : "poor",
      target: 90,
      gap: Math.max(0, 90 - coverage),
    }));
  }

  generatePerformanceReport() {
    if (!this.enablePerformanceReports) return;

    const performanceReport = {
      summary: this.calculatePerformanceSummary(),
      metrics: this.performanceMetrics,
      benchmarks: this.generateBenchmarks(),
      timestamp: new Date().toISOString(),
    };

    const reportPath = path.join(this.outputDir, "performance-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(performanceReport, null, 2));

    return reportPath;
  }

  calculatePerformanceSummary() {
    if (this.performanceMetrics.length === 0) return {};

    const durations = this.performanceMetrics.map((m) => m.duration || 0);
    const throughputs = this.performanceMetrics.map((m) => m.throughput || 0);

    return {
      averageResponseTime:
        durations.reduce((a, b) => a + b, 0) / durations.length,
      maxResponseTime: Math.max(...durations),
      minResponseTime: Math.min(...durations),
      averageThroughput:
        throughputs.reduce((a, b) => a + b, 0) / throughputs.length,
      totalTests: this.performanceMetrics.length,
    };
  }

  generateBenchmarks() {
    return {
      responseTimeTargets: {
        excellent: "< 100ms",
        good: "< 500ms",
        acceptable: "< 1000ms",
        poor: ">= 1000ms",
      },
      throughputTargets: {
        excellent: "> 100 ops/sec",
        good: "> 50 ops/sec",
        acceptable: "> 10 ops/sec",
        poor: "<= 10 ops/sec",
      },
    };
  }

  generateAllReports() {
    const reports = {};

    if (this.enableVisualReports) {
      reports.html = this.generateHTMLReport();
    }

    reports.json = this.generateJSONReport();

    if (this.enableCoverageReports) {
      reports.coverage = this.generateCoverageReport();
    }

    if (this.enablePerformanceReports) {
      reports.performance = this.generatePerformanceReport();
    }

    console.log("📊 Test reports generated:", reports);
    return reports;
  }
}

module.exports = TestReporter;
