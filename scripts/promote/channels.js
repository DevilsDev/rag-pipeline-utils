"use strict";

/**
 * Publishing clients for the channels the promotion routines use. Each
 * takes its credentials from the environment (set on the routine's cloud
 * environment, never in the repository) and a fetch implementation, so
 * tests can run them against a fake.
 *
 *   dev.to     DEVTO_API_KEY
 *   Bluesky    BLUESKY_HANDLE, BLUESKY_APP_PASSWORD
 *   Mastodon   MASTODON_INSTANCE (https://fosstodon.org), MASTODON_ACCESS_TOKEN
 *   GitHub     gh CLI, authenticated in the session
 */

const { execFileSync } = require("child_process");

const REPO = "DevilsDev/rag-pipeline-utils";

function need(env, ...names) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) {
    const err = new Error(`missing ${missing.join(", ")}`);
    err.code = "NOT_CONFIGURED";
    throw err;
  }
}

async function ok(res, what) {
  if (res.status >= 200 && res.status < 300) return res.json();
  const body = await res.text().catch(() => "");
  // API error bodies don't carry credentials, but keep them short
  throw new Error(`${what} failed: ${res.status} ${body.slice(0, 300)}`);
}

/** The account's article with this title or canonical URL, if any. */
async function findDevtoArticle({ title, canonicalUrl }, { env, fetchImpl }) {
  const res = await fetchImpl(
    "https://dev.to/api/articles/me/all?per_page=1000",
    {
      headers: {
        "api-key": env.DEVTO_API_KEY,
        Accept: "application/vnd.forem.api-v1+json",
      },
    },
  );
  const articles = await ok(res, "dev.to articles");
  return articles.find(
    (a) =>
      a.title === title || (canonicalUrl && a.canonical_url === canonicalUrl),
  );
}

/**
 * dev.to article. `canonicalUrl` points search engines at the original.
 * dev.to sometimes answers 500 and still creates the article, so a retry
 * first looks for it: the same title or canonical URL is never posted twice.
 * @returns {Promise<string>} the article URL
 */
async function postDevto(
  { title, body, tags = [], canonicalUrl, description },
  {
    env = process.env,
    fetchImpl = fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = {},
) {
  need(env, "DEVTO_API_KEY");
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(15000 * attempt);
    const existing = await findDevtoArticle(
      { title, canonicalUrl },
      { env, fetchImpl },
    );
    if (existing) return existing.url;
    const res = await fetchImpl("https://dev.to/api/articles", {
      method: "POST",
      headers: {
        "api-key": env.DEVTO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/vnd.forem.api-v1+json",
      },
      body: JSON.stringify({
        article: {
          title,
          body_markdown: body,
          published: true,
          tags: tags.slice(0, 4),
          ...(canonicalUrl ? { canonical_url: canonicalUrl } : {}),
          ...(description ? { description } : {}),
        },
      }),
    });
    if (res.status < 500) {
      const data = await ok(res, "dev.to");
      return data.url;
    }
    lastError = await ok(res, "dev.to").catch((err) => err);
  }
  throw lastError;
}

