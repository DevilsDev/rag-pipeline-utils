const { ingestDocument } = require("../../src/ingest");

describe("ingest module", () => {
  describe("ingestDocument", () => {
    it("should export ingestDocument function", () => {
      expect(typeof ingestDocument).toBe("function");
    });

    it("should validate input parameters", () => {
      expect(() => ingestDocument()).toThrow("Document path is required");
      expect(() => ingestDocument("")).toThrow("Document path is required");
      expect(() => ingestDocument("test.txt")).toThrow(
        "Configuration is required",
      );
      expect(() => ingestDocument("test.txt", null)).toThrow(
        "Configuration is required",
      );
    });

    it("should accept valid parameters without throwing", () => {
      expect(() => ingestDocument("test.txt", { valid: true })).not.toThrow();
    });
  });
});
