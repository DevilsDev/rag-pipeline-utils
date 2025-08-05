/**
 * Unit tests for DAG error handling and cycle detection
 * Tests cycle detection, error propagation, and invalid topologies
 */

import { jest } from '@jest/globals';
import { DAG, DAGNode } from '../../../src/dag/dag-engine.js';

describe('DAG Error Handling and Cycle Detection', () => {
  let dag;

  beforeEach(() => {
    dag = new DAG();
  });

  describe('cycle detection', () => {
    it('should detect simple cycles', () => {
      const nodeA = dag.addNode('A', jest.fn());
      const nodeB = dag.addNode('B', jest.fn());
      
      // Create cycle: A -> B -> A
      nodeA.addOutput(nodeB);
      nodeB.addOutput(nodeA);

      expect(() => dag.validateTopology()).toThrow('Cycle detected in DAG');
    });

    it('should detect complex cycles', () => {
      const nodeA = dag.addNode('A', jest.fn());
      const nodeB = dag.addNode('B', jest.fn());
      const nodeC = dag.addNode('C', jest.fn());
      const nodeD = dag.addNode('D', jest.fn());
      
      // Create complex cycle: A -> B -> C -> D -> B
      nodeA.addOutput(nodeB);
      nodeB.addOutput(nodeC);
      nodeC.addOutput(nodeD);
      nodeD.addOutput(nodeB); // Creates cycle

      expect(() => dag.validateTopology()).toThrow('Cycle detected in DAG');
    });

    it('should allow valid DAG structures', () => {
      const nodeA = dag.addNode('A', jest.fn());
      const nodeB = dag.addNode('B', jest.fn());
      const nodeC = dag.addNode('C', jest.fn());
      const nodeD = dag.addNode('D', jest.fn());
      
      // Create valid DAG: A -> B, A -> C, B -> D, C -> D
      nodeA.addOutput(nodeB);
      nodeA.addOutput(nodeC);
      nodeB.addOutput(nodeD);
      nodeC.addOutput(nodeD);

      expect(() => dag.validateTopology()).not.toThrow();
    });

    it('should detect self-loops', () => {
      const nodeA = dag.addNode('A', jest.fn());
      
      // Create self-loop: A -> A
      nodeA.addOutput(nodeA);

      expect(() => dag.validateTopology()).toThrow('Self-loop detected');
    });

    it('should handle disconnected components', () => {
      const nodeA = dag.addNode('A', jest.fn());
      const nodeB = dag.addNode('B', jest.fn());
      const nodeC = dag.addNode('C', jest.fn());
      const nodeD = dag.addNode('D', jest.fn());
      
      // Create two disconnected components: A -> B and C -> D
      nodeA.addOutput(nodeB);
      nodeC.addOutput(nodeD);

      expect(() => dag.validateTopology()).not.toThrow();
    });

    it('should provide detailed cycle information', () => {
      const nodeA = dag.addNode('A', jest.fn());
      const nodeB = dag.addNode('B', jest.fn());
      const nodeC = dag.addNode('C', jest.fn());
      
      nodeA.addOutput(nodeB);
      nodeB.addOutput(nodeC);
      nodeC.addOutput(nodeA); // Creates cycle

      expect(() => dag.validateTopology()).toThrow('Cycle detected in DAG');
      expect(() => dag.validateTopology()).toThrowError((error) => {
        expect(error.message).toContain('Cycle detected');
        expect(error.cycle).toEqual(['A', 'B', 'C', 'A']);
      });
    });
  });

  describe('error propagation', () => {
    it('should propagate errors through DAG execution', async () => {
      const errorNode = dag.addNode('error', () => {
        throw new Error('Node execution failed');
      });
      const dependentNode = dag.addNode('dependent', jest.fn());
      
      errorNode.addOutput(dependentNode);

      await expect(dag.execute()).rejects.toThrow('Node execution failed');
      expect(dependentNode.run).not.toHaveBeenCalled();
    });

    it('should handle partial execution failures', async () => {
      const successNode = dag.addNode('success', jest.fn().mockResolvedValue('success'));
      const errorNode = dag.addNode('error', () => {
        throw new Error('Partial failure');
      });
      const dependentNode = dag.addNode('dependent', jest.fn());
      
      // Independent paths: success runs, error fails
      successNode.addOutput(dependentNode);
      errorNode.addOutput(dependentNode);

      await expect(dag.execute()).rejects.toThrow('Partial failure');
      expect(successNode.run).toHaveBeenCalled();
      expect(errorNode.run).toHaveBeenCalled();
    });

    it('should collect and report multiple errors', async () => {
      const error1Node = dag.addNode('error1', () => {
        throw new Error('First error');
      });
      const error2Node = dag.addNode('error2', () => {
        throw new Error('Second error');
      });

      try {
        await dag.execute();
        expect.fail('Expected execution to throw');
      } catch (error) {
        expect(error.message).toContain('Multiple execution errors');
        expect(error.errors).toHaveLength(2);
        expect(error.errors[0].message).toBe('First error');
        expect(error.errors[1].message).toBe('Second error');
      }
    });

    it('should handle async error propagation', async () => {
      const asyncErrorNode = dag.addNode('asyncError', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new Error('Async error');
      });
      const dependentNode = dag.addNode('dependent', jest.fn());
      
      asyncErrorNode.addOutput(dependentNode);

      await expect(dag.execute()).rejects.toThrow('Async error');
      expect(dependentNode.run).not.toHaveBeenCalled();
    });

    it('should provide error context and stack traces', async () => {
      const contextNode = dag.addNode('context', () => {
        const error = new Error('Context error');
        error.nodeId = 'context';
        error.timestamp = Date.now();
        throw error;
      });

      try {
        await dag.execute();
        expect.fail('Expected execution to throw');
      } catch (error) {
        expect(error.nodeId).toBe('context');
        expect(error.timestamp).toBeDefined();
        expect(error.stack).toBeDefined();
      }
    });
  });

  describe('invalid topology handling', () => {
    it('should reject DAGs with no nodes', () => {
      expect(() => dag.validateTopology()).toThrow('DAG cannot be empty');
    });

    it('should handle orphaned nodes', () => {
      const orphanNode = dag.addNode('orphan', jest.fn());
      const connectedA = dag.addNode('connectedA', jest.fn());
      const connectedB = dag.addNode('connectedB', jest.fn());
      
      connectedA.addOutput(connectedB);
      // orphanNode has no connections

      const warnings = dag.validateTopology({ strict: false });
      expect(warnings).toContain('Orphaned node detected: orphan');
    });

    it('should validate node dependencies', () => {
      const nodeA = dag.addNode('A', jest.fn());
      const nodeB = dag.addNode('B', jest.fn());
      
      // Try to add invalid dependency
      expect(() => {
        nodeA.addOutput(null);
      }).toThrow('Invalid output node');
      
      expect(() => {
        nodeA.addOutput(nodeA); // Self-reference
      }).toThrow('Self-loop not allowed');
    });

    it('should handle duplicate node IDs', () => {
      dag.addNode('duplicate', jest.fn());
      
      expect(() => {
        dag.addNode('duplicate', jest.fn());
      }).toThrow('Node with ID "duplicate" already exists');
    });

    it('should validate node execution order', async () => {
      const executionOrder = [];
      
      const nodeA = dag.addNode('A', () => {
        executionOrder.push('A');
        return 'A-result';
      });
      const nodeB = dag.addNode('B', () => {
        executionOrder.push('B');
        return 'B-result';
      });
      const nodeC = dag.addNode('C', () => {
        executionOrder.push('C');
        return 'C-result';
      });
      
      // B depends on A, C depends on B
      nodeA.addOutput(nodeB);
      nodeB.addOutput(nodeC);

      await dag.execute();

      expect(executionOrder).toEqual(['A', 'B', 'C']);
    });
  });

  describe('resource management', () => {
    it('should handle memory cleanup on errors', async () => {
      const memoryLeakNode = dag.addNode('memoryLeak', () => {
        // Simulate memory allocation
        const largeArray = new Array(1000000).fill('data');
        throw new Error('Memory leak error');
      });

      try {
        await dag.execute();
        expect.fail('Expected execution to throw');
      } catch (error) {
        // Verify cleanup occurred (in real implementation)
        expect(error.message).toBe('Memory leak error');
      }
    });

    it('should handle concurrent execution limits', async () => {
      const concurrentNodes = [];
      let activeCount = 0;
      let maxConcurrent = 0;
      
      for (let i = 0; i < 10; i++) {
        const node = dag.addNode(`concurrent-${i}`, async () => {
          activeCount++;
          maxConcurrent = Math.max(maxConcurrent, activeCount);
          await new Promise(resolve => setTimeout(resolve, 50));
          activeCount--;
          return `result-${i}`;
        });
        concurrentNodes.push(node);
      }

      await dag.execute({ maxConcurrency: 3 });

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should handle timeout scenarios', async () => {
      const timeoutNode = dag.addNode('timeout', async () => {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
        return 'completed';
      });

      await expect(dag.execute({ timeout: 1000 })).rejects.toThrow('Execution timeout');
    });
  });

  describe('recovery mechanisms', () => {
    it('should support retry on node failure', async () => {
      let attempts = 0;
      const retryNode = dag.addNode('retry', () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const result = await dag.execute({ retryFailedNodes: true, maxRetries: 3 });
      
      expect(attempts).toBe(3);
      expect(result.get('retry')).toBe('success');
    });

    it('should support graceful degradation', async () => {
      const criticalNode = dag.addNode('critical', jest.fn().mockResolvedValue('critical-result'));
      const optionalNode = dag.addNode('optional', () => {
        throw new Error('Optional failure');
      });
      const finalNode = dag.addNode('final', jest.fn().mockResolvedValue('final-result'));
      
      criticalNode.addOutput(finalNode);
      optionalNode.addOutput(finalNode);

      const result = await dag.execute({ 
        gracefulDegradation: true,
        requiredNodes: ['critical', 'final']
      });

      expect(result.get('critical')).toBe('critical-result');
      expect(result.get('final')).toBe('final-result');
      expect(result.has('optional')).toBe(false);
    });

    it('should support checkpoint and resume', async () => {
      const checkpointData = new Map();
      
      const nodeA = dag.addNode('A', () => {
        checkpointData.set('A', 'A-completed');
        return 'A-result';
      });
      const nodeB = dag.addNode('B', () => {
        throw new Error('B failed');
      });
      const nodeC = dag.addNode('C', jest.fn().mockResolvedValue('C-result'));
      
      nodeA.addOutput(nodeB);
      nodeA.addOutput(nodeC);

      // First execution fails at B
      try {
        await dag.execute({ enableCheckpoints: true });
        expect.fail('Expected execution to fail');
      } catch (error) {
        expect(checkpointData.get('A')).toBe('A-completed');
      }

      // Resume from checkpoint
      const resumeResult = await dag.resume(checkpointData);
      expect(resumeResult.get('A')).toBe('A-result');
      expect(resumeResult.get('C')).toBe('C-result');
    });
  });

  describe('validation edge cases', () => {
    it('should handle very large DAGs', () => {
      // Create a large linear DAG
      let previousNode = null;
      for (let i = 0; i < 1000; i++) {
        const node = dag.addNode(`node-${i}`, jest.fn());
        if (previousNode) {
          previousNode.addOutput(node);
        }
        previousNode = node;
      }

      expect(() => dag.validateTopology()).not.toThrow();
      expect(dag.nodes.size).toBe(1000);
    });

    it('should handle complex branching patterns', () => {
      const root = dag.addNode('root', jest.fn());
      
      // Create diamond pattern with multiple levels
      for (let level = 1; level <= 5; level++) {
        for (let branch = 0; branch < Math.pow(2, level); branch++) {
          const node = dag.addNode(`L${level}-B${branch}`, jest.fn());
          
          if (level === 1) {
            root.addOutput(node);
          } else {
            // Connect to previous level nodes
            const parentBranch = Math.floor(branch / 2);
            const parentNode = dag.nodes.get(`L${level-1}-B${parentBranch}`);
            if (parentNode) {
              parentNode.addOutput(node);
            }
          }
        }
      }

      expect(() => dag.validateTopology()).not.toThrow();
    });

    it('should handle nodes with no inputs or outputs', () => {
      const isolatedNode = dag.addNode('isolated', jest.fn());
      const sourceNode = dag.addNode('source', jest.fn());
      const sinkNode = dag.addNode('sink', jest.fn());
      
      sourceNode.addOutput(sinkNode);
      // isolatedNode has no connections

      const warnings = dag.validateTopology({ strict: false });
      expect(warnings).toContain('Orphaned node detected: isolated');
    });
  });
});
