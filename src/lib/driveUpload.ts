import { api } from "./api";

/**
 * Upload a PDF directly to Google Drive via a resumable upload URL.
 *
 * Flow:
 *   1. Ask backend for a signed resumable upload URL (tiny request, no file data)
 *   2. PUT file bytes directly to Google Drive (bypasses Vercel 4.5 MB limit entirely)
 *   3. Google Drive responds with file metadata JSON → extract webViewLink
 *
 * The backend never receives file bytes.
 */
export async function uploadFileToDrive(
  file: File,
  fileName: string
): Promise<string> {
  // Step 1 — get signed URL from backend
  const { uploadUrl } = await api.getUploadUrl(fileName, file.type);

  // Step 2 — upload directly to Drive
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Google Drive upload failed: ${errText}`);
  }

  // Step 3 — parse metadata response
  const fileData = await uploadRes.json() as { id?: string; webViewLink?: string };

  if (!fileData.id) throw new Error("Drive did not return a file ID");

  // Return a standard web view link
  return fileData.webViewLink ?? `https://drive.google.com/file/d/${fileData.id}/view`;
}