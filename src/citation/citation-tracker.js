'use strict';

const { EventEmitter } = require('events');
const { splitSentences, tokenize } = require('../evaluate/scoring');
const { mapSentenceToSources, buildIDFWeights } = require('./source-mapper');
const { detectHallucinations } = require('./hallucination-detector');

/**
 * Default configuration for the CitationTracker.
 * @type {object}
 */
const DEFAULT_CONFIG = {
  similarityThreshold: 0.3,
  maxCitationsPerSentence: 3,
  useIDFWeighting: true,
};

/**
 * Tracks citations between an LLM-generated answer and retrieved source documents.
 * Emits a 'tracked' event when citation analysis completes.
 *
 * @extends EventEmitter
 */
class CitationTracker extends EventEmitter {
  /**
   * @param {object} [options] - Override default configuration
   * @param {number} [options.similarityThreshold=0.3] - Minimum similarity for a citation match
   * @param {number} [options.maxCitationsPerSentence=3] - Max citations per sentence
   * @param {boolean} [options.useIDFWeighting=true] - Whether to apply IDF weighting
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  /**
   * Normalize a document object to ensure it has a usable text content string.
   * Looks for .content, .text, or .chunk fields. If .chunk is a function, calls it and joins the result.
   * @param {object} doc
   * @returns {object} Normalized doc with .content field
   * @private
   */
  _normalizeDoc(doc) {
    if (doc.content && typeof doc.content === 'string') return doc;

    let content = '';
    if (typeof doc.text === 'string') {
      content = doc.text;
    } else if (typeof doc.chunk === 'function') {
      const chunks = doc.chunk();
      content = Array.isArray(chunks) ? chunks.join(' ') : String(chunks);
    } else if (typeof doc.chunk === 'string') {
      content = doc.chunk;
    }

    return { ...doc, content };
  }

  /**
   * Track citations for an answer against retrieved documents.
   *
   * @param {string} answer - The LLM-generated answer text
   * @param {Array<object>} retrievedDocs - Array of source documents (each should have .content, .text, or .chunk)
   * @returns {{
   *   citations: Array<{sentence: string, sources: Array<{docId: string|undefined, docIndex: number, score: number}>}>,
   *   groundednessScore: number,
   *   hallucinationReport: object,
   *   metadata: {sentenceCount: number, docCount: number, config: object}
   * }}
   * @fires CitationTracker#tracked
   */
  track(answer, retrievedDocs) {
    // 1. Validate inputs
    if (!answer || typeof answer !== 'string') {
      throw new Error(
        'CitationTracker.track(): answer must be a non-empty string',
      );
    }
    if (!Array.isArray(retrievedDocs) || retrievedDocs.length === 0) {
      throw new Error(
        'CitationTracker.track(): retrievedDocs must be a non-empty array',
      );
    }

    // 2. Normalize docs
    const docs = retrievedDocs.map((doc) => this._normalizeDoc(doc));

    // 3. Split answer into sentences
    const sentences = splitSentences(answer);
    if (sentences.length === 0) {
      const result = {
        citations: [],
        groundednessScore: 0,
        hallucinationReport: detectHallucinations([]),
        metadata: {
          sentenceCount: 0,
          docCount: docs.length,
          config: this.config,
        },
      };
      this.emit('tracked', result);
      return result;
    }

    // 4. Build IDF weights if enabled
    const idfWeights = this.config.useIDFWeighting
      ? buildIDFWeights(docs)
      : null;

    // 5 & 6. Map each sentence to sources and build citations array
    const citations = sentences.map((sentence) => {
      const sources = mapSentenceToSources(sentence, docs, {
        maxCitations: this.config.maxCitationsPerSentence,
        threshold: this.config.similarityThreshold,
        idfWeights,
      });

      return {
        sentence,
        sources: sources.map((s) => ({
          docId: s.docId,
          docIndex: s.docIndex,
          score: s.score,
        })),
      };
    });

    // 7. Detect hallucinations
    const hallucinationReport = detectHallucinations(citations, {
      threshold: this.config.similarityThreshold,
    });

    // 8. Compute groundedness score
    const groundedCount = hallucinationReport.summary.grounded;
    const groundednessScore =
      sentences.length > 0 ? groundedCount / sentences.length : 0;

    // 9. Emit 'tracked' event
    const result = {
      citations,
      groundednessScore,
      hallucinationReport,
      metadata: {
        sentenceCount: sentences.length,
        docCount: docs.length,
        config: this.config,
      },
    };

    /**
     * @event CitationTracker#tracked
     * @type {object}
     */
    this.emit('tracked', result);

    // 10. Return result
    return result;
  }
}

module.exports = { CitationTracker, DEFAULT_CONFIG };
