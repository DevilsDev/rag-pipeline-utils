import React, { useState } from "react";
import styles from "./styles.module.css";

const EXAMPLES = {
  basic: {
    title: "Basic RAG Pipeline",
    code: `const { createRagPipeline } = require('@devilsdev/rag-pipeline-utils');

// Initialize pipeline
const pipeline = createRagPipeline({
  embedder: {
    type: 'openai',
    apiKey: process.env.OPENAI_API_KEY
  },
  retriever: {
    type: 'pinecone',
    apiKey: process.env.PINECONE_API_KEY,
    indexName: 'docs'
  },
  llm: {
    type: 'openai',
    model: 'gpt-3.5-turbo'
  }
});

// Ingest documents
await pipeline.ingest('./documents');

// Query the pipeline
const result = await pipeline.query('How does authentication work?');
console.log(result.answer);`,
  },
  customEmbedder: {
    title: "Custom Embedder",
    code: `const { createRagPipeline } = require('@devilsdev/rag-pipeline-utils');

// Define custom embedder
class CustomEmbedder {
  async embed(text) {
    // Your custom embedding logic
    const embedding = await this.computeEmbedding(text);
    return embedding;
  }

  async embedBatch(texts) {
    // Batch processing for efficiency
    return Promise.all(texts.map(t => this.embed(t)));
  }

  async computeEmbedding(text) {
    // Example: Use a local model or API
    const response = await fetch('http://localhost:8080/embed', {
      method: 'POST',
      body: JSON.stringify({ text }),
      headers: { 'Content-Type': 'application/json' }
    });
    return response.json();
  }
}

// Use custom embedder in pipeline
const pipeline = createRagPipeline({
  embedder: new CustomEmbedder(),
  retriever: myRetriever,
  llm: myLLM
});`,
  },
  caching: {
    title: "Caching Strategy",
    code: `const { createRagPipeline } = require('@devilsdev/rag-pipeline-utils');
const NodeCache = require('node-cache');

class CachedEmbedder {
  constructor(baseEmbedder) {
    this.baseEmbedder = baseEmbedder;
    this.cache = new NodeCache({
      stdTTL: 3600, // 1 hour
      maxKeys: 10000
    });
  }

  async embed(text) {
    const key = this.hash(text);

    // Check cache
    const cached = this.cache.get(key);
    if (cached) return cached;

    // Compute and cache
    const embedding = await this.baseEmbedder.embed(text);
    this.cache.set(key, embedding);
    return embedding;
  }

  hash(text) {
    return require('crypto')
      .createHash('md5')
      .update(text.toLowerCase().trim())
      .digest('hex');
  }
}

const pipeline = createRagPipeline({
  embedder: new CachedEmbedder(baseEmbedder),
  retriever: myRetriever,
  llm: myLLM
});`,
  },
  security: {
    title: "Security & Authentication",
    code: `const {
  createRagPipeline,
  JwtValidator,
  InputSanitizer,
  RateLimiter
} = require('@devilsdev/rag-pipeline-utils');

// Setup security components
const jwtValidator = new JwtValidator({
  issuer: 'https://auth.example.com',
  audience: 'rag-api'
});

const sanitizer = new InputSanitizer({
  maxLength: 2000,
  blockPatterns: [/ignore.*previous/i]
});

const limiter = new RateLimiter({
  capacity: 100,
  refillRate: 10
});

// Protected endpoint
app.post('/api/query', async (req, res) => {
  try {
    // Authenticate
    const user = await jwtValidator.validate(
      req.headers.authorization
    );

    // Rate limit
    await limiter.checkLimit(user.id);

    // Sanitize input
    const query = sanitizer.sanitize(req.body.query);

    // Query pipeline
    const result = await pipeline.query(query);

    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});`,
  },
};

export default function CodePlayground() {
  const [selectedExample, setSelectedExample] = useState("basic");
  const [code, setCode] = useState(EXAMPLES.basic.code);

  const handleExampleChange = (exampleKey) => {
    setSelectedExample(exampleKey);
    setCode(EXAMPLES[exampleKey].code);
  };

  const openInStackBlitz = () => {
    const project = {
      title: "RAG Pipeline Utils Example",
      description: "Interactive example using RAG Pipeline Utils",
      template: "node",
      files: {
        "index.js": code,
        "package.json": JSON.stringify(
          {
            name: "rag-pipeline-example",
            version: "1.0.0",
            dependencies: {
              "@devilsdev/rag-pipeline-utils": "^2.3.1",
            },
          },
          null,
          2,
        ),
        "README.md":
          "# RAG Pipeline Utils Example\n\nRun `node index.js` to execute.",
      },
    };

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "https://stackblitz.com/run";
    form.target = "_blank";

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "project[files]";
    input.value = JSON.stringify(project);
    form.appendChild(input);

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    alert("Code copied to clipboard!");
  };

  return (
    <div className={styles.playground}>
      <div className={styles.header}>
        <h2>Interactive Code Playground</h2>
        <p>Explore RAG Pipeline Utils with live examples</p>
      </div>

      <div className={styles.exampleSelector}>
        {Object.entries(EXAMPLES).map(([key, example]) => (
          <button
            key={key}
            className={`${styles.exampleButton} ${
              selectedExample === key ? styles.active : ""
            }`}
            onClick={() => handleExampleChange(key)}
          >
            {example.title}
          </button>
        ))}
      </div>

      <div className={styles.editorContainer}>
        <div className={styles.editorHeader}>
          <span className={styles.filename}>index.js</span>
          <div className={styles.actions}>
            <button onClick={copyToClipboard} className={styles.actionButton}>
              Copy
            </button>
            <button onClick={openInStackBlitz} className={styles.actionButton}>
              Open in StackBlitz
            </button>
          </div>
        </div>
        <textarea
          className={styles.editor}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className={styles.info}>
        <h3>Try it yourself:</h3>
        <ol>
          <li>Modify the code above to experiment</li>
          <li>Click "Open in StackBlitz" to run in a live environment</li>
          <li>Or copy the code and run locally with npm</li>
        </ol>
      </div>
    </div>
  );
}
