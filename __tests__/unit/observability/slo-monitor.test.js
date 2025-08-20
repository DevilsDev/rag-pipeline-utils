/**
 * Test suite for SLO Monitor
 * Tests production observability and SLO tracking functionality
 */

const { SLOMonitor } = require('../../../src/observability/slo-monitor');

describe('SLOMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new SLOMonitor({
      measurementWindow: 60000, // 1 minute for testing
      alertThreshold: 0.95
    });
  });

  describe('SLO Definition', () => {
    test('should define custom SLO', () => {
      monitor.defineSLO('custom_slo', {
        target: 0.99,
        measurementWindow: 30000,
        description: 'Custom test SLO',
        errorBudget: 0.01,
        alertThreshold: 0.95
      });

      const status = monitor.getSLOStatus('custom_slo');
      expect(status.name).toBe('custom_slo');
      expect(status.target).toBe(0.99);
      expect(status.description).toBe('Custom test SLO');
    });

    test('should have default SLOs defined', () => {
      const allStatus = monitor.getAllSLOStatus();
      
      expect(allStatus).toHaveProperty('availability');
      expect(allStatus).toHaveProperty('deployment_success');
      expect(allStatus).toHaveProperty('test_reliability');
      expect(allStatus).toHaveProperty('security_compliance');
      expect(allStatus).toHaveProperty('response_time');
    });
  });

  describe('Measurement Recording', () => {
    test('should record successful measurements', () => {
      const sli = monitor.recordMeasurement('availability', true, { service: 'api' });
      
      expect(sli).toBe(1.0); // 100% success rate
      
      const status = monitor.getSLOStatus('availability');
      expect(status.current).toBe(1.0);
      expect(status.isHealthy).toBe(true);
      expect(status.measurementCount).toBe(1);
    });

    test('should record failed measurements', () => {
      monitor.recordMeasurement('availability', false);
      const sli = monitor.recordMeasurement('availability', true);
      
      expect(sli).toBe(0.5); // 50% success rate
      
      const status = monitor.getSLOStatus('availability');
      expect(status.current).toBe(0.5);
      expect(status.isHealthy).toBe(false);
    });

    test('should throw error for unknown SLO', () => {
      expect(() => {
        monitor.recordMeasurement('unknown_slo', true);
      }).toThrow('SLO not found: unknown_slo');
    });
  });

  describe('SLI Calculation', () => {
    test('should calculate SLI correctly', () => {
      // Record mixed results
      monitor.recordMeasurement('test_reliability', true);
      monitor.recordMeasurement('test_reliability', true);
      monitor.recordMeasurement('test_reliability', false);
      monitor.recordMeasurement('test_reliability', true);
      
      const sli = monitor.calculateSLI('test_reliability');
      expect(sli).toBe(0.75); // 3 success out of 4
    });

    test('should return 1.0 for no measurements', () => {
      const sli = monitor.calculateSLI('availability');
      expect(sli).toBe(1.0);
    });

    test('should handle measurement window correctly', () => {
      const shortWindowMonitor = new SLOMonitor({
        measurementWindow: 100 // 100ms
      });

      shortWindowMonitor.defineSLO('test_slo', {
        target: 0.9,
        measurementWindow: 100,
        description: 'Test SLO',
        errorBudget: 0.1,
        alertThreshold: 0.8
      });

      // Record measurement
      shortWindowMonitor.recordMeasurement('test_slo', false);
      
      // Wait for measurement to expire
      return new Promise(resolve => {
        setTimeout(() => {
          const sli = shortWindowMonitor.calculateSLI('test_slo');
          expect(sli).toBe(1.0); // Should be 1.0 as measurement expired
          resolve();
        }, 150);
      });
    });
  });

  describe('Error Budget Tracking', () => {
    test('should calculate error budget correctly', () => {
      // Set up SLO with 90% target (10% error budget)
      monitor.defineSLO('budget_test', {
        target: 0.9,
        measurementWindow: 60000,
        description: 'Budget test SLO',
        errorBudget: 0.1,
        alertThreshold: 0.85
      });

      // Record measurements: 8 success, 2 failures = 80% SLI
      for (let i = 0; i < 8; i++) {
        monitor.recordMeasurement('budget_test', true);
      }
      for (let i = 0; i < 2; i++) {
        monitor.recordMeasurement('budget_test', false);
      }

      const errorBudget = monitor.getErrorBudget('budget_test');
      
      expect(errorBudget.target).toBe(0.9);
      expect(errorBudget.current).toBe(0.8);
      expect(errorBudget.errorBudgetUsed).toBe(0.1); // 90% - 80% = 10%
      expect(errorBudget.errorBudgetRemaining).toBe(0.0); // 10% - 10% = 0%
      expect(errorBudget.errorBudgetPercentage).toBe(0);
    });

    test('should handle positive error budget', () => {
      monitor.defineSLO('positive_budget', {
        target: 0.8,
        measurementWindow: 60000,
        description: 'Positive budget test',
        errorBudget: 0.2,
        alertThreshold: 0.75
      });

      // Record 90% success rate
      for (let i = 0; i < 9; i++) {
        monitor.recordMeasurement('positive_budget', true);
      }
      monitor.recordMeasurement('positive_budget', false);

      const errorBudget = monitor.getErrorBudget('positive_budget');
      
      expect(errorBudget.current).toBe(0.9);
      expect(errorBudget.errorBudgetUsed).toBe(0); // No error budget used
      expect(errorBudget.errorBudgetRemaining).toBe(0.2); // Full budget remaining
      expect(errorBudget.errorBudgetPercentage).toBe(100);
    });
  });

  describe('Alert System', () => {
    test('should trigger alert when SLI drops below threshold', (done) => {
      monitor.defineSLO('alert_test', {
        target: 0.9,
        measurementWindow: 60000,
        description: 'Alert test SLO',
        errorBudget: 0.1,
        alertThreshold: 0.8
      });

      monitor.on('alert', (alert) => {
        expect(alert.slo).toBe('alert_test');
        expect(alert.severity).toBe('warning');
        expect(alert.currentSLI).toBeLessThan(0.8);
        expect(alert.message).toContain('below alert threshold');
        done();
      });

      // Record failures to trigger alert
      for (let i = 0; i < 8; i++) {
        monitor.recordMeasurement('alert_test', false);
      }
      monitor.recordMeasurement('alert_test', true);
    });

    test('should track active alerts', () => {
      monitor.defineSLO('alert_tracking', {
        target: 0.9,
        measurementWindow: 60000,
        description: 'Alert tracking test',
        errorBudget: 0.1,
        alertThreshold: 0.8
      });

      // Trigger alert
      for (let i = 0; i < 9; i++) {
        monitor.recordMeasurement('alert_tracking', false);
      }

      const activeAlerts = monitor.getActiveAlerts();
      expect(activeAlerts.length).toBeGreaterThan(0);
      expect(activeAlerts[0].slo).toBe('alert_tracking');
    });
  });

  describe('Convenience Methods', () => {
    test('should record availability measurements', () => {
      const sli = monitor.recordAvailability(true, { endpoint: '/health' });
      expect(sli).toBe(1.0);
      
      const status = monitor.getSLOStatus('availability');
      expect(status.measurementCount).toBe(1);
    });

    test('should record deployment measurements', () => {
      const sli = monitor.recordDeployment(true, { version: '1.2.3' });
      expect(sli).toBe(1.0);
      
      const status = monitor.getSLOStatus('deployment_success');
      expect(status.measurementCount).toBe(1);
    });

    test('should record test run measurements', () => {
      const sli = monitor.recordTestRun(false, { suite: 'integration' });
      expect(sli).toBe(0.0);
      
      const status = monitor.getSLOStatus('test_reliability');
      expect(status.measurementCount).toBe(1);
      expect(status.isHealthy).toBe(false);
    });

    test('should record security scan measurements', () => {
      const sli = monitor.recordSecurityScan(true, { scanner: 'npm-audit' });
      expect(sli).toBe(1.0);
      
      const status = monitor.getSLOStatus('security_compliance');
      expect(status.measurementCount).toBe(1);
    });

    test('should record response time measurements', () => {
      // Fast response (under 2s threshold)
      let sli = monitor.recordResponseTime(1500, { endpoint: '/api/fast' });
      expect(sli).toBe(1.0);
      
      // Slow response (over 2s threshold)
      sli = monitor.recordResponseTime(3000, { endpoint: '/api/slow' });
      expect(sli).toBe(0.5); // 50% success rate
      
      const status = monitor.getSLOStatus('response_time');
      expect(status.measurementCount).toBe(2);
    });
  });

  describe('Reporting', () => {
    test('should generate comprehensive report', () => {
      // Add some measurements
      monitor.recordAvailability(true);
      monitor.recordAvailability(false);
      monitor.recordDeployment(true);
      monitor.recordTestRun(false);

      const report = monitor.generateReport();
      
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('slos');
      expect(report).toHaveProperty('alerts');
      expect(report).toHaveProperty('recommendations');
      
      expect(report.summary.totalSLOs).toBe(5); // Default SLOs
      expect(report.slos).toHaveProperty('availability');
      expect(report.slos).toHaveProperty('deployment_success');
    });

    test('should generate recommendations for at-risk SLOs', () => {
      monitor.defineSLO('risky_slo', {
        target: 0.9,
        measurementWindow: 60000,
        description: 'Risky SLO',
        errorBudget: 0.1,
        alertThreshold: 0.8
      });

      // Make it at-risk
      for (let i = 0; i < 8; i++) {
        monitor.recordMeasurement('risky_slo', false);
      }
      monitor.recordMeasurement('risky_slo', true);

      const report = monitor.generateReport();
      const urgentRecommendations = report.recommendations.filter(r => r.type === 'urgent');
      
      expect(urgentRecommendations.length).toBeGreaterThan(0);
      expect(urgentRecommendations[0].slo).toBe('risky_slo');
      expect(urgentRecommendations[0].message).toContain('at risk');
    });
  });

  describe('Event Emission', () => {
    test('should emit measurement events', (done) => {
      monitor.on('measurement', (event) => {
        expect(event.slo).toBe('availability');
        expect(event.success).toBe(true);
        expect(event.currentSLI).toBe(1.0);
        expect(event.metadata).toEqual({ test: 'data' });
        done();
      });

      monitor.recordMeasurement('availability', true, { test: 'data' });
    });
  });
});
