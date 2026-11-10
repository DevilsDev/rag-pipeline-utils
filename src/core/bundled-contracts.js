'use strict';

/**
 * The plugin contracts (contract-schema.json and the *-contract.json files in
 * contracts/) as data in a source file, so they are inside every bundle: the
 * scoped packages ship dist/ only, and a registry that read contracts/ from
 * disk found nothing there and checked no plugin. A test keeps this equal to
 * the JSON files.
 */

const schema = {
  '$schema': 'http://json-schema.org/draft-07/schema#',
  '$id': 'https://github.com/devilsdev/rag-pipeline-utils/schemas/contract.json',
  'title': 'Plugin Contract Schema',
  'description': 'Schema for validating plugin contract specifications in the RAG pipeline utilities',
  'type': 'object',
  'required': [
    'type',
    'version',
    'title',
    'description',
    'methods',
    'properties',
    'required'
  ],
  'properties': {
    '$schema': {
      'type': 'string',
      'description': 'JSON Schema specification URI'
    },
    'type': {
      'type': 'string',
      'description': 'Plugin type identifier',
      'enum': [
        'loader',
        'embedder',
        'retriever',
        'llm',
        'reranker',
        'evaluator'
      ]
    },
    'version': {
      'type': 'string',
      'description': 'Contract version (semantic versioning)',
      'pattern': '^\\d+\\.\\d+\\.\\d+$'
    },
    'title': {
      'type': 'string',
      'description': 'Human-readable contract title',
      'minLength': 1
    },
    'description': {
      'type': 'string',
      'description': 'Contract description',
      'minLength': 1
    },
    'methods': {
      'type': 'array',
      'description': 'Array of method specifications',
      'minItems': 1,
      'items': {
        'type': 'object',
        'required': [
          'name',
          'parameters',
          'returns'
        ],
        'properties': {
          'name': {
            'type': 'string',
            'description': 'Method name',
            'pattern': '^[a-zA-Z_][a-zA-Z0-9_]*$'
          },
          'parameters': {
            'type': 'array',
            'description': 'Method parameter names',
            'items': {
              'type': 'string',
              'pattern': '^[a-zA-Z_][a-zA-Z0-9_]*$'
            }
          },
          'returns': {
            'type': 'string',
            'description': 'Return type description',
            'minLength': 1
          }
        },
        'additionalProperties': false
      }
    },
    'properties': {
      'type': 'object',
      'description': 'Detailed method property specifications',
      'minProperties': 1,
      'patternProperties': {
        '^[a-zA-Z_][a-zA-Z0-9_]*$': {
          'type': 'object',
          'required': [
            'type',
            'description'
          ],
          'properties': {
            'type': {
              'type': 'string',
              'description': 'Property type',
              'enum': [
                'function',
                'string',
                'number',
                'boolean',
                'object',
                'array'
              ]
            },
            'description': {
              'type': 'string',
              'description': 'Property description',
              'minLength': 1
            },
            'parameters': {
              'type': 'object',
              'description': 'Parameter schema (for function properties)',
              'properties': {
                'type': {
                  'const': 'object'
                },
                'properties': {
                  'type': 'object'
                },
                'required': {
                  'type': 'array',
                  'items': {
                    'type': 'string'
                  }
                }
              }
            },
            'returns': {
              'type': 'object',
              'description': 'Return value schema (for function properties)'
            }
          },
          'additionalProperties': true
        }
      },
      'additionalProperties': false
    },
    'required': {
      'type': 'array',
      'description': 'List of required methods',
      'minItems': 1,
      'items': {
        'type': 'string',
        'pattern': '^[a-zA-Z_][a-zA-Z0-9_]*$'
      },
      'uniqueItems': true
    }
  },
  'additionalProperties': false,
  'examples': [
    {
      '$schema': 'http://json-schema.org/draft-07/schema#',
      'type': 'loader',
      'version': '1.0.0',
      'title': 'Loader Contract',
      'description': 'Contract for loader plugins',
      'methods': [
        {
          'name': 'load',
          'parameters': [
            'source'
          ],
          'returns': 'documents'
        }
      ],
      'properties': {
        'load': {
          'type': 'function',
          'description': 'Load documents from source',
          'parameters': {
            'type': 'object',
            'properties': {
              'source': {
                'type': 'string',
                'description': 'Source path or identifier'
              }
            },
            'required': [
              'source'
            ]
          },
          'returns': {
            'type': 'array',
            'items': {
              'type': 'object',
              'properties': {
                'id': {
                  'type': 'string'
                },
                'content': {
                  'type': 'string'
                },
                'metadata': {
                  'type': 'object'
                }
              },
              'required': [
                'id',
                'content'
              ]
            }
          }
        }
      },
      'required': [
        'load'
      ]
    }
  ]
};

