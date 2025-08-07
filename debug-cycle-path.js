const { DAG } = require('./src/dag/dag-engine.js');

async function testCyclePathOrder() {
  console.log('🔍 Testing cycle path order...\n');
  
  try {
    const dag = new DAG();
    
    // Create the exact same cycle as in the test: A -> B -> C -> A
    const nodeA = dag.addNode('A', () => 'A result');
    const nodeB = dag.addNode('B', () => 'B result');
    const nodeC = dag.addNode('C', () => 'C result');
    
    console.log('Creating connections:');
    console.log('A -> B');
    nodeA.addOutput(nodeB);
    console.log('B -> C');
    nodeB.addOutput(nodeC);
    console.log('C -> A (creates cycle)');
    nodeC.addOutput(nodeA);
    
    console.log('\nNode connections:');
    console.log('A outputs:', nodeA.outputs.map(n => n.id));
    console.log('B outputs:', nodeB.outputs.map(n => n.id));
    console.log('C outputs:', nodeC.outputs.map(n => n.id));
    
    console.log('\nTesting cycle detection...');
    try {
      dag.validateTopology();
      console.log('❌ UNEXPECTED: No cycle detected');
    } catch (error) {
      console.log('✅ EXPECTED: Cycle detected');
      console.log('Expected cycle path: [\'A\', \'B\', \'C\', \'A\']');
      console.log('Actual cycle path:  ', JSON.stringify(error.cycle));
      console.log('Paths match:', JSON.stringify(error.cycle) === JSON.stringify(['A', 'B', 'C', 'A']));
      
      // Try different expected paths
      const possiblePaths = [
        ['A', 'B', 'C', 'A'],
        ['B', 'C', 'A', 'B'],
        ['C', 'A', 'B', 'C'],
        ['A', 'C', 'B', 'A'],
        ['B', 'A', 'C', 'B'],
        ['C', 'B', 'A', 'C']
      ];
      
      console.log('\nChecking all possible cycle representations:');
      possiblePaths.forEach(path => {
        const matches = JSON.stringify(error.cycle) === JSON.stringify(path);
        console.log(`${matches ? '✅' : '❌'} ${JSON.stringify(path)}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCyclePathOrder();
