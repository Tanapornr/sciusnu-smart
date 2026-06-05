// ================================================================
// lib/sheets.js  (refactored — Apps Script relay)
// Replaces googleapis Sheets API calls with relay POST requests.
// The Apps Script Web App runs as the @nu.ac.th account that owns
// the Sheet, so no Service Account permission issues.
//
// Public API is identical to the old lib/sheets.js so all callers
// (api/submit.js, api/status.js, api/data.js, etc.) work unchanged.
//
// Env vars required:
//   APPS_SCRIPT_URL    — Web App URL
//   APPS_SCRIPT_SECRET — DRIVE_RELAY_SECRET value
//   SPREADSHEET_ID     — Google Sheet ID (still needed for direct reads)
// ================================================================

const { google } = require("googleapis");

// ── Apps Script relay helper ─────────────────────────────────────
const RELAY_URL    = process.env.APPS_SCRIPT_URL;
const RELAY_SECRET = process.env.APPS_SCRIPT_SECRET;

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

/**
 * Update specific cells in a row.
 * @param {string} sheetName - Sheet tab name
 * @param {number} rowIndex  - 1-based row number
 * @param {Array}  updates   - [{col: N, value: "..."}] (col is 1-based)
 */
async function updateRowCells(sheetName, rowIndex, updates) {
  const auth = await getAuth().getClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // Build batchUpdate data
  const data = updates.map(({ col, value }) => {
    // Convert column number to A1 notation
    const colLetter = columnToLetter(col);
    return {
      range: `${sheetName}!${colLetter}${rowIndex}`,
      values: [[value ?? '']],
    };
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });
}

async function callRelay(payload) {
  if (!RELAY_URL) throw new Error("APPS_SCRIPT_URL is not configured");

  const res = await fetch(RELAY_URL, {
    method:   "POST",
    headers:  { "Content-Type": "application/json" },
    body:     JSON.stringify({ ...payload, secret: RELAY_SECRET }),
    redirect: "follow",
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (_) {
    throw new Error(`Apps Script non-JSON: ${text.slice(0, 200)}`);
  }

  if (json.status !== "success") {
    throw new Error(`Apps Script error: ${json.message || JSON.stringify(json)}`);
  }

  return json;
}

// ── Read operations — still use Sheets API directly ─────────────
// Reading does NOT need the owner account; a service account with
// Viewer access (or the sheet shared "Anyone with the link can view")
// is fine.  We keep SA for reads to avoid latency of a relay round-trip.
// If you also remove SA entirely, replace getSheetsClient() with an
// Apps Script "getSheetValues" relay action.

function getReadAuthClient() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

async function getSheetsClient() {
  const auth = await getReadAuthClient().getClient();
  return google.sheets({ version: "v4", auth });
}

/**
 * Returns 2D array (first row = headers). Empty sheet → [].
 * Uses Sheets API directly (read-only SA scope is sufficient).
 */
async function getSheetValues(sheetName = "TEST_DEV") {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId:    process.env.SPREADSHEET_ID,
    range:            sheetName,
    valueRenderOption: "FORMATTED_VALUE",
  });
  return res.data.values || [];
}

// ── Write operations — routed through Apps Script relay ──────────

/** Append one row to a sheet via the relay. */
async function appendRow(sheetName, values) {
  await callRelay({ action: "appendRow", sheetName, values });
}

/** Update a single cell (row and col are 1-based) via the relay. */
async function updateCell(sheetName, row, col, value) {
  await callRelay({
    action:    "updateRow",
    sheetName,
    row,
    updates:   [{ col, value }],
  });
}

/** Update multiple cells in one batch via the relay. */
async function updateRowCells(sheetName, row, updates) {
  await callRelay({ action: "updateRow", sheetName, row, updates });
}

/**
 * Ensure the Submissions sheet exists with correct headers.
 * Uses the relay (write op).
 *
 * Note: Sheet creation is not directly exposed in the relay.
 * We do a best-effort read and append headers if the sheet is empty.
 * If the sheet doesn't exist at all, the relay's appendRow will return
 * a "Sheet not found" error — in that case the script owner should
 * create the sheet manually once, or you can add a "createSheet" action
 * to the relay.
 */
async function ensureSubmissionsSheet() {
  try {
    const rows = await getSheetValues("Submissions");
    if (rows.length === 0) {
      await appendRow("Submissions", [
        "Timestamp", "รหัสนักเรียน", "ชื่อ", "นามสกุล", "รหัสโครงงาน",
        "ประเภทงาน", "URL ไฟล์เล่ม", "URL ลายเซ็น", "สถานะ", "อ.ที่ปรึกษา", "หมายเหตุ",
      ]);
    }
  } catch (err) {
    // Non-fatal — log and let submit proceed; sheet likely already exists
    console.warn("[sheets] ensureSubmissionsSheet:", err.message);
  }
}

// ── colLetter helper (unchanged) ─────────────────────────────────
function colLetter(n) {
  let letter = "";
  while (n > 0) {
    const mod = (n - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

async function updateRowCells(sheetName, rowIndex, updates) {
  const auth = await getAuth().getClient();
  const sheets = google.sheets({ version: 'v4', auth });

  // Build batchUpdate data
  const data = updates.map(({ col, value }) => {
    // Convert column number to A1 notation
    const colLetter = columnToLetter(col);
    return {
      range: `${sheetName}!${colLetter}${rowIndex}`,
      values: [[value ?? '']],
    };
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });
}

function columnToLetter(col) {
  let letter = '';
  while (col > 0) {
    const remainder = (col - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

module.exports = {
  getSheetValues,
  appendRow,
  updateCell,
  updateRowCells,
  ensureSubmissionsSheet,
  columnToLetter,
};