/**
 * Helpers for components that wrap Markdown written in the page.
 *
 * A component such as <ComparisonTable> takes a Markdown table (or list) as
 * its children, so the Markdown stays the single source: it is what
 * /llms-full.txt and readers without JavaScript get. These helpers read the
 * React elements MDX builds from it, during render, so the result is in the
 * static HTML too.
 */
import { Children, isValidElement } from "react";

/** Plain text of a React node tree. */
export function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf(node.props.children);
  return "";
}

/** Child elements of `node`, skipping the whitespace strings MDX leaves. */
export function elementsOf(node) {
  return Children.toArray(node).filter(isValidElement);
}

/**
 * First element of `type` in the tree, depth first. `type` is a tag name or
 * a list of accepted types (a tag name and the component MDX maps it to).
 */
export function findElement(node, type) {
  const types = [].concat(type);
  for (const el of elementsOf(node)) {
    if (types.includes(el.type)) return el;
    const inner = findElement(el.props.children, type);
    if (inner) return inner;
  }
  return null;
}

/**
 * Reads the first table in `children`.
 * @returns {{ head: React.ReactNode[], rows: React.ReactNode[][] } | null}
 *   The header cells' contents and each body row's cell contents.
 */
export function readTable(children) {
  const table = findElement(children, "table");
  if (!table) return null;
  const cellsOf = (tr) =>
    elementsOf(tr.props.children)
      .filter((c) => c.type === "td" || c.type === "th")
      .map((c) => c.props.children);
  const headRow = findElement(findElement(table.props.children, "thead"), "tr");
  const body = findElement(table.props.children, "tbody");
  return {
    head: headRow ? cellsOf(headRow) : [],
    rows: body
      ? elementsOf(body.props.children)
          .filter((tr) => tr.type === "tr")
          .map(cellsOf)
      : [],
  };
}

/**
 * Each list item's contents in the first list in `children`.
 * @param mdx The page's MDX components (useMDXComponents()): Docusaurus maps
 *   `ul` and `li` to its own components, so the elements MDX builds have
 *   those types rather than the tag names.
 */
export function readList(children, mdx = {}) {
  const list =
    findElement(children, ["ul", mdx.ul].filter(Boolean)) ||
    findElement(children, ["ol", mdx.ol].filter(Boolean));
  if (!list) return [];
  const li = ["li", mdx.li].filter(Boolean);
  return elementsOf(list.props.children)
    .filter((item) => li.includes(item.type))
    .map((item) => item.props.children);
}
