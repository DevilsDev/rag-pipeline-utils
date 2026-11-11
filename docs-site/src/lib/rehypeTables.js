"use strict";

/**
 * Rehype plugin for Markdown tables, run at build time so the static HTML
 * has the result without JavaScript:
 *
 * - each table is wrapped in <div class="table-scroll">, a box that scrolls
 *   sideways when the table is wider than the content column;
 * - a column whose body cells are mostly numbers ("0.64 ms", "$0.0042",
 *   "117 / 150 (78.0%)") gets class "num" on its cells, for right alignment
 *   and tabular figures (see "Tables" in src/css/custom.css).
 *
 * A column with an alignment written in the Markdown (|---:|) keeps it.
 * Hand-written for hast, so it needs no ESM-only unist utilities.
 */

// One value: an optional qualifier, a number, an optional unit.
const VALUE =
  "(?:[~≈<>≤≥±+]\\s?)?[-−]?[$€£]?(?:\\d[\\d,]*(?:\\.\\d+)?|\\.\\d+)" +
  "(?:\\s?(?:%|×|x|[a-zA-Zµμ]{1,6}(?:\\/[a-zA-Z]{1,6})?))?";
// A value, a second one after "/", "of", "to", "–" or "±", and a value in
// brackets: "28 of 30 (93%)", "1–3 s", "4.2 ± 0.3 ms".
const NUMERIC = new RegExp(
  `^${VALUE}(?:\\s?(?:/|of|to|–|-|±)\\s?${VALUE})?(?:\\s?\\(${VALUE}\\))?$`,
  "u",
);
// Cells that say nothing either way.
const BLANK = /^(?:|[—–-]|n\/a|N\/A)$/;

/** Text of a hast node. */
function textOf(node) {
  if (node.type === "text") return node.value;
  return (node.children || []).map(textOf).join("");
}

function isNumeric(text) {
  return NUMERIC.test(text.replace(/\s+/g, " ").trim());
}

function isBlank(text) {
  return BLANK.test(text.replace(/\s+/g, " ").trim());
}

const elements = (node, tagName) =>
  (node.children || []).filter(
    (c) => c.type === "element" && (!tagName || c.tagName === tagName),
  );

/** The rows of `table`: [section, cells] for its thead and tbody rows. */
function rowsOf(table) {
  const rows = [];
  for (const section of elements(table)) {
    const trs = section.tagName === "tr" ? [section] : elements(section, "tr");
    for (const tr of trs) {
      const cells = elements(tr).filter(
        (c) => c.tagName === "td" || c.tagName === "th",
      );
      rows.push([section.tagName, cells]);
    }
  }
  return rows;
}

const hasAlign = (cell) =>
  Boolean(
    cell.properties &&
      (cell.properties.align ||
        /text-align/.test(String(cell.properties.style || ""))),
  );

function addClass(node, name) {
  const props = (node.properties = node.properties || {});
  const list = [].concat(props.className || []);
  if (!list.includes(name)) list.push(name);
  props.className = list;
}

/** Marks the numeric columns of `table` with class "num". */
function markNumericColumns(table) {
  const rows = rowsOf(table);
  const body = rows.filter(([section]) => section !== "thead");
  const width = Math.max(0, ...rows.map(([, cells]) => cells.length));
  for (let col = 0; col < width; col++) {
    const column = rows.map(([, cells]) => cells[col]).filter(Boolean);
    if (column.some(hasAlign)) continue;
    const texts = body
      .map(([, cells]) => cells[col])
      .filter(Boolean)
      .map(textOf)
      .filter((t) => !isBlank(t));
    const numbers = texts.filter(isNumeric).length;
    if (numbers === 0 || numbers * 2 <= texts.length) continue;
    for (const cell of column) addClass(cell, "num");
  }
}

function transform(node) {
  const children = node.children || [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === "element" && child.tagName === "table") {
      markNumericColumns(child);
      const wrapped =
        node.type === "element" &&
        [].concat(node.properties?.className || []).includes("table-scroll");
      if (!wrapped) {
        children[i] = {
          type: "element",
          tagName: "div",
          properties: { className: ["table-scroll"] },
          children: [child],
        };
      }
      continue;
    }
    // into elements, and into JSX such as admonitions and <details>
    if (child.children) transform(child);
  }
}

function rehypeTables() {
  return (tree) => {
    transform(tree);
  };
}

module.exports = rehypeTables;
module.exports.isNumeric = isNumeric;
