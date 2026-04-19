#!/usr/bin/env node
/**
 * Bulk ingest a directory of .txt / .md files into a running demo
 * server.
 *
 * Usage:
 *   node scripts/ingest.js ./docs
 *   SERVER=http://localhost:3000 node scripts/ingest.js ./docs
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, join, basename, extname } from "node:path";

const SERVER = process.env.SERVER ?? "http://localhost:3000";
const SUPPORTED = new Set([".txt", ".md", ".mdx"]);

async function* walk(dir) {
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      yield* walk(full);
    } else if (SUPPORTED.has(extname(entry).toLowerCase())) {
      yield full;
    }
  }
}

async function main() {
  const dir = resolve(process.argv[2] ?? "./docs");
  let count = 0;
  let failed = 0;

  for await (const file of walk(dir)) {
    const text = await readFile(file, "utf8");
    const id = file.replace(dir + "/", "").replace(/\\/g, "/");

    const res = await fetch(`${SERVER}/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        text,
        metadata: { source: basename(file), bytes: text.length },
      }),
    });

    if (res.ok) {
      count++;
      console.log(`✓ ${id}`);
    } else {
      failed++;
      console.error(`✗ ${id} — ${res.status}`);
    }
  }

  console.log(`\nIngested ${count} document(s), ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
