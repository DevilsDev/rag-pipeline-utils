"use strict";

const { Histogram } = require("../../../src/core/observability/metrics.js");

describe("Histogram memory", () => {
  test("keeps a bounded sample, not every observation", () => {
    const h = new Histogram("latency");
    for (let i = 0; i < 100000; i++) h.observe(i % 1000);
    expect(h._obs.length).toBeLessThanOrEqual(10000);
    expect(h.count).toBe(100000);
  });

  test("count, sum, mean, min, max and standard deviation stay exact", () => {
    const h = new Histogram("latency");
    for (let i = 0; i < 50000; i++) h.observe(i % 100);
    const s = h.getStatistics();
    expect(s.count).toBe(50000);
    expect(s.sum).toBe(50000 * 49.5);
    expect(s.mean).toBeCloseTo(49.5, 10);
    expect(s.min).toBe(0);
    expect(s.max).toBe(99);
    expect(s.stdDev).toBeCloseTo(Math.sqrt((100 * 100 - 1) / 12), 6);
  });

  test("percentiles of a large run stay close to the real ones", () => {
    const h = new Histogram("latency");
    for (let i = 0; i < 200000; i++) h.observe(i % 1000);
    const p = h.getPercentiles([50, 95, 99]);
    expect(Math.abs(p[50] - 500)).toBeLessThan(40);
    expect(Math.abs(p[95] - 950)).toBeLessThan(40);
    expect(Math.abs(p[99] - 990)).toBeLessThan(40);
  });

  test("percentiles below the bound are exact (nearest rank)", () => {
    const h = new Histogram("latency");
    for (let i = 1; i <= 100; i++) h.observe(i);
    expect(h.getPercentiles([50, 95, 99])).toEqual({ 50: 50, 95: 95, 99: 99 });
  });

  test("reset() starts the statistics over", () => {
    const h = new Histogram("latency");
    for (let i = 0; i < 20000; i++) h.observe(5);
    h.reset();
    h.observe(1);
    h.observe(3);
    expect(h.getStatistics()).toMatchObject({ count: 2, mean: 2, stdDev: 1 });
  });
});
