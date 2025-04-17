/**
 * Mock Pinecone Retriever Plugin
 * Implements: retriever.store(vectors), retriever.search(queryVector)
 */
export default class PineconeRetriever {
  constructor() {
    this._store = [];
  }

  /**
   * Stores embedded vectors.
   * @param {Array<{ id: string, values: number[] }>} vectors
   */
  store(vectors) {
    this._store = vectors;
  }

  /**
   * Searches mock memory and returns matching docs.
   * @param {number[]} queryVector
   * @returns {Array<{ id: string, score: number }>}
   */
  search(queryVector) {
    return this._store.map(v => ({ id: v.id, score: 0.99 }));
  }
}
