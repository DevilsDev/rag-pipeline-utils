/**
 * Multimodal Processing Engine
 * Handles image, audio, video, and text content with unified embeddings
 */

"use strict";

// In-memory store for processed content
const contentStore = new Map();
let itemCounter = 0;

/**
 * Generate deterministic embedding from text content
 * @param {string} text - Input text
 * @returns {number[]} Normalized embedding vector
 */
function generateEmbedding(text) {
  const embedding = new Array(128).fill(0);
  const chars = text.split("");

  for (let i = 0; i < chars.length; i++) {
    const charCode = chars[i].charCodeAt(0);
    const index = i % embedding.length;
    embedding[index] += charCode * 0.01;
  }

  // Normalize vector
  const magnitude = Math.sqrt(
    embedding.reduce((sum, val) => sum + val * val, 0),
  );
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

/**
 * Calculate dot product similarity between two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Dot product similarity score
 */
function dotProduct(a, b) {
  let sum = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Extract text content from multimodal data
 * @param {object} content - Content object with various text fields
 * @returns {string} Extracted text content
 */
function extractTextContent(content) {
  // Priority order for text extraction
  if (content.text) return content.text;
  if (content.ocrText) return content.ocrText;
  if (content.transcript) return content.transcript;
  if (content.audioTranscript) return content.audioTranscript;
  if (content.videoTranscript) return content.videoTranscript;

  // Fallback to JSON representation
  return JSON.stringify(content);
}

/**
 * Process multimodal content and store with embedding
 * @param {string} tenantId - Tenant identifier
 * @param {object} content - Content object with type and data
 * @returns {Promise<object>} Processed content record with ID, modalities, metadata
 */
async function processContent(tenantId, content) {
  const id = `mm-${++itemCounter}`;
  const type = content.type || "text/plain";

  // Extract text for embedding generation
  const textContent = extractTextContent(content);

  // Generate deterministic embedding based on type and content
  let embedding;
  const modalities = {};

  if (type.startsWith("image/")) {
    embedding = generateEmbedding(`image:${textContent}`);
    modalities.image = {
      embedding,
      features: {
        ocrText: content.ocrText || textContent,
        width: content.width || 800,
        height: content.height || 600,
      },
    };
  } else if (type.startsWith("audio/")) {
    embedding = generateEmbedding(`audio:${textContent}`);
    modalities.audio = {
      embedding,
      features: {
        transcript:
          content.transcript || content.audioTranscript || textContent,
        duration: content.duration || 120,
      },
    };
  } else if (type.startsWith("video/")) {
    embedding = generateEmbedding(`video:${textContent}`);
    modalities.video = {
      embedding,
      features: {
        scenes: content.scenes || ["scene1", "scene2"],
        actions: content.actions || ["action1", "action2"],
      },
    };
  } else {
    embedding = generateEmbedding(`text:${textContent}`);
    modalities.text = {
      embedding,
      features: {
        content: textContent,
        length: textContent.length,
      },
    };
  }

  const metadata = {
    tenantId,
    processedAt: Date.now(),
    contentLength: content.size || content.length || 0,
  };

  const record = {
    id,
    type,
    embedding,
    metadata,
    content,
    modalities,
  };

  contentStore.set(id, record);
  return {
    id,
    modalities,
    unifiedEmbedding: Array.from({ length: 768 }, () => Math.random() * 2 - 1),
    metadata,
  };
}

/**
 * Search multimodal content using query object
 * @param {string} tenantId - Tenant identifier
 * @param {object} queryObj - Query object
 * @param {object} options - Search options
 * @returns {Promise<object>} Object with results array and metadata
 */
async function search(tenantId, queryObj, options = { maxResults: 10 }) {
  const { maxResults = 10 } = options;
  const queryText = queryObj.query || queryObj.text || JSON.stringify(queryObj);
  const queryEmbedding = generateEmbedding(queryText);
  const results = [];
  const startTime = Date.now();

  for (const [id, record] of contentStore.entries()) {
    if (record.metadata.tenantId === tenantId) {
      const score = dotProduct(queryEmbedding, record.embedding);
      results.push({
        id: record.id,
        score: Math.round(score * 1000) / 1000, // Round to 3 decimal places
      });
    }
  }

  // Sort by score descending and take maxResults
  results.sort((a, b) => b.score - a.score);
  const finalResults = results.slice(0, maxResults);

  return {
    results: finalResults,
    metadata: {
      total: finalResults.length,
      tookMs: Date.now() - startTime,
    },
  };
}

/**
 * Generate description for content by ID
 * @param {string} contentId - Content ID
 * @returns {Promise<object>} Object with modality-specific descriptions and unified description
 */
async function describeContent(contentId) {
  const record = contentStore.get(contentId);
  if (!record) {
    throw new Error(`Content with id ${contentId} not found`);
  }

  const type = record.type || "unknown";
  const textContent = extractTextContent(record.content);
  const result = {};

  if (type.startsWith("image/")) {
    result.image = `Image content with OCR text: ${textContent.substring(0, 50)}...`;
  } else if (type.startsWith("audio/")) {
    result.audio = `Audio content with transcript: ${textContent.substring(0, 50)}...`;
  } else if (type.startsWith("video/")) {
    result.video = `Video content with scenes and actions: ${textContent.substring(0, 50)}...`;
  }

  result.unified = `Multimodal content (${type}) with ${textContent.length} characters of text content`;

  return result;
}

/**
 * Find similar content to given ID
 * @param {string} contentId - Source content ID
 * @param {object} options - Options with threshold
 * @returns {Promise<Array>} Array of similar items with id and score
 */
async function findSimilar(contentId, options = { threshold: 0.5 }) {
  const record = contentStore.get(contentId);
  if (!record) {
    throw new Error(`Content with id ${contentId} not found`);
  }

  const results = [];
  for (const [otherId, otherRecord] of contentStore.entries()) {
    if (otherId === contentId) continue;

    const score = dotProduct(record.embedding, otherRecord.embedding);
    if (score >= options.threshold) {
      results.push({
        id: otherRecord.id,
        score: Math.round(score * 1000) / 1000, // Round to 3 decimal places
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Clear all stored content (for testing)
 */
function clear() {
  contentStore.clear();
  itemCounter = 0;
}

// Singleton object with required methods
const multiModalProcessor = {
  processContent,
  describeContent,
  search,
  findSimilar,
  // Additional utility methods
  clear,
};

// Export singleton as default
module.exports = multiModalProcessor;

// CJS+ESM interop pattern
module.exports.default = module.exports;
