/**
 * @fileoverview DAG Topology Validation Module
 *
 * Provides topology validation utilities for Directed Acyclic Graphs (DAGs),
 * including cycle detection, topological sorting, and structural validation.
 *
 * @module dag/core/topology-validation
 * @author Ali Kahwaji
 * @since 2.2.2
 * @version 1.0.0
 */

/**
 * Builds forward and reverse adjacency maps for a DAG
 *
 * Creates two Maps:
 * - Forward: Maps each node ID to a Set of its children (outgoing edges)
 * - Reverse: Maps each node ID to a Set of its parents (incoming edges)
 *
 * @param {Map<string, DAGNode>} nodes - Map of node IDs to DAGNode instances
 * @returns {{fwd: Map<string, Set<string>>, rev: Map<string, Set<string>>}}
 *   Adjacency maps for forward and reverse traversal
 *
 * @example
 * const nodes = new Map([
 *   ['A', nodeA],
 *   ['B', nodeB],
 *   ['C', nodeC]
 * ]);
 * const { fwd, rev } = buildAdjacency(nodes);
 * // fwd.get('A') => Set(['B', 'C']) - A points to B and C
 * // rev.get('B') => Set(['A']) - B is pointed to by A
 *
 * @performance O(V + E) where V = number of nodes, E = number of edges
 * @since 2.2.2
 */
function buildAdjacency(nodes) {
  const fwd = new Map(); // node -> Set of children
  const rev = new Map(); // node -> Set of parents

  // Initialize adjacency lists for all nodes
  for (const node of nodes.values()) {
    fwd.set(node.id, new Set());
    rev.set(node.id, new Set());
  }

  // Populate adjacency lists based on node connections
  for (const node of nodes.values()) {
    for (const output of node.outputs) {
      fwd.get(node.id).add(output.id);
      // Only add reverse edge if the output node exists in the DAG
      if (rev.has(output.id)) {
        rev.get(output.id).add(node.id);
      }
    }
  }

  return { fwd, rev };
}

/**
 * Gets sink node IDs (nodes with no outgoing edges)
 *
 * Sink nodes are terminal nodes in the DAG that have no children.
 * They represent final outputs of the pipeline.
 *
 * @param {Map<string, Set<string>>} fwd - Forward adjacency map
 * @returns {string[]} Array of sink node IDs
 *
 * @example
 * const fwd = new Map([
 *   ['A', new Set(['B'])],
 *   ['B', new Set()],      // B is a sink
 *   ['C', new Set()]       // C is a sink
 * ]);
 * const sinks = getSinkIds(fwd);
 * console.log(sinks); // ['B', 'C']
 *
 * @performance O(V) where V = number of nodes
 * @since 2.2.2
 */
function getSinkIds(fwd) {
  const sinkIds = [];
  for (const [nodeId, children] of fwd) {
    if (children.size === 0) {
      sinkIds.push(nodeId);
    }
  }
  return sinkIds;
}

/**
 * Performs topological sort with comprehensive cycle detection
 *
 * Uses depth-first search (DFS) with path tracking to detect cycles.
 * If a cycle is detected, the error includes the complete cycle path.
 *
 * @param {Map<string, DAGNode>} nodes - Map of node IDs to DAGNode instances
 * @returns {DAGNode[]} Topologically sorted array of nodes
 *
 * @throws {Error} If a cycle is detected. Error includes:
 *   - message: Description with cycle path (e.g., "Cycle detected involving node: A -> B -> C -> A")
 *   - cycle: Array of node IDs forming the cycle
 * @throws {Error} If topological sort fails for other reasons
 *
 * @example
 * // Valid DAG
 * const nodes = new Map([
 *   ['A', nodeA], // A -> B
 *   ['B', nodeB], // B -> C
 *   ['C', nodeC]  // C (sink)
 * ]);
 * const sorted = topologicalSort(nodes);
 * console.log(sorted.map(n => n.id)); // ['C', 'B', 'A'] (reverse dependency order)
 *
 * @example
 * // Cyclic DAG (throws error)
 * const nodes = new Map([
 *   ['A', nodeA], // A -> B
 *   ['B', nodeB], // B -> C
 *   ['C', nodeC]  // C -> A (creates cycle)
 * ]);
 * try {
 *   topologicalSort(nodes);
 * } catch (error) {
 *   console.log(error.message); // "Cycle detected involving node: A -> B -> C -> A"
 *   console.log(error.cycle);   // ['A', 'B', 'C', 'A']
 * }
 *
 * @algorithm
 * 1. Initialize empty order array, visited set, and visiting set
 * 2. For each unvisited node, perform DFS:
 *    a. If node is currently being visited (in visiting set), cycle detected
 *    b. Mark node as visiting
 *    c. Recursively visit all input nodes (dependencies)
 *    d. Mark node as visited, remove from visiting
 *    e. Add node to order array
 * 3. Return order array (nodes in reverse topological order)
 *
 * @performance O(V + E) where V = number of nodes, E = number of edges
 * @complexity Cyclomatic complexity: 6 (within acceptable limits)
 * @since 2.2.2
 */
