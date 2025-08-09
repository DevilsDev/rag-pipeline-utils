/**
 * Integration Templates
 * 
 * Pre-built connectors and templates for popular services and platforms.
 * Provides ready-to-use configurations for common RAG pipeline integrations.
 */

const fs = require('fs').promises; // eslint-disable-line global-require
const path = require('path'); // eslint-disable-line global-require

class IntegrationTemplates {
  constructor() {
    this.templates = new Map();
    this.categories = new Map();
    
    this.initializeTemplates();
  }
  
  /**
   * Initialize built-in integration templates
   */
  initializeTemplates() {
    // Data Source Templates
    this.addTemplate('confluence', {
      name: 'Atlassian Confluence',
      category: 'data-sources',
      description: 'Connect to Confluence spaces and pages',
      _type: 'loader',
      _config: {
        baseUrl: { _type: 'string', required: true, description: 'Confluence base URL' },
        username: { _type: 'string', required: true, description: 'Username or email' },
        apiToken: { _type: 'string', required: true, secret: true, description: 'API token' },
        spaceKey: { _type: 'string', required: false, description: 'Specific space key (optional)' },
        pageLimit: { _type: 'number', default: 100, description: 'Maximum pages to fetch' }
      },
      dependencies: ['axios'],
      usage: 'Load documents from Confluence spaces and pages'
    });
    
    this.addTemplate('notion', {
      name: 'Notion Database',
      category: 'data-sources',
      description: 'Connect to Notion databases and pages',
      _type: 'loader',
      _config: {
        apiToken: { _type: 'string', required: true, secret: true, description: 'Notion API token' },
        databaseId: { _type: 'string', required: true, description: 'Database ID to query' },
        filter: { _type: 'object', required: false, description: 'Query filter (optional)' },
        pageSize: { _type: 'number', default: 100, description: 'Results per page' }
      },
      dependencies: ['@notionhq/client'],
      usage: 'Load documents from Notion databases'
    });
    
    this.addTemplate('sharepoint', {
      name: 'Microsoft SharePoint',
      category: 'data-sources',
      description: 'Connect to SharePoint document libraries',
      _type: 'loader',
      _config: {
        siteUrl: { _type: 'string', required: true, description: 'SharePoint site URL' },
        clientId: { _type: 'string', required: true, description: 'Azure app client ID' },
        clientSecret: { _type: 'string', required: true, secret: true, description: 'Azure app client secret' },
        tenantId: { _type: 'string', required: true, description: 'Azure tenant ID' },
        libraryName: { _type: 'string', default: 'Documents', description: 'Document library name' }
      },
      dependencies: ['@microsoft/microsoft-graph-client', '@azure/identity'],
      usage: 'Load documents from SharePoint libraries'
    });
    
    // Vector Database Templates
    this.addTemplate('pinecone', {
      name: 'Pinecone Vector Database',
      category: 'vector-stores',
      description: 'Connect to Pinecone for vector storage and retrieval',
      _type: 'retriever',
      _config: {
        apiKey: { _type: 'string', required: true, secret: true, description: 'Pinecone API key' },
        environment: { _type: 'string', required: true, description: 'Pinecone environment' },
        indexName: { _type: 'string', required: true, description: 'Index name' },
        topK: { _type: 'number', default: 5, description: 'Number of results to return' },
        includeMetadata: { _type: 'boolean', default: true, description: 'Include metadata in results' }
      },
      dependencies: ['@pinecone-database/pinecone'],
      usage: 'Store and retrieve vectors from Pinecone'
    });
    
    this.addTemplate('weaviate', {
      name: 'Weaviate Vector Database',
      category: 'vector-stores',
      description: 'Connect to Weaviate for semantic search',
      _type: 'retriever',
      _config: {
        host: { _type: 'string', required: true, description: 'Weaviate host URL' },
        apiKey: { _type: 'string', required: false, secret: true, description: 'API key (if required)' },
        className: { _type: 'string', required: true, description: 'Weaviate class name' },
        limit: { _type: 'number', default: 5, description: 'Number of results to return' }
      },
      dependencies: ['weaviate-ts-client'],
      usage: 'Semantic search with Weaviate'
    });
    
    // LLM Provider Templates
    this.addTemplate('openai-gpt4', {
      name: 'OpenAI GPT-4',
      category: 'llm-providers',
      description: 'OpenAI GPT-4 language model integration',
      _type: 'llm',
      _config: {
        apiKey: { _type: 'string', required: true, secret: true, description: 'OpenAI API key' },
        model: { _type: 'string', default: 'gpt-4', description: 'Model name' },
        temperature: { _type: 'number', default: 0.7, description: 'Sampling temperature' },
        maxTokens: { _type: 'number', default: 1000, description: 'Maximum tokens to generate' },
        systemPrompt: { _type: 'string', required: false, description: 'System prompt' }
      },
      dependencies: ['openai'],
      usage: 'Generate responses using OpenAI GPT-4'
    });
    
    this.addTemplate('anthropic-claude', {
      name: 'Anthropic Claude',
      category: 'llm-providers',
      description: 'Anthropic Claude language model integration',
      _type: 'llm',
      _config: {
        apiKey: { _type: 'string', required: true, secret: true, description: 'Anthropic API key' },
        model: { _type: 'string', default: 'claude-3-sonnet-20240229', description: 'Model name' },
        maxTokens: { _type: 'number', default: 1000, description: 'Maximum tokens to generate' },
        systemPrompt: { _type: 'string', required: false, description: 'System prompt' }
      },
      dependencies: ['@anthropic-ai/sdk'],
      usage: 'Generate responses using Anthropic Claude'
    });
    
    // Embedding Provider Templates
    this.addTemplate('openai-embeddings', {
      name: 'OpenAI Embeddings',
      category: 'embedding-providers',
      description: 'OpenAI text embedding models',
      _type: 'embedder',
      _config: {
        apiKey: { _type: 'string', required: true, secret: true, description: 'OpenAI API key' },
        model: { _type: 'string', default: 'text-embedding-3-small', description: 'Embedding model' },
        batchSize: { _type: 'number', default: 100, description: 'Batch size for processing' }
      },
      dependencies: ['openai'],
      usage: 'Generate text embeddings using OpenAI'
    });
    
    // Monitoring & Analytics Templates
    this.addTemplate('datadog', {
      name: 'Datadog Monitoring',
      category: 'monitoring',
      description: 'Send metrics and logs to Datadog',
      _type: 'monitor',
      _config: {
        apiKey: { _type: 'string', required: true, secret: true, description: 'Datadog API key' },
        site: { _type: 'string', default: 'datadoghq.com', description: 'Datadog site' },
        service: { _type: 'string', default: 'rag-pipeline', description: 'Service name' },
        environment: { _type: 'string', default: 'production', description: 'Environment' }
      },
      dependencies: ['node-statsd', 'axios'],
      usage: 'Monitor pipeline performance with Datadog'
    });
    
    // Initialize categories
    this.categories.set('data-sources', {
      name: 'Data Sources',
      description: 'Connectors for various data sources and content management systems'
    });
    
    this.categories.set('vector-stores', {
      name: 'Vector Databases',
      description: 'Vector database integrations for semantic search'
    });
    
    this.categories.set('llm-providers', {
      name: 'LLM Providers',
      description: 'Language model provider integrations'
    });
    
    this.categories.set('embedding-providers', {
      name: 'Embedding Providers',
      description: 'Text embedding service integrations'
    });
    
    this.categories.set('monitoring', {
      name: 'Monitoring & Analytics',
      description: 'Monitoring, logging, and analytics integrations'
    });
  }
  
