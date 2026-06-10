// ================================================================
// lib/appsScript.js
// Apps Script relay — sequential chunked upload with SSE progress.
//
// onProgress(event)    — SSE events for the frontend
// onSessionStart({sessionId, totalChunks}) — called as soon as the
//   session is created so the HTTP handler can abort on disconnect
// ================================================================

const RELAY_URL    = process.env.APPS_SCRIPT_URL;
const RELAY_SECRET = process.env.APPS_SCRIPT_SECRET;

const CHUNK_BYTES         = 1 * 1024 * 1024; // 1 MB raw per chunk
const GAS_CALL_TIMEOUT_MS = 90_000;           // 90 s per individual GAS call

// ── callRelay ────────────────────────────────────────────────────
async function callRelay(payload) {
  if (!RELAY_URL) throw new Error("APPS_SCRIPT_URL is not configured");

  const signal = AbortSignal.timeout(GAS_CALL_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(RELAY_URL, {
      method:   "POST",
      headers:  { "Content-Type": "application/json" },
      body:     JSON.stringify({ ...payload, secret: RELAY_SECRET }),
      redirect: "follow",
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      throw new Error(`Apps Script call timed out after ${GAS_CALL_TIMEOUT_MS / 1000}s (action=${payload.action})`);
    }
    throw err;
  }

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

// ── callRelayForCleanup ──────────────────────────────────────────
// Same as callRelay but never throws — used for best-effort cleanup
// (abort on disconnect) where we don't want to mask the original error.
async function callRelayForCleanup(payload) {
  try { await callRelay(payload); } catch (_) {}
}

// ================================================================
// uploadFileToDrive
// ================================================================
async function uploadFileToDrive({ fileName, mimeType, buffer, folderId, onProgress, onSessionStart }) {
  const emit        = onProgress    || (() => {});
  const emitSession = onSessionStart || (() => {});

  // ── Small file: single shot ──────────────────────────────────────
  if (buffer.length <= CHUNK_BYTES) {
    emit({ type: "start", totalChunks: 1 });
    const result = await callRelay({
      action:     "uploadFile",
      fileName,
      mimeType,
      base64Data: buffer.toString("base64"),
      folderId,
    });
    emit({ type: "chunk", index: 0, total: 1 });
    return { id: result.id, webViewLink: result.webViewLink };
  }

  // ── Large file: chunked ──────────────────────────────────────────
  const base64Full  = buffer.toString("base64");
  const chunkB64Len = Math.ceil(CHUNK_BYTES * 4 / 3);
  const chunks      = [];
  for (let offset = 0; offset < base64Full.length; offset += chunkB64Len) {
    chunks.push(base64Full.slice(offset, offset + chunkB64Len));
  }

  const totalChunks = chunks.length;
  const sessionId   = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  console.log(`[appsScript] chunked upload — ${totalChunks} chunks, sessionId=${sessionId}`);

  // Tell the HTTP handler about this session immediately so it can
  // call abortUpload if the client disconnects before we finish
  emitSession({ sessionId, totalChunks });
  emit({ type: "start", totalChunks });

  // Phase 1: send chunks
  for (let i = 0; i < chunks.length; i++) {
    await callRelay({
      action:      "uploadChunk",
      sessionId,
      chunkIndex:  i,
      totalChunks,
      chunkData:   chunks[i],
    });
    console.log(`[appsScript] chunk ${i + 1}/${totalChunks} sent`);
    emit({ type: "chunk", index: i, total: totalChunks });
  }

  // Phase 2: finalize
  emit({ type: "finalize" });
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
    // Backend-side error: clean up orphaned temp files before re-throwing
    await callRelayForCleanup({ action: "abortUpload", sessionId, totalChunks });
    throw err;
  }

  return { id: result.id, webViewLink: result.webViewLink };
}

async function getResumableUploadUrl() {
  throw new Error("getResumableUploadUrl is not supported. Use POST /api/drive-upload instead.");
}

async function trashFile(fileId) {
  if (!fileId) return;
  await callRelayForCleanup({ action: "trashFile", fileId });
}

function extractFileId(url) {
  const match = String(url || "").match(/[-\w]{25,}/);
  return match ? match[0] : null;
}

module.exports = { uploadFileToDrive, callRelayForCleanup, getResumableUploadUrl, trashFile, extractFileId };
