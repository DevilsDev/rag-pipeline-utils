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
