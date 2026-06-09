// ================================================================
// lib/sheets.js  (patched)
// Changes:
//   1. Removed duplicate updateRowCells (googleapis version was dead code)
//   2. getSheetValues() now accepts an optional `range` parameter
//   3. All reads go through sheetCache (L1 60-second TTL)
//   4. All writes call invalidate() so cache is always fresh
// ================================================================

const { google }              = require("googleapis");
const { withCache, invalidate } = require("./sheetCache");

// ── Apps Script relay ────────────────────────────────────────────
const RELAY_URL    = process.env.APPS_SCRIPT_URL;
const RELAY_SECRET = process.env.APPS_SCRIPT_SECRET;

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

// ── Read client (Sheets API direct — read-only SA) ───────────────
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

// ── Read ─────────────────────────────────────────────────────────

/**
 * Returns 2D array (first row = headers). Empty sheet → [].
 * @param {string} sheetName  - Sheet tab name
 * @param {string|null} range - Optional A1 range, e.g. "A:U". Defaults to full sheet.
 */
async function getSheetValues(sheetName = "TEST_DEV", range = null) {
  const cacheKey = `sheet:${sheetName}:${range ?? "all"}`;

  return withCache(cacheKey, 60_000, async () => {
    const sheets    = await getSheetsClient();
    const fullRange = range ? `${sheetName}!${range}` : sheetName;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId:     process.env.SPREADSHEET_ID,
      range:             fullRange,
      valueRenderOption: "FORMATTED_VALUE",
      majorDimension:    "ROWS",
    });

    return res.data.values || [];
  });
}

// ── Write (relay) ────────────────────────────────────────────────

/** Append one row to a sheet via the relay. */
async function appendRow(sheetName, values) {
  await callRelay({ action: "appendRow", sheetName, values });
  invalidate(`sheet:${sheetName}:all`);
}

/** Update a single cell (row and col are 1-based) via the relay. */
async function updateCell(sheetName, row, col, value) {
  await callRelay({ action: "updateRow", sheetName, row, updates: [{ col, value }] });
  invalidate(`sheet:${sheetName}:all`);
}

/**
 * Update multiple cells in one batch via the relay.
 * @param {string} sheetName
 * @param {number} row      - 1-based row index
 * @param {Array}  updates  - [{col: N, value: "..."}]
 */
async function updateRowCells(sheetName, row, updates) {
  await callRelay({ action: "updateRow", sheetName, row, updates });
  invalidate(`sheet:${sheetName}:all`);
}

/**
 * Ensure the Submissions sheet exists with correct headers.
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
    console.warn("[sheets] ensureSubmissionsSheet:", err.message);
  }
}

// ── Column letter helper ─────────────────────────────────────────
function columnToLetter(col) {
  let letter = "";
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
