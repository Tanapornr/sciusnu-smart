// ================================================================
// lib/drive.js — compatibility shim
// All Drive operations now go through the Apps Script relay.
// This file re-exports from lib/appsScript.js so any remaining
// import of lib/drive still resolves without errors.
// ================================================================
module.exports = require("./appsScript");