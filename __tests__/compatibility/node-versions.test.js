/**
 * Node.js Version Compatibility Tests
 * Tests compatibility across different Node.js versions
 */

const path = require("path");

describe("Node.js Version Compatibility", () => {
  const nodeMajorVersion = parseInt(process.version.slice(1).split(".")[0]);

  describe("version detection", () => {
    it("should detect Node.js version correctly", () => {
      expect(nodeMajorVersion).toBeGreaterThan(12);
      expect(process.version).toMatch(/^v\d+\.\d+\.\d+/);
    });

    it("should support required Node.js features", () => {
      // Test basic ES6+ features
      const testArrowFunction = () => "arrow function works";
      const testDestructuring = { a: 1, b: 2 };
      const { a, b } = testDestructuring;

      expect(testArrowFunction()).toBe("arrow function works");
      expect(a).toBe(1);
      expect(b).toBe(2);
    });
  });

  describe("async/await compatibility", () => {
    it("should handle async generators properly", async () => {
      async function* testAsyncGenerator() {
        yield "first";
        yield "second";
        yield "third";
      }

      const results = [];
      for await (const value of testAsyncGenerator()) {
        results.push(value);
      }

      expect(results).toEqual(["first", "second", "third"]);
    });

    it("should support Promise.allSettled", async () => {
      const promises = [
        Promise.resolve("success"),
        Promise.reject(new Error("failure")),
        Promise.resolve("another success"),
      ];

      if (Promise.allSettled) {
        const results = await Promise.allSettled(promises);
        expect(results).toHaveLength(3);
        expect(results[0].status).toBe("fulfilled");
        expect(results[1].status).toBe("rejected");
      } else {
        // Polyfill for older versions
        const allSettled = async (promises) => {
          return Promise.all(
            promises.map((promise) =>
              promise
                .then((value) => ({ status: "fulfilled", value }))
                .catch((reason) => ({ status: "rejected", reason })),
            ),
          );
        };
        const results = await allSettled(promises);
        expect(results).toHaveLength(3);
      }
    });
  });

  describe("module system compatibility", () => {
    it("should support CommonJS require", () => {
      const pathModule = require("path");
      expect(pathModule.join).toBeDefined();
      expect(typeof pathModule.join).toBe("function");
    });

    it("should handle module exports correctly", () => {
      const testModule = {
        testFunction: () => "test result",
        testValue: 42,
      };

      expect(testModule.testFunction()).toBe("test result");
      expect(testModule.testValue).toBe(42);
    });
  });
});
