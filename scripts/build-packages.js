#!/usr/bin/env node

/**
 * Builds the scoped packages into dist-packages/<name>/, from the same
 * source as @devilsdev/rag-pipeline-utils (run `npm run build` first, for
 * the type declarations):
 *
 *   @devilsdev/rag-core        createRagPipeline, retrieval, caching, costs
 *   @devilsdev/rag-connectors  embedders, LLMs and vector stores
 *   @devilsdev/rag-eval        evaluation, grounding and citations
 *   @devilsdev/rag-guardrails  injection detection and guards
 *
 * rag-core owns every source file its entry reaches. Each other package
 * owns the files only it reaches, and depends on rag-core for the rest:
 * its bundle loads those modules from rag-core (one copy, so instanceof
 * and shared state hold across packages). The build fails if a package
 * needs another non-core package's files, or bundles an npm package.
 *
 * Dependencies come from what each bundle requires, with the main
 * package's version ranges; every version is the main package's version.
 *
 * Usage: node scripts/build-packages.js
 */

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const { builtinModules } = require("module");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "dist-packages");
const INTERNAL = "@devilsdev/rag-core/internal";
const CORE = "@devilsdev/rag-core";

const PACKAGES = [
  {
    name: CORE,
    entry: "packages/core.js",
    description:
      "createRagPipeline and its building blocks: retrieval, reranking, caching, cost tracking and model routing.",
    keywords: ["rag", "retrieval-augmented-generation", "pipeline", "llm"],
  },
  {
    name: "@devilsdev/rag-connectors",
    entry: "packages/connectors.js",
    description:
      "Embedders, LLMs and vector stores for @devilsdev/rag-core: OpenAI, Anthropic, Cohere, Ollama, the AI SDK, Qdrant and pgvector.",
    keywords: ["rag", "openai", "anthropic", "ollama", "qdrant", "pgvector"],
  },
  {
    name: "@devilsdev/rag-eval",
    entry: "packages/eval.js",
    description:
      "RAG evaluation: faithfulness, relevance, context precision and recall, groundedness, datasets, reports and citation checks.",
    keywords: ["rag", "evaluation", "llm-evaluation", "groundedness"],
  },
  {
    name: "@devilsdev/rag-guardrails",
    entry: "packages/guardrails.js",
    description:
      "Guardrails for RAG: prompt-injection detection and pre-retrieval, retrieval and post-generation guards.",
    keywords: ["rag", "guardrails", "prompt-injection", "llm-security"],
  },
];

const rootPkg = require(path.join(ROOT, "package.json"));
const BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);
const posix = (p) => p.split(path.sep).join("/");
const srcRelative = (abs) => posix(path.relative(SRC, abs));
const packageName = (spec) =>
  spec.startsWith("@")
    ? spec.split("/").slice(0, 2).join("/")
    : spec.split("/")[0];

/** Source files (relative to src/) an entry reaches, and their imports. */
function graph(entry) {
  const { metafile } = esbuild.buildSync({
    entryPoints: [path.join(SRC, entry)],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    metafile: true,
    packages: "external",
    logLevel: "silent",
  });
  const files = new Map();
  for (const [input, info] of Object.entries(metafile.inputs)) {
    if (!input.startsWith("src/")) continue;
    files.set(
      input.slice(4),
      info.imports
        .filter((i) => i.path.startsWith("src/"))
        .map((i) => i.path.slice(4)),
    );
  }
  return files;
}

/** Which package owns each file; fails on a disallowed edge. */
function assignFiles() {
  const coreFiles = new Set(graph(PACKAGES[0].entry).keys());
  const owners = new Map([...coreFiles].map((f) => [f, CORE]));
  const errors = [];
  for (const pkg of PACKAGES.slice(1)) {
    const files = graph(pkg.entry);
    pkg.ownFiles = new Set([...files.keys()].filter((f) => !coreFiles.has(f)));
    for (const file of pkg.ownFiles) {
      const owner = owners.get(file);
      if (owner) {
        errors.push(
          `${file} is used by both ${owner} and ${pkg.name}: move it into rag-core's entry, or out of one of them`,
        );
      }
      owners.set(file, pkg.name);
    }
    for (const [file, imports] of files) {
      if (!pkg.ownFiles.has(file)) continue;
      for (const target of imports) {
        if (!coreFiles.has(target) && !pkg.ownFiles.has(target)) {
          errors.push(`${pkg.name}: ${file} requires ${target}`);
        }
      }
    }
  }
  if (errors.length) {
    throw new Error(`Scoped package boundaries:\n  ${errors.join("\n  ")}`);
  }
  PACKAGES[0].ownFiles = coreFiles;
  return coreFiles;
}

