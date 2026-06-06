// ================================================================
// petitions.gs  (new file — replaces petition section of Code.gs)
//
// HOW TO USE:
//   1. Create petitions.gs in your Apps Script project
//   2. Paste this file into it
//   3. Remove all petition-related functions from Code.gs:
//      ensurePetitionSheet, getPetitionRows, appendPetitionRow,
//      updatePetitionRow, findPetitionRow, generatePetitionId,
//      handleCreatePetition, handleListPetitions, handleGetPetition,
//      handleApprovePetition, handleRejectPetition,
//      processApprovalAction, handlePostApprovalGS,
//      updateProjectNameGS, updateProjectFieldGS,
//      rowToPetitionObject, getPetitionTypeLabel, initPetitionSheet
//
// CHANGES vs original Code.gs:
//   1. processApprovalAction uses ES5-safe loops (no findIndex)
//   2. Order enforcement: prior steps must be approved before yours
//   3. admin role is included in roleColMap (was missing before)
// ================================================================

var PETITION_SHEET_NAME = "PETITIONS";

var PETITION_HEADERS = [
  "petition_id","project_code","project_name","petition_type","requester_role",
  "requester_email","requester_name","created_at","status","payload_json",
  "current_step","final_result","updated_at",
  "student1_status","student1_note","student1_signature","student1_time",
  "student2_status","student2_note","student2_signature","student2_time",
  "advisor_status","advisor_note","advisor_signature","advisor_time",
  "coadvisor1_status","coadvisor1_note","coadvisor1_signature","coadvisor1_time",
  "coadvisor2_status","coadvisor2_note","coadvisor2_signature","coadvisor2_time",
  "admin_status","admin_note","admin_signature","admin_time","admin_name"
];

// Role → { status, note, sig, time } column indices (1-based)
var ROLE_COL_MAP = {
  student1:   { status: 14, note: 15, sig: 16, time: 17 },
  student2:   { status: 18, note: 19, sig: 20, time: 21 },
  advisor:    { status: 22, note: 23, sig: 24, time: 25 },
  coadvisor1: { status: 26, note: 27, sig: 28, time: 29 },
  coadvisor2: { status: 30, note: 31, sig: 32, time: 33 },
  admin:      { status: 34, note: 35, sig: 36, time: 37 }
};

// ── Sheet helpers ─────────────────────────────────────────────────

function ensurePetitionSheet() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(PETITION_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PETITION_SHEET_NAME);
    sheet.appendRow(PETITION_HEADERS);
    var hRange = sheet.getRange(1, 1, 1, PETITION_HEADERS.length);
    hRange.setBackground("#ea580c");
    hRange.setFontColor("#ffffff");
    hRange.setFontWeight("bold");
    sheet.setFrozenRows(1);
    Logger.log("PETITIONS sheet created");
  }
  return sheet;
}

function getPetitionRows() {
  var sheet   = ensurePetitionSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, PETITION_HEADERS.length).getValues();
}

function appendPetitionRow(rowData) {
  var sheet   = ensurePetitionSheet();
  sheet.appendRow(rowData);
  var lastRow = sheet.getLastRow();
  if (lastRow % 2 === 0) {
    sheet.getRange(lastRow, 1, 1, PETITION_HEADERS.length).setBackground("#fff7ed");
  }
  return lastRow;
}

function updatePetitionRow(rowIndex, updates) {
  var sheet = ensurePetitionSheet();
  for (var i = 0; i < updates.length; i++) {
    sheet.getRange(rowIndex, updates[i].col).setValue(updates[i].value);
  }
}

function findPetitionRow(petitionId) {
  var rows = getPetitionRows();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === petitionId) {
      return { row: rows[i], rowIndex: i + 2 }; // +2: header row + 0-index
    }
  }
  return null;
}

function generatePetitionId() {
  var now    = new Date();
  var beYear = String(now.getFullYear() + 543).slice(-2);
  var month  = String(now.getMonth() + 1).padStart(2, "0");
  var rand   = Math.floor(Math.random() * 9000) + 1000;
  return "PET-" + beYear + month + "-" + rand;
}

// ── Petition action handlers ──────────────────────────────────────

function handleCreatePetition(payload) {
  try {
    ensurePetitionSheet();
    var petitionId = generatePetitionId();
    var now        = new Date().toISOString();

    var chainData  = {
      chain:   payload.chain || [],
      payload: payload.petitionPayload || {}
    };
    var firstStep = chainData.chain.length > 0 ? chainData.chain[0] : {};

    var row = new Array(PETITION_HEADERS.length).fill("");
    row[0]  = petitionId;
    row[1]  = payload.project_code   || "";
    row[2]  = payload.project_name   || "";
    row[3]  = String(payload.petition_type || "");
    row[4]  = payload.requester_role  || "";
    row[5]  = payload.requester_email || "";
    row[6]  = payload.requester_name  || "";
    row[7]  = now;
    row[8]  = "รอดำเนินการ";
    row[9]  = JSON.stringify(chainData);
    row[10] = firstStep.role || "";
    row[11] = "";
    row[12] = now;

    appendPetitionRow(row);
    return jsonResponse({ status: "success", petition_id: petitionId });
  } catch(e) {
    return errorResponse(e.message);
  }
}

