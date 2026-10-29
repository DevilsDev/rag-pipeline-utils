'use strict';

/**
 * Caching for createRagPipeline({ cache }): three opt-in layers.
 *
 * - embeddings: the query vector, keyed by the embedder's identity and the
 *   query text.
 * - retrieval: the retriever's raw results, keyed by the retriever's state,
 *   the query and topK. Cached before `filterResults` (guardrail ACLs) and
 *   the reranker, so those still run on every request and one user's
 *   permissions can never shape another user's results.
 * - generation: the answer, keyed by the llm's identity, the query, the
 *   exact documents it was given and the generation options. Skipped when
 *   the temperature is above 0.
 *
 * A layer caches only when its component identifies itself through
 * `getCacheKey(role)` or a `cacheKey` string (the built-ins do), so a cache
 * can never return results for a different model, index or configuration.
 * Only successful, completed work is stored: nothing from an aborted or
 * timed-out run.
 */

const crypto = require('crypto');
const { MemoryCache } = require('./memory-cache');

const LAYERS = ['embeddings', 'retrieval', 'generation'];
const DEFAULT_TTL_SECONDS = {
  embeddings: 30 * 24 * 3600,
  retrieval: 3600,
  generation: 24 * 3600,
};
const ROLE = {
  embeddings: 'embedder',
  retrieval: 'retriever',
  generation: 'llm',
};

/** Generation options that change the answer and so belong in its key. */
const GENERATION_OPTIONS = [
  'temperature',
  'maxTokens',
  'maxOutputTokens',
  'topP',
  'model',
  'systemPrompt',
  'seed',
  'stopSequences',
];

function hash(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function isBackend(value) {
  return (
    value && typeof value.get === 'function' && typeof value.set === 'function'
  );
}

/** A component's identity for a role, or null when it has none. */
function componentKey(component, role) {
  if (!component) return null;
  if (typeof component.getCacheKey === 'function') {
    const key = component.getCacheKey(role);
    return typeof key === 'string' && key ? key : null;
  }
  return typeof component.cacheKey === 'string' && component.cacheKey
    ? component.cacheKey
    : null;
}

const warned = new Set();
function warnOnce(code, message) {
  if (warned.has(code)) return;
  warned.add(code);
  process.emitWarning(message, { type: 'RagCacheWarning', code });
}

/**
 * Normalise the `cache` option of createRagPipeline.
 *
 * - `true`: all three layers in one in-memory cache
 * - a CacheBackend: all three layers in it
 * - `{ embeddings, retrieval, generation, ttlSeconds }`: per layer, each
 *   `true` (in-memory), `false`/absent (off) or a CacheBackend;
 *   `ttlSeconds: { embeddings, retrieval, generation }` overrides the
 *   defaults (30 days, 1 hour, 24 hours)
 *
 * @returns {Object|null} Layer config, or null when caching is off
 */
function normalizeCacheOption(option) {
  if (!option) return null;
  const shared =
    option === true ? new MemoryCache() : isBackend(option) ? option : null;
  const layers = {};
  for (const layer of LAYERS) {
    let backend = null;
    if (shared) {
      backend = shared;
    } else if (option[layer] === true) {
      backend = new MemoryCache();
    } else if (isBackend(option[layer])) {
      backend = option[layer];
    }
    if (backend) {
      layers[layer] = {
        backend,
        ttlSeconds:
          (option.ttlSeconds && option.ttlSeconds[layer]) ??
          DEFAULT_TTL_SECONDS[layer],
        hits: 0,
        misses: 0,
        skipped: 0,
      };
    }
  }
  return Object.keys(layers).length ? layers : null;
}

/**
 * Per-pipeline cache. Every method returns undefined and does nothing for a
 * layer that is off or whose component has no cache key.
 */
class PipelineCache {
  /**
   * @param {Object} layers - normalizeCacheOption() output
   * @param {{ embedder?: Object, retriever?: Object, llm?: Object }} components
   */
  constructor(layers, components) {
    this.layers = layers;
    this.components = components;
  }

  /** @private */
  _key(layer, parts) {
    const config = this.layers[layer];
    if (!config) return null;
    const component = this.components[ROLE[layer]];
    const id = componentKey(component, ROLE[layer]);
    if (!id) {
      config.skipped += 1;
      warnOnce(
        `RAG_CACHE_NO_KEY_${layer.toUpperCase()}`,
        `The ${layer} cache is off for this ${ROLE[layer]}: it has no getCacheKey(role) method or cacheKey string, so cached results could not be told apart from another configuration's. Add one to enable it.`,
      );
      return null;
    }
    return `${layer}:${hash([id, parts])}`;
  }

  /** @private */
  async _get(layer, key, status) {
    if (!key) {
      status[layer] = 'skip';
      return undefined;
    }
    const config = this.layers[layer];
    let value;
    try {
      value = await config.backend.get(key);
    } catch (error) {
      // A cache outage must not fail the run.
      warnOnce('RAG_CACHE_READ_FAILED', `Cache read failed: ${error.message}`);
      value = undefined;
    }
    if (value === undefined) {
      config.misses += 1;
      status[layer] = 'miss';
    } else {
      config.hits += 1;
      status[layer] = 'hit';
    }
    return value;
  }

  /** @private */
  async _set(layer, key, value) {
    if (!key || value === undefined) return;
    const config = this.layers[layer];
    try {
      await config.backend.set(key, value, { ttlSeconds: config.ttlSeconds });
    } catch (error) {
      warnOnce(
        'RAG_CACHE_WRITE_FAILED',
        `Cache write failed: ${error.message}`,
      );
    }
  }

  embeddingKey(query) {
    return this._key('embeddings', { query });
  }

  retrievalKey({ query, queryVector, topK }) {
    // Keyed on the query vector, not just the text, so a different embedder
    // (or a retrained one) never gets another embedder's results; the text
    // stays in the key for keyword and hybrid retrievers.
    return this._key('retrieval', {
      query: query ?? null,
      vector: queryVector ? hash(queryVector) : null,
      topK,
    });
  }

  /**
   * @returns {string|null} The key, or null to skip (temperature above 0,
   *   or no llm cache key)
   */
  generationKey({ query, docs, options }) {
    if (!this.layers.generation) return null;
    const llm = this.components.llm;
    const temperature =
      options.temperature ?? (llm && llm.config && llm.config.temperature);
    if (typeof temperature === 'number' && temperature > 0) {
      this.layers.generation.skipped += 1;
      return null;
    }
    const generationOptions = {};
    for (const name of GENERATION_OPTIONS) {
      if (options[name] !== undefined) generationOptions[name] = options[name];
    }
    const context = (docs || []).map((d) =>
      typeof d === 'string' ? d : [d.id ?? null, d.content ?? d.text ?? ''],
    );
    return this._key('generation', {
      query,
      context: hash(context),
      options: generationOptions,
    });
  }

  get(layer, key, status) {
    if (!this.layers[layer]) return Promise.resolve(undefined);
    return this._get(layer, key, status);
  }

  set(layer, key, value) {
    if (!this.layers[layer]) return Promise.resolve();
    return this._set(layer, key, value);
  }

  /** Hits, misses and skips per layer since the pipeline was created. */
  stats() {
    const out = {};
    for (const [layer, c] of Object.entries(this.layers)) {
      out[layer] = { hits: c.hits, misses: c.misses, skipped: c.skipped };
    }
    return out;
  }
}

module.exports = {
  normalizeCacheOption,
  PipelineCache,
  componentKey,
  DEFAULT_TTL_SECONDS,
};
