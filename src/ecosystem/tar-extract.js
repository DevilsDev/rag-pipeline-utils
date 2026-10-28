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

/** Parse "<len> path=<value>\n" records from a pax extended header. */
function parsePaxPath(data) {
  const match = data.toString('utf8').match(/\d+ path=([^\n]*)\n/);
  return match ? match[1] : null;
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
