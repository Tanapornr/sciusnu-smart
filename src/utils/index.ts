// ================================================================
// Shared utility functions — ported & unified from all 5 HTML files
// ================================================================

import type { ProjectRow, SubmissionRow, SubmissionStatus, WorkType, ProjectInfo, GroupMember } from '../types';

// ---------------------------------------------------------------
// Object key lookup — fuzzy match by keyword list
// Used extensively in old code as getVal(obj, ['keyword1', 'keyword2'])
// NOTE: Keys are trimmed before comparison to handle trailing spaces
// (e.g. "ชื่อโครงงาน " and "รูปโปรไฟล์ " from Google Sheets)
// ---------------------------------------------------------------
export function getVal(obj: Record<string, string | undefined | null>, keywords: string[]): string {
  let emptyMatch = '';
  for (const key in obj) {
    // Trim the key to handle trailing spaces from Google Sheets
    const lowerKey = key.trim().replace(/\s+/g, '').toLowerCase();
    for (const word of keywords) {
      if (lowerKey.includes(word.toLowerCase())) {
        const value = obj[key] == null ? '' : String(obj[key]).trim();
        if (value) return value;
        emptyMatch = value;
      }
    }
  }
  return emptyMatch;
}

// ---------------------------------------------------------------
// Parse raw submission status from backend into canonical enum
// ---------------------------------------------------------------
export function parseSubmissionStatus(rawStatus: string | undefined): SubmissionStatus {
  const s = String(rawStatus ?? '').replace(/\s+/g, '').toLowerCase();
  if (!s) return 'รออนุมัติ';
  if (s === 'อนุมัติ' || s === 'อนุมัติแล้ว' || s === 'approved') return 'อนุมัติ';
  if (['ไม่อนุมัติ', 'ต้องแก้ไข', 'reject', 'rejected', 'แก้ไข'].some(k => s.includes(k))) return 'ไม่อนุมัติ';
  return 'รออนุมัติ';
}

// ---------------------------------------------------------------
// Format ISO date string to Thai locale display
// ---------------------------------------------------------------
export function formatDateTimeTH(rawStr: string | undefined): { date: string; time: string } {
  if (!rawStr) return { date: '-', time: '' };
  const d = new Date(rawStr);
  if (isNaN(d.getTime())) return { date: rawStr, time: '' };
  return {
    date: d.toLocaleDateString('th-TH'),
    time: d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.',
  };
}

// ---------------------------------------------------------------
// Convert Google Drive share URL → thumbnail/direct URL
// ---------------------------------------------------------------
export function getDirectImageUrl(url: string | undefined): string {
  if (!url || url === '-' || url === '') return '';
  if (url.startsWith('data:image')) return url;
  if (url.includes('drive.google.com')) {
    const match = url.match(/[-\w]{25,}/);
    if (match) return `https://drive.google.com/thumbnail?id=${match[0]}&sz=w500`;
  }
  return url;
}

