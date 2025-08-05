# Troubleshooting Guide

This comprehensive troubleshooting guide helps you diagnose and resolve common issues with **@DevilsDev/rag-pipeline-utils**. From installation problems to performance optimization, this guide provides step-by-step solutions and debugging strategies.

---

## 🔧 **Installation & Setup Issues**

### **1. Package Installation Failures**

**Problem**: `npm install @DevilsDev/rag-pipeline-utils` fails with dependency errors.

**Solutions**:
```bash
# Clear npm cache
npm cache clean --force

# Use specific Node.js version (18+ required)
nvm use 18
npm install @DevilsDev/rag-pipeline-utils

# Install with legacy peer deps
npm install @DevilsDev/rag-pipeline-utils --legacy-peer-deps

# Force resolution of conflicting dependencies
npm install @DevilsDev/rag-pipeline-utils --force
```

**Common Dependency Conflicts**:
- **OpenAI SDK version mismatch**: Ensure OpenAI SDK v4+ is installed
- **Node.js version**: Requires Node.js 18+ for ES modules support
- **Python dependencies**: Some embedders require Python 3.8+ for native modules

### **2. Configuration File Issues**

**Problem**: `.ragrc.json` configuration not being loaded or invalid format.

**Diagnostic Commands**:
```bash
# Validate configuration
rag-pipeline config validate

# Show current config location and values
rag-pipeline config show --verbose

# Initialize default configuration
rag-pipeline config init --force
```

**Common Configuration Errors**:
```json
// ❌ Invalid: Missing required fields
{
  "embedder": "openai"
}

// ✅ Valid: Complete configuration
{
  "plugins": {
    "embedder": {
      "name": "openai",
      "config": {
        "apiKey": "${OPENAI_API_KEY}",
        "model": "text-embedding-ada-002"
      }
    }
  }
}
```

### **3. Environment Variable Issues**

**Problem**: API keys and environment variables not being recognized.

**Debug Steps**:
```bash
# Check environment variables
echo $OPENAI_API_KEY
echo $PINECONE_API_KEY

# Test environment loading
node -e "console.log(process.env.OPENAI_API_KEY)"

# Use dotenv for local development
npm install dotenv
echo "OPENAI_API_KEY=your-key-here" > .env
```

**Environment Variable Precedence**:
1. Command-line arguments (`--api-key`)
2. Environment variables (`OPENAI_API_KEY`)
3. Configuration file (`.ragrc.json`)
4. Default values

---

## 🔌 **Plugin & Integration Issues**

### **1. Plugin Loading Failures**

**Problem**: Custom plugins not loading or throwing runtime errors.

**Diagnostic Commands**:
```bash
# List available plugins
rag-pipeline plugins list

# Validate plugin
rag-pipeline plugins validate ./my-plugin --strict

# Test plugin in isolation
rag-pipeline plugins test ./my-plugin --test-data ./sample.json
```

**Common Plugin Issues**:
- **Missing exports**: Ensure plugin exports required methods
- **Contract violations**: Plugin doesn't implement required interface
- **Dependency conflicts**: Plugin dependencies conflict with core

**Plugin Debugging**:
```javascript
// Enable plugin debugging
process.env.DEBUG = 'rag-pipeline:plugins';

// Add logging to plugin
class MyPlugin {
  async load(filePath) {
    console.log(`Loading file: ${filePath}`);
    try {
      const result = await this.processFile(filePath);
      console.log(`Successfully loaded: ${result.length} chunks`);
      return result;
    } catch (error) {
      console.error(`Plugin error: ${error.message}`);
      throw error;
    }
  }
}
```

### **2. API Integration Problems**

**Problem**: External API calls failing (OpenAI, Pinecone, etc.).

**OpenAI API Issues**:
```bash
# Test API connectivity
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models

# Check rate limits
rag-pipeline query "test" --verbose --llm openai-gpt-3.5-turbo
```

**Pinecone API Issues**:
```bash
# Test Pinecone connection
curl -H "Api-Key: $PINECONE_API_KEY" \
  https://controller.pinecone.io/databases

# Verify index exists
rag-pipeline status --component retriever --detailed
```

