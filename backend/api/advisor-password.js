require("dotenv").config();
const { getSheetValues, updateCell } = require("../lib/sheets");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { role, email, oldPassword, newPassword } = req.body;

    let emailCol, passCol;
    if (role === "advisor_main") { emailCol = 8;  passCol = 21; }
    else if (role === "advisor") { emailCol = 12; passCol = 22; }
    else return res.status(400).json({ status: "error", message: "สถานะอาจารย์ไม่ถูกต้อง" });

    const rows = await getSheetValues("Sheet1");
    let found = false;

    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][emailCol] || "").trim().toLowerCase() === email.toLowerCase()) {
        if ((rows[i][passCol] || "").trim() !== String(oldPassword).trim()) {
          return res.status(400).json({ status: "error", message: "รหัสผ่านเดิมไม่ถูกต้อง" });
        }
        await updateCell("Sheet1", i + 1, passCol + 1, "'" + newPassword);
        found = true;
      }
    }

    if (!found) return res.status(404).json({ status: "error", message: "ไม่พบอีเมลนี้ในระบบ" });
    return res.json({ status: "success" });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
};