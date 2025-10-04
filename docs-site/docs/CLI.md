# CLI Reference

The **@DevilsDev/rag-pipeline-utils** CLI provides a powerful command-line interface for managing RAG pipelines, ingesting documents, running queries, and evaluating performance. This comprehensive reference covers all available commands, options, and usage patterns.

---

## 📦 Installation & Setup

### **Global Installation**

```bash
# Install globally for system-wide access
npm install -g @DevilsDev/rag-pipeline-utils

# Verify installation
rag-pipeline --version
rag-pipeline --help

# Check available commands
rag-pipeline --help
```

### **Project-Local Usage**

```bash
# Run without global installation
npx @DevilsDev/rag-pipeline-utils <command>

# Or install as dev dependency
npm install --save-dev @DevilsDev/rag-pipeline-utils
npx rag-pipeline <command>
```

### **Shell Completion**

```bash
# Enable bash completion
rag-pipeline completion bash >> ~/.bashrc
source ~/.bashrc

# Enable zsh completion
rag-pipeline completion zsh >> ~/.zshrc
source ~/.zshrc

# Enable fish completion
rag-pipeline completion fish > ~/.config/fish/completions/rag-pipeline.fish
```

---

## 🏗️ Project Management Commands

### **`init` - Initialize New Project**

Create a new RAG project with scaffolding and configuration.

```bash
# Basic project initialization
rag-pipeline init my-rag-project

# Initialize in current directory
rag-pipeline init .

# Use specific template
rag-pipeline init my-project --template enterprise
rag-pipeline init my-project --template minimal
rag-pipeline init my-project --template research

# Initialize with specific plugins
rag-pipeline init my-project --plugins openai,pinecone,pdf-loader

# Skip interactive prompts
rag-pipeline init my-project --yes --template enterprise
```

**Options:**

- `--template <name>`: Use predefined template (enterprise, minimal, research)
- `--plugins <list>`: Comma-separated list of plugins to include
- `--yes, -y`: Skip interactive prompts
- `--force, -f`: Overwrite existing files
- `--git`: Initialize git repository
- `--install`: Run npm install after initialization

### **`config` - Configuration Management**

Manage pipeline configuration settings.

```bash
# Initialize default configuration
rag-pipeline config init

# View current configuration
rag-pipeline config show
rag-pipeline config show --format json
rag-pipeline config show --format yaml

# Set configuration values
rag-pipeline config set openai.apiKey sk-your-key-here
rag-pipeline config set pinecone.environment us-west1-gcp
rag-pipeline config set pipeline.chunkSize 1500

# Get specific configuration value
rag-pipeline config get openai.model

# Unset configuration value
rag-pipeline config unset openai.temperature

# Validate configuration
rag-pipeline config validate
rag-pipeline config validate --strict

# Export configuration
rag-pipeline config export --output config-backup.json

# Import configuration
rag-pipeline config import config-backup.json
```

**Options:**

- `--format <type>`: Output format (json, yaml, table)
- `--global, -g`: Operate on global configuration
- `--local, -l`: Operate on local project configuration
- `--strict`: Enable strict validation mode
- `--output, -o <file>`: Output file for export

---

## 📚 Document Management Commands

### **`ingest` - Document Ingestion**

Load and index documents into the vector store.

```bash
# Ingest single file
rag-pipeline ingest ./document.pdf --loader pdf

# Ingest directory recursively
rag-pipeline ingest ./docs --loader markdown --recursive

# Ingest with glob patterns
rag-pipeline ingest "./docs/**/*.{md,txt,pdf}" --loader auto

# Ingest with custom chunk settings
rag-pipeline ingest ./docs \
  --loader markdown \
  --chunk-size 1500 \
  --chunk-overlap 300 \
  --embedder openai

# Batch ingestion with progress
rag-pipeline ingest ./large-docs \
  --loader pdf \
  --batch-size 10 \
  --progress \
  --parallel 3

# Ingest with metadata
rag-pipeline ingest ./docs \
  --loader markdown \
  --metadata '{"source": "documentation", "version": "2.1.8"}'

# Dry run (validate without ingesting)
rag-pipeline ingest ./docs --loader markdown --dry-run
```

**Options:**

