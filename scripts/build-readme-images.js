#!/usr/bin/env node
/**
 * Builds the README and docs-site images from code, in the docs site's
 * fonts and colours:
 *
 *   assets/banner.svg                     README banner
 *   assets/check-result.svg               what checkAnswer catches (README)
 *   assets/features.svg                   "Why people reach for it" strip
 *   docs-site/static/img/logo.svg         navbar logo
 *   docs-site/static/img/favicon.svg      favicon (same drawing)
 *
 * With --png it also renders, through Playwright's Chromium:
 *
 *   docs-site/static/img/social-card.png  1200x630 Open Graph card
 *   docs-site/static/img/favicon-32.png
 *   docs-site/static/img/apple-touch-icon.png
 *
 * Text is drawn as outlines (opentype.js reads the @fontsource WOFF files),
 * so the images look the same on GitHub and npm, which can't load web fonts
 * inside an SVG. Playwright is not a dependency: install it once outside the
 * repo (`npm i playwright && npx playwright install chromium` in any folder)
 * and point PLAYWRIGHT_DIR at that folder.
 *
 *   node scripts/build-readme-images.js [--png]
 */
"use strict";

const fs = require("fs");
const path = require("path");
const opentype = require("opentype.js");

const ROOT = path.resolve(__dirname, "..");
const IMG = path.join(ROOT, "docs-site", "static", "img");

// The docs site's light palette (docs-site/src/css/custom.css).
const C = {
  paper: "#fbf8f1",
  card: "#fffdf8",
  line: "#e4dccb",
  ink: "#1c1917",
  muted: "#57534e",
  primary: "#1f3a5a",
  primaryLight: "#a9c1de",
  accent: "#b93815",
  accentLight: "#f2875f",
  accentSoft: "#f9dccf",
  // Text on accentSoft: 6.6:1 (the accent itself is 4.4:1 there).
  accentSoftText: "#8c2a10",
  white: "#ffffff",
};

function loadFont(pkg, file) {
  const buf = fs.readFileSync(
    path.join(ROOT, "node_modules", "@fontsource", pkg, "files", file),
  );
  const font = opentype.parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
  font.file = file;
  return font;
}

const F = {
  serif: loadFont("source-serif-4", "source-serif-4-latin-600-normal.woff"),
  serifText: loadFont("source-serif-4", "source-serif-4-latin-500-normal.woff"),
  serifItalic: loadFont(
    "source-serif-4",
    "source-serif-4-latin-500-italic.woff",
  ),
  sans: loadFont("ibm-plex-sans", "ibm-plex-sans-latin-500-normal.woff"),
  mono: loadFont("ibm-plex-mono", "ibm-plex-mono-latin-500-normal.woff"),
  monoBold: loadFont("ibm-plex-mono", "ibm-plex-mono-latin-600-normal.woff"),
};

/* ---------- Drawing helpers ---------- */

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function width(font, size, str) {
  return font.getAdvanceWidth(str, size, { kerning: true });
}

// Glyph outlines used by the image being built: each glyph is defined once
// (in font units) and placed with <use>, which keeps the files small.
let glyphDefs = new Map();

// Path data in whole font units. (opentype.js's toPathData(0) can drop the
// separator between numbers, turning "386 0" into "3860".)
function pathData(commands) {
  const n = (v) => String(Math.round(v));
  return commands
    .map((c) => {
      if (c.type === "M" || c.type === "L")
        return `${c.type}${n(c.x)} ${n(c.y)}`;
      if (c.type === "Q") return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
      if (c.type === "C") {
        return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
      }
      return "Z";
    })
    .join("");
}

function glyphRef(font, glyph) {
  const key = `${font.file}/${glyph.index}`;
  if (!glyphDefs.has(key)) {
    const d = pathData(glyph.getPath(0, 0, font.unitsPerEm).commands);
    glyphDefs.set(key, { id: `g${glyphDefs.size}`, d });
  }
  return glyphDefs.get(key).id;
}

