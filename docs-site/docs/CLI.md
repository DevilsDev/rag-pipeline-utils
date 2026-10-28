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

Create `.ragrc.json`. In a terminal it asks for the embedder, language model and index path; with `--no-interactive` (or when not attached to a terminal) it writes the template as-is.

```bash
rag-pipeline init
rag-pipeline init --no-interactive --template openai
rag-pipeline init --output config/rag.json --force
```

| Option              | Description                                        |
| ------------------- | -------------------------------------------------- |
| `--template <name>` | `local` (default), `openai`, `ollama`, `anthropic` |
| `--no-interactive`  | Don't prompt                                       |
| `--output <path>`   | Output file (default `.ragrc.json`)                |
| `--force`           | Overwrite an existing file                         |

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

## `ai`

Tools that work on your configured pipeline and index. Every number they print is computed from your data. Failures exit `1` with the reason on stderr.

### `ai train embedding [path]`

Refits the built-in `local` (TF-IDF) embedder and re-embeds every indexed chunk with the new model, so later queries use it.

```bash
rag-pipeline ai train embedding          # fit on the indexed chunks
rag-pipeline ai train embedding ./corpus # fit on these documents instead
```

- Prints the number of training chunks, the vocabulary size (and the previous size) and how many chunks were re-embedded.
- With `[path]`, the documents are only used for training. They are not added to the index. Indexed chunks that share no term with the new vocabulary can no longer be retrieved, and the command prints a warning with their count.
- The next `ingest` refits the embedder on the whole indexed corpus, which replaces a `[path]` fit.
- Only the `local` embedder can be trained. With `openai`, `ollama`, `cohere` or a custom embedder the command exits `1`, because those use fixed pre-trained models. It also needs a `file-store` index that is not empty.

### `ai benchmark`

Times real queries against the configured pipeline and index.

```bash
rag-pipeline ai benchmark                          # up to 5 queries sampled from the index, 3 runs
rag-pipeline ai benchmark --queries queries.txt --runs 10 --top-k 5
rag-pipeline ai benchmark --json
```

| Option             | Default | Meaning                                                                                                                   |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `--queries <file>` | sampled | One query per line, or a JSON array of strings. Without a file, the first 8 words of the first 5 indexed chunks are used. |
| `--runs <n>`       | `3`     | Passes over the query set                                                                                                 |
| `--top-k <n>`      | `3`     | Passages to retrieve                                                                                                      |
| `--json`           |         | Print every measurement as JSON                                                                                           |

- Reports the number of samples, p50, p95, mean and max latency for each stage: query embedding, retrieval, reranking (only when a reranker is configured) and end-to-end `query`.
- Percentiles use the nearest-rank method, so each value is an observed sample.
- The time to load the config and index, and the first (warm-up) query, are reported separately and are not included in the statistics.
- If an `llm` stage is configured, end-to-end includes answer generation, so every run makes real provider calls.
- Also prints the results returned per query and the environment: Node version, platform, indexed chunk count, embedder and dimensions, retriever, reranker and llm.

### `ai feedback` and `ai search`

Record which chunks were good or bad answers to a question, then search with those votes applied.

```bash
rag-pipeline ai search "paid vacation days"     # shows chunk ids such as docs/vacation.md#0
rag-pipeline ai feedback "paid vacation days" docs/leave.txt#0 --rating up
rag-pipeline ai feedback "paid vacation days" docs/vacation.md#0 --rating down
rag-pipeline ai search "paid vacation days" --top-k 5 --json
```

- `ai feedback <question> <docId> --rating <up|down>` checks that the chunk id exists in the index. It then appends the vote to `feedback.json` in the same directory as the `file-store` index (by default `.rag/feedback.json`). A corrupt feedback file is reported as an error and is never overwritten.
- `ai search` is retrieval only. It does not call the `llm`, and the existing `query` command is unchanged.
- `ai search` embeds and retrieves as `query` does and runs any configured reranker. It then adjusts each candidate's score:

  ```
  adjustment = sum over the votes for this chunk of
               (+1 for up, -1 for down) x 0.1 x jaccard(terms(question), terms(voted question))
  ```

  The total is capped at ±0.3 and added to the retrieval score.

- A vote counts only for the chunk it names, in proportion to how many terms its question shares with yours. A vote on an unrelated question has no effect.
- Results are re-sorted by the adjusted score. A larger pool (at least `4 × top-k`) is re-scored, so a boosted chunk can move into the top-k.
- Chunks with no retrieval match (score 0) are not shown.
- Each result prints its id, its retrieval score, the adjustment and every vote that contributed.

### `ai multimodal process <path>`

Reports what the loaders extract from a file or directory. The index is not modified.

```bash
rag-pipeline ai multimodal process ./docs
rag-pipeline ai multimodal process report.html --json
```

- For text files (`.md`, `.markdown`, `.html`, `.htm`, `.csv`, `.txt`), it prints the detected type, the file's characters, the chunk count and the extracted characters.
- Images are not supported. The built-in llm connectors (`openai`, `anthropic`, `ollama`) only send text prompts, and image processing needs a vision-capable model. An image path exits `1` with that explanation.
- In a directory, images and other unsupported files are listed as skipped.

---

## `completion`

```bash
rag-pipeline completion bash >> ~/.bashrc
rag-pipeline completion zsh  > "${fpath[1]}/_rag-pipeline"
rag-pipeline completion fish > ~/.config/fish/completions/rag-pipeline.fish
```

---

Next → [Evaluation](./Evaluation.md)
