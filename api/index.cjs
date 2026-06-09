// ================================================================
// api/index.cjs — Vercel Serverless Function entry point
//
// .cjs extension forces CommonJS regardless of root "type":"module".
// backend/ has its own package.json with "type":"commonjs" so all
// require() calls inside backend/ resolve correctly via __dirname.
// ================================================================

const path = require("path");
const app  = require(path.join(__dirname, "..", "backend", "server.js"));

// Vercel expects the Express app exported directly.
// Express apps are valid request handlers: (req, res) => void
module.exports = app;
