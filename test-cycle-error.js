const { DAG } = require("./src/dag/dag-engine.js");

async function testCycleError() {
  const dag = new DAG();

  dag.addNode("A", () => Promise.resolve("A-result"));
  dag.addNode("B", () => Promise.resolve("B-result"));
  dag.connect("A", "B");
  dag.connect("B", "A");

  try {
    await dag.execute("seed");
    console.log("ERROR: Should have thrown");
  } catch (error) {
    console.log("Caught error message:", error.message);
    console.log("Expected:", "DAG execution failed: DAG validation failed");
    console.log(
      "Match:",
      error.message === "DAG execution failed: DAG validation failed",
    );
  }
}

testCycleError().catch(console.error);
