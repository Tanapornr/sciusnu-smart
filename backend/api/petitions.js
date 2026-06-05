// ================================================================
// api/petitions.js — Full online petition workflow
// Handles: create, list, detail, approve, reject, signature
// ================================================================
require("dotenv").config();
const { getSheetValues, appendRow, updateRowCells } = require("../lib/sheets");
const { sendMail, buildFlexEmailHtml, WEB_URL } = require("../lib/mail");
const { getGroupInfo, normalizeEmail, ADMIN_EMAILS } = require("../lib/helpers");
const { requireAuth, requireRole } = require("../lib/auth");

// ── Column indices for PETITIONS sheet ──────────────────────────
// petition_id | project_code | project_name | petition_type | requester_role |
// requester_email | requester_name | created_at | status | payload_json |
// current_step | final_result | updated_at |
// student1_status | student1_note | student1_signature | student1_time |
// student2_status | student2_note | student2_signature | student2_time |
// advisor_status | advisor_note | advisor_signature | advisor_time |
// coadvisor1_status | coadvisor1_note | coadvisor1_signature | coadvisor1_time |
// coadvisor2_status | coadvisor2_note | coadvisor2_signature | coadvisor2_time

const COL = {
  petition_id:        1,
  project_code:       2,
  project_name:       3,
  petition_type:      4,
  requester_role:     5,
  requester_email:    6,
  requester_name:     7,
  created_at:         8,
  status:             9,
  payload_json:       10,
  current_step:       11,
  final_result:       12,
  updated_at:         13,
  // Approvers start at col 14
  student1_status:    14,
  student1_note:      15,
  student1_signature: 16,
  student1_time:      17,
  student2_status:    18,
  student2_note:      19,
  student2_signature: 20,
  student2_time:      21,
  advisor_status:     22,
  advisor_note:       23,
  advisor_signature:  24,
  advisor_time:       25,
  coadvisor1_status:  26,
  coadvisor1_note:    27,
  coadvisor1_signature:28,
  coadvisor1_time:    29,
  coadvisor2_status:  30,
  coadvisor2_note:    31,
  coadvisor2_signature:32,
  coadvisor2_time:    33,
};

const SHEET = "PETITIONS";
const HEADERS = [
  "petition_id","project_code","project_name","petition_type","requester_role",
  "requester_email","requester_name","created_at","status","payload_json",
  "current_step","final_result","updated_at",
  "student1_status","student1_note","student1_signature","student1_time",
  "student2_status","student2_note","student2_signature","student2_time",
  "advisor_status","advisor_note","advisor_signature","advisor_time",
  "coadvisor1_status","coadvisor1_note","coadvisor1_signature","coadvisor1_time",
  "coadvisor2_status","coadvisor2_note","coadvisor2_signature","coadvisor2_time",
];

// ── Petition types ────────────────────────────────────────────────
const PETITION_TYPES = {
  1: "เพิ่มอาจารย์ที่ปรึกษามหาวิทยาลัย",
  2: "เพิ่มอาจารย์ที่ปรึกษาโรงเรียน",
  3: "ถอดถอนอาจารย์ที่ปรึกษา",
  4: "เปลี่ยนชื่อโครงงาน",
  5: "เปลี่ยนสาขาโครงงาน",
  6: "คำร้องอื่นๆ",
};

// ── Helpers ───────────────────────────────────────────────────────
function generatePetitionId() {
  const now = new Date();
  const year = (now.getFullYear() + 543).toString().slice(-2); // BE
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `PET-${year}${month}-${rand}`;
}

