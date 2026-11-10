import React, { useId, useState } from "react";
import clsx from "clsx";
import useIsBrowser from "@docusaurus/useIsBrowser";
import { readTable, textOf } from "@site/src/lib/mdxTable";
import styles from "./styles.module.css";

/*
 * Wraps the "At a glance" Markdown table on the Comparison page. The table
 * stays in the Markdown; this adds row groups, the ✅ 🟡 ❌ marks as labelled
 * badges, and (once the page has loaded) group tabs, a search box and a
 * "Compare with" column highlight.
 */

// Row groups, by the text of each row's first cell. A row not listed here
// goes in "Other", so a new row in the Markdown still shows.
const GROUPS = [
  {
    id: "pipeline",
    label: "Pipeline",
    rows: [
      "RAG pipeline",
      "Vector stores",
      "LLM providers",
      "Agents and tools",
    ],
  },
  {
    id: "quality",
    label: "Quality and safety",
    rows: ["Evaluation", "Citations", "Guardrails"],
  },
  {
    id: "running",
    label: "Running it",
    rows: ["Runs offline in tests", "Edge runtimes"],
  },
  {
    id: "basics",
    label: "Basics",
    rows: [
      "Primary focus",
      "License",
      "Install size",
      "Module format",
      "Stability policy",
    ],
  },
];
const OTHER = { id: "other", label: "Other", rows: [] };

const MARKS = [
  { mark: "✅", rating: "strong", label: "Strong" },
  { mark: "🟡", rating: "partial", label: "Partial" },
  { mark: "❌", rating: "none", label: "Not built in" },
];

/** Splits a leading ✅ 🟡 ❌ off a cell's contents. */
function rate(content) {
  const parts = React.Children.toArray(content);
  const first = parts[0];
  if (typeof first !== "string") return { rating: null, content };
  const trimmed = first.trimStart();
  const found = MARKS.find((m) => trimmed.startsWith(m.mark));
  if (!found) return { rating: null, content };
  const rest = trimmed.slice(found.mark.length).replace(/^️?\s*/, "");
  return { ...found, content: [rest, ...parts.slice(1)] };
}

function Badge({ rating, label }) {
  return (
    <span className={clsx(styles.badge, styles[rating])}>
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
        {rating === "strong" && (
          <path
            d="M20 6 9 17l-5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {rating === "partial" && (
          <>
            <circle
              cx="12"
              cy="12"
              r="8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
          </>
        )}
        {rating === "none" && (
          <path
            d="M6 12h12"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        )}
      </svg>
      {label}
    </span>
  );
}

function Pill({ pressed, onClick, children }) {
  return (
    <button
      type="button"
      className={clsx(styles.pill, pressed && styles.pillOn)}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function ComparisonTable({ children }) {
  const isBrowser = useIsBrowser();
  const searchId = useId();
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [compare, setCompare] = useState(0);

  const table = readTable(children);
  if (!table) return children;

  const names = table.head.map(textOf);
  const q = query.trim().toLowerCase();
  const byGroup = new Map([...GROUPS, OTHER].map((g) => [g.id, []]));
  for (const cells of table.rows) {
    const label = textOf(cells[0]).trim();
    const g = GROUPS.find((x) => x.rows.includes(label)) || OTHER;
    byGroup.get(g.id).push({ label, cells, text: cells.map(textOf).join(" ") });
  }
  const shownGroups = [...GROUPS, OTHER]
    .filter((g) => byGroup.get(g.id).length > 0)
    .filter((g) => group === "all" || g.id === group)
    .map((g) => ({
      ...g,
      rows: byGroup
        .get(g.id)
        .filter((r) => !q || r.text.toLowerCase().includes(q)),
    }))
    .filter((g) => g.rows.length > 0);
  const shownCount = shownGroups.reduce((n, g) => n + g.rows.length, 0);

  // Column 1 is this library; columns 2 and up can be compared with it.
  const colClass = (i) =>
    clsx(i === 1 && styles.ours, compare > 1 && i === compare && styles.focus);

  return (
    <div className={styles.wrap}>
      {isBrowser && (
        <div className={styles.controls}>
          <div className={styles.controlRow} role="group" aria-label="Show">
            <Pill pressed={group === "all"} onClick={() => setGroup("all")}>
              All
            </Pill>
            {GROUPS.map((g) => (
              <Pill
                key={g.id}
                pressed={group === g.id}
                onClick={() => setGroup(g.id)}
              >
                {g.label}
              </Pill>
            ))}
          </div>
          <div className={styles.controlRow}>
            <label className={styles.search} htmlFor={searchId}>
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="m20 20-3.5-3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span className={styles.srOnly}>Search the table</span>
              <input
                id={searchId}
                type="search"
                placeholder="Search, e.g. pgvector"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div
              className={styles.compare}
              role="group"
              aria-labelledby={`${searchId}-compare`}
            >
              <span id={`${searchId}-compare`} className={styles.compareLabel}>
                Compare with
              </span>
              {names.slice(2).map((name, k) => (
                <Pill
                  key={name}
                  pressed={compare === k + 2}
                  onClick={() => setCompare(compare === k + 2 ? 0 : k + 2)}
                >
                  {name}
                </Pill>
              ))}
            </div>
          </div>
          <p className={styles.count} aria-live="polite">
            {shownCount === table.rows.length
              ? `Showing all ${shownCount} rows`
              : `Showing ${shownCount} of ${table.rows.length} rows`}
          </p>
        </div>
      )}

      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {table.head.map((content, i) => (
                <th key={i} scope="col" className={colClass(i)}>
                  <span className={styles.colName}>{content}</span>
                  {i === 1 && <span className={styles.tag}>This library</span>}
                  {compare > 1 && i === compare && (
                    <span className={clsx(styles.tag, styles.tagFocus)}>
                      Comparing
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          {shownGroups.map((g) => (
            <tbody key={g.id}>
              <tr className={styles.groupRow}>
                <th scope="rowgroup" colSpan={names.length}>
                  {g.label}
                </th>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.label}>
                  {r.cells.map((content, i) => {
                    if (i === 0) {
                      return (
                        <th key={i} scope="row" className={styles.rowHead}>
                          {content}
                        </th>
                      );
                    }
                    const { rating, label, content: rest } = rate(content);
                    return (
                      <td key={i} className={colClass(i)}>
                        {rating && <Badge rating={rating} label={label} />}
                        <span className={styles.cellText}>{rest}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {shownCount === 0 && (
        <p className={styles.empty}>
          No rows match “{query.trim()}”.{" "}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setQuery("");
              setGroup("all");
            }}
          >
            Show all rows
          </button>
        </p>
      )}
    </div>
  );
}
