/**
 * Version: 1.0.0
 * Description: Verifies that plugin mock implementations expose required methods
 * Author: Ali Kahwaji
 */

const fs = require("fs");
const path = require("path");

const { readdirSync, statSync } = fs;
const { resolve, join, extname } = path;

const MOCKS_DIR = resolve("__tests__/fixtures/src/mocks");

const pluginContracts = {
  "openai-embedder.js": ["embed", "embedQuery"],
  "openai-llm.js": ["ask"],
  "pdf-loader.js": ["load"],
  "pinecone-retriever.js": ["store", "search"],
};

async function verifyMocks() {
  const failures = [];

  for (const file of readdirSync(MOCKS_DIR)) {
    const fullPath = join(MOCKS_DIR, file);
    const isFile = statSync(fullPath).isFile();
    if (!isFile || extname(file) !== ".js") continue;

    const expectedMethods = pluginContracts[file];
    if (!expectedMethods) continue;

    const mod = require(fullPath);
    const PluginClass = mod.default || mod;
    const plugin = new PluginClass();

    for (const method of expectedMethods) {
      if (typeof plugin[method] !== "function") {
        failures.push(`❌ ${file} failed: [${file}] missing method: ${method}`);
      }
    }
  }

  if (failures.length > 0) {
    failures.forEach((msg) => console.error(msg));
    // eslint-disable-line no-console
    process.exit(1);
  } else {
    console.log("✅ All plugin mocks verified.");
    // eslint-disable-line no-console
  }
}

verifyMocks();
