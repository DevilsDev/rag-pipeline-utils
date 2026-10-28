# CLI Reference

The `rag-pipeline` command builds a local index from your documents and answers questions against it, using the pipeline described in `.ragrc.json`. Everything below matches `rag-pipeline <command> --help`.

---

## Installation

```bash
# Global
npm install -g @devilsdev/rag-pipeline-utils
rag-pipeline --version

# Or per project
npm install --save-dev @devilsdev/rag-pipeline-utils
npx rag-pipeline --help
```

Requires Node.js 18 or newer.

---

## Quick start

```bash
rag-pipeline init                      # writes .ragrc.json (offline "local" template)
rag-pipeline ingest ./docs             # index .md, .html, .csv and .txt files
rag-pipeline query "How many vacation days do employees get?"
```

With the default `local` template there is no language model, so `query` prints the best-matching passages. Use `--template openai`, `ollama` or `anthropic` (or edit the config) to generate answers.

---

## Configuration (`.ragrc.json`)

`init` writes a file like this:

```json
{
  "namespace": "default",
  "pipeline": [
    { "stage": "loader", "name": "auto" },
    { "stage": "embedder", "name": "local" },
    {
      "stage": "retriever",
      "name": "file-store",
      "config": { "path": ".rag/index.json" }
    },
    { "stage": "llm", "name": "openai", "config": { "model": "gpt-4o-mini" } }
  ]
}
```

Each pipeline entry is `{ "stage", "name", "config"? }`. `config` is passed to the component's constructor. Names resolve in this order:

1. **Built-in components** (`rag-pipeline info --plugins` lists them):

   | Stage     | Names                                 | Notes                                                                |
   | --------- | ------------------------------------- | -------------------------------------------------------------------- |
   | loader    | `auto`                                | Picks a loader per file extension                                    |
   | embedder  | `local`, `openai`, `ollama`, `cohere` | `local` is TF-IDF, offline                                           |
   | retriever | `file-store`, `memory`                | `file-store` persists to `config.path` (relative to the config file) |
   | llm       | `openai`, `anthropic`, `ollama`       | Optional                                                             |
   | reranker  | `scoring`                             | Optional                                                             |