- `--loader <name>`: Document loader to use (pdf, markdown, html, docx, auto)
- `--embedder <name>`: Embedding model to use (openai, cohere, sentence-transformers)
- `--chunk-size <number>`: Size of text chunks (default: 1000)
- `--chunk-overlap <number>`: Overlap between chunks (default: 200)
- `--batch-size <number>`: Number of documents to process in parallel
- `--parallel <number>`: Number of parallel processing threads
- `--recursive, -r`: Process directories recursively
- `--progress, -p`: Show progress bar
- `--metadata <json>`: Additional metadata to attach
- `--dry-run`: Validate without actually ingesting
- `--force, -f`: Overwrite existing documents

### **`status` - Pipeline Status**

View current pipeline status and statistics.

```bash
# Basic status
rag-pipeline status

# Detailed status with metrics
rag-pipeline status --detailed

# Status in JSON format
rag-pipeline status --format json

# Check specific component status
rag-pipeline status --component embedder
rag-pipeline status --component retriever
rag-pipeline status --component llm
```

**Options:**

- `--detailed, -d`: Show detailed statistics
- `--format <type>`: Output format (table, json, yaml)
- `--component <name>`: Check specific component status
- `--refresh`: Force refresh of cached status

---

## 🔍 Query & Interaction Commands

### **`query` - Interactive Querying**

Query the RAG pipeline and get responses.

```bash
# Simple query
rag-pipeline query "What is the plugin architecture?"

# Query with specific LLM
rag-pipeline query "Explain embeddings" --llm openai-gpt-4

# Query with custom parameters
rag-pipeline query "How to optimize performance?" \
  --max-tokens 2000 \
  --temperature 0.3 \
  --top-k 5 \
  --include-sources

# Interactive query mode
rag-pipeline query --interactive

# Streaming response
rag-pipeline query "Explain RAG architecture" --stream

# Query with context filtering
rag-pipeline query "What is caching?" \
  --filter '{"category": "performance"}' \
  --min-confidence 0.7

# Save query results
rag-pipeline query "Plugin development guide" \
  --output query-result.json \
  --include-metadata
```

**Options:**

- `--llm <name>`: Language model to use
- `--max-tokens <number>`: Maximum response tokens
- `--temperature <number>`: Response creativity (0.0-1.0)
- `--top-k <number>`: Number of context chunks to retrieve
- `--include-sources`: Include source documents in response
- `--include-metadata`: Include processing metadata
- `--interactive, -i`: Enter interactive query mode
- `--stream, -s`: Stream response tokens
- `--filter <json>`: Filter context by metadata
- `--min-confidence <number>`: Minimum confidence threshold
- `--output, -o <file>`: Save results to file
- `--format <type>`: Output format (text, json, markdown)

### **`chat` - Interactive Chat Mode**

Start an interactive chat session with the RAG pipeline.

```bash
# Start chat session
rag-pipeline chat

# Chat with specific configuration
rag-pipeline chat --llm openai-gpt-4 --temperature 0.7

# Chat with conversation history
rag-pipeline chat --history ./chat-history.json

# Chat with system prompt
rag-pipeline chat --system "You are a helpful RAG expert assistant."
```

**Options:**

- `--llm <name>`: Language model for chat
- `--temperature <number>`: Response creativity
- `--history <file>`: Load/save conversation history
- `--system <prompt>`: System prompt for the assistant
- `--max-history <number>`: Maximum conversation history length

---

## 📊 Evaluation & Testing Commands

### **`evaluate` - Performance Evaluation**

Run comprehensive evaluation on query sets.

```bash
# Basic evaluation
rag-pipeline evaluate ./test-queries.json

# Evaluation with specific metrics
rag-pipeline evaluate ./queries.json \
  --metrics bleu,rouge,bertscore,semantic \
  --output detailed-results.json

# Evaluation with custom configuration
rag-pipeline evaluate ./queries.json \
  --llm openai-gpt-4 \
  --embedder openai \
  --batch-size 5 \
  --parallel 2

# Comparative evaluation
rag-pipeline evaluate ./queries.json \
  --compare-configs config1.json,config2.json \
  --output comparison-results.csv

# Evaluation with ground truth
rag-pipeline evaluate ./queries.json \
  --ground-truth ./expected-answers.json \
  --metrics all \
  --detailed
```

**Options:**

