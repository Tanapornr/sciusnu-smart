// ============================================================
// Core domain types — derived from backend API (sheet columns)
// and validated against all 5 old HTML files.
// ============================================================

export type UserRole = 'student' | 'admin' | 'advisor_main' | 'advisor' | 'viewer';

export interface AuthResult {
  status: 'success' | 'error';
  role: UserRole;
  email: string;
  name: string;
  studentId: string;
  profileUrl: string;
  message?: string;
  token?: string; // JWT issued on successful login
}

export interface User {
  email: string;
  name: string;
  role: UserRole;
  studentId: string;
  profileUrl: string;
}

export interface SessionResult extends User {
  status: 'success' | 'error';
  message?: string;
}

// ---------------------------------------------------------------
// Sheet1 row — project/student row from backend /api/data
// Key names match what backend returns after rowsToObjects()
// ---------------------------------------------------------------
export interface ProjectRow {
  // Indexed columns (backend strips passwords, so safe to use directly)
  [key: string]: string;
}

// Typed view of a parsed project (extracted from ProjectRow)
export interface ProjectInfo {
  email: string;          // col 0
  studentId: string;      // col 1
  firstName: string;      // col 2
  lastName: string;       // col 3
  projectId: string;      // col 5
  phone: string;          // col 19
  profileUrl: string;     // col 20
  advEmail: string;       // col 8
  advName: string;        // col 9
  coAdvEmail: string;     // col 12
  coAdvName: string;      // col 13
  schAdvEmail: string;    // col 15
  schAdvName: string;     // col 16
  projectNameTH: string;  // col 17
}

// ---------------------------------------------------------------
// Submissions row — from backend /api/data submissions array
// ---------------------------------------------------------------
export interface SubmissionRow {
  Timestamp: string;
  รหัสนักเรียน: string;
  ชื่อ: string;
  นามสกุล: string;
  รหัสโครงงาน: string;
  ประเภทงาน: WorkType;
  'urlไฟล์เล่ม'?: string;
  'URL ไฟล์เล่ม'?: string;
  'URL ลายเซ็น'?: string;
  สถานะ: string;
  'อ.ที่ปรึกษา'?: string;
  หมายเหตุ?: string;
  [key: string]: any;
}

export type WorkType =
  | 'โครงร่าง (Proposal)'
  | 'รายงานความก้าวหน้า'
  | 'รายงานฉบับสมบูรณ์'
  | 'แบบคำร้อง';

export type SubmissionStatus = 'อนุมัติ' | 'ไม่อนุมัติ' | 'รออนุมัติ' | 'รอตรวจ';

// A processed submission row (enriched by renderTable logic)
export interface ProcessedSubmission extends SubmissionRow {
  _rawStatus: SubmissionStatus;
  _displayStatus: SubmissionStatus | 'รอการตรวจอนุมัติ';
  _workType: WorkType;
  _reason: string;
  _isResubmit: boolean;
  _oldReason?: string;
  _oldRejectTime?: string;
}

// ---------------------------------------------------------------
// Group member (parsed from ProjectRow)
// ---------------------------------------------------------------
export interface GroupMember {
  studentId: string;
  firstName: string;
  lastName: string;
  phone: string;
  profileUrl: string;
  email: string;
}

// ---------------------------------------------------------------
// Data API response shape
// ---------------------------------------------------------------
export interface DataApiResponse {
  status: 'success' | 'error';
  projects: ProjectRow[];
  submissions: SubmissionRow[];
  message?: string;
}

// ---------------------------------------------------------------
// Submit payload sent to /api/submit
// ---------------------------------------------------------------
export interface SubmitPayload {
  studentId: string;
  firstName: string;
  lastName: string;
  projectId: string;
  workType: WorkType;
  advisorName: string;
  file1Url: string;
  file2Url?: string;
  reason?: string;
}

// ---------------------------------------------------------------
// Status update payload sent to /api/status
// FIX Vuln 2: reviewer identity (role/email/name) is derived by the
// server from the JWT — never sent by the client.
// ---------------------------------------------------------------
export interface StatusPayload {
  studentId: string;
  projectId: string;
  workType: WorkType;
  status: 'อนุมัติ' | 'ไม่อนุมัติ';
  reason?: string;
}

// ---------------------------------------------------------------
// Profile update payload sent to /api/profile
// ---------------------------------------------------------------
export interface ProfilePayload {
  email: string;
  phone?: string;
  profileUrl?: string;
  oldPassword?: string;
  newPassword?: string;
}

// ---------------------------------------------------------------
// Drive upload URL request
// ---------------------------------------------------------------
export interface DriveUploadUrlPayload {
  fileName: string;
  mimeType: string;
}

export interface DriveUploadUrlResponse {
  status: 'success' | 'error';
  uploadUrl: string;
}
