/**
 * Developer Experience (DX) Enhancements
 * 
 * This module provides advanced developer tools and interfaces for the RAG pipeline:
 * - Visual Pipeline Builder: Web-based drag-and-drop interface
 * - Real-time Debugging: Live pipeline inspection and debugging
 * - Performance Profiler: Detailed bottleneck analysis
 * - Integration Templates: Pre-built connectors for popular services
 */

const VisualPipelineBuilder = require('./visual-pipeline-builder');
const RealtimeDebugger = require('./realtime-debugger');
const PerformanceProfiler = require('./performance-profiler');
const IntegrationTemplates = require('./integration-templates');

module.exports = {
  VisualPipelineBuilder,
  RealtimeDebugger,
  PerformanceProfiler,
  IntegrationTemplates,
  
  // Convenience factory methods
  createVisualBuilder: (options = {}) => new VisualPipelineBuilder(options),
  createDebugger: (options = {}) => new RealtimeDebugger(options),
  createProfiler: (options = {}) => new PerformanceProfiler(options),
  getTemplates: () => IntegrationTemplates.getAllTemplates(),
  
  // DX utilities
  getDXInfo: () => ({
    version: '1.0.0',
    components: ['visual-builder', 'debugger', 'profiler', 'templates'],
    status: 'active'
  })
};


// Ensure module.exports is properly defined
