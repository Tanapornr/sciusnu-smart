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

const LEGACY_SERVICE_PREFIX = "/_/backend";

export default function handler(req, res) {
  // VITE_API_URL on the existing Vercel project still points to the former
  // Services prefix. Rewrites select this function but intentionally preserve
  // the incoming URL, so normalize that one legacy prefix before Express
  // performs route matching. Canonical /api/* requests remain unchanged.
  if (
    req.url === LEGACY_SERVICE_PREFIX ||
    req.url.startsWith(`${LEGACY_SERVICE_PREFIX}/`)
  ) {
    req.url = req.url.slice(LEGACY_SERVICE_PREFIX.length) || "/";
  }

  return app(req, res);
}
