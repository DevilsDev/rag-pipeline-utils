/**
 * Mock OpenAI Embedder Plugin
 * Implements: embedder.embed(docs), embedder.embedQuery(query)
 */
class OpenAIEmbedder {
  embed(documents) {
    return documents.map((doc) => ({
      id: doc.id,
      values: [0.1, 0.2, 0.3],
    }));
  }

  embedQuery(query) {
    return [0.1, 0.2, 0.3];
  }
}

module.exports = OpenAIEmbedder;
module.exports.default = OpenAIEmbedder;
