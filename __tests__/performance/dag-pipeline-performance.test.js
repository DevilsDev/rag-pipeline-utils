/**
 * DAG Pipeline Execution Performance Testing
 * Tests complex DAG workflows with 10k+ chunks and concurrent execution
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { TestDataGenerator, PerformanceBenchmark } from '../utils/test-helpers.js';

describe('DAG Pipeline Performance Tests', () => {
  let dagMetrics = [];
  let executionTraces = [];
  
  beforeAll(() => {
    const outputDir = path.join(process.cwd(), 'performance-reports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  afterAll(async () => {
    await generateDAGReports();
  });

  describe('Large Graph Execution', () => {
    const graphSizes = [1000, 5000, 10000, 25000];
    
    test.each(graphSizes)('should execute DAG with %d nodes efficiently', async (nodeCount) => {
      const benchmark = new PerformanceBenchmark(`dag-execution-${nodeCount}`);
      
      // Create complex DAG structure
      const dagEngine = createMockDAGEngine();
      const graph = generateComplexDAG(nodeCount);
      
      benchmark.start();
      const result = await dagEngine.execute(graph);
      const metrics = benchmark.end();
      
      // Validate execution
      expect(result.executedNodes).toBe(nodeCount);
      expect(result.success).toBe(true);
      
      // Performance assertions
      const avgNodeTime = metrics.duration / nodeCount;
      expect(avgNodeTime).toBeLessThan(5); // Less than 5ms per node
      expect(metrics.duration).toBeLessThan(nodeCount * 10); // Less than 10ms per node total
      
      // Store metrics
      const performanceData = {
        testName: `dag-execution-${nodeCount}`,
        nodeCount,
        totalDuration: metrics.duration,
        avgNodeExecutionTime: avgNodeTime,
        nodesPerSecond: (nodeCount / metrics.duration) * 1000,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        parallelizationRatio: result.parallelizationRatio,
        criticalPathLength: result.criticalPathLength,
        timestamp: new Date().toISOString()
      };
      
      dagMetrics.push(performanceData);
      
      console.log(`🔀 DAG ${nodeCount}: ${performanceData.nodesPerSecond.toFixed(2)} nodes/sec, ${performanceData.parallelizationRatio.toFixed(2)} parallel ratio`);
    }, 300000); // 5 minute timeout for large graphs
  });

  describe('Concurrent DAG Execution', () => {
    it('should handle multiple DAGs concurrently', async () => {
      const concurrentDAGs = 5;
      const nodesPerDAG = 2000;
      
      const dagEngine = createMockDAGEngine();
      const dags = Array.from({ length: concurrentDAGs }, (_, i) => 
        generateComplexDAG(nodesPerDAG, `dag-${i}`)
      );

      const startTime = performance.now();
      
      // Execute all DAGs concurrently
      const results = await Promise.all(
        dags.map((dag, index) => dagEngine.execute(dag, { dagId: index }))
      );
      
      const endTime = performance.now();
      const totalDuration = endTime - startTime;
      
      // Validate all DAGs executed successfully
      expect(results).toHaveLength(concurrentDAGs);
      results.forEach((result, index) => {
        expect(result.executedNodes).toBe(nodesPerDAG);
        expect(result.success).toBe(true);
        expect(result.dagId).toBe(index);
      });
      
      // Performance metrics
      const totalNodes = concurrentDAGs * nodesPerDAG;
      const overallThroughput = (totalNodes / totalDuration) * 1000;
      const avgDAGDuration = results.reduce((sum, r) => sum + r.executionTime, 0) / concurrentDAGs;
      
      // Performance assertions
      expect(overallThroughput).toBeGreaterThan(500); // More than 500 nodes/sec
      expect(avgDAGDuration).toBeLessThan(totalDuration * 1.5); // Reasonable concurrency efficiency
      
      console.log(`🚀 Concurrent DAGs: ${overallThroughput.toFixed(2)} nodes/sec, ${avgDAGDuration.toFixed(2)}ms avg DAG`);
      
      // Store concurrent metrics
      dagMetrics.push({
        testName: 'concurrent-dag-execution',
        concurrentDAGs,
        nodesPerDAG,
        totalDuration,
        overallThroughput,
        avgDAGDuration,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        timestamp: new Date().toISOString()
      });
    });
  });

  describe('Complex DAG Patterns', () => {
    it('should handle diamond dependency patterns efficiently', async () => {
      const diamondDAG = {
        nodes: new Map(),
        edges: new Map(),
        
        addNode(id, processor) {
          this.nodes.set(id, { id, processor, dependencies: [], dependents: [] });
        },
        
        addEdge(from, to) {
          if (!this.edges.has(from)) this.edges.set(from, []);
          this.edges.get(from).push(to);
          
          this.nodes.get(from).dependents.push(to);
          this.nodes.get(to).dependencies.push(from);
        }
      };
      
      // Create diamond pattern: A -> B,C -> D
      const layers = 10; // 10 diamond layers
      for (let layer = 0; layer < layers; layer++) {
        const baseId = layer * 4;
        
        // Add nodes
        diamondDAG.addNode(`node-${baseId}`, createMockProcessor(50)); // Root
        diamondDAG.addNode(`node-${baseId + 1}`, createMockProcessor(100)); // Left branch
        diamondDAG.addNode(`node-${baseId + 2}`, createMockProcessor(100)); // Right branch
        diamondDAG.addNode(`node-${baseId + 3}`, createMockProcessor(75)); // Merge
        
        // Add edges
        diamondDAG.addEdge(`node-${baseId}`, `node-${baseId + 1}`);
        diamondDAG.addEdge(`node-${baseId}`, `node-${baseId + 2}`);
        diamondDAG.addEdge(`node-${baseId + 1}`, `node-${baseId + 3}`);
        diamondDAG.addEdge(`node-${baseId + 2}`, `node-${baseId + 3}`);
        
        // Connect to next layer
        if (layer < layers - 1) {
          diamondDAG.addEdge(`node-${baseId + 3}`, `node-${baseId + 4}`);
        }
      }
      
      const dagEngine = createMockDAGEngine();
      const benchmark = new PerformanceBenchmark('diamond-dag-pattern');
      
      benchmark.start();
      const result = await dagEngine.execute(diamondDAG);
      const metrics = benchmark.end();
      
      expect(result.executedNodes).toBe(layers * 4);
      expect(result.success).toBe(true);
      
      // Should achieve good parallelization
      expect(result.parallelizationRatio).toBeGreaterThan(1.5);
      
      console.log(`💎 Diamond DAG: ${metrics.duration.toFixed(2)}ms, ${result.parallelizationRatio.toFixed(2)} parallel ratio`);
    });

    it('should handle fan-out/fan-in patterns', async () => {
      const fanOutInDAG = {
        nodes: new Map(),
        edges: new Map(),
        
        addNode(id, processor) {
          this.nodes.set(id, { id, processor, dependencies: [], dependents: [] });
        },
        
        addEdge(from, to) {
          if (!this.edges.has(from)) this.edges.set(from, []);
          this.edges.get(from).push(to);
          
          this.nodes.get(from).dependents.push(to);
          this.nodes.get(to).dependencies.push(from);
        }
      };
      
      // Create fan-out/fan-in: 1 -> 100 -> 1
      fanOutInDAG.addNode('root', createMockProcessor(10));
      
      // Fan-out to 100 nodes
      for (let i = 0; i < 100; i++) {
        fanOutInDAG.addNode(`worker-${i}`, createMockProcessor(50));
        fanOutInDAG.addEdge('root', `worker-${i}`);
      }
      
      // Fan-in to single aggregator
      fanOutInDAG.addNode('aggregator', createMockProcessor(200));
      for (let i = 0; i < 100; i++) {
        fanOutInDAG.addEdge(`worker-${i}`, 'aggregator');
      }
      
      const dagEngine = createMockDAGEngine();
      const benchmark = new PerformanceBenchmark('fan-out-in-dag');
      
      benchmark.start();
      const result = await dagEngine.execute(fanOutInDAG);
      const metrics = benchmark.end();
      
      expect(result.executedNodes).toBe(102); // 1 root + 100 workers + 1 aggregator
      expect(result.success).toBe(true);
      
      // Should achieve excellent parallelization in middle layer
      expect(result.parallelizationRatio).toBeGreaterThan(10);
      
      console.log(`🌟 Fan-out/in DAG: ${metrics.duration.toFixed(2)}ms, ${result.parallelizationRatio.toFixed(2)} parallel ratio`);
    });
  });

  describe('Memory-Intensive DAG Operations', () => {
    it('should handle large data flows efficiently', async () => {
      const dataIntensiveDAG = generateDataIntensiveDAG(1000);
      const dagEngine = createMockDAGEngine({ enableMemoryTracking: true });
      
      const startMemory = process.memoryUsage();
      const benchmark = new PerformanceBenchmark('data-intensive-dag');
      
      benchmark.start();
      const result = await dagEngine.execute(dataIntensiveDAG);
      const metrics = benchmark.end();
      const endMemory = process.memoryUsage();
      
      const memoryIncrease = endMemory.heapUsed - startMemory.heapUsed;
      
      expect(result.executedNodes).toBe(1000);
      expect(result.success).toBe(true);
      expect(memoryIncrease).toBeLessThan(500 * 1024 * 1024); // Less than 500MB increase
      
      console.log(`💾 Data-intensive DAG: ${memoryIncrease / 1024 / 1024}MB memory increase`);
      
      // Store memory metrics
      dagMetrics.push({
        testName: 'data-intensive-dag',
        nodeCount: 1000,
        totalDuration: metrics.duration,
        memoryIncrease: memoryIncrease / 1024 / 1024,
        dataProcessed: result.totalDataProcessed,
        timestamp: new Date().toISOString()
      });
    });
  });

  describe('DAG Error Recovery Performance', () => {
    it('should handle partial failures efficiently', async () => {
      const flakyDAG = generateFlakyDAG(5000, 0.1); // 10% failure rate
      const dagEngine = createMockDAGEngine({ enableRetry: true, maxRetries: 3 });
      
      const benchmark = new PerformanceBenchmark('flaky-dag-execution');
      
      benchmark.start();
      const result = await dagEngine.execute(flakyDAG);
      const metrics = benchmark.end();
      
      expect(result.executedNodes).toBeGreaterThan(4500); // At least 90% success
      expect(result.retriedNodes).toBeGreaterThan(0);
      expect(result.finalFailures).toBeLessThan(250); // Less than 5% final failures
      
      // Should still be reasonably fast despite retries
      const avgNodeTime = metrics.duration / result.executedNodes;
      expect(avgNodeTime).toBeLessThan(15); // Less than 15ms per node with retries
      
      console.log(`🔄 Flaky DAG: ${result.executedNodes}/${5000} succeeded, ${result.retriedNodes} retries`);
    });
  });

  // Helper functions
  function createMockDAGEngine(options = {}) {
    return {
      async execute(dag, execOptions = {}) {
        const { enableMemoryTracking = false, enableRetry = false, maxRetries = 0 } = options;
        const { dagId } = execOptions;
        
        const startTime = performance.now();
        const executedNodes = [];
        const retriedNodes = [];
        const failedNodes = [];
        let totalDataProcessed = 0;
        
        // Simulate topological execution
        const nodeArray = Array.from(dag.nodes.values());
        const executionLayers = this.calculateExecutionLayers(nodeArray, dag.edges);
        
        for (const layer of executionLayers) {
          // Execute layer in parallel
          const layerPromises = layer.map(async (node) => {
            let attempts = 0;
            let success = false;
            
            while (attempts <= maxRetries && !success) {
              try {
                const nodeResult = await node.processor();
                executedNodes.push(node.id);
                totalDataProcessed += nodeResult.dataSize || 100;
                success = true;
                
                if (attempts > 0) {
                  retriedNodes.push(node.id);
                }
              } catch (error) {
                attempts++;
                if (attempts > maxRetries) {
                  failedNodes.push(node.id);
                  success = true; // Stop retrying
                }
              }
            }
          });
          
          await Promise.all(layerPromises);
        }
        
        const endTime = performance.now();
        const executionTime = endTime - startTime;
        
        // Calculate parallelization metrics
        const totalSequentialTime = nodeArray.reduce((sum, node) => 
          sum + (node.processor.estimatedTime || 50), 0
        );
        const parallelizationRatio = totalSequentialTime / executionTime;
        const criticalPathLength = this.calculateCriticalPath(executionLayers);
        
        return {
          executedNodes: executedNodes.length,
          retriedNodes: retriedNodes.length,
          finalFailures: failedNodes.length,
          success: failedNodes.length === 0,
          executionTime,
          parallelizationRatio,
          criticalPathLength,
          totalDataProcessed,
          dagId
        };
      },
      
      calculateExecutionLayers(nodes, edges) {
        // Simple layer calculation - nodes with no dependencies first
        const layers = [];
        const processed = new Set();
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        
        while (processed.size < nodes.length) {
          const currentLayer = [];
          
          for (const node of nodes) {
            if (processed.has(node.id)) continue;
            
            // Check if all dependencies are processed
            const canExecute = node.dependencies.every(dep => processed.has(dep));
            
            if (canExecute) {
              currentLayer.push(node);
            }
          }
          
          if (currentLayer.length === 0) break; // Prevent infinite loop
          
          layers.push(currentLayer);
          currentLayer.forEach(node => processed.add(node.id));
        }
        
        return layers;
      },
      
      calculateCriticalPath(layers) {
        return layers.reduce((sum, layer) => {
          const maxLayerTime = Math.max(...layer.map(node => 
            node.processor.estimatedTime || 50
          ));
          return sum + maxLayerTime;
        }, 0);
      }
    };
  }

  function generateComplexDAG(nodeCount, prefix = 'node') {
    const dag = {
      nodes: new Map(),
      edges: new Map()
    };
    
    // Add nodes
    for (let i = 0; i < nodeCount; i++) {
      const nodeId = `${prefix}-${i}`;
      dag.nodes.set(nodeId, {
        id: nodeId,
        processor: createMockProcessor(Math.random() * 100 + 10),
        dependencies: [],
        dependents: []
      });
    }
    
    // Add edges to create realistic dependency structure
    const nodeIds = Array.from(dag.nodes.keys());
    for (let i = 0; i < nodeCount; i++) {
      const nodeId = nodeIds[i];
      const dependencyCount = Math.min(Math.floor(Math.random() * 3), i); // 0-2 dependencies
      
      for (let j = 0; j < dependencyCount; j++) {
        const depIndex = Math.floor(Math.random() * i);
        const depId = nodeIds[depIndex];
        
        if (!dag.edges.has(depId)) dag.edges.set(depId, []);
        if (!dag.edges.get(depId).includes(nodeId)) {
          dag.edges.get(depId).push(nodeId);
          dag.nodes.get(depId).dependents.push(nodeId);
          dag.nodes.get(nodeId).dependencies.push(depId);
        }
      }
    }
    
    return dag;
  }

  function generateDataIntensiveDAG(nodeCount) {
    const dag = generateComplexDAG(nodeCount, 'data-node');
    
    // Make processors data-intensive
    for (const node of dag.nodes.values()) {
      node.processor = createMockProcessor(100, { dataIntensive: true });
    }
    
    return dag;
  }

  function generateFlakyDAG(nodeCount, failureRate) {
    const dag = generateComplexDAG(nodeCount, 'flaky-node');
    
    // Make processors flaky
    for (const node of dag.nodes.values()) {
      node.processor = createMockProcessor(50, { failureRate });
    }
    
    return dag;
  }

  function createMockProcessor(estimatedTime, options = {}) {
    const { dataIntensive = false, failureRate = 0 } = options;
    
    const processor = async () => {
      // Simulate processing time
      const actualTime = estimatedTime + (Math.random() - 0.5) * estimatedTime * 0.2;
      await new Promise(resolve => setTimeout(resolve, actualTime));
      
      // Simulate failures
      if (Math.random() < failureRate) {
        throw new Error('Simulated node failure');
      }
      
      return {
        dataSize: dataIntensive ? Math.random() * 1000 + 500 : Math.random() * 100 + 50,
        processingTime: actualTime
      };
    };
    
    processor.estimatedTime = estimatedTime;
    return processor;
  }

  async function generateDAGReports() {
    const outputDir = path.join(process.cwd(), 'performance-reports');
    
    // Generate CSV report
    const csvHeader = ['Test Name', 'Node Count', 'Duration (ms)', 'Nodes/sec', 'Parallelization Ratio', 'Memory (MB)'];
    const csvData = dagMetrics.map(m => [
      m.testName,
      m.nodeCount || m.nodesPerDAG || 'N/A',
      m.totalDuration?.toFixed(2) || 'N/A',
      m.nodesPerSecond?.toFixed(2) || m.overallThroughput?.toFixed(2) || 'N/A',
      m.parallelizationRatio?.toFixed(2) || 'N/A',
      m.memoryUsage?.toFixed(2) || 'N/A'
    ]);
    
    const csvContent = [csvHeader, ...csvData].map(row => row.join(',')).join('\n');
    fs.writeFileSync(path.join(outputDir, 'dag-performance.csv'), csvContent);
    
    // Generate JSON report
    const jsonReport = {
      testSuite: 'DAG Pipeline Performance Tests',
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: dagMetrics.length,
        avgThroughput: dagMetrics.filter(m => m.nodesPerSecond).reduce((sum, m) => sum + m.nodesPerSecond, 0) / dagMetrics.filter(m => m.nodesPerSecond).length,
        maxThroughput: Math.max(...dagMetrics.filter(m => m.nodesPerSecond).map(m => m.nodesPerSecond)),
        avgParallelization: dagMetrics.filter(m => m.parallelizationRatio).reduce((sum, m) => sum + m.parallelizationRatio, 0) / dagMetrics.filter(m => m.parallelizationRatio).length,
        maxParallelization: Math.max(...dagMetrics.filter(m => m.parallelizationRatio).map(m => m.parallelizationRatio))
      },
      metrics: dagMetrics
    };
    
    fs.writeFileSync(
      path.join(outputDir, 'dag-performance.json'),
      JSON.stringify(jsonReport, null, 2)
    );
    
    // Generate HTML report
    const htmlReport = generateDAGHTMLReport(jsonReport);
    fs.writeFileSync(
      path.join(outputDir, 'dag-performance.html'),
      htmlReport
    );
    
    console.log('🔀 DAG performance reports generated');
  }

  function generateDAGHTMLReport(data) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>DAG Pipeline Performance Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .metric { display: inline-block; margin: 10px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background: #f9f9f9; }
        .chart-container { width: 100%; height: 400px; margin: 20px 0; }
        h1 { color: #333; border-bottom: 2px solid #28a745; padding-bottom: 10px; }
        .summary { display: flex; flex-wrap: wrap; justify-content: space-around; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔀 DAG Pipeline Performance Report</h1>
        <p><strong>Generated:</strong> ${data.timestamp}</p>
        
        <div class="summary">
            <div class="metric">
                <h3>Avg Throughput</h3>
                <p>${data.summary.avgThroughput.toFixed(2)} nodes/sec</p>
            </div>
            <div class="metric">
                <h3>Max Throughput</h3>
                <p>${data.summary.maxThroughput.toFixed(2)} nodes/sec</p>
            </div>
            <div class="metric">
                <h3>Avg Parallelization</h3>
                <p>${data.summary.avgParallelization.toFixed(2)}x</p>
            </div>
            <div class="metric">
                <h3>Max Parallelization</h3>
                <p>${data.summary.maxParallelization.toFixed(2)}x</p>
            </div>
        </div>
        
        <div class="chart-container">
            <canvas id="throughputChart"></canvas>
        </div>
        
        <div class="chart-container">
            <canvas id="parallelizationChart"></canvas>
        </div>
        
        <div class="chart-container">
            <canvas id="scalabilityChart"></canvas>
        </div>
    </div>
    
    <script>
        const data = ${JSON.stringify(data)};
        
        // Throughput Chart
        const throughputData = data.metrics.filter(m => m.nodesPerSecond);
        new Chart(document.getElementById('throughputChart'), {
            type: 'bar',
            data: {
                labels: throughputData.map(m => m.testName.replace('dag-execution-', '')),
                datasets: [{
                    label: 'Throughput (nodes/sec)',
                    data: throughputData.map(m => m.nodesPerSecond),
                    backgroundColor: 'rgba(40, 167, 69, 0.2)',
                    borderColor: 'rgba(40, 167, 69, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { title: { display: true, text: 'DAG Execution Throughput' } },
                scales: { y: { beginAtZero: true } }
            }
        });
        
        // Parallelization Chart
        new Chart(document.getElementById('parallelizationChart'), {
            type: 'line',
            data: {
                labels: throughputData.map(m => m.nodeCount),
                datasets: [{
                    label: 'Parallelization Ratio',
                    data: throughputData.map(m => m.parallelizationRatio),
                    borderColor: 'rgb(255, 193, 7)',
                    backgroundColor: 'rgba(255, 193, 7, 0.2)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { title: { display: true, text: 'Parallelization Efficiency' } },
                scales: { 
                    y: { beginAtZero: true },
                    x: { title: { display: true, text: 'Node Count' } }
                }
            }
        });
        
        // Scalability Chart
        new Chart(document.getElementById('scalabilityChart'), {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Execution Time vs Node Count',
                    data: throughputData.map(m => ({ x: m.nodeCount, y: m.totalDuration })),
                    backgroundColor: 'rgba(220, 53, 69, 0.6)',
                    borderColor: 'rgba(220, 53, 69, 1)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { title: { display: true, text: 'Scalability Analysis' } },
                scales: { 
                    x: { title: { display: true, text: 'Node Count' } },
                    y: { title: { display: true, text: 'Execution Time (ms)' } }
                }
            }
        });
    </script>
</body>
</html>
    `;
  }
});
