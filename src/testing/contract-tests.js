'use strict';

/**
 * Contract tests for plugins: the behaviour createRagPipeline relies on from
 * each plugin type, as runnable checks. `runContractTests` registers them
 * with your test framework; `checkContract` runs them without one.
 *
 * The assertions use node:assert, so the checks run under Jest, Vitest,
 * Mocha or node:test alike.
 */

const assert = require('node:assert/strict');
const { validatePlugin } = require('../core/validate-plugin');
const { createRagPipeline } = require('../core/create-pipeline');
const { MemoryRetriever } = require('../connectors/memory-retriever');

const TYPES = ['loader', 'embedder', 'retriever', 'reranker', 'llm'];

/** Unit vector, so cosine scores are easy to predict. */
const unit = (values) => {
  const n = Math.sqrt(values.reduce((s, x) => s + x * x, 0));
  return values.map((x) => x / n);
};

/** Documents for retriever and reranker checks. */
const DOCUMENTS = [
  {
    id: 'vacation',
    vector: unit([1, 0, 0, 0]),
    content: 'Full-time employees receive twenty days of paid vacation.',
    metadata: { source: 'policies/vacation.md' },
  },
  {
    id: 'remote',
    vector: unit([0, 1, 0, 0]),
    content: 'Employees may work remotely three days a week.',
    metadata: { source: 'policies/remote.md' },
  },
  {
    id: 'expenses',
    vector: unit([0, 0, 1, 0]),
    content: 'Meals while travelling are reimbursed up to fifty dollars.',
    metadata: { source: 'policies/expenses.md' },
  },
];

const VACATION_QUERY = 'How many days of paid vacation do employees get?';
const VACATION_VECTOR = unit([1, 0.1, 0, 0]);

/**
 * Load the test documents into a retriever: `options.setup` when given,
 * otherwise the retriever's own store().
 */
function loaderFor(setup) {
  return async (retriever) => {
    if (setup)
      return setup(
        retriever,
        DOCUMENTS.map((d) => ({ ...d })),
      );
    if (typeof retriever.store !== 'function') {
      throw new TypeError(
        'This retriever has no store(). Pass { setup(retriever, documents) } to load the test documents into it.',
      );
    }
    return retriever.store(DOCUMENTS.map((d) => ({ ...d })));
  };
}

const isVector = (v) =>
  Array.isArray(v) && v.length > 0 && v.every((x) => Number.isFinite(x));

async function vectorOf(embedder, text, options) {
  const fn = embedder.embedQuery || embedder.embed;
  return fn.call(embedder, text, options);
}

/** A deterministic embedder for pipeline checks of other plugin types. */
const standInEmbedder = {
  async embed(text) {
    return /vacation/i.test(text) ? VACATION_VECTOR : unit([0, 0, 0, 1]);
  },
};

/** An LLM stand-in that answers with the top document. */
const standInLLM = {
  async generate(query, docs) {
    return docs[0] ? docs[0].content : 'No information found.';
  },
};

async function standInRetriever() {
  const retriever = new MemoryRetriever();
  await retriever.store(DOCUMENTS);
  return retriever;
}

/**
 * The checks for each plugin type. A check gets a fresh plugin from the
 * factory, so state from one check never leaks into another.
 */
