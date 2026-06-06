// ================================================================
// lib/sheetModel.js  (new file)
// Maps raw sheet rows (Thai header keys) to typed internal objects.
//
// WHY:
//   Without this layer, Thai header strings like "รหัสนักเรียน" are
//   used as object keys everywhere in the codebase. If a header is
//   renamed in the sheet, the whole app breaks silently.
//
//   This file is the single place that knows about sheet column names.
//   All callers use typed English field names.
//
// USAGE:
//   const { transformProjectRows } = require("./sheetModel");
//   const rows = await getSheetValues("TEST_DEV", "A:U");
//   const projects = transformProjectRows(rows);
//   // projects[0].studentId, projects[0].projectId, etc.
// ================================================================

// ── Column map: canonical field → sheet header string ────────────
// To rename a column in the sheet: change the VALUE here, nowhere else.
const PROJECT_COL_MAP = {
  // Student identity
  email:            "อีเมล",
  studentId:        "รหัสนักเรียน",
  firstName:        "ชื่อ",
  lastName:         "นามสกุล",
  fullName:         "ชื่อ-นามสกุล",

  // Project
  projectId:        "รหัสโครงงาน",
  projectNameTH:    "ชื่อโครงงาน (ไทย)",
  projectNameEN:    "ชื่อโครงงาน (อังกฤษ)",
  projectField:     "สาขา",
  projectType:      "ประเภทโครงงาน",

  // Advisor
  advEmail:         "อีเมล อ.ที่ปรึกษา",
  advName:          "ชื่อ อ.ที่ปรึกษา",
  coAdvEmail:       "อีเมล อ.ที่ปรึกษาร่วม",
  coAdvName:        "ชื่อ อ.ที่ปรึกษาร่วม",
  schAdvEmail:      "อีเมล อ.ที่ปรึกษาโรงเรียน",
  schAdvName:       "ชื่อ อ.ที่ปรึกษาโรงเรียน",

  // Metadata
  year:             "ปีการศึกษา",
  semester:         "ภาคเรียน",
  status:           "สถานะ",
  profileUrl:       "URL รูปโปรไฟล์",
};

// Columns that are password fields — always stripped before sending to frontend
const PASSWORD_HEADERS = [
  "รหัสผ่าน",
  "รหัสผ่าน อ.ที่ปรึกษา",
  "รหัสผ่าน อ.ที่ปรึกษาร่วม",
  "รหัสผ่าน อ.ที่ปรึกษาโรงเรียน",
];

/**
 * Transform raw 2D sheet rows into typed project objects.
 * Strips password columns automatically.
 *
 * @param {string[][]} rawRows  - Output of getSheetValues()
 * @returns {Object[]}          - Array of typed project objects
 */
function transformProjectRows(rawRows) {
  if (!rawRows || rawRows.length < 2) return [];

  const [headers, ...rows] = rawRows;

  // Build reverse index: "รหัสนักเรียน" → column index
  const idx = {};
  headers.forEach((h, i) => {
    idx[String(h).trim()] = i;
  });

  // Build password column index set for fast lookup
  const passwordCols = new Set(
    PASSWORD_HEADERS.map(h => idx[h]).filter(i => i !== undefined)
  );

  return rows
    .filter(row => row && row.some(cell => String(cell).trim() !== ""))
    .map(row => {
      const obj = {};

      // Map canonical fields
      for (const [field, header] of Object.entries(PROJECT_COL_MAP)) {
        const colIdx = idx[header];
        obj[field] = colIdx !== undefined ? (row[colIdx] ?? "") : "";
      }

      // Also carry over any unmapped columns (except passwords)
      // so callers that use the old Thai-key pattern still work during migration
      headers.forEach((h, i) => {
        const key = String(h).trim();
        if (!passwordCols.has(i) && !(key in obj)) {
          obj[key] = row[i] ?? "";
        }
      });

      return obj;
    });
}

/**
 * Lightweight: just strip password columns from raw rowsToObjects output.
 * Use this if you're not ready to migrate to transformProjectRows yet.
 *
 * @param {Object[]} projectObjects  - Output of rowsToObjects()
 * @returns {Object[]}
 */
function stripPasswordFields(projectObjects) {
  return projectObjects.map(p => {
    const copy = { ...p };
    for (const h of PASSWORD_HEADERS) delete copy[h];
    return copy;
  });
}

module.exports = {
  PROJECT_COL_MAP,
  PASSWORD_HEADERS,
  transformProjectRows,
  stripPasswordFields,
};
