// ================================================================
// lib/appsScript.js
// Apps Script relay — sequential chunked upload with SSE progress.
//
// uploadFileToDrive now accepts an onProgress(event) callback.
// Events emitted:
//   { type: "start",    totalChunks: N }
//   { type: "chunk",    index: i, total: N }   ← after each chunk ACK
//   { type: "finalize" }                        ← before finalizeUpload call
// ================================================================

const RELAY_URL    = process.env.APPS_SCRIPT_URL;
const RELAY_SECRET = process.env.APPS_SCRIPT_SECRET;

// 1 MB raw → ~1.33 MB base64, well under GAS 6 MB POST cap
const CHUNK_BYTES = 1 * 1024 * 1024;

// 90 s per GAS call — covers slow Drive writes on finalize.
// node-fetch v3 / native fetch both honour AbortSignal.timeout().
const GAS_CALL_TIMEOUT_MS = 90_000;

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

// ================================================================
// uploadFileToDrive
// onProgress(event) — called with SSE event objects (see top of file)
// ================================================================
async function uploadFileToDrive({ fileName, mimeType, buffer, folderId, onProgress }) {
  const emit = onProgress || (() => {});

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

  // ── Large file: chunked upload ────────────────────────────────────
  const base64Full  = buffer.toString("base64");
  const chunkB64Len = Math.ceil(CHUNK_BYTES * 4 / 3);
  const chunks      = [];
  for (let offset = 0; offset < base64Full.length; offset += chunkB64Len) {
    chunks.push(base64Full.slice(offset, offset + chunkB64Len));
  }

  const totalChunks = chunks.length;
  const sessionId   = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  console.log(`[appsScript] chunked upload — ${totalChunks} chunks, sessionId=${sessionId}`);
  emit({ type: "start", totalChunks });

  // Phase 1: send each chunk, emit progress after each ACK
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
    try { await callRelay({ action: "abortUpload", sessionId, totalChunks }); } catch (_) {}
    throw err;
  }

  return { id: result.id, webViewLink: result.webViewLink };
}

async function getResumableUploadUrl() {
  throw new Error("getResumableUploadUrl is not supported. Use POST /api/drive-upload instead.");
}

async function trashFile(fileId) {
  if (!fileId) return;
  try {
    await callRelay({ action: "trashFile", fileId });
  } catch (err) {
    console.error("[appsScript] trashFile failed:", err.message);
  }
}

function extractFileId(url) {
  const match = String(url || "").match(/[-\w]{25,}/);
  return match ? match[0] : null;
}

module.exports = { uploadFileToDrive, getResumableUploadUrl, trashFile, extractFileId };
