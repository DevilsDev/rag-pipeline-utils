const { PipelineTracer } = require('./src/core/observability/tracing.js');

async function debugStats() {
  const tracer = new PipelineTracer();
  const mockPlugin = () => Promise.resolve('result');
  
  console.log('Creating spans...');
  await tracer.tracePlugin('embedder', 'openai', mockPlugin, 'input');
  await tracer.tracePlugin('llm', 'gpt-4', mockPlugin, 'input');
  
  const spans = tracer.getCompletedSpans();
  console.log('Completed spans:', spans.length);
  
  spans.forEach((span, i) => {
    console.log(`Span ${i}:`);
    console.log(`  name: ${span.name}`);
    console.log(`  duration: ${span.duration}`);
    console.log(`  startTime: ${span.startTime}`);
    console.log(`  endTime: ${span.endTime}`);
  });
  
  const stats = tracer.getTraceStats();
  console.log('Statistics:');
  console.log(`  averageDuration: ${stats.averageDuration}`);
  console.log(`  completedSpans: ${stats.completedSpans}`);
}

debugStats().catch(console.error);
