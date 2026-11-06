/**
 * @devilsdev/rag-mcp-server: visible text of HTML documents, and the time it
 * takes on documents with openers that are never closed.
 */

const {
  htmlText,
} = require("../../../packages/rag-mcp-server/lib/documents.js");

describe("rag-mcp-server htmlText", () => {
  beforeAll(() => jest.useRealTimers());

  test.each([
    [
      "<html><head><title>t</title><style>p{}</style></head><body><h1>Hi</h1><!-- note --><p>a &amp; b</p><script>x()</script></body></html>",
      "Hi a & b",
    ],
    ["<p>no body</p><SCRIPT type=x>y</Script >z", "no body z"],
    ["<body class=a>one</body>two</body>", "one two"],
    ["<body>keep <b>bold</b> < 5", "keep bold 5"],
    ["<!-- open <p>text", "text"],
    ["a <script>b", "a b"],
    ["<<b>script>c", "script c"],
    ["<template><p>t</p></template><noscript>n</noscript>v", "v"],
  ])("%s", (html, expected) => {
    expect(htmlText(html)).toBe(expected);
  });

  test.each([
    ["<body ", "<body "],
    ["unclosed <", "<"],
    ["<script ", "<script "],
    ["<style ", "<style "],
    ["<!--", "<!--"],
    ["</body> after <body", "<body>" + "x</body"],
  ])("linear time: 100,000 characters of %s", (_label, unit) => {
    const html = unit.repeat(Math.ceil(100000 / unit.length));
    const start = process.hrtime.bigint();
    htmlText(html);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    expect(ms).toBeLessThan(500);
  });
});
