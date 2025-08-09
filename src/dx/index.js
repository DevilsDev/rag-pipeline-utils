/**
 * Developer Experience (DX) Enhancements
 * 
 * This module provides advanced developer tools and interfaces for the RAG pipeline:
 * - Visual Pipeline Builder: Web-based drag-and-drop interface
 * - Real-time Debugging: Live pipeline inspection and debugging
 * - Performance Profiler: Detailed bottleneck analysis
 * - Integration Templates: Pre-built connectors for popular services
 */

const VisualPipelineBuilder = require('./visual-pipeline-builder'); // eslint-disable-line global-require
const RealtimeDebugger = require('./realtime-debugger'); // eslint-disable-line global-require
const PerformanceProfiler = require('./performance-profiler'); // eslint-disable-line global-require
const IntegrationTemplates = require('./integration-templates'); // eslint-disable-line global-require

module.exports = {
  VisualPipelineBuilder,
  RealtimeDebugger,
  PerformanceProfiler,
  IntegrationTemplates,
  
  // Convenience factory methods
  createVisualBuilder: (_options = {}) => new VisualPipelineBuilder(_options),
  createDebugger: (_options = {}) => new RealtimeDebugger(_options),
  createProfiler: (_options = {}) => new PerformanceProfiler(_options),
  getTemplates: () => IntegrationTemplates.getAllTemplates(),
  
  // DX utilities
  getDXInfo: () => ({
    version: '1.0.0',
    components: ['visual-builder', 'debugger', 'profiler', 'templates'],
    status: 'active'
  })
};


// Ensure module.exports is properly defined
