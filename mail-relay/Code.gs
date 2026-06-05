// ================================================================
// Code.gs — SCiUSNU SMART Apps Script  [DEBUG BUILD]
// Every response includes a `debug` object showing exactly what
// ran and where it failed. Remove debug fields before production.
// ================================================================

const RELAY_SECRET        = PropertiesService.getScriptProperties().getProperty("MAIL_RELAY_SECRET");
const DRIVE_RELAY_SECRET  = PropertiesService.getScriptProperties().getProperty("DRIVE_RELAY_SECRET");
const UPLOAD_TOKEN_SECRET = PropertiesService.getScriptProperties().getProperty("UPLOAD_TOKEN_SECRET");
const DRIVE_FOLDER_ID     = PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID");
const SPREADSHEET_ID      = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");

// ================================================================
// buildDebugInfo — gathered once per request, returned in every response
// ================================================================
function buildDebugInfo() {
  var info = {};
  try { info.effectiveUser = Session.getEffectiveUser().getEmail(); }
  catch(e) { info.effectiveUser = "ERROR: " + e.toString(); }
  try { info.activeUser = Session.getActiveUser().getEmail(); }
  catch(e) { info.activeUser = "ERROR: " + e.toString(); }
  info.props = {
    DRIVE_FOLDER_ID:     DRIVE_FOLDER_ID     ? ("set: " + DRIVE_FOLDER_ID) : "MISSING",
    SPREADSHEET_ID:      SPREADSHEET_ID      ? "set"                       : "MISSING",
    DRIVE_RELAY_SECRET:  DRIVE_RELAY_SECRET  ? "set"                       : "MISSING",
    UPLOAD_TOKEN_SECRET: UPLOAD_TOKEN_SECRET ? "set"                       : "MISSING",
    MAIL_RELAY_SECRET:   RELAY_SECRET        ? "set"                       : "MISSING",
  };
  if (DRIVE_FOLDER_ID) {
    try {
      var f = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      info.folderProbe = "OK — name: " + f.getName();
    } catch(e) {
      info.folderProbe = "FAILED: " + e.toString();
    }
  } else {
    info.folderProbe = "skipped — DRIVE_FOLDER_ID not set";
  }
  return info;
}

// ================================================================
// doGet — hit this URL in the browser for an instant diagnosis
// ================================================================
function doGet() {
  var debug = buildDebugInfo();
  return jsonResponse({ status: "ok", service: "sciusnu-smart-relay [DEBUG]", debug: debug });
}

// ================================================================
// doPost — router
// ================================================================
function doPost(e) {
  var routerDebug = { step: "router_entry" };
  try {
    if (!e || !e.postData) {
      return jsonResponse({ status: "error", message: "No postData", debug: routerDebug });
    }
    routerDebug.contentType   = e.postData.type || "unknown";
    routerDebug.hasParameters = !!(e.parameters && Object.keys(e.parameters).length);
    routerDebug.paramKeys     = e.parameters ? Object.keys(e.parameters) : [];

    if (e.parameters && e.parameters.uploadToken) {
      routerDebug.step = "routing_to_handleDirectUpload";
      return handleDirectUpload(e, routerDebug);
    }

    if (!e.postData.contents) {
      return jsonResponse({ status: "error", message: "No body", debug: routerDebug });
    }

    var data   = JSON.parse(e.postData.contents);
    var action = data.action || "mail";
    routerDebug.action = action;

    if (action === "mail") {
      routerDebug.step = "routing_to_handleMail";
      return handleMail(data, routerDebug);
    }
    if (["uploadFile", "appendRow", "updateRow", "trashFile"].includes(action)) {
      routerDebug.step = "routing_to_handleDriveRelay";
      return handleDriveRelay(action, data, routerDebug);
    }
    return jsonResponse({ status: "error", message: "Unknown action: " + action, debug: routerDebug });
  } catch (err) {
    routerDebug.step = "router_catch";
    return jsonResponse({ status: "error", message: err.toString(), stack: err.stack || "", debug: routerDebug });
  }

  var payload = JSON.parse(e.postData.contents);
  var action = payload.action;
  if (action === "createPetition")  return handleCreatePetition(payload);
  if (action === "listPetitions")   return handleListPetitions(payload);
  if (action === "getPetition")     return handleGetPetition(payload);
  if (action === "approvePetition") return handleApprovePetition(payload);
  if (action === "rejectPetition")  return handleRejectPetition(payload);
}

