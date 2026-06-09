// ================================================================
// api/index.cjs — Vercel Serverless Function entry point
//
// All /api/* requests are routed here by vercel.json rewrites.
// This file boots the Express app (CommonJS) and exports the
// handler that Vercel's Node.js runtime expects.
// ================================================================

// Patch require() so that relative paths inside backend/ resolve
// correctly when Vercel runs this file from the /api/ directory.
const path = require("path");
const Module = require("module");

// All backend source lives at ../backend relative to this file
const BACKEND_ROOT = path.join(__dirname, "..", "backend");

// Override require so bare relative paths (e.g. require("../lib/auth"))
// inside backend files still work even when called from /api/index.cjs.
// We do this by making the Express app load itself — it uses __dirname
// internally so this is only needed for the initial bootstrap.
// (No monkey-patching required — Express uses its own __dirname.)

// ── Load the Express app ─────────────────────────────────────────
const app = require(path.join(BACKEND_ROOT, "server.js"));

// ── Export as Vercel handler ─────────────────────────────────────
module.exports = app;
