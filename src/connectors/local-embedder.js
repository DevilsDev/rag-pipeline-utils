'use strict';

const { BaseConnector } = require('./base-connector');
const { tokenize } = require('../evaluate/scoring');

/**
 * Default configuration for the local TF-IDF embedder.
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  maxVocabularySize: 10000,
  minDocFrequency: 1,
};

/**
 * TF-IDF based embedder for fully offline use.
 * No external API required -- builds a vocabulary from training documents
 * and produces sparse TF-IDF vectors.
 * @extends BaseConnector
 */
class LocalEmbedder extends BaseConnector {
  /**
   * @param {Object} options
   * @param {number} [options.maxVocabularySize=10000] - Maximum vocabulary size
   * @param {number} [options.minDocFrequency=1] - Minimum document frequency for a token to be included
   */
  constructor(options = {}) {
    super({ name: 'local-embedder', ...options });
    this.config = { ...DEFAULT_CONFIG, ...options };
    /** @type {Map<string, number>} token -> vocabulary index */
    this.vocabulary = new Map();
    /** @type {Map<string, number>} token -> IDF weight */
    this.idf = new Map();
    /** @type {number} */
    this.docCount = 0;
    this.connected = true; // always available
  }

  /**
   * Build vocabulary and IDF weights from a corpus of documents.
   * @param {Array<string|{ content?: string, text?: string }>} documents - Training documents
   */
  train(documents) {
    const docs = documents.map((doc) => {
      if (typeof doc === 'string') return doc;
      return doc.content || doc.text || String(doc);
    });

    this.docCount = docs.length;

    // Count document frequency for each token
    const docFreq = new Map();
    for (const doc of docs) {
      const tokens = new Set(tokenize(doc));
      for (const token of tokens) {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      }
    }

    // Compute IDF for tokens that meet the minimum document frequency
    const idfEntries = [];
    for (const [token, freq] of docFreq) {
      if (freq < this.config.minDocFrequency) continue;
      // Smoothed IDF stays positive; log(N / (df + 1)) is <= 0 for every
      // token in small corpora (N <= 2), which produced all-zero vectors.
      const idfValue = Math.log(1 + this.docCount / freq);
      idfEntries.push([token, idfValue]);
    }

    // Sort by IDF descending and take top maxVocabularySize tokens
    idfEntries.sort((a, b) => b[1] - a[1]);
    const topEntries = idfEntries.slice(0, this.config.maxVocabularySize);

    // Build vocabulary map and IDF map
    this.vocabulary.clear();
    this.idf.clear();
    for (let i = 0; i < topEntries.length; i++) {
      const [token, idfValue] = topEntries[i];
      this.vocabulary.set(token, i);
      this.idf.set(token, idfValue);
    }

    this.emit('trained', {
      vocabSize: this.vocabulary.size,
      docCount: this.docCount,
    });
  }

  /**
   * Compute a TF-IDF vector for the given text.
   * The vector length equals the vocabulary size.
   * @param {string} text - Text to embed
   * @returns {number[]} L2-normalized TF-IDF vector
   */
  embed(text) {
    const vocabSize = this.vocabulary.size;

    if (vocabSize === 0) {
      this.emit('warning', {
        message: 'LocalEmbedder has not been trained yet',
      });
      return new Array(1).fill(0);
    }

    const tokens = tokenize(text);

    // Count term frequency
    const tf = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    // Build TF-IDF vector
    const vector = new Array(vocabSize).fill(0);
    for (const [token, freq] of tf) {
      const idx = this.vocabulary.get(token);
      if (idx !== undefined) {
        vector[idx] = freq * (this.idf.get(token) || 0);
      }
    }

    // L2 normalize
    let magnitude = 0;
    for (let i = 0; i < vector.length; i++) {
      magnitude += vector[i] * vector[i];
    }
    magnitude = Math.sqrt(magnitude);

    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  /**
   * Compute a TF-IDF vector for a query string.
   * Alias for {@link embed}.
   * @param {string} query - Query text to embed
   * @returns {number[]} L2-normalized TF-IDF vector
   */
  embedQuery(query) {
    return this.embed(query);
  }

  /**
   * Serializable vocabulary and IDF weights, so a trained embedder can be
   * restored in another process (e.g. by FileVectorStore-backed CLI queries).
   *
   * @returns {{docCount: number, vocabulary: Array<[string, number]>, idf: Array<[string, number]>}}
   */
  getState() {
    return {
      docCount: this.docCount,
      vocabulary: [...this.vocabulary],
      idf: [...this.idf],
    };
  }

  /**
   * Restore state produced by getState().
   * @param {{docCount: number, vocabulary: Array<[string, number]>, idf: Array<[string, number]>}} state
   */
  setState(state) {
    this.docCount = state.docCount || 0;
    this.vocabulary = new Map(state.vocabulary || []);
    this.idf = new Map(state.idf || []);
  }

  /** @returns {number} Vector length produced by embed() once trained */
  get dimensions() {
    return this.vocabulary.size;
  }

  /**
   * Connect the embedder (always succeeds since it is local).
   * @returns {Promise<void>}
   */
  async connect() {
    this.connected = true;
  }

  /**
   * Check whether the embedder is healthy (vocabulary has been trained).
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    return this.vocabulary.size > 0;
  }

  /**
   * Get the current vocabulary size.
   * @returns {number}
   */
  getVocabularySize() {
    return this.vocabulary.size;
  }
}

module.exports = { LocalEmbedder, DEFAULT_CONFIG };
