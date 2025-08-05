# Evaluation Framework

The **@DevilsDev/rag-pipeline-utils** evaluation framework provides a comprehensive suite of metrics, methodologies, and tools for assessing RAG pipeline performance across multiple dimensions. This system enables rigorous testing, benchmarking, and continuous improvement of retrieval-augmented generation systems.

---

## 📊 **Core Evaluation Metrics**

### **1. BLEU Score (Bilingual Evaluation Understudy)**

**Purpose**: Measures n-gram overlap between generated and reference text, originally designed for machine translation evaluation.

**Characteristics**:
- **Range**: 0.0 to 1.0 (higher is better)
- **Strengths**: Fast computation, widely adopted standard
- **Limitations**: Sensitive to exact word matches, may miss semantic equivalence

**Implementation**:
```javascript
import { calculateBLEU } from '@DevilsDev/rag-pipeline-utils';

const bleuScore = calculateBLEU({
  candidate: "The system uses vector embeddings for retrieval",
  reference: "Vector embeddings are used by the system for retrieval",
  nGrams: [1, 2, 3, 4], // BLEU-1 through BLEU-4
  smoothing: true
});

console.log(`BLEU Score: ${bleuScore.overall}`);
console.log(`BLEU-1: ${bleuScore.bleu1}`);
console.log(`BLEU-4: ${bleuScore.bleu4}`);
```

### **2. ROUGE Score (Recall-Oriented Understudy for Gisting Evaluation)**

**Purpose**: Evaluates recall-oriented text summarization and generation quality.

**Variants**:
- **ROUGE-1**: Unigram overlap (word-level recall)
- **ROUGE-2**: Bigram overlap (phrase-level recall)
- **ROUGE-L**: Longest Common Subsequence (structural similarity)
- **ROUGE-W**: Weighted Longest Common Subsequence

**Implementation**:
```javascript
import { calculateROUGE } from '@DevilsDev/rag-pipeline-utils';

const rougeScores = calculateROUGE({
  candidate: "RAG systems combine retrieval with generation for better accuracy",
  reference: "Retrieval-augmented generation improves accuracy by combining retrieval and generation",
  variants: ['rouge-1', 'rouge-2', 'rouge-l'],
  stemming: true,
  stopwordRemoval: true
});

console.log('ROUGE Scores:', {
  'ROUGE-1': rougeScores.rouge1,
  'ROUGE-2': rougeScores.rouge2,
  'ROUGE-L': rougeScores.rougeL
});
```

### **3. BERTScore**

**Purpose**: Uses contextual embeddings (BERT-based) for semantic similarity evaluation, more robust to paraphrasing than n-gram metrics.

**Advantages**:
- Captures semantic meaning beyond surface-level text
- Handles synonyms and paraphrasing effectively
- Correlates better with human judgment

**Implementation**:
```javascript
import { calculateBERTScore } from '@DevilsDev/rag-pipeline-utils';

const bertScore = await calculateBERTScore({
  candidate: "The model leverages transformer architecture",
  reference: "Transformer-based architecture is used by the model",
  model: 'bert-base-uncased', // or 'roberta-base', 'distilbert-base'
  language: 'en',
  rescaleWithBaseline: true
});

console.log('BERTScore:', {
  precision: bertScore.precision,
  recall: bertScore.recall,
  f1: bertScore.f1
});
```

### **4. Semantic Similarity**

**Purpose**: Measures cosine similarity between sentence embeddings to capture semantic meaning.

**Implementation**:
```javascript
import { calculateSemanticSimilarity } from '@DevilsDev/rag-pipeline-utils';

const similarity = await calculateSemanticSimilarity({
  text1: "Vector databases store high-dimensional embeddings",
  text2: "High-dimensional embeddings are stored in vector databases",
  model: 'sentence-transformers/all-MiniLM-L6-v2',
  normalize: true
});

console.log(`Semantic Similarity: ${similarity.score}`);
console.log(`Confidence: ${similarity.confidence}`);
```

### **5. Advanced Metrics**

**Faithfulness**: Measures how well the generated answer is supported by the retrieved context.

