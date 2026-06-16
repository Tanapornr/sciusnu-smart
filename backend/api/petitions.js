// ================================================================
// api/petitions.js — Full online petition workflow
// Handles: create, list, detail, approve, reject, signature
// ================================================================
require("dotenv").config();
const crypto = require("crypto");
const { getSheetValues, appendRow, updateRowCells } = require("../lib/sheets");
const { sendMail, buildFlexEmailHtml, WEB_URL } = require("../lib/mail");
const { getGroupInfo, normalizeEmail, ADMIN_EMAILS } = require("../lib/helpers");
const { requireAuth, requireRole } = require("../lib/auth");
const { getAllSettings, getWindowStatus } = require("../lib/settings");
const GS_MAIN_TABLE_NAME = process.env.GS_MAIN_TABLE_NAME;

// ── Column indices for PETITIONS sheet ──────────────────────────
// petition_id | project_code | project_name | petition_type | requester_role |
// requester_email | requester_name | created_at | status | payload_json |
// current_step | final_result | updated_at |
// student1_status | student1_note | student1_signature | student1_time |
// student2_status | student2_note | student2_signature | student2_time |
// advisor_status | advisor_note | advisor_signature | advisor_time |
// coadvisor1_status | coadvisor1_note | coadvisor1_signature | coadvisor1_time |
// coadvisor2_status | coadvisor2_note | coadvisor2_signature | coadvisor2_time |
// admin_status | admin_note | admin_signature | admin_time | admin_name

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
  admin_status:       34,
  admin_note:         35,
  admin_signature:    36,
  admin_time:         37,
  admin_name:         38,
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
  "admin_status","admin_note","admin_signature","admin_time","admin_name",
];

// ── Signature Encryption / Decryption Helpers ────────────────────
const ENCRYPTION_KEY = crypto.createHash("sha256").update(process.env.SIGNATURE_KEY || "lhgfCX80k6jP5lImfhtt2T9C6DFivUXAvAJ2K").digest(); // 32 bytes
const IV_LENGTH = 16;

function encryptSignature(text) {
  if (!text) return "";
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decryptSignature(text) {
  if (!text) return "";
  const parts = text.split(":");
  if (parts.length !== 2) {
    // Legacy fallback
    try {
      const decoded = Buffer.from(text, "base64").toString("utf8");
      if (decoded.includes("<svg") || decoded.includes("data:image")) {
        return decoded;
      }
    } catch (e) {}
    return text;
  }
  try {
    const iv = Buffer.from(parts[0], "hex");
    const encryptedText = Buffer.from(parts[1], "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e) {
    console.error("Signature decryption failed:", e.message);
    return text;
  }
}

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
    student1:  { status: row[COL.student1_status-1]||"", note: row[COL.student1_note-1]||"", signature: decryptSignature(row[COL.student1_signature-1]), time: row[COL.student1_time-1]||"" },
    student2:  { status: row[COL.student2_status-1]||"", note: row[COL.student2_note-1]||"", signature: decryptSignature(row[COL.student2_signature-1]), time: row[COL.student2_time-1]||"" },
    advisor:   { status: row[COL.advisor_status-1]||"",  note: row[COL.advisor_note-1]||"",  signature: decryptSignature(row[COL.advisor_signature-1]),  time: row[COL.advisor_time-1]||"" },
    coadvisor1:{ status: row[COL.coadvisor1_status-1]||"", note: row[COL.coadvisor1_note-1]||"", signature: decryptSignature(row[COL.coadvisor1_signature-1]), time: row[COL.coadvisor1_time-1]||"" },
    coadvisor2:{ status: row[COL.coadvisor2_status-1]||"", note: row[COL.coadvisor2_note-1]||"", signature: decryptSignature(row[COL.coadvisor2_signature-1]), time: row[COL.coadvisor2_time-1]||"" },
    admin:     { status: row[COL.admin_status-1]||"",  note: row[COL.admin_note-1]||"",  signature: decryptSignature(row[COL.admin_signature-1]),  time: row[COL.admin_time-1]||"", name: row[COL.admin_name-1]||"" },
  };
}

