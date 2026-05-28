const { google } = require("googleapis");

function getAuthClient() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

/**
 * Returns a Google Drive resumable upload URL.
 * The frontend PUTs file bytes directly to this URL — the backend never receives them.
 * Google responds to the PUT with file metadata JSON (including `id`).
 */
async function getResumableUploadUrl({ fileName, mimeType, folderId }) {
  const auth = await getAuthClient().getClient();
  const tokenRes = await auth.getAccessToken();
  const token = tokenRes.token;

  const initRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
      },
      body: JSON.stringify({
        name: fileName,
        parents: [folderId || process.env.DRIVE_FOLDER_ID],
      }),
    }
  );

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Drive resumable init failed: ${err}`);
  }

  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) throw new Error("No upload URL returned from Drive");
  return uploadUrl;
}

/** Move a file to trash by ID. */
async function trashFile(fileId) {
  if (!fileId) return;
  const auth = await getAuthClient().getClient();
  const drive = google.drive({ version: "v3", auth });
  await drive.files.update({ fileId, requestBody: { trashed: true } });
}

/** Extract Drive file ID from a webViewLink or any Drive URL. */
function extractFileId(url) {
  const match = String(url || "").match(/[-\w]{25,}/);
  return match ? match[0] : null;
}

module.exports = { getResumableUploadUrl, trashFile, extractFileId };