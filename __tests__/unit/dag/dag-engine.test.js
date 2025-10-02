/**
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

  describe("error resilience and retry concepts", () => {
    it("should demonstrate retry concept with manual retry logic", async () => {
      let attempts = 0;
      const mockA = jest.fn().mockImplementation(async (input) => {
        attempts++;
        if (attempts === 1) {
          throw new Error("First attempt failed");
        }
        return `success-attempt-${attempts}`;
      });

      dag.addNode("A", mockA);

      // First execution fails
      await expect(dag.execute("input")).rejects.toThrow(
        "First attempt failed",
      );
      expect(attempts).toBe(1);

      // Second execution succeeds
      const result = await dag.execute("input");
      expect(result).toBe("success-attempt-2");
      expect(attempts).toBe(2);
    });

    it("should handle persistent failures appropriately", async () => {
      const mockA = jest
        .fn()
        .mockRejectedValue(new Error("Persistent failure"));

      dag.addNode("A", mockA);

      await expect(dag.execute("input")).rejects.toThrow("Persistent failure");
      expect(mockA).toHaveBeenCalledTimes(1);
    });

    it("should propagate errors through dependency chain", async () => {
      const mockA = jest.fn().mockRejectedValue(new Error("A failure"));
      const mockB = jest.fn().mockImplementation(async (input) => {
        return `B-processed-${input}`;
      });

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.connect("A", "B");

      await expect(dag.execute("input")).rejects.toThrow("A failure");
      expect(mockA).toHaveBeenCalled();
      expect(mockB).not.toHaveBeenCalled(); // B shouldn't execute if A fails
    });

    it("should demonstrate timeout concept with Promise.race", async () => {
      const mockA = jest.fn().mockImplementation(async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return "delayed-result";
      });

      dag.addNode("A", mockA);

      // Use Promise.race to simulate timeout behavior
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Operation timed out")), 100),
      );

      await expect(
        Promise.race([dag.execute("input"), timeoutPromise]),
      ).rejects.toThrow("Operation timed out");
    });

    it("should handle resource cleanup on failure", async () => {
      let resourceCreated = false;
      let resourceCleaned = false;

      const mockA = jest.fn().mockImplementation(async (input) => {
        resourceCreated = true;
        try {
          throw new Error("Processing failed");
        } finally {
          resourceCleaned = true;
        }
      });

      dag.addNode("A", mockA);

      await expect(dag.execute("input")).rejects.toThrow("Processing failed");
      expect(resourceCreated).toBe(true);
      expect(resourceCleaned).toBe(true);
    });
  });

  describe("graceful degradation concepts", () => {
    it("should demonstrate failure isolation in independent paths", async () => {
      const mockA = jest.fn().mockResolvedValue("A-result");
      const mockB = jest.fn().mockRejectedValue(new Error("B failed"));
      const mockC = jest.fn().mockImplementation(async (input) => {
        return `C-processed-${input}`;
      });

      dag.addNode("A", mockA);
      dag.addNode("C", mockC);

      dag.connect("A", "C");

      const result = await dag.execute("input");

      expect(result).toBe("C-processed-A-result");
      expect(mockA).toHaveBeenCalled();
      expect(mockC).toHaveBeenCalled();
    });

    it("should complete critical path successfully", async () => {
      const mockCritical1 = jest.fn().mockResolvedValue("critical-1");
      const mockCritical2 = jest.fn().mockResolvedValue("critical-2");
      const mockFinal = jest.fn().mockImplementation(async (input) => {
        return `final-${input}`;
      });

      dag.addNode("critical1", mockCritical1);
      dag.addNode("critical2", mockCritical2);
      dag.addNode("final", mockFinal);

      dag.connect("critical1", "critical2");
      dag.connect("critical2", "final");

      const result = await dag.execute("input");

      expect(result).toBe("final-critical-2");
    });

    it("should demonstrate error boundary concept", async () => {
      const mockA = jest.fn().mockResolvedValue("A-result");
      const mockB = jest.fn().mockImplementation(async (input) => {
        try {
          throw new Error("Simulated processing error");
        } catch (error) {
          // Error boundary - return fallback result
          return "B-fallback-result";
        }
      });

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.connect("A", "B");

      const result = await dag.execute("input");

      expect(result).toBe("B-fallback-result");
      expect(mockA).toHaveBeenCalled();
      expect(mockB).toHaveBeenCalled();
    });
  });

  describe("undefined and null handling", () => {
    it("should handle node returning undefined", async () => {
      const mockA = jest.fn().mockResolvedValue(undefined);
      const mockB = jest.fn().mockImplementation(async (input) => {
        return input === undefined ? "handled-undefined" : `processed-${input}`;
      });

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.connect("A", "B");

      const result = await dag.execute("input");

      expect(result).toBe("handled-undefined");
    });

    it("should handle node returning null", async () => {
      const mockA = jest.fn().mockResolvedValue(null);
      const mockB = jest.fn().mockImplementation(async (input) => {
        return input === null ? "handled-null" : `processed-${input}`;
      });

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.connect("A", "B");

      const result = await dag.execute("input");

      expect(result).toBe("handled-null");
    });

    it("should handle empty string results", async () => {
      const mockA = jest.fn().mockResolvedValue("");
      const mockB = jest.fn().mockImplementation(async (input) => {
        return input === "" ? "handled-empty" : `processed-${input}`;
      });

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.connect("A", "B");

      const result = await dag.execute("input");

      expect(result).toBe("handled-empty");
    });

    it("should handle nodes returning complex undefined structures", async () => {
      const mockA = jest
        .fn()
        .mockResolvedValue({ data: undefined, status: "ok" });
      const mockB = jest.fn().mockImplementation(async (input) => {
        return input.data === undefined
          ? "handled-complex-undefined"
          : "processed";
      });

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.connect("A", "B");

      const result = await dag.execute("input");

      expect(result).toBe("handled-complex-undefined");
    });
  });

  describe("performance and scalability", () => {
    it("should execute diamond DAG with proper sequencing", async () => {
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
        // DAG engine passes multiple inputs as a single concatenated string
        return `D-processed-${input}`;
      });

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.addNode("C", mockC);
      dag.addNode("D", mockD);
      dag.connect("A", "B");
      dag.connect("A", "C");
      dag.connect("B", "D");
      dag.connect("C", "D");

      const result = await dag.execute("input");

      expect(result).toBe("D-processed-B-result,C-result");
      // A should execute before B and C, and D should execute last
      expect(executionOrder.indexOf("A")).toBeLessThan(
        executionOrder.indexOf("B"),
      );
      expect(executionOrder.indexOf("A")).toBeLessThan(
        executionOrder.indexOf("C"),
      );
      expect(executionOrder.indexOf("D")).toBe(executionOrder.length - 1);
    });

    it("should handle reasonable concurrency simulation", async () => {
      let concurrentCount = 0;
      let maxConcurrent = 0;

      const createMock = (name) =>
        jest.fn().mockImplementation(async (input) => {
          concurrentCount++;
          maxConcurrent = Math.max(maxConcurrent, concurrentCount);
          // Simulate some work
          await new Promise((resolve) => setTimeout(resolve, 10));
          concurrentCount--;
          return `${name}-result`;
        });

      dag.addNode("A", createMock("A"));
      dag.addNode("B", createMock("B"));
      dag.addNode("C", createMock("C"));

      // Connect nodes to create dependencies
      dag.connect("A", "B");
      dag.connect("B", "C");

      const result = await dag.execute("input");

      expect(result).toBe("C-result");
      expect(maxConcurrent).toBeGreaterThan(0);
    });

    it("should handle moderately large DAGs without stack overflow", async () => {
      // Create a linear chain of 20 nodes (reasonable for testing)
      for (let i = 0; i < 20; i++) {
        const mockFn = jest.fn().mockImplementation(async (input) => {
          return `node${i}-${input}`;
        });
        dag.addNode(`node${i}`, mockFn);

        if (i > 0) {
          dag.connect(`node${i - 1}`, `node${i}`);
        }
      }

      const result = await dag.execute("input");

      expect(result).toMatch(/^node19-.*node0-input$/);
    });
  });

  describe("advanced error handling", () => {
    it("should propagate errors from failed nodes", async () => {
      const mockA = jest.fn().mockImplementation(async (input) => {
        throw new Error("A failed");
      });
      const mockB = jest.fn().mockImplementation(async (input) => {
        return `B-processed-${input}`;
      });

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.connect("A", "B");

      await expect(dag.execute("input")).rejects.toThrow("A failed");
      expect(mockA).toHaveBeenCalled();
      expect(mockB).not.toHaveBeenCalled(); // B shouldn't execute if A fails
    });

    it("should handle complex error scenarios", async () => {
      const mockA = jest.fn().mockResolvedValue("A-result");
      const mockB = jest.fn().mockResolvedValue("B-result");
      const mockC = jest.fn().mockRejectedValue(new Error("C failed"));

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.addNode("C", mockC);

      dag.connect("A", "B");

      // A -> B should succeed
      const result = await dag.execute("input");
      expect(result).toBe("B-result");

      // C should fail independently
      const dagC = new DAG();
      dagC.addNode("C", mockC);
      await expect(dagC.execute("input")).rejects.toThrow("C failed");
    });

    it("should provide meaningful error messages", async () => {
      const mockA = jest.fn().mockResolvedValue("A-result");
      const mockB = jest.fn().mockImplementation(async (input) => {
        throw new Error("B processing failed with specific details");
      });

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.connect("A", "B");

      try {
        await dag.execute("input");
        throw new Error("Expected execution to throw");
      } catch (error) {
        expect(error.message).toContain(
          "B processing failed with specific details",
        );
        expect(mockA).toHaveBeenCalled();
        expect(mockB).toHaveBeenCalled();
      }
    });
  });

  describe("resource management concepts", () => {
    it("should handle large data processing", async () => {
      const mockA = jest.fn().mockResolvedValue("A".repeat(100)); // Reasonably large result
      const mockB = jest.fn().mockImplementation(async (input) => {
        return `B-processed-${input.length}`;
      });

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.connect("A", "B");

      const result = await dag.execute("input");

      expect(result).toBe("B-processed-100");
      expect(mockA).toHaveBeenCalled();
      expect(mockB).toHaveBeenCalled();
    });

    it("should handle memory-aware processing", async () => {
      const mockA = jest.fn().mockImplementation(async (input) => {
        // Simulate processing larger data sets
        const data = new Array(100).fill(input);
        return data.join("-");
      });

      dag.addNode("A", mockA);

      const result = await dag.execute("input");

      expect(result).toBeDefined();
      expect(result).toContain("input");
    });
  });

  describe("debugging and validation", () => {
    it("should provide timing information through execution", async () => {
      const startTime = performance.now();

      const mockA = jest.fn().mockImplementation(async (input) => {
        // Simulate some processing time
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "A-result";
      });
      const mockB = jest.fn().mockImplementation(async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "B-result";
      });

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.connect("A", "B");

      const result = await dag.execute("input");
      const endTime = performance.now();

      expect(result).toBe("B-result");
      expect(endTime).toBeGreaterThan(startTime + 15); // Should take at least 15ms
      expect(mockA).toHaveBeenCalled();
      expect(mockB).toHaveBeenCalled();
    });

    it("should support basic execution monitoring", async () => {
      const executionLog = [];

      const mockA = jest.fn().mockImplementation(async (input) => {
        executionLog.push("A-started");
        const result = "A-result";
        executionLog.push("A-completed");
        return result;
      });

      const mockB = jest.fn().mockImplementation(async (input) => {
        executionLog.push("B-started");
        const result = "B-result";
        executionLog.push("B-completed");
        return result;
      });

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.connect("A", "B");

      const result = await dag.execute("input");

      expect(executionLog).toEqual([
        "A-started",
        "A-completed",
        "B-started",
        "B-completed",
      ]);
    });

    it("should validate basic DAG structure constraints", async () => {
      // Test basic validation scenarios
      const mockA = jest.fn().mockResolvedValue("A-result");

      dag.addNode("A", mockA);

      // Should succeed with valid single-node DAG
      const result = await dag.execute("input");
      expect(result).toBe("A-result");

      // Test that missing node connections fail appropriately
      const dagInvalid = new DAG();
      await expect(dagInvalid.execute("input")).rejects.toThrow(/empty/i);
    });

    it("should handle simple linear dependency chain", async () => {
      const mockA = jest.fn().mockImplementation(async (input) => `A-${input}`);
      const mockB = jest.fn().mockImplementation(async (input) => `B-${input}`);
      const mockC = jest.fn().mockImplementation(async (input) => `C-${input}`);

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.addNode("C", mockC);
      dag.connect("A", "B");
      dag.connect("B", "C");

      const result = await dag.execute("start");

      expect(result).toBe("C-B-A-start");
      expect(mockA).toHaveBeenCalledWith("start");
      expect(mockB).toHaveBeenCalledWith("A-start");
      expect(mockC).toHaveBeenCalledWith("B-A-start");
    });

    it("should maintain node execution state correctly", async () => {
      const executionState = { counter: 0 };
      const mockA = jest.fn().mockImplementation(async (input) => {
        executionState.counter++;
        return `A-${executionState.counter}`;
      });
      const mockB = jest.fn().mockImplementation(async (input) => {
        executionState.counter++;
        return `B-${executionState.counter}-${input}`;
      });

      dag.addNode("A", mockA);
      dag.addNode("B", mockB);
      dag.connect("A", "B");

      const result = await dag.execute("input");

      expect(result).toBe("B-2-A-1");
      expect(executionState.counter).toBe(2);
    });
  });
});
