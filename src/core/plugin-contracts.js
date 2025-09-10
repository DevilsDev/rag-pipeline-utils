/**
 * Version: 2.0.0
 * Description: Shared plugin interface contracts for runtime + CI mock validation
 * Author: Ali Kahwaji
 */

const pluginContracts = {
  loader: {
    requiredMethods: ['load'],
    methodSignatures: {
      load: {
        params: ['_filePath'],
        paramTypes: ['string'],
        returnType: 'Promise<Array<{chunk: () => string[]}>>',
        description: 'Load and parse a document from the given file path',
      },
    },
  },
  embedder: {
    requiredMethods: ['embed', 'embedQuery'],
    methodSignatures: {
      embed: {
        params: ['chunks'],
        paramTypes: ['string[]'],
        returnType: 'Promise<number[][]>',
        description: 'Generate embeddings for an array of text chunks',
      },
      embedQuery: {
        params: ['query'],
        paramTypes: ['string'],
        returnType: 'Promise<number[]>',
        description: 'Generate embedding for a single query string',
      },
    },
  },
  retriever: {
    requiredMethods: ['store', 'retrieve'],
    methodSignatures: {
      store: {
        params: ['vectors'],
        paramTypes: ['number[][]'],
        returnType: 'Promise<void>',
        description: 'Store vectors in the retrieval system',
      },
      retrieve: {
        params: ['queryVector'],
        paramTypes: ['number[]'],
        returnType: 'Promise<string[]>',
        description: 'Retrieve relevant context based on query vector',
      },
    },
  },
  llm: {
    requiredMethods: ['generate'],
    optionalMethods: ['generateStream'],
    methodSignatures: {
      generate: {
        params: ['prompt', 'context'],
        paramTypes: ['string', 'string[]'],
        returnType: 'Promise<string>',
        description: 'Generate response based on prompt and retrieved context',
      },
      generateStream: {
        params: ['prompt', 'context'],
        paramTypes: ['string', 'string[]'],
        returnType: 'AsyncIterable<string>',
        description:
          'Generate streaming response token-by-token based on prompt and retrieved context',
      },
    },
  },
  reranker: {
    requiredMethods: ['rerank'],
    methodSignatures: {
      rerank: {
        params: ['query', 'documents'],
        paramTypes: ['string', 'string[]'],
        returnType: 'Promise<string[]>',
        description: 'Rerank documents based on relevance to query',
      },
    },
  },
};

// Default export

module.exports = {
  pluginContracts,
};
