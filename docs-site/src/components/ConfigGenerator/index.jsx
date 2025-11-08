import React, { useState } from "react";
import styles from "./styles.module.css";

const STEPS = ["Embedder", "Retriever", "LLM", "Advanced"];

const EMBEDDER_OPTIONS = [
  {
    value: "openai",
    label: "OpenAI",
    description: "text-embedding-ada-002 model",
  },
  { value: "cohere", label: "Cohere", description: "Cohere embedding models" },
  {
    value: "huggingface",
    label: "HuggingFace",
    description: "Open source models",
  },
  { value: "custom", label: "Custom", description: "Bring your own embedder" },
];

const RETRIEVER_OPTIONS = [
  {
    value: "pinecone",
    label: "Pinecone",
    description: "Managed vector database",
  },
  {
    value: "qdrant",
    label: "Qdrant",
    description: "Open source vector search",
  },
  {
    value: "weaviate",
    label: "Weaviate",
    description: "GraphQL vector database",
  },
  {
    value: "custom",
    label: "Custom",
    description: "Implement retriever contract",
  },
];

const LLM_OPTIONS = [
  { value: "openai", label: "OpenAI", description: "GPT-3.5/GPT-4" },
  { value: "anthropic", label: "Anthropic", description: "Claude models" },
  { value: "cohere", label: "Cohere", description: "Command models" },
  {
    value: "custom",
    label: "Custom",
    description: "Custom LLM implementation",
  },
];

