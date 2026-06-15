// ================================================================
// api/status.js — Submission status update
// FIX Vuln 1 & 2: Role and email come from the JWT, NOT from req.body.
//   A student cannot forge advisor_main in the payload to self-approve.
// ================================================================
require("dotenv").config();
const { getSheetValues, updateCell } = require("../lib/sheets");
const { requireRole }                = require("../lib/auth");
const { sendMail, buildFlexEmailHtml, WEB_URL } = require("../lib/mail");
const {
  getGroupInfo, getPayloadReason, normalizeSubmissionStatus, normalizeCompare,
  isAdminReviewer, isMainAdvisorReviewer, INITIAL_SUBMISSION_STATUS,
} = require("../lib/helpers");
const GS_MAIN_TABLE_NAME = process.env.GS_MAIN_TABLE_NAME;

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const data = req.body;

    // ── CRITICAL: Use role/email from the signed JWT, NOT from req.body ──
    const reviewerRole  = req.jwtUser.role;
    const reviewerEmail = req.jwtUser.email;
    const reviewerName  = req.jwtUser.name;

    const finalStatus = normalizeSubmissionStatus(data.status);
    const reasonText  = getPayloadReason(data);
    const isResubmitSync = finalStatus === INITIAL_SUBMISSION_STATUS && reasonText;

    if (finalStatus === INITIAL_SUBMISSION_STATUS && !isResubmitSync) {
      return res.status(400).json({ status: "error",
        message: "กรุณาเลือกผลการพิจารณา อนุมัติ หรือ ไม่อนุมัติ" });
    }

    const projectRows = await getSheetValues(GS_MAIN_TABLE_NAME);
    const subRows     = await getSheetValues("Submissions");
    const headers     = subRows[0] || [];

    const colStuId    = headers.findIndex((h) => String(h).includes("รหัสนักเรียน"));
    const colProjId   = headers.findIndex((h) => String(h).includes("รหัสโครงงาน"));
    const colWorkType = headers.findIndex((h) => String(h).includes("ประเภทงาน"));
    const colStatus   = headers.findIndex((h) => String(h).includes("สถานะ"));
    const colReason   = headers.findIndex((h) => String(h).includes("หมายเหตุ"));

    const groupInfo = getGroupInfo(projectRows, data.studentId);

    if (!isResubmitSync) {
      if (data.workType === "แบบคำร้อง") {
        if (!isAdminReviewer(reviewerEmail, reviewerRole)) {
          return res.status(403).json({ status: "error",
            message: "แบบคำร้องต้องให้ผู้ดูแลระบบเป็นผู้พิจารณาเท่านั้น" });
        }
      } else {
        if (!isMainAdvisorReviewer(groupInfo, reviewerEmail, reviewerRole, reviewerName)) {
          return res.status(403).json({ status: "error",
            message: "งานนี้ต้องให้อาจารย์ที่ปรึกษาหลักเป็นผู้อนุมัติเท่านั้น" });
        }
      }
    }

    const reqStuId  = String(data.studentId  || "").trim();
    const reqProjId = normalizeCompare(data.projectId);
    let rowIndex = -1;

    for (let i = subRows.length - 1; i >= 1; i--) {
      const rType   = String(subRows[i][colWorkType] || "").trim();
      const rStuId  = String(subRows[i][colStuId]   || "").trim();
      const rProjId = colProjId > -1 ? normalizeCompare(subRows[i][colProjId]) : "";
      const matchOwner = reqProjId
        ? (rProjId === reqProjId || rStuId === reqStuId)
        : rStuId === reqStuId;
      if (rType === data.workType && matchOwner) { rowIndex = i + 1; break; }
    }

    if (rowIndex === -1) {
      return res.status(404).json({ status: "error", message: "ไม่พบงานที่ต้องการอัปเดตสถานะ" });
    }

    await updateCell("Submissions", rowIndex, colStatus + 1, finalStatus);
    if (colReason > -1) await updateCell("Submissions", rowIndex, colReason + 1, reasonText);

    if (!isResubmitSync) {
      // Pass verified JWT identity into email builder
      const enrichedData = { ...data, reviewerEmail, reviewerName, role: reviewerRole };
      sendStatusEmails(enrichedData, groupInfo, finalStatus, reasonText).catch((e) =>
        console.error("[status] Email error:", e.message)
      );
    }

    return res.json({ status: "success" });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
}

