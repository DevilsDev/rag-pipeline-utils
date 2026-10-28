import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import CodeBlock from "@theme/CodeBlock";
import useBaseUrl from "@docusaurus/useBaseUrl";
import useBrokenLinks from "@docusaurus/useBrokenLinks";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import HomepageHeader from "@site/src/components/HomepageHeader";
import styles from "./index.module.css";

// Same example as the README "Quick start". It runs in the test suite
// (__tests__/docs/site-homepage.test.js); keep the two in sync.
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

const PILLARS = [
  {
    title: "Citations you can check",
    text: "Each sentence of an answer is mapped to the passages that support it, with a groundedness score and a check that numbers match the sources.",
    code: `const { answer, citations } = await pipeline.run({
  query,
  options: { citations: true },
});`,
    link: "/docs/Concepts-Evaluation",
  },
  {
    title: "Evaluation built in",
    text: "Faithfulness, relevance, context precision, context recall and groundedness, per answer or over a test set.",
    code: `const { evaluation } = await pipeline.run({
  query,
  options: { evaluate: true, referenceAnswer },
});`,
    link: "/docs/Evaluation",
  },
  {
    title: "Guardrails at three stages",
    text: "Prompt-injection detection before retrieval, ACL and relevance filtering before generation, PII redaction after.",
    code: `const safe = new GuardrailsPipeline(pipeline, {
  retrieval: { enforceACL: true },
});`,
    link: "/docs/Concepts-Guardrails",
  },
  {
    title: "Production behaviour",
    text: "AbortSignal cancellation and real timeouts, retries only on transient errors, typed ESM and CommonJS exports.",
    code: `const controller = new AbortController();
await pipeline.run({
  query,
  options: { signal: controller.signal, timeout: 5000 },
});`,
    link: "/docs/API-Reference",
  },
];

const TOOLBOX = [
  ["Chunking", "Sentence, fixed-size, recursive, semantic and structure-aware"],
  ["Hybrid retrieval", "BM25 plus vectors, merged with reciprocal rank fusion"],
  ["Reranking", "Scoring, embedding (cached) and cascade rerankers"],
  ["Agentic RAG", "Query planning, iterative retrieval, self-critique"],
  ["GraphRAG", "Knowledge-graph construction and traversal"],
  ["Streaming", "Tokens, then a final chunk with citations and scores"],
  ["Cost control", "Token budgets and per-model cost tracking"],
  ["MCP", "Expose a pipeline as Model Context Protocol tools"],
];

const PROVIDERS = ["OpenAI", "Anthropic", "Cohere", "Ollama", "Offline TF-IDF"];

function Pillars() {
  return (
    <section className={styles.section}>
      <div className="container">
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Why rag-pipeline-utils</p>
          <h2>Answers your users can verify</h2>
          <p>
            One <code>createRagPipeline()</code> call wires an embedder, a
            retriever and an LLM. Everything below is an opt-in layer on top.
          </p>
        </div>
        <div className={styles.pillars}>
          {PILLARS.map((p) => (
            <article key={p.title} className={styles.pillar}>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
              <CodeBlock language="js" className={styles.pillarCode}>
                {p.code}
              </CodeBlock>
              <Link to={p.link} className={styles.more}>
                Learn more →
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CliDemo() {
  const gif = useBaseUrl("/img/cli-demo.gif");
  return (
    <section className={`${styles.section} ${styles.alt}`}>
      <div className="container">
        <div className={styles.split}>
          <div>
            <p className={styles.eyebrow}>Command line</p>
            <h2>Index a folder and ask it questions</h2>
            <p>
              <code>rag-pipeline</code> builds a persistent local index from
              Markdown, HTML, CSV and text files. The default template runs
              offline with no API keys; switch templates to answer with OpenAI,
              Anthropic or Ollama.
            </p>
            <CodeBlock language="bash">
              {`npx rag-pipeline init
npx rag-pipeline ingest ./docs
npx rag-pipeline query "What is the remote work policy?"
npx rag-pipeline serve --port 3000`}
            </CodeBlock>
            <Link to="/docs/CLI" className={styles.more}>
              CLI reference →
            </Link>
          </div>
          <div className={styles.terminal}>
            <img
              src={gif}
              alt="Terminal recording: rag-pipeline init, ingest ./docs, then a query that returns the vacation policy as the top passage"
              width="1200"
              height="680"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function QuickStart() {
  // The hero links here; register the id so the anchor check sees it.
  useBrokenLinks().collectAnchor("quick-start");
  return (
    <section id="quick-start" className={styles.section}>
      <div className="container">
        <div className={`${styles.split} ${styles.splitTop}`}>
          <div className={styles.sticky}>
            <p className={styles.eyebrow}>Quick start</p>
            <h2>Running in under a minute</h2>
            <p>
              This example needs no API keys: it uses the built-in TF-IDF
              embedder and an in-memory store. Add an LLM connector to generate
              cited answers, or swap in your own components. Each one is a plain
              object with the method its stage needs.
            </p>
            <ul className={styles.providers} aria-label="Built-in providers">
              {PROVIDERS.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <div className={styles.inlineActions}>
              <Link className="button button--primary" to="/docs/Introduction">
                Read the guide
              </Link>
              <Link className="button button--secondary" to="/docs/Examples">
                See examples
              </Link>
            </div>
          </div>
          <div className={styles.codeCol}>
            <CodeBlock language="js" title="quick-start.mjs">
              {QUICK_START}
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}

function Toolbox() {
  return (
    <section className={`${styles.section} ${styles.alt}`}>
      <div className="container">
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Also in the box</p>
          <h2>The rest of a RAG stack</h2>
        </div>
        <ul className={styles.toolbox}>
          {TOOLBOX.map(([name, text]) => (
            <li key={name}>
              <strong>{name}</strong>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Compare() {
  return (
    <section className={styles.section}>
      <div className="container">
        <div className={styles.compare}>
          <div>
            <p className={styles.eyebrow}>How it compares</p>
            <h2>Narrow on purpose</h2>
            <p>
              LangChain.js and LlamaIndex.TS are broad frameworks with large
              integration catalogues. This library focuses on RAG for Node.js
              services and ships evaluation, citations and guardrails as part of
              the pipeline, in one MIT package with a small surface to review.
            </p>
          </div>
          <Link
            className="button button--secondary button--lg"
            to="/docs/Comparison"
          >
            Read the comparison
          </Link>
        </div>
      </div>
    </section>
  );
}

function CallToAction() {
  return (
    <section className={styles.cta}>
      <div className="container">
        <h2>Build RAG you can check</h2>
        <p>
          Start offline, then add a model, citations, evaluation and guardrails
          as you need them.
        </p>
        <div className={styles.inlineActions}>
          <Link
            className="button button--primary button--lg"
            to="/docs/Introduction"
          >
            Get started
          </Link>
          <Link
            className={`button button--lg ${styles.ctaGhost}`}
            href="https://github.com/DevilsDev/rag-pipeline-utils"
          >
            Star on GitHub
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
        <Pillars />
        <CliDemo />
        <QuickStart />
        <Toolbox />
        <Compare />
        <CallToAction />
      </main>
    </Layout>
  );
}
