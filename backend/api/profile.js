// ================================================================
// api/profile.js — Student profile update
// FIX Vuln 1: Protected by auth; current email from JWT, not request body.
// Added: newEmail field so students can change their email address.
// ================================================================
require("dotenv").config();
const { getSheetValues, updateCell } = require("../lib/sheets");
const { requireAuth }                = require("../lib/auth");
const GS_MAIN_TABLE_NAME = process.env.GS_MAIN_TABLE_NAME;

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { oldPassword, newPassword, phone, profileUrl, newEmail } = req.body;

    // Current email always comes from the JWT — never trust client-supplied email
    const email = req.jwtUser.email;

    // Validate newEmail format if provided
    if (newEmail) {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(newEmail.trim())) {
        return res.status(400).json({ status: "error", message: "รูปแบบอีเมลไม่ถูกต้อง" });
      }
    }

    const rows     = await getSheetValues(GS_MAIN_TABLE_NAME);
    const emailIdx = 0, stuIdIdx = 1, passIdx = 18, phoneIdx = 19, picIdx = 20;

    // Check new email uniqueness across all rows (skip current user's row)
    if (newEmail && newEmail.trim().toLowerCase() !== email.toLowerCase()) {
      const taken = rows.slice(1).some(
        (r) => (r[emailIdx] || "").trim().toLowerCase() === newEmail.trim().toLowerCase()
      );
      if (taken) {
        return res.status(400).json({ status: "error", message: "อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น" });
      }
    }

    // Students are matched by studentId, never by email — a student who
    // hasn't set an email yet has email === "" in the JWT, and matching
    // on an empty string against the email column would silently land on
    // whichever row happens to also be blank, corrupting the wrong row.
    // studentId is always present for a student (login requires it), so
    // it's the reliable key. Non-student roles (advisor/viewer/admin)
    // have no studentId and are still matched by their login email.
    const myStudentId = String(req.jwtUser.studentId || "").trim().toLowerCase();
    const matchesMe = (row) => {
      if (req.jwtUser.role === "student" && myStudentId) {
        return (row[stuIdIdx] || "").trim().toLowerCase() === myStudentId;
      }
      return (row[emailIdx] || "").trim().toLowerCase() === email.toLowerCase();
    };

    let found = false;
    let updatedEmail = null;
    for (let i = 1; i < rows.length; i++) {
      if (matchesMe(rows[i])) {
        if (newPassword) {
          if ((rows[i][passIdx] || "").trim() !== String(oldPassword).trim()) {
            return res.status(400).json({ status: "error",
              message: "รหัสผ่านเดิมไม่ถูกต้อง กรุณาลองใหม่" });
          }
          await updateCell(GS_MAIN_TABLE_NAME, i + 1, passIdx + 1, "'" + newPassword);
        }
        if (phone)      await updateCell(GS_MAIN_TABLE_NAME, i + 1, phoneIdx + 1, "'" + phone);
        if (profileUrl) await updateCell(GS_MAIN_TABLE_NAME, i + 1, picIdx   + 1, profileUrl);
        if (newEmail && newEmail.trim().toLowerCase() !== email.toLowerCase()) {
          await updateCell(GS_MAIN_TABLE_NAME, i + 1, emailIdx + 1, newEmail.trim().toLowerCase());
          updatedEmail = newEmail.trim().toLowerCase();
        }
        found = true;
        break;
      }
    }

    if (!found) return res.status(404).json({ status: "error", message: "ไม่พบอีเมลนี้ในระบบ" });
    return res.json({ status: "success", profileUrl: profileUrl || "", newEmail: updatedEmail });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
}

module.exports = [requireAuth, handler];