// Only advisors and admins may update status
module.exports = [...requireRole("admin", "advisor_main", "advisor"), handler];

// ── Email helpers (unchanged logic) ──────────────────────────────────────────
async function sendStatusEmails(data, groupInfo, finalStatus, reasonText) {
  const isApproved = finalStatus === "อนุมัติ";
  const headText   = isApproved ? "✅ แจ้งผล: อนุมัติการส่งงาน" : "❌ แจ้งผล: ไม่อนุมัติการส่งงาน";
  const headColor  = isApproved ? "#10b981" : "#f43f5e";

  const reasonHtml = !isApproved && reasonText
    ? `<p style="color:#f43f5e;background:#fff1f2;padding:10px;border-radius:6px;">
         💬 <strong>เหตุผล:</strong><br>${reasonText}</p>` : "";

  const detailsBox = `
    <div style="background:#f8fafc;padding:15px;border-radius:8px;border-left:4px solid ${headColor};margin:15px 0;">
      <p style="margin:0 0 6px;font-size:14px;">📌 ${groupInfo.targetProjId || "-"}</p>
      <p style="margin:0 0 6px;font-size:14px;">📖 ${groupInfo.projectNameTH || "-"}</p>
      <p style="margin:0 0 6px;font-size:14px;">📄 ${data.workType}</p>
      <p style="margin:0;font-size:14px;">📊 <strong style="color:${headColor};">${finalStatus}</strong></p>
      ${reasonHtml}
    </div>`;

  const normActingId = String(data.studentId).replace(/\s+/g, "").toUpperCase();
  let membersHtml = "<div>";
  groupInfo.members.forEach((m) => {
    const isSender = m.normId === normActingId;
    membersHtml += `<p style="margin:4px 0;font-size:14px;">• ${m.originalId} ${m.firstName} ${m.lastName}${isSender ? " (✅ ผู้ส่ง)" : ""}</p>`;
  });
  membersHtml += "</div>";

  for (const member of groupInfo.members) {
    if (member.email.includes("@")) {
      await sendMail({
        to: member.email,
        subject: `[SCiUSNU] ผลการพิจารณา: ${data.workType}`,
        htmlBody: buildFlexEmailHtml(
          headText, headColor,
          `<p>เรียน <b>คุณ${member.firstName} ${member.lastName}</b></p>${detailsBox}${membersHtml}`,
          "🔍 เข้าสู่ระบบ", WEB_URL
        ),
      });
    }
  }

  const advTargets = [
    { email: groupInfo.advEmail,    name: groupInfo.advName,    label: "อาจารย์ที่ปรึกษา" },
    { email: groupInfo.coAdvEmail,  name: groupInfo.coAdvName,  label: "อาจารย์ที่ปรึกษาร่วม" },
    { email: groupInfo.schAdvEmail, name: groupInfo.schAdvName, label: "อาจารย์ที่ปรึกษาโรงเรียน" },
  ];
  for (const adv of advTargets) {
    if (adv.email.includes("@")) {
      await sendMail({
        to: adv.email,
        subject: `[แจ้งผลการประเมิน] โครงงาน ${groupInfo.targetProjId} - ${data.workType}`,
        htmlBody: buildFlexEmailHtml(
          headText, headColor,
          `<p>เรียน <b>${adv.label} (${adv.name})</b></p>${detailsBox}${membersHtml}`,
          "📁 เข้าสู่ระบบ", WEB_URL
        ),
      });
    }
  }
}
