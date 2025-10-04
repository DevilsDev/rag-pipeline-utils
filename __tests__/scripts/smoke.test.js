const { execFileSync } = require("child_process");
const path = require("path");

describe("scripts smoke", () => {
  it("setup.js runs successfully", () => {
    const file = path.join(process.cwd(), "scripts", "setup.js");
    execFileSync(process.execPath, [file], { stdio: "pipe" });
  });
});