// ================================================================
// SECTION 1 — Direct upload (Frontend → GAS)
// ================================================================
function handleDirectUpload(e, routerDebug) {
  var debug = { section: "handleDirectUpload", steps: [] };
  try {
    debug.steps.push("start");
    var tokenParam     = (e.parameters.uploadToken || [])[0];
    var base64Data     = (e.parameters.base64Data   || [])[0];
    var clientFileName = (e.parameters.fileName     || [])[0];

    debug.hasToken     = !!tokenParam;
    debug.hasBase64    = !!base64Data;
    debug.base64Length = base64Data ? base64Data.length : 0;
    debug.clientFileName = clientFileName || "(none)";
    debug.steps.push("params_extracted");

    if (!tokenParam)  return jsonResponse({ status: "error", message: "uploadToken required",  debug: debug });
    if (!base64Data)  return jsonResponse({ status: "error", message: "base64Data required",   debug: debug });

    debug.steps.push("verifying_token");
    var claims = verifyUploadToken(tokenParam);
    debug.tokenValid   = claims.valid;
    debug.tokenError   = claims.error || null;
    debug.tokenPayload = claims.valid ? {
      sub:      claims.payload.sub,
      purpose:  claims.payload.purpose,
      fileName: claims.payload.fileName,
      mimeType: claims.payload.mimeType,
      folderId: claims.payload.folderId,
      jti:      claims.payload.jti ? claims.payload.jti.slice(0,8) + "..." : null,
      exp:      claims.payload.exp,
    } : null;

    if (!claims.valid) return jsonResponse({ status: "error", message: claims.error, debug: debug });
    if (claims.payload.purpose !== "drive-upload") return jsonResponse({ status: "error", message: "Invalid token purpose", debug: debug });
    debug.steps.push("token_verified");

    var jti = claims.payload.jti;
    if (!jti) return jsonResponse({ status: "error", message: "Token missing jti", debug: debug });
    var cache       = CacheService.getScriptCache();
    var cacheKey    = "jti_used_" + jti;
    var alreadyUsed = cache.get(cacheKey);
    debug.jtiAlreadyUsed = !!alreadyUsed;
    if (alreadyUsed) return jsonResponse({ status: "error", message: "Token already used", debug: debug });
    cache.put(cacheKey, "1", 600);
    debug.steps.push("jti_consumed");

    var expectedFileName = claims.payload.fileName;
    var mimeType         = claims.payload.mimeType;
    var targetFolderId   = claims.payload.folderId || DRIVE_FOLDER_ID;

    debug.expectedFileName = expectedFileName;
    debug.targetFolderId   = targetFolderId || "EMPTY";
    debug.mimeType         = mimeType;

    if (!targetFolderId) return jsonResponse({ status: "error", message: "No target folder — missing from token.folderId and Script Properties DRIVE_FOLDER_ID", debug: debug });

    if (clientFileName && !clientFileName.startsWith(expectedFileName.replace(/\.pdf$/, ""))) {
      debug.fileNameMismatch = true;
      return jsonResponse({ status: "error", message: "File name mismatch", debug: debug });
    }
    var finalFileName = clientFileName || expectedFileName;
    debug.finalFileName = finalFileName;
    debug.steps.push("file_name_ok");

    debug.steps.push("decoding_base64");
    var decoded = Utilities.base64Decode(base64Data);
    debug.decodedBytes = decoded.length;
    debug.steps.push("base64_decoded");

    var blob = Utilities.newBlob(decoded, mimeType || "application/pdf", finalFileName);
    debug.steps.push("blob_created");

    debug.steps.push("calling_DriveApp_getFolderById");
    try { debug.effectiveUser = Session.getEffectiveUser().getEmail(); } catch(_) { debug.effectiveUser = "unknown"; }
    var folder = DriveApp.getFolderById(targetFolderId);
    debug.folderName = folder.getName();
    debug.steps.push("folder_obtained");

    var file = folder.createFile(blob);
    debug.steps.push("file_created");
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    debug.steps.push("sharing_set");

    return jsonResponse({ status: "success", id: file.getId(), webViewLink: file.getUrl(), debug: debug });

  } catch (err) {
    debug.steps.push("CAUGHT_ERROR");
    debug.error      = err.toString();
    debug.errorStack = err.stack || "";
    try { debug.effectiveUser = Session.getEffectiveUser().getEmail(); } catch(_) { debug.effectiveUser = "unknown"; }
    return jsonResponse({ status: "error", message: err.toString(), debug: debug });
  }
}

