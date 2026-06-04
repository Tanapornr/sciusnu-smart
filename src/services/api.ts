// ================================================================
// API service — all backend calls go through here.
// FIX Vuln 1 & 2: Every authenticated request carries the JWT from
//   sessionStorage. The server verifies the token and extracts the
//   role from it — the frontend never sends role in auth payloads.
// FIX Vuln 3: Token stored in sessionStorage instead of localStorage
//   (cleared on tab close, not persistent across sessions).
// FIX Vuln 8: Logout calls /api/logout to server-invalidate token.
// ================================================================
import type {
  AuthResult,
  SessionResult,
  DataApiResponse,
  SubmitPayload,
  StatusPayload,
  ProfilePayload,
  DriveUploadUrlPayload,
  DriveUploadUrlResponse,
  DriveUploadResponse,
} from '../types';

const BASE = import.meta.env.VITE_API_URL as string;

// ── Token management (FIX Vuln 3) ───────────────────────────────
const TOKEN_KEY = 'sciusnu_session_token';

export function saveToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

// ── Generic fetch wrapper ────────────────────────────────────────
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(text).message ?? msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  const text = await res.text();
  try { return JSON.parse(text) as T; } catch {
    throw new Error('ลิงก์ API ไม่ถูกต้อง');
  }
}

// ── Auth  — POST /api/auth ────────────────────────────────────────
export async function apiLogin(username: string, password: string): Promise<AuthResult> {
  const result = await apiFetch<AuthResult>('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (result.status === 'success' && result.token) {
    saveToken(result.token);
  }
  return result;
}

// ── Session / Logout ─────────────────────────────────────────────
export async function apiGetSession(): Promise<SessionResult> {
  return apiFetch<SessionResult>('/api/session');
}

export async function apiLogout(): Promise<void> {
  try {
    await apiFetch('/api/logout', { method: 'POST' });
  } catch {
    // Best-effort; clear token regardless
  } finally {
    clearToken();
  }
}

// ── Data  — GET /api/data ────────────────────────────────────────
export async function apiGetData(studentId?: string): Promise<DataApiResponse> {
  const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
  return apiFetch<DataApiResponse>(`/api/data${qs}`);
}

// ── Drive upload URL (deprecated, kept for backward compat) ──────
export async function apiGetDriveUploadUrl(
  payload: DriveUploadUrlPayload,
): Promise<DriveUploadUrlResponse> {
  return apiFetch<DriveUploadUrlResponse>('/api/drive-upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ── Submit — POST /api/submit ────────────────────────────────────
export async function apiSubmit(payload: SubmitPayload): Promise<{ status: string; message?: string }> {
  return apiFetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ── Status update — POST /api/status ────────────────────────────
export async function apiUpdateStatus(
  payload: Omit<StatusPayload, 'role' | 'reviewerEmail' | 'reviewerName'>,
): Promise<{ status: string; message?: string }> {
  return apiFetch('/api/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ── Profile update — POST /api/profile ──────────────────────────
export async function apiUpdateProfile(
  payload: ProfilePayload,
): Promise<{ status: string; profileUrl?: string; message?: string }> {
  return apiFetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ── Advisor password — POST /api/advisor-password ───────────────
export async function apiUpdateAdvisorPassword(payload: {
  oldPassword: string;
  newPassword: string;
}): Promise<{ status: string; message?: string }> {
  return apiFetch('/api/advisor-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ================================================================
// uploadFileDirect — the new primary upload path
//
// Flow:
//   1. Request a single-use upload token from the backend
//      POST /api/drive-upload-token  →  { uploadToken, gasUrl }
//   2. Convert the File to base64 in the browser (no size limit from
//      Vercel — the file bytes never touch the backend)
//   3. POST { uploadToken, base64Data, fileName } directly to GAS
//   4. GAS verifies signature + expiry + single-use jti → saves to Drive
//   5. Return the webViewLink
//
// The backend is only involved in step 1 (issuing a token < 1 KB).
// Files up to the GAS limit (~50 MB) work without chunking.
// ================================================================
export async function uploadFileDirect(
  file: File,
  fileName: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  onProgress?.(5);

  // ── Step 1: get upload token from backend ────────────────────
  const tokenRes = await apiFetch<{
    status: string;
    uploadToken: string;
    gasUrl: string;
    message?: string;
  }>('/api/drive-upload-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName,
      mimeType: file.type || 'application/pdf',
    }),
  });

  if (tokenRes.status !== 'success' || !tokenRes.uploadToken) {
    throw new Error(tokenRes.message || 'ไม่สามารถขอ upload token ได้');
  }

  onProgress?.(15);

  // ── Step 2: encode file to base64 in the browser ─────────────
  const base64Data = await fileToBase64(file);

  onProgress?.(40);

  // ── Step 3: POST directly to Apps Script ─────────────────────
  // We use application/x-www-form-urlencoded because Apps Script's
  // handling of multipart/form-data binary fields is unreliable.
  // The base64 payload is pure ASCII, so URL-encoding is safe and
  // Apps Script reads it via e.parameters.
  const params = new URLSearchParams();
  params.append('uploadToken', tokenRes.uploadToken);
  params.append('base64Data',  base64Data);
  params.append('fileName',    fileName);

  const gasRes = await fetch(tokenRes.gasUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
    // Apps Script redirects POST to a /exec URL — follow it
    redirect: 'follow',
  });

  onProgress?.(90);

  const gasText = await gasRes.text();
  let gasJson: DriveUploadResponse;
  try {
    gasJson = JSON.parse(gasText);
  } catch {
    throw new Error(`GAS returned non-JSON: ${gasText.slice(0, 120)}`);
  }

  if (gasJson.status !== 'success' || !gasJson.id) {
    throw new Error(gasJson.message || 'การอัปโหลดไฟล์ไปยัง Google Drive ล้มเหลว');
  }

  onProgress?.(100);

  return gasJson.webViewLink ?? `https://drive.google.com/file/d/${gasJson.id}/view`;
}

// ── Legacy uploadFileToDrive — now delegates to uploadFileDirect ─
// Kept so existing callers (StudentDashboard, resubmit popup) don't
// need to change their call sites.
export async function uploadFileToDrive(file: File, fileName: string): Promise<string> {
  return uploadFileDirect(file, fileName);
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Converts a File/Blob to a base64 string (no data-URI prefix).
 * Uses FileReader for broad browser compatibility.
 */
function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:*/*;base64, prefix
      const base64 = result.split(',')[1];
      if (!base64) reject(new Error('FileReader returned empty result'));
      else resolve(base64);
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}