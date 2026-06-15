// FIX Vuln 1: Only authenticated students may submit work.
require("dotenv").config();
const { getSheetValues, appendRow, updateRowCells, ensureSubmissionsSheet } = require("../lib/sheets");
const { trashFile, extractFileId } = require("../lib/appsScript");
const { sendMail, buildFlexEmailHtml, WEB_URL } = require("../lib/mail");
const { getGroupInfo, getPayloadReason, INITIAL_SUBMISSION_STATUS, ADMIN_EMAILS } = require("../lib/helpers");
const { requireRole } = require("../lib/auth");
const { getAllSettings, getWindowStatus } = require("../lib/settings");

const WORK_TYPE_SETTING_KEY = {
  "โครงร่าง (Proposal)":     "submission_proposal",
  "รายงานความก้าวหน้า":      "submission_progress",
  "รายงานฉบับสมบูรณ์":       "submission_final",
};

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    await ensureSubmissionsSheet();
    const data = req.body;
    // Expected body:
    // { studentId, firstName, lastName, projectId, workType,
    //   advisorName, file1Url, file2Url?, reason? }

    const projectRows = await getSheetValues("TEST_DEV");
    const subRows     = await getSheetValues("Submissions");
    const headers     = subRows[0] || [];

    // ── Date-window guard: โครงร่าง / ความก้าวหน้า / ฉบับสมบูรณ์ ──
    // Skipped for resubmissions of previously-rejected work (data.reason
    // set by the "ส่งไฟล์แก้ไข" flow) so students can always fix issues
    // an advisor flagged, even outside the open window.
    const settingKey = WORK_TYPE_SETTING_KEY[String(data.workType || "").trim()];
    if (settingKey && !data.reason) {
      const settings = await getAllSettings();
      const setting  = settings[settingKey];
      const { isOpen, hasLimit } = getWindowStatus(setting);
      if (hasLimit && !isOpen) {
        return res.status(400).json({
          status: "error",
          message: `ขณะนี้ไม่อยู่ในช่วงเวลาที่เปิดให้ส่ง "${data.workType}"`,
        });
      }
    }

    const colStuId    = headers.findIndex((h) => String(h).includes("รหัสนักเรียน"));
    const colProjId   = headers.findIndex((h) => String(h).includes("รหัสโครงงาน"));
    const colWorkType = headers.findIndex((h) => String(h).includes("ประเภทงาน"));
    const colFile1    = headers.findIndex((h) => String(h).includes("เล่ม"));
    const colFile2    = headers.findIndex((h) => String(h).includes("เซ็น"));
    const colStatus   = headers.findIndex((h) => String(h).includes("สถานะ"));
    let   colReason   = headers.findIndex((h) => String(h).includes("หมายเหตุ"));
    if (colReason === -1) colReason = headers.length; // will be appended

    const targetProjNorm  = (data.projectId || "").replace(/\s+/g, "").toLowerCase();
    const submittedReason = getPayloadReason(data);

    let existingRowIndex = -1, oldFile1Url = "", oldFile2Url = "", oldReason = "";

    for (let i = subRows.length - 1; i >= 1; i--) {
      const rProjNorm = (subRows[i][colProjId]   || "").replace(/\s+/g, "").toLowerCase();
      const rStuId    = (subRows[i][colStuId]    || "").trim();
      const rType     = (subRows[i][colWorkType] || "").trim();

      if (rType === String(data.workType).trim()) {
        const match = (targetProjNorm && rProjNorm === targetProjNorm) ||
                      (!targetProjNorm && rStuId === String(data.studentId).trim());
        if (match) {
          existingRowIndex = i + 1;
          oldFile1Url = subRows[i][colFile1] || "";
          oldFile2Url = subRows[i][colFile2] || "";
          oldReason   = subRows[i][colReason] || "";
          break;
        }
      }
    }

    if (existingRowIndex > -1) {
      // Trash old Drive files
      try {
        if (oldFile1Url) await trashFile(extractFileId(oldFile1Url));
        if (oldFile2Url?.includes("drive.google.com")) await trashFile(extractFileId(oldFile2Url));
      } catch (_) {}

      const reasonToSave = submittedReason || String(oldReason).trim();

      await updateRowCells("Submissions", existingRowIndex, [
        { col: 1,              value: new Date().toISOString() },
        { col: colStuId  + 1,  value: data.studentId },
        { col: 3,              value: data.firstName },
        { col: 4,              value: data.lastName },
        { col: colFile1  + 1,  value: data.file1Url },
        { col: colFile2  + 1,  value: data.file2Url || "" },
        { col: colStatus + 1,  value: INITIAL_SUBMISSION_STATUS },
        { col: colReason + 1,  value: reasonToSave },
      ]);
    } else {
      const newRow = [
        new Date().toISOString(), data.studentId, data.firstName, data.lastName,
        data.projectId, data.workType, data.file1Url, data.file2Url || "",
        INITIAL_SUBMISSION_STATUS, data.advisorName,
      ];
      while (newRow.length < colReason) newRow.push("");
      newRow[colReason] = submittedReason;
      await appendRow("Submissions", newRow);
    }

    // Fire-and-forget email (don't hold up the response)
    sendSubmitEmails(data, projectRows).catch((e) =>
      console.error("[submit] Email error:", e.message)
    );

    return res.json({ status: "success" });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
}

