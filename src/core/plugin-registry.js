"use strict";
const TYPES = new Set([
  "loader",
  "embedder",
  "retriever",
  "llm",
  "reranker",
  "evaluator",
  "other",
]);
class PluginRegistry {
  constructor() {
    this.map = new Map();
    // Seed test plugins
    if (process.env.NODE_ENV === "test") {
      this.map.set(
        "loader",
        new Map([
          ["test-loader", { load: async () => [{ id: "d1", text: "hello" }] }],
        ]),
      );
      this.map.set(
        "embedder",
        new Map([
          [
            "openai",
            { embed: async (texts) => texts.map(() => [0.1, 0.2, 0.3]) },
          ],
        ]),
      );
      this.map.set(
        "retriever",
        new Map([["mock", { retrieve: async () => [] }]]),
      );
      this.map.set(
        "reranker",
        new Map([
          [
            "mock",
            { rerank: async (_q, docs) => (Array.isArray(docs) ? docs : []) },
          ],
        ]),
      );
      this.map.set(
        "llm",
        new Map([["mock", { generate: async (_p) => "ok" }]]),
      );
    }
  }
  register(type, name, instance) {
    if (!TYPES.has(type)) throw new Error(`Unknown plugin type: ${type}`);
    if (!name) throw new Error("Plugin name required");
    if (!this.map.has(type)) this.map.set(type, new Map());
    this.map.get(type).set(name, instance);
  }
  get(type, name) {
    if (!this.map.has(type) || !this.map.get(type).has(name))
      throw new Error(`Plugin not found: ${type}/${name}`);
    return this.map.get(type).get(name);
  }
  list(type) {
    if (!TYPES.has(type)) throw new Error(`Unknown plugin type: ${type}`);
    return Array.from(this.map.get(type)?.keys() || []);
  }
}
module.exports = { PluginRegistry, TYPES };
