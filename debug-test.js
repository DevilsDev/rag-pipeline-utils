const { spawn } = require("child_process");

const child = spawn(
  "npx",
  [
    "jest",
    "__tests__/unit/dag/dag-engine.test.js",
    "--no-coverage",
    "--verbose",
    "--no-cache",
  ],
  {
    cwd: process.cwd(),
    stdio: "pipe",
  },
);

let stdout = "";
let stderr = "";

child.stdout.on("data", (data) => {
  stdout += data.toString();
});

child.stderr.on("data", (data) => {
  stderr += data.toString();
});

child.on("close", (code) => {
  console.log("=== STDOUT ===");
  console.log(stdout);
  console.log("=== STDERR ===");
  console.log(stderr);
  console.log("=== EXIT CODE ===");
  console.log(code);
});
