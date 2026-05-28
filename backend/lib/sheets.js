const { google } = require("googleapis");

function getAuthClient() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}

async function getSheetsClient() {
  const auth = await getAuthClient().getClient();
  return google.sheets({ version: "v4", auth });
}

/** Returns 2D array (first row = headers). Empty sheet → []. */
async function getSheetValues(sheetName = "Sheet1") {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: sheetName,
    valueRenderOption: "FORMATTED_VALUE",
  });
  return res.data.values || [];
}

/** Append one row to a sheet. */
async function appendRow(sheetName, values) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: sheetName,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

/** Update a single cell (row and col are 1-based). */
async function updateCell(sheetName, row, col, value) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${sheetName}!${colLetter(col)}${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
}

/** Update multiple cells in one batch. updates = [{ col, value }] (col is 1-based). */
async function updateRowCells(sheetName, row, updates) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: updates.map(({ col, value }) => ({
        range: `${sheetName}!${colLetter(col)}${row}`,
        values: [[value]],
      })),
    },
  });
}

/** Ensure the Submissions sheet exists; create with headers if not. */
async function ensureSubmissionsSheet() {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
  });
  const exists = meta.data.sheets.some(
    (s) => s.properties.title === "Submissions"
  );
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: process.env.SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: "Submissions" } } }],
      },
    });
    await appendRow("Submissions", [
      "Timestamp", "รหัสนักเรียน", "ชื่อ", "นามสกุล", "รหัสโครงงาน",
      "ประเภทงาน", "URL ไฟล์เล่ม", "URL ลายเซ็น", "สถานะ", "อ.ที่ปรึกษา", "หมายเหตุ",
    ]);
  }
}

function colLetter(n) {
  let letter = "";
  while (n > 0) {
    const mod = (n - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

module.exports = {
  getSheetValues,
  appendRow,
  updateCell,
  updateRowCells,
  ensureSubmissionsSheet,
};