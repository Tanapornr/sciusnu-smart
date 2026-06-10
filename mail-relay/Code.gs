// ================================================================
// Code.gs — SCiUSNU SMART Apps Script
// ================================================================

const RELAY_SECRET        = PropertiesService.getScriptProperties().getProperty("MAIL_RELAY_SECRET");
const DRIVE_RELAY_SECRET  = PropertiesService.getScriptProperties().getProperty("DRIVE_RELAY_SECRET");
const UPLOAD_TOKEN_SECRET = PropertiesService.getScriptProperties().getProperty("UPLOAD_TOKEN_SECRET");
const DRIVE_FOLDER_ID     = PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID");
const SPREADSHEET_ID      = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");

// ================================================================
// buildDebugInfo
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
// SECTION 1 — Direct upload (Frontend → GAS, token-authenticated)
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

    if (!claims.valid) return jsonResponse({ status: "error", message: claims.error, debug: debug });
    if (claims.payload.purpose !== "drive-upload") return jsonResponse({ status: "error", message: "Invalid token purpose", debug: debug });
    debug.steps.push("token_verified");

    var jti = claims.payload.jti;
    if (!jti) return jsonResponse({ status: "error", message: "Token missing jti", debug: debug });
    var cache       = CacheService.getScriptCache();
    var cacheKey    = "jti_used_" + jti;
    var alreadyUsed = cache.get(cacheKey);
    if (alreadyUsed) return jsonResponse({ status: "error", message: "Token already used", debug: debug });
    cache.put(cacheKey, "1", 600);
    debug.steps.push("jti_consumed");

    var expectedFileName = claims.payload.fileName;
    var mimeType         = claims.payload.mimeType;
    var targetFolderId   = claims.payload.folderId || DRIVE_FOLDER_ID;

    if (!targetFolderId) return jsonResponse({ status: "error", message: "No target folder", debug: debug });

    var finalFileName = clientFileName || expectedFileName;
    debug.steps.push("decoding_base64");
    var decoded = Utilities.base64Decode(base64Data);
    var blob    = Utilities.newBlob(decoded, mimeType || "application/pdf", finalFileName);
    debug.steps.push("blob_created");

    var folder = DriveApp.getFolderById(targetFolderId);
    var file   = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    debug.steps.push("file_created");

    return jsonResponse({ status: "success", id: file.getId(), webViewLink: file.getUrl(), debug: debug });

  } catch (err) {
    debug.steps.push("CAUGHT_ERROR");
    debug.error      = err.toString();
    debug.errorStack = err.stack || "";
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
    if (payload.exp && payload.exp < nowSeconds) return { valid: false, error: "Token expired" };
    return { valid: true, payload: payload };
  } catch (err) {
    return { valid: false, error: "Token parse error: " + err.toString() };
  }
}

// ================================================================
// SECTION 2 — Email relay
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
    if (!authorizeDriveRequest(data)) return jsonResponse({ status: "error", message: "Unauthorized", debug: debug });
    debug.steps.push("authorized");

    if (action === "uploadFile")      return handleUploadFile(data, debug);
    if (action === "uploadChunk")     return handleUploadChunk(data, debug);
    if (action === "finalizeUpload")  return handleFinalizeUpload(data, debug);
    if (action === "abortUpload")     return handleAbortUpload(data, debug);
    if (action === "appendRow")       return handleAppendRow(data, debug);
    if (action === "updateRow")       return handleUpdateRow(data, debug);
    if (action === "trashFile")       return handleTrashFile(data, debug);

    return jsonResponse({ status: "error", message: "Unknown drive action", debug: debug });
  } catch (err) {
    debug.error      = err.toString();
    debug.errorStack = err.stack || "";
    return jsonResponse({ status: "error", message: err.toString(), debug: debug });
  }
}

// ── Single-shot upload (small files ≤ 1 MB) ─────────────────────
function handleUploadFile(data, debug) {
  debug = debug || {};
  debug.steps = debug.steps || [];
  var fileName = data.fileName, mimeType = data.mimeType, base64Data = data.base64Data, folderId = data.folderId;
  if (!fileName)    return jsonResponse({ status: "error", message: "fileName required", debug: debug });
  if (!base64Data)  return jsonResponse({ status: "error", message: "base64Data required", debug: debug });

  var targetFolderId = folderId || DRIVE_FOLDER_ID;
  if (!targetFolderId) return jsonResponse({ status: "error", message: "No DRIVE_FOLDER_ID", debug: debug });

  debug.steps.push("decoding");
  var decoded = Utilities.base64Decode(base64Data);
  var blob    = Utilities.newBlob(decoded, mimeType || "application/octet-stream", fileName);
  var folder  = DriveApp.getFolderById(targetFolderId);
  var file    = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  debug.steps.push("done");
  return jsonResponse({ status: "success", id: file.getId(), webViewLink: file.getUrl(), debug: debug });
}

