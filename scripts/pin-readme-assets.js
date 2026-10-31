#!/usr/bin/env node
/**
 * Pins the README's images to the release tag in the published package.
 *
 * The README on GitHub loads the banner and the demo GIFs from
 * cdn.jsdelivr.net/gh/DevilsDev/rag-pipeline-utils@main, so it always shows
 * the latest. The README npm displays comes from the tarball and should show
 * that version's images: `@main` there would change the pages of older
 * versions, and jsDelivr caches `@main` for up to 7 days. npm runs this
 * before packing (prepack) and again with --restore after (postpack).
 *
 *   node scripts/pin-readme-assets.js           # @main -> @v<version>
 *   node scripts/pin-readme-assets.js --restore # back to @main
 *
 * The release tag exists before release.yml publishes, so the pinned URLs
 * resolve once the version is on npm.
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const readme = path.join(root, "README.md");
const { version } = require(path.join(root, "package.json"));

const CDN = "https://cdn.jsdelivr.net/gh/DevilsDev/rag-pipeline-utils@";
const MAIN = `${CDN}main/`;
function pin(text) {
  return text.split(MAIN).join(`${CDN}v${version}/`);
}

/** Every `${CDN}v<tag>/` back to `${CDN}main/`, without a regular expression. */
function restore(text) {
  const parts = text.split(`${CDN}v`);
  return parts
    .map((part, i) => {
      if (i === 0) return part;
      const slash = part.indexOf("/");
      const tag = slash === -1 ? "" : part.slice(0, slash);
      // Only version tags (3.1.1, 3.2.0-rc.1); leave anything else as it was.
      if (!tag || !/^\d/.test(tag) || /\s/.test(tag)) return `${CDN}v${part}`;
      return MAIN + part.slice(slash + 1);
    })
    .join("");
}

if (require.main === module) {
  const before = fs.readFileSync(readme, "utf8");
  const after = process.argv.includes("--restore")
    ? restore(before)
    : pin(before);
  if (after !== before) fs.writeFileSync(readme, after);
}

module.exports = { pin, restore };
