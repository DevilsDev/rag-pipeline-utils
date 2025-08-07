const { DAG } = require('./src/dag/dag-engine.js');

async function testTimeout() {
  console.log('🔍 Testing DAG timeout behavior...\n');
  
  try {
    const dag = new DAG();
    
    // Add a node that takes 200ms
    const timeoutNode = dag.addNode('timeout', async () => {
      console.log('Node execution started...');
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log('Node execution completed!');
      return 'completed';
    });
    
    console.log('Starting DAG execution with 100ms timeout...');
    const startTime = Date.now();
    
    try {
      const result = await dag.execute(null, { timeout: 100 });
      const endTime = Date.now();
      console.log(`❌ UNEXPECTED: Execution completed in ${endTime - startTime}ms with result:`, result);
    } catch (error) {
      const endTime = Date.now();
      console.log(`✅ EXPECTED: Execution failed in ${endTime - startTime}ms with error:`, error.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testTimeout();
