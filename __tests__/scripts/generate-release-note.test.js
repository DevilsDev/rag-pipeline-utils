/**
 * Unit tests for scripts/generate-release-note.js, the release blog draft
 * generator behind .github/workflows/release-blog.yml.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  parseVersion,
  isPatch,
  slugFor,
  fileNameFor,
  findExistingPost,
  extractChangelogSection,
  toMdxSafe,
  buildPost,
  generate,
  REPO_URL,
} = require("../../scripts/generate-release-note.js");

const CHANGELOG = `# Changelog

## [Unreleased]

## [3.7.0] - 2026-11-20

A minor release. Pass \`{name}\` to the template, or {name} without code.

### Added

- **\`WeaviateRetriever\`**: see [the guide](docs/weaviate.md) and
  [the README](./README.md#install), compare <https://weaviate.io>.

  \`\`\`js
  const r = new WeaviateRetriever({ url });
  if (a < b) {}
  \`\`\`

### Fixed

- Generic types like Array<T> and a < b no longer break, see [above](#added).

## [3.6.1] - 2026-11-10

A patch.

### Fixed

- One fix with {braces}.

## [3.6.0] - 2026-11-05

Older.
`;

function tempRepo({ notes, posts = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-note-"));
  fs.writeFileSync(path.join(root, "CHANGELOG.md"), CHANGELOG);
  const blog = path.join(root, "docs-site", "blog");
  fs.mkdirSync(blog, { recursive: true });
  for (const [name, content] of Object.entries(posts)) {
    fs.writeFileSync(path.join(blog, name), content);
  }
  if (notes) {
    fs.mkdirSync(path.join(root, "release-notes"));
    for (const [name, content] of Object.entries(notes)) {
      fs.writeFileSync(path.join(root, "release-notes", name), content);
    }
  }
  return root;
}

describe("versions, slugs and file names", () => {
  it("accepts x.y.z with or without v and rejects prereleases", () => {
    expect(parseVersion("v3.7.0").version).toBe("3.7.0");
    expect(parseVersion("3.1.1").patch).toBe(1);
    expect(() => parseVersion("3.7.0-rc.1")).toThrow(/Not a release version/);
    expect(() => parseVersion("3.7.0; rm -rf /")).toThrow();
  });

  it("matches the hand-written posts' slugs and file names", () => {
    expect(isPatch("3.6.0")).toBe(false);
    expect(isPatch("3.1.1")).toBe(true);
    expect(slugFor("3.6.0")).toBe("v3-6-release");
    expect(slugFor("3.1.1")).toBe("v3-1-1-release");
    expect(fileNameFor("3.6.0", "2026-11-05")).toBe(
      "2026-11-05-v3.6-release.md",
    );
    expect(fileNameFor("3.1.1", "2026-10-31")).toBe(
      "2026-10-31-v3.1.1-release.md",
    );
  });
});

describe("findExistingPost", () => {
  it("finds a post by file name or by slug, both forms for x.y.0", () => {
    const root = tempRepo({
      posts: {
        "2026-11-05-v3.6-release.md": "---\nslug: v3-6-release\n---\n",
        "2026-04-07-other-name.md": '---\nslug: "v2-4-0-release"\n---\n',
        "2026-10-31-v3.1.1-release.md": "---\nslug: v3-1-1-release\n---\n",
      },
    });
    const blog = path.join(root, "docs-site", "blog");
    expect(findExistingPost(blog, "3.6.0")).toMatch(/v3\.6-release\.md$/);
    expect(findExistingPost(blog, "2.4.0")).toMatch(/other-name\.md$/);
    expect(findExistingPost(blog, "3.1.1")).toMatch(/v3\.1\.1-release\.md$/);
    // 3.1.1's post isn't 3.1.0's, and 3.6.0's isn't 3.6.1's.
    expect(findExistingPost(blog, "3.1.0")).toBeNull();
    expect(findExistingPost(blog, "3.6.1")).toBeNull();
  });

  it("covers the posts in this repository", () => {
    const blog = path.join(__dirname, "..", "..", "docs-site", "blog");
    for (const v of ["3.6.0", "3.5.0", "3.1.1", "3.0.2", "2.4.0"]) {
      expect(findExistingPost(blog, v)).not.toBeNull();
    }
  });
});

describe("extractChangelogSection", () => {
  it("returns the section up to the next version and its date", () => {
    const s = extractChangelogSection(CHANGELOG, "3.7.0");
    expect(s.date).toBe("2026-11-20");
    expect(s.body).toMatch(/^A minor release/);
    expect(s.body).toContain("### Fixed");
    expect(s.body).not.toContain("3.6.1");
  });

  it("returns null for a version that isn't there", () => {
    expect(extractChangelogSection(CHANGELOG, "9.9.9")).toBeNull();
  });

  it("finds 3.6.0, 3.5.0 and 3.1.1 in the real CHANGELOG", () => {
    const md = fs.readFileSync(
      path.join(__dirname, "..", "..", "CHANGELOG.md"),
      "utf8",
    );
    for (const v of ["3.6.0", "3.5.0", "3.1.1"]) {
      const s = extractChangelogSection(md, v);
      expect(s).not.toBeNull();
      expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.body).not.toMatch(/^## /m);
    }
  });
});

describe("toMdxSafe", () => {
  const opts = { tag: "v3.7.0", sourcePath: "CHANGELOG.md" };

  it("escapes braces and < in prose, not in code", () => {
    const out = toMdxSafe(
      "Use `{name}` or {name}, Array<T>, a < b.\n\n```js\nif (a < b) {}\n```",
      opts,
    );
    expect(out).toContain("`{name}` or \\{name\\}, Array&lt;T>, a &lt; b.");
    expect(out).toContain("```js\nif (a < b) {}\n```");
  });

  it("keeps indented fences inside list items and escapes indented prose", () => {
    const out = toMdxSafe(
      "- item\n\n  ```js\n  const x = {a: 1};\n  ```\n\n      indented {x}",
      opts,
    );
    expect(out).toContain("  const x = {a: 1};");
    expect(out).toContain("      indented \\{x\\}");
  });

  it("makes links absolute at the tag and autolinks plain links", () => {
    const out = toMdxSafe(
      "[g](docs/a.md) [r](./README.md#install) [up](#added) " +
        "[site](/docs/Intro) [ext](https://x.dev/a) <https://weaviate.io>",
      opts,
    );
    expect(out).toContain(`[g](${REPO_URL}/blob/v3.7.0/docs/a.md)`);
    expect(out).toContain(`[r](${REPO_URL}/blob/v3.7.0/README.md#install)`);
    expect(out).toContain(`[up](${REPO_URL}/blob/v3.7.0/CHANGELOG.md#added)`);
    expect(out).toContain("[site](/docs/Intro)");
    expect(out).toContain("[ext](https://x.dev/a)");
    expect(out).toContain("[https://weaviate.io](https://weaviate.io)");
  });

  it("resolves links from the release notes' directory", () => {
    const out = toMdxSafe("[c](../CHANGELOG.md) [l](launch/x.md)", {
      tag: "v3.7.0",
      sourcePath: "release-notes/v3.7.0.md",
    });
    expect(out).toContain(`(${REPO_URL}/blob/v3.7.0/CHANGELOG.md)`);
    expect(out).toContain(
      `(${REPO_URL}/blob/v3.7.0/release-notes/launch/x.md)`,
    );
  });

  it("drops HTML comments", () => {
    expect(toMdxSafe("a <!-- hidden {x} --> b", opts)).toBe("a  b");
  });
});

describe("buildPost and generate", () => {
  it("drafts a minor release from the CHANGELOG", () => {
    const root = tempRepo();
    const r = generate({ version: "v3.7.0", root, write: false });
    expect(r.skipped).toBe(false);
    expect(path.basename(r.path)).toBe("2026-11-20-v3.7-release.md");
    const post = r.content;
    expect(post).toMatch(
      /^---\nslug: v3-7-release\ntitle: "RAG Pipeline Utils v3\.7"\nauthors: \[ali\]\ntags: \[release\]\ndate: "2026-11-20"\n---\n/,
    );
    expect(post).toContain(
      "```bash\nnpm install @devilsdev/rag-pipeline-utils@^3.7.0\n```\n\n<!-- truncate -->",
    );
    expect(post).toContain("## Added");
    expect(post).toContain("## Fixed");
    expect(post).not.toMatch(/^### /m);
    expect(post).toContain("or \\{name\\} without code");
    expect(post).toContain(`[CHANGELOG](${REPO_URL}/blob/v3.7.0/CHANGELOG.md)`);
  });

  it("drafts a short patch post", () => {
    const root = tempRepo();
    const post = generate({ version: "3.6.1", root, write: false }).content;
    expect(post).toContain("slug: v3-6-1-release");
    expect(post).toContain('title: "RAG Pipeline Utils v3.6.1"');
    expect(post).toContain("## What changed\n\n- One fix with \\{braces\\}.");
  });

  it("prefers release-notes/v<version>.md and drops its Blog post link", () => {
    const root = tempRepo({
      notes: {
        "v3.7.0.md":
          "Notes intro.\n\n```bash\nnpm install x@^3.7.0\n```\n\n## Highlights\n\n- One.\n\nFull details: [CHANGELOG](../CHANGELOG.md) · [Blog post](https://devilsdev.github.io/rag-pipeline-utils/blog/v3-7-release)\n",
      },
    });
    const post = generate({ version: "3.7.0", root, write: false }).content;
    expect(post).toContain(
      "Notes intro.\n\n```bash\nnpm install x@^3.7.0\n```",
    );
    expect(post).not.toContain("@devilsdev/rag-pipeline-utils@^3.7.0");
    expect(post).toContain("## Highlights");
    expect(post).not.toContain("Blog post");
    expect(post).toContain(
      `Full details: [CHANGELOG](${REPO_URL}/blob/v3.7.0/CHANGELOG.md)`,
    );
    expect(post.match(/CHANGELOG\.md\)/g)).toHaveLength(1);
  });

  it("skips a version that already has a post, unless forced", () => {
    const root = tempRepo({
      posts: { "2026-11-20-v3.7-release.md": "---\nslug: v3-7-release\n---\n" },
    });
    const r = generate({ version: "3.7.0", root });
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain("docs-site/blog/2026-11-20-v3.7-release.md");
    const existing = path.join(
      root,
      "docs-site",
      "blog",
      "2026-11-20-v3.7-release.md",
    );
    expect(fs.readFileSync(existing, "utf8")).toBe(
      "---\nslug: v3-7-release\n---\n",
    );
    expect(generate({ version: "3.7.0", root, force: true }).skipped).toBe(
      false,
    );
  });

  it("writes the draft into --out and fails for an unknown version", () => {
    const root = tempRepo();
    const out = path.join(root, "out");
    const r = generate({ version: "3.7.0", root, outDir: out });
    expect(fs.existsSync(path.join(out, "2026-11-20-v3.7-release.md"))).toBe(
      true,
    );
    expect(r.path.startsWith(out)).toBe(true);
    expect(() => generate({ version: "9.9.9", root })).toThrow(
      /no "## \[9\.9\.9\]" section/,
    );
  });

  it("escapes quotes in the title and date", () => {
    const post = buildPost({
      version: "1.0.1",
      changelog: "Intro.\n\n### Fixed\n\n- x",
      date: '2026"01',
    });
    expect(post).toContain('date: "2026\\"01"');
  });
});
