/**
 * StructuredLogger meta handling: console-style string/Error extras must not
 * be spread into one key per character.
 */

const { StructuredLogger } = require("../../../src/utils/logger");

function createCapturingLogger() {
  const calls = [];
  const base = {};
  for (const level of ["info", "warn", "error", "debug"]) {
    base[level] = (data, message) => calls.push({ level, data, message });
  }
  return { logger: new StructuredLogger(base), calls };
}

describe("StructuredLogger meta handling", () => {
  test("string meta is logged under detail", () => {
    const { logger, calls } = createCapturingLogger();

    logger.error("Query processing failed:", "connection refused");

    expect(calls[0].message).toBe("Query processing failed:");
    expect(calls[0].data.detail).toBe("connection refused");
    expect(calls[0].data).not.toHaveProperty("0");
  });

  test("Error meta is logged with message and stack", () => {
    const { logger, calls } = createCapturingLogger();

    logger.warn("Flush failed", new Error("disk full"));

    expect(calls[0].data.error).toBe("disk full");
    expect(calls[0].data.stack).toContain("disk full");
  });

  test("object meta is merged as before", () => {
    const { logger, calls } = createCapturingLogger();

    logger.info("Started", { port: 3000 });

    expect(calls[0].data.port).toBe(3000);
    expect(calls[0].data.correlationId).toBeDefined();
  });
});
