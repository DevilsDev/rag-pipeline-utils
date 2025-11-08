---
sidebar_position: 16
---

# Code Examples

Real-world examples demonstrating common RAG Pipeline Utils use cases.

## Example 1: Document Q&A System

Build a complete document question-answering system with PDF support.

```javascript
const { createRagPipeline } = require("@devilsdev/rag-pipeline-utils");
const PDFLoader = require("./plugins/pdf-loader");
const OpenAIEmbedder = require("./plugins/openai-embedder");
const PineconeRetriever = require("./plugins/pinecone-retriever");
const OpenAILLM = require("./plugins/openai-llm");

async function createDocumentQA() {
  // Initialize pipeline with all components
  const pipeline = createRagPipeline({
    loader: new PDFLoader({
      chunkSize: 1000,
      chunkOverlap: 200,
    }),
    embedder: new OpenAIEmbedder({
      apiKey: process.env.OPENAI_API_KEY,
      model: "text-embedding-ada-002",
    }),
    retriever: new PineconeRetriever({
      apiKey: process.env.PINECONE_API_KEY,
      environment: process.env.PINECONE_ENVIRONMENT,
      indexName: "company-docs",
    }),
    llm: new OpenAILLM({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4",
      temperature: 0.7,
    }),
  });

  // Ingest company documents
  console.log("Ingesting documents...");
  await pipeline.ingest([
    "./docs/employee-handbook.pdf",
    "./docs/benefits-guide.pdf",
    "./docs/company-policies.pdf",
  ]);

  // Query the system
  const questions = [
    "What is the vacation policy?",
    "How do I submit expense reports?",
    "What are the work-from-home guidelines?",
  ];

  for (const question of questions) {
    console.log(`\nQ: ${question}`);
    const result = await pipeline.query(question, { topK: 3 });
    console.log(`A: ${result.text}`);
    console.log(
      `Sources: ${result.sources.map((s) => s.metadata.filename).join(", ")}`,
    );
  }
}

createDocumentQA().catch(console.error);
```

**Output:**

```
Ingesting documents...
✓ Processed 3 documents (245 chunks)

Q: What is the vacation policy?
A: Based on the employee handbook, full-time employees receive 20 days of paid vacation per year. Part-time employees receive prorated vacation time based on hours worked.
Sources: employee-handbook.pdf

Q: How do I submit expense reports?
A: Expense reports should be submitted through the online portal at expenses.company.com within 30 days of the expense date. Include receipts for all expenses over $25.
Sources: employee-handbook.pdf, company-policies.pdf
```

---

## Example 2: Streaming Conversational AI

Implement a streaming chatbot with context awareness.

```javascript
const { createRagPipeline } = require("@devilsdev/rag-pipeline-utils");

async function streamingChatbot() {
  const pipeline = createRagPipeline({
    embedder: new OpenAIEmbedder({
      apiKey: process.env.OPENAI_API_KEY,
    }),
    retriever: new PineconeRetriever({
      apiKey: process.env.PINECONE_API_KEY,
      indexName: "knowledge-base",
    }),
    llm: new OpenAILLM({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4",
      streamingEnabled: true,
    }),
  });

  const conversationHistory = [];

  async function chat(userMessage) {
    console.log(`\nUser: ${userMessage}`);
    process.stdout.write("Assistant: ");

    // Query with streaming enabled
    const stream = await pipeline.query(userMessage, {
      stream: true,
      topK: 5,
      context: conversationHistory,
    });

    let fullResponse = "";

    // Process streaming tokens
    for await (const chunk of stream) {
      if (!chunk.done) {
        process.stdout.write(chunk.token);
        fullResponse += chunk.token;
      }
    }

    console.log("\n");

    // Update conversation history
    conversationHistory.push({
      role: "user",
      content: userMessage,
    });
    conversationHistory.push({
      role: "assistant",
      content: fullResponse,
    });

    return fullResponse;
  }

  // Example conversation
  await chat("What are the main features of RAG Pipeline Utils?");
  await chat("Can you elaborate on the security features?");
  await chat("How does it compare to LangChain?");
}

streamingChatbot().catch(console.error);
```

**Output:**

