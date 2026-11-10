"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { readDocuments } = require("../../../src/loader/document-reader");
const { MarkdownLoader } = require("../../../src/loader/markdown-loader");
const { HTMLLoader } = require("../../../src/loader/html-loader");

describe("blank files do not fail the ingest", () => {
  let dir;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rpu-blank-"));
    fs.writeFileSync(path.join(dir, "empty.txt"), "");
    fs.writeFileSync(path.join(dir, "spaces.md"), "  \n\n  ");
    fs.writeFileSync(
      path.join(dir, "blank.html"),
      "<html><body> </body></html>",
    );
    fs.writeFileSync(path.join(dir, "empty.csv"), "");
    fs.writeFileSync(path.join(dir, "real.txt"), "A real sentence here.");
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("readDocuments returns no chunks for blank files and keeps the rest", async () => {
    const docs = await readDocuments(dir, { baseDir: dir });
    const bySource = Object.fromEntries(docs.map((d) => [d.source, d.chunks]));
    expect(bySource["empty.txt"]).toEqual([]);
    expect(bySource["spaces.md"]).toEqual([]);
    expect(bySource["blank.html"]).toEqual([]);
    expect(bySource["real.txt"]).toEqual(["A real sentence here."]);
  });

  test("loaders return an empty chunk list for blank text", async () => {
    const md = await new MarkdownLoader().load(path.join(dir, "spaces.md"));
    expect(md.flatMap((d) => d.chunk())).toEqual([]);
    const html = await new HTMLLoader().load(path.join(dir, "blank.html"));
    expect(html.flatMap((d) => d.chunk())).toEqual([]);
  });
});

describe("MarkdownLoader decodes HTML entities in the text it extracts", () => {
  test("entities from the Markdown renderer become plain characters", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rpu-md-"));
    try {
      const file = path.join(dir, "a.md");
      fs.writeFileSync(
        file,
        '# Tom & Jerry\n\nUse `a < b && c > d`, "quotes" and it\'s fine. Literal &amp;lt; stays.\n',
      );
      const docs = await new MarkdownLoader().load(file);
      const text = docs.flatMap((d) => d.chunk()).join(" ");
      expect(text).toContain("Tom & Jerry");
      expect(text).toContain("a < b && c > d");
      expect(text).toContain('"quotes"');
      expect(text).toContain("it's");
      expect(text).toContain("&lt; stays");
      expect(text).not.toMatch(/&amp;|&quot;|&#39;/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
