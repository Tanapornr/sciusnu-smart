// ================================================================
// api/drive-upload-token.js
//
// Issues a short-lived, single-use upload token.
// The frontend uses this token to POST a file directly to the
// Apps Script Web App — the backend never sees the file bytes.
//
// Token shape (JWT, signed with UPLOAD_TOKEN_SECRET):
//   { sub: studentId, purpose: "drive-upload", jti: <uuid>, iat, exp }
//
// Security properties:
//   - Signed: Apps Script verifies HMAC-SHA256 signature
//   - Short-lived: 5-minute expiry
//   - Single-use: jti is stored in Apps Script CacheService; after
//     first use the jti is consumed and any replay is rejected
//   - Role-gated: only authenticated students can get a token
// ================================================================

require("dotenv").config();
const jwt           = require("jsonwebtoken");
const { randomUUID }  = require("crypto"); // built-in Node 16+ — no extra dependency
const { requireRole } = require("../lib/auth");

const UPLOAD_TOKEN_SECRET = process.env.UPLOAD_TOKEN_SECRET;
const UPLOAD_TOKEN_TTL    = 5 * 60; // 5 minutes in seconds

async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    return res.status(200).end();
  }
  if (req.method !== "POST") return res.status(405).end();

  if (!UPLOAD_TOKEN_SECRET || UPLOAD_TOKEN_SECRET.length < 32) {
    console.error("[drive-upload-token] UPLOAD_TOKEN_SECRET missing or too short");
    return res.status(500).json({ status: "error", message: "Server misconfiguration" });
  }

  const { fileName, mimeType, folderId } = req.body || {};

  if (!fileName || typeof fileName !== "string") {
    return res.status(400).json({ status: "error", message: "fileName required" });
  }
  if (!mimeType || typeof mimeType !== "string") {
    return res.status(400).json({ status: "error", message: "mimeType required" });
  }

  // Embed upload intent into the token so Apps Script can validate
  // the file name/type hasn't been tampered with by the client.
  const token = jwt.sign(
    {
      sub:      req.jwtUser.studentId || req.jwtUser.email, // set by requireRole middleware
      purpose:  "drive-upload",
      jti:      randomUUID(),    // unique ID — consumed on first use by GAS
      fileName,
      mimeType,
      folderId: folderId || process.env.DRIVE_FOLDER_ID || "",
    },
    UPLOAD_TOKEN_SECRET,
    { expiresIn: UPLOAD_TOKEN_TTL }
  );

  return res.json({
    status:          "success",
    uploadToken:     token,
    gasUrl:          process.env.APPS_SCRIPT_URL,
    expiresInSeconds: UPLOAD_TOKEN_TTL,
  });
}

// Only authenticated students (or admin) may request upload tokens
module.exports = [...requireRole("student", "admin"), handler];