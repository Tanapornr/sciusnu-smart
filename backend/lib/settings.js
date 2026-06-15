// ================================================================
// lib/settings.js  (new file)
//
// Reads/writes the "SETTING" sheet which stores open/close date
// windows for:
//   - petition_advisor    : ยื่นคำร้องเพิ่ม/ถอดถอนอาจารย์ที่ปรึกษา (type 1,2,3)
//   - submission_proposal : ส่งโครงร่าง (Proposal)
//   - submission_progress : ส่งรายงานความก้าวหน้า
//   - submission_final    : ส่งรายงานฉบับสมบูรณ์
//
// Sheet layout (1 header row + 1 row per key):
//   key | label | open_at | close_at | updated_by | updated_at
//
//   - key:        canonical identifier (see SETTING_KEYS below)
//   - label:      human-readable Thai name (for display only)
//   - open_at:    ISO datetime string, or "" = no lower bound
//   - close_at:   ISO datetime string, or "" = no upper bound
//   - updated_by: email/name of the admin who last changed it
//   - updated_at: ISO datetime of the last change
//
// If open_at AND close_at are both empty, the item is ALWAYS OPEN
// (no date limit) — this is the default/fallback for any key not
// present in the sheet.
// ================================================================

const { getSheetValues, appendRow, updateRowCells } = require("./sheets");

const SHEET = "SETTING";

const HEADERS = ["key", "label", "open_at", "close_at", "updated_by", "updated_at"];

// Canonical keys + default Thai labels (used to seed the sheet)
const SETTING_KEYS = {
  petition_advisor:    "ยื่นคำร้องเพิ่ม/ถอดถอนอาจารย์ที่ปรึกษา",
  submission_proposal: "ส่งโครงร่าง (Proposal)",
  submission_progress: "ส่งรายงานความก้าวหน้า",
  submission_final:    "ส่งรายงานฉบับสมบูรณ์",
};

/**
 * Ensure the SETTING sheet exists with headers + one row per known key.
 * Missing rows are appended with empty open_at/close_at (= always open).
 */
async function ensureSettingsSheet() {
  try {
    const rows = await getSheetValues(SHEET);

    if (rows.length === 0) {
      await appendRow(SHEET, HEADERS);
    }

    const existing = await getSheetValues(SHEET);
    const headerRow = existing[0] || HEADERS;
    const keyCol = headerRow.findIndex((h) => String(h).trim() === "key");
    const existingKeys = new Set(
      existing.slice(1).map((r) => String(r[keyCol] ?? "").trim())
    );

    for (const [key, label] of Object.entries(SETTING_KEYS)) {
      if (!existingKeys.has(key)) {
        await appendRow(SHEET, [key, label, "", "", "", ""]);
      }
    }
  } catch (err) {
    console.warn("[settings] ensureSettingsSheet:", err.message);
  }
}

/**
 * Read all settings as a keyed object:
 *   { petition_advisor: { label, openAt, closeAt, updatedBy, updatedAt }, ... }
 */
async function getAllSettings() {
  await ensureSettingsSheet();
  const rows = await getSheetValues(SHEET);
  if (rows.length < 2) return {};

  const [headers, ...dataRows] = rows;
  const idx = {};
  headers.forEach((h, i) => { idx[String(h).trim()] = i; });

  const out = {};
  dataRows.forEach((row, i) => {
    const key = String(row[idx["key"]] ?? "").trim();
    if (!key) return;
    out[key] = {
      _row:      i + 2, // 1-based sheet row (header is row 1)
      label:     row[idx["label"]] ?? SETTING_KEYS[key] ?? key,
      openAt:    row[idx["open_at"]] ?? "",
      closeAt:   row[idx["close_at"]] ?? "",
      updatedBy: row[idx["updated_by"]] ?? "",
      updatedAt: row[idx["updated_at"]] ?? "",
    };
  });

  // Fill in any known keys missing from the sheet as "always open"
  for (const [key, label] of Object.entries(SETTING_KEYS)) {
    if (!out[key]) {
      out[key] = { label, openAt: "", closeAt: "", updatedBy: "", updatedAt: "" };
    }
  }

  return out;
}

/**
 * Compute open/closed status for a setting at a given time.
 * No date limit (both empty) => always open.
 */
function getWindowStatus(setting, now = new Date()) {
  const openAt  = setting?.openAt  ? new Date(setting.openAt)  : null;
  const closeAt = setting?.closeAt ? new Date(setting.closeAt) : null;

  if (!openAt && !closeAt) return { isOpen: true, hasLimit: false };

  const afterOpen  = !openAt  || now >= openAt;
  const beforeClose = !closeAt || now <= closeAt;

  return { isOpen: afterOpen && beforeClose, hasLimit: true };
}

/**
 * Update open_at/close_at for a single setting key.
 * Creates the row if it doesn't exist yet.
 */
async function updateSetting(key, { openAt, closeAt }, updatedByName) {
  if (!SETTING_KEYS[key]) {
    throw new Error(`ไม่รู้จักการตั้งค่า: ${key}`);
  }

  await ensureSettingsSheet();
  const rows = await getSheetValues(SHEET);
  const headerRow = rows[0] || HEADERS;
  const idx = {};
  headerRow.forEach((h, i) => { idx[String(h).trim()] = i; });

  let rowNum = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idx["key"]] ?? "").trim() === key) {
      rowNum = i + 1; // 1-based
      break;
    }
  }

  const nowIso = new Date().toISOString();

  if (rowNum === -1) {
    await appendRow(SHEET, [
      key, SETTING_KEYS[key], openAt || "", closeAt || "", updatedByName || "", nowIso,
    ]);
    return;
  }

  await updateRowCells(SHEET, rowNum, [
    { col: idx["open_at"] + 1,    value: openAt  || "" },
    { col: idx["close_at"] + 1,   value: closeAt || "" },
    { col: idx["updated_by"] + 1, value: updatedByName || "" },
    { col: idx["updated_at"] + 1, value: nowIso },
  ]);
}

module.exports = {
  SHEET,
  HEADERS,
  SETTING_KEYS,
  ensureSettingsSheet,
  getAllSettings,
  getWindowStatus,
  updateSetting,
};