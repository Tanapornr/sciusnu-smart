// ================================================================
// Petition system types — add to src/types/index.ts (or import here)
// ================================================================

export type PetitionType = 1 | 2 | 3 | 4 | 5 | 6;

export const PETITION_TYPE_LABELS: Record<number, string> = {
  1: "เพิ่มอาจารย์ที่ปรึกษามหาวิทยาลัย",
  2: "เพิ่มอาจารย์ที่ปรึกษาโรงเรียน",
  3: "ถอดถอนอาจารย์ที่ปรึกษา",
  4: "เปลี่ยนชื่อโครงงาน",
  5: "เปลี่ยนสาขาโครงงาน",
  6: "คำร้องอื่นๆ",
};

export type PetitionStatus = "รอดำเนินการ" | "เสร็จสิ้น" | "ปฏิเสธ";
export type ApprovalStatus = "อนุมัติ" | "ปฏิเสธ" | "";

export interface ApproverRecord {
  status: ApprovalStatus | "";
  note: string;
  signature: string;
  time: string;
}

export interface ChainStep {
  role: string; // student1, student2, advisor, coadvisor1, coadvisor2
  email: string;
  name: string;
}

export interface PetitionPayload {
  // Type 1
  faculty?: string;
  affiliation?: string;
  advisorName?: string;
  advisorEmail?: string;
  // Type 2
  option?: "A" | "B";
  schoolAdvisorName?: string;
  schoolAdvisorEmail?: string;
  requestStaff?: boolean;
  // Type 3
  removeType?: "university" | "school";
  removeName?: string;
  removeEmail?: string;
  removeFaculty?: string;
  removeReason?: string;
  // Type 4
  newNameTH?: string;
  newNameEN?: string;
  renameReason?: string;
  // Type 5
  currentField?: string;
  newField?: string;
  fieldReason?: string;
  // Type 6
  description?: string;
}

export interface Petition {
  _row?: number;
  petition_id: string;
  project_code: string;
  project_name: string;
  petition_type: string;
  petition_type_label?: string;
  requester_role: string;
  requester_email: string;
  requester_name: string;
  created_at: string;
  status: PetitionStatus;
  payload_json: string;
  current_step: string;
  final_result: string;
  updated_at: string;
  student1: ApproverRecord;
  student2: ApproverRecord;
  advisor: ApproverRecord;
  coadvisor1: ApproverRecord;
  coadvisor2: ApproverRecord;
  // Enriched on detail call
  chain?: ChainStep[];
  payload?: PetitionPayload;
}

export interface CreatePetitionPayload {
  petition_type: PetitionType;
  payload: PetitionPayload;
  project_code?: string;
  project_name?: string;
}

export interface PetitionListResponse {
  status: "success" | "error";
  petitions: Petition[];
  message?: string;
}

export interface PetitionDetailResponse {
  status: "success" | "error";
  petition: Petition;
  message?: string;
}

export interface PetitionApprovePayload {
  note?: string;
  signature: string; // base64 SVG data URI from canvas
}
