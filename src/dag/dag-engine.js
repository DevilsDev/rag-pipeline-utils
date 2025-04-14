/**
 * Version: 0.1.0
 * Path: /src/dag/dag-engine.js
 * Description: DAG executor for chained RAG pipelines
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
      const visited = new Set();
      const order = this.topoSort();
      const results = new Map();
  
      for (const node of order) {
        const inputValues = node.inputs.map(n => results.get(n.id));
        const input = inputValues.length === 1 ? inputValues[0] : inputValues;
        const output = await node.run(input ?? seed);
        results.set(node.id, output);
      }
  
      const last = order.at(-1);
      return results.get(last.id);
    }
  
    topoSort() {
      const order = [];
      const visited = new Set();
      const visit = (node) => {
        if (visited.has(node.id)) return;
        visited.add(node.id);
        node.inputs.forEach(visit);
        order.push(node);
      };
      for (const node of this.nodes.values()) visit(node);
      return order;
    }
  }
  