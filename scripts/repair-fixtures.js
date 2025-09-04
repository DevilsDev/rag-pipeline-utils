/**
const fs = require('fs');
const path = require('path');
 * Version: 1.0.0
 * Description: Auto-repairs mock plugin fixtures for integration tests
 * Author: Ali Kahwaji
 */

import { mkdirSync, copyFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const MOCKS = [
  "pdf-loader.js",
  "openai-embedder.js",
  "pinecone-retriever.js",
  "openai-llm.js",
];

const SRC_FIXTURES = resolve("__tests__/fixtures/src/mocks");
const DEST_FIXTURES = resolve(
  "__tests__/__temp__/cli-_config-fallback/src/mocks",
);

mkdirSync(DEST_FIXTURES, { recursive: true });

MOCKS.forEach((file) => {
  const src = join(SRC_FIXTURES, file);
  const dest = join(DEST_FIXTURES, file);
  if (!existsSync(src)) throw new Error(`[FIXTURE MISSING] ${src}`);
  copyFileSync(src, dest);
  console.log(`[COPIED] ${file}`);
  // eslint-disable-line no-console
});

console.log("✅ Fixture mocks successfully repaired.");
// eslint-disable-line no-console
