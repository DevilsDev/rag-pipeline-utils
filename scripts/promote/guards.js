"use strict";

/**
 * Checks every automated post must pass before it is published. A post is
 * written by a scheduled Claude routine with no one reviewing it, so these
 * are the review: they fail closed, and a failure stops that post.
 *
 * - every number in the post appears in the source it was written from
 *   (the CHANGELOG section or blog post), so no figure is invented;
 * - every link is https, on an allowed host, and answers 2xx/3xx;
 * - the text fits the channel and has no placeholders or hype words.
 */

const ALLOWED_HOSTS = new Set([
  "github.com",
  "www.npmjs.com",
  "npmjs.com",
  "devilsdev.github.io",
  "stackblitz.com",
  "dev.to",
]);

/** Per-channel limits: Bluesky counts graphemes, Mastodon characters. */
const LIMITS = {
  bluesky: 300,
  mastodon: 500,
  devto: 60000,
  discussion: 60000,
};

const BANNED = [
  /\[insert/i,
  /\bTODO\b/,
  /\bTBD\b/,
  /lorem ipsum/i,
  /revolutionary/i,
  /game[- ]chang/i,
  /\bbest-in-class\b/i,
  /\bblazing/i,
  /\bunparalleled\b/i,
];

/** Numbers as written ("3,755", "0.5", "21", "3.7.1"), commas removed. */
function numbersIn(text) {
  const prose = String(text)
    // URLs carry ids and versions that aren't claims
    .replace(/https?:\/\/\S+/g, " ")
    // code blocks are copied from the source, checked as text below
    .replace(/```[\s\S]*?```/g, " ");
  return [...prose.matchAll(/\d[\d,]*(?:\.\d+)*/g)]
    .map((m) => m[0].replace(/,(?=\d{3}\b)/g, "").replace(/[.,]+$/, ""))
    .filter((n) => n.length > 0);
}

/** Numbers in the post that the source never states. */
function unsupportedNumbers(post, source) {
  const known = new Set(numbersIn(source));
  // single digits are list markers, ordinals or small counts ("2 checks")
  return [
    ...new Set(numbersIn(post).filter((n) => n.length > 1 && !known.has(n))),
  ];
}

function linksIn(text) {
  return [
    ...new Set(
      [...String(text).matchAll(/https?:\/\/[^\s)<>"'\]]+/g)].map((m) =>
        m[0].replace(/[.,;:!?]+$/, ""),
      ),
    ),
  ];
}

function graphemes(text) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    return [...new Intl.Segmenter().segment(text)].length;
  }
  return [...text].length;
}

/**
 * Static checks (no network). Returns a list of problems; empty means pass.
 * @param {{ channel: string, text: string, source: string }} post
 */
function checkText({ channel, text, source }) {
  const problems = [];
  if (!LIMITS[channel]) problems.push(`unknown channel "${channel}"`);
  if (!text || !String(text).trim()) problems.push("empty post");
  if (!source || !String(source).trim()) problems.push("no source text");
  if (problems.length) return problems;

  // Mastodon counts every link as 23 characters, whatever its length
  const length =
    channel === "bluesky"
      ? graphemes(text)
      : channel === "mastodon"
        ? [...text.replace(/https?:\/\/\S+/g, "x".repeat(23))].length
        : [...text].length;
  if (length > LIMITS[channel]) {
    problems.push(`${length} characters, over ${channel}'s ${LIMITS[channel]}`);
  }
  // dev.to renders Liquid: {{ }} or {% %} in an article can fail the post
  // (500) or vanish from it
  if (channel === "devto" && /{{|{%/.test(text)) {
    problems.push("Liquid syntax ({{ or {%) in a dev.to post");
  }
  for (const re of BANNED) {
    if (re.test(text)) problems.push(`banned phrase: ${re}`);
  }
  const numbers = unsupportedNumbers(text, source);
  if (numbers.length) {
    problems.push(`numbers not in the source: ${numbers.join(", ")}`);
  }
  for (const link of linksIn(text)) {
    let url;
    try {
      url = new URL(link);
    } catch {
      problems.push(`malformed link: ${link}`);
      continue;
    }
    if (url.protocol !== "https:") problems.push(`not https: ${link}`);
    if (!ALLOWED_HOSTS.has(url.hostname)) {
      problems.push(`host not allowed: ${url.hostname}`);
    }
  }
  return problems;
}

/**
 * npmjs.com answers 403 to anything that isn't a browser, so a package page
 * is checked through the registry API, which has the same 404 when the
 * package doesn't exist.
 */
function probeUrl(link) {
  const m = link.match(
    /^https:\/\/(?:www\.)?npmjs\.com\/package\/((?:@[^/]+\/)?[^/?#]+)/,
  );
  return m ? `https://registry.npmjs.org/${m[1]}` : link;
}

/**
 * Every link must answer 2xx or 3xx. HEAD first, GET if HEAD is refused.
 * @returns {Promise<string[]>} problems
 */
async function checkLinks(text, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const problems = [];
  for (const link of linksIn(text)) {
    let status = 0;
    for (const method of ["HEAD", "GET"]) {
      try {
        const res = await fetchImpl(probeUrl(link), {
          method,
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
          headers: { "User-Agent": "rag-pipeline-utils-promote" },
        });
        status = res.status;
        if (status < 400) break;
      } catch (err) {
        status = 0;
      }
    }
    if (!(status >= 200 && status < 400)) {
      problems.push(`link answered ${status || "no response"}: ${link}`);
    }
  }
  return problems;
}

module.exports = {
  ALLOWED_HOSTS,
  LIMITS,
  checkText,
  checkLinks,
  unsupportedNumbers,
  linksIn,
  graphemes,
};