```javascript
import { calculateFaithfulness } from '@DevilsDev/rag-pipeline-utils';

const faithfulness = await calculateFaithfulness({
  answer: "The system uses OpenAI embeddings for vector search",
  context: [
    "The pipeline integrates with OpenAI's embedding API",
    "Vector search is performed using cosine similarity"
  ],
  model: 'openai-gpt-4'
});

console.log(`Faithfulness Score: ${faithfulness.score}`);
```

**Answer Relevance**: Evaluates how well the answer addresses the original question.

```javascript
import { calculateAnswerRelevance } from '@DevilsDev/rag-pipeline-utils';

const relevance = await calculateAnswerRelevance({
  question: "How does the retrieval system work?",
  answer: "The retrieval system uses vector embeddings to find similar documents",
  model: 'openai-gpt-4'
});

console.log(`Answer Relevance: ${relevance.score}`);
```

**Context Precision**: Measures the precision of retrieved context chunks.

```javascript
import { calculateContextPrecision } from '@DevilsDev/rag-pipeline-utils';

const precision = await calculateContextPrecision({
  question: "What is RAG?",
  contexts: [
    "RAG combines retrieval and generation",
    "Weather forecast for tomorrow", // irrelevant
    "Retrieval-augmented generation improves accuracy"
  ],
  groundTruthAnswer: "RAG is retrieval-augmented generation"
});

console.log(`Context Precision: ${precision.score}`);
```

---

## 🔬 **Evaluation Methodologies**

### **1. Batch Evaluation**

Evaluate multiple queries systematically:

```javascript
import { evaluateResults, loadTestData } from '@DevilsDev/rag-pipeline-utils';

const testData = await loadTestData('./evaluation-dataset.json');

const results = await evaluateResults({
  queries: testData.queries,
  expectedAnswers: testData.groundTruth,
  pipeline: myRagPipeline,
  metrics: {
    bleu: { nGrams: [1, 2, 3, 4] },
    rouge: { variants: ['rouge-1', 'rouge-2', 'rouge-l'] },
    bertscore: { model: 'bert-base-uncased' },
    semantic: { model: 'sentence-transformers/all-MiniLM-L6-v2' },
    faithfulness: { model: 'openai-gpt-4' },
    answerRelevance: { model: 'openai-gpt-4' },
    contextPrecision: { threshold: 0.7 }
  },
  batchSize: 10,
  parallel: 3
});

console.log('Evaluation Results:', {
  averageScores: results.averageScores,
  totalQueries: results.totalQueries,
  processingTime: results.processingTime,
  failedQueries: results.failedQueries.length
});
```

### **2. A/B Testing Framework**

Compare different pipeline configurations:

```javascript
import { compareConfigurations } from '@DevilsDev/rag-pipeline-utils';

const comparison = await compareConfigurations({
  configurations: {
    'baseline': {
      embedder: 'openai',
      llm: 'openai-gpt-3.5-turbo',
      chunkSize: 1000
    },
    'optimized': {
      embedder: 'openai',
      llm: 'openai-gpt-4',
      chunkSize: 1500,
      reranker: 'cohere'
    }
  },
  testQueries: testData.queries,
  groundTruth: testData.expectedAnswers,
  metrics: ['bleu', 'rouge', 'bertscore', 'faithfulness'],
  statisticalSignificance: true
});

console.log('A/B Test Results:', comparison.summary);
console.log('Statistical Significance:', comparison.significance);
```

### **3. Continuous Evaluation**

Set up automated evaluation pipelines:

```javascript
import { createEvaluationPipeline } from '@DevilsDev/rag-pipeline-utils';

const evaluationPipeline = createEvaluationPipeline({
  schedule: '0 2 * * *', // Daily at 2 AM
  testSuite: './test-suites/regression.json',
  baselineThresholds: {
    bleu: 0.3,
    rouge: 0.4,
    bertscore: 0.8,
    faithfulness: 0.7
  },
  notifications: {
    slack: process.env.SLACK_WEBHOOK,
    email: ['team@company.com']
  },
  reportGeneration: {
    format: ['json', 'html', 'pdf'],
    outputDir: './evaluation-reports'
  }
});

evaluationPipeline.start();
```