function handleListPetitions(payload) {
  try {
    var rows      = getPetitionRows();
    var petitions = [];
    var userEmail = (payload.userEmail || "").trim().toLowerCase();
    var userRole  = payload.userRole || "";

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row[0]) continue;
      var include = false;

      if (userRole === "admin") {
        include = true;
      } else {
        var requesterEmail = (row[5] || "").trim().toLowerCase();
        if (requesterEmail === userEmail) {
          include = true;
        } else {
          try {
            var chainData = JSON.parse(row[9] || "{}");
            var chain     = chainData.chain || [];
            for (var j = 0; j < chain.length; j++) {
              if ((chain[j].email || "").trim().toLowerCase() === userEmail) {
                include = true; break;
              }
            }
          } catch(e) {}
        }
      }

      if (include) petitions.push(rowToPetitionObject(row));
    }
    petitions.reverse();
    return jsonResponse({ status: "success", petitions: petitions });
  } catch(e) {
    return errorResponse(e.message);
  }
}

function handleGetPetition(payload) {
  try {
    var result = findPetitionRow(payload.petition_id);
    if (!result) return errorResponse("ไม่พบคำร้อง");

    var petition = rowToPetitionObject(result.row);
    try {
      var chainData    = JSON.parse(result.row[9] || "{}");
      petition.chain   = chainData.chain   || [];
      petition.payload = chainData.payload || {};
    } catch(e) {
      petition.chain = []; petition.payload = {};
    }
    return jsonResponse({ status: "success", petition: petition });
  } catch(e) {
    return errorResponse(e.message);
  }
}

function handleApprovePetition(payload) {
  return processApprovalAction(payload, "อนุมัติ");
}

function handleRejectPetition(payload) {
  return processApprovalAction(payload, "ปฏิเสธ");
}

// ── processApprovalAction (ES5-safe + order enforcement) ─────────

function processApprovalAction(payload, action) {
  try {
    var result = findPetitionRow(payload.petition_id);
    if (!result) return errorResponse("ไม่พบคำร้อง");

    var row      = result.row;
    var rowIndex = result.rowIndex;

    var chainData;
    try { chainData = JSON.parse(row[9] || "{}"); }
    catch(e) { return errorResponse("ข้อมูลคำร้องเสียหาย"); }

    var chain     = chainData.chain || [];
    var userEmail = (payload.userEmail || "").trim().toLowerCase();

    // ── Find actor's index in chain (ES5-safe — no findIndex) ────
    var actorIndex = -1;
    var actorRole  = "";
    for (var i = 0; i < chain.length; i++) {
      if ((chain[i].email || "").trim().toLowerCase() === userEmail) {
        actorIndex = i;
        actorRole  = chain[i].role;
        break;
      }
    }
    if (actorIndex === -1) return errorResponse("คุณไม่มีสิทธิ์ดำเนินการคำร้องนี้");

    var cols = ROLE_COL_MAP[actorRole];
    if (!cols) return errorResponse("บทบาทไม่ถูกต้อง: " + actorRole);

    // ── Order enforcement: all prior chain steps must be approved ─
    if (action === "อนุมัติ") {
      for (var j = 0; j < actorIndex; j++) {
        var prevRole = chain[j].role;
        var prevCols = ROLE_COL_MAP[prevRole];
        if (prevCols) {
          var prevStatus = String(row[prevCols.status - 1] || "");
          if (prevStatus !== "อนุมัติ") {
            return errorResponse("ต้องรอขั้นตอนก่อนหน้าอนุมัติก่อน");
          }
        }
      }
    }

    var now        = new Date().toISOString();
    var encodedSig = Utilities.base64Encode(payload.signature || "");

    var updates = [
      { col: cols.status, value: action },
      { col: cols.note,   value: payload.note || "" },
      { col: cols.sig,    value: encodedSig },
      { col: cols.time,   value: now },
      { col: 13,          value: now }  // updated_at
    ];

    if (action === "ปฏิเสธ") {
      updates.push({ col: 9,  value: "ปฏิเสธ" });   // status
      updates.push({ col: 12, value: "ปฏิเสธ" });   // final_result
      updates.push({ col: 11, value: "สิ้นสุด" });  // current_step
    } else {
      // Find next step (ES5-safe — no findIndex)
      var nextStep = (actorIndex + 1 < chain.length) ? chain[actorIndex + 1] : null;

      if (nextStep) {
        updates.push({ col: 11, value: nextStep.role });
      } else {
        // All chain steps approved
        updates.push({ col: 9,  value: "เสร็จสิ้น" });
        updates.push({ col: 12, value: "อนุมัติ" });
        updates.push({ col: 11, value: "สิ้นสุด" });
        handlePostApprovalGS(row, chainData.payload || {});
      }
    }

    updatePetitionRow(rowIndex, updates);
    return jsonResponse({
      status:  "success",
      message: action === "อนุมัติ" ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว"
    });

  } catch(e) {
    return errorResponse(e.message);
  }
}

