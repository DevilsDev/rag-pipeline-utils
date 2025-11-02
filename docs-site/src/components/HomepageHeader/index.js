/**
 * Version: 2.4.2
 * Description: Crash-proof homepage header with full fallback safety
 * Author: Ali Kahwaji
 */

import React from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Link from "@docusaurus/Link";
import clsx from "clsx";
import styles from "./index.module.css";
import Logo from "@site/static/img/logo.svg";

export default function HomepageHeader() {
  let siteConfig = {
    title: "RAG Pipeline Utils",
    tagline: "Composable pipelines for LLMs",
  };

  try {
    const context = useDocusaurusContext();
    if (context && context.siteConfig) {
      siteConfig = {
        title: context.siteConfig.title || siteConfig.title,
        tagline: context.siteConfig.tagline || siteConfig.tagline,
      };
    }
  } catch (e) {
    console.warn("useDocusaurusContext failed:", e);
  }

  return (
    <header className={clsx("hero", styles.heroBanner)}>
      <div className="container text--center">
        <Logo className={styles.logo} role="img" alt="RAG Utils Logo" />
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--primary button--lg"
            to="/docs/Introduction"
          >
            Get Started
          </Link>
          <Link className="button button--outline button--lg" to="/blog">
            Visit Blog
          </Link>
        </div>
      </div>
    </header>
  );
}
