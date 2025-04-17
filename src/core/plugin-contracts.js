/**
 * Version: 1.0.0
 * Description: Shared plugin interface contracts for runtime + CI mock validation
 * Author: Ali Kahwaji
 */

export const pluginContracts = {
    loader: {
      requiredMethods: ['load'],
    },
    embedder: {
      requiredMethods: ['embed', 'embedQuery'],
    },
    retriever: {
      requiredMethods: ['store', 'search'],
    },
    llm: {
      requiredMethods: ['ask'],
    },
  };
  