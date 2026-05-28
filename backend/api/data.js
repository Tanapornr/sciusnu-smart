require("dotenv").config();
const { getSheetValues, ensureSubmissionsSheet } = require("../lib/sheets");
const { rowsToObjects, getObjVal, normalizeSubmissionStatus,
        normalizeCompare, INITIAL_SUBMISSION_STATUS } = require("../lib/helpers");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).end();
  try {
    await ensureSubmissionsSheet();

    const projectRows = await getSheetValues("Sheet1");
    const subRows     = await getSheetValues("Submissions");

    // Strip password columns from project data
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

    const studentId = String(req.query.studentId || "").trim();
    if (!studentId) {
      return res.json({ status: "success", projects: projectData, submissions: submissionData });
    }

    const reqNorm = normalizeCompare(studentId);
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
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
};