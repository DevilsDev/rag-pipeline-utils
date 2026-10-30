/**
 * Homepage hero. The tagline and version come from the root package.json
 * through docusaurus.config.js, so nothing here needs a release bump.
 */

import React from "react";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import InstallCommand from "@site/src/components/InstallCommand";
import GroundingDemo from "@site/src/components/GroundingDemo";
import styles from "./index.module.css";

const STAGES = [
  "query",
  "retrieve",
  "rerank",
  "generate",
  "answer + citations",
];

export default function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  const version = siteConfig.customFields?.version;

  return (
    <header className={styles.hero}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />
      <div className="container">
        <div className={styles.layout}>
          <div className={styles.copy}>
            <div className={styles.chips}>
              {version && (
                <Link
                  className={styles.chip}
                  href={`https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v${version}`}
                >
                  v{version} released
                </Link>
              )}
              <span className={styles.chip}>MIT</span>
              <span className={styles.chip}>Node.js ≥ 22</span>
            </div>

            <h1 className={styles.title}>
              RAG for Node.js that{" "}
              <span className={styles.accent}>shows its sources</span>
            </h1>
            <p className={styles.tagline}>{siteConfig.tagline}</p>

            <InstallCommand />

            <div className={styles.actions}>
              <Link
                className="button button--primary button--lg"
                to="/docs/Introduction"
              >
                Get started
              </Link>
              <Link
                className={`button button--lg ${styles.ghost}`}
                to="#quick-start"
              >
                Quick start
              </Link>
              <Link
                className={`button button--lg ${styles.ghost}`}
                href="https://github.com/DevilsDev/rag-pipeline-utils"
              >
                GitHub
              </Link>
            </div>
          </div>

          <div className={styles.demo}>
            <GroundingDemo />
          </div>
        </div>

        <ol className={styles.pipeline} aria-label="Pipeline stages">
          {STAGES.map((stage, i) => (
            <li
              key={stage}
              className={
                i === STAGES.length - 1 ? styles.stageFinal : styles.stage
              }
            >
              {stage}
            </li>
          ))}
        </ol>
      </div>
    </header>
  );
}
