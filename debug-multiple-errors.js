const { DAG } = require('./src/dag/dag-engine.js');

async function testMultipleErrorAggregation() {
  console.log('🔍 Testing multiple error aggregation...\n');
  
  try {
    const dag = new DAG();
    
    // Create two independent error nodes (same as test)
    const _error1Node = dag.addNode('error1', () => {
      console.log('error1Node executing...');
      throw new Error('First error');
    });
    const _error2Node = dag.addNode('error2', () => {
      console.log('error2Node executing...');
      throw new Error('Second error');
    });
    
    console.log('DAG structure:');
    console.log('- error1Node (independent)');
    console.log('- error2Node (independent)');
    console.log('- Total nodes:', dag.nodes.size);
    
    console.log('\nExecuting DAG...');
    try {
      const result = await dag.execute();
      console.log('❌ UNEXPECTED: DAG execution succeeded with result:', result);
    } catch (error) {
      console.log('✅ EXPECTED: DAG execution failed');
      console.log('Error message:', JSON.stringify(error.message));
      console.log('Error has errors property:', 'errors' in error);
      console.log('Error.errors value:', JSON.stringify(error.errors));
      console.log('Error.errors length:', error.errors ? error.errors.length : 'N/A');
      
      if (error.errors) {
        console.log('Error details:');
        error.errors.forEach((err, index) => {
          console.log(`  ${index}: nodeId=${err.nodeId}, message=${err.message}`);
        });
      } else {
        console.log('❌ ERROR: error.errors is undefined - aggregation failed');
      }
      
      console.log('Full error keys:', Object.keys(error));
      console.log('Error constructor:', error.constructor.name);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testMultipleErrorAggregation();
