/**
 * Visual Pipeline Builder
 * 
 * Web-based drag-and-drop interface for creating and configuring RAG pipelines.
 * Provides visual representation of pipeline components and their connections.
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class VisualPipelineBuilder extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      port: options.port || 3001,
      host: options.host || 'localhost',
      autoSave: options.autoSave !== false,
      theme: options.theme || 'light',
      ...options
    };
    
    this.pipelines = new Map();
    this.components = new Map();
    this.connections = new Map();
    this.isRunning = false;
    
    this.initializeComponents();
  }
  
  /**
   * Initialize available pipeline components
   */
  initializeComponents() {
    const defaultComponents = [
      {
        id: 'loader',
        type: 'input',
        name: 'Document Loader',
        description: 'Load documents from various sources',
        inputs: [],
        outputs: ['documents'],
        config: {
          source: { type: 'string', required: true },
          format: { type: 'select', options: ['json', 'txt', 'pdf', 'docx'] }
        }
      },
      {
        id: 'embedder',
        type: 'processor',
        name: 'Text Embedder',
        description: 'Generate embeddings for text content',
        inputs: ['documents'],
        outputs: ['embeddings'],
        config: {
          model: { type: 'string', default: 'openai' },
          dimensions: { type: 'number', default: 1536 }
        }
      },
      {
        id: 'retriever',
        type: 'processor',
        name: 'Document Retriever',
        description: 'Retrieve relevant documents based on query',
        inputs: ['embeddings', 'query'],
        outputs: ['results'],
        config: {
          topK: { type: 'number', default: 5 },
          threshold: { type: 'number', default: 0.7 }
        }
      },
      {
        id: 'llm',
        type: 'processor',
        name: 'Language Model',
        description: 'Generate responses using LLM',
        inputs: ['results', 'query'],
        outputs: ['response'],
        config: {
          model: { type: 'string', default: 'gpt-3.5-turbo' },
          temperature: { type: 'number', default: 0.7 },
          maxTokens: { type: 'number', default: 1000 }
        }
      },
      {
        id: 'reranker',
        type: 'processor',
        name: 'Result Reranker',
        description: 'Rerank search results for better relevance',
        inputs: ['results'],
        outputs: ['rankedResults'],
        config: {
          model: { type: 'string', default: 'cross-encoder' },
          topK: { type: 'number', default: 3 }
        }
      },
      {
        id: 'evaluator',
        type: 'output',
        name: 'Response Evaluator',
        description: 'Evaluate response quality and metrics',
        inputs: ['response', 'query'],
        outputs: ['metrics'],
        config: {
          metrics: { type: 'array', default: ['bleu', 'rouge', 'relevance'] }
        }
      }
    ];
    
    defaultComponents.forEach(component => {
      this.components.set(component.id, component);
    });
  }
  
  /**
   * Create a new pipeline
   */
  createPipeline(name, description = '') {
    const pipelineId = `pipeline_${Date.now()}`;
    const pipeline = {
      id: pipelineId,
      name,
      description,
      components: [],
      connections: [],
      config: {},
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    };
    
    this.pipelines.set(pipelineId, pipeline);
    this.emit('pipelineCreated', { pipelineId, pipeline });
    
    return pipelineId;
  }
  
  /**
   * Add component to pipeline
   */
  addComponent(pipelineId, componentType, position = { x: 0, y: 0 }, config = {}) {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    
    const componentTemplate = this.components.get(componentType);
    if (!componentTemplate) {
      throw new Error(`Component type ${componentType} not found`);
    }
    
    const componentId = `${componentType}_${Date.now()}`;
    const component = {
      id: componentId,
      type: componentType,
      position,
      config: { ...componentTemplate.config, ...config },
      inputs: [...componentTemplate.inputs],
      outputs: [...componentTemplate.outputs]
    };
    
    pipeline.components.push(component);
    pipeline.modified = new Date().toISOString();
    
    this.emit('componentAdded', { pipelineId, componentId, component });
    
    if (this.options.autoSave) {
      this.savePipeline(pipelineId);
    }
    
    return componentId;
  }
  
  /**
   * Connect two components
   */
  connectComponents(pipelineId, sourceId, sourceOutput, targetId, targetInput) {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    
    const sourceComponent = pipeline.components.find(c => c.id === sourceId);
    const targetComponent = pipeline.components.find(c => c.id === targetId);
    
    if (!sourceComponent || !targetComponent) {
      throw new Error('Source or target component not found');
    }
    
    if (!sourceComponent.outputs.includes(sourceOutput)) {
      throw new Error(`Source component does not have output: ${sourceOutput}`);
    }
    
    if (!targetComponent.inputs.includes(targetInput)) {
      throw new Error(`Target component does not have input: ${targetInput}`);
    }
    
    const connectionId = `conn_${Date.now()}`;
    const connection = {
      id: connectionId,
      source: { componentId: sourceId, output: sourceOutput },
      target: { componentId: targetId, input: targetInput }
    };
    
    pipeline.connections.push(connection);
    pipeline.modified = new Date().toISOString();
    
    this.emit('connectionCreated', { pipelineId, connectionId, connection });
    
    if (this.options.autoSave) {
      this.savePipeline(pipelineId);
    }
    
    return connectionId;
  }
  
  /**
   * Validate pipeline configuration
   */
  validatePipeline(pipelineId) {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    
    const errors = [];
    const warnings = [];
    
    // Check for disconnected components
    const connectedComponents = new Set();
    pipeline.connections.forEach(conn => {
      connectedComponents.add(conn.source.componentId);
      connectedComponents.add(conn.target.componentId);
    });
    
    pipeline.components.forEach(component => {
      if (!connectedComponents.has(component.id) && pipeline.components.length > 1) {
        warnings.push(`Component ${component.id} is not connected`);
      }
      
      // Check required configuration
      const template = this.components.get(component.type);
      if (template) {
        Object.entries(template.config).forEach(([key, configDef]) => {
          if (configDef.required && !component.config[key]) {
            errors.push(`Component ${component.id} missing required config: ${key}`);
          }
        });
      }
    });
    
    // Check for cycles
    if (this.hasCycles(pipeline)) {
      errors.push('Pipeline contains cycles');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Check for cycles in pipeline
   */
  hasCycles(pipeline) {
    const graph = new Map();
    const visited = new Set();
    const recursionStack = new Set();
    
    // Build adjacency list
    pipeline.components.forEach(component => {
      graph.set(component.id, []);
    });
    
    pipeline.connections.forEach(connection => {
      const sourceId = connection.source.componentId;
      const targetId = connection.target.componentId;
      if (graph.has(sourceId)) {
        graph.get(sourceId).push(targetId);
      }
    });
    
    // DFS cycle detection
    const hasCycleDFS = (nodeId) => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      
      const neighbors = graph.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycleDFS(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }
      
      recursionStack.delete(nodeId);
      return false;
    };
    
    for (const componentId of graph.keys()) {
      if (!visited.has(componentId)) {
        if (hasCycleDFS(componentId)) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  /**
   * Generate pipeline code
   */
  generateCode(pipelineId, format = 'javascript') {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    
    const validation = this.validatePipeline(pipelineId);
    if (!validation.valid) {
      throw new Error(`Pipeline validation failed: ${validation.errors.join(', ')}`);
    }
    
    if (format === 'javascript') {
      return this.generateJavaScriptCode(pipeline);
    } else if (format === 'json') {
      return this.generateJSONConfig(pipeline);
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }
  }
  
  /**
   * Generate JavaScript code for pipeline
   */
  generateJavaScriptCode(pipeline) {
    const imports = new Set();
    const componentInits = [];
    const pipelineSteps = [];
    
    // Sort components topologically
    const sortedComponents = this.topologicalSort(pipeline);
    
    sortedComponents.forEach(component => {
      const template = this.components.get(component.type);
      if (template) {
        imports.add(`const ${template.name.replace(/\s+/g, '')} = require('@devilsdev/rag-pipeline-utils/src/plugins/${component.type}');`);
        
        const configStr = JSON.stringify(component.config, null, 2);
        componentInits.push(`const ${component.id} = new ${template.name.replace(/\s+/g, '')}(${configStr});`);
        
        pipelineSteps.push(`  await ${component.id}.process(context);`);
      }
    });
    
    return `// Generated RAG Pipeline: ${pipeline.name}
// Created: ${pipeline.created}
// Modified: ${pipeline.modified}

${Array.from(imports).join('\n')}

async function ${pipeline.name.replace(/\s+/g, '')}Pipeline(input) {
  const context = { input, results: {} };
  
  // Initialize components
${componentInits.map(init => `  ${init}`).join('\n')}
  
  // Execute pipeline
${pipelineSteps.join('\n')}
  
  return context.results;
}

module.exports = { ${pipeline.name.replace(/\s+/g, '')}Pipeline };`;
  }
  
  /**
   * Generate JSON configuration for pipeline
   */
  generateJSONConfig(pipeline) {
    return JSON.stringify({
      name: pipeline.name,
      description: pipeline.description,
      version: '1.0.0',
      components: pipeline.components.map(component => ({
        id: component.id,
        type: component.type,
        config: component.config
      })),
      connections: pipeline.connections,
      metadata: {
        created: pipeline.created,
        modified: pipeline.modified
      }
    }, null, 2);
  }
  
  /**
   * Topological sort of pipeline components
   */
  topologicalSort(pipeline) {
    const graph = new Map();
    const inDegree = new Map();
    
    // Initialize
    pipeline.components.forEach(component => {
      graph.set(component.id, []);
      inDegree.set(component.id, 0);
    });
    
    // Build graph
    pipeline.connections.forEach(connection => {
      const sourceId = connection.source.componentId;
      const targetId = connection.target.componentId;
      graph.get(sourceId).push(targetId);
      inDegree.set(targetId, inDegree.get(targetId) + 1);
    });
    
    // Kahn's algorithm
    const queue = [];
    const result = [];
    
    inDegree.forEach((degree, componentId) => {
      if (degree === 0) {
        queue.push(componentId);
      }
    });
    
    while (queue.length > 0) {
      const current = queue.shift();
      const component = pipeline.components.find(c => c.id === current);
      result.push(component);
      
      graph.get(current).forEach(neighbor => {
        inDegree.set(neighbor, inDegree.get(neighbor) - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      });
    }
    
    return result;
  }
  
  /**
   * Save pipeline to disk
   */
  async savePipeline(pipelineId) {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    
    const pipelinesDir = path.join(process.cwd(), 'pipelines');
    await fs.mkdir(pipelinesDir, { recursive: true });
    
    const filePath = path.join(pipelinesDir, `${pipelineId}.json`);
    await fs.writeFile(filePath, JSON.stringify(pipeline, null, 2));
    
    this.emit('pipelineSaved', { pipelineId, filePath });
  }
  
  /**
   * Load pipeline from disk
   */
  async loadPipeline(pipelineId) {
    const pipelinesDir = path.join(process.cwd(), 'pipelines');
    const filePath = path.join(pipelinesDir, `${pipelineId}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const pipeline = JSON.parse(data);
      this.pipelines.set(pipelineId, pipeline);
      
      this.emit('pipelineLoaded', { pipelineId, pipeline });
      return pipeline;
    } catch (error) {
      throw new Error(`Failed to load pipeline ${pipelineId}: ${error.message}`);
    }
  }
  
  /**
   * Get all pipelines
   */
  getAllPipelines() {
    return Array.from(this.pipelines.values());
  }
  
  /**
   * Get available components
   */
  getAvailableComponents() {
    return Array.from(this.components.values());
  }
  
  /**
   * Start the visual builder web server
   */
  async startServer() {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }
    
    // This would typically start an Express server with the web interface
    // For now, we'll simulate the server startup
    this.isRunning = true;
    this.emit('serverStarted', { 
      host: this.options.host, 
      port: this.options.port,
      url: `http://${this.options.host}:${this.options.port}`
    });
    
    return {
      host: this.options.host,
      port: this.options.port,
      url: `http://${this.options.host}:${this.options.port}`
    };
  }
  
  /**
   * Stop the visual builder web server
   */
  async stopServer() {
    if (!this.isRunning) {
      throw new Error('Server is not running');
    }
    
    this.isRunning = false;
    this.emit('serverStopped');
  }
  
  /**
   * Get server status
   */
  getServerStatus() {
    return {
      running: this.isRunning,
      host: this.options.host,
      port: this.options.port,
      pipelines: this.pipelines.size,
      components: this.components.size
    };
  }
}

module.exports = VisualPipelineBuilder;
