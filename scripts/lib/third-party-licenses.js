"use strict";

/**
 * License notices for the npm packages esbuild bundled into a file: MIT, ISC
 * and BSD require their copyright and license text to ship with copies.
 * Writes `<bundle>.LICENSES.txt` next to the bundle, from its metafile.
 */

const fs = require("fs");
const path = require("path");

const LICENSE_FILE = /^(?:licen[cs]e|copying)(?:[.-].*)?$/i;

/** Package directories (…/node_modules/name) of the metafile's inputs. */
function bundledPackages(metafile, root) {
  const dirs = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    const parts = input.split(/[\\/]/);
    const i = parts.lastIndexOf("node_modules");
    if (i < 0) continue;
    const length = parts[i + 1].startsWith("@") ? i + 3 : i + 2;
    dirs.add(path.resolve(root, ...parts.slice(0, length)));
  }
  return [...dirs];
}

/**
 * @param {object} metafile - esbuild's metafile for one bundle
 * @param {string} bundlePath - The bundle; the notices go to `${bundlePath}.LICENSES.txt`
 * @param {string} root - Directory esbuild resolved inputs against
 * @returns {string[]} The bundled packages, as name@version
 */
function writeThirdPartyLicenses(metafile, bundlePath, root) {
  const entries = bundledPackages(metafile, root)
    .map((dir) => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(dir, "package.json"), "utf8"),
      );
      const file = fs.readdirSync(dir).find((f) => LICENSE_FILE.test(f));
      if (!file) {
        throw new Error(
          `${pkg.name}@${pkg.version} is bundled into ${path.basename(bundlePath)} but has no license file`,
        );
      }
      return {
        id: `${pkg.name}@${pkg.version}`,
        license: pkg.license || "see below",
        text: fs.readFileSync(path.join(dir, file), "utf8").trim(),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const unique = entries.filter(
    (e, i) => i === 0 || e.id !== entries[i - 1].id,
  );

  const out = `${bundlePath}.LICENSES.txt`;
  if (unique.length === 0) {
    fs.rmSync(out, { force: true });
    return [];
  }
  fs.writeFileSync(
    out,
    [
      `Third-party packages bundled into ${path.basename(bundlePath)}:`,
      "",
      ...unique.map((e) => `- ${e.id} (${e.license})`),
      "",
      ...unique.flatMap((e) => ["=".repeat(72), e.id, "", e.text, ""]),
    ].join("\n"),
  );
  return unique.map((e) => e.id);
}

module.exports = { writeThirdPartyLicenses, bundledPackages };
