// ================================================================
// API service — all backend calls go through here.
// Base URL is driven by Vite env var: VITE_API_URL
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

// ---------------------------------------------------------------
// Helper — generic fetch wrapper
// ---------------------------------------------------------------
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
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

// ---------------------------------------------------------------
// Auth  — POST /api/auth
// ---------------------------------------------------------------
export async function apiLogin(username: string, password: string): Promise<AuthResult> {
  return apiFetch<AuthResult>('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

// ---------------------------------------------------------------
// Data  — GET /api/data[?studentId=...]
// ---------------------------------------------------------------
export async function apiGetData(studentId?: string): Promise<DataApiResponse> {
  const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
  return apiFetch<DataApiResponse>(`/api/data${qs}`);
}

// ---------------------------------------------------------------
// Drive upload URL  — POST /api/drive-upload-url
// Returns a GCS / Drive resumable upload URL
// ---------------------------------------------------------------
export async function apiGetDriveUploadUrl(
  payload: DriveUploadUrlPayload,
): Promise<DriveUploadUrlResponse> {
  return apiFetch<DriveUploadUrlResponse>('/api/drive-upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------
// Submit — POST /api/submit
// File is uploaded directly to Drive first; then we pass the URL.
// ---------------------------------------------------------------
export async function apiSubmit(payload: SubmitPayload): Promise<{ status: string; message?: string }> {
  return apiFetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------
// Status update — POST /api/status  (advisor / admin only)
// ---------------------------------------------------------------
export async function apiUpdateStatus(
  payload: StatusPayload,
): Promise<{ status: string; message?: string }> {
  return apiFetch('/api/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------
// Profile update — POST /api/profile  (student)
// ---------------------------------------------------------------
export async function apiUpdateProfile(
  payload: ProfilePayload,
): Promise<{ status: string; profileUrl?: string; message?: string }> {
  return apiFetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------
// Advisor password — POST /api/advisor-password
// ---------------------------------------------------------------
export async function apiUpdateAdvisorPassword(payload: {
  email: string;
  role: string;
  oldPassword: string;
  newPassword: string;
}): Promise<{ status: string; message?: string }> {
  return apiFetch('/api/advisor-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------
// Upload a file directly to Google Drive via resumable upload URL
// Returns the final Drive file URL (webViewLink / direct link)
// ---------------------------------------------------------------
export async function uploadFileToDrive(file: File, fileName: string): Promise<string> {
  // 1. Get a resumable upload URL from our backend
  const { uploadUrl } = await apiGetDriveUploadUrl({
    fileName,
    mimeType: file.type,
  });

  // 2. PUT the raw bytes directly to Drive
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!putRes.ok) throw new Error('อัปโหลดไฟล์ไปยัง Drive ไม่สำเร็จ');

  const driveData = await putRes.json().catch(() => ({})) as { id?: string; webViewLink?: string };
  const fileId = driveData.id ?? '';
  if (!fileId) throw new Error('ไม่ได้รับ File ID จาก Google Drive');

  // Return direct viewable link
  return `https://drive.google.com/file/d/${fileId}/view`;
}
