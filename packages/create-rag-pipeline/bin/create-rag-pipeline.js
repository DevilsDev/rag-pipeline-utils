#!/usr/bin/env node
"use strict";

/**
 *   npm create rag-pipeline@latest [dir] -- [--template next|mastra|workers]
 *
 * Without --template, asks which starter to use (or fails when not run in a
 * terminal, so scripts and CI must pass it).
 */

const readline = require("readline/promises");
const path = require("path");
const { scaffold, TEMPLATES, version } = require("../lib/scaffold");

const USAGE = `Usage: npm create rag-pipeline@latest [dir] -- [--template ${Object.keys(TEMPLATES).join("|")}]

Templates:
${Object.entries(TEMPLATES)
  .map(([k, v]) => `  ${k.padEnd(8)} ${v}`)
  .join("\n")}`;

// Where each starter reads its API key from in development
const KEY_FILE = { next: ".env.local", mastra: ".env", workers: ".dev.vars" };
const EXAMPLE = {
  next: ".env.example",
  mastra: ".env.example",
  workers: ".dev.vars.example",
};
const RUN = { next: "dev", mastra: "ask", workers: "dev" };

function parse(argv) {
  const out = { dir: undefined, template: undefined, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") out.help = true;
    else if (a === "-v" || a === "--version") out.version = true;
    else if (a === "-t" || a === "--template") out.template = argv[++i];
    else if (a.startsWith("--template=")) out.template = a.slice(11);
    else if (a.startsWith("-")) throw new Error(`Unknown option ${a}`);
    else if (!out.dir) out.dir = a;
    else throw new Error(`Unexpected argument ${a}`);
  }
  return out;
}

async function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parse(process.argv.slice(2));
  if (args.help) return console.log(USAGE);
  if (args.version) return console.log(version);

  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  let { dir, template } = args;
  if (!template) {
    if (!interactive) throw new Error(`Pass --template.\n\n${USAGE}`);
    const keys = Object.keys(TEMPLATES);
    console.log("Which starter?");
    keys.forEach((k, i) => console.log(`  ${i + 1}. ${k}: ${TEMPLATES[k]}`));
    const answer = await ask(`Number or name [1]: `);
    template = keys[Number(answer || 1) - 1] || answer;
  }
  if (!dir) {
    dir = interactive
      ? (await ask("Directory [rag-app]: ")) || "rag-app"
      : "rag-app";
  }

  const result = scaffold({ template, dir });
  const rel = path.relative(process.cwd(), result.dir) || ".";
  const pm = (process.env.npm_config_user_agent || "npm").split("/")[0];
  const run = pm === "npm" ? "npm run" : pm;
  console.log(`
Created ${result.name} from the ${template} starter in ${rel}

  cd ${rel}
  ${pm} install
  ${run} ${RUN[template]}

It answers with the matching passages until you add a key: copy
${EXAMPLE[template]} to ${KEY_FILE[template]} and set ANTHROPIC_API_KEY. See README.md.`);
}

main().catch((error) => {
  console.error(`create-rag-pipeline: ${error.message}`);
  process.exit(1);
});
