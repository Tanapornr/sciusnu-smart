// ================================================================
// api/drive-upload-url.js  (refactored — Apps Script relay)
//
// The old pattern:  frontend → GET upload URL → PUT directly to Drive
// The new pattern:  frontend → POST /api/drive-upload (backend proxies)
//
// Resumable signed URLs require a Service Account access token that
// is authorized for the target Drive.  Since we removed the SA for
// write operations, this endpoint can no longer function as before.
//
// This file returns a clear 410 Gone so the frontend can be updated
// to use POST /api/drive-upload instead.
//
// If you want to keep a direct-to-Drive path (bypassing the backend)
// you would need to grant the SA write access on the @nu.ac.th Drive —
// which is exactly the permission problem we are bypassing.
// ================================================================

require("dotenv").config();
const { requireAuth } = require("../lib/auth");

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  return res.status(410).json({
    status:  "error",
    message:
      "Resumable Drive upload URLs are no longer supported. " +
      "POST the raw file to /api/drive-upload instead " +
      "(binary body, x-file-name and x-file-type headers).",
  });
}

module.exports = [requireAuth, handler];