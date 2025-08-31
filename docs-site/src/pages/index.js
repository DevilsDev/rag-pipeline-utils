// docs-site/src/pages/index.js

import React from 'react';
import Layout from '@theme/Layout';
import HomepageHeader from '@site/src/components/HomepageHeader';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

export default function Home() {
  return (
    <Layout
      title="Enterprise RAG Pipeline Utils"
      description="Enterprise-grade composable RAG pipelines with advanced AI capabilities, comprehensive observability, and production-ready architecture for Node.js"
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