/** Text as filled outlines. `anchor`: start, middle or end. */
function text(font, size, str, x, y, fill, anchor = "start") {
  for (const ch of str) {
    if (ch.trim() && font.charToGlyphIndex(ch) === 0) {
      throw new Error(`No glyph for "${ch}" in ${font.file}`);
    }
  }
  const w = width(font, size, str);
  const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  const scale = +(size / font.unitsPerEm).toFixed(5);
  const uses = [];
  font.forEachGlyph(str, left, y, size, { kerning: true }, (glyph, gx, gy) => {
    if (!glyph.path || !glyph.path.commands.length) return;
    uses.push(
      `<use href="#${glyphRef(font, glyph)}" transform="translate(${gx.toFixed(1)} ${gy.toFixed(1)}) scale(${scale})"/>`,
    );
  });
  return { svg: `<g fill="${fill}">${uses.join("")}</g>`, w };
}

/** Largest size up to `max` at which `str` fits in `maxWidth`. */
function fit(font, str, max, maxWidth) {
  let size = max;
  while (size > 8 && width(font, size, str) > maxWidth) size -= 0.5;
  return size;
}

/**
 * A line of mixed runs. Each run: { str, font?, fill?, mark?, caret? }.
 * mark: "fix" (soft highlight), "strike" (struck through), "bad" (soft
 * highlight with a wavy underline); caret: a ‸ insertion mark.
 */
