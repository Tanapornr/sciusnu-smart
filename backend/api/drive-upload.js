// ================================================================
// api/drive-upload.js
//
// SSE-streamed chunked upload to Google Drive via Apps Script.
//
// Client-disconnect handling:
//   If the frontend drops (user closes tab, server restart, network
//   loss) while chunks are in flight, we call abortUpload so GAS
//   can trash the orphaned _chunk_* temp files in Drive root.
//   uploadFileToDrive() returns the sessionId/totalChunks it used
//   so we always have what we need to clean up.
// ================================================================
require("dotenv").config();
const { uploadFileToDrive, uploadChunk, finalizeUpload, abortUpload } = require("../lib/appsScript");
const { requireAuth }       = require("../lib/auth");
const { getAllSettings, getWindowStatus } = require("../lib/settings");

const WORK_TYPE_SETTING_KEY = {
  "โครงร่าง (Proposal)":     "submission_proposal",
  "รายงานความก้าวหน้า":      "submission_progress",
  "รายงานฉบับสมบูรณ์":       "submission_final",
};

async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    return res.status(200).end();
  }
  if (req.method !== "POST") return res.status(405).end();

  const action    = String(req.headers["x-action"] || "").trim();
  const fileName  = decodeURIComponent(String(req.headers["x-file-name"] || ""));
  const mimeType  = String(req.headers["x-file-type"] || "application/octet-stream");
  const workType  = decodeURIComponent(String(req.headers["x-work-type"] || "")).trim();
  const sessionId = String(req.headers["x-session-id"] || "");

  // ── Date-window guard ─────────────────────────────────────────────
  const checkWindow = async () => {
    const settingKey = WORK_TYPE_SETTING_KEY[workType];
    if (settingKey) {
      try {
        const settings = await getAllSettings();
        const { isOpen, hasLimit } = getWindowStatus(settings[settingKey]);
        if (hasLimit && !isOpen) {
          throw new Error(`ขณะนี้ไม่อยู่ในช่วงเวลาที่เปิดให้ส่ง "${workType}" — ไม่สามารถอัปโหลดไฟล์ได้`);
        }
      } catch (e) {
        if (e.message.includes("ไม่อยู่ในช่วงเวลา")) throw e;
        console.warn("[drive-upload] settings check failed, allowing upload:", e.message);
      }
    }
  };

  // ── Mode 1: Chunk Upload (client-driven chunk) ───────────────────
  if (action === "uploadChunk" || req.headers["x-chunk-index"] !== undefined) {
    const chunkIndex  = Number(req.headers["x-chunk-index"] || 0);
    const totalChunks = Number(req.headers["x-total-chunks"] || 1);

    if (chunkIndex === 0) {
      try { await checkWindow(); } catch (e) { return res.status(403).json({ status: "error", message: e.message }); }
    }

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
    if (!buffer.length) return res.status(400).json({ status: "error", message: "chunk body required" });

    try {
      await uploadChunk({
        sessionId,
        chunkIndex,
        totalChunks,
        chunkData: buffer.toString("base64"),
      });
      return res.json({ status: "success", chunkIndex });
    } catch (err) {
      return res.status(500).json({ status: "error", message: err.message });
    }
  }

  // ── Mode 2: Finalize Upload (assemble chunks in Drive) ───────────
  if (action === "finalize") {
    const totalChunks = Number(req.headers["x-total-chunks"] || 1);
    if (!fileName) return res.status(400).json({ status: "error", message: "fileName required" });

    try {
      const result = await finalizeUpload({
        sessionId,
        totalChunks,
        fileName,
        mimeType,
        folderId: process.env.DRIVE_FOLDER_ID,
      });
      return res.json({ status: "success", id: result.id, webViewLink: result.webViewLink });
    } catch (err) {
      return res.status(500).json({ status: "error", message: err.message });
    }
  }

  // ── Mode 3: Legacy Single-shot Upload (SSE Stream) ───────────────
  const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
  if (!fileName) return res.status(400).json({ status: "error", message: "fileName required" });
  if (!buffer.length) return res.status(400).json({ status: "error", message: "file body required" });

  try { await checkWindow(); } catch (e) { return res.status(403).json({ status: "error", message: e.message }); }

  // ── Open SSE stream ──────────────────────────────────────────────
  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache");
  res.setHeader("Connection",        "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();


  const send = (obj) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
    if (typeof res.flush === "function") res.flush();
  };

  // Track session info so we can abort if the client disconnects
  let activeSession = null; // { sessionId, totalChunks }
  let uploadDone    = false;

  // ── Client-disconnect handler ────────────────────────────────────
  // Fires when the browser closes the connection (tab close, navigate
  // away, network drop, or server restart killing the socket).
  const onClose = () => {
    if (uploadDone || !activeSession) return;
    const { sessionId, totalChunks } = activeSession;
    console.warn(`[drive-upload] client disconnected mid-upload — aborting session ${sessionId}`);
    // Fire-and-forget: best effort cleanup of orphaned chunk files
    const { callRelayForCleanup } = require("../lib/drive");
    callRelayForCleanup({ action: "abortUpload", sessionId, totalChunks })
      .catch((e) => console.error("[drive-upload] abortUpload after disconnect failed:", e.message));
  };

  req.on("close", onClose);

  try {
    const file = await uploadFileToDrive({
      fileName,
      mimeType,
      buffer,
      folderId:         process.env.DRIVE_FOLDER_ID,
      onProgress:       send,
      onSessionStart:   (s) => { activeSession = s; }, // ← called as soon as sessionId is known
    });

    uploadDone = true;
    send({ type: "done", id: file.id, webViewLink: file.webViewLink });
  } catch (e) {
    uploadDone = true; // don't double-abort — uploadFileToDrive already called abortUpload on error
    send({ type: "error", message: e.message });
  } finally {
    req.off("close", onClose);
    res.end();
  }
}

module.exports = [requireAuth, handler];