// ================================================================
// JWT verification
// ================================================================
function verifyUploadToken(token) {
  try {
    if (!UPLOAD_TOKEN_SECRET) return { valid: false, error: "UPLOAD_TOKEN_SECRET not configured in Script Properties" };
    var parts = token.split(".");
    if (parts.length !== 3) return { valid: false, error: "Malformed token (not 3 parts)" };

    var headerB64    = parts[0];
    var payloadB64   = parts[1];
    var signatureB64 = parts[2];
    var signingInput     = headerB64 + "." + payloadB64;
    var expectedSigBytes = Utilities.computeHmacSha256Signature(signingInput, UPLOAD_TOKEN_SECRET);
    var expectedSigB64   = Utilities.base64EncodeWebSafe(expectedSigBytes).replace(/=+$/, "");
    var receivedSig      = signatureB64.replace(/=+$/, "");

    if (expectedSigB64 !== receivedSig) return { valid: false, error: "Invalid token signature" };

    var payloadJson = Utilities.newBlob(
      Utilities.base64DecodeWebSafe(payloadB64 + "==")
    ).getDataAsString();
    var payload = JSON.parse(payloadJson);
    var nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSeconds) return { valid: false, error: "Token expired (exp=" + payload.exp + " now=" + nowSeconds + ")" };
    return { valid: true, payload: payload };
  } catch (err) {
    return { valid: false, error: "Token parse error: " + err.toString() };
  }
}

// ================================================================
// SECTION 2 — Email relay (unchanged)
// ================================================================
function handleMail(data, routerDebug) {
  try {
    if (!RELAY_SECRET || data.secret !== RELAY_SECRET) return jsonResponse({ status: "error", message: "Unauthorized", debug: routerDebug });
    var to = data.to, subject = data.subject, htmlBody = data.htmlBody;
    if (!to || !subject || !htmlBody) return jsonResponse({ status: "error", message: "Missing to/subject/htmlBody", debug: routerDebug });
    var recipients = String(to).split(",").map(function(s){ return s.trim(); }).filter(function(s){ return s.indexOf("@") !== -1; });
    if (recipients.length === 0) return jsonResponse({ status: "error", message: "No valid recipients", debug: routerDebug });
    for (var i = 0; i < recipients.length; i++) {
      MailApp.sendEmail({ to: recipients[i], subject: subject, htmlBody: htmlBody, name: "SCiUSNU SMART" });
    }
    return jsonResponse({ status: "success", sent: recipients.length });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString(), debug: routerDebug });
  }
}

// ================================================================
// SECTION 3 — Drive / Sheet relay (backend-initiated)
// ================================================================
function authorizeDriveRequest(data) {
  return DRIVE_RELAY_SECRET && data.secret === DRIVE_RELAY_SECRET;
}

