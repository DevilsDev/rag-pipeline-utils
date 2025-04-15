/**
 * Version: 0.1.0
 * File: /src/mocks/pinecone-retriever.js
 * Description: Mock implementation of a Pinecone retriever
 * Author: Ali Kahwaji
 */

export class PineconeRetriever {
    /**
     * Mocks vector storage (no-op).
     */
    async store() {}
  
    /**
     * Returns mock retrieved documents
     * @returns {Promise<Array<{ id: string, text: string, metadata: object }>>}
     */
    async retrieve() {
      return [
        { id: 'a', text: 'Chunk about pine trees', metadata: {} },
        { id: 'b', text: 'Chunk about vectors', metadata: {} },
        { id: 'c', text: 'Chunk about databases', metadata: {} },
      ];
    }
  }