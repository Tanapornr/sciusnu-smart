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
  SettingsResponse,
  SettingsUpdatePayload,
  // DriveUploadResponse,
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
): Promise<{ status: string; profileUrl?: string; newEmail?: string; message?: string }> {
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

// ── Settings (open/close date windows) ───────────────────────────
// GET /api/settings — any authenticated user
export async function apiGetSettings(): Promise<SettingsResponse> {
  return apiFetch<SettingsResponse>('/api/settings');
}

// POST /api/settings — admin only
export async function apiUpdateSettings(payload: SettingsUpdatePayload): Promise<SettingsResponse> {
  return apiFetch<SettingsResponse>('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// POST /api/check-upload-window — tiny pre-flight that asks the SERVER
// (using server clock) whether the submission window is open.
// Called BEFORE the client sends any file bytes — so if the window is
// closed, zero bytes ever reach the server/Drive.
export async function apiCheckUploadWindow(
  workType: string,
  isResubmit: boolean,
): Promise<{ allowed: boolean; message?: string }> {
  return apiFetch('/api/check-upload-window', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workType, isResubmit }),
  });
}

// ================================================================
// uploadFileDirect
// Uploads a file through the backend proxy (/api/drive-upload).
//
// The backend streams Server-Sent Events back as it processes each chunk:
//   { type:"start",    totalChunks:N }
//   { type:"chunk",    index:i, total:N }   ← after each GAS chunk ACK
//   { type:"finalize" }                     ← GAS assembling + writing to Drive
//   { type:"done",     id, webViewLink }
//   { type:"error",    message }
//
// Progress mapping:
//   Uploading browser→server : 0–10%  (fetch upload progress via ReadableStream)
//   Each chunk ACK from GAS  : 10–90% (real, proportional to chunk count)
//   Finalize (GAS→Drive)     : 90–98% (brief pause, no sub-steps)
//   Done                     : 100%
// ================================================================
export async function uploadFileDirect(
  file: File,
  fileName: string,
  onProgress?: (pct: number) => void,
  uploadMeta?: { workType?: string; isResubmit?: boolean },
): Promise<string> {
  const token = getToken();

  // Each chunk sent to backend must be under 4.5 MB (Vercel serverless limit).
  // Keep every non-final chunk divisible by 3 bytes. The Apps Script relay
  // stores each chunk as Base64 text and joins the strings before decoding;
  // a non-aligned chunk would add "=" padding in the middle of that string.
  const MAX_CHUNK_SIZE = 2 * 1024 * 1024;
  const CHUNK_SIZE = MAX_CHUNK_SIZE - (MAX_CHUNK_SIZE % 3);
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const sessionId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const baseHeaders: Record<string, string> = {
    'X-File-Name': encodeURIComponent(fileName),
    'X-File-Type': file.type || 'application/pdf',
    'X-Session-Id': sessionId,
    'X-Total-Chunks': String(totalChunks),
  };
  if (uploadMeta?.workType) baseHeaders['X-Work-Type'] = encodeURIComponent(uploadMeta.workType);
  if (uploadMeta?.isResubmit) baseHeaders['X-Is-Resubmit'] = '1';
  if (token) baseHeaders['Authorization'] = `Bearer ${token}`;

  onProgress?.(5);

  // ── Step 1: Upload each chunk sequentially ───────────────────────
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const chunkBlob = file.slice(start, end);

    const chunkHeaders = {
      ...baseHeaders,
      'Content-Type': 'application/octet-stream',
      'X-Action': 'uploadChunk',
      'X-Chunk-Index': String(i),
    };

    let res: Response;
    try {
      res = await fetch(`${BASE}/api/drive-upload`, {
        method: 'POST',
        headers: chunkHeaders,
        body: chunkBlob,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `การเชื่อมต่อขัดข้องขณะอัปโหลดชิ้นส่วนที่ ${i + 1}/${totalChunks}: ${message}`,
        { cause: err },
      );
    }

    if (!res.ok) {
      const text = await res.text();
      let msg = `HTTP ${res.status}`;
      try { msg = JSON.parse(text).message ?? msg; } catch { /* noop */ }
      if (res.status === 413) {
        msg = `ไฟล์ชิ้นส่วนมีขนาดใหญ่เกินไป (${(chunkBlob.size / 1024 / 1024).toFixed(1)} MB)`;
      }
      throw new Error(msg);
    }

    const pct = Math.round(((i + 1) / totalChunks) * 80);
    onProgress?.(pct);
  }

  // ── Step 2: Finalize upload (Google Apps Script assembles chunks) ─
  onProgress?.(85);
  const finalizeHeaders = {
    ...baseHeaders,
    'X-Action': 'finalize',
  };

  let finalRes: Response;
  try {
    finalRes = await fetch(`${BASE}/api/drive-upload`, {
      method: 'POST',
      headers: finalizeHeaders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`การรวมไฟล์ที่ Google Drive ขัดข้อง: ${message}`, { cause: err });
  }

  if (!finalRes.ok) {
    const text = await finalRes.text();
    let msg = `HTTP ${finalRes.status}`;
    try { msg = JSON.parse(text).message ?? msg; } catch { /* noop */ }
    throw new Error(msg);
  }

  const json = await finalRes.json();
  if (json.status !== 'success') {
    throw new Error(json.message || 'การสร้างไฟล์ใน Google Drive ล้มเหลว');
  }

  onProgress?.(100);
  return json.webViewLink || `https://drive.google.com/file/d/${json.id}/view`;
}

export async function uploadFileToDrive(
  file: File,
  fileName: string,
  onProgress?: (pct: number) => void,
  uploadMeta?: { workType?: string; isResubmit?: boolean },
): Promise<string> {
  // ── Pre-flight: ask the server (using SERVER clock) whether the
  // upload window is open BEFORE sending any file bytes. This is the
  // primary security gate — changing the client device's date/time
  // has zero effect since the check runs entirely on the server.
  if (uploadMeta?.workType) {
    const check = await apiCheckUploadWindow(
      uploadMeta.workType,
      uploadMeta.isResubmit ?? false,
    );
    if (!check.allowed) {
      throw new Error(check.message ?? 'ปิดรับการส่งงานนี้แล้ว');
    }
  }

  return uploadFileDirect(file, fileName, onProgress, uploadMeta);
}