  /**
   * Add a new template
   */
  addTemplate(id, template) {
    this.templates.set(id, {
      id,
      ...template,
      created: new Date().toISOString()
    });
  }
  
  /**
   * Get template by ID
   */
  getTemplate(id) {
    return this.templates.get(id);
  }
  
  /**
   * Get all templates
   */
  getAllTemplates() {
    return Array.from(this.templates.values());
  }
  
  /**
   * Get templates by category
   */
  getTemplatesByCategory(category) {
    return Array.from(this.templates.values()).filter(template => 
      template.category === category
    );
  }
  
  /**
   * Get templates by _type
   */
  getTemplatesByType(_type) {
    return Array.from(this.templates.values()).filter(template => 
      template._type === _type
    );
  }
  
  /**
   * Search templates
   */
  searchTemplates(query) {
    const searchTerm = query.toLowerCase();
    return Array.from(this.templates.values()).filter(template =>
      template.name.toLowerCase().includes(searchTerm) ||
      template.description.toLowerCase().includes(searchTerm) ||
      template.category.toLowerCase().includes(searchTerm)
    );
  }
  
  /**
   * Generate integration code from template
   */
  generateIntegration(templateId, _config = {}) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    // Validate required config
    const missingRequired = [];
    Object.entries(template._config).forEach(([key, configDef]) => {
      if (configDef.required && !_config[key]) {
        missingRequired.push(key);
      }
    });
    
