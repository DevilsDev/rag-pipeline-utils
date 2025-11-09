import React, { useState, useEffect } from "react";
import styles from "./styles.module.css";
import Tooltip from "../Tooltip";

const EMBEDDER_LATENCY = {
  openai: 120,
  local: 50,
  cached: 1,
};

const RETRIEVER_LATENCY = {
  exact: 200,
  hnsw: 45,
  cached: 5,
};

const LLM_LATENCY = {
  "gpt-3.5": 800,
  "gpt-4": 1500,
  claude: 1200,
};

const COST_PER_1M = {
  openai_embed: 0.13,
  local_embed: 0,
  "gpt-3.5": 1.5,
  "gpt-4": 30,
  claude: 15,
};

export default function PerformanceCalculator() {
  const [inputs, setInputs] = useState({
    queries: 10000,
    embedder: "openai",
    caching: false,
    cacheHitRate: 45,
    retriever: "hnsw",
    llm: "gpt-3.5",
    avgTokens: 500,
  });

  const [results, setResults] = useState({
    latency: {
      p50: 0,
      p95: 0,
      p99: 0,
    },
    throughput: 0,
    cost: {
      embeddings: 0,
      llm: 0,
      total: 0,
    },
  });

  useEffect(() => {
    calculatePerformance();
  }, [inputs]);

  const calculatePerformance = () => {
    // Calculate latency
    let embedLatency = EMBEDDER_LATENCY[inputs.embedder];
    if (inputs.caching) {
      embedLatency =
        embedLatency * ((100 - inputs.cacheHitRate) / 100) +
        EMBEDDER_LATENCY.cached * (inputs.cacheHitRate / 100);
    }

    const retrieveLatency = RETRIEVER_LATENCY[inputs.retriever];
    const llmLatency = LLM_LATENCY[inputs.llm];

    const totalLatency = embedLatency + retrieveLatency + llmLatency;

    // P50, P95, P99 (with variance)
    const p50 = Math.round(totalLatency);
    const p95 = Math.round(totalLatency * 1.3);
    const p99 = Math.round(totalLatency * 1.6);

    // Throughput (queries per second)
    const throughput = Math.round(1000 / (totalLatency / 1000));

    // Cost calculation
    const embedCost = inputs.caching
      ? (COST_PER_1M[`${inputs.embedder}_embed`] *
          inputs.queries *
          (100 - inputs.cacheHitRate)) /
        100 /
        1000000
      : (COST_PER_1M[`${inputs.embedder}_embed`] * inputs.queries) / 1000000;

    const llmCost =
      (COST_PER_1M[inputs.llm] * inputs.queries * inputs.avgTokens) /
      1000 /
      1000000;

    const totalCost = embedCost + llmCost;

    setResults({
      latency: {
        p50,
        p95,
        p99,
      },
      throughput,
      cost: {
        embeddings: embedCost,
        llm: llmCost,
        total: totalCost,
      },
    });
  };

  const updateInput = (key, value) => {
    setInputs({
      ...inputs,
      [key]: value,
    });
  };

  return (
    <div className={styles.calculator}>
      <div className={styles.header}>
        <h2>
          Performance Calculator
          <Tooltip
            content="Calculate estimated performance metrics and costs based on your RAG pipeline configuration. Adjust parameters to see real-time impact on latency and expenses."
            educationalMode={true}
          />
        </h2>
        <p>Estimate throughput, latency, and costs for your RAG pipeline</p>
      </div>

      <div className={styles.container}>
        <div className={styles.inputs}>
          <h3>Configuration</h3>

          <div className={styles.inputGroup}>
            <label>
              Monthly Queries:
              <input
                type="number"
                min="100"
                max="10000000"
                step="1000"
                value={inputs.queries}
                onChange={(e) =>
                  updateInput("queries", parseInt(e.target.value))
                }
              />
            </label>
          </div>

          <div className={styles.inputGroup}>
            <label>
              Embedder:
              <select
                value={inputs.embedder}
                onChange={(e) => updateInput("embedder", e.target.value)}
              >
                <option value="openai">OpenAI API (~120ms)</option>
                <option value="local">Local Model (~50ms)</option>
              </select>
            </label>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={inputs.caching}
                onChange={(e) => updateInput("caching", e.target.checked)}
              />
              Enable Caching
            </label>
            {inputs.caching && (
              <label>
                Cache Hit Rate (%):
                <input
                  type="range"
                  min="0"
                  max="90"
                  value={inputs.cacheHitRate}
                  onChange={(e) =>
                    updateInput("cacheHitRate", parseInt(e.target.value))
                  }
                />
                <span>{inputs.cacheHitRate}%</span>
              </label>
            )}
          </div>

          <div className={styles.inputGroup}>
            <label>
              Vector Search:
              <select
                value={inputs.retriever}
                onChange={(e) => updateInput("retriever", e.target.value)}
              >
                <option value="exact">Exact Search (~200ms)</option>
                <option value="hnsw">HNSW Index (~45ms)</option>
              </select>
            </label>
          </div>

          <div className={styles.inputGroup}>
            <label>
              LLM Model:
              <select
                value={inputs.llm}
                onChange={(e) => updateInput("llm", e.target.value)}
              >
                <option value="gpt-3.5">GPT-3.5 Turbo (~800ms)</option>
                <option value="gpt-4">GPT-4 (~1500ms)</option>
                <option value="claude">Claude (~1200ms)</option>
              </select>
            </label>
          </div>

          <div className={styles.inputGroup}>
            <label>
              Avg Response Tokens:
              <input
                type="number"
                min="100"
                max="2000"
                step="50"
                value={inputs.avgTokens}
                onChange={(e) =>
                  updateInput("avgTokens", parseInt(e.target.value))
                }
              />
            </label>
          </div>
        </div>

        <div className={styles.results}>
          <h3>Estimated Performance</h3>

          <div className={styles.metric}>
            <div className={styles.metricLabel}>Latency (P50)</div>
            <div className={styles.metricValue}>{results.latency.p50}ms</div>
          </div>

          <div className={styles.metric}>
            <div className={styles.metricLabel}>Latency (P95)</div>
            <div className={styles.metricValue}>{results.latency.p95}ms</div>
          </div>

          <div className={styles.metric}>
            <div className={styles.metricLabel}>Latency (P99)</div>
            <div className={styles.metricValue}>{results.latency.p99}ms</div>
          </div>

          <div className={styles.metric}>
            <div className={styles.metricLabel}>Throughput</div>
            <div className={styles.metricValue}>{results.throughput} qps</div>
          </div>

          <div className={styles.divider}></div>

          <h3>Cost Analysis</h3>

          <div className={styles.metric}>
            <div className={styles.metricLabel}>Embedding Cost</div>
            <div className={styles.metricValue}>
              ${results.cost.embeddings.toFixed(2)}
            </div>
          </div>

          <div className={styles.metric}>
            <div className={styles.metricLabel}>LLM Cost</div>
            <div className={styles.metricValue}>
              ${results.cost.llm.toFixed(2)}
            </div>
          </div>

          <div className={styles.metric}>
            <div className={styles.metricLabel}>Total Monthly Cost</div>
            <div className={`${styles.metricValue} ${styles.highlight}`}>
              ${results.cost.total.toFixed(2)}
            </div>
          </div>

          <div className={styles.breakdown}>
            <div className={styles.breakdownItem}>
              <div className={styles.breakdownLabel}>Cost per 1K queries:</div>
              <div className={styles.breakdownValue}>
                ${((results.cost.total / inputs.queries) * 1000).toFixed(3)}
              </div>
            </div>
            <div className={styles.breakdownItem}>
              <div className={styles.breakdownLabel}>Cost per query:</div>
              <div className={styles.breakdownValue}>
                ${(results.cost.total / inputs.queries).toFixed(5)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.recommendations}>
        <h3>Optimization Recommendations</h3>
        <ul>
          {!inputs.caching && (
            <li>
              Enable caching to reduce embedding costs by up to 90% for repeated
              queries
            </li>
          )}
          {inputs.retriever === "exact" && (
            <li>
              Switch to HNSW indexing for 80% faster retrieval with minimal
              accuracy loss
            </li>
          )}
          {inputs.llm === "gpt-4" && inputs.avgTokens < 200 && (
            <li>
              Consider using GPT-3.5 Turbo for shorter responses - 55% faster
              and 95% cheaper
            </li>
          )}
          {inputs.embedder === "openai" && inputs.queries > 100000 && (
            <li>
              For high-volume applications, a local embedder could save ~${" "}
              {((COST_PER_1M.openai_embed * inputs.queries) / 1000000).toFixed(
                2,
              )}
              /month
            </li>
          )}
          {results.latency.p95 > 2000 && (
            <li>
              High latency detected. Consider implementing parallel processing
              and streaming responses
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
