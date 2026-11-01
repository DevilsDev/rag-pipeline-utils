#!/usr/bin/env node

/**
 * Builds the scoped packages into packages/<name>/ (npm workspaces), from
 * the same source as @devilsdev/rag-pipeline-utils, which depends on them
 * and re-exports them (`npm run build` runs this):
 *
 *   @devilsdev/rag-core        createRagPipeline, retrieval, caching, costs
 *   @devilsdev/rag-connectors  embedders, LLMs and vector stores
 *   @devilsdev/rag-eval        evaluation, grounding and citations
 *   @devilsdev/rag-guardrails  injection detection and guards
 *
 * rag-core owns every source file its entry reaches. Each other package
 * owns the files only it reaches, and depends on rag-core for the rest.
 * Every package exposes its modules by path (Symbol.for("<name>/internal")),
 * and a bundle that needs another package's module loads it from that
 * package (scopedModulesPlugin) instead of bundling a copy, so instanceof
 * and shared state hold across the packages and the main package. The
 * build fails if a package needs another non-core package's files, or
 * bundles a file it does not own.
 *
 * Dependencies come from what each bundle requires, with the main
 * package's version ranges. Every version is the main package's version,
 * and so is the main package's dependency on each (see
 * scripts/sync-package-versions.js).
 *
 * Usage: node scripts/build-packages.js [--bundles | --types]
 *   --bundles  bundles, package.json, README and LICENSE (before
 *              scripts/build.js, whose bundles load these packages)
 *   --types    declarations (after scripts/generate-types.js)
 */

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const { builtinModules } = require("module");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "packages");
const CORE = "@devilsdev/rag-core";
const internalKey = (name) => `${name}/internal`;
const dirOf = (name) => path.join(OUT, name.split("/")[1]);

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
  return owners;
}

/**
 * Loads modules owned by a scoped package (other than `self`) from that
 * package, through its internal lookup, instead of bundling a copy.
 *
 * @param {Map<string, string>} owners - src-relative file -> package name
 * @param {string|null} self - The package being built (null: the main package)
 */
function scopedModulesPlugin(owners, self) {
  return {
    name: "scoped-package-modules",
    setup(build) {
      build.onResolve({ filter: /^\.\.?\// }, (args) => {
        let resolved = path.resolve(args.resolveDir, args.path);
        if (!resolved.startsWith(SRC)) return undefined;
        if (!resolved.endsWith(".js") && !resolved.endsWith(".json")) {
          resolved += fs.existsSync(`${resolved}.js`) ? ".js" : "/index.js";
        }
        const rel = srcRelative(resolved);
        const owner = owners.get(rel);
        return owner && owner !== self
          ? { path: `${owner}|${rel}`, namespace: "scoped" }
          : undefined;
      });
      build.onLoad({ filter: /.*/, namespace: "scoped" }, (args) => {
        const [owner, rel] = args.path.split("|");
        return {
          contents: `module.exports = require(${JSON.stringify(owner)})[Symbol.for(${JSON.stringify(internalKey(owner))})](${JSON.stringify(rel)});`,
          loader: "js",
        };
      });
    },
  };
}

/** Fails if a bundle contains a file a scoped package owns. */
function assertNoCopies(metafile, owners, label) {
  const copies = Object.keys(metafile.inputs).filter(
    (i) => i.startsWith("src/") && owners.has(i.slice(4)),
  );
  if (copies.length) {
    throw new Error(
      `${label} bundles files of the scoped packages instead of loading them:\n  ${copies.join("\n  ")}`,
    );
  }
}

