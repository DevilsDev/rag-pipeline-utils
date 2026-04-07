/**
 * Version: 1.4.1
 * Description: Feature grid with Framer Motion and deduplicated layout
 * Author: Ali Kahwaji
 */

import React from "react";
import clsx from "clsx";
import styles from "./index.module.css";

import FeatureImage from "@site/static/img/logo.svg";

const features = [
  {
    title: "Modular Plugin Architecture",
    description:
      "5 plugin types with JSON Schema contracts and 7 provider connectors (OpenAI, Anthropic, Cohere, Ollama, and more). Swap any component without rewriting your pipeline.",
  },
  {
    title: "Smart Chunking & Retrieval",
    description:
      "5 chunking strategies, hybrid vector + BM25 search, and reciprocal rank fusion for highly relevant context retrieval across large document sets.",
  },
  {
    title: "RAG Evaluation",
    description:
      "Faithfulness, relevance, context precision/recall, and groundedness metrics to measure and improve RAG pipeline quality.",
  },
];

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {features.map((feature, idx) => (
            <div key={idx} className={clsx("col col--4", styles.feature)}>
              <div className="text--center">
                <FeatureImage
                  className={styles.featureSvg}
                  role="img"
                  alt={feature.title}
                />
              </div>
              <div className="text--center padding-horiz--md">
                <h3 className={styles.featureTitle}>{feature.title}</h3>
                <p className={styles.featureText}>{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
