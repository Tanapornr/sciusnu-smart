// ================================================================
// api/data.js  (patched)
// Changes:
//   1. getSheetValues("TEST_DEV", "A:U") — fetch only columns A–U
//      instead of the entire sheet. Adjust the range if you use
//      columns beyond U. Check your sheet's actual last column first.
//   2. Uses stripPasswordFields() from sheetModel instead of
//      manually deleting keys — one place to maintain the list.
//   3. Uses ok() / fail() / guard() for consistent response shape.
//   4. GAS relay errors (status:"error" in a 200 response) are now
//      surfaced as real errors by the updated apiFetch in the frontend.
// ================================================================
require("dotenv").config();
const { getSheetValues, ensureSubmissionsSheet } = require("../lib/sheets");
const { requireAuth }                            = require("../lib/auth");
const { ok, fail, guard }                        = require("../lib/respond");
const { stripPasswordFields }                    = require("../lib/sheetModel");
const {
  rowsToObjects,
  getObjVal,
  normalizeSubmissionStatus,
  normalizeCompare,
  INITIAL_SUBMISSION_STATUS,
} = require("../lib/helpers");

const handler = guard(async (req, res) => {
  if (req.method !== "GET") return fail(res, "Method not allowed", 405);

  await ensureSubmissionsSheet();

  // ── Partial fetch: only columns A–X (24 cols) for main project data.
  const projectRows = await getSheetValues("TEST_DEV", "A:X");
  const subRows     = await getSheetValues("Submissions");

  // Strip password columns using the central model (no Thai strings here)
  const projectData    = stripPasswordFields(rowsToObjects(projectRows));
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

  // Admin / advisor / viewer — return everything
  if (["admin", "advisor_main", "advisor", "viewer"].includes(role)) {
    return ok(res, { projects: projectData, submissions: submissionData });
  }

  // Student — ONLY their own data (identity comes from JWT, never query string)
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

    return ok(res, { projects: outProjects, submissions: outSubs });
  }

  return fail(res, "ไม่มีสิทธิ์เข้าถึงข้อมูล", 403);
});

module.exports = [requireAuth, handler];
