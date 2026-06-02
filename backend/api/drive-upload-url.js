// FIX Vuln 1: Only authenticated users may get a Drive upload URL.
require("dotenv").config();
const { getResumableUploadUrl } = require("../lib/drive");
const { requireAuth }           = require("../lib/auth");

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { fileName, mimeType } = req.body;
    if (!fileName || !mimeType) {
      return res.status(400).json({ status: "error", message: "fileName and mimeType required" });
    }
    const uploadUrl = await getResumableUploadUrl({
      fileName,
      mimeType,
      folderId: process.env.DRIVE_FOLDER_ID,
    });
    return res.json({ status: "success", uploadUrl });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
}

module.exports = [requireAuth, handler];
