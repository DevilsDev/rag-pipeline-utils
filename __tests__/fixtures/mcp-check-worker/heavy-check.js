"use strict";

// with-thread-id.js, plus about 1 MB of heap kept for good after every
// check, as a cache that grows with each distinct source would. Lets the
// heap tests fill a worker's heap however little checkAnswer keeps.
const { parentPort } = require("worker_threads");

const kept = [];

// Registered before the real worker's listener, so the memory is counted
// in the heapUsed it reports for the same check
parentPort.on("message", () => {
  kept.push(new Array(128 * 1024).fill(kept.length + 0.5));
});
require("./with-thread-id");