    if (missingRequired.length > 0) {
      throw new Error(`Missing required configuration: ${missingRequired.join(', ')}`);
    }
    
    // Merge with defaults
    const finalConfig = {};
    Object.entries(template._config).forEach(([key, configDef]) => {
      finalConfig[key] = _config[key] !== undefined ? _config[key] : configDef.default;
    });
    
    return {
      name: template.name,
      _type: template._type,
      _config: finalConfig,
      dependencies: template.dependencies || [],
      usage: template.usage,
      setupInstructions: this.generateSetupInstructions(template, finalConfig)
    };
  }
  
  /**
   * Generate setup instructions
   */
  generateSetupInstructions(template, _config) {
    const instructions = [];
    
    instructions.push(`# ${template.name} Integration Setup`);
    instructions.push('');
    instructions.push('## 1. Install Dependencies');
    instructions.push('```bash');
    instructions.push(`npm install ${template.dependencies.join(' ')}`);
    instructions.push('```');
    instructions.push('');
    instructions.push('## 2. Configuration');
    instructions.push('```javascript');
    instructions.push(`const _config = ${JSON.stringify(_config, null, 2)};`);
    instructions.push('```');
    instructions.push('');
    instructions.push('## 3. Usage');
    instructions.push(`${template.usage}`);
    
    return instructions.join('\n');
  }
  
  /**
   * Get all categories
   */
  getAllCategories() {
    return Array.from(this.categories.values());
  }
  
  /**
   * Export template as file
   */
  async exportTemplate(templateId, outputDir = './templates') {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    await fs.mkdir(outputDir, { recursive: true });
    
    const _filePath = path.join(outputDir, `${templateId}.json`);
    await fs.writeFile(_filePath, JSON.stringify(template, null, 2));
    
    return _filePath;
  }
  
  /**
   * Import template from file
   */
  async importTemplate(_filePath) {
    const data = await fs.readFile(_filePath, 'utf8');
    const template = JSON.parse(data);
    
    if (!template.id) {
      throw new Error('Template must have an id field');
    }
    
    this.addTemplate(template.id, template);
    return template.id;
  }
  
  /**
   * Get template statistics
   */
  getStatistics() {
    const templates = Array.from(this.templates.values());
    const categories = {};
    const types = {};
    
    templates.forEach(template => {
      categories[template.category] = (categories[template.category] || 0) + 1;
      types[template._type] = (types[template._type] || 0) + 1;
    });
    
    return {
      totalTemplates: templates.length,
      categoryCounts: categories,
      typeCounts: types,
      totalCategories: this.categories.size
    };
  }
}

module.exports = IntegrationTemplates;
