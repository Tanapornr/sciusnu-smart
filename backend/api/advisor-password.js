// ================================================================
// api/advisor-password.js — Advisor password change
// FIX Vuln 5: Backend verifies oldPassword; role from JWT only.
// FIX Vuln 1: requireRole ensures only advisors can call this.
// FIX: When advisor_main changes password, also update the co-advisor
//      password column (col 22) in any row where the same email
//      appears as co-advisor (col 12). This is needed because a main
//      advisor can appear as co-advisor in other projects.
// ================================================================
require("dotenv").config();
const { getSheetValues, updateCell } = require("../lib/sheets");
const { requireRole }                = require("../lib/auth");
const GS_MAIN_TABLE_NAME = process.env.GS_MAIN_TABLE_NAME;

// Column indices (0-based)
const COL_ADV_EMAIL    = 8;   // main advisor email
const COL_ADV_PASS     = 21;  // main advisor password
const COL_COADV_EMAIL  = 12;  // co-advisor email
const COL_COADV_PASS   = 22;  // co-advisor password
const COL_VIEWER_EMAIL = 15;  // viewer email
const COL_VIEWER_PASS  = 23;  // viewer password

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
    if (role === "advisor_main")   { emailCol = COL_ADV_EMAIL;    passCol = COL_ADV_PASS; }
    else if (role === "advisor")   { emailCol = COL_COADV_EMAIL;  passCol = COL_COADV_PASS; }
    else if (role === "viewer")    { emailCol = COL_VIEWER_EMAIL; passCol = COL_VIEWER_PASS; }
    else return res.status(403).json({ status: "error", message: "สถานะอาจารย์ไม่ถูกต้อง" });

    const rows = await getSheetValues(GS_MAIN_TABLE_NAME);
    let found = false;

    for (let i = 1; i < rows.length; i++) {
      const rowEmail = (rows[i][emailCol] || "").trim().toLowerCase();
      if (rowEmail !== email.toLowerCase()) continue;

      // Verify old password only on the first matching row (all rows share the same password)
      if (!found) {
        if ((rows[i][passCol] || "").trim() !== String(oldPassword).trim()) {
          return res.status(400).json({ status: "error", message: "รหัสผ่านเดิมไม่ถูกต้อง" });
        }
      }

      // Update the primary password column for this role
      await updateCell(GS_MAIN_TABLE_NAME, i + 1, passCol + 1, "'" + newPassword);
      found = true;
    }

    // ── Extra step for advisor_main only ─────────────────────────
    // A main advisor may also appear as co-advisor in other projects.
    // Those rows have the same person's email in col 12 (co-advisor email)
    // with their password stored in col 22 (co-advisor password).
    // We must keep both columns in sync so the advisor can still log in
    // no matter which project row is matched first.
    if (role === "advisor_main") {
      for (let i = 1; i < rows.length; i++) {
        const coAdvEmail = (rows[i][COL_COADV_EMAIL] || "").trim().toLowerCase();
        if (coAdvEmail !== email.toLowerCase()) continue;

        await updateCell(GS_MAIN_TABLE_NAME, i + 1, COL_COADV_PASS + 1, "'" + newPassword);
      }
    }

    if (!found) return res.status(404).json({ status: "error", message: "ไม่พบอีเมลนี้ในระบบ" });
    return res.json({ status: "success" });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
}

module.exports = [...requireRole("advisor_main", "advisor", "viewer"), handler];