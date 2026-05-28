export type UserRole = "student" | "advisor_main" | "advisor" | "admin";

export interface User {
  role: UserRole;
  email: string;
  name: string;
  studentId: string;
  profileUrl: string;
}

export interface ProjectRow {
  [key: string]: string;
}

export interface Submission {
  Timestamp: string;
  รหัสนักเรียน: string;
  ชื่อ: string;
  นามสกุล: string;
  รหัสโครงงาน: string;
  ประเภทงาน: string;
  "URL ไฟล์เล่ม": string;
  "URL ลายเซ็น": string;
  สถานะ: string;
  "อ.ที่ปรึกษา": string;
  หมายเหตุ: string;
}

export interface SubmitPayload {
  studentId: string;
  firstName: string;
  lastName: string;
  projectId: string;
  workType: string;
  advisorName: string;
  file1Url: string;
  file2Url?: string;
  reason?: string;
}

export interface StatusPayload {
  studentId: string;
  projectId: string;
  workType: string;
  status: string;
  reason?: string;
  reviewerEmail: string;
  reviewerName: string;
  role: UserRole;
}

export interface ProfilePayload {
  email: string;
  oldPassword?: string;
  newPassword?: string;
  phone?: string;
  profileUrl?: string;
}

export interface AdvisorPasswordPayload {
  role: "advisor_main" | "advisor";
  email: string;
  oldPassword: string;
  newPassword: string;
}