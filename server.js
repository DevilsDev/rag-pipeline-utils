/**
 * Version: 0.1.0
 * Path: /server.js
 * Description: Local static server for serving evaluation dashboard
 * Author: Ali Kahwaji
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Serve evaluation results statically
app.use("/results", express.static(path.join(__dirname, "__tests__/fixtures")));

// Serve public frontend assets
app.use(express.static(path.join(__dirname, "public")));

// Fallback to index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.listen(port, () => {
  console.log(` Dashboard running at http://localhost:${port}`);
});
