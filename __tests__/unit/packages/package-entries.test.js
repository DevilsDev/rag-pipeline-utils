/**
 * The scoped packages' entries (src/packages/): subsets of the main entry,
 * the same objects, with no export in two packages. scripts/build-packages.js
 * bundles them; scripts/test-packages.js installs and runs the result.
 */
const main = require("../../../src/index");

const ENTRIES = {
  core: require("../../../src/packages/core"),
  connectors: require("../../../src/packages/connectors"),
  eval: require("../../../src/packages/eval"),
  guardrails: require("../../../src/packages/guardrails"),
};

test.each(Object.entries(ENTRIES))(
  "%s exports the main entry's objects",
  (_name, entry) => {
    expect(Object.keys(entry).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(entry)) {
      expect(value).toBe(main[key]);
    }
  },
);

test("no export is in two packages", () => {
  const seen = new Map();
  for (const [name, entry] of Object.entries(ENTRIES)) {
    for (const key of Object.keys(entry)) {
      expect([key, seen.get(key)]).toEqual([key, undefined]);
      seen.set(key, name);
    }
  }
});

test("the packages cover the pipeline, connectors, evaluation and guardrails", () => {
  expect(ENTRIES.core.createRagPipeline).toBe(main.createRagPipeline);
  expect(ENTRIES.connectors.AnthropicConnector).toBe(main.AnthropicConnector);
  expect(ENTRIES.eval.computeFaithfulness).toBe(main.computeFaithfulness);
  expect(ENTRIES.guardrails.detectInjection).toBe(main.detectInjection);
});
