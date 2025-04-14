import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';

export default function Home() {
  return (
    <Layout title="RAG Pipeline Utils" description="Modular tools for retrieval-augmented generation">
      <main className="container margin-vert--xl text--center">
        <h1>Welcome to RAG Pipeline Utils</h1>
        <p className="hero__subtitle">
          A composable, pluggable RAG framework for Node.js with CLI, evaluation, and dashboard support.
        </p>

        <div style={{ marginTop: '2rem' }}>
          <Link
            className="button button--primary button--lg margin-horiz--sm"
            to="/docs/Introduction">
            📄 Get Started
          </Link>

          <Link
            className="button button--secondary button--lg margin-horiz--sm"
            to="/docs/CLI">
            🧰 CLI Reference
          </Link>

          <Link
            className="button button--info button--lg margin-horiz--sm"
            style={{ backgroundColor: '#e0f2ff', color: '#0366d6', border: '1px solid #b6e0fe' }}
            to="/docs/Evaluation">
            📈 Evaluation Dashboard
          </Link>
        </div>
      </main>
    </Layout>
  );
}