/** Parse a row array into a petition object */
function rowToPetition(row, rowIndex) {
  if (!row || !row[0]) return null;
  return {
    _row: rowIndex,
    petition_id:        row[COL.petition_id - 1]        || "",
    project_code:       row[COL.project_code - 1]       || "",
    project_name:       row[COL.project_name - 1]       || "",
    petition_type:      row[COL.petition_type - 1]      || "",
    requester_role:     row[COL.requester_role - 1]     || "",
    requester_email:    row[COL.requester_email - 1]    || "",
    requester_name:     row[COL.requester_name - 1]     || "",
    created_at:         row[COL.created_at - 1]         || "",
    status:             row[COL.status - 1]             || "",
    payload_json:       row[COL.payload_json - 1]       || "{}",
    current_step:       row[COL.current_step - 1]       || "",
    final_result:       row[COL.final_result - 1]       || "",
    updated_at:         row[COL.updated_at - 1]         || "",
    student1:  { status: row[COL.student1_status-1]||"", note: row[COL.student1_note-1]||"", signature: row[COL.student1_signature-1]||"", time: row[COL.student1_time-1]||"" },
    student2:  { status: row[COL.student2_status-1]||"", note: row[COL.student2_note-1]||"", signature: row[COL.student2_signature-1]||"", time: row[COL.student2_time-1]||"" },
    advisor:   { status: row[COL.advisor_status-1]||"",  note: row[COL.advisor_note-1]||"",  signature: row[COL.advisor_signature-1]||"",  time: row[COL.advisor_time-1]||"" },
    coadvisor1:{ status: row[COL.coadvisor1_status-1]||"", note: row[COL.coadvisor1_note-1]||"", signature: row[COL.coadvisor1_signature-1]||"", time: row[COL.coadvisor1_time-1]||"" },
    coadvisor2:{ status: row[COL.coadvisor2_status-1]||"", note: row[COL.coadvisor2_note-1]||"", signature: row[COL.coadvisor2_signature-1]||"", time: row[COL.coadvisor2_time-1]||"" },
  };
}

/** Build the approval chain from project data */
function buildApprovalChain(groupInfo) {
  const chain = [];
  if (groupInfo.members.length > 0) chain.push({ role: "student1", email: groupInfo.members[0]?.email || "", name: groupInfo.members[0]?.firstName + " " + groupInfo.members[0]?.lastName });
  if (groupInfo.members.length > 1) chain.push({ role: "student2", email: groupInfo.members[1]?.email || "", name: groupInfo.members[1]?.firstName + " " + groupInfo.members[1]?.lastName });
  if (groupInfo.advEmail) chain.push({ role: "advisor", email: groupInfo.advEmail, name: groupInfo.advName });
  if (groupInfo.coAdvEmail) chain.push({ role: "coadvisor1", email: groupInfo.coAdvEmail, name: groupInfo.coAdvName });
  if (groupInfo.schAdvEmail) chain.push({ role: "coadvisor2", email: groupInfo.schAdvEmail, name: groupInfo.schAdvName });
  return chain;
}

/** Determine what role the current user plays in a petition's approval chain */
function getUserRoleInChain(petition, userEmail, userRole, chain) {
  const email = normalizeEmail(userEmail);
  for (const step of chain) {
    const stepEmail = normalizeEmail(step.email);
    if (stepEmail && stepEmail === email) return step.role;
  }
  if (userRole === "admin") return "admin";
  return null;
}

/** Get the next approver step that hasn't acted yet */
function getCurrentPendingStep(petition, chain) {
  for (const step of chain) {
    const approver = petition[step.role];
    if (!approver || !approver.status) return step;
  }
  return null; // all steps done
}

async function ensurePetitionsSheet() {
  try {
    const rows = await getSheetValues(SHEET);
    if (!rows.length) {
      await appendRow(SHEET, HEADERS);
    }
  } catch (err) {
    console.warn("[petitions] ensurePetitionsSheet:", err.message);
  }
}

