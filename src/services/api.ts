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

  // ── Timeouts ─────────────────────────────────────────────────────
  // One AbortController rules everything — both the fetch upload phase
  // and the SSE reading phase use the same signal.  When either timeout
  // fires it just calls abort() and the browser tears down the whole
  // connection cleanly without leaving a locked ReadableStream behind.
  //
  // FETCH_TIMEOUT   : browser → server upload + initial SSE open.
  //                   ≥60 s, +3 s per MB so large files aren't cut short.
  // STREAM_TIMEOUT  : max silence between SSE events (GAS/Drive stall).
  //                   Resets on every chunk event; fires if 90 s of silence.
  const FETCH_TIMEOUT_MS  = Math.max(60_000, file.size / 1024 / 1024 * 3_000);
  const STREAM_TIMEOUT_MS = 180_000;

  // Single controller for the entire request lifetime.
  // A fresh one is created every call so a previous abort never
  // bleeds into the next upload attempt.
  const ctrl = new AbortController();

  // Human-readable reason so the error message is accurate
  let timeoutReason = 'การอัปโหลดหมดเวลา — เครือข่ายช้าหรือไฟล์ใหญ่เกินไป';

  const fetchTimer = setTimeout(() => {
    timeoutReason = 'การอัปโหลดหมดเวลา — เครือข่ายช้าหรือไฟล์ใหญ่เกินไป';
    ctrl.abort();
  }, FETCH_TIMEOUT_MS);

  let streamTimer: ReturnType<typeof setTimeout> | null = null;
  const resetStreamTimer = () => {
    if (streamTimer) clearTimeout(streamTimer);
    streamTimer = setTimeout(() => {
      timeoutReason = 'การอัปโหลดค้าง — Apps Script หรือ Google Drive ไม่ตอบสนอง';
      ctrl.abort(); // abort the fetch/reader via signal — no manual reader.cancel()
    }, STREAM_TIMEOUT_MS);
  };
  const clearAllTimers = () => {
    clearTimeout(fetchTimer);
    if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
  };

  const headers: Record<string, string> = {
    'X-File-Name': encodeURIComponent(fileName),
    'X-File-Type': file.type || 'application/pdf',
  };
  if (uploadMeta?.workType) headers['X-Work-Type'] = encodeURIComponent(uploadMeta.workType);
  if (uploadMeta?.isResubmit) headers['X-Is-Resubmit'] = '1';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/drive-upload`, {
      method: 'POST',
      headers,
      body: file,
      signal: ctrl.signal,
    });
  } catch (err: any) {
    clearAllTimers();
    if (err?.name === 'AbortError') throw new Error(timeoutReason);
    throw err;
  }
  clearTimeout(fetchTimer); // upload reached server; cancel upload-phase timer

  if (!res.ok || !res.body) {
    clearAllTimers();
    const text = await res.text();
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(text).message ?? msg; } catch { /* noop */ }

    if (res.status === 413) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      msg = `ไฟล์มีขนาดใหญ่เกินไป (${sizeMB} MB) — ระบบรองรับไฟล์สูงสุด 25 MB กรุณาบีบอัดหรือลดขนาดไฟล์แล้วลองใหม่`;
    }

    throw new Error(msg);
  }

  // ── Read the SSE stream ─────────────────────────────────────────
  // We do NOT call getReader() here. Instead we use a for-await loop
  // on res.body which the browser owns — when ctrl.abort() fires the
  // signal, the browser cancels the underlying fetch and the for-await
  // throws an AbortError naturally, leaving no locked stream behind.
  try {
    resetStreamTimer(); // start silence watchdog

    let buf = '';

    const handleEvent = (line: string): { result: string } | null => {
      if (!line.startsWith('data: ')) return null;
      let evt: Record<string, unknown>;
      try { evt = JSON.parse(line.slice(6)); } catch { return null; }

      resetStreamTimer(); // got data — push watchdog back

      switch (evt.type) {
        case 'start':    { onProgress?.(10);  return null; }
        case 'chunk':    {
          const done  = (evt.index as number) + 1;
          const total = evt.total as number;
          onProgress?.(10 + Math.round((done / total) * 80));
          return null;
        }
        case 'finalize': { onProgress?.(92); return null; }
        case 'done': {
          onProgress?.(100);
          return {
            result: (evt.webViewLink as string) ??
                    `https://drive.google.com/file/d/${evt.id as string}/view`,
          };
        }
        case 'error':    { throw new Error((evt.message as string) || 'Upload failed'); }
      }
      return null;
    };

    const decoder = new TextDecoder();
    const reader  = res.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const r = handleEvent(line.trim());
          if (r) { clearAllTimers(); return r.result; }
        }
      }
    } finally {
      // Always release the reader lock so the next upload can use a fresh stream
      reader.releaseLock();
    }

    throw new Error('SSE stream closed without a done event');
  } catch (err: any) {
    clearAllTimers();
    if (err?.name === 'AbortError') throw new Error(timeoutReason);
    throw err;
  }
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