**Common API Error Codes**:
- **401 Unauthorized**: Invalid API key
- **429 Rate Limited**: Too many requests
- **503 Service Unavailable**: API service down
- **400 Bad Request**: Invalid request format

---

## 📊 **Performance & Memory Issues**

### **1. Slow Embedding Generation**

**Problem**: Embedding generation taking too long or timing out.

**Performance Optimization**:
```javascript
// Enable parallel processing
const pipeline = createRagPipeline({
  embedder: {
    name: 'openai',
    config: {
      batchSize: 100,        // Process in batches
      maxConcurrency: 5,     // Parallel requests
      timeout: 30000         // 30 second timeout
    }
  }
});

// Monitor performance
rag-pipeline benchmark --component embedder --queries 100
```

**Batch Processing Strategy**:
```bash
# Process large documents in chunks
rag-pipeline ingest ./large-docs \
  --batch-size 50 \
  --parallel 3 \
  --chunk-size 1000 \
  --progress
```

### **2. Memory Usage Issues**

**Problem**: High memory consumption or out-of-memory errors.

**Memory Optimization**:
```javascript
// Enable streaming for large documents
const pipeline = createRagPipeline({
  streaming: true,
  memoryLimit: '2GB',
  chunkSize: 1000,
  batchSize: 10
});

// Monitor memory usage
process.on('warning', (warning) => {
  console.warn('Memory warning:', warning);
});
```

**Memory Monitoring**:
```bash
# Monitor memory during processing
rag-pipeline ingest ./docs --memory-monitor --verbose

# Set memory limits
node --max-old-space-size=4096 rag-pipeline ingest ./large-dataset
```

### **3. Vector Store Performance**

**Problem**: Slow retrieval or indexing performance.

**Index Optimization**:
```bash
# Rebuild index with optimized settings
rag-pipeline rebuild --chunk-size 1500 --parallel 4

# Check index statistics
rag-pipeline status --component retriever --stats

# Optimize vector store
rag-pipeline optimize --component retriever
```

---

## 🔍 **Query & Retrieval Issues**

### **1. Poor Retrieval Quality**

**Problem**: Retrieved context not relevant to queries.

**Debugging Steps**:
```bash
# Test retrieval with debug output
rag-pipeline query "your question" --debug --include-sources

# Analyze retrieval scores
rag-pipeline query "test query" --top-k 10 --min-score 0.7 --verbose
```

**Retrieval Tuning**:
```json
{
  "retriever": {
    "name": "pinecone",
    "config": {
      "topK": 5,
      "minScore": 0.75,
      "includeMetadata": true,
      "filter": {
        "category": "technical"
      }
    }
  }
}
```

### **2. LLM Generation Issues**

**Problem**: Generated responses are poor quality or inconsistent.

**Response Quality Debugging**:
```bash
# Test with different models
rag-pipeline query "test" --llm openai-gpt-4
rag-pipeline query "test" --llm openai-gpt-3.5-turbo

# Adjust generation parameters
rag-pipeline query "test" \
  --temperature 0.3 \
  --max-tokens 1000 \
  --top-p 0.9
```

**Prompt Engineering**:
```javascript
// Custom prompt template
const pipeline = createRagPipeline({
  llm: {
    name: 'openai-gpt-4',
    config: {
      systemPrompt: `You are a helpful assistant. Use the provided context to answer questions accurately and concisely.`,
      temperature: 0.3,
      maxTokens: 1500
    }
  }
});
```

---

## 🧪 **Evaluation & Testing Issues**

### **1. Evaluation Metric Failures**

**Problem**: Evaluation metrics returning NaN or unexpected values.

**Metric Debugging**:
```bash
# Test individual metrics
rag-pipeline evaluate ./test-queries.json --metrics bleu --verbose
rag-pipeline evaluate ./test-queries.json --metrics rouge --debug

# Validate test data format
rag-pipeline validate-dataset ./test-queries.json
```

