const { DAG } = require('./src/dag/dag-engine.js');

async function testTimeoutDetailed() {
  console.log('🔍 Detailed timeout debugging...\n');
  
  try {
    const dag = new DAG();
    
    // Add a node that takes 200ms
    const timeoutNode = dag.addNode('timeout', async () => {
      console.log('Node execution started...');
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log('Node execution completed!');
      return 'completed';
    });
    
    // Test timeout Promise creation directly
    console.log('Testing timeout Promise creation...');
    const timeout = 100;
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        console.log('Timeout Promise rejecting...');
        reject(new Error('Execution timeout'));
      }, timeout);
    });
    
    console.log('Testing Promise.race directly...');
    const nodeExecution = new Promise(resolve => {
      setTimeout(() => {
        console.log('Node Promise resolving...');
        resolve('completed');
      }, 200);
    });
    
    try {
      const result = await Promise.race([nodeExecution, timeoutPromise]);
      console.log('❌ UNEXPECTED: Promise.race resolved with:', result);
    } catch (error) {
      console.log('✅ EXPECTED: Promise.race rejected with:', error.message);
    }
    
    // Clear timeout to prevent hanging
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testTimeoutDetailed();
