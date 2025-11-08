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
      model: "text-embedding-ada-002",
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

    // Embedder config
    code += `// Embedder Configuration\n`;
    if (config.embedder.type === "custom") {
      code += `const embedder = new CustomEmbedder();\n\n`;
    } else {
      code += `const embedder = {\n`;
      code += `  type: '${config.embedder.type}',\n`;
      if (config.embedder.type === "openai") {
        code += `  apiKey: process.env.OPENAI_API_KEY,\n`;
        code += `  model: '${config.embedder.model}'\n`;
      }
      code += `};\n\n`;
    }

    // Retriever config
    code += `// Retriever Configuration\n`;
    if (config.retriever.type === "custom") {
      code += `const retriever = new CustomRetriever();\n\n`;
    } else {
      code += `const retriever = {\n`;
      code += `  type: '${config.retriever.type}',\n`;
      if (config.retriever.type === "pinecone") {
        code += `  apiKey: process.env.PINECONE_API_KEY,\n`;
      }
      code += `  indexName: '${config.retriever.indexName}',\n`;
      code += `  topK: ${config.retriever.topK}\n`;
      code += `};\n\n`;
    }

    // LLM config
    code += `// LLM Configuration\n`;
    if (config.llm.type === "custom") {
      code += `const llm = new CustomLLM();\n\n`;
    } else {
      code += `const llm = {\n`;
      code += `  type: '${config.llm.type}',\n`;
      if (config.llm.type === "openai") {
        code += `  apiKey: process.env.OPENAI_API_KEY,\n`;
      }
      code += `  model: '${config.llm.model}',\n`;
      code += `  temperature: ${config.llm.temperature}\n`;
      code += `};\n\n`;
    }

    // Create pipeline
    code += `// Create Pipeline\n`;
    code += `const pipeline = createRagPipeline({\n`;
    code += `  embedder,\n`;
    code += `  retriever,\n`;
    code += `  llm`;

    // Advanced options
    if (config.advanced.caching || config.advanced.rateLimit) {
      code += `,\n  options: {\n`;
      if (config.advanced.caching) {
        code += `    caching: true,\n`;
      }
      if (config.advanced.rateLimit) {
        code += `    rateLimit: ${config.advanced.rateLimit},\n`;
      }
      if (config.advanced.timeout) {
        code += `    timeout: ${config.advanced.timeout}\n`;
      }
      code += `  }\n`;
    } else {
      code += `\n`;
    }

    code += `});\n\n`;
    code += `// Query the pipeline\n`;
    code += `const result = await pipeline.query('Your question here');\n`;
    code += `console.log(result.answer);\n`;

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
