// docs-site/src/pages/index.js

import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import HomepageHeader from "@site/src/components/HomepageHeader";
import HomepageFeatures from "@site/src/components/HomepageFeatures";
import styles from "./index.module.css";

function HomepageStats() {
  const stats = [
    { value: "104", label: "Exports" },
    { value: "2050+", label: "Tests" },
    { value: "<200ms", label: "Retrieval Latency" },
    { value: "Zero", label: "Production Vulnerabilities" },
  ];

  return (
    <section className={styles.statsSection}>
      <div className="container">
        <div className="row">
          {stats.map((stat, idx) => (
            <div key={idx} className="col col--3">
              <div className={styles.statCard}>
                <div className={styles.statValue}>{stat.value}</div>
                <div className={styles.statLabel}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HomepageQuickStart() {
  return (
    <section className={styles.quickStartSection}>
      <div className="container">
        <div className="row">
          <div className="col col--6">
            <h2>Quick Start</h2>
            <p className={styles.quickStartDesc}>
              Build a complete RAG pipeline in minutes. Install the package,
              configure your plugins, and start querying your documents with
              AI-powered retrieval.
            </p>
            <div className={styles.quickStartButtons}>
              <Link
                className="button button--primary button--lg"
                to="/docs/Introduction"
              >
                View Documentation
              </Link>
              <Link
                className="button button--outline button--lg"
                to="/docs/Examples"
              >
                See Examples
              </Link>
            </div>
          </div>
          <div className="col col--6">
            <div className={styles.codeExample}>
              <pre>
                <code>
                  {`npm install @devilsdev/rag-pipeline-utils

const { createRagPipeline } = require('@devilsdev/rag-pipeline-utils');

const pipeline = createRagPipeline({
  loader: new PDFLoader(),
  embedder: new OpenAIEmbedder(),
  retriever: new PineconeRetriever(),
  llm: new OpenAILLM()
});

// Documents are loaded via the loader plugin configured above
const result = await pipeline.run({ query: 'What is the vacation policy?' });`}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomepageKeyFeatures() {
  const features = [
    {
      title: "Modular Plugin Architecture",
      description:
        "5 plugin types with JSON Schema contracts and 7 provider connectors (OpenAI, Anthropic, Cohere, Ollama, and more).",
      link: "/docs/Plugins",
    },
    {
      title: "Smart Chunking & Retrieval",
      description:
        "5 chunking strategies, hybrid vector + BM25 search, and reciprocal rank fusion for highly relevant context retrieval.",
      link: "/docs/Architecture",
    },
    {
      title: "RAG Evaluation",
      description:
        "Faithfulness, relevance, context precision/recall, and groundedness metrics to measure and improve pipeline quality.",
      link: "/docs/Evaluation",
    },
    {
      title: "Citation & Grounding",
      description:
        "Source attribution, hallucination detection, and groundedness scoring to ensure trustworthy AI-generated answers.",
      link: "/docs/Evaluation",
    },
    {
      title: "Agentic RAG & GraphRAG",
      description:
        "Query planning, iterative retrieval, self-critique loops, and knowledge graph traversal for complex multi-hop questions.",
      link: "/docs/Architecture",
    },
    {
      title: "3-Layer Guardrails",
      description:
        "Prompt injection detection, ACL filtering, and PII detection to protect your pipeline at input, retrieval, and output stages.",
      link: "/docs/Security",
    },
    {
      title: "Streaming & Connectors",
      description:
        "SSE/WebSocket streaming plus built-in OpenAI, Anthropic, Cohere, and Ollama connectors for flexible deployment.",
      link: "/docs/Performance",
    },
    {
      title: "Cost & Debugging",
      description:
        "Token tracking, budget enforcement, execution tracing, and bottleneck detection for full pipeline observability.",
      link: "/docs/Performance",
    },
    {
      title: "Enterprise Security",
      description:
        "JWT replay protection, plugin sandboxing, audit logging, and multi-tenancy support for production deployments.",
      link: "/docs/Security",
    },
  ];

  return (
    <section className={styles.keyFeaturesSection}>
      <div className="container">
        <h2 className="text--center margin-bottom--lg">
          Production-Ready Features
        </h2>
        <div className="row">
          {features.map((feature, idx) => (
            <div key={idx} className="col col--4 margin-bottom--lg">
              <div className={styles.featureCard}>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <Link to={feature.link} className={styles.featureLink}>
                  Learn more →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HomepageCTA() {
  return (
    <section className={styles.ctaSection}>
      <div className="container text--center">
        <h2>Ready to Build Production RAG Systems?</h2>
        <p className={styles.ctaDesc}>
          Join developers building enterprise-grade RAG pipelines with modular
          architecture, comprehensive security, and production observability.
        </p>
        <div className={styles.ctaButtons}>
          <Link
            className="button button--primary button--lg"
            to="/docs/Introduction"
          >
            Get Started Now
          </Link>
          <Link
            className="button button--outline button--lg"
            href="https://github.com/DevilsDev/rag-pipeline-utils"
          >
            View on GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <Layout
      title="Enterprise RAG Pipeline Utils"
      description="Enterprise-grade composable RAG pipelines with advanced AI capabilities, comprehensive observability, and production-ready architecture for Node.js"
    >
      <HomepageHeader />
      <main>
        <HomepageStats />
        <HomepageFeatures />
        <HomepageQuickStart />
        <HomepageKeyFeatures />
        <HomepageCTA />
      </main>
    </Layout>
  );
}
