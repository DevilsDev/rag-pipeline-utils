#!/usr/bin/env node
"use strict";

/**
 * Fails if any docs page scrolls sideways: loads every /docs/ page in the
 * sitemap at 1440 and 390px wide, and checks that
 *
 * - the page's scrollWidth is no larger than its clientWidth, and
 * - nothing in the article reaches past the article column (a wide table
 *   that runs under the "On this page" panel need not widen the page).
 *
 * A wide table or code block has to scroll inside its own box instead.
 *
 *   npm run build && npm run check:overflow [-- <build-dir>]
 *
 * Serves the build itself (with the site's baseUrl), so it needs no
 * `docusaurus serve`. Needs Playwright's Chromium:
 *   npx playwright install chromium
 */

const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const BASE = "/rag-pipeline-utils/";
const WIDTHS = [1440, 390];
const PARALLEL = 4;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

/** A static server for `dir` at BASE, resolving routes like GitHub Pages. */
function serve(dir) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (!url.startsWith(BASE)) {
      res.writeHead(404).end();
      return;
    }
    const rel = path.normalize(url.slice(BASE.length)).replace(/^[/\\]+/, "");
    const file = [rel, `${rel}.html`, path.join(rel, "index.html")]
      .map((p) => path.join(dir, p))
      .find(
        (p) => p.startsWith(dir) && fs.existsSync(p) && fs.statSync(p).isFile(),
      );
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server)),
  );
}

/** The site paths of every docs page, from the build's sitemap. */
function docsPages(dir) {
  const sitemap = fs.readFileSync(path.join(dir, "sitemap.xml"), "utf8");
  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1]).pathname)
    .filter((p) => p.startsWith(`${BASE}docs/`) || p === `${BASE}docs`);
}

/**
 * The page's widths, and the elements that reach past the page's or the
 * article column's right edge. Runs in the page.
 */
function measure() {
  const name = (el) => {
    const cls = typeof el.className === "string" ? el.className.trim() : "";
    return (
      el.tagName.toLowerCase() +
      (el.id ? `#${el.id}` : "") +
      (cls ? `.${cls.split(/\s+/).join(".")}` : "")
    );
  };
  // The outermost elements under `root` past `limit`. Fixed elements (the
  // skip link) are left out; so is anything inside a box that clips or
  // scrolls sideways, since only that box can overflow.
  const pastEdge = (root, limit) => {
    const found = [];
    const walk = (el) => {
      for (const child of el.children) {
        const style = getComputedStyle(child);
        if (style.position === "fixed" || style.display === "none") continue;
        const r = child.getBoundingClientRect();
        if (r.width > 0 && r.right > limit + 0.5) {
          found.push(`${name(child)} (right edge ${Math.round(r.right)})`);
        } else if (style.overflowX === "visible") {
          walk(child);
        }
      }
    };
    walk(root);
    return found;
  };
  const root = document.documentElement;
  const column = document.querySelector("article .markdown");
  const columnRight = column ? column.getBoundingClientRect().right : 0;
  return {
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
    pastPage: pastEdge(document.body, root.clientWidth).slice(0, 5),
    pastColumn: column ? pastEdge(column, columnRight).slice(0, 5) : [],
    columnRight: Math.round(columnRight),
  };
}

async function main() {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, "../build"));
  const pages = docsPages(dir);
  if (pages.length === 0)
    throw new Error(`no docs pages in ${dir}/sitemap.xml`);
  const server = await serve(dir);
  const origin = `http://127.0.0.1:${server.address().port}`;
  // Headless Chromium hides scrollbars; show them, so clientWidth is what
  // a desktop browser gets (1425 at 1440 wide, not 1440).
  const browser = await chromium.launch({
    ignoreDefaultArgs: ["--hide-scrollbars"],
  });
  const failures = [];
  try {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      // Only the build is loaded: badges and other outside images would
      // make the check depend on the network.
      await context.route(
        (url) => url.origin !== origin,
        (route) => route.abort(),
      );
      const queue = [...pages];
      await Promise.all(
        Array.from({ length: PARALLEL }, async () => {
          const page = await context.newPage();
          // one retry, for a load that stalls on a busy machine
          const load = (url) =>
            page
              .goto(url, { waitUntil: "load" })
              .catch(() => page.goto(url, { waitUntil: "load" }));
          for (let p = queue.shift(); p; p = queue.shift()) {
            const res = await load(origin + p);
            if (!res || !res.ok()) {
              failures.push(`${p} at ${width}px: HTTP ${res && res.status()}`);
              continue;
            }
            await page.evaluate(() => document.fonts.ready);
            const m = await page.evaluate(measure);
            const at = `${p} at ${width}px`;
            if (m.scrollWidth > m.clientWidth) {
              failures.push(
                `${at}: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}` +
                  m.pastPage.map((w) => `\n    ${w}`).join(""),
              );
            }
            if (m.pastColumn.length) {
              failures.push(
                `${at}: past the article column (right edge ${m.columnRight})` +
                  m.pastColumn.map((w) => `\n    ${w}`).join(""),
              );
            }
          }
          await page.close();
        }),
      );
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  const checked = pages.length * WIDTHS.length;
  if (failures.length) {
    console.error(
      `${failures.length} problems in ${checked} page loads:\n${failures.sort().join("\n")}`,
    );
    process.exit(1);
  }
  console.log(
    `${pages.length} docs pages at ${WIDTHS.join(" and ")}px: none scroll sideways or overflow the article column.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
