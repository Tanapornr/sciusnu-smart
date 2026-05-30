const INITIAL_SUBMISSION_STATUS = "รออนุมัติ";

const ADMIN_EMAILS = [
  "suparinthona@nu.ac.th",
  "sujittrap@nu.ac.th",
  "phanupongc@nu.ac.th",
  "arunothaik@nu.ac.th",
];

function normalizeSubmissionStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (!s) return INITIAL_SUBMISSION_STATUS;
  if (s === "อนุมัติ" || s === "อนุมัติแล้ว" || s === "approved") return "อนุมัติ";
  if (["ไม่อนุมัติ", "แก้ไข", "rejected", "reject", "ต้องแก้ไข"].includes(s)) return "ไม่อนุมัติ";
  return INITIAL_SUBMISSION_STATUS;
}

function cleanAdvName(name) {
  if (!name) return "-";
  return String(name).replace(/^อ\.\s*/, "").replace(/,/g, "").trim();
}

function normalizeEmail(value) {
  const text = String(value || "").trim().toLowerCase();
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : text;
}

function normalizeName(value) {
  return String(value || "")
    .replace(/^อ\.\s*/, "")
    .replace(/ดร\./g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, "")
    .toLowerCase();
}

function normalizeCompare(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function isAdminReviewer(email, role) {
  const e = String(email || "").trim().toLowerCase();
  const r = String(role || "").trim();
  return r === "admin" || ADMIN_EMAILS.map((x) => x.toLowerCase()).includes(e);
}

function isMainAdvisorReviewer(groupInfo, email, role, reviewerName) {
  if (String(role || "").trim() === "admin") return true;
  const reviewerEmail = normalizeEmail(email);
  const mainAdvEmail  = normalizeEmail(groupInfo.advEmail);
  const loginName     = normalizeName(reviewerName);
  const mainAdvName   = normalizeName(groupInfo.advName);
  return (
    (reviewerEmail && mainAdvEmail  && reviewerEmail === mainAdvEmail) ||
    (loginName     && mainAdvName   && loginName === mainAdvName)
  );
}

function getPayloadReason(data) {
  return String(
    data.reason       ||
    data.note         ||
    data.comment      ||
    data.rejectReason ||
    data.previousReason   ||
    data.resubmitReason   ||
    data["หมายเหตุ"] ||
    data["เหตุผล"]   ||
    ""
  ).trim();
}

/**
 * displayData: 2D array from Sheets API (first row = headers)
 * Returns group metadata for a given student ID.
 */
function getGroupInfo(displayData, actingStudentId) {
  const empty = {
    members: [], targetProjId: "", projectNameTH: "",
    advEmail: "", advName: "", coAdvEmail: "", coAdvName: "",
    schAdvEmail: "", schAdvName: "",
  };
  if (!displayData?.length || !actingStudentId) return empty;

  // Default column indices (adjust if your sheet columns change)
  let colEmail = 0, colStuId = 1, colFName = 2, colLName = 3, colProj = 4;
  let colAdvEmail = 8, colAdvName = 9, colCoAdvEmail = 12, colCoAdvName = 13;
  let colSchAdvEmail = 15, colSchAdvName = 16, colProjNameTH = 17;

  const headers = displayData[0];
  const hProj = headers.findIndex((h) => String(h).includes("รหัสโครงงาน"));
  const hStu  = headers.findIndex((h) => String(h).includes("รหัสนักเรียน") || String(h).includes("รหัสประจำตัว"));
  if (hProj !== -1) colProj = hProj;
  if (hStu  !== -1) colStuId = hStu;

  const normActingId = String(actingStudentId).replace(/\s+/g, "").toUpperCase();
  let targetProjId = "", projectNameTH = "";
  let advEmail = "", advName = "", coAdvEmail = "", coAdvName = "", schAdvEmail = "", schAdvName = "";

  for (let i = 1; i < displayData.length; i++) {
    const sId = String(displayData[i][colStuId] || "").replace(/\s+/g, "").toUpperCase();
    if (sId === normActingId && sId !== "") {
      targetProjId  = String(displayData[i][colProj]       || "").trim();
      projectNameTH = String(displayData[i][colProjNameTH] || "").trim();
      advEmail      = String(displayData[i][colAdvEmail]   || "").trim();
      advName       = cleanAdvName(displayData[i][colAdvName]);
      coAdvEmail    = String(displayData[i][colCoAdvEmail] || "").trim();
      coAdvName     = cleanAdvName(displayData[i][colCoAdvName]);
      schAdvEmail   = String(displayData[i][colSchAdvEmail] || "").trim();
      schAdvName    = cleanAdvName(displayData[i][colSchAdvName]);
      break;
    }
  }

  const normTargetId = targetProjId.replace(/\s+/g, "").toUpperCase();
  const members = [];

  for (let i = 1; i < displayData.length; i++) {
    const pId = String(displayData[i][colProj]  || "").replace(/\s+/g, "").toUpperCase();
    const sId = String(displayData[i][colStuId] || "").replace(/\s+/g, "").toUpperCase();
    const isMatch =
      (normTargetId !== "" && pId === normTargetId) ||
      (normTargetId === "" && sId === normActingId && sId !== "");

    if (isMatch && sId !== "" && !members.find((m) => m.normId === sId)) {
      members.push({
        normId:     sId,
        originalId: String(displayData[i][colStuId] || "").trim(),
        firstName:  String(displayData[i][colFName]  || "").trim(),
        lastName:   String(displayData[i][colLName]  || "").trim(),
        email:      String(displayData[i][colEmail]  || "").trim(),
      });
    }
  }

  return { members, targetProjId, projectNameTH, advEmail, advName, coAdvEmail, coAdvName, schAdvEmail, schAdvName };
}

/** Convert 2D Sheets array to array-of-objects (first row = header keys). */
function rowsToObjects(rows) {
  if (!rows || rows.length <= 1) return [];
  
  // Clean headers: take only the part before the first parenthesis
  const headers = rows[0].map(h => {
    const str = String(h || "").trim();
    return str.split('(')[0].trim(); // Splits "สถานะ (รออนุมัติ...)" into "สถานะ"
  });

  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => { 
      if (h) obj[h] = row[i] ?? ""; 
    });
    return obj;
  });
}

/** Find value in an object by checking if any key contains one of the keywords. */
function getObjVal(obj, keywords) {
  for (const key in obj) {
    const cleanKey = String(key).replace(/\s+/g, "").toLowerCase();
    if (keywords.some((w) => cleanKey.includes(String(w).toLowerCase()))) {
      return String(obj[key] || "").trim();
    }
  }
  return "";
}

module.exports = {
  INITIAL_SUBMISSION_STATUS,
  ADMIN_EMAILS,
  normalizeSubmissionStatus,
  normalizeCompare,
  normalizeEmail,
  normalizeName,
  isAdminReviewer,
  isMainAdvisorReviewer,
  getPayloadReason,
  getGroupInfo,
  rowsToObjects,
  getObjVal,
};