const CHECKS = {
  loader: [
    {
      name: 'load() can be called with no arguments',
      async run(loader) {
        // createRagPipeline calls load() at the start of every run.
        await loader.load();
      },
    },
  ],

  embedder: [
    {
      name: 'embed(text) returns a non-empty array of finite numbers',
      async run(embedder) {
        const vector = await embedder.embed('paid vacation days');
        assert.ok(isVector(vector), 'embed() must return number[]');
      },
    },
    {
      name: 'every vector has the same length',
      async run(embedder) {
        const a = await embedder.embed('paid vacation days');
        const b = await embedder.embed('working remotely');
        assert.equal(b.length, a.length, 'vector lengths differ');
        if (typeof embedder.embedQuery === 'function') {
          const q = await embedder.embedQuery('how many vacation days?');
          assert.ok(isVector(q), 'embedQuery() must return number[]');
          assert.equal(q.length, a.length, 'embedQuery() length differs');
        }
      },
    },
    {
      name: 'accepts the run options ({ signal })',
      async run(embedder) {
        const vector = await vectorOf(embedder, 'paid vacation days', {
          signal: new AbortController().signal,
        });
        assert.ok(isVector(vector));
      },
    },
    {
      name: 'works in createRagPipeline',
      async run(embedder) {
        const retriever = new MemoryRetriever();
        await retriever.store(
          await Promise.all(
            DOCUMENTS.map(async (d) => ({
              ...d,
              vector: await embedder.embed(d.content),
            })),
          ),
        );
        const result = await createRagPipeline({
          embedder,
          retriever,
          llm: standInLLM,
        }).run({ query: VACATION_QUERY });
        assert.equal(result.success, true, result.error);
      },
    },
  ],

  retriever: [
    {
      name: 'an empty retriever returns an array',
      async run(retriever) {
        const results = await retriever.retrieve({
          query: VACATION_QUERY,
          queryVector: VACATION_VECTOR,
          topK: 3,
        });
        assert.ok(Array.isArray(results), 'retrieve() must return an array');
      },
    },
    {
      name: 'returns the closest documents first, each with an id and a numeric score',
      async run(retriever, ctx) {
        await ctx.load(retriever);
        const results = await retriever.retrieve({
          query: VACATION_QUERY,
          queryVector: VACATION_VECTOR,
          topK: 3,
        });
        assert.ok(results.length > 0, 'no results');
        assert.equal(
          results[0].id,
          'vacation',
          'the closest document is not first',
        );
        for (const r of results) {
          assert.equal(typeof r.id, 'string', 'result without a string id');
          assert.ok(
            Number.isFinite(r.score),
            `result ${r.id} has no numeric score`,
          );
        }
        for (let i = 1; i < results.length; i++) {
          assert.ok(
            results[i - 1].score >= results[i].score,
            'results are not sorted by score, highest first',
          );
        }
      },
    },
    {
      name: 'returns at most topK results',
      async run(retriever, ctx) {
        await ctx.load(retriever);
        const results = await retriever.retrieve({
          query: VACATION_QUERY,
          queryVector: VACATION_VECTOR,
          topK: 2,
        });
        assert.ok(results.length <= 2, `topK 2 returned ${results.length}`);
      },
    },
    {
      name: 'returns the stored content and metadata',
      async run(retriever, ctx) {
        await ctx.load(retriever);
        const [top] = await retriever.retrieve({
          query: VACATION_QUERY,
          queryVector: VACATION_VECTOR,
          topK: 1,
          signal: new AbortController().signal,
        });
        assert.equal(top.content, DOCUMENTS[0].content);
        assert.deepEqual(top.metadata, DOCUMENTS[0].metadata);
      },
    },
    {
      name: 'works in createRagPipeline',
      async run(retriever, ctx) {
        await ctx.load(retriever);
        const result = await createRagPipeline({
          embedder: standInEmbedder,
          retriever,
          llm: standInLLM,
        }).run({ query: VACATION_QUERY });
        assert.equal(result.success, true, result.error);
        assert.equal(result.answer, DOCUMENTS[0].content);
      },
    },
  ],

  reranker: [
    {
      name: 'rerank(query, documents) returns documents it was given',
      async run(reranker) {
        const input = DOCUMENTS.map((d, i) => ({ ...d, score: 1 - i * 0.1 }));
        const results = await reranker.rerank(VACATION_QUERY, input, {
          topK: input.length,
          signal: new AbortController().signal,
        });
        assert.ok(Array.isArray(results), 'rerank() must return an array');
        assert.ok(results.length > 0, 'rerank() returned no documents');
        const ids = new Set(input.map((d) => d.id));
        for (const r of results) {
          assert.ok(
            ids.has(r.id),
            `rerank() returned an unknown document ${r.id}`,
          );
        }
      },
    },
    {
      name: 'puts the document that answers the query first',
      async run(reranker) {
        // The matching document starts last.
        const input = [...DOCUMENTS]
          .reverse()
          .map((d, i) => ({ ...d, score: 1 - i * 0.1 }));
        const results = await reranker.rerank(VACATION_QUERY, input, {
          topK: input.length,
        });
        assert.equal(results[0].id, 'vacation');
      },
    },
    {
      name: 'returns at most topK documents',
      async run(reranker) {
        const results = await reranker.rerank(VACATION_QUERY, DOCUMENTS, {
          topK: 1,
        });
        assert.ok(results.length <= 1, `topK 1 returned ${results.length}`);
      },
    },
    {
      name: 'works in createRagPipeline',
      async run(reranker) {
        const result = await createRagPipeline({
          embedder: standInEmbedder,
          retriever: await standInRetriever(),
          reranker,
          llm: standInLLM,
        }).run({ query: VACATION_QUERY });
        assert.equal(result.success, true, result.error);
      },
    },
  ],

  llm: [
    {
      name: 'generate(query, documents, options) resolves to a string',
      async run(llm) {
        const answer = await llm.generate(VACATION_QUERY, DOCUMENTS, {
          signal: new AbortController().signal,
        });
        assert.equal(
          typeof answer,
          'string',
          `generate() resolved to ${typeof answer}; the pipeline needs the answer text`,
        );
      },
    },
    {
      name: 'generateStream(), when present, yields { token, done } and ends with done: true',
      skip: (llm) => typeof llm.generateStream !== 'function',
      async run(llm) {
        const stream = await llm.generateStream(VACATION_QUERY, DOCUMENTS, {
          signal: new AbortController().signal,
        });
        let last;
        for await (const chunk of stream) {
          assert.equal(
            typeof chunk.token,
            'string',
            'chunk.token must be a string',
          );
          assert.equal(
            typeof chunk.done,
            'boolean',
            'chunk.done must be a boolean',
          );
          last = chunk;
        }
        assert.ok(
          last && last.done === true,
          'the last chunk must have done: true',
        );
      },
    },
    {
      name: 'works in createRagPipeline',
      async run(llm) {
        const result = await createRagPipeline({
          embedder: standInEmbedder,
          retriever: await standInRetriever(),
          llm,
        }).run({ query: VACATION_QUERY });
        assert.equal(result.success, true, result.error);
        assert.equal(typeof result.answer, 'string');
      },
    },
  ],
};

