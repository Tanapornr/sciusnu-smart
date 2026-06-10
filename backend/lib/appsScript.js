// ================================================================
// lib/appsScript.js
// Apps Script relay — true sequential chunked upload.
//
// For small files (≤ CHUNK_BYTES): single "uploadFile" call (unchanged).
// For large files (> CHUNK_BYTES): three-phase protocol:
//   1. "uploadChunk" × N  — send each chunk individually, GAS caches them
//   2. "finalizeUpload"   — GAS joins all chunks, writes to Drive, returns id/url
//   3. On any error:  "abortUpload" — GAS clears the cache session
//
// This avoids sending a huge JSON body in one shot, which causes GAS
// to run out of memory or hit the UrlFetchApp 50 MB request limit.
//
// Env vars required:
//   APPS_SCRIPT_URL    — Web App deployment URL
//   APPS_SCRIPT_SECRET — shared secret (DRIVE_RELAY_SECRET in Script Props)
// ================================================================

const RELAY_URL    = process.env.APPS_SCRIPT_URL;
const RELAY_SECRET = process.env.APPS_SCRIPT_SECRET;

// 1 MB of raw bytes → ~1.33 MB base64. Keep well under GAS 6 MB POST cap.
const CHUNK_BYTES = 1 * 1024 * 1024; // 1 MB per chunk

// ── Internal fetch helper ────────────────────────────────────────

async function callRelay(payload) {
  if (!RELAY_URL) throw new Error("APPS_SCRIPT_URL is not configured");

  const res = await fetch(RELAY_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ ...payload, secret: RELAY_SECRET }),
    redirect: "follow",
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (_) {
    throw new Error(`Apps Script returned non-JSON: ${text.slice(0, 300)}`);
  }

  if (json.status !== "success") {
    throw new Error(`Apps Script error: ${json.message || JSON.stringify(json)}`);
  }

  return json;
}

// ================================================================
// uploadFileToDrive
// ================================================================
async function uploadFileToDrive({ fileName, mimeType, buffer, folderId }) {
  // ── Small file: single shot ───────────────────────────────────
  if (buffer.length <= CHUNK_BYTES) {
    const result = await callRelay({
      action:     "uploadFile",
      fileName,
      mimeType,
      base64Data: buffer.toString("base64"),
      folderId,
    });
    return { id: result.id, webViewLink: result.webViewLink };
  }

  // ── Large file: chunked upload ────────────────────────────────
  const base64Full = buffer.toString("base64");

  // Split base64 string into chunks
  const chunkB64Len = Math.ceil(CHUNK_BYTES * 4 / 3); // base64 chars per chunk
  const chunks = [];
  for (let offset = 0; offset < base64Full.length; offset += chunkB64Len) {
    chunks.push(base64Full.slice(offset, offset + chunkB64Len));
  }

  const totalChunks = chunks.length;
  // Generate a random session ID so GAS can namespace its cache keys
  const sessionId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  console.log(`[appsScript] chunked upload — ${totalChunks} chunks, sessionId=${sessionId}`);

  // Phase 1: send each chunk individually
  for (let i = 0; i < chunks.length; i++) {
    await callRelay({
      action:      "uploadChunk",
      sessionId,
      chunkIndex:  i,
      totalChunks,
      chunkData:   chunks[i],
    });
    console.log(`[appsScript] chunk ${i + 1}/${totalChunks} sent`);
  }

  // Phase 2: finalize — GAS joins chunks and writes to Drive
  let result;
  try {
    result = await callRelay({
      action:      "finalizeUpload",
      sessionId,
      totalChunks,
      fileName,
      mimeType,
      folderId,
    });
  } catch (err) {
    // Best-effort cleanup
    try { await callRelay({ action: "abortUpload", sessionId, totalChunks }); } catch (_) {}
    throw err;
  }

  return { id: result.id, webViewLink: result.webViewLink };
}

// ================================================================
// getResumableUploadUrl — kept for compatibility, not used
// ================================================================
async function getResumableUploadUrl() {
  throw new Error(
    "getResumableUploadUrl is not supported. Use POST /api/drive-upload instead."
  );
}

// ================================================================
// trashFile
// ================================================================
async function trashFile(fileId) {
  if (!fileId) return;
  try {
    await callRelay({ action: "trashFile", fileId });
  } catch (err) {
    console.error("[appsScript] trashFile failed:", err.message);
  }
}

// ── extractFileId ─────────────────────────────────────────────────
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
