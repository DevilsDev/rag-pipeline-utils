// docs-site/src/pages/index.js

import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import HomepageHeader from "@site/src/components/HomepageHeader";
import HomepageFeatures from "@site/src/components/HomepageFeatures";
import styles from "./index.module.css";

function HomepageStats() {
  const stats = [
    { value: "90%+", label: "Test Coverage" },
    { value: "500+", label: "Texts/sec" },
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

await pipeline.ingest('./docs');
const result = await pipeline.query('What is the vacation policy?');`}
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
        "Swap any component without rewriting your pipeline. Choose from built-in plugins or create custom loaders, embedders, retrievers, and LLMs.",
      link: "/docs/Plugins",
    },
    {
      title: "Enterprise Security",
      description:
        "Advanced JWT validation with replay protection, multi-layer input sanitization, path traversal defense, and comprehensive audit logging.",
      link: "/docs/Security",
    },
    {
      title: "Production Observability",
      description:
        "SLO monitoring, metrics collection, distributed tracing, structured logging, and error budget tracking for mission-critical deployments.",
      link: "/docs/Observability",
    },
    {
      title: "AI/ML Capabilities",
      description:
        "Multi-modal processing for text, images, audio, and video. Adaptive retrieval with reinforcement learning and federated learning support.",
      link: "/docs/Enterprise",
    },
    {
      title: "DAG Workflow Engine",
      description:
        "Execute complex multi-stage RAG workflows as directed acyclic graphs with parallel processing and conditional logic.",
      link: "/docs/API-Reference",
    },
    {
      title: "Developer Experience",
      description:
        "Enhanced CLI with diagnostics, hot module reloading, interactive configuration wizards, and real-time debugging capabilities.",
      link: "/docs/CLI",
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
