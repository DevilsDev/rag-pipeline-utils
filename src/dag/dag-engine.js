/**
 * Version: 2.0.0
 * Path: /src/dag/dag-engine.js
 * Description: DAG executor for chained RAG pipelines with cycle detection and error handling
 * Author: Ali Kahwaji
 */

export class DAGNode {
    constructor(id, run) {
      this.id = id;
      this.run = run; // async (input) => output
      this.inputs = [];
      this.outputs = [];
    }
  }
  
  export class DAG {
    constructor() {
      this.nodes = new Map();
    }
  
    addNode(id, fn) {
      const node = new DAGNode(id, fn);
      this.nodes.set(id, node);
      return node;
    }
  
    connect(fromId, toId) {
      const from = this.nodes.get(fromId);
      const to = this.nodes.get(toId);
      if (!from || !to) throw new Error(`Invalid edge: ${fromId} → ${toId}`);
      from.outputs.push(to);
      to.inputs.push(from);
    }
  
    /**
     * Executes DAG from source nodes to sinks using topological order
     * @param {any} seed - Initial input to the graph
     * @returns {Promise<any>} - Final output from sink(s)
     */
    async execute(seed) {
      try {
        // Validate DAG before execution
        this.validate();
        
        const order = this.topoSort();
        const results = new Map();
        const errors = new Map();

        for (const node of order) {
          try {
            const inputValues = node.inputs.map(n => {
              const result = results.get(n.id);
              if (result === undefined && errors.has(n.id)) {
                throw new Error(`Input node ${n.id} failed: ${errors.get(n.id)}`);
              }
              return result;
            });
            
            const input = inputValues.length === 0 ? seed :
                         inputValues.length === 1 ? inputValues[0] : inputValues;
            
            const output = await node.run(input);
            results.set(node.id, output);
          } catch (error) {
            const errorMsg = `Node ${node.id} execution failed: ${error.message}`;
            errors.set(node.id, errorMsg);
            
            // Check if this is a critical path failure
            const dependentNodes = Array.from(this.nodes.values())
              .filter(n => n.inputs.some(input => input.id === node.id));
            
            if (dependentNodes.length > 0) {
              throw new Error(`${errorMsg}. This affects downstream nodes: ${dependentNodes.map(n => n.id).join(', ')}`);
            }
            
            // If no dependents, log but continue
            console.warn(`Non-critical node failure: ${errorMsg}`);
          }
        }

        // Return result from sink nodes (nodes with no outputs)
        const sinkNodes = order.filter(node => node.outputs.length === 0);
        if (sinkNodes.length === 0) {
          throw new Error('DAG has no sink nodes - no final output available');
        }
        
        if (sinkNodes.length === 1) {
          return results.get(sinkNodes[0].id);
        }
        
        // Multiple sinks - return all results
        return Object.fromEntries(
          sinkNodes.map(node => [node.id, results.get(node.id)])
        );
      } catch (error) {
        throw new Error(`DAG execution failed: ${error.message}`);
      }
    }
  
    /**
     * Performs topological sort with cycle detection
     * @returns {DAGNode[]} Topologically sorted nodes
     * @throws {Error} If cycles are detected
     */
    topoSort() {
      const order = [];
      const visited = new Set();
      const visiting = new Set(); // Track nodes currently being visited
      
      const visit = (node) => {
        if (visiting.has(node.id)) {
          throw new Error(`Cycle detected involving node: ${node.id}`);
        }
        
        if (visited.has(node.id)) return;
        
        visiting.add(node.id);
        
        try {
          node.inputs.forEach(visit);
        } catch (error) {
          // Propagate cycle detection errors with path information
          if (error.message.includes('Cycle detected')) {
            throw new Error(`${error.message} -> ${node.id}`);
          }
          throw error;
        }
        
        visiting.delete(node.id);
        visited.add(node.id);
        order.push(node);
      };
      
      try {
        for (const node of this.nodes.values()) {
          visit(node);
        }
      } catch (error) {
        throw new Error(`DAG topological sort failed: ${error.message}`);
      }
      
      return order;
    }

    /**
     * Validates the DAG structure
     * @throws {Error} If DAG is invalid
     */
    validate() {
      if (this.nodes.size === 0) {
        throw new Error('DAG is empty - no nodes to execute');
      }

      // Check for cycles by attempting topological sort
      try {
        this.topoSort();
      } catch (error) {
        throw new Error(`DAG validation failed: ${error.message}`);
      }

      // Check for orphaned nodes (nodes with no path to execution)
      const sourceNodes = Array.from(this.nodes.values()).filter(node => node.inputs.length === 0);
      if (sourceNodes.length === 0) {
        throw new Error('DAG has no source nodes - execution cannot begin');
      }

      return true;
    }
  }