```
User: What are the main features of RAG Pipeline Utils?
Assistant: RAG Pipeline Utils provides a modular toolkit for building production-ready RAG systems. The main features include:

1. Modular plugin architecture for loaders, embedders, retrievers, and LLMs
2. Enterprise-grade security with JWT validation and input sanitization
3. Advanced observability with metrics, tracing, and audit logs
4. Multi-modal processing for text, images, audio, and video
5. DAG-based workflow engine for complex pipelines
6. Hot reload support for rapid development

User: Can you elaborate on the security features?
Assistant: The security features include advanced JWT validation with replay protection, multi-layer input sanitization to prevent XSS and SQL injection, path traversal defense with iterative URL decoding, and comprehensive audit logging for compliance requirements...
```

---

## Example 3: Enterprise Knowledge Base with Security

Implement a multi-tenant knowledge base with security and governance.

```javascript
const {
  createRagPipeline,
  JWTValidator,
  InputSanitizer,
  AuditLogger,
  DataGovernance,
} = require("@devilsdev/rag-pipeline-utils");

class SecureKnowledgeBase {
  constructor() {
    // Initialize security components
    this.jwtValidator = new JWTValidator({
      secret: process.env.JWT_SECRET,
      algorithm: "HS256",
      issuer: "knowledge-base",
      audience: "api-users",
      strictValidation: true,
      enableJtiTracking: true,
    });

    this.sanitizer = new InputSanitizer({
      throwOnInvalid: true,
      maxLength: 10000,
    });

    this.auditLogger = new AuditLogger({
      backend: "s3",
      bucket: "compliance-logs",
    });

    this.governance = new DataGovernance({
      tenantIdField: "organizationId",
      quotas: {
        "org-1": { maxDocuments: 10000, maxStorage: "5GB" },
        "org-2": { maxDocuments: 50000, maxStorage: "25GB" },
      },
    });

    // Initialize RAG pipeline
    this.pipeline = createRagPipeline({
      embedder: new OpenAIEmbedder({
        apiKey: process.env.OPENAI_API_KEY,
      }),
      retriever: new PineconeRetriever({
        apiKey: process.env.PINECONE_API_KEY,
        indexName: "enterprise-kb",
      }),
      llm: new OpenAILLM({
        apiKey: process.env.OPENAI_API_KEY,
        model: "gpt-4",
      }),
    });
  }

  async authenticate(token) {
    try {
      const payload = await this.jwtValidator.verify(token);
      return payload;
    } catch (error) {
      await this.auditLogger.log({
        action: "auth.failed",
        reason: error.message,
        timestamp: new Date().toISOString(),
      });
      throw new Error("Authentication failed");
    }
  }

  async query(token, question, organizationId) {
    // Authenticate user
    const user = await this.authenticate(token);

    // Verify tenant access
    if (user.organizationId !== organizationId) {
      await this.auditLogger.log({
        action: "access.denied",
        userId: user.sub,
        attemptedOrg: organizationId,
        userOrg: user.organizationId,
        timestamp: new Date().toISOString(),
      });
      throw new Error("Access denied");
    }

    // Sanitize input
    const sanitizedQuestion = this.sanitizer.sanitize(question);

    // Check quotas
    await this.governance.checkQuota(organizationId, "queries");

    // Execute query
    const result = await this.pipeline.query(sanitizedQuestion, {
      topK: 5,
      filters: { organizationId }, // Tenant isolation
    });

    // Log access
    await this.auditLogger.log({
      action: "query.executed",
      userId: user.sub,
      organizationId,
      question: sanitizedQuestion,
      resultCount: result.sources.length,
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  async ingest(token, documents, organizationId) {
    const user = await this.authenticate(token);

    if (user.organizationId !== organizationId) {
      throw new Error("Access denied");
    }

    // Check storage quota
    await this.governance.checkQuota(organizationId, "storage");

    // Sanitize document paths
    const sanitizedPaths = documents.map((doc) =>
      this.sanitizer.sanitizePath(doc.path),
    );

    // Ingest with tenant metadata
    await this.pipeline.ingest(sanitizedPaths, {
      metadata: { organizationId },
    });

    await this.auditLogger.log({
      action: "documents.ingested",
      userId: user.sub,
      organizationId,
      documentCount: documents.length,
      timestamp: new Date().toISOString(),
    });
  }
}

// Usage
async function main() {
  const kb = new SecureKnowledgeBase();

  // User authenticates
  const token = kb.jwtValidator.sign({
    sub: "user-123",
    organizationId: "org-1",
    role: "admin",
  });

  // Ingest documents for org-1
  await kb.ingest(
    token,
    [
      { path: "./org1-docs/product-spec.pdf" },
      { path: "./org1-docs/architecture.pdf" },
    ],
    "org-1",
  );

  // Query with security and audit
  const result = await kb.query(
    token,
    "What is the system architecture?",
    "org-1",
  );

  console.log(result.text);
}

main().catch(console.error);
```

