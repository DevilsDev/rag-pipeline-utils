const { DAG } = require("./src/dag/dag-engine.js");

async function testGracefulDegradation() {
  const dag = new DAG();

  const mockA = () => Promise.resolve("A-result");
  const mockB = () => Promise.reject(new Error("B failed"));
  const mockC = () => Promise.resolve("C-result");

  dag.addNode("A", mockA);
  dag.addNode("B", mockB);
  dag.addNode("C", mockC);
  dag.connect("A", "B");
  dag.connect("A", "C");

  try {
    const result = await dag.execute("seed", { gracefulDegradation: true });
    console.log("Result type:", typeof result);
    console.log("Result constructor:", result?.constructor?.name);
    console.log("Result:", result);
    console.log("Has get method:", typeof result?.get === "function");

    if (result && typeof result.get === "function") {
      console.log("A result:", result.get("A"));
      console.log("C result:", result.get("C"));
    }
  } catch (error) {
    console.log("Unexpected error:", error.message);
  }
}

testGracefulDegradation().catch(console.error);
