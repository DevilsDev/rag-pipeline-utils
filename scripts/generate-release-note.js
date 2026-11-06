#!/usr/bin/env node

/**
 * Drafts the release blog post for a version from its CHANGELOG.md section
 * and, when there is one, release-notes/v<version>.md.
 *
 * The draft is a starting point for the maintainer: the release-blog
 * workflow opens a pull request with it, and nothing goes live until that
 * pull request is reviewed and merged. A version that already has a post
 * (by slug or file name) is skipped, so hand-written posts are never
 * overwritten.
 *
 * The output is valid Docusaurus MDX: bare `{`, `}` and `<` outside code
 * are escaped, HTML comments are dropped, and relative links become
 * absolute GitHub links at the release tag.
 *
 * Usage:
 *   node scripts/generate-release-note.js [version] [options]
 *
 *   version        e.g. 3.7.0 or v3.7.0 (default: package.json version)
 *   --blog-dir d   where existing posts are looked up (docs-site/blog)
 *   --out d        where the draft is written (default: the blog dir)
 *   --date d       YYYY-MM-DD for the file name and front matter
 *                  (default: the CHANGELOG section's date, else today)
 *   --force        write even when a post for the version exists
 *   --stdout       print the draft instead of writing it
 *
 * When GITHUB_OUTPUT is set, it writes skipped, reason, path and slug.
 * Node built-ins only, so the workflow needs no `npm ci`.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const REPO_URL = "https://github.com/DevilsDev/rag-pipeline-utils";
const PACKAGE = "@devilsdev/rag-pipeline-utils";
const ROOT = path.resolve(__dirname, "..");

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;

/**
 * @param {string} version "3.7.0" or "v3.7.0"
 * @returns {{major:number, minor:number, patch:number, version:string}}
 */
function parseVersion(version) {
  const m = SEMVER.exec(String(version || "").trim());
  if (!m) {
    throw new Error(
      `Not a release version: "${version}" (expected x.y.z, no prerelease)`,
    );
  }
  const [major, minor, patch] = m.slice(1).map(Number);
  return { major, minor, patch, version: `${major}.${minor}.${patch}` };
}

function isPatch(version) {
  return parseVersion(version).patch !== 0;
}

/** Slug used by the hand-written posts: v3-6-release, v3-1-1-release. */
function slugFor(version) {
  const { major, minor, patch } = parseVersion(version);
  return patch === 0
    ? `v${major}-${minor}-release`
    : `v${major}-${minor}-${patch}-release`;
}

/** File name used by the hand-written posts: 2026-11-05-v3.6-release.md. */
function fileNameFor(version, date) {
  const { major, minor, patch } = parseVersion(version);
  const v = patch === 0 ? `${major}.${minor}` : `${major}.${minor}.${patch}`;
  return `${date}-v${v}-release.md`;
}

function frontMatterSlug(md) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!fm) return null;
  const line = /^slug:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(fm[1]);
  return line ? line[1] : null;
}

/**
 * Finds a post that already covers the version, by front matter slug or by
 * file name. For x.y.0 both the short (v3-6) and long (v2-4-0) forms count.
 * @returns {string|null} the existing file's path
 */
function findExistingPost(blogDir, version) {
  if (!fs.existsSync(blogDir)) return null;
  const { major, minor, patch } = parseVersion(version);
  const slugs = new Set([`v${major}-${minor}-${patch}-release`]);
  const names = [`v${major}.${minor}.${patch}-release`];
  if (patch === 0) {
    slugs.add(`v${major}-${minor}-release`);
    names.push(`v${major}.${minor}-release`);
  }
  for (const entry of fs.readdirSync(blogDir).sort()) {
    if (!/\.mdx?$/.test(entry)) continue;
    const base = entry.replace(/\.mdx?$/, "");
    if (names.some((n) => base.endsWith(`-${n}`) || base === n)) {
      return path.join(blogDir, entry);
    }
    const file = path.join(blogDir, entry);
    const slug = frontMatterSlug(fs.readFileSync(file, "utf8"));
    if (slug && slugs.has(slug)) return file;
  }
  return null;
}

/**
 * The CHANGELOG section for a version, from its `## [x.y.z]` heading to the
 * next `## ` heading.
 * @returns {{date:string|null, body:string}|null}
 */
function extractChangelogSection(md, version) {
  // Every regex metacharacter escaped, not just the dots
  const v = parseVersion(version).version.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const head = new RegExp(`^## \\[v?${v}\\](.*)$`);
  const start = lines.findIndex((l) => head.test(l));
  if (start === -1) return null;
  const date = /(\d{4}-\d{2}-\d{2})/.exec(head.exec(lines[start])[1]);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return {
    date: date ? date[1] : null,
    body: lines
      .slice(start + 1, end)
      .join("\n")
      .trim(),
  };
}

