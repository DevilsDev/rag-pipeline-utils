---
sidebar_position: 16
---

# Code Examples

Examples of common RAG Pipeline Utils use cases. They use the package's real exports; replace the provider connectors with the ones you use.

:::tip[Run the examples in your browser]

The repository's [runnable examples](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples) open on StackBlitz in their offline modes, with no install and no API keys: [basic pipeline](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/basic-pipeline), [OpenAI with Pinecone](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/openai-pinecone) and [Fastify service](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/fastify-rag-demo).

:::

## Example 1: Document Q&A System

Build a document question-answering system over local Markdown or text files.

```javascript
const fs = require("fs");
const path = require("path");
const {
  createRagPipeline,
  ChunkingEngine,
  OpenAIConnector,
  MemoryRetriever,
} = require("@devilsdev/rag-pipeline-utils");

async function createDocumentQA() {
  const openai = new OpenAIConnector({
    model: "gpt-4o-mini",
    temperature: 0.2,
  });
  const retriever = new MemoryRetriever();
  const chunker = new ChunkingEngine({ chunkSize: 1000, chunkOverlap: 200 });

  // 1. Load, chunk, embed and store the documents
  const docDir = "./company-docs";
  for (const file of fs.readdirSync(docDir).filter((f) => f.endsWith(".md"))) {
    const text = fs.readFileSync(path.join(docDir, file), "utf8");
    const chunks = chunker.chunk(text);
    await retriever.store(
      await Promise.all(
        chunks.map(async (content, i) => ({
          id: `${file}#${i}`,
          content,
          metadata: { filename: file },
          vector: await openai.embed(content),
        })),
      ),
    );
  }

  // 2. Query: the embedder turns each question into a query vector
  const pipeline = createRagPipeline({
    embedder: openai,
    retriever,
    llm: openai,
  });

  const questions = [
    "What is the vacation policy?",
    "How do I submit expense reports?",
    "What are the work-from-home guidelines?",
  ];

  for (const question of questions) {
    console.log(`\nQ: ${question}`);
    const result = await pipeline.run({
      query: question,
      options: { topK: 3 },
    });
    if (!result.success) {
      console.error(result.error);
      continue;
    }
    console.log(`A: ${result.answer}`);
    console.log(
      `Sources: ${result.results.map((d) => d.metadata.filename).join(", ")}`,
    );
  }
}

createDocumentQA().catch(console.error);
```

The CLI does the same without code: `rag-pipeline init --template openai`, `rag-pipeline ingest ./company-docs`, then `rag-pipeline query "What is the vacation policy?"`.

---

## Example 2: Streaming Conversational AI

Stream answers token by token, with citations delivered in the final chunk.

```javascript
const {
  createRagPipeline,
  OpenAIConnector,
  MemoryRetriever,
} = require("@devilsdev/rag-pipeline-utils");

async function streamingChatbot(retriever) {
  const openai = new OpenAIConnector({ model: "gpt-4o-mini" });
  const pipeline = createRagPipeline({
    embedder: openai,
    retriever, // a MemoryRetriever filled as in Example 1
    llm: openai, // OpenAIConnector implements generateStream()
  });

  async function chat(userMessage) {
    console.log(`\nUser: ${userMessage}`);
    process.stdout.write("Assistant: ");

    const stream = await pipeline.run({
      query: userMessage,
      options: { stream: true, topK: 5, citations: true },
    });

    let fullResponse = "";
    for await (const chunk of stream) {
      if (!chunk.done) {
        process.stdout.write(chunk.token);
        fullResponse += chunk.token;
      } else if (chunk.citations) {
        // Final chunk: { token: '', done: true, citations }
        console.log(
          `\n(groundedness: ${chunk.citations.groundednessScore ?? "n/a"})`,
        );
      }
    }
    return fullResponse;
  }

  await chat("What are the main features of RAG Pipeline Utils?");
  await chat("Can you elaborate on the security features?");
}
```

The pipeline is stateless: each `run()` answers one query. To carry conversation history, include the relevant earlier turns in the query text or in your own LLM plugin.

To stop a stream early (for example when the user disconnects), pass `options.signal` from an `AbortController` and call `abort()`.

---

## Example 3: Knowledge Base with Authentication, ACLs and Audit Logging

Protect a knowledge base with JWT authentication, retrieval-time access control, and audit logging.

```javascript
const {
  createRagPipeline,
  GuardrailsPipeline,
  JWTValidator,
  AuditLogger,
  OpenAIConnector,
} = require("@devilsdev/rag-pipeline-utils");

class SecureKnowledgeBase {
  // retriever: a MemoryRetriever whose documents carry metadata.acl role lists
  constructor(retriever) {
    this.jwtValidator = new JWTValidator({
      secret: process.env.JWT_SECRET, // at least 256 bits for HS256
      algorithm: "HS256",
      issuer: "knowledge-base",
      audience: "api-users",
      // Default true: each token is accepted once. Allow reuse for bearer tokens:
      singleUseTokens: false,
    });

    // Reads the key from RAG_AUDIT_ENCRYPTION_KEY; fail if it is missing
    this.auditLogger = new AuditLogger({ requireEncryption: true });

    const openai = new OpenAIConnector();
    const pipeline = createRagPipeline({
      embedder: openai,
      // RetrievalGuard reads `acl` (or `requiredRole`) from each result's
      // metadata, which is where MemoryRetriever returns it.
      retriever,
      llm: openai,
    });

    // Pre-retrieval injection checks, retrieval ACL filtering before
    // generation, and post-generation checks
    this.guarded = new GuardrailsPipeline(pipeline, {
      retrieval: { enforceACL: true },
    });
  }

