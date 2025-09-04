/**
const path = require('path');
 * Unit tests for DAG engine with cycle detection and error handling
 * Tests the enhanced DAG functionality including cycle safety and robust error propagation
 */

const { DAG, DAGNode } = require("../../../src/dag/dag-engine.js");

describe("DAGNode", () => {
  describe("constructor", () => {
    it("should create a node with id and run function", () => {
      const runFn = jest.fn();
      const node = new DAGNode("test-node", runFn);

      expect(node.id).toBe("test-node");
      expect(node.run).toBe(runFn);
      expect(node.inputs).toEqual([]);
      expect(node.outputs).toEqual([]);
    });
  });
});

describe("DAG", () => {
  let dag;

  beforeEach(() => {
    dag = new DAG();
  });

  describe("constructor", () => {
    it("should create empty DAG", () => {
      expect(dag.nodes.size).toBe(0);
    });
  });

  describe("addNode", () => {
    it("should add node to DAG", () => {
      const runFn = jest.fn();
      const node = dag.addNode("test", runFn);

      expect(node).toBeInstanceOf(DAGNode);
      expect(node.id).toBe("test");
      expect(dag.nodes.size).toBe(1);
      expect(dag.nodes.get("test")).toBe(node);
    });

    it("should allow multiple nodes", () => {
      dag.addNode("node1", jest.fn());
      dag.addNode("node2", jest.fn());
      dag.addNode("node3", jest.fn());

      expect(dag.nodes.size).toBe(3);
      expect(dag.nodes.has("node1")).toBe(true);
      expect(dag.nodes.has("node2")).toBe(true);
      expect(dag.nodes.has("node3")).toBe(true);
    });
  });

  describe("connect", () => {
    beforeEach(() => {
      dag.addNode("A", jest.fn());
      dag.addNode("B", jest.fn());
      dag.addNode("C", jest.fn());
    });

    it("should connect two nodes", () => {
      dag.connect("A", "B");

      const nodeA = dag.nodes.get("A");
      const nodeB = dag.nodes.get("B");

      expect(nodeA.outputs).toContain(nodeB);
      expect(nodeB.inputs).toContain(nodeA);
    });

    it("should allow multiple connections", () => {
      dag.connect("A", "B");
      dag.connect("B", "C");
      dag.connect("A", "C");

      const nodeA = dag.nodes.get("A");
      const nodeB = dag.nodes.get("B");
      const nodeC = dag.nodes.get("C");

      expect(nodeA.outputs).toHaveLength(2);
      expect(nodeA.outputs).toContain(nodeB);
      expect(nodeA.outputs).toContain(nodeC);
      expect(nodeC.inputs).toHaveLength(2);
      expect(nodeC.inputs).toContain(nodeA);
      expect(nodeC.inputs).toContain(nodeB);
    });

    it("should throw error for invalid source node", () => {
      expect(() => dag.connect("nonexistent", "B")).toThrow(
        "Invalid edge: nonexistent → B",
      );
    });

    it("should throw error for invalid target node", () => {
      expect(() => dag.connect("A", "nonexistent")).toThrow(
        "Invalid edge: A → nonexistent",
      );
    });

    it("should throw error for both invalid nodes", () => {
      expect(() => dag.connect("invalid1", "invalid2")).toThrow(
        "Invalid edge: invalid1 → invalid2",
      );
    });
  });

  describe("validate", () => {
    it("should throw error for empty DAG", () => {
      expect(() => dag.validate()).toThrow(
        "DAG is empty - no nodes to execute",
      );
    });

    it("should validate simple linear DAG", () => {
      dag.addNode("A", jest.fn());
      dag.addNode("B", jest.fn());
      dag.connect("A", "B");

      expect(() => dag.validate()).not.toThrow();
      expect(dag.validate()).toBe(true);
    });

    it("should validate DAG with multiple source nodes", () => {
      dag.addNode("A", jest.fn());
      dag.addNode("B", jest.fn());
      dag.addNode("C", jest.fn());
      dag.connect("A", "C");
      dag.connect("B", "C");

      expect(() => dag.validate()).not.toThrow();
    });

    it("should throw error for DAG with no source nodes (all nodes have inputs)", () => {
      dag.addNode("A", jest.fn());
      dag.addNode("B", jest.fn());
      dag.addNode("C", jest.fn());
      dag.connect("A", "B");
      dag.connect("B", "C");
      dag.connect("C", "A"); // Creates cycle, no source nodes

      expect(() => dag.validate()).toThrow("DAG validation failed");
    });

    it("should detect simple cycle", () => {
      dag.addNode("A", jest.fn());
      dag.addNode("B", jest.fn());
      dag.connect("A", "B");
      dag.connect("B", "A");

      expect(() => dag.validate()).toThrow(
        "DAG validation failed: DAG topological sort failed: Cycle detected involving node: A -> B",
      );
    });

    it("should detect complex cycle", () => {
      dag.addNode("A", jest.fn());
      dag.addNode("B", jest.fn());
      dag.addNode("C", jest.fn());
      dag.addNode("D", jest.fn());
      dag.connect("A", "B");
      dag.connect("B", "C");
      dag.connect("C", "D");
      dag.connect("D", "B"); // Creates cycle B -> C -> D -> B

      expect(() => dag.validate()).toThrow("Cycle detected");
    });
  });

  describe("topoSort", () => {
    it("should sort single node", () => {
      dag.addNode("A", jest.fn());
      const order = dag.topoSort();

      expect(order).toHaveLength(1);
      expect(order[0].id).toBe("A");
    });

    it("should sort linear chain correctly", () => {
      dag.addNode("A", jest.fn());
      dag.addNode("B", jest.fn());
      dag.addNode("C", jest.fn());
      dag.connect("A", "B");
      dag.connect("B", "C");

      const order = dag.topoSort();
      const ids = order.map((node) => node.id);

      expect(ids).toEqual(["A", "B", "C"]);
    });

    it("should sort diamond DAG correctly", () => {
      dag.addNode("A", jest.fn());
      dag.addNode("B", jest.fn());
      dag.addNode("C", jest.fn());
      dag.addNode("D", jest.fn());
      dag.connect("A", "B");
      dag.connect("A", "C");
      dag.connect("B", "D");
      dag.connect("C", "D");

      const order = dag.topoSort();
      const ids = order.map((node) => node.id);

      expect(ids[0]).toBe("A"); // A must be first
      expect(ids[3]).toBe("D"); // D must be last
      expect(ids.includes("B")).toBe(true);
      expect(ids.includes("C")).toBe(true);
    });

    it("should detect self-loop", () => {
      dag.addNode("A", jest.fn());
      dag.connect("A", "A");

      expect(() => dag.topoSort()).toThrow("Cycle detected involving node: A");
    });

    it("should detect two-node cycle", () => {
      dag.addNode("A", jest.fn());
      dag.addNode("B", jest.fn());
      dag.connect("A", "B");
      dag.connect("B", "A");

      expect(() => dag.topoSort()).toThrow(
        "Cycle detected involving node: A -> B",
      );
    });

    it("should detect three-node cycle", () => {
      dag.addNode("A", jest.fn());
      dag.addNode("B", jest.fn());
      dag.addNode("C", jest.fn());
      dag.connect("A", "B");
      dag.connect("B", "C");
      dag.connect("C", "A");

      expect(() => dag.topoSort()).toThrow(
        "Cycle detected involving node: A -> B -> C",
      );
    });

    it("should provide detailed cycle path information", () => {
      dag.addNode("start", jest.fn());
      dag.addNode("middle1", jest.fn());
      dag.addNode("middle2", jest.fn());
      dag.addNode("end", jest.fn());
      dag.connect("start", "middle1");
      dag.connect("middle1", "middle2");
      dag.connect("middle2", "end");
      dag.connect("end", "middle1"); // Creates cycle

      expect(() => dag.topoSort()).toThrow(
        "Cycle detected involving node: middle1 -> middle2 -> end",
      );
    });
  });

  describe("execute", () => {
    it("should execute single node with seed input", async () => {
      const mockFn = jest.fn().mockResolvedValue("result");
      dag.addNode("A", mockFn);

      const result = await dag.execute("seed");

      expect(mockFn).toHaveBeenCalledWith("seed");
      expect(result).toBe("result");
    });

    it("should execute linear chain passing results", async () => {
      const mockA = jest.fn().mockResolvedValue("A-result");
      const mockB = jest.fn().mockResolvedValue("B-result");
      const mockC = jest.fn().mockResolvedValue("C-result");

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.addNode("C", mockC);
      dag.connect("A", "B");
      dag.connect("B", "C");

      const result = await dag.execute("seed");

      expect(mockA).toHaveBeenCalledWith("seed");
      expect(mockB).toHaveBeenCalledWith("A-result");
      expect(mockC).toHaveBeenCalledWith("B-result");
      expect(result).toBe("C-result");
    });

    it("should handle diamond DAG with multiple inputs", async () => {
      const mockA = jest.fn().mockResolvedValue("A-result");
      const mockB = jest.fn().mockResolvedValue("B-result");
      const mockC = jest.fn().mockResolvedValue("C-result");
      const mockD = jest.fn().mockResolvedValue("D-result");

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.addNode("C", mockC);
      dag.addNode("D", mockD);
      dag.connect("A", "B");
      dag.connect("A", "C");
      dag.connect("B", "D");
      dag.connect("C", "D");

      const result = await dag.execute("seed");

      expect(mockA).toHaveBeenCalledWith("seed");
      expect(mockB).toHaveBeenCalledWith("A-result");
      expect(mockC).toHaveBeenCalledWith("A-result");
      expect(mockD).toHaveBeenCalledWith(["B-result", "C-result"]);
      expect(result).toBe("D-result");
    });

    it("should handle multiple sink nodes", async () => {
      const mockA = jest.fn().mockResolvedValue("A-result");
      const mockB = jest.fn().mockResolvedValue("B-result");
      const mockC = jest.fn().mockResolvedValue("C-result");

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.addNode("C", mockC);
      dag.connect("A", "B");
      dag.connect("A", "C");

      const result = await dag.execute("seed");

      expect(result).toEqual({
        B: "B-result",
        C: "C-result",
      });
    });

    it("should throw error for empty DAG", async () => {
      await expect(dag.execute("seed")).rejects.toThrow(
        "DAG execution failed: DAG is empty - no nodes to execute",
      );
    });

    it("should throw error for cyclic DAG", async () => {
      dag.addNode("A", jest.fn());
      dag.addNode("B", jest.fn());
      dag.connect("A", "B");
      dag.connect("B", "A");

      await expect(dag.execute("seed")).rejects.toThrow(
        "DAG execution failed: DAG validation failed",
      );
    });

    it("should handle node execution failure with dependents", async () => {
      const mockA = jest.fn().mockResolvedValue("A-result");
      const mockB = jest.fn().mockRejectedValue(new Error("B failed"));
      const mockC = jest.fn().mockResolvedValue("C-result");

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.addNode("C", mockC);
      dag.connect("A", "B");
      dag.connect("B", "C");

      await expect(dag.execute("seed")).rejects.toThrow(
        "Node B execution failed: B failed. This affects downstream nodes: C",
      );
    });

    it("should continue execution when non-critical node fails", async () => {
      const mockA = jest.fn().mockResolvedValue("A-result");
      const mockB = jest.fn().mockResolvedValue("B-result");
      const mockC = jest.fn().mockRejectedValue(new Error("C failed"));
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.addNode("C", mockC); // No dependents
      dag.connect("A", "B");
      dag.connect("A", "C");

      const result = await dag.execute("seed");

      expect(result).toBe("B-result"); // B is the only sink node that succeeded
      expect(consoleSpy).toHaveBeenCalledWith(
        "Non-critical node failure: Node C execution failed: C failed",
      );

      consoleSpy.mockRestore();
    });

    it("should handle input node failure propagation", async () => {
      const mockA = jest.fn().mockRejectedValue(new Error("A failed"));
      const mockB = jest.fn().mockResolvedValue("B-result");

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.connect("A", "B");

      await expect(dag.execute("seed")).rejects.toThrow(
        "Node A execution failed: A failed. This affects downstream nodes: B",
      );
    });

    it("should throw error when no sink nodes exist", async () => {
      // This shouldn't happen with proper validation, but test edge case
      const mockA = jest.fn().mockResolvedValue("A-result");
      dag.addNode("A", mockA);

      // Manually create a situation with no sink nodes by adding outputs after validation
      const nodeA = dag.nodes.get("A");
      nodeA.outputs.push({ id: "phantom" }); // Fake output to make it not a sink

      await expect(dag.execute("seed")).rejects.toThrow(
        "DAG has no sink nodes - no final output available",
      );
    });

    it("should handle async node execution", async () => {
      const mockA = jest.fn().mockImplementation(async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return `processed-${input}`;
      });

      dag.addNode("A", mockA);

      const result = await dag.execute("test-input");

      expect(result).toBe("processed-test-input");
    });

    it("should maintain execution order in complex DAG", async () => {
      const executionOrder = [];

      const mockA = jest.fn().mockImplementation(async (input) => {
        executionOrder.push("A");
        return "A-result";
      });
      const mockB = jest.fn().mockImplementation(async (input) => {
        executionOrder.push("B");
        return "B-result";
      });
      const mockC = jest.fn().mockImplementation(async (input) => {
        executionOrder.push("C");
        return "C-result";
      });
      const mockD = jest.fn().mockImplementation(async (input) => {
        executionOrder.push("D");
        return "D-result";
      });

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.addNode("C", mockC);
      dag.addNode("D", mockD);
      dag.connect("A", "B");
      dag.connect("A", "C");
      dag.connect("B", "D");
      dag.connect("C", "D");

      await dag.execute("seed");

      expect(executionOrder[0]).toBe("A"); // A must execute first
      expect(executionOrder[3]).toBe("D"); // D must execute last
      expect(executionOrder.indexOf("B")).toBeLessThan(
        executionOrder.indexOf("D"),
      );
      expect(executionOrder.indexOf("C")).toBeLessThan(
        executionOrder.indexOf("D"),
      );
    });
  });

  describe("error handling edge cases", () => {
    it("should handle node with undefined run function", async () => {
      dag.addNode("A", undefined);

      await expect(dag.execute("seed")).rejects.toThrow();
    });

    it("should handle node returning undefined", async () => {
      const mockA = jest.fn().mockResolvedValue(undefined);
      const mockB = jest.fn().mockResolvedValue("B-result");

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.connect("A", "B");

      const result = await dag.execute("seed");

      expect(mockB).toHaveBeenCalledWith(undefined);
      expect(result).toBe("B-result");
    });

    it("should handle very large DAG without stack overflow", async () => {
      // Create a linear chain of 100 nodes
      for (let i = 0; i < 100; i++) {
        dag.addNode(`node${i}`, jest.fn().mockResolvedValue(`result${i}`));
        if (i > 0) {
          dag.connect(`node${i - 1}`, `node${i}`);
        }
      }

      const result = await dag.execute("seed");
      expect(result).toBe("result99");
    });

    it("should provide meaningful error messages for complex cycles", async () => {
      // Create a more complex cycle scenario
      dag.addNode("root", jest.fn());
      dag.addNode("branch1", jest.fn());
      dag.addNode("branch2", jest.fn());
      dag.addNode("merge", jest.fn());
      dag.addNode("feedback", jest.fn());

      dag.connect("root", "branch1");
      dag.connect("root", "branch2");
      dag.connect("branch1", "merge");
      dag.connect("branch2", "merge");
      dag.connect("merge", "feedback");
      dag.connect("feedback", "branch1"); // Creates cycle

      await expect(dag.execute("seed")).rejects.toThrow(
        "Cycle detected involving node: branch1 -> merge -> feedback",
      );
    });
  });
});