**Data Format Validation**:
```javascript
// Ensure proper test data format
const testData = [
  {
    "id": "test-001",
    "prompt": "What is RAG?",
    "groundTruth": "RAG stands for Retrieval-Augmented Generation...",
    "category": "definition"
  }
];

// Validate before evaluation
import { validateDataset } from '@DevilsDev/rag-pipeline-utils';
const validation = await validateDataset(testData);
if (!validation.isValid) {
  console.error('Invalid test data:', validation.errors);
}
```

### **2. Dashboard Connection Issues**

**Problem**: Evaluation dashboard not loading or displaying data.

**Dashboard Debugging**:
```bash
# Start dashboard with debug logging
DEBUG=rag-pipeline:dashboard rag-pipeline dashboard --port 3000

# Check data file format
rag-pipeline dashboard --data ./results.json --validate

# Test with sample data
rag-pipeline dashboard --sample-data --port 3000
```

---

## 🛠️ **CLI & Command Issues**

### **1. Command Not Found**

**Problem**: `rag-pipeline` command not recognized.

**Solutions**:
```bash
# Global installation
npm install -g @DevilsDev/rag-pipeline-utils

# Use npx for local installation
npx @DevilsDev/rag-pipeline-utils --help

# Check PATH
echo $PATH | grep node_modules

# Reinstall CLI
npm uninstall -g @DevilsDev/rag-pipeline-utils
npm install -g @DevilsDev/rag-pipeline-utils
```

### **2. Permission Errors**

**Problem**: Permission denied when running CLI commands.

**Solutions**:
```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm

# Use npx instead of global install
npx @DevilsDev/rag-pipeline-utils init my-project

# Run with appropriate permissions
sudo rag-pipeline clear --all --confirm
```

---

## 📝 **Logging & Debugging**

### **Enable Debug Logging**

```bash
# Enable all debug logs
DEBUG=rag-pipeline:* rag-pipeline query "test"

# Enable specific component logs
DEBUG=rag-pipeline:embedder rag-pipeline ingest ./docs
DEBUG=rag-pipeline:retriever rag-pipeline query "test"
DEBUG=rag-pipeline:llm rag-pipeline query "test"

# Save logs to file
rag-pipeline query "test" --verbose > debug.log 2>&1
```

### **Custom Logging Configuration**

```javascript
import { createLogger } from '@DevilsDev/rag-pipeline-utils';

const logger = createLogger({
  level: 'debug',
  format: 'json',
  transports: [
    { type: 'console' },
    { type: 'file', filename: 'rag-pipeline.log' }
  ]
});

// Use custom logger
const pipeline = createRagPipeline({
  logger,
  logLevel: 'debug'
});
```

---

## 🔄 **Recovery & Maintenance**

### **Reset Pipeline State**

```bash
# Clear all data and caches
rag-pipeline clear --all --confirm

# Rebuild from scratch
rag-pipeline rebuild --force

# Reset configuration
rag-pipeline config init --force --overwrite
```

### **Backup & Restore**

```bash
# Export current state
rag-pipeline export --output backup-$(date +%Y%m%d).json

# Import from backup
rag-pipeline import backup-20241201.json --merge

# Verify integrity
rag-pipeline doctor --comprehensive
```

---

## 📞 **Getting Help**

### **Built-in Diagnostics**

```bash
# Run comprehensive health check
rag-pipeline doctor

# Get system information
rag-pipeline --version --verbose

# Check component status
rag-pipeline status --all --detailed
```

### **Community Support**

- **GitHub Issues**: [Report bugs and feature requests](https://github.com/DevilsDev/rag-pipeline-utils/issues)
- **Documentation**: [Complete documentation](https://docs.rag-pipeline-utils.dev)
- **Discord**: [Join our community](https://discord.gg/rag-pipeline-utils)
- **Stack Overflow**: Tag questions with `rag-pipeline-utils`

### **Professional Support**

For enterprise support and consulting:
- **Email**: support@devilsdev.com
- **Enterprise Portal**: [enterprise.rag-pipeline-utils.dev](https://enterprise.rag-pipeline-utils.dev)

---

*This troubleshooting guide covers the most common issues encountered with @DevilsDev/rag-pipeline-utils. For additional help, consult the [FAQ](./FAQ.md) or reach out to our community support channels.*