/** Loads rag-core's modules from the installed rag-core, not a copy. */
function coreModulesPlugin(coreFiles) {
  return {
    name: "rag-core-modules",
    setup(build) {
      build.onResolve({ filter: /^\.\.?\// }, (args) => {
        if (!args.importer.startsWith(SRC)) return undefined;
        let resolved = path.resolve(args.resolveDir, args.path);
        if (!resolved.endsWith(".js") && !resolved.endsWith(".json")) {
          resolved += fs.existsSync(`${resolved}.js`) ? ".js" : "/index.js";
        }
        const rel = srcRelative(resolved);
        return coreFiles.has(rel)
          ? { path: rel, namespace: "rag-core" }
          : undefined;
      });
      build.onLoad({ filter: /.*/, namespace: "rag-core" }, (args) => ({
        contents: `module.exports = require(${JSON.stringify(CORE)})[Symbol.for(${JSON.stringify(INTERNAL)})](${JSON.stringify(args.path)});`,
        loader: "js",
      }));
    },
  };
}

async function bundle(pkg, coreFiles, outDir) {
  const isCore = pkg.name === CORE;
  const options = {
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node22",
    outfile: path.join(outDir, "dist", "index.cjs"),
    packages: "external",
    metafile: true,
    logLevel: "warning",
  };
  if (isCore) {
    // Every core module, by path, for the other packages (see the plugin).
    const internal = [...coreFiles]
      .sort()
      .map(
        (f) =>
          `  ${JSON.stringify(f)}: () => require(${JSON.stringify(`./${f}`)}),`,
      )
      .join("\n");
    options.stdin = {
      contents: [
        `const core = require("./${pkg.entry}");`,
        `const modules = {\n${internal}\n};`,
        `Object.defineProperty(core, Symbol.for(${JSON.stringify(INTERNAL)}), {`,
        "  value: (file) => {",
        "    if (!modules[file]) throw new Error(`@devilsdev/rag-core has no module ${file}`);",
        "    return modules[file]();",
        "  },",
        "});",
        "module.exports = core;",
      ].join("\n"),
      resolveDir: SRC,
      sourcefile: "rag-core-entry.js",
    };
  } else {
    options.entryPoints = [path.join(SRC, pkg.entry)];
    options.plugins = [coreModulesPlugin(coreFiles)];
    options.external = [CORE];
  }
  const { metafile } = await esbuild.build(options);

  // Only this package's own files may be in its bundle.
  // (package.json is embedded for the library version, the same in every
  // package.)
  const bundled = Object.keys(metafile.inputs).filter(
    (i) =>
      !i.startsWith("rag-core:") &&
      i !== "src/rag-core-entry.js" &&
      i !== "package.json",
  );
  const foreign = bundled.filter(
    (i) => !i.startsWith("src/") || !pkg.ownFiles.has(i.slice(4)),
  );
  if (foreign.length) {
    throw new Error(
      `${pkg.name} bundles files it does not own:\n  ${foreign.join("\n  ")}`,
    );
  }

  const requires = new Set();
  for (const info of Object.values(metafile.inputs)) {
    for (const i of info.imports) {
      if (i.external && !BUILTINS.has(i.path))
        requires.add(packageName(i.path));
    }
  }
  return requires;
}

function manifest(pkg, requires) {
  const dependencies = {};
  const peerDependencies = {};
  const peerDependenciesMeta = {};
  for (const name of [...requires].sort()) {
    if (name === CORE) dependencies[name] = rootPkg.version;
    else if (rootPkg.dependencies?.[name]) {
      dependencies[name] = rootPkg.dependencies[name];
    } else if (rootPkg.peerDependencies?.[name]) {
      peerDependencies[name] = rootPkg.peerDependencies[name];
      if (rootPkg.peerDependenciesMeta?.[name]?.optional) {
        peerDependenciesMeta[name] = { optional: true };
      }
    } else {
      throw new Error(
        `${pkg.name} requires "${name}", which is not a dependency or peer of @devilsdev/rag-pipeline-utils`,
      );
    }
  }
  const isCore = pkg.name === CORE;
  return {
    name: pkg.name,
    version: rootPkg.version,
    description: pkg.description,
    keywords: pkg.keywords,
    license: rootPkg.license,
    author: rootPkg.author,
    homepage: rootPkg.homepage,
    repository: rootPkg.repository,
    bugs: rootPkg.bugs,
    engines: rootPkg.engines,
    main: "./dist/index.cjs",
    types: "./dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        require: "./dist/index.cjs",
        import: "./dist/index.mjs",
      },
      ...(isCore && { "./all-types": { types: "./all-types.d.ts" } }),
      "./package.json": "./package.json",
    },
    files: [
      "dist/",
      ...(isCore ? ["all-types.d.ts"] : []),
      "README.md",
      "LICENSE",
    ],
    sideEffects: false,
    ...(Object.keys(dependencies).length && { dependencies }),
    ...(Object.keys(peerDependencies).length && { peerDependencies }),
    ...(Object.keys(peerDependenciesMeta).length && { peerDependenciesMeta }),
  };
}

