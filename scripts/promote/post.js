#!/usr/bin/env node
"use strict";

/**
 * Publish one post, after the checks in guards.js, at most once per key and
 * channel. The promotion routines write a post spec and call this; they
 * never call a channel directly.
 *
 *   node scripts/promote/post.js <spec.json> [--dry-run [--skip-links]]
 *
 * spec: {
 *   "key": "release-v3.7.1",          // one post per key and channel
 *   "channel": "devto" | "bluesky" | "mastodon" | "discussion",
 *   "sources": ["CHANGELOG.md#3.7.1", "docs-site/blog/2026-11-06-v3.7.1-release.md"],
 *   "text": "...",                     // bluesky, mastodon
 *   "title": "...", "body": "...",     // devto, discussion
 *   "tags": ["node", "ai"], "canonicalUrl": "https://...", "description": "..."
 * }
 *
 * Exit codes: 0 published or already published, 2 a check failed,
 * 3 the channel has no credentials (skipped), 1 any other error.
 */

const fs = require("fs");
const path = require("path");
const { checkText, checkLinks } = require("./guards");
const channels = require("./channels");

const ROOT = path.resolve(__dirname, "../..");

/** "CHANGELOG.md#3.7.1" reads that version's section; a path reads the file. */
function readSource(ref) {
  const [file, version] = ref.split("#");
  const full = path.resolve(ROOT, file);
  if (!full.startsWith(ROOT + path.sep))
    throw new Error(`source outside the repo: ${ref}`);
  const text = fs.readFileSync(full, "utf8");
  if (!version) return text;
  const start = text.indexOf(`## [${version}]`);
  if (start < 0) throw new Error(`no section ${version} in ${file}`);
  const next = text.indexOf("\n## [", start + 1);
  return text.slice(start, next < 0 ? undefined : next);
}

async function main(argv, deps = {}) {
  const log = deps.log || console.log;
  const specPath = argv.find((a) => !a.startsWith("--"));
  const dryRun = argv.includes("--dry-run");
  // for a routine's dry run, where the network may not reach every host;
  // the Promote workflow checks the links before publishing
  const skipLinks = dryRun && argv.includes("--skip-links");
  if (!specPath) throw new Error("usage: post.js <spec.json> [--dry-run]");
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const { key, channel } = spec;
  if (!/^[a-z0-9][a-z0-9.-]{2,80}$/.test(key || ""))
    throw new Error(`bad key: ${key}`);

  const source = (spec.sources || []).map(readSource).join("\n\n");
  const text =
    channel === "devto" || channel === "discussion"
      ? `${spec.title}\n\n${spec.body}`
      : spec.text;

  const problems = [
    ...checkText({ channel, text, source }),
    ...(spec.canonicalUrl
      ? checkText({
          channel,
          text: spec.canonicalUrl,
          source: spec.canonicalUrl,
        })
      : []),
  ];
  if (!problems.length && !skipLinks) {
    problems.push(
      ...(await checkLinks(`${text}\n${spec.canonicalUrl || ""}`, deps)),
    );
  }
  if (problems.length) {
    log(`✗ ${key} ${channel}: not published\n  - ${problems.join("\n  - ")}`);
    return 2;
  }

  const run = deps.run;
  if (channels.alreadyPosted(key, channel, { run, create: !dryRun })) {
    log(`= ${key} ${channel}: already published, skipped`);
    return 0;
  }
  if (dryRun) {
    log(`✓ ${key} ${channel}: checks passed (dry run, not published)`);
    return 0;
  }

  const opts = {
    env: deps.env || process.env,
    fetchImpl: deps.fetchImpl || fetch,
  };
  let url;
  try {
    if (channel === "devto") url = await channels.postDevto(spec, opts);
    else if (channel === "bluesky")
      url = await channels.postBluesky(spec, opts);
    else if (channel === "mastodon")
      url = await channels.postMastodon({ ...spec, key }, opts);
    else url = await channels.postDiscussion(spec, { run });
  } catch (err) {
    if (err.code === "NOT_CONFIGURED") {
      log(`- ${key} ${channel}: skipped, ${err.message}`);
      return 3;
    }
    throw err;
  }
  channels.record(
    key,
    channel,
    { url, text: channel === "devto" ? spec.title : text },
    { run },
  );
  log(`✓ ${key} ${channel}: published ${url}`);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`✗ ${err.message}`);
      process.exit(1);
    },
  );
}

module.exports = { main, readSource };