- `--metrics <list>`: Evaluation metrics (bleu, rouge, bertscore, semantic, all)
- `--output, -o <file>`: Output file for results
- `--format <type>`: Output format (json, csv, xlsx)
- `--batch-size <number>`: Queries to process in parallel
- `--parallel <number>`: Number of parallel threads
- `--compare-configs <list>`: Compare multiple configurations
- `--ground-truth <file>`: Expected answers for comparison
- `--detailed, -d`: Include detailed metrics and analysis
- `--timeout <seconds>`: Query timeout in seconds

### **`benchmark` - Performance Benchmarking**

Run performance benchmarks on pipeline components.

```bash
# Full pipeline benchmark
rag-pipeline benchmark

# Component-specific benchmarks
rag-pipeline benchmark --component embedder
rag-pipeline benchmark --component retriever
rag-pipeline benchmark --component llm

# Benchmark with custom load
rag-pipeline benchmark \
  --queries 100 \
  --concurrent 5 \
  --duration 300

# Stress test
rag-pipeline benchmark --stress \
  --max-concurrent 20 \
  --ramp-up 60
```

**Options:**

- `--component <name>`: Benchmark specific component
- `--queries <number>`: Number of test queries
- `--concurrent <number>`: Concurrent requests
- `--duration <seconds>`: Benchmark duration
- `--stress`: Run stress test
- `--max-concurrent <number>`: Maximum concurrent requests
- `--ramp-up <seconds>`: Gradual load increase duration

### **`dashboard` - Evaluation Dashboard**

Start the interactive evaluation dashboard.

```bash
# Start dashboard on default port
rag-pipeline dashboard

# Start on specific port and host
rag-pipeline dashboard --port 3000 --host 0.0.0.0

# Dashboard with authentication
rag-pipeline dashboard --auth --username admin --password secret

# Dashboard with custom data
rag-pipeline dashboard --data ./evaluation-results.json
```

**Options:**

- `--port, -p <number>`: Port number (default: 3000)
- `--host, -h <address>`: Host address (default: localhost)
- `--auth`: Enable authentication
- `--username <name>`: Dashboard username
- `--password <pass>`: Dashboard password
- `--data <file>`: Load custom evaluation data
- `--open, -o`: Automatically open browser

---

## 🔌 Plugin Management Commands

### **`plugins` - Plugin Operations**

Manage pipeline plugins and extensions.

```bash
# List available plugins
rag-pipeline plugins list
rag-pipeline plugins list --type loader
rag-pipeline plugins list --installed

# Install plugins
rag-pipeline plugins install ./my-custom-plugin
rag-pipeline plugins install @company/rag-plugin-suite
rag-pipeline plugins install https://github.com/user/plugin.git

# Create new plugin
rag-pipeline plugins create my-loader --type loader
rag-pipeline plugins create my-embedder --type embedder --template typescript

# Validate plugin
rag-pipeline plugins validate ./my-plugin
rag-pipeline plugins validate ./my-plugin --strict

# Plugin information
rag-pipeline plugins info openai-embedder
rag-pipeline plugins info ./my-custom-plugin

# Uninstall plugin
rag-pipeline plugins uninstall my-custom-plugin
```

**Options:**

- `--type <name>`: Filter by plugin type
- `--installed`: Show only installed plugins
- `--template <name>`: Plugin template (javascript, typescript)
- `--strict`: Enable strict validation
- `--force, -f`: Force installation/uninstallation

---

## 🛠️ Maintenance Commands

### **`clear` - Clear Data**

Clear pipeline data and caches.

```bash
# Clear vector store
rag-pipeline clear --confirm

# Clear specific components
rag-pipeline clear --cache
rag-pipeline clear --embeddings
rag-pipeline clear --logs

# Clear all data
rag-pipeline clear --all --confirm
```

**Options:**

- `--cache`: Clear cache only
- `--embeddings`: Clear embeddings only
- `--logs`: Clear log files
- `--all`: Clear all data
- `--confirm`: Skip confirmation prompt
- `--force, -f`: Force clear without backup

### **`rebuild` - Rebuild Index**

Rebuild the vector store index.

```bash
# Rebuild index
rag-pipeline rebuild

# Force rebuild
rag-pipeline rebuild --force

# Rebuild with new settings
rag-pipeline rebuild --chunk-size 1500 --embedder openai
```

**Options:**

- `--force, -f`: Force rebuild without confirmation
- `--chunk-size <number>`: New chunk size
- `--embedder <name>`: New embedder to use
- `--parallel <number>`: Parallel processing threads

