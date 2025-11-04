/**
 * Integration tests for DAG Engine and ExecutionScheduler
 *
 * Tests the integration between dag-engine.js and execution-scheduler.js,
 * verifying that the delegation pattern works correctly and that the
 * interface between the two modules is properly maintained.
 *
 * @author Ali Kahwaji
 * @since 2.2.3
 */

const { DAG } = require("../../src/dag/dag-engine.js");
const ExecutionScheduler = require("../../src/dag/core/execution-scheduler.js");

describe("DAG Engine and ExecutionScheduler Integration", () => {
  let dag;

  beforeEach(() => {
    dag = new DAG();
  });

  describe("Scheduler Initialization", () => {
    it("should initialize ExecutionScheduler in DAG constructor", () => {
      expect(dag.scheduler).toBeInstanceOf(ExecutionScheduler);
      expect(dag.scheduler.getSinkIds).toBeDefined();
      expect(typeof dag.scheduler.getSinkIds).toBe("function");
    });

    it("should use same getSinkIds function in both engine and scheduler", async () => {
      dag.addNode("A", async () => "A-result");
      dag.addNode("B", async () => "B-result");
      dag.addNode("C", async () => "C-result");

      dag.connect("A", "B");
      dag.connect("B", "C");

      const result = await dag.execute("seed");

      // If getSinkIds works correctly, C should be identified as sink
      expect(result).toBe("C-result");
    });
  });

  describe("Delegation Pattern", () => {
    it("should delegate scheduleExecution to scheduler", async () => {
      const scheduleSpy = jest.spyOn(dag.scheduler, "scheduleExecution");

      dag.addNode("A", async () => "result");

      await dag.execute("seed");

      expect(scheduleSpy).toHaveBeenCalled();
      expect(scheduleSpy).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          results: expect.any(Map),
          errors: expect.any(Map),
          fwd: expect.any(Map),
          seed: "seed",
        }),
      );
    });

    it("should delegate executeNode to scheduler", async () => {
      const executeSpy = jest.spyOn(dag.scheduler, "executeNode");

      dag.addNode("A", async () => "A-result");

      await dag.execute("seed");

      expect(executeSpy).toHaveBeenCalled();
      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: "A" }),
        expect.objectContaining({
          results: expect.any(Map),
          errors: expect.any(Map),
        }),
      );
    });

    it("should delegate canExecuteNode to scheduler", async () => {
      const canExecuteSpy = jest.spyOn(dag.scheduler, "canExecuteNode");

      dag.addNode("A", async () => "A-result");
      dag.addNode("B", async () => "B-result");

      dag.connect("A", "B");

      await dag.execute("seed");

      expect(canExecuteSpy).toHaveBeenCalled();
      // Should be called for nodeB to check if nodeA dependency is satisfied
      expect(canExecuteSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: "B" }),
        expect.any(Object),
      );
    });

    it("should delegate executeWithTimeout to scheduler", async () => {
      const timeoutSpy = jest.spyOn(dag.scheduler, "executeWithTimeout");

      dag.addNode("A", async () => "result");

      await dag.execute("seed", { timeout: 5000 });

      expect(timeoutSpy).toHaveBeenCalled();
      expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    });
  });

  describe("Context Propagation", () => {
    it("should propagate execution options from engine to scheduler", async () => {
      const executeSpy = jest.spyOn(dag.scheduler, "executeNode");

      dag.addNode("A", async () => "result");

      await dag.execute("initial-seed", {
        concurrency: 10,
        continueOnError: true,
        retryFailedNodes: true,
        maxRetries: 5,
        gracefulDegradation: true,
        requiredNodes: ["A"],
      });

      expect(executeSpy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          seed: "initial-seed",
          concurrency: 10,
          continueOnError: true,
          retryFailedNodes: true,
          maxRetries: 5,
          gracefulDegradation: true,
          requiredNodes: ["A"],
        }),
      );
    });

    it("should maintain results map consistency between engine and scheduler", async () => {
      dag.addNode("A", async () => "A-result");
      dag.addNode("B", async (input) => `B-${input}`);
      dag.addNode("C", async (inputs) => inputs.join("-"));

      dag.connect("A", "B");
      dag.connect("A", "C");
      dag.connect("B", "C");

      const result = await dag.execute("seed");

      // Verify results are properly maintained
      expect(result).toBe("A-result-B-A-result");
    });

    it("should maintain errors map consistency between engine and scheduler", async () => {
      dag.addNode(
        "A",
        async () => {
          throw new Error("A failed");
        },
        { optional: true },
      );

      dag.addNode("B", async () => "B-result");

      // With gracefulDegradation, execution should succeed despite A failing
      const result = await dag.execute("seed", { gracefulDegradation: true });

      // Result should be an object (because gracefulDegradation returns object)
      expect(typeof result).toBe("object");
      expect(result.B).toBe("B-result");
      // A should not be in results since it failed
      expect(result.A).toBeUndefined();
    });
  });

  describe("Error Propagation", () => {
    it("should propagate scheduler errors through engine", async () => {
      dag.addNode("A", async () => {
        throw new Error("Critical failure");
      });

      await expect(dag.execute("seed")).rejects.toThrow(
        "Node A execution failed: Critical failure",
      );
    });

    it("should propagate validation errors from scheduler", async () => {
      dag.addNode("A", null); // Invalid - no run function

      await expect(dag.execute("seed")).rejects.toThrow(
        "Node A has no run function",
      );
    });

    it("should handle scheduler timeout errors", async () => {
      dag.addNode("A", async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return "result";
      });

      await expect(dag.execute("seed", { timeout: 50 })).rejects.toThrow(
        "Execution timeout",
      );
    });
  });

  describe("Retry Logic Integration", () => {
    it("should pass global retry configuration from engine to scheduler", async () => {
      let attemptCount = 0;

      dag.addNode("A", async () => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error("Temporary failure");
        }
        return "success";
      });

      const result = await dag.execute("seed", {
        retryFailedNodes: true,
        maxRetries: 3,
      });

      // retryFailedNodes option causes execute() to return an object
      expect(typeof result).toBe("object");
      expect(result.A).toBe("success");
      expect(attemptCount).toBe(3);
    });

    it("should respect node-specific retry configuration", async () => {
      let attemptCount = 0;

      const nodeA = dag.addNode("A", async () => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error("First attempt fails");
        }
        return "success";
      });
      nodeA.retry = { retries: 2, delayMs: 10 };

      const result = await dag.execute("seed");

      expect(result).toBe("success");
      expect(attemptCount).toBe(2);
    });
  });

  describe("Concurrency Integration", () => {
    it("should enforce concurrency limits through scheduler", async () => {
      let concurrentExecutions = 0;
      let maxConcurrent = 0;

      const createNodeFn = () => async () => {
        concurrentExecutions++;
        maxConcurrent = Math.max(maxConcurrent, concurrentExecutions);
        await new Promise((resolve) => setTimeout(resolve, 50));
        concurrentExecutions--;
        return "result";
      };

      // Create 5 independent nodes
      dag.addNode("A", createNodeFn());
      dag.addNode("B", createNodeFn());
      dag.addNode("C", createNodeFn());
      dag.addNode("D", createNodeFn());
      dag.addNode("E", createNodeFn());

      await dag.execute("seed", { concurrency: 2 });

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe("Optional Node Handling Integration", () => {
    it("should handle optional node failures gracefully", async () => {
      dag.addNode("A", async () => "A-result");
      dag.addNode(
        "B",
        async () => {
          throw new Error("B failed");
        },
        { optional: true },
      );
      dag.addNode("C", async () => "C-result");

      const result = await dag.execute("seed");

      // With multiple sinks, returns an object
      expect(typeof result).toBe("object");
      expect(result.A).toBe("A-result");
      expect(result.C).toBe("C-result");
      // B failed and should not be in results
      expect(result.B).toBeUndefined();
    });

    it("should handle multiple sinks with optional failures", async () => {
      dag.addNode("A", async () => "A-result");
      dag.addNode(
        "B",
        async () => {
          throw new Error("B fails");
        },
        { optional: true },
      );
      dag.addNode("C", async () => "C-result");

      dag.connect("A", "B");
      dag.connect("A", "C");

      const result = await dag.execute("seed", {
        gracefulDegradation: true,
        requiredNodes: ["C"],
      });

      // gracefulDegradation returns an object
      expect(typeof result).toBe("object");
      expect(result.C).toBe("C-result");
      // B failed and should not be in results
      expect(result.B).toBeUndefined();
    });
  });

  describe("Graceful Degradation Integration", () => {
    it("should enable graceful degradation mode through engine options", async () => {
      dag.addNode("A", async () => "A-result");
      dag.addNode("B", async () => {
        throw new Error("B fails");
      });
      dag.addNode("C", async () => "C-result");

      dag.connect("A", "B");
      dag.connect("A", "C");

      const result = await dag.execute("seed", {
        gracefulDegradation: true,
        requiredNodes: ["C"],
      });

      // gracefulDegradation returns an object
      expect(typeof result).toBe("object");
      expect(result.C).toBe("C-result");
      // B should not be in results (failed non-required node)
      expect(result.B).toBeUndefined();
    });
  });

  describe("Performance and Metrics", () => {
    it("should maintain performance with scheduler delegation", async () => {
      // Create a moderately complex DAG
      dag.addNode("A", async () => "A");
      dag.addNode("B", async (input) => `${input}-B`);
      dag.addNode("C", async (input) => `${input}-C`);
      dag.addNode("D", async (inputs) => inputs.join("-"));

      dag.connect("A", "B");
      dag.connect("A", "C");
      dag.connect("B", "D");
      dag.connect("C", "D");

      const start = Date.now();
      const result = await dag.execute("seed");
      const duration = Date.now() - start;

      expect(result).toBe("A-B-A-C");
      expect(duration).toBeLessThan(1000); // Should complete quickly
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty DAG through scheduler", async () => {
      await expect(dag.execute("seed")).rejects.toThrow(
        "DAG is empty - no nodes to execute",
      );
    });

    it("should handle single node DAG", async () => {
      dag.addNode("A", async (input) => `processed-${input}`);

      const result = await dag.execute("data");
      expect(result).toBe("processed-data");
    });

    it("should handle DAG with no seed value", async () => {
      dag.addNode("A", async (input) => {
        // Should receive undefined as input
        expect(input).toBeUndefined();
        return "result";
      });

      const result = await dag.execute();
      expect(result).toBe("result");
    });
  });
});
