/**
 * Build a gzipped ustar archive in memory for tests.
 * @param {Record<string, string|{type: string, linkname?: string}>} entries -
 *   path -> file content, or { type: '2', linkname } for a symlink
 * @returns {Buffer}
 */
const zlib = require("zlib");

function header(name, size, type, linkname = "") {
  const block = Buffer.alloc(512);
  block.write(name, 0, 100, "utf8");
  block.write("0000644\0", 100, 8, "utf8");
  block.write("0000000\0", 108, 8, "utf8");
  block.write("0000000\0", 116, 8, "utf8");
  block.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "utf8");
  block.write("00000000000\0", 136, 12, "utf8");
  block.write("        ", 148, 8, "utf8"); // checksum placeholder
  block.write(type, 156, 1, "utf8");
  block.write(linkname, 157, 100, "utf8");
  block.write("ustar\0", 257, 6, "utf8");
  block.write("00", 263, 2, "utf8");
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf8");
  return block;
}

function makeTgz(entries) {
  const blocks = [];
  for (const [name, value] of Object.entries(entries)) {
    if (typeof value === "string") {
      const data = Buffer.from(value, "utf8");
      blocks.push(header(name, data.length, "0"));
      blocks.push(data, Buffer.alloc((512 - (data.length % 512)) % 512));
    } else {
      blocks.push(header(name, 0, value.type, value.linkname));
    }
  }
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks));
}

module.exports = { makeTgz };
