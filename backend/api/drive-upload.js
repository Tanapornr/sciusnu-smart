require("dotenv").config();
const { uploadFileToDrive } = require("../lib/drive");
const { requireAuth } = require("../lib/auth");

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const fileName = decodeURIComponent(String(req.headers["x-file-name"] || ""));
    const mimeType = String(req.headers["x-file-type"] || "application/octet-stream");
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");

    if (!fileName) {
      return res.status(400).json({ status: "error", message: "fileName required" });
    }
    if (!buffer.length) {
      return res.status(400).json({ status: "error", message: "file body required" });
    }

    const file = await uploadFileToDrive({
      fileName,
      mimeType,
      buffer,
      folderId: process.env.DRIVE_FOLDER_ID,
    });

    return res.json({
      status: "success",
      id: file.id,
      webViewLink: file.webViewLink,
    });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
}

module.exports = [requireAuth, handler];