function handleDriveRelay(action, data, routerDebug) {
  var debug = { section: "handleDriveRelay", action: action, steps: [] };
  try {
    debug.secretPresent = !!DRIVE_RELAY_SECRET;
    debug.secretMatch   = data.secret === DRIVE_RELAY_SECRET;
    try { debug.effectiveUser = Session.getEffectiveUser().getEmail(); } catch(_) { debug.effectiveUser = "unknown"; }

    if (!authorizeDriveRequest(data)) return jsonResponse({ status: "error", message: "Unauthorized", debug: debug });
    debug.steps.push("authorized");

    if (action === "uploadFile") return handleUploadFile(data, debug);
    if (action === "appendRow")  return handleAppendRow(data, debug);
    if (action === "updateRow")  return handleUpdateRow(data, debug);
    if (action === "trashFile")  return handleTrashFile(data, debug);
    return jsonResponse({ status: "error", message: "Unknown drive action", debug: debug });
  } catch (err) {
    debug.error      = err.toString();
    debug.errorStack = err.stack || "";
    return jsonResponse({ status: "error", message: err.toString(), debug: debug });
  }
}

function handleUploadFile(data, debug) {
  debug = debug || {};
  debug.steps = debug.steps || [];
  var fileName = data.fileName, mimeType = data.mimeType, base64Data = data.base64Data, chunks = data.chunks, folderId = data.folderId;
  if (!fileName) return jsonResponse({ status: "error", message: "fileName required", debug: debug });
  var fullBase64;
  if (chunks && Array.isArray(chunks) && chunks.length > 0) {
    fullBase64 = chunks.join(""); debug.mode = "chunked:" + chunks.length;
  } else if (base64Data) {
    fullBase64 = base64Data; debug.mode = "single_base64";
  } else {
    return jsonResponse({ status: "error", message: "base64Data or chunks required", debug: debug });
  }
  var targetFolderId = folderId || DRIVE_FOLDER_ID;
  debug.targetFolderId = targetFolderId || "EMPTY";
  if (!targetFolderId) return jsonResponse({ status: "error", message: "No DRIVE_FOLDER_ID", debug: debug });
  debug.steps.push("calling_DriveApp_getFolderById");
  var decoded = Utilities.base64Decode(fullBase64);
  var blob    = Utilities.newBlob(decoded, mimeType || "application/octet-stream", fileName);
  var folder  = DriveApp.getFolderById(targetFolderId);
  debug.steps.push("folder_ok");
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return jsonResponse({ status: "success", id: file.getId(), webViewLink: file.getUrl(), debug: debug });
}

function handleAppendRow(data, debug) {
  debug = debug || {};
  var sheetName = data.sheetName, values = data.values;
  if (!sheetName || !Array.isArray(values)) return jsonResponse({ status: "error", message: "sheetName and values[] required", debug: debug });
  debug.sheetName = sheetName;
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return jsonResponse({ status: "error", message: "Sheet not found: " + sheetName, debug: debug });
  sheet.appendRow(values);
  return jsonResponse({ status: "success", debug: debug });
}

function handleUpdateRow(data, debug) {
  debug = debug || {};
  var sheetName = data.sheetName, row = data.row, updates = data.updates;
  if (!sheetName || !row || !Array.isArray(updates)) return jsonResponse({ status: "error", message: "sheetName, row, updates[] required", debug: debug });
  debug.sheetName = sheetName; debug.row = row;
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return jsonResponse({ status: "error", message: "Sheet not found: " + sheetName, debug: debug });
  for (var i = 0; i < updates.length; i++) {
    sheet.getRange(row, updates[i].col).setValue(updates[i].value);
  }
  return jsonResponse({ status: "success", debug: debug });
}

function handleTrashFile(data, debug) {
  debug = debug || {};
  debug.steps = debug.steps || [];
  var fileId = data.fileId;
  debug.fileId = fileId || "MISSING";
  if (!fileId) return jsonResponse({ status: "error", message: "fileId required", debug: debug });
  try {
    debug.steps.push("calling_DriveApp_getFileById");
    try { debug.effectiveUser = Session.getEffectiveUser().getEmail(); } catch(_) { debug.effectiveUser = "unknown"; }
    DriveApp.getFileById(fileId).setTrashed(true);
    debug.steps.push("trashed_ok");
    return jsonResponse({ status: "success", debug: debug });
  } catch (err) {
    debug.error = err.toString();
    return jsonResponse({ status: "error", message: err.toString(), debug: debug });
  }
}

