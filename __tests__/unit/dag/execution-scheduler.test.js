/**
 * Unit tests for ExecutionScheduler module
 *
 * Tests execution scheduling, concurrency management, timeout handling,
 * and retry logic in isolation from the DAG engine.
 *
 * @author Ali Kahwaji
 * @since 2.2.3
 */

const DAGNode = require("../../../src/dag/dag-node.js");
const ExecutionScheduler = require("../../../src/dag/core/execution-scheduler.js");

describe("ExecutionScheduler", () => {
  let scheduler;
  let mockGetSinkIds;

  beforeEach(() => {
    mockGetSinkIds = jest.fn((fwd) => {
      const sinkIds = [];
      for (const [nodeId, children] of fwd) {
        if (children.size === 0) {
          sinkIds.push(nodeId);
        }
      }
      return sinkIds;
    });

    scheduler = new ExecutionScheduler({
      getSinkIds: mockGetSinkIds,
    });
  });

  describe("constructor", () => {
    it("should create scheduler with getSinkIds function", () => {
      expect(scheduler).toBeInstanceOf(ExecutionScheduler);
      expect(scheduler.getSinkIds).toBe(mockGetSinkIds);
    });

    it("should use console as default logger", () => {
      expect(scheduler.logger).toBe(console);
    });

    it("should accept custom logger", () => {
      const customLogger = { log: jest.fn(), error: jest.fn() };
      const customScheduler = new ExecutionScheduler({
        getSinkIds: mockGetSinkIds,
        logger: customLogger,
      });
      expect(customScheduler.logger).toBe(customLogger);
    });
  });

  describe("canExecuteNode", () => {
    it("should return true if all dependencies have results", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});
      const nodeC = new DAGNode("C", () => {});

      nodeC.inputs.push(nodeA, nodeB);

      const context = {
        results: new Map([
          ["A", "resultA"],
          ["B", "resultB"],
        ]),
        errors: new Map(),
      };

      expect(scheduler.canExecuteNode(nodeC, context)).toBe(true);
    });

    it("should return true if dependencies have errors", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});

      nodeB.inputs.push(nodeA);

      const context = {
        results: new Map(),
        errors: new Map([["A", new Error("A failed")]]),
      };

      expect(scheduler.canExecuteNode(nodeB, context)).toBe(true);
    });

    it("should return false if dependency is missing and required", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});

      nodeB.inputs.push(nodeA);

      const context = {
        results: new Map(),
        errors: new Map(),
        gracefulDegradation: false,
        requiredNodes: ["A"],
      };

      expect(scheduler.canExecuteNode(nodeB, context)).toBe(false);
    });

    it("should return true if dependency is optional in graceful degradation mode", () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});

      nodeB.inputs.push(nodeA);

      const context = {
        results: new Map(),
        errors: new Map(),
        gracefulDegradation: true,
        requiredNodes: [],
      };

      expect(scheduler.canExecuteNode(nodeB, context)).toBe(true);
    });
  });

  describe("executeNode", () => {
    it("should execute node successfully with zero dependencies", async () => {
      const mockFn = jest.fn().mockResolvedValue("result");
      const node = new DAGNode("A", mockFn);

      const context = {
        results: new Map(),
        errors: new Map(),
        fwd: new Map([["A", new Set()]]),
        seed: "initialInput",
        requiredIds: new Set(),
      };

      const result = await scheduler.executeNode(node, context);

      expect(result).toBe("result");
      expect(mockFn).toHaveBeenCalledWith("initialInput");
    });

    it("should execute node with single dependency", async () => {
      const nodeA = new DAGNode("A", () => {});
      const mockFn = jest.fn().mockResolvedValue("resultB");
      const nodeB = new DAGNode("B", mockFn);

      nodeB.inputs.push(nodeA);

      const context = {
        results: new Map([["A", "resultA"]]),
        errors: new Map(),
        fwd: new Map([
          ["A", new Set(["B"])],
          ["B", new Set()],
        ]),
        requiredIds: new Set(),
      };

      const result = await scheduler.executeNode(nodeB, context);

      expect(result).toBe("resultB");
      expect(mockFn).toHaveBeenCalledWith("resultA");
    });

    it("should execute node with multiple dependencies", async () => {
      const nodeA = new DAGNode("A", () => {});
      const nodeB = new DAGNode("B", () => {});
      const mockFn = jest.fn().mockResolvedValue("resultC");
      const nodeC = new DAGNode("C", mockFn);

      nodeC.inputs.push(nodeA, nodeB);

      const context = {
        results: new Map([
          ["A", "resultA"],
          ["B", "resultB"],
        ]),
        errors: new Map(),
        fwd: new Map([
          ["A", new Set(["C"])],
          ["B", new Set(["C"])],
          ["C", new Set()],
        ]),
        requiredIds: new Set(),
      };

      const result = await scheduler.executeNode(nodeC, context);

      expect(result).toBe("resultC");
      expect(mockFn).toHaveBeenCalledWith(["resultA", "resultB"]);
    });

    it("should throw error if node.run is not a function", async () => {
      const node = new DAGNode("A", null);

      const context = {
        results: new Map(),
        errors: new Map(),
        fwd: new Map([["A", new Set()]]),
        seed: "input",
        requiredIds: new Set(),
      };

      await expect(scheduler.executeNode(node, context)).rejects.toThrow(
        "Node A has no run function",
      );
    });

    it("should retry failed node with retryFailedNodes enabled", async () => {
      let attemptCount = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error("Temporary failure");
        }
        return "success";
      });
      const node = new DAGNode("A", mockFn);

      const context = {
        results: new Map(),
        errors: new Map(),
        fwd: new Map([["A", new Set()]]),
        seed: "input",
        requiredIds: new Set(),
        retryFailedNodes: true,
        maxRetries: 3,
      };

      const result = await scheduler.executeNode(node, context);

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it("should handle node-specific retry configuration", async () => {
      let attemptCount = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error("First attempt fails");
        }
        return "success";
      });
      const node = new DAGNode("A", mockFn);
      // Set retry config directly on node
      node.retry = { retries: 2, delayMs: 10 };

      const context = {
        results: new Map(),
        errors: new Map(),
        fwd: new Map([["A", new Set()]]),
        seed: "input",
        requiredIds: new Set(),
        retryFailedNodes: false,
      };

      const result = await scheduler.executeNode(node, context);

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it("should mark optional node as failed-optional-node on error", async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error("Node failed"));
      const node = new DAGNode("A", mockFn);
      // Set optional flag directly on node
      node.optional = true;

      const context = {
        results: new Map(),
        errors: new Map(),
        fwd: new Map([["A", new Set()]]),
        seed: "input",
        requiredIds: new Set(),
      };

      const result = await scheduler.executeNode(node, context);

      expect(typeof result).toBe("symbol");
      expect(result.description).toBe("failed-optional-node");
      expect(context.errors.has("A")).toBe(true);
    });

    it("should throw error for critical node failure", async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error("Critical failure"));
      const node = new DAGNode("A", mockFn);

      const context = {
        results: new Map(),
        errors: new Map(),
        fwd: new Map([["A", new Set(["B"])]]),
        seed: "input",
        requiredIds: new Set(["A"]),
      };

      await expect(scheduler.executeNode(node, context)).rejects.toThrow(
        "Node A execution failed: Critical failure. This affects downstream nodes: B",
      );
    });

    it("should include downstream impact in error message", async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error("Node error"));
      const node = new DAGNode("A", mockFn);

      const context = {
        results: new Map(),
        errors: new Map(),
        fwd: new Map([["A", new Set(["B", "C"])]]),
        seed: "input",
        requiredIds: new Set(["A"]),
      };

      try {
        await scheduler.executeNode(node, context);
        fail("Expected error to be thrown");
      } catch (error) {
        expect(error.message).toContain("This affects downstream nodes: B, C");
        expect(error.nodeId).toBe("A");
        expect(error.timestamp).toBeDefined();
        expect(error.cause.message).toBe("Node error");
      }
    });
  });

  describe("executeWithTimeout", () => {
    it("should execute function without timeout if timeout is 0", async () => {
      const mockFn = jest.fn().mockResolvedValue("result");

      await scheduler.executeWithTimeout(mockFn, 0);

      expect(mockFn).toHaveBeenCalled();
    });

    it("should execute function without timeout if timeout is undefined", async () => {
      const mockFn = jest.fn().mockResolvedValue("result");

      await scheduler.executeWithTimeout(mockFn, undefined);

      expect(mockFn).toHaveBeenCalled();
    });

    it("should timeout if execution exceeds timeout", async () => {
      const mockFn = jest
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) => setTimeout(() => resolve("result"), 1000)),
        );

      await expect(scheduler.executeWithTimeout(mockFn, 50)).rejects.toThrow(
        "Execution timeout",
      );
    });

    it("should complete if execution finishes before timeout", async () => {
      const mockFn = jest
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) => setTimeout(() => resolve("result"), 10)),
        );

      await expect(
        scheduler.executeWithTimeout(mockFn, 1000),
      ).resolves.toBeUndefined();

      expect(mockFn).toHaveBeenCalled();
    });
  });

  describe("scheduleExecution", () => {
    it("should execute all nodes in order", async () => {
      const executionOrder = [];

      const nodeA = new DAGNode("A", async () => {
        executionOrder.push("A");
        return "A-result";
      });
      const nodeB = new DAGNode("B", async () => {
        executionOrder.push("B");
        return "B-result";
      });
      const nodeC = new DAGNode("C", async () => {
        executionOrder.push("C");
        return "C-result";
      });

      nodeB.inputs.push(nodeA);
      nodeC.inputs.push(nodeB);

      const order = [nodeA, nodeB, nodeC];
      const results = new Map();
      const errors = new Map();

      const context = {
        results,
        errors,
        fwd: new Map([
          ["A", new Set(["B"])],
          ["B", new Set(["C"])],
          ["C", new Set()],
        ]),
        requiredIds: new Set(),
        seed: "initial",
      };

      await scheduler.scheduleExecution(order, context);

      expect(executionOrder).toEqual(["A", "B", "C"]);
      expect(results.get("A")).toBe("A-result");
      expect(results.get("B")).toBe("B-result");
      expect(results.get("C")).toBe("C-result");
    });

    it("should respect concurrency limit", async () => {
      let concurrentExecutions = 0;
      let maxConcurrent = 0;

      const createNode = (id) =>
        new DAGNode(id, async () => {
          concurrentExecutions++;
          maxConcurrent = Math.max(maxConcurrent, concurrentExecutions);
          await new Promise((resolve) => setTimeout(resolve, 50));
          concurrentExecutions--;
          return `${id}-result`;
        });

      const nodes = [
        createNode("A"),
        createNode("B"),
        createNode("C"),
        createNode("D"),
        createNode("E"),
      ];

      const order = nodes;
      const results = new Map();
      const errors = new Map();

      const context = {
        concurrency: 2,
        results,
        errors,
        fwd: new Map([
          ["A", new Set()],
          ["B", new Set()],
          ["C", new Set()],
          ["D", new Set()],
          ["E", new Set()],
        ]),
        requiredIds: new Set(),
        seed: "initial",
      };

      await scheduler.scheduleExecution(order, context);

      expect(maxConcurrent).toBeLessThanOrEqual(2);
      expect(results.size).toBe(5);
    });

    it("should skip failed-optional-node results", async () => {
      const nodeA = new DAGNode("A", async () => "A-result");
      const nodeB = new DAGNode(
        "B",
        async () => {
          throw new Error("B failed");
        },
        { optional: true },
      );
      const nodeC = new DAGNode("C", async () => "C-result");

      const order = [nodeA, nodeB, nodeC];
      const results = new Map();
      const errors = new Map();

      const context = {
        results,
        errors,
        fwd: new Map([
          ["A", new Set()],
          ["B", new Set()],
          ["C", new Set()],
        ]),
        requiredIds: new Set(),
        seed: "initial",
      };

      await scheduler.scheduleExecution(order, context);

      expect(results.has("A")).toBe(true);
      expect(results.has("B")).toBe(false); // Failed optional node
      expect(results.has("C")).toBe(true);
      expect(errors.has("B")).toBe(true);
    });

    it("should not execute node if dependencies are not satisfied", async () => {
      const nodeA = new DAGNode("A", jest.fn().mockResolvedValue("A-result"));
      const nodeB = new DAGNode("B", jest.fn().mockResolvedValue("B-result"));

      const depNode = new DAGNode("missing", () => {});
      nodeB.inputs.push(depNode);

      const order = [nodeA, nodeB];
      const results = new Map();
      const errors = new Map();

      const context = {
        results,
        errors,
        fwd: new Map([
          ["A", new Set()],
          ["B", new Set()],
        ]),
        requiredIds: new Set(),
        seed: "initial",
        gracefulDegradation: false,
      };

      await scheduler.scheduleExecution(order, context);

      expect(nodeA.run).toHaveBeenCalled();
      expect(nodeB.run).not.toHaveBeenCalled();
    });
  });

  describe("integration scenarios", () => {
    it("should handle graceful degradation with multiple sinks", async () => {
      const nodeA = new DAGNode("A", async () => "A-result");
      const nodeB = new DAGNode(
        "B",
        async () => {
          throw new Error("B fails");
        },
        { optional: true },
      );
      const nodeC = new DAGNode("C", async () => "C-result");

      const order = [nodeA, nodeB, nodeC];
      const results = new Map();
      const errors = new Map();

      const context = {
        results,
        errors,
        fwd: new Map([
          ["A", new Set(["B", "C"])],
          ["B", new Set()],
          ["C", new Set()],
        ]),
        requiredIds: new Set(),
        seed: "initial",
        gracefulDegradation: true,
        requiredNodes: ["C"],
      };

      await scheduler.scheduleExecution(order, context);

      expect(results.get("A")).toBe("A-result");
      expect(results.has("B")).toBe(false);
      expect(results.get("C")).toBe("C-result");
    });
  });
});
