// __tests__/e2e/_debug-open-handles.js
// Enhanced handle dumper with WriteStream details
// Shows exact file paths and stream states

const dump = (label) => {
  // eslint-disable-next-line no-console
  console.log(`\n🧵 Open-handle dump (${label})`);

  const handles = process._getActiveHandles?.() || [];
  handles.forEach((h, i) => {
    const name = h?.constructor?.name || typeof h;
    // eslint-disable-next-line no-console
    console.log(` • [${i}] ${name}`);
    if (name === "WriteStream") {
      // eslint-disable-next-line no-console
      console.log("   path:", h.path);
      // eslint-disable-next-line no-console
      console.log("   closed:", h.closed, "destroyed:", h.destroyed);
      // eslint-disable-next-line no-console
      console.log("   pending writableLength:", h.writableLength);
      // eslint-disable-next-line no-console
      console.log("   bytesWritten:", h.bytesWritten);
    }
  });

  const reqs = process._getActiveRequests?.() || [];
  // eslint-disable-next-line no-console
  console.log("Requests:", reqs.length);
};

// Announce and dump right away
console.log("🔍 Debug handle monitoring active (immediate + 3s interval)");
dump("immediate");

// Start periodic dumping every 3 seconds (with unref to prevent keeping process alive)
const interval = setInterval(() => {
  dump("tick");
}, 3000);
interval.unref?.(); // don't keep the process alive

process.on("beforeExit", () => dump("beforeExit"));