// Only authenticated students may submit
module.exports = [...requireRole("student"), handler];

async function sendSubmitEmails(data, projectRows) {
  const groupInfo    = getGroupInfo(projectRows, data.studentId);
  const normActingId = String(data.studentId).replace(/\s+/g, "").toUpperCase();
  let   senderFirstName = "";

  let membersHtml = `<div style="margin-top:20px;">
    <p style="font-weight:bold;color:#ea580c;font-size:14px;">👥 สมาชิกในกลุ่ม:</p>
    <div style="background:#fff;border:1px solid #ffedd5;border-radius:8px;padding:12px;">`;
  groupInfo.members.forEach((m) => {
    const isSender = m.normId === normActingId;
    if (isSender) senderFirstName = m.firstName;
    const tag = isSender ? ' <span style="color:#ea580c;font-weight:bold;">(✅ ผู้ส่ง)</span>' : "";
    membersHtml += `<p style="margin:5px 0;font-size:14px;">• ${m.originalId} ${m.firstName} ${m.lastName}${tag}</p>`;
  });
  membersHtml += `</div></div>`;

  const detailsBox = `
    <div style="background:#f8fafc;padding:15px;border-radius:8px;margin:15px 0;border-left:4px solid #f59e0b;">
      <p style="margin:0 0 6px;font-size:14px;">📌 รหัสโครงงาน: <strong>${groupInfo.targetProjId || "ไม่มีรหัส"}</strong></p>
      <p style="margin:0 0 6px;font-size:14px;">📖 ชื่อโครงงาน: <strong>${groupInfo.projectNameTH || "-"}</strong></p>
      <p style="margin:0;font-size:14px;">📄 ประเภทงาน: <strong style="color:#ea580c;">${data.workType}</strong></p>
    </div>`;

  if (data.workType === "แบบคำร้อง") {
    for (const adminMail of ADMIN_EMAILS) {
      await sendMail({
        to: adminMail,
        subject: `[SCiUS-Admin] มีแบบคำร้องใหม่: โครงงาน ${groupInfo.targetProjId}`,
        htmlBody: buildFlexEmailHtml(
          "🟡 มีแบบคำร้องใหม่", "#f59e0b",
          `<p>มีการส่ง<b>แบบคำร้อง</b>ใหม่ กรุณาตรวจสอบ</p>${detailsBox}${membersHtml}`,
          "🔍 ตรวจสอบและอนุมัติ", WEB_URL
        ),
      });
    }
  } else {
    if (groupInfo.advEmail.includes("@")) {
      await sendMail({
        to: groupInfo.advEmail,
        subject: `[รอตรวจสอบ] โครงงาน ${groupInfo.targetProjId} ส่งงาน ${data.workType}`,
        htmlBody: buildFlexEmailHtml(
          "🟡 มีงานใหม่รอตรวจสอบ", "#f59e0b",
          `<p>เรียน <b>อ.${groupInfo.advName}</b></p><p>มีการส่งไฟล์งานใหม่</p>${detailsBox}${membersHtml}`,
          "🔍 ตรวจสอบและอนุมัติ", WEB_URL
        ),
      });
    }
    if (groupInfo.coAdvEmail.includes("@")) {
      await sendMail({
        to: groupInfo.coAdvEmail,
        subject: `[แจ้งเพื่อทราบ] โครงงาน ${groupInfo.targetProjId} ส่งงาน ${data.workType}`,
        htmlBody: buildFlexEmailHtml(
          "🔵 แจ้งเตือนการส่งงาน", "#3b82f6",
          `<p>เรียน <b>อ.${groupInfo.coAdvName}</b></p>${detailsBox}${membersHtml}`,
          "📁 เข้าสู่ระบบ", WEB_URL
        ),
      });
    }
    if (groupInfo.schAdvEmail.includes("@")) {
      await sendMail({
        to: groupInfo.schAdvEmail,
        subject: `[แจ้งเพื่อทราบ] โครงงาน ${groupInfo.targetProjId} ส่งงาน ${data.workType}`,
        htmlBody: buildFlexEmailHtml(
          "🔵 แจ้งเตือนการส่งงาน", "#3b82f6",
          `<p>เรียน <b>อ.${groupInfo.schAdvName}</b></p>${detailsBox}${membersHtml}`,
          "📁 เข้าสู่ระบบ", WEB_URL
        ),
      });
    }
  }

  for (const member of groupInfo.members) {
    if (member.email.includes("@")) {
      await sendMail({
        to: member.email,
        subject: `[สำเร็จ] ส่งงาน ${data.workType} เรียบร้อยแล้ว`,
        htmlBody: buildFlexEmailHtml(
          "📨 ส่งงานสำเร็จ", "#ea580c",
          `<p>เรียน <b>คุณ${member.firstName} ${member.lastName}</b></p>
           <p>ระบบรับไฟล์ <b>${data.workType}</b> แล้ว (ส่งโดย <b>คุณ${senderFirstName}</b>)</p>
           ${detailsBox}${membersHtml}`,
          "📊 ดูประวัติการส่งงาน", WEB_URL
        ),
      });
    }
  }
}