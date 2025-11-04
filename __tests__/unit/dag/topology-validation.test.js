/**
 * Unit tests for DAG topology validation module
 *
 * Tests the topology validation utilities including cycle detection,
 * topological sorting, and structural validation.
 *
 * @author Ali Kahwaji
 * @since 2.2.2
 */

const DAGNode = require("../../../src/dag/dag-node.js");
const {
  buildAdjacency,
  getSinkIds,
  topologicalSort,
  validateDAG,
  validateTopology,
} = require("../../../src/dag/core/topology-validation.js");

describe("DAG Topology Validation", () => {
  describe("buildAdjacency", () => {
    it("should build correct adjacency maps for simple linear DAG", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});
      const nodeC = new DAGNode("C", () => {});

      // Connect A -> B -> C
      nodeA.outputs.push(nodeB);
      nodeB.inputs.push(nodeA);
      nodeB.outputs.push(nodeC);
      nodeC.inputs.push(nodeB);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
        ["C", nodeC],
      ]);

      const { fwd, rev } = buildAdjacency(nodes);

      // Forward adjacency
      expect(fwd.get("A")).toEqual(new Set(["B"]));
      expect(fwd.get("B")).toEqual(new Set(["C"]));
      expect(fwd.get("C")).toEqual(new Set());

      // Reverse adjacency
      expect(rev.get("A")).toEqual(new Set());
      expect(rev.get("B")).toEqual(new Set(["A"]));
      expect(rev.get("C")).toEqual(new Set(["B"]));
    });

    it("should build adjacency maps for DAG with multiple children", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});
      const nodeC = new DAGNode("C", () => {});

      // Connect A -> B and A -> C
      nodeA.outputs.push(nodeB, nodeC);
      nodeB.inputs.push(nodeA);
      nodeC.inputs.push(nodeA);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
        ["C", nodeC],
      ]);

      const { fwd, rev } = buildAdjacency(nodes);

      // Forward adjacency
      expect(fwd.get("A")).toEqual(new Set(["B", "C"]));
      expect(fwd.get("B")).toEqual(new Set());
      expect(fwd.get("C")).toEqual(new Set());

      // Reverse adjacency
      expect(rev.get("A")).toEqual(new Set());
      expect(rev.get("B")).toEqual(new Set(["A"]));
      expect(rev.get("C")).toEqual(new Set(["A"]));
    });

    it("should handle diamond-shaped DAG", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});
      const nodeC = new DAGNode("C", () => {});
      const nodeD = new DAGNode("D", () => {});

      // Diamond: A -> B -> D
      //          A -> C -> D
      nodeA.outputs.push(nodeB, nodeC);
      nodeB.inputs.push(nodeA);
      nodeB.outputs.push(nodeD);
      nodeC.inputs.push(nodeA);
      nodeC.outputs.push(nodeD);
      nodeD.inputs.push(nodeB, nodeC);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
        ["C", nodeC],
        ["D", nodeD],
      ]);

      const { fwd, rev } = buildAdjacency(nodes);

      // Forward adjacency
      expect(fwd.get("A")).toEqual(new Set(["B", "C"]));
      expect(fwd.get("B")).toEqual(new Set(["D"]));
      expect(fwd.get("C")).toEqual(new Set(["D"]));
      expect(fwd.get("D")).toEqual(new Set());

      // Reverse adjacency
      expect(rev.get("A")).toEqual(new Set());
      expect(rev.get("B")).toEqual(new Set(["A"]));
      expect(rev.get("C")).toEqual(new Set(["A"]));
      expect(rev.get("D")).toEqual(new Set(["B", "C"]));
    });

    it("should handle empty DAG", () => {
      const nodes = new Map();
      const { fwd, rev } = buildAdjacency(nodes);

      expect(fwd.size).toBe(0);
      expect(rev.size).toBe(0);
    });
  });

  describe("getSinkIds", () => {
    it("should identify single sink node", () => {
      const fwd = new Map([
        ["A", new Set(["B"])],
        ["B", new Set(["C"])],
        ["C", new Set()], // Sink
      ]);

      const sinks = getSinkIds(fwd);
      expect(sinks).toEqual(["C"]);
    });

    it("should identify multiple sink nodes", () => {
      const fwd = new Map([
        ["A", new Set(["B", "C"])],
        ["B", new Set()], // Sink
        ["C", new Set()], // Sink
      ]);

      const sinks = getSinkIds(fwd);
      expect(sinks.sort()).toEqual(["B", "C"]);
    });

    it("should return empty array when no sinks exist (cyclic graph)", () => {
      const fwd = new Map([
        ["A", new Set(["B"])],
        ["B", new Set(["A"])], // Cycle, no sinks
      ]);

      const sinks = getSinkIds(fwd);
      expect(sinks).toEqual([]);
    });

    it("should handle empty adjacency map", () => {
      const fwd = new Map();
      const sinks = getSinkIds(fwd);
      expect(sinks).toEqual([]);
    });
  });

  describe("topologicalSort", () => {
    it("should sort simple linear DAG", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});
      const nodeC = new DAGNode("C", () => {});

      // A -> B -> C
      nodeA.outputs.push(nodeB);
      nodeB.inputs.push(nodeA);
      nodeB.outputs.push(nodeC);
      nodeC.inputs.push(nodeB);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
        ["C", nodeC],
      ]);

      const sorted = topologicalSort(nodes);
      const order = sorted.map((n) => n.id);

      // Expect dependency order: A, B, C (sources first, sinks last)
      expect(order).toEqual(["A", "B", "C"]);
    });

    it("should sort DAG with multiple source nodes", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});
      const nodeC = new DAGNode("C", () => {});

      // A -> C
      // B -> C
      nodeA.outputs.push(nodeC);
      nodeB.outputs.push(nodeC);
      nodeC.inputs.push(nodeA, nodeB);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
        ["C", nodeC],
      ]);

      const sorted = topologicalSort(nodes);
      const order = sorted.map((n) => n.id);

      // C should come last (sink), A and B order doesn't matter for sources
      expect(order[2]).toBe("C");
      expect(order.slice(0, 2).sort()).toEqual(["A", "B"]);
    });

    it("should detect single-node cycle", () => {
      const nodeA = new DAGNode("A", () => {});
      nodeA.outputs.push(nodeA);
      nodeA.inputs.push(nodeA);

      const nodes = new Map([["A", nodeA]]);

      expect(() => topologicalSort(nodes)).toThrow(
        "Cycle detected involving node: A",
      );
    });

    it("should detect two-node cycle", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});

      // A -> B -> A (cycle)
      nodeA.outputs.push(nodeB);
      nodeB.inputs.push(nodeA);
      nodeB.outputs.push(nodeA);
      nodeA.inputs.push(nodeB);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
      ]);

      expect(() => topologicalSort(nodes)).toThrow(
        "Cycle detected involving node: A -> B",
      );
    });

    it("should detect three-node cycle", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});
      const nodeC = new DAGNode("C", () => {});

      // A -> B -> C -> A (cycle)
      nodeA.outputs.push(nodeB);
      nodeB.inputs.push(nodeA);
      nodeB.outputs.push(nodeC);
      nodeC.inputs.push(nodeB);
      nodeC.outputs.push(nodeA);
      nodeA.inputs.push(nodeC);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
        ["C", nodeC],
      ]);

      expect(() => topologicalSort(nodes)).toThrow(
        "Cycle detected involving node: A -> B -> C",
      );
    });

    it("should include cycle information in error", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});

      // A -> B -> A
      nodeA.outputs.push(nodeB);
      nodeB.inputs.push(nodeA);
      nodeB.outputs.push(nodeA);
      nodeA.inputs.push(nodeB);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
      ]);

      try {
        topologicalSort(nodes);
        fail("Expected error to be thrown");
      } catch (error) {
        expect(error.message).toContain("Cycle detected");
        expect(error.cycle).toBeDefined();
        expect(Array.isArray(error.cycle)).toBe(true);
      }
    });

    it("should handle empty DAG", () => {
      const nodes = new Map();
      const sorted = topologicalSort(nodes);
      expect(sorted).toEqual([]);
    });
  });

  describe("validateDAG", () => {
    it("should validate simple linear DAG", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});
      const nodeC = new DAGNode("C", () => {});

      nodeA.outputs.push(nodeB);
      nodeB.inputs.push(nodeA);
      nodeB.outputs.push(nodeC);
      nodeC.inputs.push(nodeB);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
        ["C", nodeC],
      ]);

      expect(validateDAG(nodes)).toBe(true);
    });

    it("should throw error for empty DAG", () => {
      const nodes = new Map();
      expect(() => validateDAG(nodes)).toThrow(
        "DAG is empty - no nodes to execute",
      );
    });

    it("should throw error for cyclic DAG", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});

      nodeA.outputs.push(nodeB);
      nodeB.inputs.push(nodeA);
      nodeB.outputs.push(nodeA);
      nodeA.inputs.push(nodeB);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
      ]);

      expect(() => validateDAG(nodes)).toThrow("Cycle detected");
    });

    it("should throw error when no sink nodes exist", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});

      // A -> B -> A (all nodes have outputs)
      nodeA.outputs.push(nodeB);
      nodeB.inputs.push(nodeA);
      nodeB.outputs.push(nodeA);
      nodeA.inputs.push(nodeB);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
      ]);

      expect(() => validateDAG(nodes)).toThrow();
    });

    it("should validate DAG with multiple sinks", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});
      const nodeC = new DAGNode("C", () => {});

      // A -> B (sink)
      // A -> C (sink)
      nodeA.outputs.push(nodeB, nodeC);
      nodeB.inputs.push(nodeA);
      nodeC.inputs.push(nodeA);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
        ["C", nodeC],
      ]);

      expect(validateDAG(nodes)).toBe(true);
    });

    it("should include cycle path in error message", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});

      nodeA.outputs.push(nodeB);
      nodeB.inputs.push(nodeA);
      nodeB.outputs.push(nodeA);
      nodeA.inputs.push(nodeB);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
      ]);

      try {
        validateDAG(nodes);
        fail("Expected error to be thrown");
      } catch (error) {
        expect(error.message).toContain("A -> B");
        expect(error.cycle).toBeDefined();
      }
    });
  });

  describe("validateTopology", () => {
    it("should validate simple DAG with no warnings", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});

      nodeA.outputs.push(nodeB);
      nodeB.inputs.push(nodeA);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
      ]);

      const warnings = validateTopology(nodes);
      expect(warnings).toEqual([]);
    });

    it("should throw error for empty DAG", () => {
      const nodes = new Map();
      expect(() => validateTopology(nodes)).toThrow("DAG cannot be empty");
    });

    it("should detect self-loop", () => {
      const nodeA = new DAGNode("A", () => {});
      nodeA.outputs.push(nodeA);

      const nodes = new Map([["A", nodeA]]);

      expect(() => validateTopology(nodes)).toThrow("Self-loop detected");
    });

    it("should detect cycle", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});

      nodeA.outputs.push(nodeB);
      nodeB.inputs.push(nodeA);
      nodeB.outputs.push(nodeA);
      nodeA.inputs.push(nodeB);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
      ]);

      try {
        validateTopology(nodes);
        fail("Expected error to be thrown");
      } catch (error) {
        expect(error.message).toBe("Cycle detected in DAG");
        expect(error.cycle).toBeDefined();
      }
    });

    it("should throw error for isolated node in strict mode", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});
      const isolated = new DAGNode("isolated", () => {});

      // Connect A -> B (valid graph), leave isolated orphaned
      nodeA.outputs.push(nodeB);
      nodeB.inputs.push(nodeA);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
        ["isolated", isolated],
      ]);

      expect(() => validateTopology(nodes, { strict: true })).toThrow(
        "Orphaned node detected: isolated",
      );
    });

    it("should return warning for isolated node in non-strict mode", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});
      const isolated = new DAGNode("isolated", () => {});

      // Connect A -> B (valid graph), leave isolated orphaned
      nodeA.outputs.push(nodeB);
      nodeB.inputs.push(nodeA);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
        ["isolated", isolated],
      ]);

      const warnings = validateTopology(nodes, { strict: false });
      expect(warnings).toContain("Orphaned node detected: isolated");
    });

    it("should validate diamond-shaped DAG", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});
      const nodeC = new DAGNode("C", () => {});
      const nodeD = new DAGNode("D", () => {});

      // Diamond: A -> B -> D
      //          A -> C -> D
      nodeA.outputs.push(nodeB, nodeC);
      nodeB.inputs.push(nodeA);
      nodeB.outputs.push(nodeD);
      nodeC.inputs.push(nodeA);
      nodeC.outputs.push(nodeD);
      nodeD.inputs.push(nodeB, nodeC);

      const nodes = new Map([
        ["A", nodeA],
        ["B", nodeB],
        ["C", nodeC],
        ["D", nodeD],
      ]);

      const warnings = validateTopology(nodes);
      expect(warnings).toEqual([]);
    });

    it("should use strict mode by default", () => {
      const isolated = new DAGNode("isolated", () => {});
      const nodes = new Map([["isolated", isolated]]);

      expect(() => validateTopology(nodes)).toThrow("Orphaned node detected");
    });
  });
});