export default function ConfigGenerator() {
  const [currentStep, setCurrentStep] = useState(0);
  const [config, setConfig] = useState({
    embedder: {
      type: "openai",
      model: "text-embedding-3-small",
    },
    retriever: {
      type: "pinecone",
      indexName: "docs",
      topK: 5,
    },
    llm: {
      type: "openai",
      model: "gpt-3.5-turbo",
      temperature: 0.7,
    },
    advanced: {
      caching: true,
      rateLimit: 100,
      timeout: 30000,
    },
  });

  const updateConfig = (section, key, value) => {
    setConfig({
      ...config,
      [section]: {
        ...config[section],
        [key]: value,
      },
    });
  };

  const generateCode = () => {
    let code = `const { createRagPipeline } = require('@devilsdev/rag-pipeline-utils');\n\n`;

    // Embedder plugin
    code += `// Embedder Plugin\n`;
    if (config.embedder.type === "custom") {
      code += `class CustomEmbedder {\n`;
      code += `  async embed(text) {\n`;
      code += `    // Implement your custom embedding logic\n`;
      code += `    return embedding;\n`;
      code += `  }\n`;
      code += `}\n`;
      code += `const embedder = new CustomEmbedder();\n\n`;
    } else if (config.embedder.type === "openai") {
      code += `class OpenAIEmbedder {\n`;
      code += `  constructor(options) {\n`;
      code += `    this.apiKey = options.apiKey;\n`;
      code += `    this.model = options.model || '${config.embedder.model}';\n`;
      code += `  }\n`;
      code += `  async embed(text) {\n`;
      code += `    const response = await fetch('https://api.openai.com/v1/embeddings', {\n`;
      code += `      method: 'POST',\n`;
      code += `      headers: {\n`;
      code += `        'Authorization': \`Bearer \${this.apiKey}\`,\n`;
      code += `        'Content-Type': 'application/json'\n`;
      code += `      },\n`;
      code += `      body: JSON.stringify({ input: text, model: this.model })\n`;
      code += `    });\n`;
      code += `    const data = await response.json();\n`;
      code += `    return data.data[0].embedding;\n`;
      code += `  }\n`;
      code += `}\n`;
      code += `const embedder = new OpenAIEmbedder({\n`;
      code += `  apiKey: process.env.OPENAI_API_KEY,\n`;
      code += `  model: '${config.embedder.model}'\n`;
      code += `});\n\n`;
    } else if (config.embedder.type === "cohere") {
      code += `class CohereEmbedder {\n`;
      code += `  constructor(options) {\n`;
      code += `    this.apiKey = options.apiKey;\n`;
      code += `  }\n`;
      code += `  async embed(text) {\n`;
      code += `    // Implement Cohere embedding API call\n`;
      code += `    return embedding;\n`;
      code += `  }\n`;
      code += `}\n`;
      code += `const embedder = new CohereEmbedder({ apiKey: process.env.COHERE_API_KEY });\n\n`;
    } else {
      code += `class HuggingFaceEmbedder {\n`;
      code += `  async embed(text) {\n`;
      code += `    // Implement HuggingFace model embedding\n`;
      code += `    return embedding;\n`;
      code += `  }\n`;
      code += `}\n`;
      code += `const embedder = new HuggingFaceEmbedder();\n\n`;
    }

    // Retriever plugin
    code += `// Retriever Plugin\n`;
    if (config.retriever.type === "custom") {
      code += `class CustomRetriever {\n`;
      code += `  async retrieve({ query, queryVector, topK }) {\n`;
      code += `    // Implement your custom retrieval logic\n`;
      code += `    return results;\n`;
      code += `  }\n`;
      code += `}\n`;
      code += `const retriever = new CustomRetriever();\n\n`;
    } else if (config.retriever.type === "pinecone") {
      code += `class PineconeRetriever {\n`;
      code += `  constructor(options) {\n`;
      code += `    this.apiKey = options.apiKey;\n`;
      code += `    this.indexName = options.indexName;\n`;
      code += `    this.topK = options.topK || 5;\n`;
      code += `  }\n`;
      code += `  async retrieve({ queryVector, topK }) {\n`;
      code += `    // Use Pinecone SDK to query vector database\n`;
      code += `    const index = pinecone.index(this.indexName);\n`;
      code += `    const results = await index.query({ vector: queryVector, topK });\n`;
      code += `    return results.matches;\n`;
      code += `  }\n`;
      code += `}\n`;
      code += `const retriever = new PineconeRetriever({\n`;
      code += `  apiKey: process.env.PINECONE_API_KEY,\n`;
      code += `  indexName: '${config.retriever.indexName}',\n`;
      code += `  topK: ${config.retriever.topK}\n`;
      code += `});\n\n`;
    } else if (config.retriever.type === "qdrant") {
      code += `class QdrantRetriever {\n`;
      code += `  constructor(options) {\n`;
      code += `    this.url = options.url;\n`;
      code += `    this.collectionName = options.collectionName || '${config.retriever.indexName}';\n`;
      code += `  }\n`;
      code += `  async retrieve({ queryVector, topK }) {\n`;
      code += `    // Use Qdrant client to search vectors\n`;
      code += `    return results;\n`;
      code += `  }\n`;
      code += `}\n`;
      code += `const retriever = new QdrantRetriever({ url: process.env.QDRANT_URL });\n\n`;
    } else {
      code += `class WeaviateRetriever {\n`;
      code += `  async retrieve({ queryVector, topK }) {\n`;
      code += `    // Use Weaviate client to search vectors\n`;
      code += `    return results;\n`;
      code += `  }\n`;
      code += `}\n`;
      code += `const retriever = new WeaviateRetriever();\n\n`;
    }

    // LLM plugin
    code += `// LLM Plugin\n`;
    if (config.llm.type === "custom") {
      code += `class CustomLLM {\n`;
      code += `  async generate(query, context, options) {\n`;
      code += `    // Implement your custom LLM logic\n`;
      code += `    return answer;\n`;
      code += `  }\n`;
      code += `}\n`;
      code += `const llm = new CustomLLM();\n\n`;
    } else if (config.llm.type === "openai") {
      code += `class OpenAILLM {\n`;
      code += `  constructor(options) {\n`;
      code += `    this.apiKey = options.apiKey;\n`;
      code += `    this.model = options.model || '${config.llm.model}';\n`;
      code += `    this.temperature = options.temperature || ${config.llm.temperature};\n`;
      code += `  }\n`;
      code += `  async generate(query, context, options) {\n`;
      code += `    const prompt = \`Context: \${JSON.stringify(context)}\\n\\nQuestion: \${query}\`;\n`;
      code += `    const response = await fetch('https://api.openai.com/v1/chat/completions', {\n`;
      code += `      method: 'POST',\n`;
      code += `      headers: {\n`;
      code += `        'Authorization': \`Bearer \${this.apiKey}\`,\n`;
      code += `        'Content-Type': 'application/json'\n`;
      code += `      },\n`;
      code += `      body: JSON.stringify({\n`;
      code += `        model: this.model,\n`;
      code += `        messages: [{ role: 'user', content: prompt }],\n`;
      code += `        temperature: this.temperature\n`;
      code += `      })\n`;
      code += `    });\n`;
      code += `    const data = await response.json();\n`;
      code += `    return data.choices[0].message.content;\n`;
      code += `  }\n`;
      code += `}\n`;
      code += `const llm = new OpenAILLM({\n`;
      code += `  apiKey: process.env.OPENAI_API_KEY,\n`;
      code += `  model: '${config.llm.model}',\n`;
      code += `  temperature: ${config.llm.temperature}\n`;
      code += `});\n\n`;
    } else if (config.llm.type === "anthropic") {
      code += `class ClaudeLLM {\n`;
      code += `  constructor(options) {\n`;
      code += `    this.apiKey = options.apiKey;\n`;
      code += `  }\n`;
      code += `  async generate(query, context, options) {\n`;
      code += `    // Implement Anthropic Claude API call\n`;
      code += `    return answer;\n`;
      code += `  }\n`;
      code += `}\n`;
      code += `const llm = new ClaudeLLM({ apiKey: process.env.ANTHROPIC_API_KEY });\n\n`;
    } else {
      code += `class CohereLLM {\n`;
      code += `  constructor(options) {\n`;
      code += `    this.apiKey = options.apiKey;\n`;
      code += `  }\n`;
      code += `  async generate(query, context, options) {\n`;
      code += `    // Implement Cohere API call\n`;
      code += `    return answer;\n`;
      code += `  }\n`;
      code += `}\n`;
      code += `const llm = new CohereLLM({ apiKey: process.env.COHERE_API_KEY });\n\n`;
    }

    // Create pipeline
    code += `// Create Pipeline with Custom Plugins\n`;
    code += `const pipeline = createRagPipeline({\n`;
    code += `  embedder,\n`;
    code += `  retriever,\n`;
    code += `  llm\n`;
    code += `});\n\n`;

    // Usage example
    code += `// Use the Pipeline\n`;
    code += `const result = await pipeline.run({\n`;
    code += `  query: 'Your question here',\n`;
    code += `  options: { topK: ${config.retriever.topK}`;
    if (config.advanced.timeout) {
      code += `, timeout: ${config.advanced.timeout}`;
    }
    code += ` }\n`;
    code += `});\n`;
    code += `console.log(result);\n`;

    return code;
  };

  const copyConfig = () => {
    const code = generateCode();
    navigator.clipboard.writeText(code);
    alert("Configuration copied to clipboard!");
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0: // Embedder
        return (
          <div className={styles.stepContent}>
            <h3>Select Embedder</h3>
            <p>Choose how to convert text into vector embeddings</p>
            <div className={styles.options}>
              {EMBEDDER_OPTIONS.map((option) => (
                <div
                  key={option.value}
                  className={`${styles.option} ${
                    config.embedder.type === option.value ? styles.selected : ""
                  }`}
                  onClick={() => updateConfig("embedder", "type", option.value)}
                >
                  <div className={styles.optionTitle}>{option.label}</div>
                  <div className={styles.optionDesc}>{option.description}</div>
                </div>
              ))}
            </div>

            {config.embedder.type === "openai" && (
              <div className={styles.configFields}>
                <label>
                  Model:
                  <select
                    value={config.embedder.model}
                    onChange={(e) =>
                      updateConfig("embedder", "model", e.target.value)
                    }
                  >
                    <option value="text-embedding-ada-002">
                      text-embedding-ada-002
                    </option>
                    <option value="text-embedding-3-small">
                      text-embedding-3-small
                    </option>
                    <option value="text-embedding-3-large">
                      text-embedding-3-large
                    </option>
                  </select>
                </label>
              </div>
            )}
          </div>
        );

      case 1: // Retriever
        return (
          <div className={styles.stepContent}>
            <h3>Select Vector Store</h3>
            <p>Choose your vector database for similarity search</p>
            <div className={styles.options}>
              {RETRIEVER_OPTIONS.map((option) => (
                <div
                  key={option.value}
                  className={`${styles.option} ${
                    config.retriever.type === option.value
                      ? styles.selected
                      : ""
                  }`}
                  onClick={() =>
                    updateConfig("retriever", "type", option.value)
                  }
                >
                  <div className={styles.optionTitle}>{option.label}</div>
                  <div className={styles.optionDesc}>{option.description}</div>
                </div>
              ))}
            </div>

            <div className={styles.configFields}>
              <label>
                Index Name:
                <input
                  type="text"
                  value={config.retriever.indexName}
                  onChange={(e) =>
                    updateConfig("retriever", "indexName", e.target.value)
                  }
                />
              </label>
              <label>
                Top K Results:
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={config.retriever.topK}
                  onChange={(e) =>
                    updateConfig("retriever", "topK", parseInt(e.target.value))
                  }
                />
              </label>
            </div>
          </div>
        );

      case 2: // LLM
        return (
          <div className={styles.stepContent}>
            <h3>Select LLM Provider</h3>
            <p>Choose the language model for generating responses</p>
            <div className={styles.options}>
              {LLM_OPTIONS.map((option) => (
                <div
                  key={option.value}
                  className={`${styles.option} ${
                    config.llm.type === option.value ? styles.selected : ""
                  }`}
                  onClick={() => updateConfig("llm", "type", option.value)}
                >
                  <div className={styles.optionTitle}>{option.label}</div>
                  <div className={styles.optionDesc}>{option.description}</div>
                </div>
              ))}
            </div>

            {config.llm.type === "openai" && (
              <div className={styles.configFields}>
                <label>
                  Model:
                  <select
                    value={config.llm.model}
                    onChange={(e) =>
                      updateConfig("llm", "model", e.target.value)
                    }
                  >
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    <option value="gpt-4">GPT-4</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  </select>
                </label>
                <label>
                  Temperature:
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={config.llm.temperature}
                    onChange={(e) =>
                      updateConfig(
                        "llm",
                        "temperature",
                        parseFloat(e.target.value),
                      )
                    }
                  />
                  <span>{config.llm.temperature}</span>
                </label>
              </div>
            )}
          </div>
        );

      case 3: // Advanced
        return (
          <div className={styles.stepContent}>
            <h3>Advanced Options</h3>
            <p>Configure performance and reliability features</p>

            <div className={styles.advancedOptions}>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={config.advanced.caching}
                  onChange={(e) =>
                    updateConfig("advanced", "caching", e.target.checked)
                  }
                />
                Enable Caching
                <span className={styles.hint}>
                  Cache embeddings for better performance
                </span>
              </label>

              <label>
                Rate Limit (requests/min):
                <input
                  type="number"
                  min="10"
                  max="1000"
                  value={config.advanced.rateLimit}
                  onChange={(e) =>
                    updateConfig(
                      "advanced",
                      "rateLimit",
                      parseInt(e.target.value),
                    )
                  }
                />
              </label>

              <label>
                Timeout (ms):
                <input
                  type="number"
                  min="5000"
                  max="120000"
                  step="1000"
                  value={config.advanced.timeout}
                  onChange={(e) =>
                    updateConfig(
                      "advanced",
                      "timeout",
                      parseInt(e.target.value),
                    )
                  }
                />
              </label>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={styles.generator}>
      <div className={styles.header}>
        <h2>Pipeline Configuration Generator</h2>
        <p>Build your RAG pipeline configuration step-by-step</p>
      </div>

      <div className={styles.stepper}>
        {STEPS.map((step, index) => (
          <div
            key={step}
            className={`${styles.step} ${index === currentStep ? styles.active : ""} ${
              index < currentStep ? styles.completed : ""
            }`}
            onClick={() => setCurrentStep(index)}
          >
            <div className={styles.stepNumber}>{index + 1}</div>
            <div className={styles.stepLabel}>{step}</div>
          </div>
        ))}
      </div>

      <div className={styles.content}>{renderStep()}</div>

      <div className={styles.navigation}>
        <button
          className={styles.navButton}
          disabled={currentStep === 0}
          onClick={() => setCurrentStep(currentStep - 1)}
        >
          Previous
        </button>
        {currentStep < STEPS.length - 1 ? (
          <button
            className={styles.navButton}
            onClick={() => setCurrentStep(currentStep + 1)}
          >
            Next
          </button>
        ) : (
          <button
            className={`${styles.navButton} ${styles.primary}`}
            onClick={copyConfig}
          >
            Copy Configuration
          </button>
        )}
      </div>

      <div className={styles.preview}>
        <h4>Generated Configuration:</h4>
        <pre className={styles.code}>{generateCode()}</pre>
      </div>
    </div>
  );
}
