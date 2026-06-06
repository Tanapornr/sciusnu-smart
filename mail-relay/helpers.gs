// ================================================================
// helpers.gs  (new file — replaces the helpers section of Code.gs)
//
// HOW TO USE:
//   1. Create helpers.gs in your Apps Script project
//   2. Paste this file into it
//   3. Remove jsonResponse() and errorResponse() from Code.gs
//   4. Set Script Property "DEBUG_MODE" = "true" for dev,
//      delete it (or set to anything else) for production
// ================================================================

// ── Debug flag ───────────────────────────────────────────────────
// Reads once per deployment. In production, delete the
// DEBUG_MODE Script Property entirely.
var IS_DEBUG = (function() {
  try {
    return PropertiesService.getScriptProperties()
             .getProperty("DEBUG_MODE") === "true";
  } catch(e) {
    return false;
  }
})();

// ── Response helpers ─────────────────────────────────────────────

/**
 * Serialize obj to JSON and return as a ContentService response.
 * When IS_DEBUG is false, the `debug` key is stripped from obj
 * so internal infrastructure details are never sent to clients.
 */
function jsonResponse(obj) {
  var out = {};
  for (var k in obj) {
    if (k === "debug" && !IS_DEBUG) continue;
    out[k] = obj[k];
  }
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Shorthand for error responses used by petition handlers.
 */
function errorResponse(msg) {
  return jsonResponse({ status: "error", message: msg });
}

// ── buildDebugInfo (only called when IS_DEBUG = true) ────────────
function buildDebugInfo() {
  var info = {};
  try { info.effectiveUser = Session.getEffectiveUser().getEmail(); }
  catch(e) { info.effectiveUser = "ERROR: " + e.toString(); }
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
  }
  return info;
}
