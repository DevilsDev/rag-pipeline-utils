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

> **Tip:** the [configuration builder](./Config-Builder.mdx) writes this file for you in the browser.

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

   | Stage     | Names                                 | Notes                                                                                                                                                                                                                       |
   | --------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | loader    | `auto`                                | Picks a loader per file extension                                                                                                                                                                                           |
   | embedder  | `local`, `openai`, `ollama`, `cohere` | `local` is TF-IDF, offline                                                                                                                                                                                                  |
   | retriever | `file-store`, `memory`, `pgvector`    | `file-store` persists to `config.path` (relative to the config file); `pgvector` (2.7.0) reads its connection string from `DATABASE_URL`, see [PostgreSQL with pgvector](./Concepts-Connectors.md#postgresql-with-pgvector) |
   | llm       | `openai`, `anthropic`, `ollama`       | Optional                                                                                                                                                                                                                    |
   | reranker  | `scoring`                             | Optional                                                                                                                                                                                                                    |

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
| `--quiet`         | `query` prints only the answer (or the passages), no status lines                    |
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

| Option           | Description                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `--top-k <n>`    | Passages to retrieve (default 3)                                                                                                                |
| `--json`         | Print `{ answer, results, citations }` as JSON                                                                                                  |
| `--streaming`    | Print the answer as the model generates it (needs an `llm` stage)                                                                               |
| `--timeout <ms>` | Abort the query after this many milliseconds; exits `1` with `Execution timeout`                                                                |
| `--trace`        | Time spent in each stage: embed, retrieve, rerank, generate                                                                                     |
| `--explain`      | Each passage's rank and score, and which passages support each sentence of the answer; sentences no passage supports are flagged                |
| `--stats`        | Latency, passage count and estimated tokens; estimated cost when the `llm` model is in the [pricing table](./API-Reference.md#pricing_metadata) |

```bash
rag-pipeline query "How many vacation days do I get?" --explain --trace
rag-pipeline query "Summarise the remote work policy" --streaming --timeout 30000
rag-pipeline --quiet query "What is the expense limit?"
```

With `--json`, `--trace`, `--stats` and `--explain` add `trace`, `stats` and `explanation` keys. Token counts are estimates (about four characters per token), not the provider's count.

---

## `eval`

:::info[Coming in 2.7.0]

`rag-pipeline eval` is in the next release.

:::

Runs a test set through the configured pipeline and index, prints the scores, and exits `1` when the run fails, so it can gate a CI job. A run fails when a case errors, a metric is below its `--min`, or the run regressed from a `--baseline` report.

```bash
# On your main branch: save a baseline
rag-pipeline eval tests.json --output eval-main.json

# On a pull request: compare with it, require minimums, write a summary
rag-pipeline eval tests.json --baseline eval-main.json \
  --min faithfulness=0.8 --min sourceRecall=0.9 --report eval-summary.md
```

The test set is a `.json` file (an array of cases, or `{ "cases": [...] }`) or a `.jsonl` file with one case per line. Each case has a `prompt`, and optionally `expected` (the reference answer), `sourceIds`, `id` and `tags`; see the [dataset format](./Evaluation.md#dataset-format). It is validated before anything runs, and every problem is listed with its case.

A source id matches a retrieved passage's `id` or its `metadata.source`, so with the CLI's index you can name files: `"sourceIds": ["docs/vacation.md"]` matches the chunk `docs/vacation.md#0`.

| Option                 | Description                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--output <file>`      | Save this run's report as JSON, to use later as a `--baseline`                                                             |
| `--baseline <file>`    | Compare with a saved report; a metric whose mean drops by more than `--tolerance`, or a case that now fails, fails the run |
| `--min <metric=value>` | Minimum mean for a metric, from 0 to 1. Repeat for more metrics                                                            |
| `--report <file>`      | Write a summary: a `.html` file gets a standalone page, any other name (e.g. `.md`) Markdown for a pull request comment    |
| `--tolerance <n>`      | Allowed drop in a metric's mean from the baseline (default 0.02)                                                           |
| `--case-tolerance <n>` | Drop in one case's score that lists the case under "Cases that got worse" (default 0.1)                                    |
| `--concurrency <n>`    | Cases run at the same time (default 1)                                                                                     |
| `--timeout <ms>`       | Abort each case after this many milliseconds; the case is recorded as failed                                               |
| `--top-k <n>`          | Passages to retrieve (default 3)                                                                                           |
| `--json`               | Print `{ passed, reasons, thresholds, summary, comparison }` as JSON                                                       |

The metrics are `faithfulness`, `relevance`, `contextPrecision`, `contextRecall` (cases with `expected`), `groundedness`, `citationCoverage` and `sourceRecall` (cases with `sourceIds`); see [Run a test set and compare configurations](./Evaluation.md#run-a-test-set-and-compare-configurations). Without an `llm` stage only `sourceRecall` is measured.

Model answers vary from run to run. Run the same configuration a few times to see how far the scores move, and set `--tolerance` above that.

### In GitHub Actions

[`DevilsDev/rag-eval-action`](https://github.com/DevilsDev/rag-eval-action) runs `rag-pipeline eval` on pull requests. It compares each pull request with the report from your default branch (kept in the Actions cache), posts the summary as a pull request comment that later runs update in place, and fails the check when scores drop:

```yaml no-run
- uses: DevilsDev/rag-eval-action@v1
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  with:
    ingest: docs
    dataset: eval/tests.json
    baseline-cache: true
    min: faithfulness=0.8
```

The Action is published with 2.7.0, which it needs; see its README for the inputs, permissions and fork pull requests.

---

## `generate-dataset`

:::info[Coming in 2.7.0]

`rag-pipeline generate-dataset` is in the next release.

:::

Writes a test set for [`eval`](#eval) from your index: the configured `llm` writes a question and answer about each chunk, and each case records the chunk's source file.

```bash
rag-pipeline ingest ./docs
rag-pipeline generate-dataset --output tests.json --count 30
rag-pipeline eval tests.json --output eval-main.json
```

Answers that their chunk doesn't support, repeated questions and chunks shorter than 80 characters are skipped, with a count per reason. It needs an `llm` stage, and won't replace an existing file unless you pass `--force`, so a test set you've reviewed isn't lost.

| Option                   | Description                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| `--output <file>`        | Where to write the test set (required)                            |
| `--count <n>`            | Cases to write at most (default 20)                               |
| `--per-document <n>`     | Questions per chunk (default 1)                                   |
| `--min-faithfulness <n>` | Share of an answer's sentences its chunk must support (default 1) |
| `--concurrency <n>`      | Chunks processed at the same time (default 1)                     |
| `--force`                | Replace `--output` if it exists                                   |

The cases are marked `"reviewed": false` and tagged `synthetic`. Read them before relying on them; see [Generate a test set](./Evaluation.md#generate-a-test-set).

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
