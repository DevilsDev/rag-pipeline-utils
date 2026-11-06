/**
 * The promotion scripts publish with no one reviewing the post, so the
 * checks are the review: these tests pin that they fail closed.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  checkText,
  checkLinks,
  unsupportedNumbers,
} = require("../../scripts/promote/guards");
const {
  linkFacets,
  postBluesky,
  postDevto,
} = require("../../scripts/promote/channels");
const { main, readSource } = require("../../scripts/promote/post");
const { quietWeek, markdown } = require("../../scripts/promote/growth");

const SOURCE =
  "## [3.7.1] - 2026-11-06\nQueryPlanner planned 200,000 characters in under a second; 4,000 spaces took 21 seconds.";

describe("guards", () => {
  test("passes a post whose numbers and links come from the source", () => {
    expect(
      checkText({
        channel: "bluesky",
        text: "rag-pipeline-utils 3.7.1: 4,000 spaces took 21 seconds, now 200,000 characters plan in under a second. https://github.com/DevilsDev/rag-pipeline-utils",
        source: SOURCE,
      }),
    ).toEqual([]);
  });

  test("rejects a number the source never states", () => {
    expect(unsupportedNumbers("3.7.1: 21 seconds", SOURCE)).toEqual([]);
    expect(unsupportedNumbers("10x faster", SOURCE)).toEqual(["10"]);
    expect(unsupportedNumbers("used by 5,000 teams", SOURCE)).toEqual(["5000"]);
    expect(
      checkText({
        channel: "mastodon",
        text: "Now 50% faster",
        source: SOURCE,
      }),
    ).toEqual(["numbers not in the source: 50"]);
  });

  test("rejects other hosts, plain http, hype words and placeholders", () => {
    const problems = checkText({
      channel: "mastodon",
      text: "A revolutionary release [insert link] http://github.com/x https://example.com/y",
      source: SOURCE,
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/banned phrase/),
        expect.stringMatching(/not https/),
        "host not allowed: example.com",
      ]),
    );
  });

  test("enforces the channel's length, counting graphemes on Bluesky", () => {
    expect(
      checkText({ channel: "bluesky", text: "a".repeat(301), source: SOURCE }),
    ).toEqual(["301 characters, over bluesky's 300"]);
    expect(
      checkText({ channel: "bluesky", text: "👩‍💻".repeat(300), source: SOURCE }),
    ).toEqual([]);
  });

  test("fails closed on missing text, source or channel", () => {
    expect(
      checkText({ channel: "bluesky", text: "", source: SOURCE }),
    ).toContain("empty post");
    expect(checkText({ channel: "bluesky", text: "x", source: "" })).toContain(
      "no source text",
    );
    expect(checkText({ channel: "x", text: "x", source: SOURCE })[0]).toMatch(
      /unknown channel/,
    );
  });

  test("a link that answers 404 or not at all is a problem", async () => {
    const fetchImpl = async (url) => {
      if (url.includes("down")) throw new Error("ECONNREFUSED");
      return { status: url.includes("missing") ? 404 : 200 };
    };
    const problems = await checkLinks(
      "https://github.com/ok https://github.com/missing https://github.com/down",
      { fetchImpl },
    );
    expect(problems).toEqual([
      "link answered 404: https://github.com/missing",
      "link answered no response: https://github.com/down",
    ]);
  });
});

describe("channels", () => {
  test("Bluesky link facets use UTF-8 byte offsets", () => {
    const text = "Café — https://github.com/DevilsDev/rag-pipeline-utils";
    const [facet] = linkFacets(text);
    const bytes = new TextEncoder().encode(text);
    expect(
      new TextDecoder().decode(
        bytes.slice(facet.index.byteStart, facet.index.byteEnd),
      ),
    ).toBe("https://github.com/DevilsDev/rag-pipeline-utils");
  });

  test("a channel without credentials is skipped, not attempted", async () => {
    const fetchImpl = jest.fn();
    await expect(
      postBluesky({ text: "x" }, { env: {}, fetchImpl }),
    ).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
    await expect(
      postDevto({ title: "x", body: "y" }, { env: {}, fetchImpl }),
    ).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("dev.to gets at most four tags and the canonical URL", async () => {
    let sent;
    const fetchImpl = async (_url, init) => {
      sent = JSON.parse(init.body);
      return { status: 201, json: async () => ({ url: "https://dev.to/x/y" }) };
    };
    const url = await postDevto(
      {
        title: "T",
        body: "B",
        tags: ["a", "b", "c", "d", "e"],
        canonicalUrl: "https://devilsdev.github.io/x",
      },
      { env: { DEVTO_API_KEY: "test" }, fetchImpl },
    );
    expect(url).toBe("https://dev.to/x/y");
    expect(sent.article).toMatchObject({
      published: true,
      tags: ["a", "b", "c", "d"],
      canonical_url: "https://devilsdev.github.io/x",
    });
  });
});

describe("post.js", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "promote-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const spec = (fields) => {
    const file = path.join(dir, "spec.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        key: "release-v3.7.1",
        channel: "mastodon",
        sources: ["CHANGELOG.md#3.7.1"],
        ...fields,
      }),
    );
    return file;
  };

  /** A fake gh: an empty ledger issue #1, recording comments. */
  /** A fake gh speaking REST: ledger issue #1, recording comments. */
  function fakeGh(existing = []) {
    const comments = existing.map((body) => ({ body }));
    const run = jest.fn((args, input) => {
      const route = args.find((a) => /^(search|repos)\//.test(a)) || "";
      if (route === "search/issues")
        return JSON.stringify({
          items: [{ number: 1, title: "Automated promotion log" }],
        });
      if (route.includes("/comments") && args.includes("--paginate"))
        return comments.map((c) => c.body.split("\n")[0]).join("\n");
      if (route.includes("/comments") && args.includes("--input")) {
        comments.push({ body: JSON.parse(input).body });
        return "{}";
      }
      throw new Error(`unexpected gh ${args.join(" ")}`);
    });
    return { run, comments };
  }

  const okFetch = async (url, init) =>
    init && init.method === "POST"
      ? {
          status: 200,
          json: async () => ({ url: "https://fosstodon.org/@rag/1" }),
        }
      : { status: 200 };
  const env = {
    MASTODON_INSTANCE: "https://fosstodon.org",
    MASTODON_ACCESS_TOKEN: "test",
  };

  test("reads a version's CHANGELOG section", () => {
    const section = readSource("CHANGELOG.md#3.7.1");
    expect(section.startsWith("## [3.7.1]")).toBe(true);
    expect(section).not.toContain("## [3.7.0]");
    expect(() => readSource("../outside.md")).toThrow(/outside the repo/);
  });

  test("publishes once, records it, and skips the repeat", async () => {
    const { run, comments } = fakeGh();
    const logs = [];
    const file = spec({
      text: "rag-pipeline-utils 3.7.1 is out: https://github.com/DevilsDev/rag-pipeline-utils",
    });
    const deps = { run, env, fetchImpl: okFetch, log: (l) => logs.push(l) };

    expect(await main([file], deps)).toBe(0);
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toMatch(
      /^\[promote:release-v3\.7\.1:mastodon\] https:\/\/fosstodon\.org\/@rag\/1/,
    );

    expect(await main([file], deps)).toBe(0);
    expect(comments).toHaveLength(1);
    expect(logs[1]).toMatch(/already published, skipped/);
  });

  test("a failed check publishes nothing", async () => {
    const { run, comments } = fakeGh();
    const fetchImpl = jest.fn(okFetch);
    const file = spec({ text: "rag-pipeline-utils is 10,000x faster" });
    expect(await main([file], { run, env, fetchImpl, log: () => {} })).toBe(2);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(comments).toHaveLength(0);
  });

  test("a dry run checks but doesn't publish", async () => {
    const { run, comments } = fakeGh();
    const fetchImpl = jest.fn(okFetch);
    const file = spec({
      text: "3.7.1 https://github.com/DevilsDev/rag-pipeline-utils",
    });
    expect(
      await main([file, "--dry-run"], { run, env, fetchImpl, log: () => {} }),
    ).toBe(0);
    expect(
      fetchImpl.mock.calls.every(([, init]) => init.method !== "POST"),
    ).toBe(true);
    expect(comments).toHaveLength(0);
  });

  test("a channel without credentials exits 3 and records nothing", async () => {
    const { run, comments } = fakeGh();
    const file = spec({
      text: "3.7.1 https://github.com/DevilsDev/rag-pipeline-utils",
    });
    expect(
      await main([file], { run, env: {}, fetchImpl: okFetch, log: () => {} }),
    ).toBe(3);
    expect(comments).toHaveLength(0);
  });
});