/**
 * Build the approval chain from project data (admin is handled separately).
 * Normal order: students → advisors → admin.
 * When the requester is the main advisor, THEY filed the petition, so it makes more
 * sense for the advisor stage to go first and the student stage second — the advisor
 * shouldn't be stuck waiting behind students for something the advisor themself asked for.
 * `requesterRole` flips that ordering; both stages still require everyone's signature,
 * just in a different sequence.
 */
function buildApprovalChain(groupInfo, existingEmails = new Set(), requesterRole = "student") {
  const chain = [];
  if (groupInfo.members.length > 0) chain.push({ role: "student1", email: groupInfo.members[0]?.email || "", name: groupInfo.members[0]?.firstName + " " + groupInfo.members[0]?.lastName });
  if (groupInfo.members.length > 1) chain.push({ role: "student2", email: groupInfo.members[1]?.email || "", name: groupInfo.members[1]?.firstName + " " + groupInfo.members[1]?.lastName });
  if (groupInfo.advEmail)    chain.push({ role: "advisor",    email: groupInfo.advEmail,    name: groupInfo.advName });
  if (groupInfo.coAdvEmail)  chain.push({ role: "coadvisor1", email: groupInfo.coAdvEmail,  name: groupInfo.coAdvName,  token: !existingEmails.has(groupInfo.coAdvEmail.toLowerCase())  ? crypto.randomBytes(32).toString("hex") : undefined });
  if (groupInfo.schAdvEmail) chain.push({ role: "coadvisor2", email: groupInfo.schAdvEmail, name: groupInfo.schAdvName, token: !existingEmails.has(groupInfo.schAdvEmail.toLowerCase()) ? crypto.randomBytes(32).toString("hex") : undefined });
  chain.push({ role: "admin", email: "admin", name: "ผู้ดูแลระบบ" });

  // "advisor_first" = advisors → students → admin (used when an advisor files the petition).
  // "student_first" = students → advisors → admin (default, student-filed petitions).
  const stageOrder = requesterRole === "advisor_main" ? "advisor_first" : "student_first";
  return { chain, stageOrder };
}

/** Returns the ordered list of non-admin stage names for a given stageOrder tag. */
function getStageSequence(stageOrder) {
  return stageOrder === "advisor_first" ? ["advisors", "students"] : ["students", "advisors"];
}

/** Determine what role the current user plays in a petition's approval chain */
function getUserRoleInChain(petition, userEmail, userRole, chain) {
  const email = normalizeEmail(userEmail);
  for (const step of chain) {
    if (step.role === "admin") continue; // admin matched by role below
    const stepEmail = normalizeEmail(step.email);
    if (stepEmail && stepEmail === email) return step.role;
  }
  if (userRole === "admin") return "admin";
  return null;
}

/**
 * Determine the current active approval stage, respecting stageOrder:
 *   "student_first" (default, student-filed petitions): students → advisors → admin
 *   "advisor_first" (advisor-filed petitions):           advisors → students → admin
 * Returns "students" | "advisors" | "admin" | "done".
 */
function getPendingStage(petition, chain, stageOrder = "student_first") {
  const studentRoles = chain.filter(s => s.role.startsWith("student")).map(s => s.role);
  const advisorRoles  = chain.filter(s => ["advisor","coadvisor1","coadvisor2"].includes(s.role)).map(s => s.role);

  const allStudentsDone  = studentRoles.every(r => petition[r]?.status);
  const allAdvisorsDone  = advisorRoles.every(r => petition[r]?.status);
  const adminDone        = !!petition.admin?.status;

  const doneMap = { students: allStudentsDone, advisors: allAdvisorsDone };
  const sequence = getStageSequence(stageOrder);

  for (const stage of sequence) {
    if (!doneMap[stage]) return stage;
  }
  if (!adminDone) return "admin";
  return "done";
}

