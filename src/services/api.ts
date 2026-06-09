// ================================================================
// src/services/api.ts  (patched)
// Change: apiFetch now throws on GAS relay errors (status:"error"
// in a 200 response). Previously these were silently returned as
// data and caused subtle bugs downstream.
//
// All other exports are unchanged — drop this file in directly.
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

// ── Token management ─────────────────────────────────────────────
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

  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    throw new Error('ลิงก์ API ไม่ถูกต้อง');
  }

  // HTTP-level error (4xx / 5xx)
  if (!res.ok) {
    throw new Error((json?.message as string) ?? `HTTP ${res.status}`);
  }

  // GAS relay returns HTTP 200 even on logical errors — catch them here
  // so callers can use try/catch uniformly without checking json.status.
  if (json?.status === 'error') {
    throw new Error((json.message as string) ?? 'เกิดข้อผิดพลาดจาก Apps Script');
  }

  return json as T;
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

// ── Data  — GET /api/data ─────────────────────────────────────────
export async function apiGetData(studentId?: string): Promise<DataApiResponse> {
  const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
  return apiFetch<DataApiResponse>(`/api/data${qs}`);
}

// ── Drive upload URL ──────────────────────────────────────────────
export async function apiGetDriveUploadUrl(
  payload: DriveUploadUrlPayload,
): Promise<DriveUploadUrlResponse> {
  return apiFetch<DriveUploadUrlResponse>('/api/drive-upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ── Submit — POST /api/submit ─────────────────────────────────────
export async function apiSubmit(payload: SubmitPayload): Promise<{ status: string; message?: string }> {
  return apiFetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ── Status update — POST /api/status ─────────────────────────────
export async function apiUpdateStatus(
  payload: Omit<StatusPayload, 'role' | 'reviewerEmail' | 'reviewerName'>,
): Promise<{ status: string; message?: string }> {
  return apiFetch('/api/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ── Profile update — POST /api/profile ───────────────────────────
export async function apiUpdateProfile(
  payload: ProfilePayload,
): Promise<{ status: string; profileUrl?: string; message?: string }> {
  return apiFetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ── Advisor password — POST /api/advisor-password ────────────────
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
// uploadFileDirect
// ================================================================
export async function uploadFileDirect(
  file: File,
  fileName: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  onProgress?.(5);

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
  const base64Data = await fileToBase64(file);
  onProgress?.(40);

  const params = new URLSearchParams();
  params.append('uploadToken', tokenRes.uploadToken);
  params.append('base64Data',  base64Data);
  params.append('fileName',    fileName);

  const gasRes = await fetch(tokenRes.gasUrl, {
    method:   'POST',
    headers:  { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:     params.toString(),
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

export async function uploadFileToDrive(file: File, fileName: string): Promise<string> {
  return uploadFileDirect(file, fileName);
}

function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      if (!base64) reject(new Error('FileReader returned empty result'));
      else resolve(base64);
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}
