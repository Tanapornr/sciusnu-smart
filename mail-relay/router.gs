// ================================================================
// router.gs  (new file — replaces the doPost section of Code.gs)
//
// HOW TO USE:
//   1. In your Apps Script project, create a new file called router.gs
//   2. Paste this entire file into it
//   3. Remove the doPost function from Code.gs (keep everything else)
//   4. Deploy a new version of the Web App
//
// CHANGES vs original Code.gs doPost:
//   - Petition actions (createPetition, listPetitions, etc.) are now
//     REACHABLE — they were previously placed after a `return` statement
//     and never executed.
//   - Debug output is controlled by the IS_DEBUG flag (see helpers.gs)
//   - doGet also uses IS_DEBUG so it's safe in production
// ================================================================

function doGet() {
  var debug = IS_DEBUG ? buildDebugInfo() : null;
  var body  = { status: "ok", service: "sciusnu-smart-relay" };
  if (debug) body.debug = debug;
  return jsonResponse(body);
}

function doPost(e) {
  var routerDebug = IS_DEBUG ? { step: "router_entry" } : null;

  try {
    if (!e || !e.postData) {
      return jsonResponse({ status: "error", message: "No postData" });
    }

    if (IS_DEBUG) {
      routerDebug.contentType   = e.postData.type || "unknown";
      routerDebug.hasParameters = !!(e.parameters && Object.keys(e.parameters).length);
      routerDebug.paramKeys     = e.parameters ? Object.keys(e.parameters) : [];
    }

    // ── Route 1: direct upload (form-encoded, uploadToken param present) ──
    if (e.parameters && e.parameters.uploadToken) {
      if (IS_DEBUG) routerDebug.step = "routing_to_handleDirectUpload";
      return handleDirectUpload(e, routerDebug);
    }

    if (!e.postData.contents) {
      return jsonResponse({ status: "error", message: "No body" });
    }

    var data   = JSON.parse(e.postData.contents);
    var action = data.action || "mail";
    if (IS_DEBUG) routerDebug.action = action;

    // ── Route 2: email relay ──
    if (action === "mail") {
      if (IS_DEBUG) routerDebug.step = "routing_to_handleMail";
      return handleMail(data, routerDebug);
    }

    // ── Route 3: Drive / Sheet relay (requires DRIVE_RELAY_SECRET) ──
    if (action === "uploadFile"     || action === "uploadChunk"    ||
        action === "finalizeUpload" || action === "abortUpload"    ||
        action === "appendRow"      || action === "updateRow"      ||
        action === "trashFile") {
      if (IS_DEBUG) routerDebug.step = "routing_to_handleDriveRelay";
      return handleDriveRelay(action, data, routerDebug);
    }

    // ── Route 4: Petition actions ──────────────────────────────────
    // These were unreachable in the original Code.gs because they were
    // placed after a `return` statement. Fixed here.
    if (action === "createPetition")  return handleCreatePetition(data);
    if (action === "listPetitions")   return handleListPetitions(data);
    if (action === "getPetition")     return handleGetPetition(data);
    if (action === "approvePetition") return handleApprovePetition(data);
    if (action === "rejectPetition")  return handleRejectPetition(data);

    return jsonResponse({ status: "error", message: "Unknown action: " + action });

  } catch (err) {
    var errBody = { status: "error", message: err.toString() };
    if (IS_DEBUG) {
      errBody.stack      = err.stack || "";
      errBody.debug      = routerDebug;
    }
    return jsonResponse(errBody);
  }
}
