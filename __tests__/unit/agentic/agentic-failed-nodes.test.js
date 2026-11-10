"use strict";

const { AgenticPipeline } = require("../../../src/agentic/agentic-pipeline");
const { DAG } = require("../../../src/dag/dag-engine");

describe("failed nodes under the concurrency path", () => {
  test("a failed retrieval is not handed to the llm as a document", async () => {
    let seen;
    const llm = {
      generate: async (_q, docs) => {
        seen = docs;
        return "answer";
      },
    };
    let n = 0;
    const retriever = {
      retrieve: async () => {
        if (n++ === 0) throw new Error("vector db timeout");
        return [{ id: "b", content: "Contractors get ten days." }];
      },
    };
    const ap = new AgenticPipeline({ enableCritique: false });
    const r = await ap.run({
      query: "How many days do employees get and how many do contractors get?",
      retriever,
      llm,
    });
    expect(seen.every((d) => typeof d === "object")).toBe(true);
    expect(seen.map((d) => d.id)).toEqual(["b"]);
    expect(r.results.every((d) => typeof d === "object")).toBe(true);
  });

  test.each([true, false])(
    "a failing llm gives success:false (enableCritique=%s)",
    async (enableCritique) => {
      const ap = new AgenticPipeline({ enableCritique });
      const r = await ap.run({
        query: "How many vacation days?",
        retriever: {
          retrieve: async () => [{ id: "a", content: "Twenty vacation days." }],
        },
        llm: {
          generate: async () => {
            throw new Error("LLM 500: upstream unavailable");
          },
        },
      });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/LLM 500|upstream unavailable/);
    },
  );

  test("the DAG keeps a failed optional node out of the results with concurrency set", async () => {
    const dag = new DAG();
    dag.addNode("ok", async () => "fine");
    const bad = dag.addNode("bad", async () => {
      throw new Error("nope");
    });
    bad.optional = true;
    const out = await dag.execute(null, {
      concurrency: 2,
      gracefulDegradation: true,
      requiredNodes: ["ok"],
    });
    expect(out.get("bad")).toBeUndefined();
    expect(Object.values(out).every((v) => typeof v !== "symbol")).toBe(true);
  });
});
