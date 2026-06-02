// ================================================================
// api/profile.js — Student profile update
// FIX Vuln 1: Protected by auth; email from JWT, not request body.
// ================================================================
require("dotenv").config();
const { getSheetValues, updateCell } = require("../lib/sheets");
const { requireAuth }                = require("../lib/auth");

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { oldPassword, newPassword, phone, profileUrl } = req.body;

    // Email always comes from the JWT — never trust client-supplied email
    const email = req.jwtUser.email;

    const rows     = await getSheetValues("Sheet1");
    const emailIdx = 0, passIdx = 18, phoneIdx = 19, picIdx = 20;

    let found = false;
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][emailIdx] || "").trim().toLowerCase() === email.toLowerCase()) {
        if (newPassword) {
          if ((rows[i][passIdx] || "").trim() !== String(oldPassword).trim()) {
            return res.status(400).json({ status: "error",
              message: "รหัสผ่านเดิมไม่ถูกต้อง กรุณาลองใหม่" });
          }
          await updateCell("Sheet1", i + 1, passIdx + 1, + newPassword);
        }
        if (phone)      await updateCell("Sheet1", i + 1, phoneIdx + 1, "'" + phone);
        if (profileUrl) await updateCell("Sheet1", i + 1, picIdx   + 1, profileUrl);
        found = true;
        break;
      }
    }

    if (!found) return res.status(404).json({ status: "error", message: "ไม่พบอีเมลนี้ในระบบ" });
    return res.json({ status: "success", profileUrl: profileUrl || "" });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
}

module.exports = [requireAuth, handler];