### **`export` / `import` - Data Management**

Export and import pipeline data.

```bash
# Export pipeline data
rag-pipeline export --output backup.json
rag-pipeline export --format json --compress

# Import pipeline data
rag-pipeline import backup.json
rag-pipeline import backup.json --merge

# Export specific components
rag-pipeline export --components embeddings,config --output partial-backup.json
```

**Options:**

- `--output, -o <file>`: Output file
- `--format <type>`: Export format (json, yaml)
- `--compress, -c`: Compress export file
- `--components <list>`: Specific components to export
- `--merge, -m`: Merge with existing data on import

---

## 🔧 Global Options

These options are available for all commands:

- `--config, -c <file>`: Use specific configuration file
- `--verbose, -v`: Enable verbose output
- `--quiet, -q`: Suppress non-error output
- `--debug`: Enable debug mode
- `--no-color`: Disable colored output
- `--help, -h`: Show command help
- `--version, -V`: Show version information

---

## 📝 Configuration File Integration

The CLI automatically reads configuration from `.ragrc.json` in the current directory or user home directory. You can override settings using command-line options:

```bash
# Use different config file
rag-pipeline query "test" --config ./custom-config.json

# Override config values
rag-pipeline query "test" --llm openai-gpt-4 --temperature 0.5

# Environment variable override
OPENAI_API_KEY=sk-new-key rag-pipeline query "test"
```

---

## 🚀 Advanced Usage Examples

### **Complete Workflow Example**

```bash
# 1. Initialize project
rag-pipeline init my-knowledge-base --template enterprise
cd my-knowledge-base

# 2. Configure pipeline
rag-pipeline config set openai.apiKey $OPENAI_API_KEY
rag-pipeline config set pinecone.apiKey $PINECONE_API_KEY

# 3. Ingest documents
rag-pipeline ingest ./docs --loader markdown --recursive --progress

# 4. Test queries
rag-pipeline query "How does the system work?" --include-sources

# 5. Run evaluation
rag-pipeline evaluate ./test-queries.json --output results.csv

# 6. Start dashboard
rag-pipeline dashboard --port 3000 --open
```

### **Batch Processing Script**

```bash
#!/bin/bash
# Batch process multiple document sets

for dir in ./datasets/*/; do
  echo "Processing $dir"
  rag-pipeline ingest "$dir" --loader auto --batch-size 20 --progress
done

# Run comprehensive evaluation
rag-pipeline evaluate ./all-queries.json --metrics all --detailed --output final-results.json
```

---

## 🏥 Enterprise Commands

### **`doctor` - System Diagnostics**

Comprehensive system health checking and troubleshooting.

```bash
# Run full diagnostic suite
rag-pipeline doctor

# Check specific components
rag-pipeline doctor --check dependencies
rag-pipeline doctor --check configuration
rag-pipeline doctor --check plugins
rag-pipeline doctor --check external-services

# Generate diagnostic report
rag-pipeline doctor --report --output diagnostic-report.json

# Fix common issues automatically
rag-pipeline doctor --fix --auto
```

**Options:**

- `--check <component>`: Check specific component
- `--report`: Generate detailed diagnostic report
- `--output, -o <file>`: Save report to file
- `--fix`: Attempt to fix detected issues
- `--auto`: Apply fixes automatically without prompts

### **`slo` - SLO Management**

Manage Service Level Objectives and monitoring.

```bash
# List defined SLOs
rag-pipeline slo list

# Define new SLO
rag-pipeline slo define availability \
  --objective 0.999 \
  --window 30d \
  --indicator "http_success_rate"

# Check SLO status
rag-pipeline slo status
rag-pipeline slo status --slo availability

# Generate SLO report
rag-pipeline slo report --period monthly --output slo-report.pdf
```

### **`ai-ml` - Advanced AI Operations**

Manage advanced AI capabilities and model training.

```bash
# Multi-modal processing
rag-pipeline ai-ml process-multimodal ./mixed-content \
  --text-weight 0.5 \
  --image-weight 0.3 \
  --table-weight 0.2

# Federated learning coordination
rag-pipeline ai-ml federated-train \
  --participants ./nodes.json \
  --rounds 10 \
  --privacy-budget 1.0

# Adaptive retrieval optimization
rag-pipeline ai-ml optimize-retrieval \
  --strategy performance-based \
  --learning-rate 0.01
```

