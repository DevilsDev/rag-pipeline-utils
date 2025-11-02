/**
 * SLO (Service Level Objective) Monitoring System
 * Addresses T-2 remediation: Production observability with SLOs
 */

const { logger } = require('../utils/logger');
const EventEmitter = require('events');

class SLOMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      measurementWindow: config.measurementWindow || 30 * 24 * 60 * 60 * 1000, // 30 days
      alertThreshold: config.alertThreshold || 0.95, // Alert when SLO drops below 95%
      ...config,
    };

    this.metrics = new Map();
    this.slos = new Map();
    this.alerts = [];

    this._initializeDefaultSLOs();
  }

  _initializeDefaultSLOs() {
    // Availability SLO: 99.9% uptime
    this.defineSLO('availability', {
      target: 0.999,
      measurementWindow: this.config.measurementWindow,
      description: 'System availability percentage',
      errorBudget: 0.001,
      alertThreshold: 0.995,
    });

    // Deployment Success SLO: 95% successful deployments
    this.defineSLO('deployment_success', {
      target: 0.95,
      measurementWindow: 7 * 24 * 60 * 60 * 1000, // 7 days
      description: 'Deployment success rate',
      errorBudget: 0.05,
      alertThreshold: 0.9,
    });

    // Test Reliability SLO: 95% test pass rate
    this.defineSLO('test_reliability', {
      target: 0.95,
      measurementWindow: 7 * 24 * 60 * 60 * 1000, // 7 days
      description: 'Test suite reliability',
      errorBudget: 0.05,
      alertThreshold: 0.9,
    });

    // Security Compliance SLO: 100% security scans pass
    this.defineSLO('security_compliance', {
      target: 1.0,
      measurementWindow: 24 * 60 * 60 * 1000, // 1 day
      description: 'Security compliance rate',
      errorBudget: 0.0,
      alertThreshold: 0.99,
    });

    // Response Time SLO: 95% of requests under 2s
    this.defineSLO('response_time', {
      target: 0.95,
      measurementWindow: this.config.measurementWindow,
      description: '95th percentile response time under 2s',
      errorBudget: 0.05,
      alertThreshold: 0.9,
      threshold: 2000, // 2 seconds
    });
  }

  defineSLO(name, config) {
    this.slos.set(name, {
      ...config,
      createdAt: Date.now(),
      measurements: [],
    });

    logger.info('SLO defined', {
      slo: name,
      target: config.target,
      description: config.description,
    });
  }

  recordMeasurement(sloName, success, metadata = {}) {
    if (!this.slos.has(sloName)) {
      throw new Error(`SLO not found: ${sloName}`);
    }

    const slo = this.slos.get(sloName);
    const measurement = {
      timestamp: Date.now(),
      success: Boolean(success),
      metadata,
    };

    slo.measurements.push(measurement);
    this._cleanupOldMeasurements(sloName);

    const currentSLI = this.calculateSLI(sloName);

    logger.debug('SLO measurement recorded', {
      slo: sloName,
      success,
      currentSLI,
      metadata,
    });

    // Check for SLO violations
    if (currentSLI < slo.alertThreshold) {
      this._triggerAlert(sloName, currentSLI, slo);
    }

    this.emit('measurement', {
      slo: sloName,
      success,
      currentSLI,
      metadata,
    });

    return currentSLI;
  }

  calculateSLI(sloName) {
    const slo = this.slos.get(sloName);
    if (!slo || slo.measurements.length === 0) {
      return 1.0; // No data means perfect SLI
    }

    const now = Date.now();
    const windowStart = now - slo.measurementWindow;

    const relevantMeasurements = slo.measurements.filter(
      (m) => m.timestamp >= windowStart,
    );

    if (relevantMeasurements.length === 0) {
      return 1.0;
    }

    const successCount = relevantMeasurements.filter((m) => m.success).length;
    return successCount / relevantMeasurements.length;
  }

  getErrorBudget(sloName) {
    const slo = this.slos.get(sloName);
    if (!slo) {
      throw new Error(`SLO not found: ${sloName}`);
    }

    const currentSLI = this.calculateSLI(sloName);
    const errorBudgetUsed = Math.max(0, slo.target - currentSLI);
    const errorBudgetRemaining = Math.max(0, slo.errorBudget - errorBudgetUsed);

    return {
      target: slo.target,
      current: currentSLI,
      errorBudget: slo.errorBudget,
      errorBudgetUsed,
      errorBudgetRemaining,
      errorBudgetPercentage: (errorBudgetRemaining / slo.errorBudget) * 100,
    };
  }

  getSLOStatus(sloName) {
    const slo = this.slos.get(sloName);
    if (!slo) {
      throw new Error(`SLO not found: ${sloName}`);
    }

    const currentSLI = this.calculateSLI(sloName);
    const errorBudget = this.getErrorBudget(sloName);
    const isHealthy = currentSLI >= slo.target;
    const isAtRisk = currentSLI < slo.alertThreshold;

    return {
      name: sloName,
      description: slo.description,
      target: slo.target,
      current: currentSLI,
      isHealthy,
      isAtRisk,
      errorBudget,
      measurementCount: slo.measurements.length,
      lastMeasurement: slo.measurements[slo.measurements.length - 1]?.timestamp,
    };
  }

  getAllSLOStatus() {
    const status = {};
    for (const sloName of this.slos.keys()) {
      status[sloName] = this.getSLOStatus(sloName);
    }
    return status;
  }

  _cleanupOldMeasurements(sloName) {
    const slo = this.slos.get(sloName);
    const now = Date.now();
    const windowStart = now - slo.measurementWindow;

    slo.measurements = slo.measurements.filter(
      (m) => m.timestamp >= windowStart,
    );
  }

  _triggerAlert(sloName, currentSLI, slo) {
    const alert = {
      id: `slo-${sloName}-${Date.now()}`,
      slo: sloName,
      severity: 'warning',
      message: `SLO ${sloName} is below alert threshold`,
      currentSLI,
      target: slo.target,
      alertThreshold: slo.alertThreshold,
      timestamp: Date.now(),
    };

    this.alerts.push(alert);

    logger.warn('SLO alert triggered', alert);

    this.emit('alert', alert);
  }

  getActiveAlerts() {
    const now = Date.now();
    const alertWindow = 24 * 60 * 60 * 1000; // 24 hours

    return this.alerts.filter((alert) => now - alert.timestamp < alertWindow);
  }

  generateReport() {
    const allStatus = this.getAllSLOStatus();
    const activeAlerts = this.getActiveAlerts();

    const report = {
      timestamp: Date.now(),
      summary: {
        totalSLOs: this.slos.size,
        healthySLOs: Object.values(allStatus).filter((s) => s.isHealthy).length,
        atRiskSLOs: Object.values(allStatus).filter((s) => s.isAtRisk).length,
        activeAlerts: activeAlerts.length,
      },
      slos: allStatus,
      alerts: activeAlerts,
      recommendations: this._generateRecommendations(allStatus),
    };

    logger.info('SLO report generated', {
      totalSLOs: report.summary.totalSLOs,
      healthySLOs: report.summary.healthySLOs,
      atRiskSLOs: report.summary.atRiskSLOs,
      activeAlerts: report.summary.activeAlerts,
    });

    return report;
  }

  _generateRecommendations(sloStatus) {
    const recommendations = [];

    Object.values(sloStatus).forEach((slo) => {
      if (slo.isAtRisk) {
        recommendations.push({
          type: 'urgent',
          slo: slo.name,
          message: `SLO ${slo.name} is at risk. Current: ${(slo.current * 100).toFixed(2)}%, Target: ${(slo.target * 100).toFixed(2)}%`,
          action: 'Investigate root cause and implement fixes',
        });
      } else if (slo.errorBudget.errorBudgetPercentage < 25) {
        recommendations.push({
          type: 'warning',
          slo: slo.name,
          message: `Error budget for ${slo.name} is running low (${slo.errorBudget.errorBudgetPercentage.toFixed(1)}% remaining)`,
          action: 'Monitor closely and consider preventive measures',
        });
      }
    });

    return recommendations;
  }

  // Convenience methods for common measurements
  recordAvailability(isUp, metadata = {}) {
    return this.recordMeasurement('availability', isUp, metadata);
  }

  recordDeployment(success, metadata = {}) {
    return this.recordMeasurement('deployment_success', success, metadata);
  }

  recordTestRun(success, metadata = {}) {
    return this.recordMeasurement('test_reliability', success, metadata);
  }

  recordSecurityScan(passed, metadata = {}) {
    return this.recordMeasurement('security_compliance', passed, metadata);
  }

  recordResponseTime(responseTimeMs, metadata = {}) {
    const slo = this.slos.get('response_time');
    const success = responseTimeMs <= (slo?.threshold || 2000);
    return this.recordMeasurement('response_time', success, {
      ...metadata,
      responseTime: responseTimeMs,
    });
  }
}

// Create default monitor instance
const defaultMonitor = new SLOMonitor();

module.exports = {
  SLOMonitor,
  defaultMonitor,
};
