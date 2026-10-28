// docs-site/src/pages/index.js

import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import CodeBlock from "@theme/CodeBlock";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import HomepageHeader from "@site/src/components/HomepageHeader";
import HomepageFeatures from "@site/src/components/HomepageFeatures";
import styles from "./index.module.css";

function HomepageStats() {
  const stats = [
    { value: "4 + 1", label: "Model providers + offline" },
    { value: "3", label: "Guardrail layers" },
    { value: "ESM + CJS", label: "With TypeScript types" },
    { value: "MIT", label: "License" },
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

// Same example as the README "Quick start", which runs in the test suite
// (__tests__/docs/readme-examples.test.js). Keep the two in sync.
const QUICK_START = `import {
  createRagPipeline,
  LocalEmbedder,
  MemoryRetriever,
} from "@devilsdev/rag-pipeline-utils";

const docs = [
  {
    id: "vacation",
    content: "Full-time employees receive twenty days of paid vacation per year.",
  },
  {
    id: "remote",
    content: "Remote work is allowed two days per week with manager approval.",
  },
];

// Fit the offline embedder to your corpus and index the documents.
const embedder = new LocalEmbedder();
embedder.train(docs.map((doc) => doc.content));

const retriever = new MemoryRetriever();
await retriever.store(
  docs.map((doc) => ({ ...doc, vector: embedder.embed(doc.content) })),
);

const pipeline = createRagPipeline({ embedder, retriever });
const result = await pipeline.run({
  query: "How many vacation days do I get?",
});

console.log(result.results[0].id); // "vacation"`;

function HomepageQuickStart() {
  return (
    <section className={styles.quickStartSection}>
      <div className="container">
        <div className="row">
          <div className="col col--5">
            <h2>Quick Start</h2>
            <p className={styles.quickStartDesc}>
              Install the package and run a pipeline in under a minute. This
              example needs no API keys: it uses the built-in TF-IDF embedder
              and an in-memory store. Add an LLM connector to generate cited
              answers.
            </p>
            <CodeBlock language="bash">
              npm install @devilsdev/rag-pipeline-utils
            </CodeBlock>
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
          <div className="col col--7">
            <CodeBlock language="js" title="quick-start.mjs">
              {QUICK_START}
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomepageUseCases() {
  const cases = [
    {
      tag: "Document Q&A",
      title: "Answer questions with citations",
      description:
        "Return grounded answers where every sentence links back to the source chunk. Per-sentence citation tracking and groundedness scoring built in.",
      code: `const result = await pipeline.run({
  query: "Which policy covers remote work?",
  options: { citations: true },
});
// result.citations maps each answer
// sentence to its source documents`,
      link: "/docs/Evaluation",
      linkLabel: "Citation & grounding docs",
    },
    {
      tag: "Internal knowledge",
      title: "Assistants with faithfulness guarantees",
      description:
        "Score every answer on faithfulness, relevance, context precision, and recall. Alert when quality drops below your production threshold.",
      code: `const result = await pipeline.run({
  query: userQuestion,
  options: { evaluate: true },
});
// result.evaluation.scores
//   = { faithfulness, relevance, ... }`,
      link: "/docs/Evaluation",
      linkLabel: "Evaluation harness docs",
    },
    {
      tag: "Enterprise service",
      title: "Pipelines with production guardrails",
      description:
        "Three-layer defense: prompt-injection detection pre-retrieval, relevance thresholds during retrieval, and PII + groundedness checks post-generation.",
      code: `const safePipeline = new GuardrailsPipeline(
  createRagPipeline({ ... }),
  {
    preRetrieval:  { enableInjectionDetection: true },
    retrieval:     { minRelevanceScore: 0.6 },
    postGeneration:{ enablePIIDetection: true },
  }
);`,
      link: "/docs/Security",
      linkLabel: "Guardrails docs",
    },
  ];

  return (
    <section className={styles.useCasesSection}>
      <div className="container">
        <h2 className="text--center margin-bottom--sm">
          Three Paths, One Pipeline
        </h2>
        <p className={styles.useCasesLead}>
          Start with retrieval. Add evaluation when quality matters. Add
          guardrails when you ship. Each primitive is optional — pick what your
          team actually needs.
        </p>
        <div className="row">
          {cases.map((c, idx) => (
            <div key={idx} className="col col--4 margin-bottom--lg">
              <div className={styles.useCaseCard}>
                <span className={styles.useCaseTag}>{c.tag}</span>
                <h3>{c.title}</h3>
                <p>{c.description}</p>
                <CodeBlock language="js" className={styles.useCaseCode}>
                  {c.code}
                </CodeBlock>
                <Link to={c.link} className={styles.featureLink}>
                  {c.linkLabel} →
                </Link>
              </div>
            </div>
          ))}
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
        "5 plugin types with JSON Schema contracts; connectors for OpenAI, Anthropic, Cohere and Ollama, plus an offline embedder.",
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
        "Faithfulness, relevance, context precision, context recall (with a reference answer) and groundedness.",
      link: "/docs/Evaluation",
    },
    {
      title: "Citation & Grounding",
      description:
        "Per-sentence source attribution, a hallucination report and a check that numbers in the answer appear in the sources.",
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
      title: "Security Building Blocks",
      description:
        "JWT validation with replay protection, signed plugins, and encrypted audit logs. Multi-tenancy, SSO and the plugin sandbox are experimental.",
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
        <h2>Build RAG you can check</h2>
        <p className={styles.ctaDesc}>
          Start offline with the quick start, then add a model, citations,
          evaluation and guardrails as you need them.
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
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Composable RAG for Node.js" description={siteConfig.tagline}>
      <HomepageHeader />
      <main>
        <HomepageStats />
        <HomepageFeatures />
        <HomepageQuickStart />
        <HomepageUseCases />
        <HomepageKeyFeatures />
        <HomepageCTA />
      </main>
    </Layout>
  );
}
