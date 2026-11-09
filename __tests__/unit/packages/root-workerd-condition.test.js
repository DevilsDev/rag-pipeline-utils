/**
 * Cloudflare's workerd resolver picks the "workerd" condition first; entries
 * that ship a CommonJS build need it to resolve to that build.
 */
const path = require("path");
const pkg = require(path.join(__dirname, "../../../package.json"));

test.each(["./experimental", "./testing"])(
  "%s resolves the workerd condition to its CommonJS build",
  (subpath) => {
    const entry = pkg.exports[subpath];
    expect(entry.workerd).toBe(entry.require);
    // Conditions are matched in order: workerd comes before require/import
    const order = Object.keys(entry);
    expect(order.indexOf("workerd")).toBeLessThan(order.indexOf("require"));
  },
);