describe("growth", () => {
  const days = (from, counts) =>
    counts.map((downloads, i) => {
      const d = new Date(`${from}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      return { day: d.toISOString().slice(0, 10), downloads };
    });

  test("the quiet week is the latest Monday-to-Sunday week with no release", () => {
    // 2026-10-05 is a Monday; three weeks of data
    const data = days(
      "2026-10-05",
      Array.from({ length: 21 }, (_, i) => i + 1),
    );
    expect(quietWeek(data, new Set(["2026-10-20"]))).toEqual({
      from: "2026-10-12",
      to: "2026-10-18",
      downloads: 8 + 9 + 10 + 11 + 12 + 13 + 14,
    });
    expect(
      quietWeek(data, new Set(["2026-10-07", "2026-10-14", "2026-10-21"])),
    ).toBeNull();
  });

  test("the note states the month, the quiet week and GitHub", () => {
    const note = markdown({
      period: { from: "2026-10-06", to: "2026-11-04" },
      latestVersion: "3.7.1",
      monthDownloads: 2930,
      releaseDayDownloads: 2657,
      releaseDays: ["a", "b"],
      quietWeek: { from: "2026-10-19", to: "2026-10-25", downloads: 58 },
      stars: 1,
      forks: 0,
    });
    expect(note).toContain("2930, of which 2657 on 2 release days");
    expect(note).toContain("58 (2026-10-19 to 2026-10-25, about 249 a month");
  });
});

describe("release-posts", () => {
  const {
    buildPosts,
    firstSentence,
    absolutize,
    shortPost,
  } = require("../../scripts/promote/release-posts");

  test("a release with a blog post gets all four channels, each passing the text checks", () => {
    const posts = buildPosts("v3.7.1");
    expect(posts.map((p) => p.channel).sort()).toEqual([
      "bluesky",
      "devto",
      "discussion",
      "mastodon",
    ]);
    const { readSource } = require("../../scripts/promote/post");
    for (const p of posts) {
      const source = p.sources.map(readSource).join("\n\n");
      const text = p.text || `${p.title}\n\n${p.body}`;
      expect(checkText({ channel: p.channel, text, source })).toEqual([]);
    }
    const devto = posts.find((p) => p.channel === "devto");
    expect(devto.canonicalUrl).toBe(
      "https://devilsdev.github.io/rag-pipeline-utils/blog/v3-7-1-release",
    );
    expect(devto.body).not.toContain("<!-- truncate -->");
  });

  test("helpers: first sentence, absolute links, cut to fit", () => {
    expect(firstSentence("A **patch** release. More text.\n\nNext")).toBe(
      "A patch release.",
    );
    expect(absolutize("See [CLI](/docs/CLI) and [x](https://a.b/c)")).toBe(
      "See [CLI](https://devilsdev.github.io/rag-pipeline-utils/docs/CLI) and [x](https://a.b/c)",
    );
    const text = shortPost(
      "word ".repeat(100).trim(),
      "https://github.com/x",
      300,
    );
    expect(text.length).toBeLessThanOrEqual(300);
    expect(text).toMatch(/word…\n\nhttps:\/\/github\.com\/x$/);
  });
});