async function bundle(pkg, owners, outDir) {
  // Every module the package owns, by path, for the other packages and the
  // main package (see scopedModulesPlugin).
  const internal = [...pkg.ownFiles]
    .sort()
    .map(
      (f) =>
        `  ${JSON.stringify(f)}: () => require(${JSON.stringify(`./${f}`)}),`,
    )
    .join("\n");
  const others = PACKAGES.map((p) => p.name).filter((n) => n !== pkg.name);
  const { metafile } = await esbuild.build({
    stdin: {
      contents: [
        `const mod = require("./${pkg.entry}");`,
        `const modules = {\n${internal}\n};`,
        `Object.defineProperty(mod, Symbol.for(${JSON.stringify(internalKey(pkg.name))}), {`,
        "  value: (file) => {",
        `    if (!modules[file]) throw new Error(${JSON.stringify(`${pkg.name} has no module `)} + file);`,
        "    return modules[file]();",
        "  },",
        "});",
        "module.exports = mod;",
      ].join("\n"),
      resolveDir: SRC,
      sourcefile: "package-entry.js",
    },
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node22",
    outfile: path.join(outDir, "dist", "index.cjs"),
    packages: "external",
    external: others,
    plugins: [scopedModulesPlugin(owners, pkg.name)],
    metafile: true,
    logLevel: "warning",
  });

  // Only this package's own files may be in its bundle. (package.json is
  // embedded for the library version, the same in every package.)
  const foreign = Object.keys(metafile.inputs).filter(
    (i) =>
      !i.startsWith("scoped:") &&
      i !== "src/package-entry.js" &&
      i !== "package.json" &&
      (!i.startsWith("src/") || !pkg.ownFiles.has(i.slice(4))),
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
    if (PACKAGES.some((p) => p.name === name)) {
      dependencies[name] = rootPkg.version;
    } else if (rootPkg.dependencies?.[name]) {
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
    publishConfig: { access: "public" },
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

/** Fails unless the main package depends on each package at its version. */
function checkLockstep() {
  const wrong = PACKAGES.filter(
    (p) => rootPkg.dependencies?.[p.name] !== rootPkg.version,
  ).map((p) => `${p.name}: ${rootPkg.dependencies?.[p.name] ?? "missing"}`);
  if (wrong.length) {
    throw new Error(
      `@devilsdev/rag-pipeline-utils@${rootPkg.version} must depend on the scoped packages at ${rootPkg.version} (${wrong.join(", ")}). Run node scripts/sync-package-versions.js.`,
    );
  }
}

/**
 * @param {{bundles?: boolean, types?: boolean}} [phases] - Default: both
 * @returns {Promise<Array<object>>} What was built, per package
 */
async function build({ bundles = true, types = true } = {}) {
  checkLockstep();
  if (types && !fs.existsSync(path.join(ROOT, "dist", "index.d.ts"))) {
    throw new Error(
      "Run scripts/generate-types.js first: the packages ship its declarations.",
    );
  }
  const owners = assignFiles();

  const built = [];
  for (const pkg of PACKAGES) {
    const outDir = dirOf(pkg.name);
    const names = Object.keys(require(path.join(SRC, pkg.entry)));
    const entry = {
      name: pkg.name,
      files: pkg.ownFiles.size,
      exports: names.length,
    };
    if (bundles) {
      fs.rmSync(path.join(outDir, "dist"), { recursive: true, force: true });
      fs.mkdirSync(path.join(outDir, "dist"), { recursive: true });
      const requires = await bundle(pkg, owners, outDir);
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
      const pkgJson = manifest(pkg, requires);
      fs.writeFileSync(
        path.join(outDir, "package.json"),
        `${JSON.stringify(pkgJson, null, 2)}\n`,
      );
      fs.writeFileSync(path.join(outDir, "README.md"), readme(pkg, names));
      fs.copyFileSync(path.join(ROOT, "LICENSE"), path.join(outDir, "LICENSE"));
      entry.dependencies = Object.keys(pkgJson.dependencies || {});
    }
    if (types) writeTypes(pkg, names, outDir);
    built.push(entry);
  }
  return built;
}

if (require.main === module) {
  const only = process.argv.find((a) => a === "--bundles" || a === "--types");
  const phases = only
    ? { bundles: only === "--bundles", types: only === "--types" }
    : {};
  build(phases).then(
    (built) => {
      for (const p of built) {
        const deps = p.dependencies
          ? `, dependencies: ${p.dependencies.join(", ") || "none"}`
          : "";
        console.log(
          `${p.name}@${rootPkg.version}: ${p.exports} exports, ${p.files} source files${deps}`,
        );
      }
    },
    (error) => {
      console.error(error.message);
      process.exit(1);
    },
  );
}

module.exports = {
  build,
  assignFiles,
  scopedModulesPlugin,
  assertNoCopies,
  PACKAGES,
  OUT,
};
