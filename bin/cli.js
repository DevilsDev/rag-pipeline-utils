#!/usr/bin/env node
"use strict";
require("../src/cli.js")
  .run(process.argv)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
