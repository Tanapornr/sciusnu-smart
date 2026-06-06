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