function checksFor(type, { registry = false } = {}) {
  if (!TYPES.includes(type)) {
    throw new TypeError(
      `Unknown plugin type "${type}". Expected one of: ${TYPES.join(', ')}`,
    );
  }
  const shape = {
    name: registry
      ? 'has the methods and metadata pluginRegistry.register() requires'
      : 'has the methods of its contract',
    async run(plugin) {
      const { valid, errors } = validatePlugin(type, plugin, { registry });
      assert.ok(valid, errors.join('; '));
    },
  };
  return [shape, ...CHECKS[type]];
}

async function makePlugin(factory) {
  const plugin = await factory();
  if (!plugin || typeof plugin !== 'object') {
    throw new TypeError('The factory must return a plugin object');
  }
  return plugin;
}

function assertFactory(factory) {
  if (typeof factory !== 'function') {
    throw new TypeError(
      'Pass a factory that returns a new plugin: () => new MyPlugin()',
    );
  }
}

/**
 * Register the contract tests for a plugin with your test framework.
 *
 * @example
 * // my-retriever.test.js (Jest; Vitest with globals; Mocha)
 * const { runContractTests } = require("@devilsdev/rag-pipeline-utils/testing");
 * runContractTests("retriever", () => new MyRetriever());
 *
 * @example
 * // Vitest without globals, or node:test
 * import { describe, it } from "vitest"; // or "node:test"
 * runContractTests("llm", () => new MyLLM(), { describe, it });
 *
 * @param {'loader'|'embedder'|'retriever'|'reranker'|'llm'} type - Plugin type
 * @param {() => (object|Promise<object>)} factory - Returns a new, empty plugin for each check
 * @param {object} [options]
 * @param {string} [options.name] - Name of the test group (default: "<type> contract")
 * @param {boolean} [options.registry=false] - Also require the `metadata` pluginRegistry.register() needs
 * @param {(retriever: object, documents: object[]) => (void|Promise<void>)} [options.setup] - Retrievers: loads the test documents (default: `retriever.store(documents)`), for retrievers without store()
 * @param {Function} [options.describe] - Your framework's describe (default: the global one)
 * @param {Function} [options.it] - Your framework's it/test (default: the global it or test)
 * @returns {void}
 */
function runContractTests(type, factory, options = {}) {
  assertFactory(factory);
  const describeFn = options.describe || globalThis.describe;
  const itFn = options.it || globalThis.it || globalThis.test;
  if (typeof describeFn !== 'function' || typeof itFn !== 'function') {
    throw new Error(
      'No describe/it found. Run this inside a test file, or pass { describe, it } from your test framework.',
    );
  }
  const checks = checksFor(type, options);
  const ctx = { load: loaderFor(options.setup) };
  describeFn(options.name || `${type} contract`, () => {
    for (const check of checks) {
      itFn(check.name, async () => {
        const plugin = await makePlugin(factory);
        if (check.skip && check.skip(plugin)) return;
        await check.run(plugin, ctx);
      });
    }
  });
}

/**
 * Run the contract checks for a plugin without a test framework.
 *
 * @example
 * const report = await checkContract("embedder", () => new MyEmbedder());
 * if (!report.passed) console.log(report.results.filter((r) => !r.passed));
 *
 * @param {'loader'|'embedder'|'retriever'|'reranker'|'llm'} type - Plugin type
 * @param {() => (object|Promise<object>)} factory - Returns a new, empty plugin for each check
 * @param {object} [options]
 * @param {boolean} [options.registry=false] - Also require the `metadata` pluginRegistry.register() needs
 * @param {(retriever: object, documents: object[]) => (void|Promise<void>)} [options.setup] - Retrievers: loads the test documents (default: `retriever.store(documents)`), for retrievers without store()
 * @returns {Promise<{ type: string, passed: boolean, results: Array<{ name: string, passed: boolean, skipped: boolean, error?: string }> }>}
 */
async function checkContract(type, factory, options = {}) {
  assertFactory(factory);
  const results = [];
  const ctx = { load: loaderFor(options.setup) };
  for (const check of checksFor(type, options)) {
    try {
      const plugin = await makePlugin(factory);
      if (check.skip && check.skip(plugin)) {
        results.push({ name: check.name, passed: true, skipped: true });
        continue;
      }
      await check.run(plugin, ctx);
      results.push({ name: check.name, passed: true, skipped: false });
    } catch (error) {
      results.push({
        name: check.name,
        passed: false,
        skipped: false,
        // node:assert appends a diff after a blank line; keep the message.
        error: String(error && error.message ? error.message : error).split(
          '\n\n',
        )[0],
      });
    }
  }
  return { type, passed: results.every((r) => r.passed), results };
}

module.exports = { runContractTests, checkContract };
