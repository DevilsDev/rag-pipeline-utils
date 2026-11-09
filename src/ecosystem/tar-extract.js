'use strict';

/**
 * Minimal .tgz extractor for plugin packages (npm pack format). Extracts
 * regular files and directories only; symlinks, hard links and devices are
 * skipped, and every path must stay inside the destination directory.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BLOCK = 512;

/** Separator-agnostic "child is root or inside it" (paths already resolved). */
function isWithin(root, child) {
  const a = root.replace(/\\/g, '/').replace(/\/$/, '');
  const b = child.replace(/\\/g, '/');
  return b === a || b.startsWith(`${a}/`);
}

function readString(buffer, start, length) {
  const slice = buffer.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8');
}

function readOctal(buffer, start, length) {
  const text = readString(buffer, start, length).trim();
  return text ? parseInt(text, 8) : 0;
}

/**
 * Read the "path" record of a pax extended header. Records are
 * "<len> <key>=<value>\n", where <len> is the decimal byte length of the
 * whole record, so the header is walked record by record.
 *
 * @throws {Error} When a record is malformed: the archive is refused
 */
function parsePaxPath(data) {
  let pos = 0;
  const malformed = (reason) =>
    new Error(
      `Malformed pax extended header in archive (record at byte ${pos}): ${reason}`,
    );
  while (pos < data.length) {
    let len = 0;
    let at = pos;
    while (at < data.length && data[at] >= 0x30 && data[at] <= 0x39) {
      len = len * 10 + (data[at] - 0x30);
      if (len > data.length) throw malformed('length runs past the header');
      at += 1;
    }
    if (at === pos) throw malformed('missing length');
    if (data[at] !== 0x20) throw malformed('missing space after the length');
    const end = pos + len;
    if (end <= at + 1) throw malformed('length too short');
    if (end > data.length) throw malformed('length runs past the header');
    if (data[end - 1] !== 0x0a) throw malformed('record does not end in a newline');
    const body = data.subarray(at + 1, end - 1).toString('utf8');
    if (!body.includes('=')) throw malformed('record has no "="');
    if (body.startsWith('path=')) return body.slice(5);
    pos = end;
  }
  return null;
}

/**
 * Extract a gzipped tarball into destDir.
 *
 * @param {Buffer} archive - .tgz contents
 * @param {string} destDir - Target directory (created if missing)
 * @param {object} [options]
 * @param {number} [options.strip=0] - Leading path components to drop (npm packs use "package/")
 * @param {number} [options.maxBytes=50MB] - Refuse archives that expand beyond this
 * @returns {{files: string[], skipped: string[]}}
 */
function extractTarGz(archive, destDir, options = {}) {
  const { strip = 0, maxBytes = 50 * 1024 * 1024 } = options;
  const tar = zlib.gunzipSync(archive, { maxOutputLength: maxBytes });
  const root = path.resolve(destDir);
  fs.mkdirSync(root, { recursive: true });

  const files = [];
  const skipped = [];
  let offset = 0;
  let paxPath = null;

  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break; // end-of-archive marker

    const size = readOctal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48); // '\0' means file
    const prefix = readString(header, 345, 155);
    const headerName = readString(header, 0, 100);
    const name = paxPath || (prefix ? `${prefix}/${headerName}` : headerName);
    const dataStart = offset + BLOCK;
    const data = tar.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;

    if (type === 'x') {
      paxPath = parsePaxPath(data);
      continue;
    }
    paxPath = null;
    if (type === 'g') continue;

    const parts = name.split('/').filter((p) => p && p !== '.');
    const relative = parts.slice(strip).join('/');
    if (!relative) continue;

    const target = path.resolve(root, relative);
    if (!isWithin(root, target)) {
      throw new Error(`Archive entry escapes the destination: ${name}`);
    }

    if (type === '5') {
      fs.mkdirSync(target, { recursive: true });
    } else if (type === '0' || type === '\0' || type === '7') {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
      files.push(relative);
    } else {
      skipped.push(relative); // links, devices, fifos
    }
  }
  return { files, skipped };
}

module.exports = { extractTarGz, isWithin };

/**
 * Path of `child` relative to `root` with "/" separators, or null when it is
 * not inside root. Separator-agnostic like isWithin.
 */
function relativeWithin(root, child) {
  if (!isWithin(root, child)) return null;
  const a = root.replace(/\\/g, '/').replace(/\/$/, '');
  return child.replace(/\\/g, '/').slice(a.length + 1);
}

module.exports.relativeWithin = relativeWithin;
