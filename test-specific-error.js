const { DAG } = require("./src/dag/dag-engine.js");

async function testSpecificError() {
  const dag = new DAG();

  const mockA = () => Promise.resolve("A-result");
  const mockB = () => Promise.reject(new Error("B failed"));
  const mockC = () => Promise.resolve("C-result");

  dag.addNode("A", mockA);
  dag.addNode("B", mockB);
  dag.addNode("C", mockC);
  dag.connect("A", "B");
  dag.connect("B", "C");

  try {
    await dag.execute("seed");
    console.log("ERROR: Should have thrown");
  } catch (error) {
    console.log("Caught error message:", error.message);
    console.log(
      "Expected:",
      "Node B execution failed: B failed. This affects downstream nodes: C",
    );
    console.log(
      "Match:",
      error.message ===
        "Node B execution failed: B failed. This affects downstream nodes: C",
    );
  }
}

testSpecificError().catch(console.error);
