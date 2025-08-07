const { DAG } = require('./src/dag/dag-engine.js');

async function testCycleDetection() {
  console.log('🔍 Testing cycle detection behavior...\n');
  
  try {
    const dag = new DAG();
    
    // Create cycle: A -> B -> C -> A
    const nodeA = dag.addNode('A', () => 'A result');
    const nodeB = dag.addNode('B', () => 'B result');
    const nodeC = dag.addNode('C', () => 'C result');
    
    nodeA.addOutput(nodeB);
    nodeB.addOutput(nodeC);
    nodeC.addOutput(nodeA); // Creates cycle
    
    console.log('Testing validateTopology...');
    try {
      dag.validateTopology();
      console.log('❌ UNEXPECTED: validateTopology did not throw');
    } catch (error) {
      console.log('✅ EXPECTED: validateTopology threw error');
      console.log('Error message:', error.message);
      console.log('Error cycle property:', error.cycle);
      console.log('Error has cycle property:', 'cycle' in error);
      console.log('Full error object:', error);
    }
    
    console.log('\nTesting topoSort directly...');
    try {
      dag.topoSort();
      console.log('❌ UNEXPECTED: topoSort did not throw');
    } catch (error) {
      console.log('✅ EXPECTED: topoSort threw error');
      console.log('Error message:', error.message);
      console.log('Error cycle property:', error.cycle);
      console.log('Error has cycle property:', 'cycle' in error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testCycleDetection();
