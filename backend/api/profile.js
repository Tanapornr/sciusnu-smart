require("dotenv").config();
const { getSheetValues, updateCell } = require("../lib/sheets");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const data = req.body;
    // { email, oldPassword?, newPassword?, phone?, profileUrl? }

    const rows   = await getSheetValues("Sheet1");
    const emailIdx = 0, passIdx = 18, phoneIdx = 19, picIdx = 20;

    let found = false;
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][emailIdx] || "").trim().toLowerCase() === data.email.toLowerCase()) {
        if (data.newPassword) {
          if ((rows[i][passIdx] || "").trim() !== String(data.oldPassword).trim()) {
            return res.status(400).json({ status: "error",
              message: "รหัสผ่านเดิมไม่ถูกต้อง กรุณาลองใหม่" });
          }
          await updateCell("Sheet1", i + 1, passIdx + 1, + data.newPassword);
        }
        if (data.phone)      await updateCell("Sheet1", i + 1, phoneIdx + 1, "'" + data.phone);
        if (data.profileUrl) await updateCell("Sheet1", i + 1, picIdx   + 1, data.profileUrl);
        found = true;
        break;
      }
    }

    if (!found) return res.status(404).json({ status: "error", message: "ไม่พบอีเมลนี้ในระบบ" });
    return res.json({ status: "success", profileUrl: data.profileUrl || "" });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
};