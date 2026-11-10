import React from "react";
import { useMDXComponents } from "@mdx-js/react";
import { readList, textOf } from "@site/src/lib/mdxTable";
import styles from "./styles.module.css";

/*
 * Wraps the known-gaps list on the Evaluation page and draws a bar for each
 * item before it. Each item reads "**Label**, N of M (P%) ...": the label is
 * the item's first bold text and the counts come from that pattern, so the
 * list stays the single source. Items without counts get no bar. CSS only,
 * no chart library; the list stays below as the text version.
 */

const COUNTS = /(\d+) of (\d+) \((\d+)%\)/;

export default function KnownGapsChart({ children, caption }) {
  const mdx = useMDXComponents();
  const rows = readList(children, mdx)
    .map((content) => {
      let parts = React.Children.toArray(content);
      // A loose list wraps each item's text in a paragraph.
      if (parts.length === 1 && ["p", mdx.p].includes(parts[0].type)) {
        parts = React.Children.toArray(parts[0].props.children);
      }
      const strong = parts.find((p) => React.isValidElement(p));
      const m = COUNTS.exec(textOf(content));
      if (!strong || !m) return null;
      return {
        label: textOf(strong).trim(),
        missed: Number(m[1]),
        total: Number(m[2]),
        pct: Number(m[3]),
      };
    })
    .filter(Boolean);

  return (
    <>
      {rows.length > 0 && (
        <figure className={styles.figure}>
          {caption && (
            <figcaption className={styles.caption}>{caption}</figcaption>
          )}
          <ul className={styles.rows}>
            {rows.map((r) => (
              <li key={r.label} className={styles.row}>
                <span className={styles.label}>{r.label}</span>
                <span className={styles.track} aria-hidden="true">
                  <span
                    className={styles.fill}
                    style={{ width: `${r.pct}%` }}
                  />
                </span>
                <span className={styles.value}>
                  {r.missed} of {r.total} ({r.pct}%)
                </span>
              </li>
            ))}
          </ul>
        </figure>
      )}
      {children}
    </>
  );
}