---

## 🛠️ **CLI Evaluation Tools**

### **Basic Evaluation**

```bash
# Evaluate with default metrics
rag-pipeline evaluate ./test-queries.json --output results.csv

# Specify custom metrics
rag-pipeline evaluate ./queries.json \
  --metrics bleu,rouge,bertscore,semantic \
  --output detailed-results.json

# Evaluation with ground truth
rag-pipeline evaluate ./queries.json \
  --ground-truth ./expected-answers.json \
  --metrics all \
  --detailed
```

### **Advanced Evaluation Options**

```bash
# Parallel evaluation with custom batch size
rag-pipeline evaluate ./large-test-set.json \
  --batch-size 20 \
  --parallel 4 \
  --timeout 30

# Comparative evaluation
rag-pipeline evaluate ./queries.json \
  --compare-configs baseline.json,optimized.json \
  --output comparison-report.html

# Evaluation with custom models
rag-pipeline evaluate ./queries.json \
  --bertscore-model roberta-large \
  --semantic-model sentence-transformers/all-mpnet-base-v2
```

### **Report Generation**

```bash
# Generate comprehensive HTML report
rag-pipeline evaluate ./queries.json \
  --output-format html \
  --include-charts \
  --include-examples

# Export to multiple formats
rag-pipeline evaluate ./queries.json \
  --output results \
  --formats json,csv,xlsx,html
```

---

## 📈 **Performance Benchmarking**

### **Component Benchmarking**

```javascript
import { benchmarkComponents } from '@DevilsDev/rag-pipeline-utils';

const benchmarks = await benchmarkComponents({
  components: ['embedder', 'retriever', 'llm'],
  testData: {
    documents: './benchmark-docs/',
    queries: './benchmark-queries.json'
  },
  metrics: {
    latency: true,
    throughput: true,
    accuracy: true,
    resourceUsage: true
  },
  loadPatterns: {
    concurrent: [1, 5, 10, 20],
    duration: 300 // seconds
  }
});

console.log('Benchmark Results:', benchmarks.summary);
```

### **End-to-End Performance**

```bash
# Full pipeline benchmark
rag-pipeline benchmark \
  --queries 1000 \
  --concurrent 10 \
  --duration 600 \
  --output benchmark-report.json

# Stress testing
rag-pipeline benchmark --stress \
  --max-concurrent 50 \
  --ramp-up 120 \
  --target-rps 100
```

---

## 📊 **Dataset Format & Management**

### **Standard Dataset Format**

Each entry in your JSON dataset should include:

```json
{
  "id": "query-001",
  "prompt": "What is a vector index?",
  "groundTruth": "A data structure for fast similarity search in vector spaces.",
  "category": "technical",
  "difficulty": "intermediate",
  "metadata": {
    "domain": "machine-learning",
    "expectedLength": "short",
    "requiresContext": true
  }
}
```

### **Dataset Validation**

```javascript
import { validateDataset } from '@DevilsDev/rag-pipeline-utils';

const validation = await validateDataset('./evaluation-dataset.json', {
  requiredFields: ['prompt', 'groundTruth'],
  optionalFields: ['category', 'difficulty', 'metadata'],
  minEntries: 10,
  maxPromptLength: 500,
  maxGroundTruthLength: 1000
});

if (!validation.isValid) {
  console.error('Dataset validation failed:', validation.errors);
}
```

### **Dataset Generation**

```javascript
import { generateSyntheticDataset } from '@DevilsDev/rag-pipeline-utils';

const syntheticData = await generateSyntheticDataset({
  sourceDocuments: './knowledge-base/',
  numQueries: 100,
  questionTypes: ['factual', 'analytical', 'comparative'],
  difficultyLevels: ['easy', 'medium', 'hard'],
  llm: 'openai-gpt-4'
});

console.log(`Generated ${syntheticData.length} synthetic query-answer pairs`);
```

---

## 📊 **Dashboard Visualization**

### **Interactive Dashboard**

