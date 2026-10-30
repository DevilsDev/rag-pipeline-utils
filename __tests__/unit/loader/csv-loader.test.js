"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { CSVLoader } = require("../../../src/loader/csv-loader");

let dir;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "csv-loader-"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

async function chunks(name, content) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  const [doc] = await new CSVLoader().load(file);
  return doc.chunk();
}

describe("CSVLoader", () => {
  test("one chunk per row, with quoted fields, a BOM and CRLF line endings", async () => {
    await expect(
      chunks("people.csv", '﻿name,team\r\nAna,Sales\r\n"Bo, Jr",Ops\r\n'),
    ).resolves.toEqual(["Ana Sales", "Bo, Jr Ops"]);
  });

  test("a __proto__ header does not touch Object.prototype (GHSA-8cw4-87c7-c6xx)", async () => {
    await expect(
      chunks("proto.csv", "__proto__,name\npolluted,x\n"),
    ).resolves.toEqual(["polluted x"]);
    expect({}.polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("name");
  });

  test("a malformed file reports the path", async () => {
    await expect(chunks("bad.csv", 'a,b\n"unclosed,1\n')).rejects.toThrow(
      /CSV parsing failed for .*bad\.csv/,
    );
  });
});
