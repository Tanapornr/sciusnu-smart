// ================================================================
// lib/auth.js — JWT helpers + Express middleware
// FIX: Vulnerability 1 (client-side-only auth) and
//      Vulnerability 2 (role escalation via API abuse)
// ================================================================
require("dotenv").config();
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  console.error("[auth] FATAL: JWT_SECRET is missing or too short (need ≥ 32 chars).");
  process.exit(1);
}

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

/**
 * Sign a short-lived JWT embedding the user's verified role.
 * The role here comes from the database/sheet, not from the client.
 */
function signToken(payload) {
  // payload: { email, role, name, studentId }
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

/**
 * Verify a token and return the decoded payload, or null on failure.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

/**
 * Express middleware — requires a valid Bearer token.
 * Attaches decoded payload to req.jwtUser.
 */
function requireAuth(req, res, next) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    return res.status(200).end();
  }
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ status: "error", message: "ไม่ได้รับสิทธิ์: ต้องระบุ Token" });
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ status: "error", message: "Token ไม่ถูกต้องหรือหมดอายุ" });
  }
  if (req.app?.revokedTokens?.has(token)) {
    return res.status(401).json({ status: "error", message: "Session ได้ออกจากระบบแล้ว" });
  }
  req.jwtUser = decoded;
  next();
}

/**
 * Middleware factory — requires auth AND one of the allowed roles.
 * Roles are sourced from the JWT (server-signed), never from req.body.
 */
function requireRole(...allowedRoles) {
  return [
    requireAuth,
    (req, res, next) => {
      if (!allowedRoles.includes(req.jwtUser.role)) {
        return res.status(403).json({
          status: "error",
          message: "ไม่มีสิทธิ์: บทบาทของคุณไม่อนุญาตให้ดำเนินการนี้",
        });
      }
      next();
    },
  ];
}

module.exports = { signToken, verifyToken, requireAuth, requireRole };
