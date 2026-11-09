/**
 * TypeScript with moduleResolution "node10" ignores `exports` and reads
 * typesVersions, so every subpath with declarations needs an entry there.
 */
const path = require("path");
const pkg = require(path.join(__dirname, "../../../package.json"));

test("every typed export subpath has a typesVersions entry", () => {
  const typed = Object.entries(pkg.exports)
    .filter(([subpath, target]) => subpath !== "." && target && target.types)
    .map(([subpath, target]) => [subpath.slice(2), target.types]);
  expect(typed.length).toBeGreaterThan(0);
  for (const [name, types] of typed) {
    expect([name, pkg.typesVersions["*"][name]]).toEqual([
      name,
      [types.replace("./", "")],
    ]);
  }
});
