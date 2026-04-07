'use strict';

/**
 * @module templates/template-registry
 * @description Registry of built-in project templates for RAG pipeline scaffolding.
 */

/** @type {Object<string, Object>} Built-in template definitions */
const TEMPLATES = {
  'document-qa': {
    name: 'Document Q&A',
    description: 'Question answering over documents (PDF, Markdown, HTML)',
    dependencies: { '@devilsdev/rag-pipeline-utils': 'latest' },
    devDependencies: {},
    config: {
      pipeline: {
        loader: 'markdown',
        embedder: 'openai',
        retriever: 'memory',
        llm: 'openai',
      },
      options: { topK: 5, citations: true, evaluate: true },
    },
    files: {
      'index.js': [
        '// Document Q&A Pipeline',
        'const { createRagPipeline, ChunkingEngine } = require(\'@devilsdev/rag-pipeline-utils\');',
        '',
        '// Configure your pipeline',
        'const pipeline = createRagPipeline({',
        '  // Add your plugins here',
        '  // loader: new YourLoader(),',
        '  // embedder: new YourEmbedder({ apiKey: process.env.OPENAI_API_KEY }),',
        '  // retriever: new YourRetriever(),',
        '  // llm: new YourLLM({ apiKey: process.env.OPENAI_API_KEY }),',
        '});',
        '',
        'async function main() {',
        '  const result = await pipeline.run({',
        '    query: \'What does this document say?\',',
        '    options: { citations: true, evaluate: true },',
        '  });',
        '  console.log(\'Answer:\', result.answer);',
        '  if (result.citations) {',
        '    console.log(\'Groundedness:\', result.citations.groundednessScore);',
        '  }',
        '}',
        '',
        'main().catch(console.error);',
      ].join('\n'),
      'README.md': [
        '# Document Q&A Pipeline',
        '',
        'A RAG pipeline for answering questions about your documents.',
        '',
        '## Setup',
        '',
        '1. Install dependencies: `npm install`',
        '2. Set your API key: `export OPENAI_API_KEY=your-key`',
        '3. Run: `node index.js`',
      ].join('\n'),
    },
  },
  chatbot: {
    name: 'Chatbot',
    description: 'Conversational chatbot with document context',
    dependencies: { '@devilsdev/rag-pipeline-utils': 'latest' },
    devDependencies: {},
    config: {
      pipeline: { embedder: 'openai', retriever: 'memory', llm: 'openai' },
      options: { topK: 3, stream: true },
    },
    files: {
      'index.js': [
        '// Chatbot Pipeline',
        'const { createRagPipeline } = require(\'@devilsdev/rag-pipeline-utils\');',
        '',
        'const pipeline = createRagPipeline({',
        '  // Configure your chatbot plugins',
        '});',
        '',
        'async function chat(question) {',
        '  const result = await pipeline.run({',
        '    query: question,',
        '    options: { stream: false },',
        '  });',
        '  return result.results;',
        '}',
        '',
        '// Example usage',
        'chat(\'Hello, how can you help me?\').then(console.log).catch(console.error);',
      ].join('\n'),
      'README.md': [
        '# Chatbot Pipeline',
        '',
        'A conversational RAG chatbot.',
        '',
        '## Setup',
        '',
        '1. `npm install`',
        '2. `export OPENAI_API_KEY=your-key`',
        '3. `node index.js`',
      ].join('\n'),
    },
  },
  'code-search': {
    name: 'Code Search',
    description: 'Search and explain code repositories',
    dependencies: { '@devilsdev/rag-pipeline-utils': 'latest' },
    devDependencies: {},
    config: {
      pipeline: {
        loader: 'directory',
        embedder: 'openai',
        retriever: 'memory',
        llm: 'openai',
      },
      options: { topK: 10 },
    },
    files: {
      'index.js': [
        '// Code Search Pipeline',
        'const { createRagPipeline, ChunkingEngine } = require(\'@devilsdev/rag-pipeline-utils\');',
        '',
        'const chunker = new ChunkingEngine({ strategy: \'structure-aware\', chunkSize: 1024 });',
        '',
        'const pipeline = createRagPipeline({',
        '  // Configure for code search',
        '});',
        '',
        'async function searchCode(query) {',
        '  const result = await pipeline.run({ query, options: { topK: 10 } });',
        '  return result.results;',
        '}',
        '',
        'searchCode(\'How does authentication work?\').then(console.log).catch(console.error);',
      ].join('\n'),
      'README.md': [
        '# Code Search Pipeline',
        '',
        'Search and explain code in your repository.',
        '',
        '## Setup',
        '',
        '1. `npm install`',
        '2. `export OPENAI_API_KEY=your-key`',
        '3. `node index.js`',
      ].join('\n'),
    },
  },
  'customer-support': {
    name: 'Customer Support',
    description: 'AI-powered customer support with knowledge base',
    dependencies: { '@devilsdev/rag-pipeline-utils': 'latest' },
    devDependencies: {},
    config: {
      pipeline: {
        loader: 'markdown',
        embedder: 'openai',
        retriever: 'memory',
        llm: 'openai',
      },
      options: { topK: 5, citations: true, guardrails: true },
    },
    files: {
      'index.js': [
        '// Customer Support Pipeline',
        'const { createRagPipeline, GuardrailsPipeline } = require(\'@devilsdev/rag-pipeline-utils\');',
        '',
        'const basePipeline = createRagPipeline({',
        '  // Configure your support pipeline',
        '});',
        '',
        '// Wrap with guardrails for production safety',
        'const pipeline = new GuardrailsPipeline(basePipeline, {',
        '  preRetrieval: { enableInjectionDetection: true },',
        '  postGeneration: { enablePIIDetection: true, enableGroundednessCheck: true },',
        '});',
        '',
        'async function handleTicket(question) {',
        '  const result = await pipeline.run({ query: question });',
        '  return { answer: result.answer, sources: result.citations, safe: result.guardrails };',
        '}',
        '',
        'handleTicket(\'How do I reset my password?\').then(console.log).catch(console.error);',
      ].join('\n'),
      'README.md': [
        '# Customer Support Pipeline',
        '',
        'AI-powered support with guardrails and citations.',
        '',
        '## Setup',
        '',
        '1. `npm install`',
        '2. `export OPENAI_API_KEY=your-key`',
        '3. `node index.js`',
      ].join('\n'),
    },
  },
};

