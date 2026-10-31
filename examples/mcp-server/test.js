/**
 * Talks to server.js the way an MCP client does: starts it over stdio, lists
 * its tools and calls search_documents. Run `npm run ingest` first.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(here, "server.js")],
  stderr: "pipe",
});
const client = new Client({ name: "rag-mcp-server-test", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
assert.deepEqual(
  tools.map((t) => t.name),
  ["search_documents"],
);
assert.ok(tools[0].inputSchema.properties.query, "query is in the schema");

const result = await client.callTool({
  name: "search_documents",
  arguments: { query: "How many vacation days do I get?", topK: 2 },
});
assert.notEqual(result.isError, true, result.content[0].text);
const text = result.content[0].text;
assert.match(text, /^\[1\] docs\/vacation\.md/, text);
assert.match(text, /twenty days of paid vacation/);

const bad = await client
  .callTool({ name: "search_documents", arguments: { query: "" } })
  .catch((error) => ({ isError: true, content: [{ text: error.message }] }));
assert.equal(bad.isError, true, "an empty query is rejected");

await client.close();
console.log("ok: search_documents returned docs/vacation.md first");