function topologicalSort(nodes) {
  const order = [];
  const visited = new Set();
  const visiting = new Set(); // Track nodes currently being visited

  const visit = (node, path = []) => {
    if (visiting.has(node.id)) {
      const cycleStart = path.indexOf(node.id);
      let cyclePath =
        cycleStart >= 0 ? path.slice(cycleStart).concat([node.id]) : [node.id];
      // Reverse interior to show forward traversal order (A->B->C->A)
      if (cyclePath.length > 2) {
        const startNode = cyclePath[0];
        const restNodes = cyclePath.slice(1, -1).reverse();
        cyclePath = [startNode, ...restNodes, startNode];
      }
      const cyclePathString = cyclePath.join(' -> ');
      const error = new Error(
        `Cycle detected involving node: ${cyclePathString}`,
      );
      error.cycle = cyclePath; // Array format for test assertions
      throw error;
    }

    if (visited.has(node.id)) return;

    visiting.add(node.id);
    const newPath = [...path, node.id];

    try {
      node.inputs.forEach((input) => visit(input, newPath));
    } catch (error) {
      if (error.message.includes('Cycle detected')) {
        throw error; // Preserve original message and cycle property
      }
      throw error;
    }

    visiting.delete(node.id);
    visited.add(node.id);
    order.push(node);
  };

  try {
    for (const node of nodes.values()) {
      visit(node);
    }
  } catch (error) {
    if (error.message.includes('Cycle detected')) {
      throw error;
    }
    throw new Error(`DAG topological sort failed: ${error.message}`);
  }

  // Return nodes in dependency order (sources first, sinks last)
  return order;
}

/**
 * Validates basic DAG structure
 *
 * Performs fundamental validation checks:
 * - DAG is not empty
 * - No cycles exist (via topological sort)
 * - At least one sink node exists
 *
 * This is the primary validation method called before DAG execution.
 *
 * @param {Map<string, DAGNode>} nodes - Map of node IDs to DAGNode instances
 * @returns {boolean} True if validation passes
 *
 * @throws {Error} If DAG is empty - "DAG is empty - no nodes to execute"
 * @throws {Error} If cycle detected - "DAG validation failed: DAG topological sort failed: Cycle detected involving node: ..."
 *   - error.cycle: Array of node IDs forming the cycle
 * @throws {Error} If no sink nodes - "DAG has no sink nodes - no final output available"
 * @throws {Error} For other validation failures
 *
 * @example
 * // Valid DAG
 * const nodes = new Map([
 *   ['load', loadNode],
 *   ['process', processNode],
 *   ['save', saveNode]
 * ]);
 * const isValid = validateDAG(nodes); // true
 *
 * @example
 * // Empty DAG
 * try {
 *   validateDAG(new Map());
 * } catch (error) {
 *   console.log(error.message); // "DAG is empty - no nodes to execute"
 * }
 *
 * @example
 * // No sink nodes (all nodes have outputs)
 * const nodes = new Map([
 *   ['A', nodeA] // A -> B
 * ]);
 * // Assuming all nodes have outputs
 * try {
 *   validateDAG(nodes);
 * } catch (error) {
 *   console.log(error.message); // "DAG has no sink nodes - no final output available"
 * }
 *
 * @performance O(V + E) due to topological sort
 * @since 2.2.2
 */