---

## Example 4: Performance-Optimized Batch Processing

Process large document collections with parallel processing and caching.

```javascript
const {
  createRagPipeline,
  ParallelProcessor,
  metrics,
} = require("@devilsdev/rag-pipeline-utils");

async function batchProcessDocuments() {
  const pipeline = createRagPipeline({
    loader: new PDFLoader(),
    embedder: new OpenAIEmbedder({
      apiKey: process.env.OPENAI_API_KEY,
      batchSize: 100, // Batch embedding requests
    }),
    retriever: new PineconeRetriever({
      apiKey: process.env.PINECONE_API_KEY,
      indexName: "large-corpus",
    }),
  });

  // Initialize parallel processor
  const processor = new ParallelProcessor({
    concurrency: 10,
    retryAttempts: 3,
    retryDelay: 1000,
  });

  // Get all PDF files
  const fs = require("fs");
  const path = require("path");
  const docDir = "./large-document-set";
  const files = fs
    .readdirSync(docDir)
    .filter((f) => f.endsWith(".pdf"))
    .map((f) => path.join(docDir, f));

  console.log(`Processing ${files.length} documents...`);

  // Process in parallel batches
  const startTime = Date.now();

  const results = await processor.process(files, async (file) => {
    const docStartTime = Date.now();

    try {
      await pipeline.ingest(file);

      const duration = Date.now() - docStartTime;
      metrics.timing("document.ingest.duration", duration);
      metrics.counter("document.ingest.success");

      return { file, status: "success", duration };
    } catch (error) {
      metrics.counter("document.ingest.error");
      return { file, status: "error", error: error.message };
    }
  });

  const totalDuration = Date.now() - startTime;

  // Summary statistics
  const successful = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;
  const avgDuration =
    results
      .filter((r) => r.status === "success")
      .reduce((sum, r) => sum + r.duration, 0) / successful;

  console.log("\nProcessing Summary:");
  console.log(`Total documents: ${files.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total time: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`Average per document: ${(avgDuration / 1000).toFixed(2)}s`);
  console.log(
    `Throughput: ${(successful / (totalDuration / 1000)).toFixed(2)} docs/sec`,
  );

  // Report metrics
  console.log("\nMetrics:");
  console.log(metrics.report());
}

batchProcessDocuments().catch(console.error);
```

**Output:**

```
Processing 1000 documents...

Processing Summary:
Total documents: 1000
Successful: 995
Failed: 5
Total time: 127.45s
Average per document: 0.13s
Throughput: 7.81 docs/sec

Metrics:
document.ingest.duration: avg=128ms, p95=245ms, p99=389ms
document.ingest.success: 995
document.ingest.error: 5
```

---

## Example 5: Advanced DAG Workflow

Build a complex multi-stage RAG workflow with conditional logic.

```javascript
const {
  DAGEngine,
  createRagPipeline,
  MultiModalProcessor,
} = require("@devilsdev/rag-pipeline-utils");

