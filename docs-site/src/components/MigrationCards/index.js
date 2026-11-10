import React, { useState } from "react";
import clsx from "clsx";
import useIsBrowser from "@docusaurus/useIsBrowser";
import { readTable, textOf } from "@site/src/lib/mdxTable";
import styles from "./styles.module.css";

/*
 * Wraps the "Migration friction" Markdown table on the Comparison page
 * (columns: From, Effort, What's involved) and shows each row as a card with
 * an effort meter. Once the page has loaded, a reader can show one framework
 * only or sort the cards easiest first.
 *
 * `archived`: names (comma-separated) whose project is archived, shown with a
 * badge.
 */

// Effort, on a scale of 3, by the text of the Effort cell.
const LEVELS = { Low: 1, "Low–Medium": 2, Medium: 3 };

export default function MigrationCards({ children, archived = "" }) {
  const isBrowser = useIsBrowser();
  const [pick, setPick] = useState("all");
  const [easiest, setEasiest] = useState(false);

  const table = readTable(children);
  if (!table) return children;

  const archivedNames = archived
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const items = table.rows.map(([from, effort, text]) => {
    const name = textOf(from).trim();
    const effortText = textOf(effort).trim();
    return {
      name,
      from,
      effortText,
      level: LEVELS[effortText] ?? 0,
      text,
      archived: archivedNames.includes(name),
    };
  });
  const shown = items.filter((i) => pick === "all" || i.name === pick);
  const ordered = easiest
    ? [...shown].sort((a, b) => a.level - b.level)
    : shown;

  return (
    <div className={styles.wrap}>
      {isBrowser && (
        <div className={styles.controls}>
          <div className={styles.picks} role="group" aria-label="Coming from">
            {[{ name: "all", label: "Show all" }]
              .concat(items.map((i) => ({ name: i.name, label: i.name })))
              .map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={clsx(
                    styles.pill,
                    pick === p.name && styles.pillOn,
                  )}
                  aria-pressed={pick === p.name}
                  onClick={() => setPick(p.name)}
                >
                  {p.label}
                </button>
              ))}
          </div>
          <button
            type="button"
            className={clsx(styles.pill, easiest && styles.pillOn)}
            aria-pressed={easiest}
            onClick={() => setEasiest(!easiest)}
          >
            Easiest first
          </button>
        </div>
      )}
      <ul className={styles.cards}>
        {ordered.map((i) => (
          <li key={i.name} className={styles.card}>
            <div className={styles.head}>
              <h3 className={styles.from}>{i.from}</h3>
              {i.archived && <span className={styles.archived}>Archived</span>}
            </div>
            <div className={styles.effort}>
              <span className={styles.effortLabel}>Effort: {i.effortText}</span>
              {i.level > 0 && (
                <span
                  className={styles.meter}
                  role="img"
                  aria-label={`${i.level} of 3`}
                >
                  {[1, 2, 3].map((n) => (
                    <span
                      key={n}
                      className={clsx(styles.seg, n <= i.level && styles.segOn)}
                    />
                  ))}
                </span>
              )}
            </div>
            <p className={styles.text}>{i.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
