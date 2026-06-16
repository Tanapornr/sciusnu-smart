// ================================================================
// api/auth.js — Login endpoint
// FIX Vuln 1: Issues a signed JWT so the client cannot forge a role.
// FIX Vuln 7: Rate limiting is applied in server.js before this runs.
// ================================================================
require("dotenv").config();
const { getSheetValues } = require("../lib/sheets");
const { signToken }      = require("../lib/auth");
const GS_MAIN_TABLE_NAME = process.env.GS_MAIN_TABLE_NAME;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const user = String(req.body.username || req.body.email || "").trim().toLowerCase();
    const pass = String(req.body.password || "").trim();

    if (!user || !pass) {
      return res.status(400).json({ status: "error", message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    // ── Admin hardcoded credential ───────────────────────────────
    const ADMIN_USER = String(process.env.ADMIN_USERNAME || "admin").toLowerCase();
    const ADMIN_PASS = String(process.env.ADMIN_PASSWORD || "sciusnu").trim();
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      const token = signToken({ email: "admin", role: "admin", name: "Administrator", studentId: "" });
      return res.json({
        status: "success", role: "admin", email: "admin",
        name: "Administrator", studentId: "", profileUrl: "",
        token,
      });
    }

    const data = await getSheetValues(GS_MAIN_TABLE_NAME);

    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      const stuId       = (r[1]  || "").toLowerCase();
      const stuEmail    = (r[0]  || "").toLowerCase();
      const stuPass     = (r[18] || "").trim();
      const advEmail    = (r[8]  || "").toLowerCase();
      const advPass     = (r[21] || "").trim();
      const coAdvEmail  = (r[12] || "").toLowerCase();
      const coAdvPass   = (r[22] || "").trim();
      const schAdvEmail = (r[15] || "").toLowerCase();
      const schAdvPass  = (r[23] || "").trim();

      if ((stuId === user || stuEmail === user) && stuPass === pass && stuId) {
        const token = signToken({ email: r[0], role: "student", name: `${r[2]} ${r[3]}`, studentId: r[1] });
        return res.json({
          status: "success", role: "student",
          email: r[0], name: `${r[2]} ${r[3]}`, studentId: r[1], profileUrl: r[20] || "",
          token,
        });
      }
      if (advEmail === user && advPass === pass && advEmail) {
        const token = signToken({ email: r[8], role: "advisor_main", name: r[9], studentId: "" });
        return res.json({
          status: "success", role: "advisor_main",
          email: r[8], name: r[9], studentId: "", profileUrl: "",
          token,
        });
      }
      if (coAdvEmail === user && coAdvPass === pass && coAdvEmail) {
        const token = signToken({ email: r[12], role: "advisor", name: r[13], studentId: "" });
        return res.json({
          status: "success", role: "advisor",
          email: r[12], name: r[13], studentId: "", profileUrl: "",
          token,
        });
      }
      if (schAdvEmail === user && schAdvPass === pass && schAdvEmail) {
        const token = signToken({ email: r[15], role: "school_advisor", name: r[16], studentId: "" });
        return res.json({
          status: "success", role: "viewer",
          email: r[15], name: r[16], studentId: "", profileUrl: "",
          token,
        });
      }
    }

    return res.status(401).json({ status: "error", message: "ข้อมูลผู้ใช้งาน หรือ รหัสผ่าน ไม่ถูกต้องครับ" });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
};
