import React, { useState } from "react";
import clsx from "clsx";
import example from "@site/src/data/heroExample.json";
import styles from "./styles.module.css";

/**
 * Shows what citations and groundedness look like on a real answer.
 * The scores in heroExample.json are CitationTracker's actual output for
 * these strings; __tests__/docs/site-homepage.test.js recomputes them.
 */
export default function GroundingDemo() {
  const [index, setIndex] = useState(0);
  const answer = example.answers[index];
  const grounded = answer.groundedness >= 0.5;

  return (
    <figure
      className={styles.card}
      aria-label="Citation and groundedness example"
    >
      <div className={styles.header}>
        <span className={styles.dots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={styles.file}>
          pipeline.run({"{ citations: true }"})
        </span>
      </div>

      <div className={styles.body}>
        <p className={styles.question}>
          <span className={styles.label}>query</span> {example.question}
        </p>

        <div
          className={styles.tabs}
          role="tablist"
          aria-label="Answer to check"
        >
          {example.answers.map((a, i) => (
            <button
              key={a.label}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={clsx(styles.tab, i === index && styles.tabActive)}
              onClick={() => setIndex(i)}
            >
              {a.label}
            </button>
          ))}
        </div>

        <p className={styles.answer}>
          {answer.text}
          {answer.citedSources.map((id, i) => (
            <sup key={id} className={styles.cite}>
              [{i + 1}]
            </sup>
          ))}
        </p>

        <div
          className={clsx(styles.verdict, grounded ? styles.ok : styles.bad)}
        >
          <span className={styles.score}>
            groundedness {answer.groundedness.toFixed(2)}
          </span>
          <span>
            {grounded
              ? `Every sentence is supported by ${answer.citedSources.join(", ")}`
              : "Not supported: the number does not appear in any source"}
          </span>
        </div>

        <ul className={styles.sources}>
          {example.sources.map((s) => (
            <li
              key={s.id}
              className={clsx(
                answer.citedSources.includes(s.id) && styles.sourceCited,
              )}
            >
              <span className={styles.sourceId}>{s.id}</span>
              <span className={styles.sourceText}>{s.content}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
