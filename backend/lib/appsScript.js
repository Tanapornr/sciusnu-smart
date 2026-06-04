// ================================================================
// lib/appsScript.js
// Replaces lib/drive.js (Service Account) with Apps Script relay calls.
// The Apps Script Web App runs as the @nu.ac.th owner, so Drive/Sheet
// operations inherit that account's permissions — no SA quota issues.
//
// Env vars required:
//   APPS_SCRIPT_URL        — Web App deployment URL
//   APPS_SCRIPT_SECRET     — shared secret (DRIVE_RELAY_SECRET in Script Props)
// ================================================================

const RELAY_URL    = process.env.APPS_SCRIPT_URL;
const RELAY_SECRET = process.env.APPS_SCRIPT_SECRET;

// Base64 chunk size: 3 MB of raw bytes → ~4 MB of base64 (safe under Apps Script 6 MB POST limit)
const CHUNK_BYTES = 3 * 1024 * 1024;

// ── Internal fetch helper ────────────────────────────────────────

async function callRelay(payload) {
  if (!RELAY_URL) throw new Error("APPS_SCRIPT_URL is not configured");

  const res = await fetch(RELAY_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ ...payload, secret: RELAY_SECRET }),
    // Apps Script follows its own redirect on POST — node-fetch handles it
    redirect: "follow",
  });

  // Apps Script always returns 200; read JSON body for actual status
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (_) {
    throw new Error(`Apps Script returned non-JSON: ${text.slice(0, 200)}`);
  }

  if (json.status !== "success") {
    throw new Error(`Apps Script error: ${json.message || JSON.stringify(json)}`);
  }

  return json;
}

// ================================================================
// uploadFileToDrive
// Drop-in replacement for the old lib/drive.js export of the same name.
//
// For files ≤ CHUNK_BYTES  → single-shot { base64Data }
// For files >  CHUNK_BYTES → chunked     { chunks: [] }
// Apps Script reassembles chunks before writing to Drive.
// ================================================================
async function uploadFileToDrive({ fileName, mimeType, buffer, folderId }) {
  const base64Full = buffer.toString("base64");

  // Split into chunks if the buffer exceeds the single-call threshold
  let payload;
  if (buffer.length > CHUNK_BYTES) {
    const chunks = [];
    for (let offset = 0; offset < base64Full.length; ) {
      // Each raw chunk of CHUNK_BYTES bytes → ceil(CHUNK_BYTES * 4/3) base64 chars
      const chunkBase64Len = Math.ceil(CHUNK_BYTES * 4 / 3);
      chunks.push(base64Full.slice(offset, offset + chunkBase64Len));
      offset += chunkBase64Len;
    }
    payload = { action: "uploadFile", fileName, mimeType, chunks, folderId };
  } else {
    payload = { action: "uploadFile", fileName, mimeType, base64Data: base64Full, folderId };
  }

  const result = await callRelay(payload);
  // Return shape matches old googleapis drive.files.create response
  return { id: result.id, webViewLink: result.webViewLink };
}

// ================================================================
// getResumableUploadUrl
// The old architecture generated a SA-signed resumable URL so the
// frontend could PUT directly to Drive.  That pattern is incompatible
// with Apps Script (no signed URLs).
//
// Replacement strategy: the backend receives the file and proxies it
// through uploadFileToDrive above.  This function is kept so callers
// don't break — but it throws to make the migration obvious.
// See api/drive-upload-url.js for the updated route.
// ================================================================
async function getResumableUploadUrl() {
  throw new Error(
    "getResumableUploadUrl is not supported in the Apps Script relay architecture. " +
    "Use POST /api/drive-upload instead (backend streams through Apps Script)."
  );
}

// ================================================================
// trashFile
// Drive files created by DriveApp belong to the @nu.ac.th owner.
// The only way to trash them is via another Apps Script call.
// We add a "trashFile" action to the relay for this.
// ================================================================
async function trashFile(fileId) {
  if (!fileId) return;
  try {
    await callRelay({ action: "trashFile", fileId });
  } catch (err) {
    // Non-fatal — log and continue (same behaviour as the old SA version)
    console.error("[appsScript] trashFile failed:", err.message);
  }
}

// ── extractFileId — unchanged helper (no SA dependency) ─────────
function extractFileId(url) {
  const match = String(url || "").match(/[-\w]{25,}/);
  return match ? match[0] : null;
}

module.exports = {
  uploadFileToDrive,
  getResumableUploadUrl,
  trashFile,
  extractFileId,
};