/**
 * Version: 1.4.1
 * Description: Feature grid with Framer Motion and deduplicated layout
 * Author: Ali Kahwaji
 */

import React from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import styles from './index.module.css';

import FeatureImage from '@site/static/img/logo.svg';

const features = [
  {
    title: 'Composable Pipelines',
    description: 'Build flexible RAG workflows with interchangeable loaders, embedders, retrievers, and LLM runners using a clean plugin-based design.',
  },
  {
    title: 'Evaluation & Dashboard',
    description: 'Use built-in CLI tooling and React dashboards to assess LLM accuracy, BLEU/ROUGE scores, and prompt results at scale.',
  },
  {
    title: 'Fully Extendable',
    description: 'Register custom components with the PluginRegistry and extend the system without modifying the core logic.',
  },
];

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {features.map((feature, idx) => (
            <motion.div
              key={idx}
              className={clsx('col col--4', styles.feature)}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, delay: idx * 0.2 }}
            >
              <div className="text--center">
                <FeatureImage className={styles.featureSvg} role="img" alt={feature.title} />
              </div>
              <div className="text--center padding-horiz--md">
                <h3 className={styles.featureTitle}>{feature.title}</h3>
                <p className={styles.featureText}>{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