// ---------------------------------------------------------------
// Build avatar fallback URL
// ---------------------------------------------------------------
export function avatarFallback(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=f0f0f0&color=1a1a1a`;
}

// ---------------------------------------------------------------
// Process profile picture URL — drive thumbnail or fallback avatar
// ---------------------------------------------------------------
export function getProcessedImgUrl(url: string | undefined, name: string): string {
  const direct = getDirectImageUrl(url);
  return direct || avatarFallback(name);
}

// ---------------------------------------------------------------
// Escape HTML special characters (prevent XSS in SweetAlert HTML)
// ---------------------------------------------------------------
export function escapeHtml(value: string | undefined): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] ?? char));
}

// ---------------------------------------------------------------
// Normalize values for comparison (trim, lowercase, no spaces)
// ---------------------------------------------------------------
export function normalizeCompare(value: string | undefined): string {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase();
}

// ---------------------------------------------------------------
// Normalize advisor name (strip อ., ดร., spaces, commas)
// ---------------------------------------------------------------
export function normalizeName(value: string | undefined): string {
  return String(value ?? '')
    .replace(/^อ\.\s*/, '')
    .replace(/ดร\./g, '')
    .replace(/\s+/g, '')
    .replace(/,/g, '')
    .toLowerCase();
}

// ---------------------------------------------------------------
// Extract email from a cell that may contain "Name <email>" format
// ---------------------------------------------------------------
export function extractEmail(raw: string | undefined): string {
  const text = String(raw ?? '').trim().toLowerCase();
  const angleMatch = text.match(/<([^>]+)>/);
  if (angleMatch) return angleMatch[1].trim();
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return emailMatch ? emailMatch[0] : text;
}

// ---------------------------------------------------------------
// Extract name part from "Name <email>" or "อ.Name" format
// ---------------------------------------------------------------
export function extractName(raw: string | undefined): string {
  const text = String(raw ?? '').trim();
  const nameOnly = text.replace(/<[^>]+>/g, '').replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g, '').trim();
  return nameOnly || text;
}

// ---------------------------------------------------------------
// Get value from a ProjectRow by column index
// ---------------------------------------------------------------
export function getColByIndex(obj: ProjectRow, index: number): string {
  const keys = Object.keys(obj);
  if (keys.length > index && obj[keys[index]] != null) {
    return String(obj[keys[index]]).trim();
  }
  return '';
}

// ---------------------------------------------------------------
// Parse a ProjectRow into structured ProjectInfo
// Column indices match backend helpers.js getGroupInfo()
// NOTE: Some Google Sheets column headers have trailing spaces
// (e.g. "ชื่อโครงงาน " and "รูปโปรไฟล์ ") — we use fuzzy key lookup
// to handle this gracefully alongside exact matches.
// ---------------------------------------------------------------
export function parseProjectRow(row: any): ProjectInfo {
  // Helper: get by exact key, trim value
  const get = (key: string) => String(row[key] ?? '').trim();

  // Helper: fuzzy get — tries exact key first, then searches for key containing the string
  const fuzzyGet = (exactKey: string): string => {
    if (row[exactKey] != null && String(row[exactKey]).trim() !== '') return String(row[exactKey]).trim();
    // Search keys for one that starts with or contains the exact key (handles trailing spaces)
    for (const k of Object.keys(row)) {
      if (k.trim() === exactKey.trim() && row[k] != null) return String(row[k]).trim();
    }
    return '';
  };

  return {
    email: get('E-mail นักเรียน'),
    studentId: get('รหัสนักเรียน'),
    firstName: get('ชื่อ'),
    lastName: get('นามสกุล'),
    projectId: get('รหัสโครงงาน'),
    advEmail: extractEmail(get('E-mail อ.ที่ปรึกษา')),
    advName: extractName(get('อ. ที่ปรึกษา TH')),
    coAdvEmail: extractEmail(get('E-mail อ.ที่ปรึกษาร่วม')),
    coAdvName: extractName(get('ที่ปรึกษาร่วม')),
    schAdvEmail: extractEmail(get('E-mail อ.ที่ปรึกษาโรงเรียน')),
    schAdvName: extractName(get('ที่ปรึกษา โรงเรียน')),
    // "ชื่อโครงงาน " has a trailing space in the Google Sheet header
    projectNameTH: fuzzyGet('ชื่อโครงงาน'),
    phone: get('เบอร์โทรศัพท์').replace(/'/g, ''),
    // "รูปโปรไฟล์ " has a trailing space in the Google Sheet header
    profileUrl: fuzzyGet('รูปโปรไฟล์'),
  };
}

// ---------------------------------------------------------------
// Extract group members from a list of project rows sharing same projectId
// ---------------------------------------------------------------
export function extractGroupMembers(rows: ProjectRow[], projectId: string): GroupMember[] {
  const normPid = normalizeCompare(projectId);
  const seen = new Set<string>();
  const members: GroupMember[] = [];

  for (const row of rows) {
    const info = parseProjectRow(row);
    const rowPid = normalizeCompare(info.projectId);
    if (rowPid !== normPid || !info.studentId) continue;
    if (seen.has(info.studentId)) continue;
    seen.add(info.studentId);
    members.push({
      studentId: info.studentId,
      firstName: info.firstName,
      lastName: info.lastName,
      phone: info.phone,
      profileUrl: getProcessedImgUrl(info.profileUrl, info.firstName),
      email: info.email,
    });
  }
  return members;
}

// ---------------------------------------------------------------
// Get the latest submission reason from a submission row
// (checks all possible key names used in backend)
// ---------------------------------------------------------------
export function getSubmissionReason(row: SubmissionRow): string {
  const reasonKeys = [
    'หมายเหตุ', 'เหตุผล', 'reason', 'note', 'comment',
    'rejectreason', 'previousreason', 'resubmitreason',
  ];
  for (const key in row) {
    const normalKey = key.replace(/\s+/g, '').toLowerCase();
    if (reasonKeys.some(k => normalKey.includes(k))) {
      const val = row[key];
      if (val) return String(val).trim();
    }
  }
  return '';
}

// ---------------------------------------------------------------
// Get file URL from submission (handles multiple column name variants)
// ---------------------------------------------------------------
export function getSubmissionFileUrl(row: SubmissionRow): string {
  return (
    row['urlไฟล์เล่ม'] ||
    row['URL ไฟล์เล่ม'] ||
    getVal(row as Record<string, string | undefined>, ['urlไฟล์', 'urlfile', 'fileurl', 'urlเล่ม']) ||
    ''
  );
}

// ---------------------------------------------------------------
// Determine active reject types from the current submissions list
// Returns array of WorkTypes that need resubmission
// ---------------------------------------------------------------
export function getActiveRejectTypes(submissions: SubmissionRow[]): WorkType[] {
  // Sort ascending by time
  const sorted = [...submissions].sort((a, b) => {
    return new Date(a.Timestamp ?? 0).getTime() - new Date(b.Timestamp ?? 0).getTime();
  });

  const tracker: Record<string, 'reject' | 'pending' | 'approved'> = {};
  for (const s of sorted) {
    const wt = getVal(s as Record<string, string | undefined>, ['ประเภทงาน']) as WorkType;
    const st = parseSubmissionStatus(getVal(s as Record<string, string | undefined>, ['สถานะ', 'status']));
    if (st === 'ไม่อนุมัติ') tracker[wt] = 'reject';
    else if (st === 'อนุมัติ') tracker[wt] = 'approved';
    else if (tracker[wt] === 'reject') tracker[wt] = 'pending'; // re-submitted
  }

  return (Object.entries(tracker)
    .filter(([, v]) => v === 'reject')
    .map(([k]) => k)) as WorkType[];
}

// ---------------------------------------------------------------
// Convert File to base64 data + mime (used for old profile upload path)
// ---------------------------------------------------------------
export function fileToBase64(file: File): Promise<{ data: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ data: result.split(',')[1], mime: file.type });
    };
    reader.onerror = reject;
  });
}

// ---------------------------------------------------------------
// Resize & compress an image file using canvas (for profile picture)
// ---------------------------------------------------------------
export function resizeProfileImage(
  file: File,
  maxSize = 700,
  quality = 0.78,
): Promise<{ data: string; mime: string }> {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      reject(new Error('กรุณาใช้ไฟล์รูป JPG, PNG หรือ WEBP เท่านั้น'));
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
        else if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ data: dataUrl.split(',')[1], mime: 'image/jpeg' });
      };
      img.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปนี้ได้'));
      img.src = e.target!.result as string;
    };
    reader.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
  });
}

// ---------------------------------------------------------------
// localStorage helpers — typed, safe
// ---------------------------------------------------------------
export const storage = {
  get: (key: string): string => localStorage.getItem(key) ?? '',
  set: (key: string, value: string) => localStorage.setItem(key, value),
  remove: (key: string) => localStorage.removeItem(key),
  clear: () => localStorage.clear(),
};
