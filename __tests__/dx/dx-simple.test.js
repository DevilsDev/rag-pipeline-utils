/**
 * Phase 10: Developer Experience Enhancements - Simplified Tests
 * 
 * Basic validation tests for all DX components
 */

const {
  VisualPipelineBuilder,
  RealtimeDebugger,
  PerformanceProfiler,
  IntegrationTemplates
} = require('../../src/dx/index');

describe('Phase 10: DX Enhancements - Core Functionality', () => {
  
  test('Visual Pipeline Builder - Basic Operations', () => {
    const builder = new VisualPipelineBuilder({ port: 3001 });
    
    // Test pipeline creation
    const pipelineId = builder.createPipeline('Test Pipeline', 'Test description');
    expect(pipelineId).toBeDefined();
    expect(pipelineId).toMatch(/^pipeline_\d+$/);
    
    // Test component addition
    const componentId = builder.addComponent(pipelineId, 'loader', { x: 100, y: 100 });
    expect(componentId).toBeDefined();
    expect(componentId).toMatch(/^loader_\d+$/);
    
    // Test pipeline retrieval
    const pipeline = builder.pipelines.get(pipelineId);
    expect(pipeline.name).toBe('Test Pipeline');
    expect(pipeline.components).toHaveLength(1);
    
    // Test available components
    const components = builder.getAvailableComponents();
    expect(components.length).toBeGreaterThan(0);
    expect(components.find(c => c.id === 'loader')).toBeDefined();
  });
  
  test('Real-time Debugger - Session Management', () => {
    const rtDebugger = new RealtimeDebugger({ port: 3002 });
    
    // Test session creation
    const sessionId = 'test-session';
    const session = rtDebugger.startSession(sessionId, { name: 'Test Pipeline' });
    
    expect(session).toBeDefined();
    expect(session.id).toBe(sessionId);
    expect(session.status).toBe('active');
    expect(session.steps).toEqual([]);
    
    // Test breakpoint management
    const breakpointId = rtDebugger.addBreakpoint(sessionId, 'component1');
    expect(breakpointId).toBeDefined();
    expect(rtDebugger.breakpoints.has(breakpointId)).toBe(true);
    
    // Test session cleanup
    rtDebugger.endSession(sessionId);
    expect(rtDebugger.sessions.has(sessionId)).toBe(false);
    expect(rtDebugger.breakpoints.size).toBe(0);
  });
  
  test('Performance Profiler - Basic Profiling', () => {
    const profiler = new PerformanceProfiler({
      sampleInterval: 10,
      maxSamples: 100
    });
    
    // Test profiling lifecycle
    const sessionId = 'test-profile';
    profiler.startProfiling(sessionId);
    
    expect(profiler.isProfileing).toBe(true);
    expect(profiler.currentProfile).toBeDefined();
    expect(profiler.currentProfile.id).toBe(sessionId);
    
    // Test metric addition
    profiler.addMetric('test_metric', 42, { tag: 'test' });
    const metrics = profiler.currentProfile.metrics.get('test_metric');
    expect(metrics).toHaveLength(1);
    expect(metrics[0].value).toBe(42);
    
    // Test profiling stop
    const stoppedSessionId = profiler.stopProfiling();
    expect(profiler.isProfileing).toBe(false);
    expect(stoppedSessionId).toBe(sessionId);
  });
  
  test('Integration Templates - Template Management', () => {
    const templates = new IntegrationTemplates();
    
    // Test template retrieval
    const allTemplates = templates.getAllTemplates();
    expect(allTemplates.length).toBeGreaterThan(0);
    
    // Test specific templates
    const confluenceTemplate = templates.getTemplate('confluence');
    expect(confluenceTemplate).toBeDefined();
    expect(confluenceTemplate.name).toBe('Atlassian Confluence');
    expect(confluenceTemplate.category).toBe('data-sources');
    
    const openaiTemplate = templates.getTemplate('openai-gpt4');
    expect(openaiTemplate).toBeDefined();
    expect(openaiTemplate.name).toBe('OpenAI GPT-4');
    expect(openaiTemplate.category).toBe('llm-providers');
    
    // Test category filtering
    const dataSources = templates.getTemplatesByCategory('data-sources');
    expect(dataSources.length).toBeGreaterThan(0);
    expect(dataSources.every(t => t.category === 'data-sources')).toBe(true);
    
    // Test search functionality
    const openaiTemplates = templates.searchTemplates('openai');
    expect(openaiTemplates.length).toBeGreaterThan(0);
    
    // Test statistics
    const stats = templates.getStatistics();
    expect(stats.totalTemplates).toBeGreaterThan(0);
    expect(stats.categoryCounts).toBeDefined();
    expect(stats.typeCounts).toBeDefined();
  });
  
  test('DX Module Integration', () => {
    // Test that all components can be instantiated together
    const builder = new VisualPipelineBuilder();
    const rtDebugger = new RealtimeDebugger();
    const profiler = new PerformanceProfiler();
    const templates = new IntegrationTemplates();
    
    expect(builder).toBeDefined();
    expect(rtDebugger).toBeDefined();
    expect(profiler).toBeDefined();
    expect(templates).toBeDefined();
    
    // Test basic integration workflow
    const pipelineId = builder.createPipeline('Integration Test');
    const sessionId = 'integration-session';
    const profileId = 'integration-profile';
    
    rtDebugger.startSession(sessionId, { pipelineId });
    profiler.startProfiling(profileId);
    
    expect(builder.pipelines.has(pipelineId)).toBe(true);
    expect(rtDebugger.sessions.has(sessionId)).toBe(true);
    expect(profiler.isProfileing).toBe(true);
    
    // Cleanup
    rtDebugger.endSession(sessionId);
    profiler.stopProfiling();
    
    expect(rtDebugger.sessions.has(sessionId)).toBe(false);
    expect(profiler.isProfileing).toBe(false);
  });
  
  test('Template Integration with Pipeline Builder', () => {
    const templates = new IntegrationTemplates();
    const builder = new VisualPipelineBuilder();
    
    // Get a template and use its configuration
    const openaiTemplate = templates.getTemplate('openai-gpt4');
    expect(openaiTemplate).toBeDefined();
    
    // Create pipeline with template-based component
    const pipelineId = builder.createPipeline('Template Pipeline');
    const llmId = builder.addComponent(pipelineId, 'llm', { x: 200, y: 100 }, {
      model: openaiTemplate.config.model.default,
      temperature: openaiTemplate.config.temperature.default
    });
    
    const pipeline = builder.pipelines.get(pipelineId);
    const llmComponent = pipeline.components.find(c => c.id === llmId);
    
    expect(llmComponent.config.model).toBe('gpt-4');
    expect(llmComponent.config.temperature).toBe(0.7);
  });
});
