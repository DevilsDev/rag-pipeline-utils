# @devilsdev/rag-mcp-server

An [MCP](https://modelcontextprotocol.io) server for your documents. Point it at a folder and Claude, or any other MCP client, can search the documents and check answers against them:

```bash
npx @devilsdev/rag-mcp-server ./docs
```

It indexes the folder when it starts, with the offline TF-IDF embedder and an in-memory retriever from [@devilsdev/rag-pipeline-utils](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils). It needs no API key, no database and no network. The assistant is the language model, so the server never calls one.

Requires Node.js 22 or later.

## Connect a client

The server speaks MCP over stdio, so the client starts it. Use an absolute path to your folder.

**Claude Code:**

```bash
claude mcp add docs -- npx -y @devilsdev/rag-mcp-server /absolute/path/to/docs
```

**Claude Desktop, Cursor and other clients** that use an `mcpServers` config (for Claude Desktop: Settings → Developer → Edit Config, then restart):

```json
{
  "mcpServers": {
    "docs": {
      "command": "npx",
      "args": ["-y", "@devilsdev/rag-mcp-server", "/absolute/path/to/docs"]
    }
  }
}
```

Then ask something your documents answer, such as "How many vacation days do employees get?".

## Tools

### `search_documents`

| Input   | Type             | Description                                                                                  |
| ------- | ---------------- | -------------------------------------------------------------------------------------------- |
| `query` | string, required | What to look for, in natural language (at most 10,000 characters, or `--max-question-chars`) |
| `topK`  | integer, 1–20    | Passages to return (default 4, or `--top-k`)                                                 |

Returns `{ passages: [{ id, source, score, text }] }`, best first, as structured content and as JSON text. `source` is the file relative to the folder and `id` is `<source>#<chunk number>`. Passages that share no terms with the query are left out.

### `check_answer`

| Input      | Type                               | Description                                                                                                   |
| ---------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `answer`   | string, required                   | The answer to check (at most 50,000 characters)                                                               |
| `question` | string                             | The question it answers; improves retrieval when `sources` is omitted (at most 10,000 characters)             |
| `sources`  | array of strings or `{ id, text }` | Passages to check against, at most 100, each at most 200,000 characters; omit to search the indexed documents |
| `topK`     | integer, 1–20                      | Passages to retrieve when `sources` is omitted                                                                |

Runs the library's [`checkAnswer`](https://devilsdev.github.io/rag-pipeline-utils/docs/Integrations) and returns `{ grounded, groundedness, unsupported, citations, sources }`: whether every sentence is supported, the share of supported sentences (0 to 1), the unsupported sentences, the ids of the sources supporting each sentence, and the sources that were checked. The check is lexical and makes no model calls, so a correct paraphrase can come back unsupported; treat it as a flag to look again, not a verdict.

Both tools are read-only. Passage text is content from your files, and the tool descriptions tell the client to treat it as data, not instructions. A file can still contain text written to manipulate an assistant, so index folders you trust.

## Files

Markdown (`.md`, `.markdown`), HTML (`.html`, `.htm`, visible text only), CSV (`.csv`, one passage per row) and text (`.txt`) files, in the folder and its subfolders, handled the way the library's loaders handle them; prose is split into sentence chunks of up to 500 characters. Other files, `node_modules` and `.git` are skipped. The index lives in memory and is rebuilt each time the server starts, so restart the client's server after changing the documents.

## Options

```bash
rag-mcp-server <folder> [--top-k <n>] [--embedder local] [--max-answer-chars <n>]
               [--max-source-chars <n>] [--max-question-chars <n>] [--max-sources <n>]
               [--max-clause-pairs <n>] [--max-sentence-source-chars <n>] [--check-timeout-ms <n>]
               [--max-concurrent-checks <n>]
```

| Option                            | Default   | Meaning                                                                                                     |
| --------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `--top-k <n>`                     | `4`       | Passages per call when the client doesn't pass `topK`                                                       |
| `--embedder <name>`               | `local`   | The embedder; `local` (TF-IDF, offline) is the only one                                                     |
| `--max-answer-chars <n>`          | `50000`   | Longest `answer` `check_answer` accepts (env `RAG_MCP_MAX_ANSWER_CHARS`)                                    |
| `--max-source-chars <n>`          | `200000`  | Longest source passage `check_answer` accepts (env `RAG_MCP_MAX_SOURCE_CHARS`)                              |
| `--max-question-chars <n>`        | `10000`   | Longest `question` or `query` (env `RAG_MCP_MAX_QUESTION_CHARS`)                                            |
| `--max-sources <n>`               | `100`     | Most `sources` per `check_answer` call (env `RAG_MCP_MAX_SOURCES`)                                          |
| `--max-clause-pairs <n>`          | `2000000` | Most answer words × source clauses `check_answer` compares (env `RAG_MCP_MAX_CLAUSE_PAIRS`)                 |
| `--max-sentence-source-chars <n>` | `3000000` | Most answer sentences × source characters `check_answer` compares (env `RAG_MCP_MAX_SENTENCE_SOURCE_CHARS`) |
| `--check-timeout-ms <n>`          | `10000`   | Longest a `check_answer` check may run before it is stopped (env `RAG_MCP_CHECK_TIMEOUT_MS`)                |
| `--max-concurrent-checks <n>`     | `2`       | Most `check_answer` checks run at once; up to 8 more wait (env `RAG_MCP_MAX_CONCURRENT_CHECKS`)             |

A tool call over a limit is rejected with an error that names the flag to raise it. A flag wins over its environment variable; each must be a whole number of at least 1. When you build the server in code, `createServer(index, { maxAnswerChars, maxSourceChars, maxQuestionChars, maxSources, maxClausePairs, maxSentenceSourceChars, checkTimeoutMs, maxConcurrentChecks })` takes the same limits. `maxClausePairs` and `maxSentenceSourceChars` refuse input that would take long to check before checking it. Every check also runs in a worker thread, with at most 512 MB of heap, and is stopped when it runs past `checkTimeoutMs`; the server keeps answering other calls meanwhile. At most `maxConcurrentChecks` checks run at once; up to 8 more wait, and time spent waiting doesn't count toward `checkTimeoutMs`. A call beyond that is refused with "Too many check_answer calls waiting; try again shortly."

Everything the server logs goes to stderr; stdout carries the protocol.

## Build your own

For other embedders (OpenAI, Ollama), a persistent index or a vector database, start from the [MCP server example](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples/mcp-server), which builds the same kind of server from the library in about 100 lines.

Documentation: https://devilsdev.github.io/rag-pipeline-utils/