/** Bluesky link facets: byte offsets of each URL in the UTF-8 text. */
function linkFacets(text) {
  const facets = [];
  const enc = new TextEncoder();
  for (const m of text.matchAll(/https:\/\/[^\s)<>"']+/g)) {
    const uri = m[0].replace(/[.,;:!?]+$/, "");
    const byteStart = enc.encode(text.slice(0, m.index)).length;
    facets.push({
      index: { byteStart, byteEnd: byteStart + enc.encode(uri).length },
      features: [{ $type: "app.bsky.richtext.facet#link", uri }],
    });
  }
  return facets;
}

/** @returns {Promise<string>} the post URL */
async function postBluesky(
  { text },
  { env = process.env, fetchImpl = fetch } = {},
) {
  need(env, "BLUESKY_HANDLE", "BLUESKY_APP_PASSWORD");
  const host = env.BLUESKY_SERVICE || "https://bsky.social";
  const session = await ok(
    await fetchImpl(`${host}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: env.BLUESKY_HANDLE,
        password: env.BLUESKY_APP_PASSWORD,
      }),
    }),
    "Bluesky login",
  );
  const created = await ok(
    await fetchImpl(`${host}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessJwt}`,
      },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.post",
        record: {
          $type: "app.bsky.feed.post",
          text,
          facets: linkFacets(text),
          langs: ["en"],
          createdAt: new Date().toISOString(),
        },
      }),
    }),
    "Bluesky post",
  );
  const rkey = String(created.uri).split("/").pop();
  return `https://bsky.app/profile/${env.BLUESKY_HANDLE}/post/${rkey}`;
}

/** @returns {Promise<string>} the status URL */
async function postMastodon(
  { text, key },
  { env = process.env, fetchImpl = fetch } = {},
) {
  need(env, "MASTODON_INSTANCE", "MASTODON_ACCESS_TOKEN");
  const instance = env.MASTODON_INSTANCE.replace(/(?<!\/)\/+$/, "");
  const res = await fetchImpl(`${instance}/api/v1/statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MASTODON_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      // the instance drops a repeat with the same key for an hour
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify({
      status: text,
      visibility: "public",
      language: "en",
    }),
  });
  const data = await ok(res, "Mastodon");
  return data.url;
}

function gh(args, input) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** A post in the repository's Announcements discussions. */
async function postDiscussion({ title, body }, { run = gh } = {}) {
  const ids = JSON.parse(
    run([
      "api",
      "graphql",
      "-f",
      'query=query { repository(owner: "DevilsDev", name: "rag-pipeline-utils") { id discussionCategories(first: 25) { nodes { id slug } } } }',
    ]),
  ).data.repository;
  const category = ids.discussionCategories.nodes.find(
    (c) => c.slug === "announcements",
  );
  if (!category) throw new Error("no Announcements discussion category");
  const out = JSON.parse(
    run([
      "api",
      "graphql",
      "-f",
      "query=mutation($repo: ID!, $cat: ID!, $title: String!, $body: String!) { createDiscussion(input: {repositoryId: $repo, categoryId: $cat, title: $title, body: $body}) { discussion { url } } }",
      "-f",
      `repo=${ids.id}`,
      "-f",
      `cat=${category.id}`,
      "-f",
      `title=${title}`,
      "-f",
      `body=${body}`,
    ]),
  );
  return out.data.createDiscussion.discussion.url;
}

/**
 * The ledger: one pinned issue, one comment per published post, each
 * starting with `[promote:<key>:<channel>]`. It is how a routine knows a
 * post already went out, and the audit trail for every automated post.
 */
const LEDGER_TITLE = "Automated promotion log";

// REST only: the cloud GitHub proxy that routines go through blocks GraphQL,
// and `gh issue list/view` use GraphQL.
function ledgerIssue({ run = gh, create = true } = {}) {
  const found = JSON.parse(
    run([
      "api",
      "-X",
      "GET",
      "search/issues",
      "-f",
      `q=repo:${REPO} type:issue in:title "${LEDGER_TITLE}"`,
    ]),
  ).items.find((i) => i.title === LEDGER_TITLE);
  if (found) return found.number;
  if (!create) return null;
  const created = JSON.parse(
    run(
      ["api", `repos/${REPO}/issues`, "--input", "-"],
      JSON.stringify({
        title: LEDGER_TITLE,
        body: "Every post the automated promotion publishes is recorded here, one comment each, with a link and the text. A post whose key is already here is never published again. To stop the posts, pause the promotion routines at claude.ai/code/routines and disable the Promote workflow.",
      }),
    ),
  );
  return created.number;
}

function alreadyPosted(key, channel, { run = gh, create = true } = {}) {
  // a dry run reads the ledger but never creates it
  const number = ledgerIssue({ run, create });
  if (number === null) return false;
  const firstLines = run([
    "api",
    "--paginate",
    `repos/${REPO}/issues/${number}/comments?per_page=100`,
    "--jq",
    '.[] | .body | split("\\n")[0]',
  ]).split("\n");
  const tag = `[promote:${key}:${channel}]`;
  return firstLines.some((line) => line.startsWith(tag));
}

function record(key, channel, { url, text }, { run = gh } = {}) {
  const number = ledgerIssue({ run });
  const quoted = text
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  const body = `[promote:${key}:${channel}] ${url}\n\n${quoted}`;
  run(
    ["api", `repos/${REPO}/issues/${number}/comments`, "--input", "-"],
    JSON.stringify({ body }),
  );
}

module.exports = {
  postDevto,
  postBluesky,
  postMastodon,
  postDiscussion,
  linkFacets,
  alreadyPosted,
  record,
  ledgerIssue,
  LEDGER_TITLE,
};
