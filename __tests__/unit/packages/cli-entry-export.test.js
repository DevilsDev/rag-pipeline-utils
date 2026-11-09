/**
 * `@devilsdev/rag-pipeline-utils/cli` is a module (the CLI's run function);
 * importing it must not start the CLI on the host's argv. The bin script is
 * what starts it.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "../../..");
const pkg = require(path.join(ROOT, "package.json"));

describe("the ./cli export", () => {
  it("is not the bin script", () => {
    expect(pkg.bin["rag-pipeline"]).toBe("bin/cli.js");
    expect(pkg.exports["./cli"]).toBe("./dist/cli.cjs");
  });

  const built = fs.existsSync(path.join(ROOT, "dist", "cli.cjs"));
  (built ? it : it.skip)(
    "can be required by a host without running the CLI or exiting",
    () => {
      const script = `
        process.argv = [process.argv[0], '/srv/app.js', '--port', '8080'];
        const m = require('@devilsdev/rag-pipeline-utils/cli');
        console.log(JSON.stringify({ run: typeof m.run }));
        setTimeout(() => console.log('still running'), 100);
      `;
      const r = spawnSync(process.execPath, ["-e", script], {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 30000,
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('"run":"function"');
      expect(r.stdout).toContain("still running");
    },
  );
});