// ================================================================
// POST /api/petitions — Create petition
// Allowed: student, advisor_main
// ================================================================
async function createPetition(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const user = req.jwtUser;

  if (!["student", "advisor_main"].includes(user.role)) {
    return res.status(403).json({ status: "error", message: "ไม่มีสิทธิ์สร้างคำร้อง" });
  }

  try {
    await ensurePetitionsSheet();
    const { petition_type, payload, project_code, project_name } = req.body;

    if (!petition_type || !PETITION_TYPES[petition_type]) {
      return res.status(400).json({ status: "error", message: "ประเภทคำร้องไม่ถูกต้อง" });
    }

    // Fetch project data to build approval chain
    const projectRows = await getSheetValues("TEST_DEV");

    let groupInfo;
    if (user.role === "student") {
      groupInfo = getGroupInfo(projectRows, user.studentId);
    } else {
      // advisor_main: find their group by email
      groupInfo = getGroupInfoByAdvisorEmail(projectRows, user.email);
    }

    if (!groupInfo.targetProjId && !project_code) {
      return res.status(400).json({ status: "error", message: "ไม่พบข้อมูลโครงงาน" });
    }

    const chain = buildApprovalChain(groupInfo);
    if (chain.length === 0) {
      return res.status(400).json({ status: "error", message: "ไม่พบผู้อนุมัติ" });
    }

    const petitionId = generatePetitionId();
    const now = new Date().toISOString();
    const chainJson = JSON.stringify({ chain, payload: payload || {} });
    const firstStep = chain[0];

    const row = new Array(33).fill("");
    row[COL.petition_id - 1]     = petitionId;
    row[COL.project_code - 1]    = groupInfo.targetProjId || project_code || "";
    row[COL.project_name - 1]    = groupInfo.projectNameTH || project_name || "";
    row[COL.petition_type - 1]   = String(petition_type);
    row[COL.requester_role - 1]  = user.role;
    row[COL.requester_email - 1] = user.email;
    row[COL.requester_name - 1]  = user.name;
    row[COL.created_at - 1]      = now;
    row[COL.status - 1]          = "รอดำเนินการ";
    row[COL.payload_json - 1]    = chainJson;
    row[COL.current_step - 1]    = firstStep.role;
    row[COL.final_result - 1]    = "";
    row[COL.updated_at - 1]      = now;

    await appendRow(SHEET, row);

    // Notify first approver
    sendPetitionNotification(petitionId, firstStep.email, firstStep.name,
      petition_type, groupInfo.targetProjId || project_code,
      groupInfo.projectNameTH || project_name, user.name).catch(console.error);

    return res.json({ status: "success", petition_id: petitionId });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
}

// ================================================================
// GET /api/petitions — List petitions (filtered by role)
// ================================================================
async function listPetitions(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const user = req.jwtUser;

  try {
    await ensurePetitionsSheet();
    const rows = await getSheetValues(SHEET);
    const petitions = [];

    for (let i = 1; i < rows.length; i++) {
      const p = rowToPetition(rows[i], i + 1);
      if (!p || !p.petition_id) continue;

      let include = false;
      if (user.role === "admin") {
        include = true;
      } else if (user.role === "student") {
        // Show petitions where user is requester or in approval chain
        const chainData = safeParseChain(p.payload_json);
        include = normalizeEmail(p.requester_email) === normalizeEmail(user.email) ||
          chainData.chain?.some(s => normalizeEmail(s.email) === normalizeEmail(user.email));
      } else {
        // advisor roles: show petitions where they are in the approval chain
        const chainData = safeParseChain(p.payload_json);
        include = chainData.chain?.some(s => normalizeEmail(s.email) === normalizeEmail(user.email));
      }

      if (include) {
        petitions.push({
          ...p,
          petition_type_label: PETITION_TYPES[p.petition_type] || p.petition_type,
        });
      }
    }

    return res.json({ status: "success", petitions: petitions.reverse() });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
}

// ================================================================
// GET /api/petitions/:id — Get petition detail
// ================================================================
async function getPetitionDetail(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const user = req.jwtUser;
  const petitionId = req.params?.id || req.query?.id;

  try {
    await ensurePetitionsSheet();
    const rows = await getSheetValues(SHEET);

    for (let i = 1; i < rows.length; i++) {
      const p = rowToPetition(rows[i], i + 1);
      if (!p || p.petition_id !== petitionId) continue;

      // Auth check
      const chainData = safeParseChain(p.payload_json);
      const isRequester = normalizeEmail(p.requester_email) === normalizeEmail(user.email);
      const isInChain = chainData.chain?.some(s => normalizeEmail(s.email) === normalizeEmail(user.email));
      if (!isRequester && !isInChain && user.role !== "admin") {
        return res.status(403).json({ status: "error", message: "ไม่มีสิทธิ์เข้าถึงคำร้องนี้" });
      }

      return res.json({
        status: "success",
        petition: {
          ...p,
          petition_type_label: PETITION_TYPES[p.petition_type] || p.petition_type,
          chain: chainData.chain || [],
          payload: chainData.payload || {},
        },
      });
    }

    return res.status(404).json({ status: "error", message: "ไม่พบคำร้อง" });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
}

// ================================================================
// POST /api/petitions/:id/approve  — Approve
// POST /api/petitions/:id/reject   — Reject
// ================================================================
async function handleApproval(req, res, action) {
  if (req.method !== "POST") return res.status(405).end();
  const user = req.jwtUser;
  const petitionId = req.params?.id || req.query?.id;
  const { note, signature } = req.body;

  if (!signature) {
    return res.status(400).json({ status: "error", message: "กรุณาลงนามก่อนดำเนินการ" });
  }

  try {
    await ensurePetitionsSheet();
    const rows = await getSheetValues(SHEET);

    for (let i = 1; i < rows.length; i++) {
      const p = rowToPetition(rows[i], i + 1);
      if (!p || p.petition_id !== petitionId) continue;

      if (p.status === "เสร็จสิ้น" || p.status === "ปฏิเสธ") {
        return res.status(400).json({ status: "error", message: "คำร้องนี้ดำเนินการแล้ว" });
      }

      const chainData = safeParseChain(p.payload_json);
      const chain = chainData.chain || [];

      // Find user's role in chain
      const userChainRole = getUserRoleInChain(p, user.email, user.role, chain);
      if (!userChainRole) {
        return res.status(403).json({ status: "error", message: "คุณไม่มีสิทธิ์อนุมัติคำร้องนี้" });
      }

      // Check if it's their turn
      const pendingStep = getCurrentPendingStep(p, chain);
      if (!pendingStep || pendingStep.role !== userChainRole) {
        return res.status(400).json({ status: "error", message: "ยังไม่ถึงขั้นตอนของคุณ" });
      }

      // Prevent double approval
      if (p[userChainRole]?.status) {
        return res.status(400).json({ status: "error", message: "คุณได้ดำเนินการแล้ว" });
      }

      const now = new Date().toISOString();
      const statusVal = action === "approve" ? "อนุมัติ" : "ปฏิเสธ";

      // Map role to column offsets
      const roleColMap = {
        student1:   { status: COL.student1_status,   note: COL.student1_note,   sig: COL.student1_signature,   time: COL.student1_time },
        student2:   { status: COL.student2_status,   note: COL.student2_note,   sig: COL.student2_signature,   time: COL.student2_time },
        advisor:    { status: COL.advisor_status,    note: COL.advisor_note,    sig: COL.advisor_signature,    time: COL.advisor_time },
        coadvisor1: { status: COL.coadvisor1_status, note: COL.coadvisor1_note, sig: COL.coadvisor1_signature, time: COL.coadvisor1_time },
        coadvisor2: { status: COL.coadvisor2_status, note: COL.coadvisor2_note, sig: COL.coadvisor2_signature, time: COL.coadvisor2_time },
      };

      const cols = roleColMap[userChainRole];
      if (!cols) return res.status(400).json({ status: "error", message: "บทบาทไม่ถูกต้อง" });

      // Encode signature (base64-like text representation)
      const encodedSig = Buffer.from(signature).toString("base64");

      const updates = [
        { col: cols.status, value: statusVal },
        { col: cols.note,   value: note || "" },
        { col: cols.sig,    value: encodedSig },
        { col: cols.time,   value: now },
        { col: COL.updated_at, value: now },
      ];

      if (action === "reject") {
        // Petition rejected — final
        updates.push({ col: COL.status,       value: "ปฏิเสธ" });
        updates.push({ col: COL.final_result, value: "ปฏิเสธ" });
        updates.push({ col: COL.current_step, value: "สิ้นสุด" });
        await updateRowCells(SHEET, p._row, updates);

        // Notify requester
        notifyRejected(p, user.name, note).catch(console.error);
        return res.json({ status: "success", message: "ปฏิเสธคำร้องแล้ว" });
      }

      // Approved — find next step
      const currentIndex = chain.findIndex(s => s.role === userChainRole);
      const nextStep = chain[currentIndex + 1];

      if (nextStep) {
        updates.push({ col: COL.current_step, value: nextStep.role });
        await updateRowCells(SHEET, p._row, updates);
        // Notify next approver
        sendPetitionNotification(
          p.petition_id, nextStep.email, nextStep.name,
          p.petition_type, p.project_code, p.project_name, p.requester_name
        ).catch(console.error);
      } else {
        // All approved
        updates.push({ col: COL.status,       value: "เสร็จสิ้น" });
        updates.push({ col: COL.final_result, value: "อนุมัติ" });
        updates.push({ col: COL.current_step, value: "สิ้นสุด" });
        await updateRowCells(SHEET, p._row, updates);

        // Post-approval actions
        await handlePostApproval(p, chainData.payload).catch(console.error);
        notifyCompleted(p).catch(console.error);
      }

      return res.json({ status: "success", message: action === "approve" ? "อนุมัติแล้ว" : "บันทึกแล้ว" });
    }

    return res.status(404).json({ status: "error", message: "ไม่พบคำร้อง" });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
}

// ================================================================
// POST /api/petitions/signature — Upload/validate signature
// ================================================================
async function handleSignature(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { signature } = req.body;
  if (!signature || signature.length < 10) {
    return res.status(400).json({ status: "error", message: "ลายเซ็นไม่ถูกต้อง" });
  }
  return res.json({ status: "success", message: "ลายเซ็นถูกต้อง" });
}

// ================================================================
// Post-approval automation (Type 4: rename, Type 5: change field)
// ================================================================
async function handlePostApproval(petition, payload) {
  const type = Number(petition.petition_type);

  if (type === 4 && (payload.newNameTH || payload.newNameEN)) {
    // Update project name in TEST_DEV sheet
    await updateProjectName(petition.project_code, payload.newNameTH, payload.newNameEN);
  }

  if (type === 5 && payload.newField) {
    await updateProjectField(petition.project_code, payload.newField);
  }

  if ([1, 2, 3, 6].includes(type)) {
    // Notify admin
    for (const adminEmail of ADMIN_EMAILS) {
      await sendMail({
        to: adminEmail,
        subject: `[SCiUS-Admin] คำร้อง ${petition.petition_id} ได้รับการอนุมัติครบถ้วน`,
        htmlBody: buildFlexEmailHtml(
          "✅ คำร้องได้รับการอนุมัติ", "#10b981",
          `<p>คำร้อง <strong>${petition.petition_id}</strong> ได้รับการอนุมัติจากทุกฝ่ายแล้ว</p>
           <p>ประเภท: <strong>${PETITION_TYPES[type] || type}</strong></p>
           <p>โครงงาน: <strong>${petition.project_code} — ${petition.project_name}</strong></p>
           <p>ผู้ยื่น: <strong>${petition.requester_name}</strong></p>`,
          "ดูรายละเอียด", `${WEB_URL}petition/${petition.petition_id}`
        ),
      });
    }
  }
}

async function updateProjectName(projectCode, nameTH, nameEN) {
  const rows = await getSheetValues("TEST_DEV");
  const headers = rows[0] || [];
  const hProj = headers.findIndex(h => String(h).includes("รหัสโครงงาน"));
  const hNameTH = headers.findIndex(h => String(h).trim().startsWith("ชื่อโครงงาน"));
  if (hProj === -1) return;

  const normCode = projectCode.replace(/\s+/g, "").toUpperCase();
  for (let i = 1; i < rows.length; i++) {
    const rowCode = String(rows[i][hProj] || "").replace(/\s+/g, "").toUpperCase();
    if (rowCode === normCode) {
      const updates = [];
      if (nameTH && hNameTH !== -1) updates.push({ col: hNameTH + 1, value: nameTH });
      if (updates.length) await updateRowCells("TEST_DEV", i + 1, updates);
    }
  }
}

async function updateProjectField(projectCode, newField) {
  const rows = await getSheetValues("TEST_DEV");
  const headers = rows[0] || [];
  const hProj = headers.findIndex(h => String(h).includes("รหัสโครงงาน"));
  const hField = headers.findIndex(h => String(h).includes("สาขา") || String(h).includes("field"));
  if (hProj === -1 || hField === -1) return;

  const normCode = projectCode.replace(/\s+/g, "").toUpperCase();
  for (let i = 1; i < rows.length; i++) {
    const rowCode = String(rows[i][hProj] || "").replace(/\s+/g, "").toUpperCase();
    if (rowCode === normCode) {
      await updateRowCells("TEST_DEV", i + 1, [{ col: hField + 1, value: newField }]);
    }
  }
}

// ── Email helpers ─────────────────────────────────────────────────

async function sendPetitionNotification(petitionId, toEmail, toName, type, projCode, projName, requesterName) {
  if (!toEmail?.includes("@")) return;
  await sendMail({
    to: toEmail,
    subject: `[คำร้อง] ${petitionId} รออนุมัติจากคุณ`,
    htmlBody: buildFlexEmailHtml(
      "📋 มีคำร้องรอการอนุมัติ", "#f97316",
      `<p>เรียน <strong>${toName || toEmail}</strong></p>
       <p>มีคำร้อง <strong>${PETITION_TYPES[type] || type}</strong> รอการอนุมัติจากคุณ</p>
       <div style="background:#f8fafc;padding:12px;border-radius:8px;margin:12px 0;border-left:4px solid #f97316;">
         <p style="margin:0 0 4px;font-size:14px;">📌 รหัสคำร้อง: <strong>${petitionId}</strong></p>
         <p style="margin:0 0 4px;font-size:14px;">📁 โครงงาน: <strong>${projCode} — ${projName}</strong></p>
         <p style="margin:0;font-size:14px;">👤 ผู้ยื่น: <strong>${requesterName}</strong></p>
       </div>`,
      "🔍 ตรวจสอบและอนุมัติ", `${WEB_URL}petition/${petitionId}`
    ),
  });
}

async function notifyRejected(petition, rejectorName, note) {
  if (!petition.requester_email?.includes("@")) return;
  await sendMail({
    to: petition.requester_email,
    subject: `[คำร้อง] ${petition.petition_id} ถูกปฏิเสธ`,
    htmlBody: buildFlexEmailHtml(
      "❌ คำร้องถูกปฏิเสธ", "#e11d48",
      `<p>เรียน <strong>${petition.requester_name}</strong></p>
       <p>คำร้อง <strong>${petition.petition_id}</strong> ถูกปฏิเสธโดย <strong>${rejectorName}</strong></p>
       ${note ? `<p>เหตุผล: ${note}</p>` : ""}
       <p>รหัสโครงงาน: <strong>${petition.project_code}</strong></p>`,
      "ดูรายละเอียด", `${WEB_URL}petition/${petition.petition_id}`
    ),
  });
}

async function notifyCompleted(petition) {
  if (!petition.requester_email?.includes("@")) return;
  await sendMail({
    to: petition.requester_email,
    subject: `[คำร้อง] ${petition.petition_id} ได้รับการอนุมัติเรียบร้อย`,
    htmlBody: buildFlexEmailHtml(
      "✅ คำร้องได้รับการอนุมัติ", "#10b981",
      `<p>เรียน <strong>${petition.requester_name}</strong></p>
       <p>คำร้อง <strong>${petition.petition_id}</strong> ได้รับการอนุมัติครบถ้วนแล้ว</p>
       <p>ประเภท: <strong>${PETITION_TYPES[petition.petition_type] || petition.petition_type}</strong></p>
       <p>โครงงาน: <strong>${petition.project_code} — ${petition.project_name}</strong></p>`,
      "ดูรายละเอียด", `${WEB_URL}petition/${petition.petition_id}`
    ),
  });
}

// ── Utils ─────────────────────────────────────────────────────────
function safeParseChain(json) {
  try { return JSON.parse(json); } catch { return {}; }
}

function getGroupInfoByAdvisorEmail(projectRows, advisorEmail) {
  const normEmail = normalizeEmail(advisorEmail);
  for (let i = 1; i < projectRows.length; i++) {
    const row = projectRows[i];
    const rowAdvEmail = normalizeEmail(String(row[8] || ""));
    if (rowAdvEmail === normEmail) {
      return getGroupInfo(projectRows, String(row[1] || ""));
    }
  }
  return { members: [], targetProjId: "", projectNameTH: "", advEmail: "", advName: "", coAdvEmail: "", coAdvName: "", schAdvEmail: "", schAdvName: "" };
}

// ================================================================
// Express router — mount in server.js
// ================================================================
const { Router } = require("express");
const router = Router();

const [authMW] = [requireAuth];

router.post("/",           authMW, createPetition);
router.get("/",            authMW, listPetitions);
router.get("/:id",         authMW, getPetitionDetail);
router.post("/:id/approve", authMW, (req, res) => handleApproval(req, res, "approve"));
router.post("/:id/reject",  authMW, (req, res) => handleApproval(req, res, "reject"));
router.post("/signature",  authMW, handleSignature);

module.exports = router;
