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
const { uploadFileToDrive } = require("../lib/drive");
const { requireAuth }       = require("../lib/auth");
const { getAllSettings, getWindowStatus } = require("../lib/settings");

const WORK_TYPE_SETTING_KEY = {
  "โครงร่าง (Proposal)":     "submission_proposal",
  "รายงานความก้าวหน้า":      "submission_progress",
  "รายงานฉบับสมบูรณ์":       "submission_final",
};

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const fileName = decodeURIComponent(String(req.headers["x-file-name"] || ""));
  const mimeType = String(req.headers["x-file-type"] || "application/octet-stream");
  const workType = decodeURIComponent(String(req.headers["x-work-type"] || "")).trim();
  const buffer   = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");

  if (!fileName) return res.status(400).json({ status: "error", message: "fileName required" });
  if (!buffer.length) return res.status(400).json({ status: "error", message: "file body required" });

  // ── Date-window guard (server clock — not affected by client-side
  // clock manipulation). Blocks ALL report uploads (including resubmits
  // of rejected work) once the submission window has closed.
  const settingKey = WORK_TYPE_SETTING_KEY[workType];
  if (settingKey) {
    try {
      const settings = await getAllSettings();
      const { isOpen, hasLimit } = getWindowStatus(settings[settingKey]);
      if (hasLimit && !isOpen) {
        return res.status(403).json({
          status: "error",
          message: `ขณะนี้ไม่อยู่ในช่วงเวลาที่เปิดให้ส่ง "${workType}" — ไม่สามารถอัปโหลดไฟล์ได้`,
        });
      }
    } catch (e) {
      console.warn("[drive-upload] settings check failed, allowing upload:", e.message);
    }
  }

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