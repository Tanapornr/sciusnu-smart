// ================================================================
// api/data.js — Data endpoint
// FIX Vuln 1: Protected by requireAuth; role comes from JWT.
// FIX Vuln 4: studentId is validated against authenticated identity.
// ================================================================
require("dotenv").config();
const { getSheetValues, ensureSubmissionsSheet } = require("../lib/sheets");
const { requireAuth } = require("../lib/auth");
const {
  rowsToObjects, getObjVal, normalizeSubmissionStatus,
  normalizeCompare, INITIAL_SUBMISSION_STATUS,
} = require("../lib/helpers");

async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  try {
    await ensureSubmissionsSheet();

    const projectRows = await getSheetValues("Sheet1");
    const subRows     = await getSheetValues("Submissions");

    // Strip all password columns before any further processing
    const projectData = rowsToObjects(projectRows).map((p) => {
      const copy = { ...p };
      delete copy["รหัสผ่าน"];
      delete copy["รหัสผ่าน อ.ที่ปรึกษา"];
      delete copy["รหัสผ่าน อ.ที่ปรึกษาร่วม"];
      delete copy["รหัสผ่าน อ.ที่ปรึกษาโรงเรียน"];
      return copy;
    });

    const submissionData = rowsToObjects(subRows).map((s) => {
      const copy  = { ...s };
      const wType = (copy["ประเภทงาน"] || "").trim();
      const stat  = normalizeSubmissionStatus(copy["สถานะ"]);
      copy["สถานะ"] = stat === INITIAL_SUBMISSION_STATUS ? "รอตรวจ" : stat;
      if (wType === "แบบคำร้อง" && stat === INITIAL_SUBMISSION_STATUS) {
        copy["อ.ที่ปรึกษา"] = "Admin Only";
      }
      return copy;
    });

    const { role, studentId: jwtStudentId } = req.jwtUser;

    // Admin and advisors get everything
    if (role === "admin" || role === "advisor_main" || role === "advisor" || role === "viewer") {
      return res.json({ status: "success", projects: projectData, submissions: submissionData });
    }

    // Students: ONLY return their own data — ignore any studentId in query string;
    // always use the authenticated student ID from the JWT.
    if (role === "student") {
      const reqNorm = normalizeCompare(jwtStudentId);

      const myProject = projectData.find(
        (p) => normalizeCompare(getObjVal(p, ["รหัสนักเรียน", "studentid", "รหัสประจำตัว"])) === reqNorm
      );
      const myProjId     = myProject ? getObjVal(myProject, ["รหัสโครงงาน", "projectid"]) : "";
      const myProjIdNorm = normalizeCompare(myProjId);

      const outProjects = myProjIdNorm
        ? projectData.filter((p) => normalizeCompare(getObjVal(p, ["รหัสโครงงาน", "projectid"])) === myProjIdNorm)
        : myProject ? [myProject] : [];

      const outSubs = submissionData.filter((s) => {
        const rp = normalizeCompare(getObjVal(s, ["รหัสโครงงาน", "projectid"]));
        const rs = normalizeCompare(getObjVal(s, ["รหัสนักเรียน", "studentid", "รหัสประจำตัว"]));
        return (myProjIdNorm && rp === myProjIdNorm) || rs === reqNorm;
      });

      return res.json({ status: "success", projects: outProjects, submissions: outSubs });
    }

    return res.status(403).json({ status: "error", message: "ไม่มีสิทธิ์เข้าถึงข้อมูล" });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
}

// Wrap with auth middleware — role is verified from JWT, not query param
module.exports = [requireAuth, handler];
