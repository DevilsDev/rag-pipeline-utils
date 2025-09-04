// Quick test of registry fix
const { registry } = require("./src/core/plugin-registry.js");
console.log("Registry type:", typeof registry);
console.log("Registry.get type:", typeof registry.get);
console.log("Test passed:", typeof registry.get === "function");
