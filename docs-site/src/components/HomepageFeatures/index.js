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
    title: 'Enterprise-Grade Architecture',
    description: 'Production-ready with dependency injection, SLO monitoring, semantic release automation, and comprehensive observability for mission-critical deployments.',
  },
  {
    title: 'Advanced AI Capabilities',
    description: 'Multi-modal processing, federated learning, adaptive retrieval engines, and model training orchestration with external API mocking for reliable testing.',
  },
  {
    title: 'Developer Experience Excellence',
    description: 'Enhanced CLI with doctor diagnostics, interactive wizards, streaming evaluation dashboards, and plugin marketplace with certification workflows.',
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
