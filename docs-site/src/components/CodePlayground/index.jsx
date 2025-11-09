import React, { useState } from "react";
import styles from "./styles.module.css";
import Tooltip from "../Tooltip";

const EXAMPLES = {
  basic: {
    title: "Basic Custom Plugins",
    code: `const { createRagPipeline, pluginRegistry } = require('@devilsdev/rag-pipeline-utils');

// Define custom embedder plugin
class MyEmbedder {
  async embed(text) {
    // Call your embedding service (OpenAI, Cohere, local model, etc.)
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${process.env.OPENAI_API_KEY}\`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small'
      })
    });
    const data = await response.json();
    return data.data[0].embedding;
  }
}

// Define custom retriever plugin
class MyRetriever {
  async retrieve({ query, queryVector, topK }) {
    // Perform similarity search in your vector DB
    // This is a simplified example
    const results = await yourVectorDB.search({
      vector: queryVector,
      limit: topK
    });
    return results;
  }
}

// Define custom LLM plugin
class MyLLM {
  async generate(query, context, options) {
    // Call your LLM (OpenAI, Anthropic, local model, etc.)
    const prompt = \`Context: \${JSON.stringify(context)}\\n\\nQuestion: \${query}\`;
    // Return generated answer
    return "Answer based on context...";
  }
}

// Create pipeline with custom plugins
const pipeline = createRagPipeline({
  embedder: new MyEmbedder(),
  retriever: new MyRetriever(),
  llm: new MyLLM()
});

// Use the pipeline
const result = await pipeline.run({
  query: 'How does authentication work?',
  options: { topK: 5 }
});
console.log(result);`,
  },
  registered: {
    title: "Using Plugin Registry",
    code: `const { createRagPipeline, pluginRegistry } = require('@devilsdev/rag-pipeline-utils');

// Define your plugins
class OpenAIEmbedder {
  constructor(options) {
    this.apiKey = options.apiKey;
    this.model = options.model || 'text-embedding-3-small';
  }
  async embed(text) {
    // Implementation details...
    return embedding;
  }
}

class PineconeRetriever {
  constructor(options) {
    this.apiKey = options.apiKey;
    this.indexName = options.indexName;
  }
  async retrieve({ queryVector, topK }) {
    // Implementation details...
    return results;
  }
}

class OpenAILLM {
  constructor(options) {
    this.apiKey = options.apiKey;
    this.model = options.model || 'gpt-3.5-turbo';
  }
  async generate(query, context, options) {
    // Implementation details...
    return answer;
  }
}

// Register plugins
await pluginRegistry.register(
  'embedder',
  'openai',
  new OpenAIEmbedder({ apiKey: process.env.OPENAI_API_KEY })
);

await pluginRegistry.register(
  'retriever',
  'pinecone',
  new PineconeRetriever({
    apiKey: process.env.PINECONE_API_KEY,
    indexName: 'docs'
  })
);

await pluginRegistry.register(
  'llm',
  'openai',
  new OpenAILLM({ apiKey: process.env.OPENAI_API_KEY })
);

// Use registered plugins by name
const pipeline = createRagPipeline({
  registry: pluginRegistry,
  embedder: 'openai',    // String reference to registered plugin
  retriever: 'pinecone',
  llm: 'openai'
});

const result = await pipeline.run({ query: 'Your question here' });`,
  },
  caching: {
    title: "Caching Wrapper Plugin",
    code: `const { createRagPipeline } = require('@devilsdev/rag-pipeline-utils');
const NodeCache = require('node-cache');

// Wrapper plugin that adds caching to any embedder
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
    if (cached) {
      console.log('Cache hit for:', text.substring(0, 50));
      return cached;
    }

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

// Your base embedder
class OpenAIEmbedder {
  async embed(text) {
    // API call to OpenAI
    return embedding;
  }
}

// Wrap with caching
const baseEmbedder = new OpenAIEmbedder();
const cachedEmbedder = new CachedEmbedder(baseEmbedder);

const pipeline = createRagPipeline({
  embedder: cachedEmbedder,
  retriever: myRetriever,
  llm: myLLM
});`,
  },
  dagWorkflow: {
    title: "DAG-Based Workflow",
    code: `const { DAGEngine, pluginRegistry } = require('@devilsdev/rag-pipeline-utils');

// Define custom plugins
class PDFLoader {
  async load(filePath) {
    // Load and parse PDF
    return { content: "...", metadata: {...} };
  }
}

class TextChunker {
  async chunk(document) {
    // Split into chunks
    return chunks;
  }
}

// Register plugins
pluginRegistry.register('loader', 'pdf', new PDFLoader());
pluginRegistry.register('chunker', 'text', new TextChunker());

// Create DAG workflow
const dag = new DAGEngine({
  timeout: 30000,
  continueOnError: false
});

// Define pipeline steps
dag.addNode('load', async (input) => {
  const loader = pluginRegistry.get('loader', 'pdf');
  return loader.load(input.filePath);
});

dag.addNode('chunk', async (document) => {
  const chunker = pluginRegistry.get('chunker', 'text');
  return chunker.chunk(document);
});

dag.addNode('embed', async (chunks) => {
  const embedder = pluginRegistry.get('embedder', 'openai');
  return await Promise.all(
    chunks.map(chunk => embedder.embed(chunk.text))
  );
});

dag.addNode('store', async (embeddings) => {
  const retriever = pluginRegistry.get('retriever', 'pinecone');
  return retriever.upsert(embeddings);
});

// Connect workflow: load -> chunk -> embed -> store
dag.connect('load', 'chunk');
dag.connect('chunk', 'embed');
dag.connect('embed', 'store');

// Execute
const results = await dag.execute({ filePath: './document.pdf' });
console.log('Pipeline completed:', results);`,
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
    // Create project files
    const files = {
      "index.js": code,
      "package.json": JSON.stringify(
        {
          name: "rag-pipeline-example",
          version: "1.0.0",
          main: "index.js",
          dependencies: {
            "@devilsdev/rag-pipeline-utils": "^2.3.1",
          },
        },
        null,
        2,
      ),
      "README.md":
        "# RAG Pipeline Utils Example\n\nThis example demonstrates RAG Pipeline Utils v2.3.1 features.\n\n## Run\n\n```bash\nnode index.js\n```",
    };

    // Create form with proper StackBlitz API format
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "https://stackblitz.com/run?file=index.js";
    form.target = "_blank";
    form.style.display = "none";

    // Add project files
    Object.keys(files).forEach((filename) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = `project[files][${filename}]`;
      input.value = files[filename];
      form.appendChild(input);
    });

    // Add project metadata
    const titleInput = document.createElement("input");
    titleInput.type = "hidden";
    titleInput.name = "project[title]";
    titleInput.value =
      "RAG Pipeline Utils - " + EXAMPLES[selectedExample].title;
    form.appendChild(titleInput);

    const descInput = document.createElement("input");
    descInput.type = "hidden";
    descInput.name = "project[description]";
    descInput.value = "Interactive example using RAG Pipeline Utils v2.3.1";
    form.appendChild(descInput);

    const templateInput = document.createElement("input");
    templateInput.type = "hidden";
    templateInput.name = "project[template]";
    templateInput.value = "node";
    form.appendChild(templateInput);

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
        <h2>
          Interactive Code Playground
          <Tooltip
            content="Try live code examples. You can edit the code directly and run it in StackBlitz!"
            educationalMode={true}
          />
        </h2>
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
          <span className={styles.filename}>
            index.js
            <Tooltip
              content="This is an editable code editor. You can modify the code to experiment with different configurations."
              educationalMode={true}
            />
          </span>
          <div className={styles.actions}>
            <Tooltip
              content="Copy this code to your clipboard to use in your own project"
              educationalMode={true}
            >
              <button onClick={copyToClipboard} className={styles.actionButton}>
                Copy
              </button>
            </Tooltip>
            <Tooltip
              content="Opens this example in StackBlitz, an online IDE where you can run and test the code in a real Node.js environment"
              educationalMode={true}
            >
              <button
                onClick={openInStackBlitz}
                className={styles.actionButton}
              >
                Open in StackBlitz
              </button>
            </Tooltip>
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
        <h3>
          Try it yourself
          <Tooltip
            content="Follow these steps to get the most out of the playground"
            educationalMode={true}
          />
          :
        </h3>
        <ol>
          <li>Modify the code above to experiment</li>
          <li>Click "Open in StackBlitz" to run in a live environment</li>
          <li>Or copy the code and run locally with npm</li>
        </ol>
      </div>
    </div>
  );
}
