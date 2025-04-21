// docs-site/src/pages/index.js

import React from 'react';
import Layout from '@theme/Layout';
import HomepageHeader from '@site/src/components/HomepageHeader';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

export default function Home() {
  return (
    <Layout
      title="RAG Pipeline Utils"
      description="Composable RAG pipelines, dashboards, and plugin architecture for Node.js"
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
