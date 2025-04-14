import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

import FeatureImage from '@site/static/img/logo.svg';

const FeatureList = [
  {
    title: 'Composable Pipelines',
    Svg: FeatureImage,
    description: (
      <>
        Build flexible RAG workflows with interchangeable loaders, embedders, retrievers, and LLM runners using a clean plugin-based design.
      </>
    ),
  },
  {
    title: 'Evaluation & Dashboard',
    Svg: FeatureImage,
    description: (
      <>
        Use built-in CLI tooling and React dashboards to assess LLM accuracy, BLEU/ROUGE scores, and prompt results at scale.
      </>
    ),
  },
  {
    title: 'Fully Extendable',
    Svg: FeatureImage,
    description: (
      <>
        Register custom components with the PluginRegistry and extend the system without modifying the core logic.
      </>
    ),
  },
];

function Feature({Svg, title, description}) {
  return (
    <div className={clsx('col col--4', styles.feature)}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <h3 className={styles.featureTitle}>{title}</h3>
        <p className={styles.featureText}>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      {FeatureList.map((props, idx) => (
        <Feature key={idx} {...props} />
      ))}
    </section>
  );
}