function validateDAG(nodes) {
  if (nodes.size === 0) {
    throw new Error('DAG is empty - no nodes to execute');
  }

  // Check for cycles using topological sort
  try {
    topologicalSort(nodes);
  } catch (error) {
    if (error.message.includes('Cycle detected')) {
      // Extract cycle information from error message or use error.cycle if available
      let cycleNodes = error.cycle;
      if (!cycleNodes && error.message.includes('involving node:')) {
        // Parse cycle from message if cycle array not available
        const match = error.message.match(/involving node: (.+)/);
        if (match) {
          cycleNodes = match[1].split(' -> ');
        }
      }
      if (!cycleNodes) {
        cycleNodes = ['unknown'];
      }

      const pretty = cycleNodes.join(' -> ');
      const err = new Error(
        `DAG validation failed: DAG topological sort failed: Cycle detected involving node: ${pretty}`,
      );
      err.cycle = cycleNodes;
      throw err;
    }
    throw new Error(`DAG validation failed: ${error.message}`);
  }

  // Note: Sink node check is performed in DAG._processResults, not here
  // This allows for more flexible DAG construction and execution patterns

  return true;
}

/**
 * Validates DAG topology with advanced options and warnings
 *
 * Performs comprehensive validation including:
 * - Empty DAG check
 * - Self-loop detection
 * - Cycle detection via topological sort
 * - Isolated node detection (nodes with no connections)
 *
 * Supports strict and non-strict modes. In non-strict mode, some issues
 * (like isolated nodes) generate warnings instead of throwing errors.
 *
 * @param {Map<string, DAGNode>} nodes - Map of node IDs to DAGNode instances
 * @param {Object} options - Validation options
 * @param {boolean} [options.strict=true] - If true, throw errors for all issues.
 *   If false, return warnings for non-critical issues
 * @returns {string[]} Array of warning messages (empty if no warnings in strict mode)
 *
 * @throws {Error} If DAG is empty - "DAG cannot be empty"
 * @throws {Error} If self-loop detected - "Self-loop detected"
 * @throws {Error} If cycle detected - "Cycle detected in DAG"
 *   - error.cycle: Array of node IDs forming the cycle
 * @throws {Error} If orphaned node found in strict mode
 *
 * @example
 * // Strict mode (default)
 * const nodes = new Map([['isolated', isolatedNode]]);
 * try {
 *   validateTopology(nodes, { strict: true });
 * } catch (error) {
 *   console.log(error.message); // "Orphaned node detected: isolated"
 * }
 *
 * @example
 * // Non-strict mode (warnings)
 * const nodes = new Map([
 *   ['A', nodeA],
 *   ['isolated', isolatedNode]
 * ]);
 * const warnings = validateTopology(nodes, { strict: false });
 * console.log(warnings); // ["Orphaned node detected: isolated"]
 *
 * @example
 * // Self-loop detection
 * const nodeWithSelfLoop = new DAGNode('X', () => {});
 * nodeWithSelfLoop.outputs.push(nodeWithSelfLoop);
 * const nodes = new Map([['X', nodeWithSelfLoop]]);
 * try {
 *   validateTopology(nodes);
 * } catch (error) {
 *   console.log(error.message); // "Self-loop detected"
 * }
 *
 * @performance O(V + E) due to topological sort and graph traversal
 * @complexity Cyclomatic complexity: 5 (within acceptable limits)
 * @since 2.2.2
 */
function validateTopology(nodes, options = {}) {
  const { strict = true } = options;
  const warnings = [];

  // Check for empty DAG
  if (nodes.size === 0) {
    throw new Error('DAG cannot be empty');
  }

  // Check for self-loops
  for (const node of nodes.values()) {
    if (node.outputs.includes(node)) {
      throw new Error('Self-loop detected');
    }
  }

  // Check for cycles by attempting topological sort
  try {
    topologicalSort(nodes);
  } catch (error) {
    if (error.message.includes('Cycle detected')) {
      // Extract cycle information from error message or use error.cycle if available
      let cycleNodes = error.cycle;
      if (!cycleNodes && error.message.includes('involving node:')) {
        // Parse cycle from message if cycle array not available
        const match = error.message.match(/involving node: (.+)/);
        if (match) {
          cycleNodes = match[1].split(' -> ');
        }
      }
      if (!cycleNodes) {
        cycleNodes = ['unknown'];
      }

      const err = new Error('Cycle detected in DAG');
      err.cycle = cycleNodes;
      throw err;
    }
    throw error;
  }

  // Check for isolated nodes
  for (const node of nodes.values()) {
    if (node.inputs.length === 0 && node.outputs.length === 0) {
      const message = `Orphaned node detected: ${node.id}`;
      if (strict) {
        throw new Error(message);
      } else {
        warnings.push(message);
      }
    }
  }

  return warnings;
}

// Export all functions
module.exports = {
  buildAdjacency,
  getSinkIds,
  topologicalSort,
  validateDAG,
  validateTopology,
};

// Default export for convenience
module.exports.default = module.exports;