/**
 * Registry of built-in and custom project templates.
 *
 * @example
 * const registry = new TemplateRegistry();
 * const templates = registry.list();
 * const template = registry.get('document-qa');
 */
class TemplateRegistry {
  constructor() {
    /** @type {Map<string, Object>} */
    this.templates = new Map(Object.entries(TEMPLATES));
  }

  /**
   * List all available templates.
   *
   * @returns {Array<{key: string, name: string, description: string}>} Summary of each template
   */
  list() {
    return Array.from(this.templates.entries()).map(([key, t]) => ({
      key,
      name: t.name,
      description: t.description,
    }));
  }

  /**
   * Get a full template definition by key.
   *
   * @param {string} templateKey - Template identifier
   * @returns {Object|null} Full template object, or null if not found
   */
  get(templateKey) {
    return this.templates.get(templateKey) || null;
  }

  /**
   * Register a custom template.
   *
   * @param {string} key - Template identifier
   * @param {Object} template - Template definition
   * @param {string} template.name - Display name
   * @param {string} template.description - Short description
   * @param {Object} template.dependencies - npm dependencies
   * @param {Object} template.config - Pipeline configuration
   * @param {Object} template.files - Map of filename to file content
   * @returns {void}
   */
  register(key, template) {
    if (!key || typeof key !== 'string') {
      throw new TypeError('Template key must be a non-empty string');
    }
    if (!template || !template.name || !template.files) {
      throw new TypeError('Template must have a name and files');
    }
    this.templates.set(key, template);
  }

  /**
   * Check if a template exists.
   *
   * @param {string} key - Template identifier
   * @returns {boolean} Whether the template is registered
   */
  has(key) {
    return this.templates.has(key);
  }
}

module.exports = { TemplateRegistry, TEMPLATES };