// ── Chunked upload — Phase 1: receive one chunk ──────────────────
// GAS CacheService max value size = 100 KB.
// We store each chunk in a DriveApp temp file instead (no size limit).
function handleUploadChunk(data, debug) {
  debug = debug || {};
  debug.steps = debug.steps || [];
  var sessionId   = data.sessionId;
  var chunkIndex  = data.chunkIndex;
  var totalChunks = data.totalChunks;
  var chunkData   = data.chunkData;

  if (!sessionId)              return jsonResponse({ status: "error", message: "sessionId required",   debug: debug });
  if (chunkData === undefined) return jsonResponse({ status: "error", message: "chunkData required",   debug: debug });
  if (totalChunks === undefined) return jsonResponse({ status: "error", message: "totalChunks required", debug: debug });

  debug.sessionId  = sessionId;
  debug.chunkIndex = chunkIndex;
  debug.steps.push("storing_chunk");

  // Store chunk as a temp file in Drive root (no folder restriction needed)
  var tempFileName = "_chunk_" + sessionId + "_" + chunkIndex;
  var blob = Utilities.newBlob(chunkData, "text/plain", tempFileName);

  // Check if a temp file with this name already exists and remove it (retry safety)
  var existing = DriveApp.getFilesByName(tempFileName);
  while (existing.hasNext()) { existing.next().setTrashed(true); }

  var tempFile = DriveApp.createFile(blob);
  // Tag it so cleanup can find all chunks for this session
  debug.steps.push("chunk_stored");
  debug.tempFileId = tempFile.getId();

  return jsonResponse({ status: "success", chunkIndex: chunkIndex, debug: debug });
}

// ── Chunked upload — Phase 2: finalize ───────────────────────────
function handleFinalizeUpload(data, debug) {
  debug = debug || {};
  debug.steps = debug.steps || [];
  var sessionId   = data.sessionId;
  var totalChunks = data.totalChunks;
  var fileName    = data.fileName;
  var mimeType    = data.mimeType;
  var folderId    = data.folderId;

  if (!sessionId)   return jsonResponse({ status: "error", message: "sessionId required",   debug: debug });
  if (!totalChunks) return jsonResponse({ status: "error", message: "totalChunks required", debug: debug });
  if (!fileName)    return jsonResponse({ status: "error", message: "fileName required",     debug: debug });

  debug.sessionId   = sessionId;
  debug.totalChunks = totalChunks;
  debug.steps.push("reading_chunks");

  // Collect all chunk strings in order
  var parts = [];
  for (var i = 0; i < totalChunks; i++) {
    var tempFileName = "_chunk_" + sessionId + "_" + i;
    var files = DriveApp.getFilesByName(tempFileName);
    if (!files.hasNext()) {
      return jsonResponse({ status: "error", message: "Missing chunk " + i + " for session " + sessionId, debug: debug });
    }
    var f = files.next();
    parts.push(f.getBlob().getDataAsString());
    f.setTrashed(true); // clean up immediately
  }

  debug.steps.push("chunks_assembled");
  var fullBase64 = parts.join("");
  debug.base64Length = fullBase64.length;

  var targetFolderId = folderId || DRIVE_FOLDER_ID;
  if (!targetFolderId) return jsonResponse({ status: "error", message: "No DRIVE_FOLDER_ID", debug: debug });

  debug.steps.push("decoding_base64");
  var decoded = Utilities.base64Decode(fullBase64);
  var blob    = Utilities.newBlob(decoded, mimeType || "application/octet-stream", fileName);
  debug.steps.push("blob_created");

  var folder = DriveApp.getFolderById(targetFolderId);
  var file   = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  debug.steps.push("file_created");

  return jsonResponse({ status: "success", id: file.getId(), webViewLink: file.getUrl(), debug: debug });
}

// ── Chunked upload — Phase 3: abort / cleanup ────────────────────
function handleAbortUpload(data, debug) {
  debug = debug || {};
  var sessionId   = data.sessionId;
  var totalChunks = data.totalChunks || 100; // upper bound for cleanup sweep
  if (!sessionId) return jsonResponse({ status: "error", message: "sessionId required", debug: debug });

  for (var i = 0; i < totalChunks; i++) {
    var tempFileName = "_chunk_" + sessionId + "_" + i;
    var files = DriveApp.getFilesByName(tempFileName);
    while (files.hasNext()) { files.next().setTrashed(true); }
  }
  return jsonResponse({ status: "success", debug: debug });
}

// ── Sheet operations ──────────────────────────────────────────────
function handleAppendRow(data, debug) {
  debug = debug || {};
  var sheetName = data.sheetName, values = data.values;
  if (!sheetName || !Array.isArray(values)) return jsonResponse({ status: "error", message: "sheetName and values[] required", debug: debug });
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
  if (!fileId) return jsonResponse({ status: "error", message: "fileId required", debug: debug });
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
    debug.steps.push("trashed_ok");
    return jsonResponse({ status: "success", debug: debug });
  } catch (err) {
    debug.error = err.toString();
    return jsonResponse({ status: "error", message: err.toString(), debug: debug });
  }
}
