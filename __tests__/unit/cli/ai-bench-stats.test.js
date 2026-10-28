const {
  percentile,
  mean,
  summarize,
} = require("../../../src/cli/services/bench-stats");
const {
  readQueryFile,
  sampleQueries,
} = require("../../../src/cli/services/benchmark");
const fs = require("fs");
const os = require("os");
const path = require("path");

describe("bench-stats", () => {
  test("nearest-rank percentile on unsorted input", () => {
    const samples = [5, 1, 4, 2, 3];
    expect(percentile(samples, 50)).toBe(3);
    expect(percentile(samples, 95)).toBe(5);
    expect(percentile(samples, 20)).toBe(1);
    expect(percentile(samples, 100)).toBe(5);
    expect(samples).toEqual([5, 1, 4, 2, 3]); // not mutated
  });

  test("even count: p50 is the lower middle observed value", () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 75)).toBe(30);
    expect(percentile([10, 20, 30, 40], 76)).toBe(40);
  });

  test("p95 of 1..100 is 95 and of 1..20 is 19", () => {
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(hundred, 95)).toBe(95);
    const twenty = Array.from({ length: 20 }, (_, i) => 20 - i);
    expect(percentile(twenty, 95)).toBe(19);
  });

  test("single sample", () => {
    expect(summarize([7])).toEqual({
      count: 1,
      mean: 7,
      p50: 7,
      p95: 7,
      min: 7,
      max: 7,
    });
  });

  test("mean and summary", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(summarize([4, 1, 3, 2])).toEqual({
      count: 4,
      mean: 2.5,
      p50: 2,
      p95: 4,
      min: 1,
      max: 4,
    });
  });

  test("empty input and invalid percentiles throw", () => {
    expect(() => percentile([], 50)).toThrow(/at least one sample/);
    expect(() => mean([])).toThrow(/at least one sample/);
    expect(() => summarize([])).toThrow();
    expect(() => percentile([1], 0)).toThrow(/Percentile/);
    expect(() => percentile([1], 101)).toThrow(/Percentile/);
  });
});

describe("benchmark queries", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-bench-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("reads one query per line or a JSON array", () => {
    const lines = path.join(dir, "q.txt");
    fs.writeFileSync(lines, "first\r\n\n  second  \n");
    expect(readQueryFile(lines)).toEqual(["first", "second"]);
    const json = path.join(dir, "q.json");
    fs.writeFileSync(json, JSON.stringify(["a", " b "]));
    expect(readQueryFile(json)).toEqual(["a", "b"]);
  });

  test("rejects missing, empty and malformed files", () => {
    expect(() => readQueryFile(path.join(dir, "none"))).toThrow(/not found/);
    const empty = path.join(dir, "empty.txt");
    fs.writeFileSync(empty, "\n\n");
    expect(() => readQueryFile(empty)).toThrow(/No queries/);
    const bad = path.join(dir, "bad.json");
    fs.writeFileSync(bad, "[1, 2]");
    expect(() => readQueryFile(bad)).toThrow(/array of strings/);
  });

  test("samples the first words of the first chunks deterministically", () => {
    const chunks = [
      { content: "one two three four five six seven eight nine ten" },
      { content: "   " },
      { content: "short text" },
    ];
    expect(sampleQueries(chunks)).toEqual([
      "one two three four five six seven eight",
      "short text",
    ]);
    expect(sampleQueries(chunks, 1)).toHaveLength(1);
  });
});
