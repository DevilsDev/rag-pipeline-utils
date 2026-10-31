"use strict";

/**
 * The README is also the npm package page, where relative links don't
 * resolve the way they do on GitHub. Keep every link and image absolute,
 * every in-page anchor pointing at a heading, and the release pinning of
 * the images reversible.
 */

const fs = require("fs");
const path = require("path");
const { pin, restore } = require("../../scripts/pin-readme-assets");

const readme = fs.readFileSync(path.join(__dirname, "../../README.md"), "utf8");
// Code blocks can contain anything; links there aren't rendered.
const prose = readme.replace(/```[\s\S]*?```/g, "");

const markdownLinks = [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
const htmlLinks = [...prose.matchAll(/<a\s[^>]*href="([^"]+)"/g)].map(
  (m) => m[1],
);
const images = [
  ...[...prose.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]),
  ...[...prose.matchAll(/<img\s[^>]*src="([^"]+)"/g)].map((m) => m[1]),
];

/** GitHub's heading anchor: lower case, punctuation removed, spaces to -. */
function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

describe("README on npmjs.com", () => {
  test("every link is absolute or an in-page anchor", () => {
    const relative = [...markdownLinks, ...htmlLinks].filter(
      (href) => !/^(https?:|mailto:|#)/.test(href),
    );
    expect(relative).toEqual([]);
  });

  test("every image is an absolute https URL", () => {
    expect(images.length).toBeGreaterThan(0);
    expect(images.filter((src) => !src.startsWith("https://"))).toEqual([]);
  });

  test("every in-page anchor matches a heading", () => {
    const headings = new Set(
      [...prose.matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1])),
    );
    const anchors = [...markdownLinks, ...htmlLinks]
      .filter((href) => href.startsWith("#"))
      .map((href) => href.slice(1));
    expect(anchors.filter((a) => !headings.has(a))).toEqual([]);
  });

  test("images load from @main on GitHub and are pinned to the release when packed", () => {
    expect(readme).toContain("rag-pipeline-utils@main/assets/");
    const { version } = require("../../package.json");
    const pinned = pin(readme);
    expect(pinned).not.toContain("@main/assets/");
    expect(pinned).toContain(`rag-pipeline-utils@v${version}/assets/`);
    expect(restore(pinned)).toBe(readme);
  });
});