// ================================================================
// PETITIONS SHEET — Google Apps Script additions
// Add these functions to your existing Code.gs
// ================================================================

// ── Sheet & Column constants ──────────────────────────────────────
var PETITION_SHEET_NAME = "PETITIONS";

var PETITION_HEADERS = [
  "petition_id","project_code","project_name","petition_type","requester_role",
  "requester_email","requester_name","created_at","status","payload_json",
  "current_step","final_result","updated_at",
  "student1_status","student1_note","student1_signature","student1_time",
  "student2_status","student2_note","student2_signature","student2_time",
  "advisor_status","advisor_note","advisor_signature","advisor_time",
  "coadvisor1_status","coadvisor1_note","coadvisor1_signature","coadvisor1_time",
  "coadvisor2_status","coadvisor2_note","coadvisor2_signature","coadvisor2_time"
];

// ── Ensure PETITIONS sheet exists with headers ───────────────────
function ensurePetitionSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PETITION_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PETITION_SHEET_NAME);
    sheet.appendRow(PETITION_HEADERS);
    
    // Style header row
    var headerRange = sheet.getRange(1, 1, 1, PETITION_HEADERS.length);
    headerRange.setBackground("#ea580c");
    headerRange.setFontColor("#ffffff");
    headerRange.setFontWeight("bold");
    headerRange.setFontSize(10);
    
    // Set column widths
    sheet.setColumnWidth(1, 160);   // petition_id
    sheet.setColumnWidth(2, 120);   // project_code
    sheet.setColumnWidth(3, 200);   // project_name
    sheet.setColumnWidth(4, 60);    // petition_type
    sheet.setColumnWidth(9, 120);   // status
    sheet.setColumnWidth(10, 300);  // payload_json
    sheet.setColumnWidth(11, 100);  // current_step
    sheet.setColumnWidth(12, 100);  // final_result
    
    // Freeze header row
    sheet.setFrozenRows(1);
    
    Logger.log("PETITIONS sheet created successfully");
  }
  return sheet;
}

// ── Get all petition rows ─────────────────────────────────────────
function getPetitionRows() {
  var sheet = ensurePetitionSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, PETITION_HEADERS.length).getValues();
}

// ── Append a new petition row ─────────────────────────────────────
function appendPetitionRow(rowData) {
  var sheet = ensurePetitionSheet();
  sheet.appendRow(rowData);
  
  // Apply alternating row color
  var lastRow = sheet.getLastRow();
  if (lastRow % 2 === 0) {
    sheet.getRange(lastRow, 1, 1, PETITION_HEADERS.length).setBackground("#fff7ed");
  }
  return lastRow;
}

// ── Update specific cells in a petition row ───────────────────────
function updatePetitionRow(rowIndex, updates) {
  var sheet = ensurePetitionSheet();
  // updates = [{col: N, value: "..."}]
  for (var i = 0; i < updates.length; i++) {
    sheet.getRange(rowIndex, updates[i].col).setValue(updates[i].value);
  }
}

// ── Find petition row by petition_id ──────────────────────────────
function findPetitionRow(petitionId) {
  var rows = getPetitionRows();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === petitionId) {
      return { row: rows[i], rowIndex: i + 2 }; // +2 for header + 0-index
    }
  }
  return null;
}

// ── Generate petition ID (BE year) ───────────────────────────────
function generatePetitionId() {
  var now = new Date();
  var beYear = String(now.getFullYear() + 543).slice(-2);
  var month = String(now.getMonth() + 1).padStart(2, "0");
  var rand = Math.floor(Math.random() * 9000) + 1000;
  return "PET-" + beYear + month + "-" + rand;
}

// ================================================================
// doPost handler additions — merge into your existing doPost
// ================================================================

// Add these cases to your existing doPost switch/if-else chain:
//
// case "createPetition":   return handleCreatePetition(payload);
// case "listPetitions":    return handleListPetitions(payload);
// case "getPetition":      return handleGetPetition(payload);
// case "approvePetition":  return handleApprovePetition(payload);
// case "rejectPetition":   return handleRejectPetition(payload);

