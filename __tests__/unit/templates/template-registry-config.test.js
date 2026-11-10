/**
 * The built-in project templates write a .ragrc.json the CLI accepts and
 * depend on a version range of the library, not "latest".
 */
const {
  TemplateRegistry,
} = require("../../../src/templates/template-registry");
const { BUILT_INS } = require("../../../src/config/component-factory");
const { version } = require("../../../package.json");

const registry = new TemplateRegistry();
const keys = registry.list().map((t) => t.key);

describe.each(keys)("template %s", (key) => {
  const template = registry.get(key);

  test("names only built-in components in its pipeline config", () => {
    for (const [stage, name] of Object.entries(template.config.pipeline)) {
      expect([stage, name, Object.keys(BUILT_INS[stage] || {})]).toEqual([
        stage,
        name,
        expect.arrayContaining([name]),
      ]);
    }
  });

  test("depends on a range of the current version, not latest", () => {
    expect(template.dependencies["@devilsdev/rag-pipeline-utils"]).toBe(
      `^${version}`,
    );
  });
});
