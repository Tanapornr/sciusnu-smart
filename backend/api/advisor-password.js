// ================================================================
// api/advisor-password.js — Advisor password change
// FIX Vuln 5: Backend verifies oldPassword; role from JWT only.
// FIX Vuln 1: requireRole ensures only advisors can call this.
// ================================================================
require("dotenv").config();
const { getSheetValues, updateCell } = require("../lib/sheets");
const { requireRole }                = require("../lib/auth");
const GS_MAIN_TABLE_NAME = process.env.GS_MAIN_TABLE_NAME;

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ status: "error", message: "กรุณากรอกรหัสผ่านให้ครบถ้วน" });
    }

    // Role and email come from the verified JWT — never from req.body
    const role  = req.jwtUser.role;
    const email = req.jwtUser.email;

    let emailCol, passCol;
    if (role === "advisor_main")        { emailCol = 8;  passCol = 21; }
    else if (role === "advisor")        { emailCol = 12; passCol = 22; }
    else if (role === "school_advisor") { emailCol = 15; passCol = 23; }
    else return res.status(403).json({ status: "error", message: "สถานะอาจารย์ไม่ถูกต้อง" });

    const rows = await getSheetValues(GS_MAIN_TABLE_NAME);
    let found = false;

    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][emailCol] || "").trim().toLowerCase() === email.toLowerCase()) {
        if ((rows[i][passCol] || "").trim() !== String(oldPassword).trim()) {
          return res.status(400).json({ status: "error", message: "รหัสผ่านเดิมไม่ถูกต้อง" });
        }
        await updateCell(GS_MAIN_TABLE_NAME, i + 1, passCol + 1, "'" + newPassword);
        found = true;
      }
    }

    if (!found) return res.status(404).json({ status: "error", message: "ไม่พบอีเมลนี้ในระบบ" });
    return res.json({ status: "success" });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
}

module.exports = [...requireRole("advisor_main", "advisor", "school_advisor"), handler];
