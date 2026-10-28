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

Install, inspect and check plugins. `install`, `list` and `certify submit|check|requirements` work without a registry; the other subcommands talk to a plugin registry. There is no public registry: pass `--registry <url>` or set `RAG_PLUGIN_REGISTRY`; without one those commands exit `1`.

### `hub install <source>`

```bash
rag-pipeline hub install ./my-llm                         # local directory
rag-pipeline hub install ./my-llm-1.0.0.tgz               # npm pack output
rag-pipeline hub install ./plugins/echo.js --stage llm --name echo
rag-pipeline hub install npm:@acme/rag-llm-echo@1.2.0     # from npm
rag-pipeline hub --registry https://registry.example.com install echo
```

What it does:

1. Fetches the plugin. Registry downloads are checked against the registry's sha256, and a mismatch aborts.
2. Unpacks it into `.rag/plugins/<stage>-<name>/` next to the config. Archive entries that would land outside that folder are rejected, and symlinks are skipped.
3. Statically scans the code for risky capabilities: running processes, `eval`/`new Function`, `vm`, native addons, network access, file writes and environment access. High-risk findings block the install unless you pass `--allow-risky`.
4. Loads the entry module in a separate Node process and checks it has the stage's methods (`llm`: `generate`; `embedder`: `embed`; `retriever`: `store` and `retrieve`; `reranker`: `rerank`; `loader`: `load`).
5. Adds `plugins.<stage>.<name>` to `.ragrc.json`. To use the plugin, add `{ "stage": ..., "name": ... }` to `pipeline`.

Stage and name come from `package.json` (`"ragPipeline": { "stage": "llm", "name": "echo" }`), or from `--stage` and `--name`. Install scripts are never run.

The scan reads source text and doesn't run anything. It is not a sandbox, though: an installed plugin runs with your permissions whenever the pipeline uses it.

| Option              | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `--stage <stage>`   | `loader`, `embedder`, `retriever`, `llm` or `reranker`   |
| `--name <name>`     | Name to register the plugin under                        |
| `-v, --version <v>` | Registry version (default `latest`)                      |
| `--force`           | Replace an installed plugin with the same stage and name |
| `--allow-risky`     | Install despite high-risk scan findings                  |

### `hub list`

Lists the plugins registered under `plugins` in the config: installed version, whether the plugin is in the pipeline, and whether its file exists. Add `--json` for JSON output.

### `hub certify submit <path>` (alias `check`)

Runs automated checks on a local plugin and prints a weighted score:

| Check         | Weight | Scored on                                                                   |
| ------------- | ------ | --------------------------------------------------------------------------- |
| Contract      | 35     | Required methods present (checked in a separate process)                    |
| Security scan | 30     | 100 − 40 per high, 10 per medium, 2 per low finding                         |
| Tests         | 15     | Test files present (60), plus a real `test` script (100)                    |
| Documentation | 20     | README (50), README of 300+ characters (20), description (15), license (15) |

Automated thresholds: BASIC 60, VERIFIED 80 (also needs manual review), ENTERPRISE 95 (also needs manual review and a security audit). A plugin that fails the contract check never reaches a level. The command exits `1` below BASIC. Options: `--stage`, `--json`, `--output <file>`. The report is local; nothing is uploaded and no certificate is issued.

### Registry commands

```bash
rag-pipeline hub --registry https://registry.example.com search markdown
export RAG_PLUGIN_REGISTRY=https://registry.example.com
rag-pipeline hub info markdown-pro
rag-pipeline hub certify requirements        # works offline
```

Also available: `publish`, `rate`, `reviews`, `trending`, `certify verify`, and `publisher status|apply`.

---

## `completion`

```bash
rag-pipeline completion bash >> ~/.bashrc
rag-pipeline completion zsh  > "${fpath[1]}/_rag-pipeline"
rag-pipeline completion fish > ~/.config/fish/completions/rag-pipeline.fish
```

---

Next → [Evaluation](./Evaluation.md)
