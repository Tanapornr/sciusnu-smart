require("dotenv").config();
const { getSheetValues } = require("../lib/sheets");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const user = String(req.body.username || req.body.email || "").trim().toLowerCase();
    const pass = String(req.body.password || "").trim();

    if (user === "admin" && pass === "sciusnu") {
      return res.json({ status: "success", role: "admin", email: "admin",
                        name: "Administrator", studentId: "", profileUrl: "" });
    }

    const data = await getSheetValues("Sheet1"); // ← adjust tab name if different

    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      const stuId      = (r[1]  || "").toLowerCase();
      const stuEmail   = (r[0]  || "").toLowerCase();
      const stuPass    = (r[18] || "").trim();
      const advEmail   = (r[8]  || "").toLowerCase();
      const advPass    = (r[21] || "").trim();
      const coAdvEmail = (r[12] || "").toLowerCase();
      const coAdvPass  = (r[22] || "").trim();
      const schAdvEmail= (r[15] || "").toLowerCase();
      const schAdvPass = (r[23] || "").trim();

      if ((stuId === user || stuEmail === user) && stuPass === pass && stuId) {
        return res.json({ status: "success", role: "student",
          email: r[0], name: `${r[2]} ${r[3]}`, studentId: r[1], profileUrl: r[20] || "" });
      }
      if (advEmail === user && advPass === pass && advEmail) {
        return res.json({ status: "success", role: "advisor_main",
          email: r[8], name: r[9], studentId: "", profileUrl: "" });
      }
      if (coAdvEmail === user && coAdvPass === pass && coAdvEmail) {
        return res.json({ status: "success", role: "advisor",
          email: r[12], name: r[13], studentId: "", profileUrl: "" });
      }
      if (schAdvEmail === user && schAdvPass === pass && schAdvEmail) {
        return res.json({ status: "success", role: "advisor",
          email: r[15], name: r[16], studentId: "", profileUrl: "" });
      }
    }

    return res.status(401).json({ status: "error",
      message: "ข้อมูลผู้ใช้งาน หรือ รหัสผ่าน ไม่ถูกต้องครับ" });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
};