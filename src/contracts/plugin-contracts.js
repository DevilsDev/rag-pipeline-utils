/**
 * Plugin Contract Definitions
 * Minimal fixture for test compatibility
 */

const pluginContracts = {
  loader: {
    name: "loader",
    version: "1.0.0",
    methods: ["load"],
    description: "Document loader contract",
  },
  embedder: {
    name: "embedder",
    version: "1.0.0",
    methods: ["embed", "embedQuery"],
    description: "Text embedder contract",
  },
  retriever: {
    name: "retriever",
    version: "1.0.0",
    methods: ["store", "retrieve"],
    description: "Vector retriever contract",
  },
  llm: {
    name: "llm",
    version: "1.0.0",
    methods: ["generate"],
    description: "Language model contract",
  },
};

module.exports = { pluginContracts };
