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
  DataApiResponse,
  SubmitPayload,
  StatusPayload,
  ProfilePayload,
  DriveUploadUrlPayload,
  DriveUploadUrlResponse,
} from '../types';

const BASE = import.meta.env.VITE_API_URL as string;

// ── Token management (FIX Vuln 3) ───────────────────────────────
// sessionStorage is scoped to the tab and cleared when the tab closes,
// significantly reducing exposure from shared computers.
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
  // Save the server-issued JWT immediately on successful login
  if (result.status === 'success' && result.token) {
    saveToken(result.token);
  }
  return result;
}

// ── Logout — POST /api/logout (FIX Vuln 8) ──────────────────────
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
// NOTE: studentId param removed from student calls — the backend now
// derives the student's ID from the JWT directly (FIX Vuln 1 & 4).
export async function apiGetData(studentId?: string): Promise<DataApiResponse> {
  // Only admin/advisor callers pass studentId; student role ignores it server-side
  const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
  return apiFetch<DataApiResponse>(`/api/data${qs}`);
}

// ── Drive upload URL  — POST /api/drive-upload-url ──────────────
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

// ── Status update — POST /api/status (advisor / admin only) ──────
// FIX Vuln 2: The role/email/name fields are REMOVED from the payload.
//   The server reads them exclusively from the JWT. Sending them would
//   be ignored, but we don't send them to avoid confusion.
export async function apiUpdateStatus(
  payload: Omit<StatusPayload, 'role' | 'reviewerEmail' | 'reviewerName'>,
): Promise<{ status: string; message?: string }> {
  return apiFetch('/api/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ── Profile update — POST /api/profile (student) ─────────────────
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
// FIX Vuln 2 & 5: role and email are NOT sent — server reads them from JWT.
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

// ── Upload a file directly to Google Drive via resumable upload URL
export async function uploadFileToDrive(file: File, fileName: string): Promise<string> {
  const { uploadUrl } = await apiGetDriveUploadUrl({
    fileName,
    mimeType: file.type,
  });

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!putRes.ok) throw new Error('อัปโหลดไฟล์ไปยัง Drive ไม่สำเร็จ');

  const driveData = await putRes.json().catch(() => ({})) as { id?: string; webViewLink?: string };
  const fileId = driveData.id ?? '';
  if (!fileId) throw new Error('ไม่ได้รับ File ID จาก Google Drive');

  return `https://drive.google.com/file/d/${fileId}/view`;
}
