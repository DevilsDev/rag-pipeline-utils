# MCP server: search your documents from Claude

An [MCP](https://modelcontextprotocol.io) server that gives Claude, or any other MCP client, one tool: `search_documents`. It searches the index that `rag-pipeline ingest` builds and returns the most relevant passages with their source files, so the assistant can answer from your documents and cite them.

The assistant is the language model, so the server needs no LLM and no API key. It runs offline with the built-in TF-IDF embedder.

## Run it

Requires Node.js 22 or later.

```bash
npm install
npm run ingest   # writes .ragrc.json and indexes ./docs into .rag/index.json
npm test         # starts the server over stdio and calls search_documents
```

Put your own Markdown, HTML, CSV or text files in `docs/` (or pass another directory to `rag-pipeline ingest`) and run `npm run ingest` again.

## Connect a client

The server speaks MCP over stdio, so the client starts it. Use the absolute path to `server.js`.

**Claude Code:**

```bash
claude mcp add rag-docs -- node /absolute/path/to/examples/mcp-server/server.js
```

**Claude Desktop:** add it to `claude_desktop_config.json` (Settings → Developer → Edit Config) and restart Claude Desktop:

```json
{
  "mcpServers": {
    "rag-docs": {
      "command": "node",
      "args": ["/absolute/path/to/examples/mcp-server/server.js"]
    }
  }
}
```

Then ask something your documents answer, such as "How many vacation days do employees get?". The assistant calls `search_documents` and answers from the passages it returns.

## The tool

| Input   | Type             | Description                                    |
| ------- | ---------------- | ---------------------------------------------- |
| `query` | string, required | What to look for, in natural language          |
| `topK`  | integer, 1–20    | Passages to return (default 4, or `RAG_TOP_K`) |

It returns the passages as text, numbered, each with its source file and score:

```
[1] docs/vacation.md (score 0.612)
Full-time employees receive twenty days of paid vacation per year. ...
```

The tool is marked read-only. A missing index or a failed search comes back as a tool error that tells the assistant what to do, for example to run `npm run ingest`.

## Configure

| Variable    | Default                               | Meaning                                     |
| ----------- | ------------------------------------- | ------------------------------------------- |
| `RAG_INDEX` | `.rag/index.json` next to `server.js` | The index to search                         |
| `RAG_TOP_K` | `4`                                   | Passages per search when `topK` isn't given |

`server.js` reads indexes built with the local embedder, the `rag-pipeline init` default. To use another embedder, such as `OpenAIConnector` or `OllamaConnector`, construct it in `openIndex()` the same way your `.ragrc.json` configures it, and ingest with that configuration. To search PostgreSQL or Qdrant instead of the file index, swap `FileVectorStore` for `PgVectorRetriever` or `QdrantRetriever`.

## How it works

`server.js` registers the tool with the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) (`McpServer` and `StdioServerTransport`) and answers each call with a retrieval-only `createRagPipeline()` run, so you get the library's ranking, reranking and caching options. stdout carries the protocol, so the server only logs to stderr.