Use the React evaluation dashboard:

```bash
# Start the evaluation dashboard
rag-pipeline dashboard --port 3000 --data ./evaluation-results.json

# Or use the built-in dashboard server
node public/server.js
```

Visit: [http://localhost:3000](http://localhost:3000)

**Dashboard Features**:
- **Real-time Metrics**: Live updating evaluation scores
- **Interactive Charts**: BLEU, ROUGE, BERTScore visualizations
- **Query Analysis**: Detailed breakdown of individual queries
- **Comparison Views**: Side-by-side configuration comparisons
- **Export Options**: CSV, JSON, PDF report generation
- **Filtering & Search**: Advanced result filtering capabilities

### **Custom Dashboard Integration**

```javascript
import { createDashboardAPI } from '@DevilsDev/rag-pipeline-utils';

const dashboardAPI = createDashboardAPI({
  dataSource: './evaluation-results.json',
  refreshInterval: 30000, // 30 seconds
  customMetrics: {
    'domain_accuracy': (result) => calculateDomainAccuracy(result),
    'response_completeness': (result) => calculateCompleteness(result)
  }
});

// Serve dashboard data via REST API
app.get('/api/evaluation-data', dashboardAPI.getEvaluationData);
app.get('/api/metrics-summary', dashboardAPI.getMetricsSummary);
```

---

## 🎯 **Best Practices**

### **1. Test Data Quality**

- **Diverse Queries**: Include various question types, complexity levels, and domains
- **High-Quality Ground Truth**: Ensure reference answers are accurate and comprehensive
- **Balanced Dataset**: Represent different use cases and edge cases
- **Regular Updates**: Keep test data current with evolving requirements

### **2. Metric Selection**

- **Multiple Metrics**: Use complementary metrics for comprehensive evaluation
- **Domain-Specific**: Include metrics relevant to your specific use case
- **Human Evaluation**: Supplement automated metrics with human judgment
- **Baseline Comparison**: Establish and maintain performance baselines

### **3. Evaluation Frequency**

- **Continuous Integration**: Run basic evaluations on every code change
- **Nightly Builds**: Comprehensive evaluation suites during off-hours
- **Release Gates**: Thorough evaluation before production deployments
- **Performance Monitoring**: Real-time evaluation in production environments

### **4. Result Analysis**

- **Statistical Significance**: Ensure results are statistically meaningful
- **Error Analysis**: Investigate failure cases and edge conditions
- **Trend Monitoring**: Track performance changes over time
- **Actionable Insights**: Convert evaluation results into improvement actions

---

## 🔧 **Configuration Examples**

### **Comprehensive Evaluation Config**

```json
{
  "evaluation": {
    "metrics": {
      "bleu": {
        "enabled": true,
        "nGrams": [1, 2, 3, 4],
        "smoothing": true,
        "weight": 0.2
      },
      "rouge": {
        "enabled": true,
        "variants": ["rouge-1", "rouge-2", "rouge-l"],
        "stemming": true,
        "stopwordRemoval": true,
        "weight": 0.2
      },
      "bertscore": {
        "enabled": true,
        "model": "bert-base-uncased",
        "rescaleWithBaseline": true,
        "weight": 0.3
      },
      "semantic": {
        "enabled": true,
        "model": "sentence-transformers/all-MiniLM-L6-v2",
        "normalize": true,
        "weight": 0.15
      },
      "faithfulness": {
        "enabled": true,
        "model": "openai-gpt-4",
        "weight": 0.15
      }
    },
    "thresholds": {
      "bleu": 0.3,
      "rouge": 0.4,
      "bertscore": 0.8,
      "semantic": 0.75,
      "faithfulness": 0.7
    },
    "reporting": {
      "formats": ["json", "html", "csv"],
      "includeCharts": true,
      "includeExamples": true,
      "maxExamples": 10
    }
  }
}
```

---

*This comprehensive evaluation framework enables rigorous assessment of RAG pipeline performance across multiple dimensions. For implementation details, see the [Usage Guide](./Usage.md), or explore [CLI Reference](./CLI.md) for command-line evaluation tools.*