function writeTypes(pkg, names, outDir) {
  const dist = path.join(outDir, "dist");
  if (pkg.name === CORE) {
    // rag-core carries every declaration; the other packages re-export
    // theirs from it (./all-types), so each type exists once.
    fs.cpSync(path.join(ROOT, "dist", "types"), path.join(dist, "types"), {
      recursive: true,
    });
    fs.copyFileSync(
      path.join(ROOT, "dist", "index.d.ts"),
      path.join(dist, "all.d.ts"),
    );
    fs.writeFileSync(
      path.join(outDir, "all-types.d.ts"),
      'export * from "./dist/all";\n',
    );
    fs.writeFileSync(
      path.join(dist, "index.d.ts"),
      `export { ${names.join(", ")} } from "./all";\n`,
    );
  } else {
    fs.writeFileSync(
      path.join(dist, "index.d.ts"),
      `export { ${names.join(", ")} } from "${CORE}/all-types";\n`,
    );
  }
}

function readme(pkg, names) {
  const others = PACKAGES.filter((p) => p !== pkg)
    .map((p) => `- [\`${p.name}\`](https://www.npmjs.com/package/${p.name})`)
    .join("\n");
  return [
    `# ${pkg.name}`,
    "",
    pkg.description,
    "",
    "Part of [@devilsdev/rag-pipeline-utils](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils), split into packages so you install only what you use. The objects are the same ones the full package exports; versions move in lockstep.",
    "",
    "```bash",
    `npm install ${pkg.name}`,
    "```",
    "",
    `Exports: ${names.map((n) => `\`${n}\``).join(", ")}.`,
    "",
    "Documentation: https://devilsdev.github.io/rag-pipeline-utils/",
    "",
    "The other packages:",
    "",
    others,
    "",
  ].join("\n");
}

async function build() {
  if (!fs.existsSync(path.join(ROOT, "dist", "index.d.ts"))) {
    throw new Error(
      "Run `npm run build` first (it writes the type declarations).",
    );
  }
  const coreFiles = assignFiles();
  fs.rmSync(OUT, { recursive: true, force: true });

  const built = [];
  for (const pkg of PACKAGES) {
    const outDir = path.join(OUT, pkg.name.split("/")[1]);
    fs.mkdirSync(path.join(outDir, "dist"), { recursive: true });
    const requires = await bundle(pkg, coreFiles, outDir);
    const names = Object.keys(require(path.join(SRC, pkg.entry)));

    fs.writeFileSync(
      path.join(outDir, "dist", "index.mjs"),
      [
        "import { createRequire } from 'module';",
        "const require = createRequire(import.meta.url);",
        "const mod = require('./index.cjs');",
        `export const { ${names.join(", ")} } = mod;`,
        "export default mod;",
        "",
      ].join("\n"),
    );
    writeTypes(pkg, names, outDir);
    const pkgJson = manifest(pkg, requires);
    fs.writeFileSync(
      path.join(outDir, "package.json"),
      `${JSON.stringify(pkgJson, null, 2)}\n`,
    );
    fs.writeFileSync(path.join(outDir, "README.md"), readme(pkg, names));
    fs.copyFileSync(path.join(ROOT, "LICENSE"), path.join(outDir, "LICENSE"));
    built.push({
      name: pkg.name,
      files: pkg.ownFiles.size,
      exports: names.length,
      dependencies: Object.keys(pkgJson.dependencies || {}),
    });
  }
  return built;
}

if (require.main === module) {
  build().then(
    (built) => {
      for (const p of built) {
        console.log(
          `${p.name}@${rootPkg.version}: ${p.exports} exports, ${p.files} source files, dependencies: ${p.dependencies.join(", ") || "none"}`,
        );
      }
    },
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}

module.exports = { build, PACKAGES, OUT };
