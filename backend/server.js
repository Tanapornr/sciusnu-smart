// ================================================================
// server.js — Express entry point (updated with petition routes)
// ================================================================
require("dotenv").config();
const express     = require("express");
const cors        = require("cors");
const rateLimit   = require("express-rate-limit");
const { verifyToken } = require("./lib/auth");

const auth             = require("./api/auth");
const session          = require("./api/session");
const data             = require("./api/data");
const driveUploadToken = require("./api/drive-upload-token");
const driveUpload      = require("./api/drive-upload");
const submit           = require("./api/submit");
const status           = require("./api/status");
const profile          = require("./api/profile");
const advisorPassword  = require("./api/advisor-password");
const settings         = require("./api/settings");
const petitionsRouter  = require("./api/petitions"); // NEW

const app = express();

// ── CORS ──────────────────────────────────────────────────────────
const ALLOWED_ORIGIN = process.env.WEB_URL ? process.env.WEB_URL.replace(/\/$/, "") : "*";
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));

// ── Security headers ──────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  next();
});

app.use(express.json({ limit: "2mb" })); // increased for signature payloads
// Raw binary parser for /api/drive-upload (supports up to 25 MB files)
app.use("/api/drive-upload", express.raw({ type: "*/*", limit: "25mb" }));

// ── Token blocklist for logout ────────────────────────────────────
const revokedTokens = new Set();
app.revokedTokens = revokedTokens;

app.post("/api/logout", (req, res) => {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      revokedTokens.add(token);
      const ttl = (decoded.exp - Math.floor(Date.now() / 1000)) * 1000;
      if (ttl > 0) setTimeout(() => revokedTokens.delete(token), ttl);
    }
  }
  return res.json({ status: "success" });
});

// ── Rate limiting ─────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "error", message: "คำขอเข้าสู่ระบบมากเกินไป กรุณารอสักครู่แล้วลองใหม่" },
});

// ── Routes ────────────────────────────────────────────────────────
app.post("/api/auth",               loginLimiter, auth);
app.get( "/api/session",            ...(Array.isArray(session) ? session : [session]));
app.get( "/api/data",               ...(Array.isArray(data) ? data : [data]));
app.post("/api/drive-upload-token", ...(Array.isArray(driveUploadToken) ? driveUploadToken : [driveUploadToken]));
app.post("/api/drive-upload",       ...(Array.isArray(driveUpload)      ? driveUpload      : [driveUpload]));
app.post("/api/submit",             ...(Array.isArray(submit) ? submit : [submit]));
app.post("/api/status",             ...(Array.isArray(status) ? status : [status]));
app.post("/api/profile",            ...(Array.isArray(profile) ? profile : [profile]));
app.post("/api/advisor-password",   ...(Array.isArray(advisorPassword) ? advisorPassword : [advisorPassword]));
app.get( "/api/settings",           ...(Array.isArray(settings) ? settings : [settings]));
app.post("/api/settings",           ...(Array.isArray(settings) ? settings : [settings]));

// ── Petition routes (NEW) ─────────────────────────────────────────
app.use("/api/petitions", petitionsRouter);

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () =>
    console.log(`✅ Backend running on http://localhost:${PORT}`)
  );
}

module.exports = app;