  async query(token, question) {
    let user;
    try {
      user = this.jwtValidator.verify(token);
    } catch (error) {
      await this.auditLogger.logAuthentication({
        _action: "login_failed",
        result: "failure",
        reason: error.message,
      });
      throw new Error("Authentication failed");
    }

    const result = await this.guarded.run({
      query: question,
      options: { topK: 5 },
      // enforceACL fails closed when userPermissions is missing
      context: { userPermissions: user.roles || [] },
    });

    await this.auditLogger.logDataAccess({
      _action: "query",
      _tenantId: user.organizationId,
      _userId: user.sub,
      dataType: "pipeline_result",
      recordCount: result.results ? result.results.length : 0,
      query: question,
      result: result.success ? "success" : "failure",
    });

    return result;
  }
}
```

With `enforceACL`, a retrieved document whose `acl` (or `requiredRole`) lists roles is removed unless one of them is in `context.userPermissions`; removed documents never reach the LLM. See [Concepts: Guardrails](./Concepts-Guardrails.md) and [Security](./Security.md) for JWT and audit logging details.

Tenant management, quotas and data governance classes (`TenantManager`, `DataGovernanceManager`) are [experimental](./Experimental.md) simulations: their usage figures are random. Do not use them for tenant isolation.

---

## Example 4: Batch Embedding with Concurrency Control

Embed a large corpus in batches with a limit on concurrent embedding calls, and track the timing yourself.

```javascript
const {
  ParallelProcessor,
  ChunkingEngine,
  OpenAIConnector,
  FileVectorStore,
} = require("@devilsdev/rag-pipeline-utils");

const { ParallelEmbedder } = ParallelProcessor;

async function batchEmbed(texts) {
  const openai = new OpenAIConnector();
  // ParallelEmbedder calls embed(batch) with an array and expects one vector
  // per item; OpenAIConnector.embed() takes a single string, so adapt it.
  const embedder = {
    embed: (batch) => Promise.all(batch.map((text) => openai.embed(text))),
  };
  const parallel = new ParallelEmbedder(embedder, {
    batchSize: 50,
    maxConcurrency: 4,
    retryAttempts: 2,
  });
  const chunker = new ChunkingEngine({ chunkSize: 800 });
  const store = new FileVectorStore({ path: ".rag/batch-index.json" });

  const chunks = texts.flatMap((t) => chunker.chunk(t));
  const start = Date.now();
  const vectors = await parallel.embedBatch(chunks);

  await store.store(
    chunks.map((content, i) => ({
      id: `chunk-${i}`,
      content,
      vector: vectors[i],
      metadata: { source: "batch" },
    })),
  );
  store.save();

  const seconds = (Date.now() - start) / 1000;
  console.log(`Embedded ${chunks.length} chunks in ${seconds.toFixed(2)}s`);
}
```

For a corpus on disk, `rag-pipeline ingest <path>` does the loading, chunking, embedding and storing for you, and `rag-pipeline ai benchmark` reports measured per-stage latency.

---

## Example 5: DAG Workflow

Run a multi-stage workflow with the `DAG` engine (also exported as `DAGEngine`). Each node receives its upstream node's output; `execute(seed)` returns the sink node's result.

```javascript
const {
  DAG,
  ChunkingEngine,
  LocalEmbedder,
} = require("@devilsdev/rag-pipeline-utils");

async function workflow(rawText) {
  const dag = new DAG();
  const chunker = new ChunkingEngine({ chunkSize: 500 });
  const embedder = new LocalEmbedder();

  dag.addNode("clean", async (text) => text.replace(/\s+/g, " ").trim());

  dag.addNode("chunk", async (text) => chunker.chunk(text));

  dag.addNode("embed", async (chunks) => {
    embedder.train(chunks);
    return chunks.map((content, i) => ({
      id: String(i),
      content,
      vector: embedder.embed(content),
    }));
  });

  dag.connect("clean", "chunk");
  dag.connect("chunk", "embed");

  const docs = await dag.execute(rawText);
  console.log(`Prepared ${docs.length} chunks`);
  return docs;
}
```

`execute()` also accepts options such as `timeout`, `concurrency` and `continueOnError`; see the [API Reference](./API-Reference.md).

---

## Additional Resources

Visit the [examples directory](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples) on GitHub for runnable examples.

---

## Next Steps

- Review the [API Reference](/docs/API-Reference) for complete method documentation
- Explore [Plugin Development](/docs/Plugins) to create custom components
- Read [Security Best Practices](/docs/Security) for production deployments
- Check out [Performance Optimization](/docs/Performance) for scaling strategies
