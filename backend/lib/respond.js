// ================================================================
// lib/respond.js  (new file)
// Standardized response helpers for all Express route handlers.
//
// Every response follows the same shape:
//   Success: { status: "success", ...data }
//   Error:   { status: "error",   message }
//
// USAGE:
//   const { ok, fail, guard } = require("../lib/respond");
//
//   // Wrap your handler with guard() to catch unhandled throws:
//   module.exports = [requireAuth, guard(async (req, res) => {
//     const rows = await getSheetValues("TEST_DEV", "A:U");
//     return ok(res, { rows });
//   })];
// ================================================================

/**
 * Send a success response.
 * @param {import("express").Response} res
 * @param {Object} data  - Extra fields merged into the response body
 */
function ok(res, data = {}) {
  return res.status(200).json({ status: "success", ...data });
}

/**
 * Send an error response.
 * @param {import("express").Response} res
 * @param {string} message
 * @param {number} statusCode  - HTTP status (default 400)
 */
function fail(res, message, statusCode = 400) {
  if (statusCode >= 500) {
    console.error("[error]", message);
  }
  return res.status(statusCode).json({ status: "error", message });
}

/**
 * Wrap an async route handler with a try/catch.
 * Any unhandled error returns a 500 with a generic message
 * (stack trace is never leaked to the client).
 *
 * @param {Function} handler  - async (req, res) => void
 * @returns {Function}
 */
function guard(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error("[unhandled]", err?.stack || err);
      // Do NOT send err.message — it may contain internal details
      return fail(res, "Internal server error", 500);
    }
  };
}

module.exports = { ok, fail, guard };
