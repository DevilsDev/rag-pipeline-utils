/**
 * `rag-pipeline init` driven through the REAL inquirer prompts.
 *
 * handleInit gets fake terminal streams (deps.input / deps.output with
 * isTTY = true) instead of an injected prompt function, so the production
 * wiring (inquirer.createPromptModule bound to those streams) renders each
 * question and reads keystrokes exactly as it would from a terminal.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { PassThrough, Writable } = require("stream");
const { handleInit } = require("../../src/cli/handlers/init-handler.js");

const KEY = { enter: "\r", down: "\u001b[B" };
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

/**
 * Fake TTY. Every inquirer question is a separate UI that ends its output
 * stream when the question is answered, so `end()` marks a question
 * boundary; `ask()` waits for the next question's message after the last
 * boundary before typing, so keystrokes never reach the wrong prompt.
 */
function createTerminal() {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => input;

  let text = "";
  const boundaries = [0];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString();
      callback();
    },
  });
  output.isTTY = true;
  output.columns = 120;
  output.rows = 40;
  // Keep the stream writable across questions; record the boundary instead.
  output.end = () => {
    boundaries.push(text.length);
    return output;
  };

  const plain = (from = 0) => text.slice(from).replace(ANSI, "");
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let answered = 0;
  /**
   * Wait for question number `answered` to show `message`, then type keys.
   * @param {string} message - Text of the question
   * @param {string[]} keys - Keystrokes, written one at a time
   */
  async function ask(message, keys) {
    const deadline = Date.now() + 5000;
    for (;;) {
      if (boundaries.length > answered) {
        const shown = plain(boundaries[answered]);
        if (shown.includes(message)) break;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Question ${answered + 1} "${message}" never appeared. Output:\n${plain().slice(-1500)}`,
        );
      }
      await sleep(5);
    }
    for (const key of keys) {
      input.write(key);
      await sleep(5);
    }
    answered++;
  }

  return { input, output, ask, plain };
}

const type = (text) => [...text.split(""), KEY.enter];

describe("init wizard with real inquirer prompts", () => {
  let dir;
  let output;
  let lines;
  let terminal;

  beforeEach(() => {
    jest.useRealTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "init-tty-"));
    output = path.join(dir, ".ragrc.json");
    lines = [];
    terminal = createTerminal();
    process.exitCode = undefined;
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    terminal.input.end();
    process.exitCode = undefined;
    jest.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function start() {
    return handleInit(
      {},
      { output, template: "local" },
      {
        input: terminal.input,
        output: terminal.output,
        env: {},
        log: (...args) => lines.push(args.join(" ")),
      },
    );
  }

  test("a full local-embedder run writes the offline pipeline", async () => {
    const done = start();

    await terminal.ask("Embedder:", [KEY.enter]);
    await terminal.ask("Language model:", [KEY.enter]);
    await terminal.ask("Retriever:", [KEY.enter]);
    await terminal.ask("Index file", [KEY.enter]);
    await terminal.ask("Reranker", [KEY.enter]);
    await terminal.ask("Test the embedder/LLM now?", ["y", KEY.enter]);
    await terminal.ask("Write this configuration", [KEY.enter]);

    const result = await done;

    expect(result).toEqual({ written: true, connectionTested: false });
    expect(process.exitCode).toBeUndefined();
    expect(lines.join("\n")).toMatch(
      /local embedder runs offline; nothing to test/,
    );
    const config = JSON.parse(fs.readFileSync(output, "utf8"));
    expect(config.pipeline).toEqual([
      { stage: "loader", name: "auto" },
      { stage: "embedder", name: "local" },
      expect.objectContaining({ stage: "retriever", name: "file-store" }),
    ]);
    expect(config.plugins).toBeUndefined();
    // The answers were rendered by inquirer on the fake terminal.
    expect(terminal.plain()).toMatch(/Embedder: local/);
  });

  test("a custom embedder plugin is re-prompted until it is valid", async () => {
    const slash = (p) => p.split(path.sep).join("/");
    const missing = slash(path.join(dir, "missing.js"));
    const wrongShape = slash(path.join(dir, "not-an-embedder.js"));
    const valid = slash(path.join(dir, "plugins", "my-embedder.js"));
    fs.writeFileSync(wrongShape, "module.exports = { hello() {} };");
    fs.mkdirSync(path.dirname(valid));
    fs.writeFileSync(
      valid,
      "module.exports = class { embed(t) { return [t.length]; } };",
    );

    const done = start();

    // local, openai, ollama, cohere, custom: four steps down to "custom".
    await terminal.ask("Embedder:", [
      KEY.down,
      KEY.down,
      KEY.down,
      KEY.down,
      KEY.enter,
    ]);
    await terminal.ask("Path to your embedder module", type(missing));
    await terminal.ask("Path to your embedder module", type(wrongShape));
    await terminal.ask("Path to your embedder module", type(valid));
    await terminal.ask("Language model:", [KEY.enter]);
    await terminal.ask("Retriever:", [KEY.enter]);
    await terminal.ask("Index file", [KEY.enter]);
    await terminal.ask("Reranker", [KEY.enter]);
    await terminal.ask("Test the embedder/LLM now?", [KEY.enter]);
    await terminal.ask("Write this configuration", [KEY.enter]);

    const result = await done;

    expect(result).toEqual({ written: true, connectionTested: false });
    const log = lines.join("\n");
    expect(log).toMatch(/File not found: .*missing\.js/);
    expect(log).toMatch(/not-an-embedder\.js does not look like a embedder/);
    expect(log).toMatch(/embedder plugin "my-embedder"/);

    const config = JSON.parse(fs.readFileSync(output, "utf8"));
    expect(config.pipeline.find((e) => e.stage === "embedder")).toEqual({
      stage: "embedder",
      name: "my-embedder",
    });
    expect(config.plugins).toEqual({
      embedder: { "my-embedder": "./plugins/my-embedder.js" },
    });
  });
});