const contracts = {
  'loader': {
    '$schema': 'http://json-schema.org/draft-07/schema#',
    'type': 'loader',
    'version': '1.0.0',
    'title': 'Loader Contract',
    'description': 'Contract for loader plugins',
    'methods': [
      {
        'name': 'load',
        'parameters': [
          'source'
        ],
        'returns': 'documents'
      }
    ],
    'properties': {
      'load': {
        'type': 'function',
        'description': 'Load and parse a document from the given file path',
        'parameters': {
          'type': 'object',
          'properties': {
            'source': {
              'type': 'string',
              'description': 'File path to the document to load'
            }
          },
          'required': [
            'source'
          ]
        },
        'returns': {
          'type': 'array',
          'items': {
            'type': 'object',
            'properties': {
              'chunk': {
                'type': 'function',
                'description': 'Split the document into text chunks',
                'returns': {
                  'type': 'array',
                  'items': {
                    'type': 'string'
                  }
                }
              }
            },
            'required': [
              'chunk'
            ]
          }
        }
      }
    },
    'required': [
      'load'
    ]
  },
  'embedder': {
    '$schema': 'http://json-schema.org/draft-07/schema#',
    'type': 'embedder',
    'version': '1.0.0',
    'title': 'Embedder Contract',
    'description': 'Contract for embedder plugins',
    'methods': [
      {
        'name': 'embed',
        'parameters': [
          'chunks'
        ],
        'returns': 'vectors'
      }
    ],
    'properties': {
      'embed': {
        'type': 'function',
        'description': 'Generate embeddings for text chunks',
        'parameters': {
          'type': 'object',
          'properties': {
            'chunks': {
              'type': 'array',
              'items': {
                'type': 'object',
                'properties': {
                  'id': {
                    'type': 'string'
                  },
                  'content': {
                    'type': 'string'
                  }
                },
                'required': [
                  'id',
                  'content'
                ]
              }
            }
          },
          'required': [
            'chunks'
          ]
        },
        'returns': {
          'type': 'array',
          'items': {
            'type': 'object',
            'properties': {
              'id': {
                'type': 'string'
              },
              'vector': {
                'type': 'array',
                'items': {
                  'type': 'number'
                }
              }
            },
            'required': [
              'id',
              'vector'
            ]
          }
        }
      }
    },
    'required': [
      'embed'
    ]
  },
  'retriever': {
    '$schema': 'http://json-schema.org/draft-07/schema#',
    'type': 'retriever',
    'version': '1.0.0',
    'title': 'Retriever Contract',
    'description': 'Contract for retriever plugins',
    'methods': [
      {
        'name': 'store',
        'parameters': [
          'vectors'
        ],
        'returns': 'success'
      },
      {
        'name': 'retrieve',
        'parameters': [
          'query',
          'k'
        ],
        'returns': 'results'
      }
    ],
    'properties': {
      'store': {
        'type': 'function',
        'description': 'Store vectors in the retrieval system',
        'parameters': {
          'type': 'object',
          'properties': {
            'vectors': {
              'type': 'array',
              'items': {
                'type': 'object',
                'properties': {
                  'id': {
                    'type': 'string'
                  },
                  'vector': {
                    'type': 'array',
                    'items': {
                      'type': 'number'
                    }
                  },
                  'metadata': {
                    'type': 'object'
                  }
                },
                'required': [
                  'id',
                  'vector'
                ]
              }
            }
          },
          'required': [
            'vectors'
          ]
        }
      },
      'retrieve': {
        'type': 'function',
        'description': 'Retrieve relevant vectors',
        'parameters': {
          'type': 'object',
          'properties': {
            'query': {
              'type': 'string'
            },
            'k': {
              'type': 'number',
              'default': 10
            }
          },
          'required': [
            'query'
          ]
        },
        'returns': {
          'type': 'array',
          'items': {
            'type': 'object',
            'properties': {
              'id': {
                'type': 'string'
              },
              'score': {
                'type': 'number'
              },
              'metadata': {
                'type': 'object'
              }
            },
            'required': [
              'id',
              'score'
            ]
          }
        }
      }
    },
    'required': [
      'store',
      'retrieve'
    ]
  },
  'llm': {
    '$schema': 'http://json-schema.org/draft-07/schema#',
    'type': 'llm',
    'version': '1.0.0',
    'title': 'LLM Contract',
    'description': 'Contract for LLM plugins',
    'methods': [
      {
        'name': 'generate',
        'parameters': [
          'prompt'
        ],
        'returns': 'response'
      }
    ],
    'properties': {
      'generate': {
        'type': 'function',
        'description': 'Generate text response',
        'parameters': {
          'type': 'object',
          'properties': {
            'prompt': {
              'type': 'string'
            },
            'context': {
              'type': 'array',
              'items': {
                'type': 'string'
              }
            },
            'options': {
              'type': 'object'
            }
          },
          'required': [
            'prompt'
          ]
        },
        'returns': {
          'type': 'string'
        }
      }
    },
    'required': [
      'generate'
    ]
  },
  'reranker': {
    '$schema': 'http://json-schema.org/draft-07/schema#',
    'type': 'reranker',
    'version': '1.0.0',
    'title': 'Reranker Contract',
    'description': 'Contract for reranker plugins',
    'methods': [
      {
        'name': 'rerank',
        'parameters': [
          'query',
          'documents'
        ],
        'returns': 'documents'
      }
    ],
    'properties': {
      'rerank': {
        'type': 'function',
        'description': 'Rerank documents based on relevance to query',
        'parameters': {
          'type': 'object',
          'properties': {
            'query': {
              'type': 'string',
              'description': 'The search query to rank documents against'
            },
            'documents': {
              'type': 'array',
              'items': {
                'type': 'object',
                'properties': {
                  'text': {
                    'type': 'string'
                  },
                  'content': {
                    'type': 'string'
                  }
                }
              },
              'description': 'Array of retrieved documents to rerank'
            },
            'options': {
              'type': 'object',
              'properties': {
                'topK': {
                  'type': 'number',
                  'description': 'Maximum number of top documents to return'
                }
              }
            }
          },
          'required': [
            'query',
            'documents'
          ]
        },
        'returns': {
          'type': 'array',
          'items': {
            'type': 'object',
            'properties': {
              'text': {
                'type': 'string'
              },
              'content': {
                'type': 'string'
              }
            }
          }
        }
      }
    },
    'required': [
      'rerank'
    ]
  }
};

module.exports = { schema, contracts };