/** Splits markdown at its first heading of the given level. */
function splitAtFirstHeading(md, level) {
  const re = new RegExp(`^${"#".repeat(level)} `, "m");
  const m = re.exec(md);
  if (!m) return { intro: md.trim(), rest: "" };
  return {
    intro: md.slice(0, m.index).trim(),
    rest: md.slice(m.index).trim(),
  };
}

const FENCE = /^\s*(`{3,}|~{3,})/;

/**
 * Rewrites one markdown link target. External links stay as they are,
 * site paths (/docs/...) stay for Docusaurus to resolve, anchors point at
 * the source file on GitHub, and relative paths become GitHub links at the
 * release tag, resolved from the source file's directory.
 */
function rewriteLink(target, { tag, sourcePath }) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  if (target.startsWith("/")) return target;
  const source = sourcePath || "CHANGELOG.md";
  if (target.startsWith("#"))
    return `${REPO_URL}/blob/${tag}/${source}${target}`;
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(source), target),
  );
  return `${REPO_URL}/blob/${tag}/${resolved.replace(/^(\.\.\/)+/, "")}`;
}

/** Escapes MDX-significant characters in prose (no code). */
function escapeProse(text, opts) {
  return (
    text
      // <https://...> autolinks are JSX in MDX: make them plain links.
      .replace(/<((?:https?|mailto):[^>\s]+)>/g, "[$1]($1)")
      .replace(
        /\]\(([^)\s]+)(\s+"[^"]*")?\)/g,
        (_, target, title) => `](${rewriteLink(target, opts)}${title || ""})`,
      )
      .replace(/[{}]/g, (c) => `\\${c}`)
      .replace(/</g, "&lt;")
  );
}

/** Escapes a line, leaving `inline code` spans untouched. */
function escapeLine(line, opts) {
  let out = "";
  let i = 0;
  while (i < line.length) {
    const tick = line.indexOf("`", i);
    if (tick === -1) {
      out += escapeProse(line.slice(i), opts);
      break;
    }
    out += escapeProse(line.slice(i, tick), opts);
    const run = /^`+/.exec(line.slice(tick))[0];
    const close = line.indexOf(run, tick + run.length);
    if (close === -1) {
      // No closing run on this line: treat the backticks as text.
      out += run;
      i = tick + run.length;
      continue;
    }
    out += line.slice(tick, close + run.length);
    i = close + run.length;
  }
  return out;
}

/**
 * Makes markdown from the CHANGELOG or release notes safe for Docusaurus
 * MDX. Fenced code blocks (indented ones too, inside list items) and inline
 * code are kept; HTML comments are dropped.
 * @param {string} md
 * @param {{tag:string, sourcePath?:string}} opts
 */
function toMdxSafe(md, opts) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let fence = null;
  let prose = [];
  const flush = () => {
    if (!prose.length) return;
    // Drop HTML comments until none is left (one pass can leave "<!--" from
    // nested or overlapping ones); escapeLine then escapes any stray "<"
    let text = prose.join("\n");
    for (let prev = null; prev !== text; ) {
      prev = text;
      text = text.replace(/<!--[\s\S]*?-->/g, "");
    }
    for (const l of text.split("\n")) out.push(escapeLine(l, opts));
    prose = [];
  };
  for (const line of lines) {
    const m = FENCE.exec(line);
    if (fence) {
      out.push(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) {
        if (/^\s*[`~]+\s*$/.test(line)) fence = null;
      }
    } else if (m) {
      flush();
      fence = m[1];
      out.push(line);
    } else {
      prose.push(line);
    }
  }
  flush();
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function yamlString(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function hasFencedCode(md) {
  return md.split("\n").some((l) => FENCE.test(l));
}

/**
 * Builds the draft post.
 * @param {object} p
 * @param {string} p.version
 * @param {string} p.changelog the version's CHANGELOG section body
 * @param {string} [p.releaseNotes] release-notes/v<version>.md, if any
 * @param {string} p.date YYYY-MM-DD
 * @returns {string}
 */
function buildPost({ version, changelog, releaseNotes, date }) {
  const v = parseVersion(version);
  const tag = `v${v.version}`;
  const patch = v.patch !== 0;
  const shortName = patch ? v.version : `${v.major}.${v.minor}`;
  const changelogUrl = `${REPO_URL}/blob/${tag}/CHANGELOG.md`;
  const install = [
    "```bash",
    `npm install ${PACKAGE}@^${v.version}`,
    "```",
  ].join("\n");

  let intro;
  let body;
  if (releaseNotes && releaseNotes.trim()) {
    const notes = releaseNotes
      .replace(/\r\n/g, "\n")
      // The notes link to this post; the post doesn't need to.
      .replace(/\s*·\s*\[Blog post\]\([^)]*\)/g, "")
      .replace(/^\s*\[Blog post\]\([^)]*\)\s*$/gm, "");
    const parts = splitAtFirstHeading(notes, 2);
    const opts = { tag, sourcePath: `release-notes/${tag}.md` };
    intro = toMdxSafe(parts.intro, opts);
    if (!hasFencedCode(intro)) intro = `${intro}\n\n${install}`;
    body = toMdxSafe(parts.rest, opts);
  } else {
    const parts = splitAtFirstHeading(changelog, 3);
    const opts = { tag, sourcePath: "CHANGELOG.md" };
    intro = toMdxSafe(parts.intro, opts) || `${PACKAGE} ${tag} is out.`;
    intro = `${intro}\n\n${install}`;
    let rest = parts.rest;
    const sections = (rest.match(/^### /gm) || []).length;
    if (patch && sections === 1) {
      // A patch post is short: one "What changed" list.
      rest = rest.replace(/^### .*$/m, "## What changed");
    } else {
      rest = rest.replace(/^### /gm, "## ");
    }
    body = toMdxSafe(rest, opts);
  }

  const footer = /\]\([^)#]*CHANGELOG\.md\)/.test(body)
    ? ""
    : `\n\nThe full list is in the [CHANGELOG](${changelogUrl}).`;

  return [
    "---",
    `slug: ${slugFor(v.version)}`,
    `title: ${yamlString(`RAG Pipeline Utils v${shortName}`)}`,
    "authors: [ali]",
    "tags: [release]",
    `date: ${yamlString(date)}`,
    "---",
    "",
    intro,
    "",
    "<!-- truncate -->",
    "",
    `${body}${footer}`.trim(),
    "",
  ].join("\n");
}

/**
 * Generates (and by default writes) the draft for a version.
 * @returns {{skipped:boolean, reason?:string, path?:string, slug:string, content?:string}}
 */
function generate({
  version,
  root = ROOT,
  blogDir = path.join(root, "docs-site", "blog"),
  outDir,
  date,
  force = false,
  write = true,
}) {
  const v = parseVersion(version);
  const slug = slugFor(v.version);
  const existing = findExistingPost(blogDir, v.version);
  if (existing && !force) {
    return {
      skipped: true,
      reason: `a post for ${v.version} exists: ${path.relative(root, existing).replace(/\\/g, "/")}`,
      slug,
    };
  }
  const changelogMd = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const section = extractChangelogSection(changelogMd, v.version);
  if (!section) {
    throw new Error(`CHANGELOG.md has no "## [${v.version}]" section`);
  }
  const notesPath = path.join(root, "release-notes", `v${v.version}.md`);
  const releaseNotes = fs.existsSync(notesPath)
    ? fs.readFileSync(notesPath, "utf8")
    : null;
  const postDate =
    date || section.date || new Date().toISOString().slice(0, 10);
  const content = buildPost({
    version: v.version,
    changelog: section.body,
    releaseNotes,
    date: postDate,
  });
  const file = path.join(outDir || blogDir, fileNameFor(v.version, postDate));
  if (write) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  }
  return { skipped: false, path: file, slug, content };
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force" || a === "--stdout" || a === "--help" || a === "-h") {
      args[a.replace(/^-+/, "")] = true;
    } else if (a.startsWith("--")) {
      const [key, inline] = a.slice(2).split("=", 2);
      args[key] = inline !== undefined ? inline : argv[++i];
    } else {
      args._.push(a);
    }
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args.h) {
    process.stdout.write(
      fs
        .readFileSync(__filename, "utf8")
        .split("\n")
        .slice(3, 30)
        .map((l) => l.replace(/^ \* ?/, ""))
        .join("\n") + "\n",
    );
    return 0;
  }
  const version =
    args._[0] ||
    args.version ||
    require(path.join(ROOT, "package.json")).version;
  const result = generate({
    version,
    blogDir: args["blog-dir"] && path.resolve(args["blog-dir"]),
    outDir: args.out && path.resolve(args.out),
    date: args.date,
    force: Boolean(args.force),
    write: !args.stdout,
  });
  if (process.env.GITHUB_OUTPUT) {
    const rel = result.path
      ? path.relative(process.cwd(), result.path).replace(/\\/g, "/")
      : "";
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `skipped=${result.skipped}\nreason=${result.reason || ""}\npath=${rel}\nslug=${result.slug}\n`,
    );
  }
  if (result.skipped) {
    console.log(`Skipped: ${result.reason}`); // eslint-disable-line no-console
  } else if (args.stdout) {
    process.stdout.write(result.content);
  } else {
    console.log(`Wrote ${result.path}`); // eslint-disable-line no-console
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(`generate-release-note: ${err.message}`); // eslint-disable-line no-console
    process.exitCode = 1;
  }
}

module.exports = {
  parseVersion,
  isPatch,
  slugFor,
  fileNameFor,
  findExistingPost,
  extractChangelogSection,
  toMdxSafe,
  buildPost,
  generate,
  main,
  REPO_URL,
};
