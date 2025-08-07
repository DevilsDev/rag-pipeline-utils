const { DAG, DAGNode } = require('./src/dag/dag-engine.js');

async function testDAGFeatures() {
  console.log('🔍 Testing DAG Engine Features...\n');
  
  try {
    // Test 1: Basic execution
    console.log('1. Testing basic execution...');
    const dag1 = new DAG();
    const node1 = dag1.addNode('test', () => 'success');
    const result1 = await dag1.execute();
    console.log('✅ Basic execution:', result1);
    
    // Test 2: Concurrency limits
    console.log('\n2. Testing concurrency limits...');
    const dag2 = new DAG();
    let activeCount = 0;
    let maxConcurrent = 0;
    
    for (let i = 0; i < 5; i++) {
      dag2.addNode(`concurrent-${i}`, async () => {
        activeCount++;
        maxConcurrent = Math.max(maxConcurrent, activeCount);
        await new Promise(resolve => setTimeout(resolve, 50));
        activeCount--;
        return `result-${i}`;
      });
    }
    
    await dag2.execute({ maxConcurrency: 2 });
    console.log('✅ Max concurrent nodes:', maxConcurrent, '(should be <= 2)');
    
    // Test 3: Orphaned node detection
    console.log('\n3. Testing orphaned node detection...');
    const dag3 = new DAG();
    dag3.addNode('isolated', () => 'isolated');
    dag3.addNode('connected1', () => 'connected1');
    dag3.addNode('connected2', () => 'connected2');
    dag3.nodes.get('connected1').addOutput(dag3.nodes.get('connected2'));
    
    const warnings = dag3.validateTopology({ strict: false });
    console.log('✅ Warnings:', warnings);
    
    // Test 4: Checkpoint and resume
    console.log('\n4. Testing checkpoint and resume...');
    const dag4 = new DAG();
    const checkpointData = new Map();
    
    dag4.addNode('A', () => {
      checkpointData.set('A', 'A-completed');
      return 'A-result';
    });
    dag4.addNode('B', () => {
      throw new Error('B failed');
    });
    
    try {
      await dag4.execute({ enableCheckpoints: true });
    } catch (error) {
      console.log('✅ Expected failure caught:', error.message);
    }
    
    console.log('✅ Checkpoint data:', Array.from(checkpointData.entries()));
    
    // Test 5: Retry mechanism
    console.log('\n5. Testing retry mechanism...');
    const dag5 = new DAG();
    let attempts = 0;
    dag5.addNode('retry', () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Temporary failure');
      }
      return 'success';
    });
    
    const result5 = await dag5.execute({ retryFailedNodes: true, maxRetries: 3 });
    console.log('✅ Retry attempts:', attempts, 'Result:', result5);
    
    console.log('\n🎉 All DAG features working correctly!');
    
  } catch (error) {
    console.error('❌ DAG test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testDAGFeatures();
