"use strict";

const { DAG } = require("../../../src/dag/dag-engine");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fanIn(n, ms, track) {
  const dag = new DAG();
  for (let i = 0; i < n; i++) {
    dag.addNode(`n${i}`, async () => {
      track.inFlight += 1;
      track.peak = Math.max(track.peak, track.inFlight);
      await sleep(ms);
      track.inFlight -= 1;
      return i;
    });
  }
  dag.addNode("sink", async (xs) => xs);
  for (let i = 0; i < n; i++) dag.connect(`n${i}`, "sink");
  return dag;
}

describe("DAG concurrency", () => {
  test("independent nodes run at the same time up to the limit", async () => {
    const track = { inFlight: 0, peak: 0 };
    const dag = fanIn(3, 200, track);
    const t = Date.now();
    const out = await dag.execute(null, { concurrency: 3 });
    expect(out).toEqual([0, 1, 2]);
    expect(track.peak).toBe(3);
    expect(Date.now() - t).toBeLessThan(450);
  });

  test("concurrency 2 never runs more than two at once", async () => {
    const track = { inFlight: 0, peak: 0 };
    await fanIn(5, 30, track).execute(null, { concurrency: 2 });
    expect(track.peak).toBe(2);
  });

  test("a node still waits for its inputs", async () => {
    const order = [];
    const dag = new DAG();
    dag.addNode("a", async () => {
      await sleep(40);
      order.push("a");
      return 1;
    });
    dag.addNode("b", async (x) => {
      order.push("b");
      return x + 1;
    });
    dag.connect("a", "b");
    expect(await dag.execute(null, { concurrency: 4 })).toBe(2);
    expect(order).toEqual(["a", "b"]);
  });

  test("without a concurrency option nodes run one after another", async () => {
    const track = { inFlight: 0, peak: 0 };
    await fanIn(3, 10, track).execute(null, {});
    expect(track.peak).toBe(1);
  });

  test("a critical failure with concurrency rejects after running nodes settle", async () => {
    const dag = new DAG();
    dag.addNode("bad", async () => {
      throw new Error("boom");
    });
    dag.addNode("slow", async () => {
      await sleep(30);
      return 1;
    });
    dag.addNode("sink", async (x) => x);
    dag.connect("bad", "sink");
    dag.connect("slow", "sink");
    await expect(dag.execute(null, { concurrency: 2 })).rejects.toThrow(/boom/);
  });
});

describe("DAG node timeout", () => {
  test("a node with a timeout fails when it runs longer", async () => {
    const dag = new DAG();
    dag.addNode(
      "slow",
      async () => {
        await sleep(1500);
        return "late";
      },
      { timeout: 100 },
    );
    const t = Date.now();
    await expect(dag.execute(null, {})).rejects.toThrow(/timed out|timeout/i);
    expect(Date.now() - t).toBeLessThan(800);
  });

  test("a timed-out optional node is skipped like any failed optional node", async () => {
    const dag = new DAG();
    const slow = dag.addNode(
      "slow",
      async () => {
        await sleep(500);
        return "late";
      },
      { timeout: 50 },
    );
    slow.optional = true;
    dag.addNode("fast", async () => "ok");
    const out = await dag.execute(null, {
      gracefulDegradation: true,
      requiredNodes: ["fast"],
    });
    expect(out.get("fast")).toBe("ok");
    expect(out.get("slow")).toBeUndefined();
  });

  test("a node that finishes within its timeout is unaffected", async () => {
    const dag = new DAG();
    dag.addNode(
      "quick",
      async () => {
        await sleep(10);
        return "done";
      },
      { timeout: 1000 },
    );
    expect(await dag.execute(null, {})).toBe("done");
  });
});