async function ensurePetitionsSheet() {
  try {
    const rows = await getSheetValues(SHEET);
    if (!rows.length) {
      await appendRow(SHEET, HEADERS);
    } else {
      const currentHeaders = rows[0] || [];
      if (currentHeaders.length < HEADERS.length) {
        const updates = HEADERS.map((h, index) => ({ col: index + 1, value: h }));
        await updateRowCells(SHEET, 1, updates);
      }
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

    const petitionTypeNum = Number(petition_type);

    // ── Date-window guard: types 1/2/3 (เพิ่ม/ถอดถอนอาจารย์ที่ปรึกษา) ──
    if ([1, 2, 3].includes(petitionTypeNum)) {
      const settings = await getAllSettings();
      const setting  = settings.petition_advisor;
      const { isOpen, hasLimit } = getWindowStatus(setting);
      if (hasLimit && !isOpen) {
        return res.status(400).json({
          status: "error",
          message: "ขณะนี้ไม่อยู่ในช่วงเวลาที่เปิดให้ยื่นคำร้องเพิ่ม/ถอดถอนอาจารย์ที่ปรึกษา",
        });
      }
    }

    // Fetch project data to build approval chain
    const projectRows = await getSheetValues(GS_MAIN_TABLE_NAME);

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

    // ── Guard: block if the co-advisor slot is already filled in the sheet ──
    // (Check BEFORE injecting the new advisor from payload — groupInfo still
    //  reflects the sheet at this point, so a non-empty slot means it is taken.)
    if (petitionTypeNum === 1 && groupInfo.coAdvEmail) {
      return res.status(400).json({
        status: "error",
        message: `โครงงานนี้มีอาจารย์ที่ปรึกษาร่วมอยู่แล้ว (${groupInfo.coAdvName || groupInfo.coAdvEmail}) ไม่สามารถเพิ่มได้อีก`,
      });
    }
    if (petitionTypeNum === 2 && groupInfo.schAdvEmail) {
      return res.status(400).json({
        status: "error",
        message: `โครงงานนี้มีอาจารย์ที่ปรึกษาโรงเรียนอยู่แล้ว (${groupInfo.schAdvName || groupInfo.schAdvEmail}) ไม่สามารถเพิ่มได้อีก`,
      });
    }

    // For type 1 (add university coadvisor) or type 2 (add school coadvisor),
    // inject the new advisor's info from the petition payload into groupInfo
    // so buildApprovalChain picks them up as a chain step.
    if (petitionTypeNum === 1) {
      const coAdvEmail = payload?.advisorEmail || payload?.newCoAdvEmail;
      const coAdvName  = payload?.advisorName  || payload?.newCoAdvName;
      if (coAdvEmail) {
        groupInfo.coAdvEmail = coAdvEmail.trim().toLowerCase();
        groupInfo.coAdvName  = coAdvName  || coAdvEmail;
      }
    }
    if (petitionTypeNum === 2) {
      const schAdvEmail = payload?.schoolAdvisorEmail || payload?.newSchAdvEmail;
      const schAdvName  = payload?.schoolAdvisorName  || payload?.newSchAdvName;
      if (schAdvEmail) {
        groupInfo.schAdvEmail = schAdvEmail.trim().toLowerCase();
        groupInfo.schAdvName  = schAdvName  || schAdvEmail;
      }
    }

    // After fetching projectRows:
    const existingEmails = new Set();
    for (let i = 1; i < projectRows.length; i++) {
      [0, 8, 12, 15].forEach(col => {
        const e = String(projectRows[i][col] || "").trim().toLowerCase();
        if (e.includes("@")) existingEmails.add(e);
      });
    }
    const { chain, stageOrder } = buildApprovalChain(groupInfo, existingEmails, user.role);
    if (chain.length === 0) {
      return res.status(400).json({ status: "error", message: "ไม่พบผู้อนุมัติ" });
    }

    const petitionId = generatePetitionId();
    const now = new Date().toISOString();
    const chainJson = JSON.stringify({ chain, stageOrder, payload: payload || {} });
    const firstStage = getStageSequence(stageOrder)[0];

    const row = new Array(38).fill("");
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
    row[COL.current_step - 1]    = firstStage;
    row[COL.final_result - 1]    = "";
    row[COL.updated_at - 1]      = now;

    await appendRow(SHEET, row);

    // Notify everyone in the FIRST stage simultaneously (students, or advisors if
    // an advisor filed the petition — see stageOrder above).
    const projCode = groupInfo.targetProjId || project_code;
    const projName = groupInfo.projectNameTH || project_name;

    if (firstStage === "students") {
      const studentSteps = chain.filter(s => s.role.startsWith("student"));
      for (const step of studentSteps) {
        sendPetitionNotification(petitionId, step.email, step.name,
          petition_type, projCode, projName, user.name).catch(console.error);
      }
    } else {
      const advisorSteps = chain.filter(s => ["advisor", "coadvisor1", "coadvisor2"].includes(s.role));
      for (const step of advisorSteps) {
        if (step.token) {
          sendMagicLinkNotification(petitionId, step.email, step.name, petition_type, projCode, projName, user.name, step.token).catch(console.error);
        } else {
          sendPetitionNotification(petitionId, step.email, step.name,
            petition_type, projCode, projName, user.name).catch(console.error);
        }
      }
    }

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
          stageOrder: chainData.stageOrder || "student_first",
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
  const { note, signature, adminName } = req.body;

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
      const stageOrder = chainData.stageOrder || "student_first";

      // Determine active stage
      const activeStage = getPendingStage(p, chain, stageOrder);
      if (activeStage === "done") {
        return res.status(400).json({ status: "error", message: "คำร้องได้รับการอนุมัติครบถ้วนแล้ว" });
      }

      // Determine this user's role
      const userChainRole = getUserRoleInChain(p, user.email, user.role, chain);
      if (!userChainRole) {
        return res.status(403).json({ status: "error", message: "คุณไม่มีสิทธิ์อนุมัติคำร้องนี้" });
      }

      // Validate user belongs to the active stage
      const stageRoles = {
        students: chain.filter(s => s.role.startsWith("student")).map(s => s.role),
        advisors: chain.filter(s => ["advisor","coadvisor1","coadvisor2"].includes(s.role)).map(s => s.role),
        admin:    ["admin"],
      };
      if (!stageRoles[activeStage]?.includes(userChainRole)) {
        return res.status(400).json({ status: "error", message: "ยังไม่ถึงขั้นตอนของคุณ" });
      }

      // Prevent double approval
      if (p[userChainRole]?.status) {
        return res.status(400).json({ status: "error", message: "คุณได้ดำเนินการแล้ว" });
      }

      const now = new Date().toISOString();
      const statusVal = action === "approve" ? "อนุมัติ" : "ปฏิเสธ";

      // Encrypt signature with AES-256-CBC
      const encryptedSig = encryptSignature(signature);

      // Build column updates for this user's role
      const roleColMap = {
        student1:   { status: COL.student1_status,   note: COL.student1_note,   sig: COL.student1_signature,   time: COL.student1_time },
        student2:   { status: COL.student2_status,   note: COL.student2_note,   sig: COL.student2_signature,   time: COL.student2_time },
        advisor:    { status: COL.advisor_status,    note: COL.advisor_note,    sig: COL.advisor_signature,    time: COL.advisor_time },
        coadvisor1: { status: COL.coadvisor1_status, note: COL.coadvisor1_note, sig: COL.coadvisor1_signature, time: COL.coadvisor1_time },
        coadvisor2: { status: COL.coadvisor2_status, note: COL.coadvisor2_note, sig: COL.coadvisor2_signature, time: COL.coadvisor2_time },
        admin:      { status: COL.admin_status,      note: COL.admin_note,      sig: COL.admin_signature,      time: COL.admin_time },
      };

      const cols = roleColMap[userChainRole];
      if (!cols) return res.status(400).json({ status: "error", message: "ประเภทผู้ใช้งานไม่ถูกต้อง" });

      const updates = [
        { col: cols.status, value: statusVal },
        { col: cols.note,   value: note || "" },
        { col: cols.sig,    value: encryptedSig },
        { col: cols.time,   value: now },
        { col: COL.updated_at, value: now },
      ];

      // Save admin name if this is the admin step
      if (userChainRole === "admin" && adminName) {
        updates.push({ col: COL.admin_name, value: adminName });
      }

      // ── Handle REJECT ──────────────────────────────────────────
      if (action === "reject") {
        updates.push({ col: COL.status,       value: "ปฏิเสธ" });
        updates.push({ col: COL.final_result, value: "ปฏิเสธ" });
        updates.push({ col: COL.current_step, value: "สิ้นสุด" });
        await updateRowCells(SHEET, p._row, updates);
        notifyRejected(p, userChainRole === "admin" ? (adminName || "ผู้ดูแลระบบ") : user.name, note).catch(console.error);
        return res.json({ status: "success", message: "ปฏิเสธคำร้องแล้ว" });
      }

      // ── Handle APPROVE ─────────────────────────────────────────
      // Compute stage state AFTER this approval
      // Build a temporary in-memory snapshot of petition with this approval applied
      const updatedP = Object.assign({}, p, {
        [userChainRole]: { status: statusVal, note: note || "", signature: encryptedSig, time: now }
      });
      const nextStage = getPendingStage(updatedP, chain, stageOrder);

      if (nextStage === "done") {
        // All stages complete — finalise
        updates.push({ col: COL.status,       value: "เสร็จสิ้น" });
        updates.push({ col: COL.final_result, value: "อนุมัติ" });
        updates.push({ col: COL.current_step, value: "สิ้นสุด" });
        await updateRowCells(SHEET, p._row, updates);
        await handlePostApproval(p, chainData.payload).catch(console.error);
        notifyCompleted(p).catch(console.error);
      } else if (nextStage !== activeStage) {
        // Stage transition — notify the next group
        updates.push({ col: COL.current_step, value: nextStage });
        await updateRowCells(SHEET, p._row, updates);

        if (nextStage === "students") {
          const studentSteps = chain.filter(s => s.role.startsWith("student"));
          for (const step of studentSteps) {
            sendPetitionNotification(p.petition_id, step.email, step.name, p.petition_type, p.project_code, p.project_name, p.requester_name).catch(console.error);
          }
        } else if (nextStage === "advisors") {
          const advisorSteps = chain.filter(s => ["advisor","coadvisor1","coadvisor2"].includes(s.role));
          for (const step of advisorSteps) {
            if (step.token) {
              // New co-advisor (no account): send magic link email
              sendMagicLinkNotification(p.petition_id, step.email, step.name, p.petition_type, p.project_code, p.project_name, p.requester_name, step.token).catch(console.error);
            } else {
              sendPetitionNotification(p.petition_id, step.email, step.name, p.petition_type, p.project_code, p.project_name, p.requester_name).catch(console.error);
            }
          }
        } else if (nextStage === "admin") {
          // Notify all admins
          for (const adminEmail of ADMIN_EMAILS) {
            sendPetitionAdminNotification(p.petition_id, adminEmail,
              p.petition_type, p.project_code, p.project_name, p.requester_name).catch(console.error);
          }
        }
      } else {
        // Same stage, just save this user's approval (others in stage still pending)
        await updateRowCells(SHEET, p._row, updates);
      }

      return res.json({ status: "success", message: "อนุมัติแล้ว" });
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
// Called only after admin has approved and petition is fully done
// ================================================================
async function handlePostApproval(petition, payload) {
  const type = Number(petition.petition_type);

  if (type === 4 && (payload.newNameTH || payload.newNameEN)) {
    await updateProjectName(petition.project_code, payload.newNameTH, payload.newNameEN);
  }

  if (type === 5 && payload.newField) {
    await updateProjectField(petition.project_code, payload.newField);
  }
}

async function updateProjectName(projectCode, nameTH, nameEN) {
  const rows = await getSheetValues(GS_MAIN_TABLE_NAME);
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
      if (updates.length) await updateRowCells(GS_MAIN_TABLE_NAME, i + 1, updates);
    }
  }
}

async function updateProjectField(projectCode, newField) {
  const rows = await getSheetValues(GS_MAIN_TABLE_NAME);
  const headers = rows[0] || [];
  const hProj = headers.findIndex(h => String(h).includes("รหัสโครงงาน"));
  const hField = headers.findIndex(h => String(h).includes("สาขา") || String(h).includes("field"));
  if (hProj === -1 || hField === -1) return;

  const normCode = projectCode.replace(/\s+/g, "").toUpperCase();
  for (let i = 1; i < rows.length; i++) {
    const rowCode = String(rows[i][hProj] || "").replace(/\s+/g, "").toUpperCase();
    if (rowCode === normCode) {
      await updateRowCells(GS_MAIN_TABLE_NAME, i + 1, [{ col: hField + 1, value: newField }]);
    }
  }
}

// ================================================================
// POST /api/petitions/approve-by-token  — Token-based approval
// PUBLIC — no JWT required. Used by new co-advisors who have no account.
// ================================================================
async function handleTokenApproval(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { token, signature, note, action } = req.body;  // action: "approve" | "reject"

  if (!token) return res.status(400).json({ status: "error", message: "ไม่พบ token" });
  if (!signature) return res.status(400).json({ status: "error", message: "กรุณาลงนามก่อนดำเนินการ" });

  try {
    await ensurePetitionsSheet();
    const rows = await getSheetValues(SHEET);

    for (let i = 1; i < rows.length; i++) {
      const p = rowToPetition(rows[i], i + 1);
      if (!p || !p.petition_id) continue;
      if (p.status === "เสร็จสิ้น" || p.status === "ปฏิเสธ") continue;

      const chainData = safeParseChain(p.payload_json);
      const chain = chainData.chain || [];
      const stageOrder = chainData.stageOrder || "student_first";

      // Find the chain step that matches this token
      const step = chain.find(s => s.token === token);
      if (!step) continue;

      // Token found — check role hasn't already approved
      if (p[step.role]?.status) {
        return res.status(400).json({ status: "error", message: "ได้ดำเนินการไปแล้ว" });
      }

      // Check it's the advisor stage
      const activeStage = getPendingStage(p, chain, stageOrder);
      if (activeStage !== "advisors") {
        const waitMsg = activeStage === "students" ? "ยังไม่ถึงขั้นตอนของคุณ (รอนักเรียนอนุมัติก่อน)" : "ยังไม่ถึงขั้นตอนของคุณ";
        return res.status(400).json({ status: "error", message: waitMsg });
      }

      const now = new Date().toISOString();
      const statusVal = (action === "reject") ? "ปฏิเสธ" : "อนุมัติ";
      const encryptedSig = encryptSignature(signature);

      const roleColMap = {
        advisor:    { status: COL.advisor_status,    note: COL.advisor_note,    sig: COL.advisor_signature,    time: COL.advisor_time },
        coadvisor1: { status: COL.coadvisor1_status, note: COL.coadvisor1_note, sig: COL.coadvisor1_signature, time: COL.coadvisor1_time },
        coadvisor2: { status: COL.coadvisor2_status, note: COL.coadvisor2_note, sig: COL.coadvisor2_signature, time: COL.coadvisor2_time },
      };
      const cols = roleColMap[step.role];
      if (!cols) return res.status(400).json({ status: "error", message: "บทบาทไม่ถูกต้อง" });

      const updates = [
        { col: cols.status, value: statusVal },
        { col: cols.note,   value: note || "" },
        { col: cols.sig,    value: encryptedSig },
        { col: cols.time,   value: now },
        { col: COL.updated_at, value: now },
      ];

      if (action === "reject") {
        updates.push({ col: COL.status,       value: "ปฏิเสธ" });
        updates.push({ col: COL.final_result, value: "ปฏิเสธ" });
        updates.push({ col: COL.current_step, value: "สิ้นสุด" });
        await updateRowCells(SHEET, p._row, updates);
        notifyRejected(p, step.name, note).catch(console.error);
        return res.json({ status: "success", message: "ปฏิเสธคำร้องแล้ว", petition_id: p.petition_id });
      }

      // Approve — check if stage is complete after this
      const updatedP = Object.assign({}, p, { [step.role]: { status: statusVal } });
      const nextStage = getPendingStage(updatedP, chain, stageOrder);

      if (nextStage === "done") {
        updates.push({ col: COL.status,       value: "เสร็จสิ้น" });
        updates.push({ col: COL.final_result, value: "อนุมัติ" });
        updates.push({ col: COL.current_step, value: "สิ้นสุด" });
        await updateRowCells(SHEET, p._row, updates);
        await handlePostApproval(p, chainData.payload).catch(console.error);
        notifyCompleted(p).catch(console.error);
      } else if (nextStage !== activeStage) {
        updates.push({ col: COL.current_step, value: nextStage });
        await updateRowCells(SHEET, p._row, updates);
        if (nextStage === "students") {
          const studentSteps = chain.filter(s => s.role.startsWith("student"));
          for (const studentStep of studentSteps) {
            sendPetitionNotification(p.petition_id, studentStep.email, studentStep.name, p.petition_type, p.project_code, p.project_name, p.requester_name).catch(console.error);
          }
        } else if (nextStage === "admin") {
          for (const adminEmail of ADMIN_EMAILS) {
            sendPetitionAdminNotification(p.petition_id, adminEmail, p.petition_type, p.project_code, p.project_name, p.requester_name).catch(console.error);
          }
        }
      } else {
        await updateRowCells(SHEET, p._row, updates);
      }

      return res.json({ status: "success", message: "อนุมัติแล้ว", petition_id: p.petition_id });
    }

    return res.status(404).json({ status: "error", message: "ไม่พบคำร้องหรือ token ไม่ถูกต้อง" });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
  }
}

// Add a public GET endpoint for the token page to load petition info
async function getPetitionByToken(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const { token } = req.query;
  if (!token) return res.status(400).json({ status: "error", message: "ไม่พบ token" });

  try {
    await ensurePetitionsSheet();
    const rows = await getSheetValues(SHEET);
    for (let i = 1; i < rows.length; i++) {
      const p = rowToPetition(rows[i], i + 1);
      if (!p) continue;
      const chainData = safeParseChain(p.payload_json);
      const step = (chainData.chain || []).find(s => s.token === token);
      if (!step) continue;

      // Return petition info + the approver's name (no sensitive data)
      return res.json({
        status: "success",
        petition: {
          petition_id:        p.petition_id,
          petition_type:      p.petition_type,
          petition_type_label: PETITION_TYPES[p.petition_type] || p.petition_type,
          project_code:       p.project_code,
          project_name:       p.project_name,
          requester_name:     p.requester_name,
          petition_status:    p.status,
          approver_name:      step.name,
          approver_role:      step.role,
          already_actioned:   !!p[step.role]?.status,
          my_status:          p[step.role]?.status || "",
          active_stage:       getPendingStage(p, chainData.chain || [], chainData.stageOrder || "student_first"),
        },
      });
    }
    return res.status(404).json({ status: "error", message: "ไม่พบคำร้องหรือ token หมดอายุ" });
  } catch (e) {
    return res.status(500).json({ status: "error", message: e.message });
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

async function sendPetitionAdminNotification(petitionId, toEmail, type, projCode, projName, requesterName) {
  if (!toEmail?.includes("@")) return;
  await sendMail({
    to: toEmail,
    subject: `[SCiUS-Admin] คำร้อง ${petitionId} รออนุมัติจากผู้ดูแลระบบ`,
    htmlBody: buildFlexEmailHtml(
      "🛡️ คำร้องรอการอนุมัติจาก Admin", "#7c3aed",
      `<p>คำร้องได้รับการอนุมัติจากนักเรียนและอาจารย์ครบถ้วนแล้ว รอการอนุมัติขั้นสุดท้ายจากผู้ดูแลระบบ</p>
       <div style="background:#f8fafc;padding:12px;border-radius:8px;margin:12px 0;border-left:4px solid #7c3aed;">
         <p style="margin:0 0 4px;font-size:14px;">📌 รหัสคำร้อง: <strong>${petitionId}</strong></p>
         <p style="margin:0 0 4px;font-size:14px;">📋 ประเภท: <strong>${PETITION_TYPES[type] || type}</strong></p>
         <p style="margin:0 0 4px;font-size:14px;">📁 โครงงาน: <strong>${projCode} — ${projName}</strong></p>
         <p style="margin:0;font-size:14px;">👤 ผู้ยื่น: <strong>${requesterName}</strong></p>
       </div>`,
      "✅ เข้าสู่ระบบเพื่ออนุมัติ", `${WEB_URL}petition/${petitionId}`
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

async function sendMagicLinkNotification(petitionId, toEmail, toName, type, projCode, projName, requesterName, token) {
  if (!toEmail?.includes("@")) return;
  const approveUrl = `${WEB_URL}?petitionToken=${token}`;
  await sendMail({
    to: toEmail,
    subject: `[คำร้อง] ${petitionId} ต้องการลายเซ็นของคุณ`,
    htmlBody: buildFlexEmailHtml(
      "📋 มีคำร้องรอลายเซ็นของคุณ", "#8b5cf6",
      `<p>เรียน <strong>${toName || toEmail}</strong></p>
       <p>คุณได้รับการเพิ่มเป็นอาจารย์ที่ปรึกษาในคำร้อง <strong>${PETITION_TYPES[type] || type}</strong></p>
       <div style="background:#f8fafc;padding:12px;border-radius:8px;margin:12px 0;border-left:4px solid #8b5cf6;">
         <p style="margin:0 0 4px;font-size:14px;">📌 รหัสคำร้อง: <strong>${petitionId}</strong></p>
         <p style="margin:0 0 4px;font-size:14px;">📁 โครงงาน: <strong>${projCode} — ${projName}</strong></p>
         <p style="margin:0;font-size:14px;">👤 ผู้ยื่น: <strong>${requesterName}</strong></p>
       </div>`,
      "✍️ คลิกที่นี่เพื่อลงนาม", approveUrl
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

// ── Public token routes (NO auth) — must be BEFORE /:id ──────────
router.get("/approve-by-token",  getPetitionByToken);
router.post("/approve-by-token", handleTokenApproval);

// ── Authenticated routes ──────────────────────────────────────────
router.post("/",            authMW, createPetition);
router.get("/",             authMW, listPetitions);
router.post("/signature",   authMW, handleSignature);
router.get("/:id",          authMW, getPetitionDetail);
router.post("/:id/approve", authMW, (req, res) => handleApproval(req, res, "approve"));
router.post("/:id/reject",  authMW, (req, res) => handleApproval(req, res, "reject"));

module.exports = router;