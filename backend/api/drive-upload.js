// ================================================================
// api/drive-upload.js
//
// Uses Server-Sent Events (SSE) to stream real chunk progress
// back to the frontend while GAS processes each chunk.
//
// Event stream format:
//   data: {"type":"start","totalChunks":N}\n\n
//   data: {"type":"chunk","index":0,"total":N}\n\n
//   data: {"type":"chunk","index":1,"total":N}\n\n
//   ...
//   data: {"type":"finalize"}\n\n
//   data: {"type":"done","id":"...","webViewLink":"..."}\n\n
//   data: {"type":"error","message":"..."}\n\n        ← on failure
// ================================================================
require("dotenv").config();
const { uploadFileToDrive } = require("../lib/drive");
const { requireAuth }       = require("../lib/auth");

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const fileName = decodeURIComponent(String(req.headers["x-file-name"] || ""));
  const mimeType = String(req.headers["x-file-type"] || "application/octet-stream");
  const buffer   = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");

  if (!fileName) return res.status(400).json({ status: "error", message: "fileName required" });
  if (!buffer.length) return res.status(400).json({ status: "error", message: "file body required" });

  // ── Open SSE stream ──────────────────────────────────────────────
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering if present
  res.flushHeaders();

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
    // res.flush() exists when compression middleware is active; call if available
    if (typeof res.flush === "function") res.flush();
  };

  try {
    const file = await uploadFileToDrive({
      fileName,
      mimeType,
      buffer,
      folderId:   process.env.DRIVE_FOLDER_ID,
      onProgress: send,   // ← backend will call this for each chunk event
    });

    send({ type: "done", id: file.id, webViewLink: file.webViewLink });
  } catch (e) {
    send({ type: "error", message: e.message });
  } finally {
    res.end();
  }
}

module.exports = [requireAuth, handler];
