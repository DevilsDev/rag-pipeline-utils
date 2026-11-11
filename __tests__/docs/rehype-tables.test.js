/**
 * The docs site's rehype plugin for Markdown tables
 * (docs-site/src/lib/rehypeTables.js): scroll boxes and numeric columns.
 */

const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const rehypeTables = require(
  path.join(ROOT, "docs-site/src/lib/rehypeTables.js"),
);
const { isNumeric } = rehypeTables;

// hast builders
const text = (value) => ({ type: "text", value });
const el = (tagName, children = [], properties = {}) => ({
  type: "element",
  tagName,
  properties,
  children: children.map((c) => (typeof c === "string" ? text(c) : c)),
});
const row = (tag, cells) =>
  el(
    "tr",
    cells.map((c) =>
      c && c.type === "element" && c.tagName === tag ? c : el(tag, [c]),
    ),
  );
const table = (head, body) =>
  el("table", [
    el("thead", [row("th", head)]),
    el(
      "tbody",
      body.map((cells) => row("td", cells)),
    ),
  ]);
const run = (tree) => {
  rehypeTables()(tree);
  return tree;
};
const classes = (node) => [].concat(node.properties.className || []);
/** "num" or "" for each cell of each row of a (wrapped) table. */
const marks = (t) =>
  t.children.flatMap((section) =>
    section.children.map((tr) =>
      tr.children.map((cell) => (classes(cell).includes("num") ? "num" : "")),
    ),
  );

describe("rehypeTables", () => {
  test("wraps each table in a scroll box", () => {
    const t = table(["a"], [["x"]]);
    const tree = run({ type: "root", children: [el("p", ["intro"]), t] });
    const box = tree.children[1];
    expect(box.tagName).toBe("div");
    expect(box.properties.className).toEqual(["table-scroll"]);
    expect(box.children).toEqual([t]);
  });

  test("wraps tables inside other elements and JSX (admonitions)", () => {
    const t = table(["a"], [["x"]]);
    const admonition = {
      type: "mdxJsxFlowElement",
      name: "Admonition",
      children: [t],
    };
    const tree = run({ type: "root", children: [admonition] });
    expect(admonition.children[0].properties.className).toEqual([
      "table-scroll",
    ]);
    expect(admonition.children[0].children[0]).toBe(t);
  });

  test("marks columns whose body cells are mostly numbers, header included", () => {
    const t = table(
      ["Pipeline", "p50", "Verified"],
      [
        ["no cache", "5.3 µs", "117 / 150 (78.0%)"],
        ["memory cache", "18.3 µs", "28 of 30 (93%)"],
      ],
    );
    run({ type: "root", children: [t] });
    expect(marks(t)).toEqual([
      ["", "num", "num"],
      ["", "num", "num"],
      ["", "num", "num"],
    ]);
  });

  test("reads the text inside code, strong and links", () => {
    const t = table(
      ["Name", "Cost"],
      [
        [el("code", ["fast"]), el("strong", ["$0.47"])],
        ["slow", el("a", ["1,024 ms"], { href: "#x" })],
      ],
    );
    run({ type: "root", children: [t] });
    expect(marks(t).map((r) => r[1])).toEqual(["num", "num", "num"]);
    expect(marks(t).map((r) => r[0])).toEqual(["", "", ""]);
  });

  test("empty, dash and n/a cells do not count against a column", () => {
    const t = table(
      ["Option", "Default"],
      [
        ["a", "20"],
        ["b", ""],
        ["c", "—"],
        ["d", "n/a"],
        ["e", "1"],
      ],
    );
    run({ type: "root", children: [t] });
    expect(marks(t).every((r) => r[1] === "num")).toBe(true);
  });

  test("a column that is half text or less stays a text column", () => {
    const t = table(
      ["Cases", "Temperature"],
      [
        ["72", "0"],
        ["64", "not sent"],
        ["136", "not sent"],
        ["", ""],
      ],
    );
    run({ type: "root", children: [t] });
    expect(marks(t).map((r) => r[0])).toEqual([
      "num",
      "num",
      "num",
      "num",
      "num",
    ]);
    expect(marks(t).map((r) => r[1])).toEqual(["", "", "", "", ""]);
  });

  test("a column of blanks only is not numeric", () => {
    const t = table(
      ["a", "b"],
      [
        ["x", ""],
        ["y", "—"],
      ],
    );
    run({ type: "root", children: [t] });
    expect(
      marks(t)
        .flat()
        .every((m) => m === ""),
    ).toBe(true);
  });

  test("keeps an alignment written in the Markdown", () => {
    const t = table(
      ["Name", el("th", ["Count"], { align: "center" })],
      [
        ["a", el("td", ["1"], { align: "center" })],
        ["b", el("td", ["2"], { align: "center" })],
      ],
    );
    run({ type: "root", children: [t] });
    expect(
      marks(t)
        .flat()
        .every((m) => m === ""),
    ).toBe(true);
  });

  test("keeps the cells' existing classes", () => {
    const cell = el("td", ["3"], { className: ["keep"] });
    const t = table(["n"], [[cell]]);
    run({ type: "root", children: [t] });
    expect(cell.properties.className).toEqual(["keep", "num"]);
  });
});

describe("isNumeric", () => {
  test.each([
    "0.64 ms",
    "5.3 µs",
    "117 / 150 (78.0%)",
    "28 of 30 (93%)",
    "$0.0042",
    "1,024",
    "1.2x",
    "~3 s",
    "−0.5",
    "4.2 ± 0.3 ms",
    "12 req/s",
    "30 days",
  ])("%s is a number", (value) => {
    expect(isNumeric(value)).toBe(true);
  });

  test.each([
    "3.9.1",
    "v3.9",
    "2026-11-10",
    "Node 22",
    "Yes",
    "not sent",
    "49 (11 FA, 12 miss)",
  ])("%s is not", (value) => {
    expect(isNumeric(value)).toBe(false);
  });
});