2. **Custom plugins** declared under `plugins`, as module paths relative to the config file. The module may export a class (constructed with the entry's `config`) or an object:

   ```json
   {
     "pipeline": [{ "stage": "llm", "name": "my-llm" }],
     "plugins": { "llm": { "my-llm": "./plugins/my-llm.js" } }
   }
   ```

3. Plugins registered programmatically on `pluginRegistry`.

API keys come from the environment: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `COHERE_API_KEY` (or `config.apiKey`).

---

## Global options

| Option            | Description                                                                          |
| ----------------- | ------------------------------------------------------------------------------------ |
| `--config <path>` | Config file (default `.ragrc.json`). Relative paths in it resolve from its directory |
| `--verbose`       | Extra output (e.g. the files `ingest` read)                                          |
| `--no-color`      | Disable colored output                                                               |
| `--dry-run`       | Show what `init`, `ingest`, `query` or `run` would do without doing it               |
| `-v, --version`   | Print the version                                                                    |

Commands exit with status `1` on failure and print the error on stderr.

---

## `init`

Create `.ragrc.json`. In a terminal, `init` runs a setup wizard; with `--no-interactive` (or when stdin is not a terminal) it writes the `--template` pipeline as-is. In the wizard `--template` only pre-selects the embedder and language model.

The wizard steps:

1. **Embedder**: `local` (TF-IDF, offline), `openai`, `ollama`, `cohere`, or a custom plugin. Provider options are pre-filled with the connector defaults: `embeddingModel` for OpenAI/Cohere, and `baseURL` + `embeddingModel` for Ollama.
2. **Language model**: none (`query` prints the retrieved passages), `openai`, `anthropic` or `ollama` (`model`, plus `baseURL` for Ollama), or a custom plugin.
3. **Retriever**: `file-store` with an index path (default `.rag/index.json`, relative to the config file), `memory`, or a custom plugin. `memory` does not persist between CLI commands, so documents from `ingest` are gone by the time `query` runs.
4. **Reranker** (optional): none, `scoring` (BM25, offline) or a custom plugin.
5. **Custom plugins**: enter a path to a `.js` module (relative to the current directory). The wizard loads it the same way the pipeline will (a class, factory function or object, optionally as `default`) and checks the stage's method. Embedders need `embed()` or `embedQuery()`, LLMs `generate()`, retrievers `retrieve()` and rerankers `rerank()`. If the check fails, the wizard asks again; enter an empty path to go back. It warns when an embedder has no `embed()` or a retriever has no `store()`, because `ingest` needs them. The path is saved under `plugins.<stage>.<name>`, relative to the config file. The name comes from the file name and is renamed if it clashes with a built-in.
6. **Environment check**: for each chosen provider, the wizard reports whether `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `COHERE_API_KEY` is set, and shows the Ollama URL in use. Keys are never asked for and never written to the file. Export them in your shell instead.
7. **Connection test** (optional, default no): makes one real call to the embedder (`embedQuery("test")`) and the LLM (`generate("Say OK")`), each with a 15 s timeout, and reports pass or fail. A failure does not stop you from saving.
8. **Preview**: prints the JSON and asks for confirmation before writing. If the output file already exists, the wizard asks before replacing it, unless you passed `--force`.

```bash
rag-pipeline init
rag-pipeline init --no-interactive --template openai
rag-pipeline init --output config/rag.json --force
```

| Option              | Description                                        |
| ------------------- | -------------------------------------------------- |
| `--template <name>` | `local` (default), `openai`, `ollama`, `anthropic` |
| `--no-interactive`  | Don't run the wizard; write the template           |
| `--output <path>`   | Output file (default `.ragrc.json`)                |
| `--force`           | Overwrite an existing file without asking          |

---

## `ingest`

Load a file or a directory (recursively), split it into chunks, embed them and store them in the configured retriever.

```bash
rag-pipeline ingest ./docs
rag-pipeline ingest handbook.md
rag-pipeline ingest ./docs --rebuild
```

- Supported files: `.md`, `.markdown`, `.html`, `.htm`, `.csv`, `.txt`.
- Chunks are stored as `<source path>#<chunk number>`; ingesting a file again replaces its previous chunks.
- The index records which embedder built it. Changing the embedder requires `--rebuild`, which discards the index first.

| Option      | Description                                 |
| ----------- | ------------------------------------------- |
| `--rebuild` | Discard the existing index before ingesting |

**Scale.** `file-store` is a single JSON file loaded into memory and searched linearly, meant for local use up to tens of thousands of chunks. As a reference point, 300 files (about 3,000 chunks) with the `local` embedder index in about 3 seconds and produce a 5 MB index. The `local` embedder is fitted to the whole corpus, so every `ingest` re-embeds everything already in the index.

---

## `query`

Answer a question from the index. With an `llm` stage it prints the answer followed by its sources; without one it prints the matching passages.

```bash
rag-pipeline query "What is the remote work policy?"
rag-pipeline query "remote work" --top-k 5 --json
```

| Option        | Description                                    |
| ------------- | ---------------------------------------------- |
| `--top-k <n>` | Passages to retrieve (default 3)               |
| `--json`      | Print `{ answer, results, citations }` as JSON |

---

## `run`

`ingest` and/or `query` in one command.

```bash
rag-pipeline run --ingest ./docs --query "What changed in 2026?"
```

Options: `--ingest <path>`, `--query <text>`, `--rebuild`, `--top-k <n>`, `--json`.

---

## `serve`

Start a local HTTP API over the configured pipeline.

```bash
rag-pipeline serve --port 3000
curl -s localhost:3000/health
curl -s -X POST localhost:3000/query \
  -H 'content-type: application/json' \
  -d '{"question": "How many vacation days?", "topK": 3}'
```

| Endpoint      | Body                      | Response                               |
| ------------- | ------------------------- | -------------------------------------- |
| `GET /health` | –                         | `{ "status": "ok", "uptime": <ms> }`   |
| `POST /query` | `{ "question", "topK"? }` | `{ "answer", "results", "citations" }` |

It is meant for local development: it binds to `127.0.0.1` by default, accepts JSON bodies up to 64 KB, sends no CORS headers and has no authentication. While bound to loopback it only answers requests addressed to `127.0.0.1`, `localhost` or `[::1]`, which blocks DNS-rebinding attacks from web pages. Binding another `--host` prints a warning. The config is re-read on every request, and custom plugin modules are reloaded when they change.

| Option          | Description                               |
| --------------- | ----------------------------------------- |
| `--port <n>`    | Port (default 3000; `0` picks a free one) |
| `--host <host>` | Interface to bind (default `127.0.0.1`)   |

---

## `validate`

Check the config against the schema and resolve every pipeline component. Exits `1` on errors.

```bash
rag-pipeline validate
rag-pipeline --config config/rag.json validate
```

---

## `doctor`

Run diagnostics and print each issue with a suggested fix. Exits `1` if any error is found.

```bash
rag-pipeline doctor
rag-pipeline doctor --category configuration environment
rag-pipeline doctor --report doctor.json
```

Categories:

- `configuration`: the file exists, parses and validates; required stages are present; every component resolves.
- `plugins`: each module under `plugins` exists and loads.
- `environment`: API keys for the configured providers, `${VAR}` references, whether the index has been built.
- `dependencies`: Node.js version and the current project's npm dependencies.
- `performance`, `security`: memory use, config size, hard-coded keys, file permissions.

| Option                       | Description                                                          |
| ---------------------------- | -------------------------------------------------------------------- |
| `--category <categories...>` | Only run these categories                                            |
| `--auto-fix`                 | Run `npm install` / tighten config file permissions where applicable |
| `--report <path>`            | Also write the report as JSON                                        |

---

## `config`

```bash
rag-pipeline config show                      # whole config as JSON
rag-pipeline config show --section pipeline
rag-pipeline config get metadata.name
rag-pipeline config set metadata.description "Support docs index"
```

---

## `info`

```bash
rag-pipeline info             # system, configuration and components
rag-pipeline info --plugins   # built-in components and custom plugins
rag-pipeline info --system
rag-pipeline info --config
```

---

## `hub` (alias `plugin`)

Talk to a plugin registry. There is no public registry: pass `--registry <url>` or set `RAG_PLUGIN_REGISTRY`; without one these commands exit `1`.

```bash
rag-pipeline hub --registry https://registry.example.com search markdown
export RAG_PLUGIN_REGISTRY=https://registry.example.com
rag-pipeline hub info markdown-pro
rag-pipeline hub certify requirements        # works offline
```

Subcommands: `search`, `info`, `list`, `publish`, `rate`, `reviews`, `trending`, `certify submit|verify|requirements`, `publisher status|apply`.

`hub install` is currently disabled: it does not yet verify or install plugin code safely. Add plugins to your project and reference them under `plugins` in `.ragrc.json` instead.

---

## `completion`

```bash
rag-pipeline completion bash >> ~/.bashrc
rag-pipeline completion zsh  > "${fpath[1]}/_rag-pipeline"
rag-pipeline completion fish > ~/.config/fish/completions/rag-pipeline.fish
```

---

Next → [Evaluation](./Evaluation.md)
