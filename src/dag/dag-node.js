/**
 * Version: 2.0.2
 * Path: /src/dag/dag-node.js
 * Description: DAG node class for representing individual nodes in the DAG
 * Author: Ali Kahwaji
 */

class DAGNode {
  constructor(id, run, options = {}) {
    this.id = id;
    this.run = run; // async (input) => output
    this.inputs = [];
    this.outputs = [];

    // Per-node timeout configuration
    this.timeout =
      options.timeout || parseInt(process.env.RAG_NODE_TIMEOUT) || 30000; // Default 30 seconds per node
    this.retries = options.retries || 0;
    this.priority = options.priority || 0; // Higher priority executes first
  }

  /**
   * Add an output connection to another node
   * @param {DAGNode} node - Target node to connect to
   */
  addOutput(node) {
    if (!node || typeof node !== 'object' || !node.inputs) {
      throw new Error('Invalid output node');
    }
    // Allow self-loops during construction - they will be detected during validation
    if (!this.outputs.includes(node)) {
      this.outputs.push(node);
    }
    if (!node.inputs.includes(this)) {
      node.inputs.push(this);
    }
    return this;
  }

  /**
   * Add an input connection from another node
   * @param {DAGNode} node - Source node to connect from
   */
  addInput(node) {
    if (!this.inputs.includes(node)) {
      this.inputs.push(node);
    }
    if (!node.outputs.includes(this)) {
      node.outputs.push(this);
    }
    return this;
  }

  /**
   * Remove an output connection
   * @param {DAGNode} node - Target node to disconnect from
   */
  removeOutput(node) {
    this.outputs = this.outputs.filter((n) => n !== node);
    node.inputs = node.inputs.filter((n) => n !== this);
    return this;
  }

  /**
   * Remove an input connection
   * @param {DAGNode} node - Source node to disconnect from
   */
  removeInput(node) {
    this.inputs = this.inputs.filter((n) => n !== node);
    node.outputs = node.outputs.filter((n) => n !== this);
    return this;
  }
}

module.exports = DAGNode;
module.exports.default = module.exports;
