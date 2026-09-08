// ================================================================
// api/index.js — Stable Vercel Function entry point
//
// Keep the existing Express application in backend/server.js intact.
// This small adapter exposes it from Vercel's conventional root /api
// directory, so every /api/* request reaches the backend regardless of
// whether the Vercel project has the experimental Services mode enabled.
//
// backend/server.js remains CommonJS under backend/package.json. Node's ESM
// interop exposes its module.exports value as this default import.
// ================================================================

import app from "../backend/server.js";

export default app;