function handleCreatePetition(payload) {
  try {
    ensurePetitionSheet();
    var petitionId = generatePetitionId();
    var now = new Date().toISOString();
    
    var chainData = {
      chain: payload.chain || [],
      payload: payload.petitionPayload || {}
    };
    
    var firstStep = chainData.chain.length > 0 ? chainData.chain[0] : {};
    
    var row = new Array(PETITION_HEADERS.length).fill("");
    row[0]  = petitionId;
    row[1]  = payload.project_code || "";
    row[2]  = payload.project_name || "";
    row[3]  = String(payload.petition_type || "");
    row[4]  = payload.requester_role || "";
    row[5]  = payload.requester_email || "";
    row[6]  = payload.requester_name || "";
    row[7]  = now;
    row[8]  = "รอดำเนินการ";
    row[9]  = JSON.stringify(chainData);
    row[10] = firstStep.role || "";
    row[11] = "";
    row[12] = now;
    
    appendPetitionRow(row);
    
    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", petition_id: petitionId }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: e.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleListPetitions(payload) {
  try {
    var rows = getPetitionRows();
    var petitions = [];
    var userEmail = (payload.userEmail || "").trim().toLowerCase();
    var userRole = payload.userRole || "";
    
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
            var chain = chainData.chain || [];
            for (var j = 0; j < chain.length; j++) {
              if ((chain[j].email || "").trim().toLowerCase() === userEmail) {
                include = true;
                break;
              }
            }
          } catch(e) {}
        }
      }
      
      if (include) {
        petitions.push(rowToPetitionObject(row));
      }
    }
    
    // Newest first
    petitions.reverse();
    
    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", petitions: petitions }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: e.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleGetPetition(payload) {
  try {
    var result = findPetitionRow(payload.petition_id);
    if (!result) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: "error", message: "ไม่พบคำร้อง" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var petition = rowToPetitionObject(result.row);
    
    // Enrich with chain and payload
    try {
      var chainData = JSON.parse(result.row[9] || "{}");
      petition.chain = chainData.chain || [];
      petition.payload = chainData.payload || {};
    } catch(e) {
      petition.chain = [];
      petition.payload = {};
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", petition: petition }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: e.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleApprovePetition(payload) {
  return processApprovalAction(payload, "อนุมัติ");
}

function handleRejectPetition(payload) {
  return processApprovalAction(payload, "ปฏิเสธ");
}

function processApprovalAction(payload, action) {
  try {
    var result = findPetitionRow(payload.petition_id);
    if (!result) {
      return errorResponse("ไม่พบคำร้อง");
    }
    
    var row = result.row;
    var rowIndex = result.rowIndex;
    
    // Parse chain
    var chainData;
    try {
      chainData = JSON.parse(row[9] || "{}");
    } catch(e) {
      return errorResponse("ข้อมูลคำร้องเสียหาย");
    }
    
    var chain = chainData.chain || [];
    var userEmail = (payload.userEmail || "").trim().toLowerCase();
    
    // Find user's role in chain
    var userRole = null;
    for (var i = 0; i < chain.length; i++) {
      if ((chain[i].email || "").trim().toLowerCase() === userEmail) {
        userRole = chain[i].role;
        break;
      }
    }
    
    if (!userRole) {
      return errorResponse("คุณไม่มีสิทธิ์ดำเนินการคำร้องนี้");
    }
    
    // Map role to column indices (1-based)
    var roleColMap = {
      student1:   { status: 14, note: 15, sig: 16, time: 17 },
      student2:   { status: 18, note: 19, sig: 20, time: 21 },
      advisor:    { status: 22, note: 23, sig: 24, time: 25 },
      coadvisor1: { status: 26, note: 27, sig: 28, time: 29 },
      coadvisor2: { status: 30, note: 31, sig: 32, time: 33 }
    };
    
    var cols = roleColMap[userRole];
    if (!cols) return errorResponse("บทบาทไม่ถูกต้อง");
    
    var now = new Date().toISOString();
    var encodedSig = Utilities.base64Encode(payload.signature || "");
    
    var updates = [
      { col: cols.status, value: action },
      { col: cols.note,   value: payload.note || "" },
      { col: cols.sig,    value: encodedSig },
      { col: cols.time,   value: now },
      { col: 13,          value: now } // updated_at
    ];
    
    if (action === "ปฏิเสธ") {
      updates.push({ col: 9,  value: "ปฏิเสธ" });   // status
      updates.push({ col: 12, value: "ปฏิเสธ" });   // final_result
      updates.push({ col: 11, value: "สิ้นสุด" });  // current_step
    } else {
      // Find next step
      var currentIndex = chain.findIndex(function(s) { return s.role === userRole; });
      var nextStep = chain[currentIndex + 1];
      
      if (nextStep) {
        updates.push({ col: 11, value: nextStep.role });
      } else {
        // All approved
        updates.push({ col: 9,  value: "เสร็จสิ้น" });
        updates.push({ col: 12, value: "อนุมัติ" });
        updates.push({ col: 11, value: "สิ้นสุด" });
        
        // Post-approval automation for type 4 and 5
        handlePostApprovalGS(row, chainData.payload || {});
      }
    }
    
    updatePetitionRow(rowIndex, updates);
    
    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", message: action === "อนุมัติ" ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return errorResponse(e.message);
  }
}

// ── Post-approval: auto-update project data (Types 4 & 5) ────────
function handlePostApprovalGS(petitionRow, petitionPayload) {
  var type = Number(petitionRow[3]);
  var projectCode = String(petitionRow[1] || "");
  
  try {
    if (type === 4) {
      // Update project name in TEST_DEV sheet
      if (petitionPayload.newNameTH || petitionPayload.newNameEN) {
        updateProjectNameGS(projectCode, petitionPayload.newNameTH, petitionPayload.newNameEN);
      }
    } else if (type === 5) {
      // Update project field in TEST_DEV sheet
      if (petitionPayload.newField) {
        updateProjectFieldGS(projectCode, petitionPayload.newField);
      }
    }
  } catch(e) {
    Logger.log("Post-approval error: " + e.message);
  }
}

function updateProjectNameGS(projectCode, newNameTH, newNameEN) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("TEST_DEV");
  if (!sheet) return;
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  // Find column indices
  var projCol = -1, nameTHCol = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    if (h.includes("รหัสโครงงาน")) projCol = i;
    if (h.startsWith("ชื่อโครงงาน") && h.includes("ไทย")) nameTHCol = i;
  }
  if (projCol === -1) return;
  
  var normCode = projectCode.replace(/\s+/g, "").toUpperCase();
  for (var r = 1; r < data.length; r++) {
    var rowCode = String(data[r][projCol] || "").replace(/\s+/g, "").toUpperCase();
    if (rowCode === normCode) {
      if (newNameTH && nameTHCol !== -1) sheet.getRange(r + 1, nameTHCol + 1).setValue(newNameTH);
      Logger.log("Updated project name for " + projectCode);
    }
  }
}

function updateProjectFieldGS(projectCode, newField) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("TEST_DEV");
  if (!sheet) return;
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  var projCol = -1, fieldCol = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    if (h.includes("รหัสโครงงาน")) projCol = i;
    if (h.includes("สาขา") || h.toLowerCase().includes("field")) fieldCol = i;
  }
  if (projCol === -1 || fieldCol === -1) return;
  
  var normCode = projectCode.replace(/\s+/g, "").toUpperCase();
  for (var r = 1; r < data.length; r++) {
    var rowCode = String(data[r][projCol] || "").replace(/\s+/g, "").toUpperCase();
    if (rowCode === normCode) {
      sheet.getRange(r + 1, fieldCol + 1).setValue(newField);
      Logger.log("Updated project field for " + projectCode);
    }
  }
}

// ── Helper: row array → petition object ──────────────────────────
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

function errorResponse(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "error", message: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Run once to initialize the sheet ─────────────────────────────
function initPetitionSheet() {
  ensurePetitionSheet();
  SpreadsheetApp.getUi().alert("PETITIONS sheet initialized successfully!");
}


// ================================================================
// Helpers
// ================================================================
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}