// ── Post-approval automation (Types 4 & 5) ───────────────────────

function handlePostApprovalGS(petitionRow, petitionPayload) {
  var type        = Number(petitionRow[3]);
  var projectCode = String(petitionRow[1] || "");
  try {
    if (type === 4 && (petitionPayload.newNameTH || petitionPayload.newNameEN)) {
      updateProjectNameGS(projectCode, petitionPayload.newNameTH, petitionPayload.newNameEN);
    } else if (type === 5 && petitionPayload.newField) {
      updateProjectFieldGS(projectCode, petitionPayload.newField);
    }
  } catch(e) {
    Logger.log("Post-approval error: " + e.message);
  }
}

function updateProjectNameGS(projectCode, newNameTH, newNameEN) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("TEST_DEV");
  if (!sheet) return;
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  var projCol = -1, nameTHCol = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    if (h.indexOf("รหัสโครงงาน") !== -1) projCol = i;
    if (h.indexOf("ชื่อโครงงาน") === 0 && h.indexOf("ไทย") !== -1) nameTHCol = i;
  }
  if (projCol === -1) return;
  var normCode = projectCode.replace(/\s+/g, "").toUpperCase();
  for (var r = 1; r < data.length; r++) {
    var rowCode = String(data[r][projCol] || "").replace(/\s+/g, "").toUpperCase();
    if (rowCode === normCode) {
      if (newNameTH && nameTHCol !== -1) sheet.getRange(r + 1, nameTHCol + 1).setValue(newNameTH);
    }
  }
}

function updateProjectFieldGS(projectCode, newField) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("TEST_DEV");
  if (!sheet) return;
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  var projCol = -1, fieldCol = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    if (h.indexOf("รหัสโครงงาน") !== -1) projCol = i;
    if (h.indexOf("สาขา") !== -1 || h.toLowerCase().indexOf("field") !== -1) fieldCol = i;
  }
  if (projCol === -1 || fieldCol === -1) return;
  var normCode = projectCode.replace(/\s+/g, "").toUpperCase();
  for (var r = 1; r < data.length; r++) {
    var rowCode = String(data[r][projCol] || "").replace(/\s+/g, "").toUpperCase();
    if (rowCode === normCode) {
      sheet.getRange(r + 1, fieldCol + 1).setValue(newField);
    }
  }
}

// ── rowToPetitionObject ───────────────────────────────────────────

function rowToPetitionObject(row) {
  return {
    petition_id:     row[0]  || "",
    project_code:    row[1]  || "",
    project_name:    row[2]  || "",
    petition_type:   row[3]  || "",
    requester_role:  row[4]  || "",
    requester_email: row[5]  || "",
    requester_name:  row[6]  || "",
    created_at:      row[7]  || "",
    status:          row[8]  || "",
    payload_json:    row[9]  || "{}",
    current_step:    row[10] || "",
    final_result:    row[11] || "",
    updated_at:      row[12] || "",
    student1:   { status: row[13]||"", note: row[14]||"", signature: row[15]||"", time: row[16]||"" },
    student2:   { status: row[17]||"", note: row[18]||"", signature: row[19]||"", time: row[20]||"" },
    advisor:    { status: row[21]||"", note: row[22]||"", signature: row[23]||"", time: row[24]||"" },
    coadvisor1: { status: row[25]||"", note: row[26]||"", signature: row[27]||"", time: row[28]||"" },
    coadvisor2: { status: row[29]||"", note: row[30]||"", signature: row[31]||"", time: row[32]||"" },
    admin:      { status: row[33]||"", note: row[34]||"", signature: row[35]||"", time: row[36]||"", name: row[37]||"" },
    petition_type_label: getPetitionTypeLabel(String(row[3]))
  };
}

function getPetitionTypeLabel(type) {
  var labels = {
    "1": "เพิ่มอาจารย์ที่ปรึกษามหาวิทยาลัย",
    "2": "เพิ่มอาจารย์ที่ปรึกษาโรงเรียน",
    "3": "ถอดถอนอาจารย์ที่ปรึกษา",
    "4": "เปลี่ยนชื่อโครงงาน",
    "5": "เปลี่ยนสาขาโครงงาน",
    "6": "คำร้องอื่นๆ"
  };
  return labels[type] || "คำร้องประเภท " + type;
}

// ── Run once to initialize ────────────────────────────────────────
function initPetitionSheet() {
  ensurePetitionSheet();
  SpreadsheetApp.getUi().alert("PETITIONS sheet initialized successfully!");
}
