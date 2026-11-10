#!/usr/bin/env node
"use strict";

/**
 * The posts for one release, built only from files in the repository: the
 * release notes (release-notes/v<version>.md) and the release's blog post.
 * No model writes these, so a release always announces itself the same way.
 *
 *   node scripts/promote/release-posts.js v3.7.1 <out-dir>
 *
 * Writes one post spec per channel into <out-dir> for post.js:
 *   discussion  the release notes, in Announcements
 *   devto       the blog post, with its canonical URL on the docs site
 *   bluesky     one sentence and the blog link
 *   mastodon    the same, with hashtags
 * A release without a blog post gets no dev.to post, and the short posts
 * link to the GitHub release instead.
 */

const fs = require("fs");
const path = require("path");
const { LIMITS, graphemes } = require("./guards");

const ROOT = path.resolve(__dirname, "../..");
const SITE = "https://devilsdev.github.io/rag-pipeline-utils";
const REPO_URL = "https://github.com/DevilsDev/rag-pipeline-utils";

function frontMatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: md };
  const data = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  return { data, body: md.slice(m[0].length) };
}

/** The blog post whose slug is v3-7-1-release (or v3-7-release for x.y.0). */
function findBlogPost(version) {
  const [major, minor, patch] = version.split(".");
  const slugs = [`v${major}-${minor}-${patch}-release`];
  if (patch === "0") slugs.push(`v${major}-${minor}-release`);
  const dir = path.join(ROOT, "docs-site/blog");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const md = fs.readFileSync(path.join(dir, file), "utf8");
    const { data, body } = frontMatter(md);
    if (slugs.includes(data.slug)) {
      return {
        file: `docs-site/blog/${file}`,
        title: data.title,
        url: `${SITE}/blog/${data.slug}`,
        body,
      };
    }
  }
  return null;
}

/**
 * Plain text of a Markdown sentence: links become their text, code spans
 * keep their content as written (`nodejs_compat` stays nodejs_compat),
 * and * and _ are dropped only as emphasis markers, not inside words
 * (snake_case).
 */
function plain(md) {
  const code = [];
  return md
    .replace(/`([^`]*)`/g, (_m, c) => `\u0000${code.push(c) - 1}\u0000`)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*?)(?=\S)([^*]*?\S)\1/g, "$2")
    .replace(/(?<![\p{L}\p{N}])(__?)(?=\S)(.*?\S)\1(?![\p{L}\p{N}])/gu, "$2")
    .replace(/\u0000(\d+)\u0000/g, (_m, i) => code[Number(i)])
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentence(md) {
  const paragraph = md
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("```") && !p.startsWith("#"));
  const text = plain(paragraph || "");
  const m = text.match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : text;
}

/** For dev.to: site-relative links ("/docs/CLI") made absolute. */
function absolutize(md) {
  return md
    .replace(/<!--\s*truncate\s*-->\n?/g, "")
    .replace(/\]\(\/(?!\/)/g, `](${SITE}/`);
}

function shortPost(lead, link, limit, suffix = "") {
  const tail = `\n\n${link}${suffix}`;
  let text = `${lead}${tail}`;
  if (graphemes(text) <= limit) return text;
  // too long: the lead is cut at a word boundary with an ellipsis
  const room = limit - graphemes(tail) - 1;
  const cut = [...new Intl.Segmenter().segment(lead)]
    .slice(0, room)
    .map((s) => s.segment)
    .join("")
    .replace(/\s+\S*$/, "");
  return `${cut}…${tail}`;
}

function buildPosts(tag) {
  const version = tag.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error(`not a release tag: ${tag}`);
  const notesFile = `release-notes/v${version}.md`;
  const notes = fs.readFileSync(path.join(ROOT, notesFile), "utf8");
  const blog = findBlogPost(version);
  const releaseUrl = `${REPO_URL}/releases/tag/v${version}`;
  const key = `release-v${version}`;
  const sources = [
    notesFile,
    `CHANGELOG.md#${version}`,
    ...(blog ? [blog.file] : []),
  ];
  const lead = `rag-pipeline-utils ${version} is out. ${firstSentence(notes)}`;
  const link = blog ? blog.url : releaseUrl;

  const posts = [
    {
      key,
      channel: "discussion",
      sources,
      title: `rag-pipeline-utils ${version} released`,
      body: `${notes.trim()}\n\n[Release on GitHub](${releaseUrl})${blog ? ` · [Blog post](${blog.url})` : ""}`,
    },
    {
      key,
      channel: "bluesky",
      sources,
      text: shortPost(lead, link, LIMITS.bluesky),
    },
    {
      key,
      channel: "mastodon",
      sources,
      text: shortPost(
        lead,
        link,
        LIMITS.mastodon,
        "\n\n#NodeJS #JavaScript #RAG #OpenSource",
      ),
    },
  ];
  if (blog) {
    posts.push({
      key,
      channel: "devto",
      sources,
      title: blog.title,
      body: `${absolutize(blog.body).trim()}\n\n---\n\n_Originally published on the [rag-pipeline-utils blog](${blog.url})._`,
      tags: ["node", "ai", "rag", "javascript"],
      canonicalUrl: blog.url,
      description: firstSentence(notes),
    });
  }
  return posts;
}

if (require.main === module) {
  const [tag, outDir] = process.argv.slice(2);
  if (!tag || !outDir) {
    console.error("usage: release-posts.js <tag> <out-dir>");
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  for (const post of buildPosts(tag)) {
    const file = path.join(outDir, `${post.key}.${post.channel}.json`);
    fs.writeFileSync(file, `${JSON.stringify(post, null, 2)}\n`);
    console.log(file);
  }
}

module.exports = {
  buildPosts,
  findBlogPost,
  firstSentence,
  absolutize,
  shortPost,
};