async function advancedWorkflow() {
  const dag = new DAGEngine({
    maxConcurrency: 5,
    timeout: 300000, // 5 minutes
  });

  // Multi-modal processor
  const multiModal = new MultiModalProcessor({
    textModel: "text-embedding-ada-002",
    imageModel: "clip-vit-base",
    audioModel: "whisper-1",
  });

  // Define workflow nodes
  dag.addNode("classify_content", async (input) => {
    // Classify document type
    const { contentType } = input;
    return {
      ...input,
      contentType,
      requiresOCR: contentType === "scanned-pdf",
      requiresTranscription: contentType === "audio",
    };
  });

  dag.addNode("ocr_processing", async (input) => {
    if (!input.requiresOCR) return input;

    console.log("Running OCR...");
    const text = await runOCR(input.file);
    return { ...input, extractedText: text };
  });

  dag.addNode("audio_transcription", async (input) => {
    if (!input.requiresTranscription) return input;

    console.log("Transcribing audio...");
    const text = await transcribeAudio(input.file);
    return { ...input, extractedText: text };
  });

  dag.addNode("extract_text", async (input) => {
    if (input.extractedText) return input;

    console.log("Extracting text...");
    const text = await extractTextFromPDF(input.file);
    return { ...input, extractedText: text };
  });

  dag.addNode("chunk_text", async (input) => {
    console.log("Chunking text...");
    const chunks = chunkText(input.extractedText, {
      chunkSize: 1000,
      overlap: 200,
    });
    return { ...input, chunks };
  });

  dag.addNode("generate_embeddings", async (input) => {
    console.log("Generating embeddings...");
    const embeddings = await multiModal.process({
      type: "text",
      data: input.chunks,
    });
    return { ...input, embeddings };
  });

  dag.addNode("quality_check", async (input) => {
    // Verify embedding quality
    const qualityScore = calculateQuality(input.embeddings);

    if (qualityScore < 0.7) {
      throw new Error("Quality check failed - embeddings below threshold");
    }

    return { ...input, qualityScore };
  });

  dag.addNode("store_embeddings", async (input) => {
    console.log("Storing in vector database...");
    await storeInPinecone(input.embeddings, input.chunks);
    return { ...input, stored: true };
  });

  dag.addNode("index_metadata", async (input) => {
    console.log("Indexing metadata...");
    await indexMetadata({
      filename: input.file,
      contentType: input.contentType,
      chunkCount: input.chunks.length,
      qualityScore: input.qualityScore,
      processedAt: new Date().toISOString(),
    });
    return input;
  });

  // Define edges (workflow flow)
  dag.addEdge("classify_content", "ocr_processing");
  dag.addEdge("classify_content", "audio_transcription");
  dag.addEdge("classify_content", "extract_text");

  dag.addEdge("ocr_processing", "chunk_text");
  dag.addEdge("audio_transcription", "chunk_text");
  dag.addEdge("extract_text", "chunk_text");

  dag.addEdge("chunk_text", "generate_embeddings");
  dag.addEdge("generate_embeddings", "quality_check");
  dag.addEdge("quality_check", "store_embeddings");
  dag.addEdge("store_embeddings", "index_metadata");

  // Execute workflow
  const result = await dag.execute({
    file: "./documents/mixed-content.pdf",
    contentType: "scanned-pdf",
  });

  console.log("\nWorkflow completed:");
  console.log(`- Processed: ${result.file}`);
  console.log(`- Chunks: ${result.chunks.length}`);
  console.log(`- Quality score: ${result.qualityScore}`);
  console.log(`- Stored: ${result.stored}`);
}

advancedWorkflow().catch(console.error);
```

**Output:**

```
Running OCR...
Chunking text...
Generating embeddings...
Storing in vector database...
Indexing metadata...

Workflow completed:
- Processed: ./documents/mixed-content.pdf
- Chunks: 127
- Quality score: 0.89
- Stored: true
```

---

## Additional Resources

**Complete Examples Repository:**

Visit the [examples directory](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples) on GitHub for:

- Authentication and authorization patterns
- Custom plugin development
- Integration with popular frameworks
- Production deployment configurations
- Testing strategies
- Monitoring and observability setups

**Video Tutorials:**

- [Building Your First RAG Pipeline](https://youtube.com/placeholder)
- [Security Best Practices](https://youtube.com/placeholder)
- [Performance Optimization Techniques](https://youtube.com/placeholder)

**Interactive Playground:**

Try RAG Pipeline Utils in your browser: [https://codesandbox.io/placeholder](https://codesandbox.io/placeholder)

---

## Next Steps

- Review the [API Reference](/docs/API-Reference) for complete method documentation
- Explore [Plugin Development](/docs/Plugins) to create custom components
- Read [Security Best Practices](/docs/Security) for production deployments
- Check out [Performance Optimization](/docs/Performance) for scaling strategies