function line(runs, x, y, size, defaults) {
  let cx = x;
  let afterFix = false;
  const out = [];
  for (const run of runs) {
    if (run.caret) {
      afterFix = false;
      const s = size * 0.28;
      out.push(
        `<path d="M${(cx + 2).toFixed(1)} ${(y + s * 0.5).toFixed(1)}L${(cx + 2 + s).toFixed(1)} ${(y - s * 1.1).toFixed(1)}L${(cx + 2 + 2 * s).toFixed(1)} ${(y + s * 0.5).toFixed(1)}" fill="none" stroke="${C.accent}" stroke-width="${(size / 9).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
      cx += 2 * s + size * 0.3;
      continue;
    }
    const font = run.font || defaults.font;
    let fill = run.fill || defaults.fill;
    const w = width(font, size, run.str);
    const padX = size * 0.22;
    // Punctuation straight after a highlight touches its edge, with no gap.
    if (afterFix && /^[.,;:]/.test(run.str)) {
      const glyph = font.charToGlyph(run.str[0]);
      cx -= (glyph.leftSideBearing * size) / font.unitsPerEm;
    }
    afterFix = run.mark === "fix";
    if (run.mark === "fix" || run.mark === "bad") {
      out.push(
        `<rect x="${(cx - padX + (run.mark === "fix" ? padX : 0)).toFixed(1)}" y="${(y - size * 0.86).toFixed(1)}" width="${(w + 2 * padX).toFixed(1)}" height="${(size * 1.14).toFixed(1)}" rx="${(size * 0.18).toFixed(1)}" fill="${C.accentSoft}"/>`,
      );
      fill = C.accentSoftText;
      if (run.mark === "fix") cx += padX;
    }
    out.push(text(font, size, run.str, cx, y, fill).svg);
    if (run.mark === "strike") {
      const ly = (y - size * 0.3).toFixed(1);
      out.push(
        `<path d="M${cx.toFixed(1)} ${ly}H${(cx + w).toFixed(1)}" stroke="${C.accent}" stroke-width="${(size / 12).toFixed(1)}"/>`,
      );
    }
    if (run.mark === "bad") {
      const wy = y + size * 0.16;
      const step = size * 0.2;
      let d = `M${cx.toFixed(1)} ${wy.toFixed(1)}`;
      for (let i = 0, px = cx; px < cx + w - 0.1; i++, px += step) {
        d += `q${(step / 2).toFixed(1)} ${(i % 2 ? 1 : -1) * size * 0.08} ${step.toFixed(1)} 0`;
      }
      out.push(
        `<path d="${d}" fill="none" stroke="${C.accent}" stroke-width="${(size / 14).toFixed(1)}"/>`,
      );
    }
    cx += w + (run.mark === "fix" ? padX : 0);
  }
  return { svg: out.join("\n    "), x: cx };
}

function svgDoc(w, h, title, desc, body) {
  const defs = [...glyphDefs.values()]
    .map((g) => `<path id="${g.id}" d="${g.d}"/>`)
    .join("\n    ");
  glyphDefs = new Map();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(title)}</title>
  <desc id="desc">${esc(desc)}</desc>
  <defs>
    ${defs}
  </defs>
  ${body}
</svg>
`;
}

/** A pill: rounded rect with centred text. Returns { svg, w }. */
function pill(font, size, str, x, y, h, { fill, stroke, color, anchor }) {
  const w = width(font, size, str) + h * 0.8;
  const left = anchor === "end" ? x - w : x;
  const svg = [
    `<rect x="${left.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${h}" rx="${h / 2}" fill="${fill}"${stroke ? ` stroke="${stroke}"` : ""}/>`,
    text(
      font,
      size,
      str,
      left + w / 2,
      y + h / 2 + size * 0.36,
      color,
      "middle",
    ).svg,
  ].join("\n  ");
  return { svg, w };
}

/* ---------- The proof lines (banner and social card) ---------- */

const PROOF = [
  [
    { str: "Full-time employees receive " },
    { str: "thirty", mark: "strike", fill: C.muted },
    { str: " " },
    { str: "twenty", mark: "fix", font: F.serifItalic },
    { str: " days of paid vacation per year." },
  ],
  [
    { str: "Remote work is allowed two days per week" },
    { caret: true },
    { str: "with manager approval", mark: "fix", font: F.serifItalic },
    { str: "." },
  ],
];

/* ---------- Banner ---------- */

function banner() {
  const W = 1280;
  const H = 540;
  const P = 56;
  const parts = [
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="20" fill="${C.paper}" stroke="${C.line}"/>`,
    text(F.mono, 22, "@devilsdev/rag-pipeline-utils", P, 92, C.primary).svg,
    pill(F.mono, 18, "for Node.js", W - P, 64, 38, {
      fill: C.paper,
      stroke: C.line,
      color: C.muted,
      anchor: "end",
    }).svg,
    text(F.serif, 60, "RAG that tells you when your", P, 182, C.primary).svg,
    text(F.serif, 60, "LLM is making things up.", P, 252, C.primary).svg,
    `<rect x="${P + 0.5}" y="292.5" width="${W - 2 * P - 1}" height="150" rx="16" fill="${C.card}" stroke="${C.line}"/>`,
    line(PROOF[0], P + 30, 352, 28, { font: F.serifText, fill: C.ink }).svg,
    line(PROOF[1], P + 30, 410, 28, { font: F.serifText, fill: C.ink }).svg,
  ];
  let fx = P;
  for (const label of [
    "numbers",
    "“not”s",
    "conditions",
    "no extra model calls",
  ]) {
    parts.push(`<circle cx="${fx + 5}" cy="489" r="5" fill="${C.accent}"/>`);
    const t = text(F.sans, 21, label, fx + 20, 496, C.muted);
    parts.push(t.svg);
    fx += 20 + t.w + 34;
  }
  return svgDoc(
    W,
    H,
    "rag-pipeline-utils",
    "RAG that tells you when your LLM is making things up. Example: an answer says thirty days of paid vacation where the source says twenty, and drops the source's condition 'with manager approval'. It checks numbers, 'not's and conditions, with no extra model calls.",
    parts.join("\n  "),
  );
}

/* ---------- What checkAnswer catches ---------- */

function checkResult() {
  const W = 1280;
  const P = 44;
  const parts = [];
  parts.push(
    text(F.serif, 34, "What checkAnswer catches", P, 84, C.primary).svg,
  );
  parts.push(
    pill(F.monoBold, 21, "grounded: false", W - P, 54, 42, {
      fill: C.accentSoft,
      color: C.accentSoftText,
      anchor: "end",
    }).svg,
  );
  const rows = [
    {
      runs: [
        { str: "Full-time employees receive " },
        { str: "thirty", mark: "bad" },
        { str: " days of paid vacation per year." },
      ],
      why: "Wrong number. The source says twenty.",
    },
    {
      runs: [
        { str: "Remote work is allowed two days per week" },
        { caret: true },
      ],
      why: "Drops a condition. The source adds “with manager approval”.",
    },
  ];
  let y = 122;
  rows.forEach((row, i) => {
    parts.push(
      `<rect x="${P + 0.5}" y="${y + 0.5}" width="${W - 2 * P - 1}" height="122" rx="14" fill="${C.card}" stroke="${C.line}"/>`,
      `<circle cx="${P + 42}" cy="${y + 44}" r="19" fill="${C.primary}"/>`,
      text(F.monoBold, 20, String(i + 1), P + 42, y + 51, C.white, "middle")
        .svg,
      line(row.runs, P + 82, y + 54, 26, { font: F.serifText, fill: C.ink })
        .svg,
      text(F.sans, 22, row.why, P + 82, y + 96, C.accent).svg,
    );
    y += 140;
  });
  const H = y - 18 + P;
  parts.unshift(
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="20" fill="${C.paper}" stroke="${C.line}"/>`,
  );
  return svgDoc(
    W,
    H,
    "What checkAnswer catches",
    "grounded: false. Sentence 1, 'Full-time employees receive thirty days of paid vacation per year.': wrong number, the source says twenty. Sentence 2, 'Remote work is allowed two days per week.': drops a condition, the source adds 'with manager approval'.",
    parts.join("\n  "),
  );
}

/* ---------- Feature strip ---------- */

// The bold lead-ins of "Why people reach for it" in README.md, in order.
const FEATURES = [
  "Grounding you can see",
  "Regressions fail the build",
  "Plays well with your stack",
  "Guardrails with receipts",
  "Ready for production",
  "Connectors included",
  "A real CLI",
  "Runs at the edge",
  "Talk to it from Claude",
];

function features() {
  const W = 1280;
  const cols = 3;
  const rows = Math.ceil(FEATURES.length / cols);
  const cw = W / cols;
  const ch = 132;
  const H = rows * ch;
  const pad = 34;
  const size = Math.min(
    ...FEATURES.map((t) => fit(F.serif, t, 30, cw - 2 * pad)),
  );
  const parts = [
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="20" fill="${C.paper}" stroke="${C.line}"/>`,
  ];
  for (let c = 1; c < cols; c++) {
    parts.push(`<path d="M${(c * cw).toFixed(1)} 0V${H}" stroke="${C.line}"/>`);
  }
  for (let r = 1; r < rows; r++) {
    parts.push(`<path d="M0 ${r * ch}H${W}" stroke="${C.line}"/>`);
  }
  FEATURES.forEach((title, i) => {
    const x = (i % cols) * cw + pad;
    const y = Math.floor(i / cols) * ch;
    parts.push(
      text(F.monoBold, 19, String(i + 1).padStart(2, "0"), x, y + 52, C.accent)
        .svg,
      text(F.serif, size, title, x, y + 96, C.primary).svg,
    );
  });
  return svgDoc(
    W,
    H,
    "Why people reach for it",
    `${FEATURES.join(", ")}.`,
    parts.join("\n  "),
  );
}

/* ---------- Logo ---------- */

/** The logo's shapes on a 64x64 grid, without the <svg> wrapper. */
function logoShapes({ radius = 14 } = {}) {
  return `<rect width="64" height="64" rx="${radius}" fill="${C.primary}"/>
  <!-- Three pipeline stages flowing into a cited answer. -->
  <path d="M14 22h10M14 32h18M14 42h10" stroke="${C.primaryLight}" stroke-width="4" stroke-linecap="round"/>
  <path d="M24 22c8 0 8 10 14 10M24 42c8 0 8-10 14-10" fill="none" stroke="${C.accentLight}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="44" cy="32" r="7" fill="none" stroke="${C.accentLight}" stroke-width="4"/>
  <circle cx="44" cy="32" r="2.5" fill="${C.paper}"/>`;
}

function logo(options) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="rag-pipeline-utils">
  ${logoShapes(options)}
</svg>
`;
}

/* ---------- Social card ---------- */

function socialCard() {
  const W = 1200;
  const H = 630;
  const P = 64;
  const t1 = "RAG for Node.js that tells you";
  const t2 = "when your LLM is making things up.";
  const size = Math.min(
    fit(F.serif, t1, 64, W - 2 * P),
    fit(F.serif, t2, 64, W - 2 * P),
  );
  const parts = [
    `<rect width="${W}" height="${H}" fill="${C.paper}"/>`,
    `<g transform="translate(${P} 56) scale(0.875)">${logoShapes()}</g>`,
    text(F.serif, 34, "rag-pipeline-utils", P + 76, 99, C.primary).svg,
    text(F.serif, size, t1, P, 228, C.primary).svg,
    text(F.serif, size, t2, P, 228 + size * 1.18, C.primary).svg,
    `<rect x="${P + 0.5}" y="356.5" width="${W - 2 * P - 1}" height="140" rx="16" fill="${C.card}" stroke="${C.line}"/>`,
    line(PROOF[0], P + 28, 412, 25, { font: F.serifText, fill: C.ink }).svg,
    line(PROOF[1], P + 28, 466, 25, { font: F.serifText, fill: C.ink }).svg,
    `<path d="M${P} 540H${W - P}" stroke="${C.line}"/>`,
    text(F.mono, 22, "devilsdev.github.io/rag-pipeline-utils", P, 584, C.muted)
      .svg,
    text(F.sans, 22, "MIT · Node.js 22+", W - P, 584, C.muted, "end").svg,
  ];
  return svgDoc(
    W,
    H,
    "rag-pipeline-utils",
    "RAG for Node.js that tells you when your LLM is making things up.",
    parts.join("\n  "),
  );
}

/* ---------- Output ---------- */

function write(file, content) {
  fs.writeFileSync(file, content);
  console.log(`wrote ${path.relative(ROOT, file)}`);
}

async function renderPngs() {
  let chromium;
  try {
    const dir = process.env.PLAYWRIGHT_DIR || process.cwd();
    ({ chromium } = require(require.resolve("playwright", { paths: [dir] })));
  } catch {
    throw new Error(
      "--png needs Playwright: in a folder outside the repo run `npm i playwright && npx playwright install chromium`, then set PLAYWRIGHT_DIR to that folder.",
    );
  }
  const jobs = [
    { svg: socialCard(), w: 1200, h: 630, out: "social-card.png" },
    { svg: logo(), w: 32, h: 32, out: "favicon-32.png" },
    // iOS rounds the corners itself and fills transparent ones with black.
    { svg: logo({ radius: 0 }), w: 180, h: 180, out: "apple-touch-icon.png" },
  ];
  const browser = await chromium.launch();
  try {
    for (const job of jobs) {
      const src = `data:image/svg+xml;base64,${Buffer.from(job.svg).toString("base64")}`;
      const page = await browser.newPage({
        viewport: { width: job.w, height: job.h },
      });
      await page.setContent(
        `<html><body style="margin:0;background:transparent"><img src="${src}" width="${job.w}" height="${job.h}" style="display:block"></body></html>`,
      );
      await page.waitForFunction(() => document.images[0].complete);
      await page.screenshot({
        path: path.join(IMG, job.out),
        omitBackground: true,
        clip: { x: 0, y: 0, width: job.w, height: job.h },
      });
      await page.close();
      console.log(`wrote docs-site/static/img/${job.out}`);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  write(path.join(ROOT, "assets", "banner.svg"), banner());
  write(path.join(ROOT, "assets", "check-result.svg"), checkResult());
  write(path.join(ROOT, "assets", "features.svg"), features());
  write(path.join(IMG, "logo.svg"), logo());
  write(path.join(IMG, "favicon.svg"), logo());
  if (process.argv.includes("--png")) await renderPngs();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { FEATURES };
