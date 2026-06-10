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

const BASE = import.meta.env.VITE_API_URL || '';

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
// Uploads a file through the backend proxy (/api/drive-upload).
// The backend handles chunking to Apps Script, so we can support
// files up to ~45 MB without hitting GAS URL Fetch limits.
// ================================================================
export async function uploadFileDirect(
  file: File,
  fileName: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  onProgress?.(5);

  const token = getToken();

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/api/drive-upload`);

    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(fileName));
    xhr.setRequestHeader('X-File-Type', file.type || 'application/pdf');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        // Map upload progress to 10–90% range
        const pct = 10 + Math.round((e.loaded / e.total) * 80);
        onProgress?.(pct);
      }
    };

    xhr.onload = () => {
      onProgress?.(95);
      let json: DriveUploadResponse;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        return reject(new Error(`Server returned non-JSON: ${xhr.responseText.slice(0, 120)}`));
      }
      if (xhr.status !== 200 || json.status !== 'success' || !json.id) {
        return reject(new Error(json.message || `Upload failed (HTTP ${xhr.status})`));
      }
      onProgress?.(100);
      resolve(json.webViewLink ?? `https://drive.google.com/file/d/${json.id}/view`);
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));

    xhr.timeout = 5 * 60 * 1000; // 5-minute timeout for large files
    xhr.send(file);
  });
}

export async function uploadFileToDrive(file: File, fileName: string): Promise<string> {
  return uploadFileDirect(file, fileName);
}