---

## 🔧 Enhanced Configuration

### **Enterprise `.ragrc.json` Schema**

```json
{
  "pipeline": {
    "loader": "markdown",
    "embedder": "openai",
    "retriever": "pinecone",
    "llm": "openai-gpt-4",
    "useReranker": true
  },
  "enterprise": {
    "dependencyInjection": {
      "enabled": true,
      "container": "default"
    },
    "sloMonitoring": {
      "enabled": true,
      "storage": "prometheus",
      "alerting": {
        "webhook": "${SLACK_WEBHOOK_URL}",
        "channels": ["#rag-alerts"]
      }
    },
    "observability": {
      "structuredLogging": true,
      "correlationIds": true,
      "tracing": {
        "enabled": true,
        "exporter": "jaeger",
        "samplingRate": 0.1
      },
      "metrics": {
        "enabled": true,
        "prefix": "rag_pipeline",
        "exporters": ["prometheus"]
      }
    },
    "security": {
      "authentication": {
        "provider": "azure-ad",
        "tenantId": "${AZURE_TENANT_ID}"
      },
      "auditLogging": {
        "enabled": true,
        "storage": "elasticsearch",
        "retention": "7y"
      }
    }
  },
  "ai": {
    "multiModal": {
      "enabled": true,
      "fusionStrategy": "weighted-average"
    },
    "federatedLearning": {
      "enabled": false,
      "privacyBudget": 1.0
    },
    "adaptiveRetrieval": {
      "enabled": true,
      "strategies": ["semantic", "keyword", "hybrid"]
    }
  },
  "deployment": {
    "kubernetes": {
      "namespace": "rag-pipeline",
      "replicas": 3,
      "resources": {
        "requests": { "memory": "512Mi", "cpu": "250m" },
        "limits": { "memory": "1Gi", "cpu": "500m" }
      }
    },
    "monitoring": {
      "prometheus": true,
      "grafana": true,
      "alertManager": true
    }
  }
}
```

---

## 🐳 Enterprise Docker Usage

### **Production Deployment**

```bash
# Build production image
docker build -t rag-pipeline:enterprise -f Dockerfile.enterprise .

# Run with enterprise features
docker run -d \
  --name rag-pipeline-prod \
  -p 3000:3000 \
  -p 9090:9090 \
  -e NODE_ENV=production \
  -e OPENAI_API_KEY=${OPENAI_API_KEY} \
  -e PINECONE_API_KEY=${PINECONE_API_KEY} \
  -v ./config:/app/config \
  -v ./logs:/app/logs \
  rag-pipeline:enterprise

# Health check
docker exec rag-pipeline-prod rag-pipeline doctor --check all
```

### **Docker Compose Stack**

```yaml
# docker-compose.enterprise.yml
version: "3.8"
services:
  rag-pipeline:
    image: rag-pipeline:enterprise
    ports:
      - "3000:3000"
      - "9090:9090"
    environment:
      - NODE_ENV=production
      - PROMETHEUS_ENABLED=true
      - JAEGER_ENDPOINT=http://jaeger:14268
    depends_on:
      - prometheus
      - jaeger
      - elasticsearch

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9091:9090"
    volumes:
      - ./deployment/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    volumes:
      - ./deployment/grafana/dashboards:/var/lib/grafana/dashboards
```

---

## 🚀 CI/CD Integration

### **GitHub Actions Workflow**

```yaml
# .github/workflows/rag-pipeline-deploy.yml
name: RAG Pipeline Deploy
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm ci

      - name: Run diagnostics
        run: npx rag-pipeline doctor --check all

      - name: Run tests with mocking
        run: npm test
        env:
          RAG_MOCK_EXTERNAL_APIS: true

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Kubernetes
        run: |
          helm upgrade --install rag-pipeline ./deployment/helm/rag-pipeline \
            --set image.tag=${{ github.sha }} \
            --set config.openai.apiKey=${{ secrets.OPENAI_API_KEY }}
```

---

_This comprehensive CLI reference covers all available commands and enterprise features in @DevilsDev/rag-pipeline-utils. For programmatic usage, see the [Usage Guide](./Usage.md), explore [Enterprise Features](./Enterprise.md) for production deployments, or check [Observability](./Observability.md) for monitoring and alerting._
