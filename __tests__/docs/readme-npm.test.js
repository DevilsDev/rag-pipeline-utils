"use strict";

/**
 * README.md is the npm package page, where relative links don't resolve the
 * way they do on GitHub; .github/README.md is the one GitHub shows, where
 * relative links would resolve against .github/. Keep every link and image
 * in both absolute, every in-page anchor pointing at a heading, and the
 * release pinning of the npm README's images reversible.
 */

const fs = require("fs");
const path = require("path");
const { pin, restore } = require("../../scripts/pin-readme-assets");

const ROOT = path.join(__dirname, "../..");
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

function links(text) {
  // Code blocks can contain anything; links there aren't rendered.
  const prose = text.replace(/```[\s\S]*?```/g, "");
  return {
    prose,
    hrefs: [
      ...[...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]),
      ...[...prose.matchAll(/<a\s[^>]*href="([^"]+)"/g)].map((m) => m[1]),
    ],
    images: [
      ...[...prose.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]),
      ...[...prose.matchAll(/<img\s[^>]*src="([^"]+)"/g)].map((m) => m[1]),
    ],
  };
}

/** GitHub's heading anchor: lower case, punctuation removed, spaces to -. */
function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

describe.each(["README.md", ".github/README.md"])("%s links", (file) => {
  const { prose, hrefs, images } = links(
    fs.readFileSync(path.join(ROOT, file), "utf8"),
  );

  test("every link is absolute or an in-page anchor", () => {
    const relative = hrefs.filter((href) => !/^(https?:|mailto:|#)/.test(href));
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
    const anchors = hrefs
      .filter((href) => href.startsWith("#"))
      .map((href) => href.slice(1));
    expect(anchors.filter((a) => !headings.has(a))).toEqual([]);
  });
});

describe("README.md on npmjs.com", () => {
  test("is the short page, under 150 lines", () => {
    expect(readme.split("\n").length).toBeLessThan(150);
  });

  test("images load from @main on GitHub and are pinned to the release when packed", () => {
    expect(readme).toContain("rag-pipeline-utils@main/assets/");
    const { version } = require("../../package.json");
    const pinned = pin(readme);
    expect(pinned).not.toContain("@main/assets/");
    expect(pinned).toContain(`rag-pipeline-utils@v${version}/assets/`);
    expect(restore(pinned)).toBe(readme);
  });

  // The "New in" section covers the current minor version: rewrite it and
  // its heading at each minor release (3.10, 3.11, ...). Patches keep the
  // heading, so this fails only when package.json reaches a new minor.
  test('the "New in" section names the package.json minor version', () => {
    const { version } = require("../../package.json");
    const minor = version.split(".").slice(0, 2).join(".");
    const headings = [...readme.matchAll(/^## New in (\S+)$/gm)].map(
      (m) => m[1],
    );
    expect(headings).toEqual([minor]);
  });

  // assets/features.svg draws these titles; rerun `npm run images:readme`
  // after changing them in scripts/build-readme-images.js.
  test("the feature strip image has the list's titles, in order", () => {
    const { FEATURES } = require("../../scripts/build-readme-images");
    const section = readme
      .split("## Why people reach for it")[1]
      .split("\n## ")[0];
    const titles = [...section.matchAll(/^- \*\*(.+?)\.\*\*/gm)].map(
      (m) => m[1],
    );
    expect(titles).toEqual(FEATURES);
  });
});
