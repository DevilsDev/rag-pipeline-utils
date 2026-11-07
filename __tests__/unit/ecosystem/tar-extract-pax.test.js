/**
 * Extended (pax) headers in plugin archives: the path record is read by its
 * length prefix, in time linear in the header size.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { extractTarGz } = require("../../../src/ecosystem/tar-extract");

jest.setTimeout(30000);

// The suite runs on fake timers; the clock below must be real.
beforeEach(() => jest.useRealTimers());

function header(name, size, type) {
  const h = Buffer.alloc(512);
  h.write(name, 0);
  h.write(size.toString(8).padStart(11, "0") + "\0", 124);
  h[156] = type.charCodeAt(0);
  h.write("ustar\0", 257);
  h.write("00", 263);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  return h;
}

function pad(data) {
  return Buffer.alloc((512 - (data.length % 512)) % 512);
}

/** One pax record: "<len> key=value\n", len counting the whole record. */
function record(key, value) {
  const body = ` ${key}=${value}\n`;
  let len = Buffer.byteLength(body) + 1;
  while (Buffer.byteLength(String(len) + body) !== len) len += 1;
  return `${len}${body}`;
}

function archive(paxData, fileName = "ignored.txt", content = "hello") {
  const parts = [];
  if (paxData !== null) {
    const data = Buffer.isBuffer(paxData) ? paxData : Buffer.from(paxData);
    parts.push(header("PaxHeader", data.length, "x"), data, pad(data));
  }
  const body = Buffer.from(content);
  parts.push(header(fileName, body.length, "0"), body, pad(body));
  parts.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(parts));
}

function timed(fn) {
  const start = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - start) / 1e6;
}

describe("pax path records", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tar-pax-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("a long path in a pax header names the file", () => {
    const long = `package/${"deep/".repeat(30)}file.txt`;
    const { files } = extractTarGz(archive(record("path", long)), dir, {
      strip: 1,
    });
    expect(files).toEqual([long.replace(/^package\//, "")]);
    expect(
      fs.readFileSync(path.join(dir, ...files[0].split("/")), "utf8"),
    ).toBe("hello");
  });

  test("the path record is found among other records", () => {
    const data =
      record("mtime", "1700000000.123") +
      record("comment", "note") +
      record("path", "package/lib/index.js") +
      record("uid", "1000");
    const { files } = extractTarGz(archive(data), dir, { strip: 1 });
    expect(files).toEqual(["lib/index.js"]);
  });

  test("a multi-byte path is read by bytes", () => {
    const { files } = extractTarGz(
      archive(record("path", "package/é/ü.txt")),
      dir,
      { strip: 1 },
    );
    expect(files).toEqual(["é/ü.txt"]);
  });

  test("an entry without a pax header keeps its own name", () => {
    const { files } = extractTarGz(archive(null, "package/a.txt"), dir, {
      strip: 1,
    });
    expect(files).toEqual(["a.txt"]);
  });

  test("a pax header without a path keeps the entry name", () => {
    const { files } = extractTarGz(
      archive(record("mtime", "1"), "package/b.txt"),
      dir,
      { strip: 1 },
    );
    expect(files).toEqual(["b.txt"]);
  });

  test("a path that leaves the destination is refused", () => {
    expect(() =>
      extractTarGz(archive(record("path", "../outside.txt")), dir),
    ).toThrow(/escapes the destination/);
  });

  test("a large header of digits is read in linear time", () => {
    const data = Buffer.from("1".repeat(100000));
    const ms = timed(() =>
      extractTarGz(archive(data, "package/a.js"), dir, { strip: 1 }),
    );
    expect(ms).toBeLessThan(2000);
  });

  test("a large header of digit groups is read in linear time", () => {
    const data = Buffer.from("1 ".repeat(150000));
    const ms = timed(() =>
      extractTarGz(archive(data, "package/a.js"), dir, { strip: 1 }),
    );
    expect(ms).toBeLessThan(2000);
  });

  test("a header with a record longer than its data is skipped", () => {
    const { files } = extractTarGz(
      archive("99999 path=package/x.txt\n", "package/c.txt"),
      dir,
      { strip: 1 },
    );
    expect(files).toEqual(["c.txt"]);
  });
});
