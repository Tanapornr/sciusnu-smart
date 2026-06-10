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
): Promise<string> {
  const token = getToken();

  // ── Timeouts ────────────────────────────────────────────────────
  // FETCH_TIMEOUT   : how long to wait for the server to accept the upload
  //                   and open the SSE stream (covers network stall + Vercel
  //                   cold-start). Per-MB headroom so large files aren't cut off
  //                   before they finish uploading to the backend.
  // STREAM_TIMEOUT  : max silence between SSE events once the stream is open.
  //                   If GAS or Drive stalls mid-chunk this fires.
  //                   Each chunk round-trip takes ~2–5 s normally;
  //                   60 s gives plenty of room for slow GAS without hanging forever.
  const FETCH_TIMEOUT_MS  = Math.max(60_000, file.size / 1024 / 1024 * 3_000); // ≥60 s, +3 s/MB
  const STREAM_TIMEOUT_MS = 90_000; // 90 s max silence between events

  const abortCtrl = new AbortController();

  // Fetch timeout — fires if the upload stalls before the SSE stream opens
  const fetchTimer = setTimeout(() => {
    abortCtrl.abort();
  }, FETCH_TIMEOUT_MS);

  const headers: Record<string, string> = {
    'X-File-Name': encodeURIComponent(fileName),
    'X-File-Type': file.type || 'application/pdf',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/drive-upload`, {
      method: 'POST',
      headers,
      body: file,
      signal: abortCtrl.signal,
    });
  } catch (err: any) {
    clearTimeout(fetchTimer);
    if (err?.name === 'AbortError') {
      throw new Error('การอัปโหลดหมดเวลา — เครือข่ายช้าหรือไฟล์ใหญ่เกินไป');
    }
    throw err;
  }
  clearTimeout(fetchTimer);

  if (!res.ok || !res.body) {
    const text = await res.text();
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(text).message ?? msg; } catch { /* noop */ }
    throw new Error(msg);
  }

  // ── Read the SSE stream line by line ────────────────────────────
  return new Promise<string>((resolve, reject) => {
    const reader  = res.body!.getReader();
    const decoder = new TextDecoder();
    let   buf     = '';

    // Stream watchdog — reset on every event; fires if stream goes silent
    let streamTimer: ReturnType<typeof setTimeout> | null = null;
    const resetStreamTimer = () => {
      if (streamTimer) clearTimeout(streamTimer);
      streamTimer = setTimeout(() => {
        reader.cancel();
        reject(new Error('การอัปโหลดค้าง — Apps Script หรือ Google Drive ไม่ตอบสนอง'));
      }, STREAM_TIMEOUT_MS);
    };
    const clearStreamTimer = () => {
      if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
    };

    resetStreamTimer(); // start watchdog as soon as stream opens

    const handleEvent = (line: string) => {
      if (!line.startsWith('data: ')) return;
      let evt: Record<string, unknown>;
      try { evt = JSON.parse(line.slice(6)); } catch { return; }

      resetStreamTimer(); // got an event — reset silence watchdog

      switch (evt.type) {
        case 'start': {
          onProgress?.(10);
          break;
        }
        case 'chunk': {
          const done  = (evt.index as number) + 1;
          const total = evt.total as number;
          const pct   = 10 + Math.round((done / total) * 80);
          onProgress?.(pct);
          break;
        }
        case 'finalize': {
          onProgress?.(92);
          break;
        }
        case 'done': {
          clearStreamTimer();
          onProgress?.(100);
          resolve(
            (evt.webViewLink as string) ??
            `https://drive.google.com/file/d/${evt.id as string}/view`,
          );
          break;
        }
        case 'error': {
          clearStreamTimer();
          reject(new Error((evt.message as string) || 'Upload failed'));
          break;
        }
      }
    };

    const pump = (): Promise<void> =>
      reader.read().then(({ done, value }) => {
        if (done) return;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) handleEvent(line.trim());
        return pump();
      }).catch((err) => {
        clearStreamTimer();
        reject(err);
      });

    pump();
  });
}

export async function uploadFileToDrive(file: File, fileName: string, onProgress?: (pct: number) => void): Promise<string> {
  return uploadFileDirect(file, fileName, onProgress);
}


