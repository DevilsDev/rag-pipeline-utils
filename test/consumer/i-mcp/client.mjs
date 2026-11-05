// Journey I: @devilsdev/rag-mcp-server, started the way the Integrations
// docs configure MCP clients (`npx -y @devilsdev/rag-mcp-server
// /absolute/path/to/docs` over stdio), and called with the MCP SDK client.
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const docsDir = path.resolve("docs");
const out = { attempts: [] };

async function connect(command, args) {
  const transport = new StdioClientTransport({ command, args, stderr: "pipe" });
  const client = new Client({ name: "consumer-journey", version: "1.0.0" });
  const timer = setTimeout(() => transport.close(), 60000);
  try {
    await client.connect(transport);
    return client;
  } finally {
    clearTimeout(timer);
  }
}

let client;
// 1. Exactly the documented command
try {
  client = await connect("npx", ["-y", "@devilsdev/rag-mcp-server", docsDir]);
  out.attempts.push({ command: "npx", ok: true });
} catch (e) {
  out.attempts.push({
    command: "npx",
    ok: false,
    error: String(e && e.message).slice(0, 300),
  });
}
// 2. Windows needs the .cmd shim for npx
if (!client && process.platform === "win32") {
  try {
    client = await connect("npx.cmd", [
      "-y",
      "@devilsdev/rag-mcp-server",
      docsDir,
    ]);
    out.attempts.push({ command: "npx.cmd", ok: true });
  } catch (e) {
    out.attempts.push({
      command: "npx.cmd",
      ok: false,
      error: String(e && e.message).slice(0, 300),
    });
  }
}
// 3. The installed bin, run by node
if (!client) {
  const bin = path.resolve(
    "node_modules/@devilsdev/rag-mcp-server/bin/rag-mcp-server.js",
  );
  client = await connect(process.execPath, [bin, docsDir]);
  out.attempts.push({ command: "node bin", ok: true });
}

const { tools } = await client.listTools();
out.tools = tools.map((t) => t.name);

const parse = (res) => {
  if (res.structuredContent) return res.structuredContent;
  const text = (res.content || []).find((c) => c.type === "text")?.text;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
};

const search = await client.callTool({
  name: "search_documents",
  arguments: { query: "How many vacation days do employees get?", topK: 2 },
});
const found = parse(search);
out.search = {
  isError: !!search.isError,
  passages: (found.passages || []).map((p) => ({
    source: p.source,
    score: p.score,
  })),
};

const good = await client.callTool({
  name: "check_answer",
  arguments: {
    question: "How many vacation days do employees get?",
    answer:
      "Full-time employees receive twenty days of paid vacation per year.",
  },
});
const bad = await client.callTool({
  name: "check_answer",
  arguments: {
    answer:
      "Full-time employees receive thirty days of paid vacation per year.",
    sources: [
      "Full-time employees receive twenty days of paid vacation per year.",
    ],
  },
});
out.checkGood = { isError: !!good.isError, grounded: parse(good).grounded };
out.checkBad = {
  isError: !!bad.isError,
  grounded: parse(bad).grounded,
  unsupported: (parse(bad).unsupported || []).length,
};

await client.close();
console.log("RESULT " + JSON.stringify(out));
process.exit(0);
