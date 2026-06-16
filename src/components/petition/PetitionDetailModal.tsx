// ================================================================
// components/petition/PetitionDetailModal.tsx
// Shows petition details, timeline, approval chain, and action UI
// Concurrent stage-based approval (order depends on who filed the petition):
//   student_first (default, student-filed): students → advisors → admin
//   advisor_first (advisor-filed):           advisors → students → admin
//   Final stage — any admin approves (with dropdown name + confirm popup)
// ================================================================
import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { apiGetPetition, apiApprovePetition, apiRejectPetition } from '../../services/petitionApi';
import { formatDateTimeTH } from '../../utils';
import { exportViaPrint } from '../../utils/exportPetitionPdf';
import type { Petition, ChainStep, StageOrder } from '../../types/petition';
import { PETITION_TYPE_LABELS } from '../../types/petition';
import {
  X, CheckCircle2, XCircle, Clock, ChevronDown,
  AlertTriangle, Users, Shield, FileDown
} from 'lucide-react';
import { Spinner } from '../ui';
import SignaturePad from './SignaturePad';
import Swal from 'sweetalert2';

// ── Admin names dropdown ──────────────────────────────────────────
const ADMIN_NAMES = [
  'อ.อรุโณทัย กัลยา',
  'อ.สุจิตรา แป้นแก้ว',
  'อ.ศุภรินทร อนุพงศ์',
  'อ.ภาณุพงศ์ ช้างต่อ'
];
interface Props {
  petitionId: string;
  onClose: () => void;
  onUpdate: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  student1:   'นักเรียนคนที่ 1',
  student2:   'นักเรียนคนที่ 2',
  advisor:    'อาจารย์ที่ปรึกษา',
  coadvisor1: 'อาจารย์ที่ปรึกษาร่วม 1',
  coadvisor2: 'อาจารย์ที่ปรึกษาร่วม 2',
  admin:      'ผู้ดูแลระบบ',
};

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

function getStageSequence(stageOrder: StageOrder): Array<'students' | 'advisors'> {
  return stageOrder === 'advisor_first' ? ['advisors', 'students'] : ['students', 'advisors'];
}

/** Determine which stage the petition is currently in, respecting stageOrder */
function getPendingStage(petition: Petition, chain: ChainStep[], stageOrder: StageOrder = 'student_first'): 'students' | 'advisors' | 'admin' | 'done' {
  const studentRoles  = chain.filter(s => s.role.startsWith('student')).map(s => s.role);
  const advisorRoles  = chain.filter(s => ['advisor','coadvisor1','coadvisor2'].includes(s.role)).map(s => s.role);
  const allStudentsDone = studentRoles.every(r => !!(petition[r as keyof Petition] as any)?.status);
  const allAdvisorsDone = advisorRoles.every(r => !!(petition[r as keyof Petition] as any)?.status);
  const adminDone       = !!(petition.admin as any)?.status;

  const doneMap = { students: allStudentsDone, advisors: allAdvisorsDone };
  for (const stage of getStageSequence(stageOrder)) {
    if (!doneMap[stage]) return stage;
  }
  if (!adminDone) return 'admin';
  return 'done';
}

export default function PetitionDetailModal({ petitionId, onClose, onUpdate }: Props) {
  const { user } = useAuthStore();
  const [petition, setPetition] = useState<Petition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Approval state
  const [showApproveUI, setShowApproveUI] = useState(false);
  const [note, setNote]           = useState('');
  const [signature, setSignature] = useState('');
  const [adminName, setAdminName] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiGetPetition(petitionId)
      .then(res => {
        if (res.status === 'success') setPetition(res.petition);
        else setError(res.message || 'โหลดข้อมูลล้มเหลว');
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [petitionId]);

  // ── Determine if current user can act in this stage ───────────
  const { canApprove, isAdminStage } = (() => {
    if (!petition || !user) return { canApprove: false, isAdminStage: false };
    if (petition.status !== 'รอดำเนินการ') return { canApprove: false, isAdminStage: false };

    const chain = petition.chain || [];
    const stageOrder: StageOrder = petition.stageOrder || 'student_first';
    const stage = getPendingStage(petition, chain, stageOrder);

    if (stage === 'done') return { canApprove: false, isAdminStage: false };

    // Admin stage — any admin user can approve, and they have not yet approved
    if (stage === 'admin') {
      const alreadyDone = !!(petition.admin as any)?.status;
      const isAdmin = user.role === 'admin';
      return {
        canApprove: isAdmin && !alreadyDone,
        isAdminStage: true,
      };
    }

    // Student / advisor stage — check if user's email matches a step in this stage
    const stageRoles = stage === 'students'
      ? chain.filter(s => s.role.startsWith('student')).map(s => s.role)
      : chain.filter(s => ['advisor','coadvisor1','coadvisor2'].includes(s.role)).map(s => s.role);

    const myStep = chain.find(s =>
      stageRoles.includes(s.role) &&
      normalizeEmail(s.email) === normalizeEmail(user.email)
    );

    if (!myStep) return { canApprove: false, isAdminStage: false };

    // Already acted?
    const alreadyDone = !!(petition[myStep.role as keyof Petition] as any)?.status;
    return {
      canApprove: !alreadyDone,
      isAdminStage: false,
    };
  })();

  // ── Approve handler ───────────────────────────────────────────
  async function doApprove() {
    if (!signature) {
      Swal.fire({ icon: 'warning', title: 'กรุณาลงนาม', text: 'ต้องลงลายเซ็นก่อนอนุมัติ', confirmButtonColor: '#f97316' });
      return;
    }
    if (isAdminStage && !adminName) {
      Swal.fire({ icon: 'warning', title: 'กรุณาเลือกชื่อ', text: 'โปรดเลือกชื่อผู้อนุมัติก่อน', confirmButtonColor: '#f97316' });
      return;
    }

    // Admin confirmation popup
    if (isAdminStage) {
      const confirmed = await Swal.fire({
        icon: 'warning',
        iconColor: '#f97316',
        title: 'ยืนยันการอนุมัติ',
        html: `<div class="text-center">
          <p class="text-sm text-slate-600 dark:text-slate-300 mb-2">คุณกำลังจะ<strong>อนุมัติ</strong>คำร้องนี้</p>
          <div class="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl p-3 text-left text-sm">
            <p class="font-bold text-amber-700 dark:text-amber-400">📋 รหัสคำร้อง: ${petition?.petition_id}</p>
            <p class="text-amber-600 dark:text-amber-500 mt-1">ผู้อนุมัติ: <strong>${adminName}</strong></p>
          </div>
          <p class="mt-3 text-sm font-semibold text-orange-600">คุณแน่ใจหรือไม่?</p>
        </div>`,
        showCancelButton: true,
        confirmButtonText: '✅ ยืนยันอนุมัติ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b',
      });
      if (!confirmed.isConfirmed) return;
    }

    setApproving(true);
    try {
      const res = await apiApprovePetition(petitionId, { note, signature, adminName: isAdminStage ? adminName : undefined });
      if (res.status === 'success') {
        await Swal.fire({ icon: 'success', title: 'อนุมัติสำเร็จ', confirmButtonColor: '#f97316' });
        onUpdate();
        onClose();
      } else throw new Error(res.message);
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: e.message, confirmButtonColor: '#f97316' });
    } finally { setApproving(false); }
  }

  // ── Reject handler ────────────────────────────────────────────
  async function doReject() {
    if (!signature) {
      Swal.fire({ icon: 'warning', title: 'กรุณาลงนาม', text: 'ต้องลงลายเซ็นก่อนปฏิเสธ', confirmButtonColor: '#f97316' });
      return;
    }
    if (isAdminStage && !adminName) {
      Swal.fire({ icon: 'warning', title: 'กรุณาเลือกชื่อ', text: 'โปรดเลือกชื่อผู้ดำเนินการก่อน', confirmButtonColor: '#f97316' });
      return;
    }
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการปฏิเสธ',
      text: 'คำร้องนี้จะถูกปฏิเสธและสิ้นสุดขั้นตอน คุณแน่ใจหรือไม่?',
      showCancelButton: true,
      confirmButtonText: 'ใช่ ปฏิเสธ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#f97316',
    });
    if (!result.isConfirmed) return;

    setRejecting(true);
    try {
      const res = await apiRejectPetition(petitionId, { note, signature, adminName: isAdminStage ? adminName : undefined });
      if (res.status === 'success') {
        await Swal.fire({ icon: 'success', title: 'ปฏิเสธแล้ว', confirmButtonColor: '#f97316' });
        onUpdate();
        onClose();
      } else throw new Error(res.message);
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: e.message, confirmButtonColor: '#f97316' });
    } finally { setRejecting(false); }
  }

  // ── Export handler ────────────────────────────────────────────
  async function doExport() {
    if (!petition) return;
    setExporting(true);
    try {
      await exportViaPrint(petition);
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: e.message || 'ไม่สามารถส่งออก PDF ได้', confirmButtonColor: '#f97316' });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ maxWidth: '620px', maxHeight: '92vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b" style={{ background: 'var(--glass-panel-bg)', borderColor: 'var(--ios-card-border)', backdropFilter: 'blur(20px)' }}>
          <div>
            <h2 className="font-bold text-base">รายละเอียดคำร้อง</h2>
            {petition && <p className="text-xs text-orange-500 font-mono mt-0.5">{petition.petition_id}</p>}
          </div>
          <div className="flex items-center gap-2">
            {petition && (
              <button
                onClick={doExport}
                disabled={exporting}
                title="ส่งออก PDF"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all disabled:opacity-50"
                style={{
                  background: 'var(--glass-input-bg)',
                  borderColor: 'var(--glass-input-border)',
                  color: 'var(--color-fg)',
                }}
              >
                {exporting
                  ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : <FileDown className="w-3.5 h-3.5 text-orange-500" />
                }
                <span>{exporting ? 'กำลังส่งออก...' : 'ส่งออก PDF'}</span>
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner className="w-8 h-8 text-orange-500" /></div>
        ) : error ? (
          <div className="py-12 text-center text-rose-500 text-sm">{error}</div>
        ) : petition && (
          <div className="p-5 space-y-5">
            {/* Status banner */}
            <StatusBanner status={petition.status} />

            {/* Request info */}
            <Section title="ข้อมูลคำร้อง">
              <InfoRow icon="📋" label="ประเภท" value={PETITION_TYPE_LABELS[Number(petition.petition_type)] || petition.petition_type} />
              <InfoRow icon="👤" label="ผู้ยื่น" value={`${petition.requester_name} (${petition.requester_role === 'student' ? 'นักเรียน' : 'อาจารย์ที่ปรึกษา'})`} />
              <InfoRow icon="👤" label="คำนำหน้า" value={petition.payload?.requesterPrefix || '-'} />
              <InfoRow icon="🎓" label="รุ่น วมว." value={petition.payload?.requesterGen || '-'} />
              <InfoRow icon="📞" label="เบอร์ติดต่อ" value={petition.payload?.requesterPhone || '-'} />
              <InfoRow icon="📁" label="โครงงาน" value={`${petition.project_code} — ${petition.project_name}`} />
              <InfoRow icon="🕐" label="วันที่ยื่น" value={formatDateTimeTH(petition.created_at).date + ' ' + formatDateTimeTH(petition.created_at).time} />
            </Section>

            {/* Petition content */}
            <PayloadSection petition={petition} />

            {/* Approval timeline */}
            <ApprovalTimeline petition={petition} />

            {/* Approval action for eligible users */}
            {canApprove && !showApproveUI && (
              <button
                onClick={() => setShowApproveUI(true)}
                className="btn-liquid w-full py-3 rounded-xl font-semibold text-sm text-white bg-orange-500 hover:bg-orange-600 shadow-md shadow-orange-200/50 transition-colors flex items-center justify-center gap-2"
              >
                {isAdminStage ? <><Shield className="w-4 h-4" /> อนุมัติขั้นสุดท้าย (Admin)</> : <>✍️ ดำเนินการอนุมัติ / ปฏิเสธ</>}
              </button>
            )}

            {canApprove && showApproveUI && (
              <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--focus-border)', background: 'var(--focus-ring)' }}>
                <h3 className="font-bold text-sm text-orange-600 flex items-center gap-2">
                  {isAdminStage ? <><Shield className="w-4 h-4" /> อนุมัติขั้นสุดท้าย — ผู้ดูแลระบบ</> : <>✍️ ดำเนินการคำร้อง</>}
                </h3>

                {/* Admin name dropdown — shown only for admin stage */}
                {isAdminStage && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5">
                      <ChevronDown className="w-4 h-4 text-orange-500" />
                      เลือกชื่อผู้อนุมัติ <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={adminName}
                        onChange={e => setAdminName(e.target.value)}
                        className="glass-input w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none appearance-none pr-10"
                        id="admin-name-select"
                      >
                        <option value="">— กรุณาเลือกชื่อ —</option>
                        {ADMIN_NAMES.map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Note */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">หมายเหตุ / ความคิดเห็น (ไม่บังคับ)</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)}
                    rows={3} placeholder="ระบุหมายเหตุหรือความคิดเห็น..."
                    className="glass-input w-full rounded-xl px-3 py-2 text-sm resize-none focus:outline-none" />
                </div>

                {/* Signature */}
                <SignaturePad
                  onSign={setSignature}
                  onClear={() => setSignature('')}
                  label="ลายเซ็นดิจิทัล (จำเป็น)"
                />

                {/* Admin caution notice */}
                {isAdminStage && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>เมื่ออนุมัติ คำร้องนี้จะถือว่า<strong>สมบูรณ์</strong>และไม่สามารถแก้ไขได้อีก</span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    onClick={doReject}
                    disabled={rejecting || approving || !signature}
                    className="btn-liquid py-2.5 rounded-xl font-semibold text-sm border-2 border-rose-300 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                  >
                    {rejecting ? <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" /> : <XCircle className="w-4 h-4" />}
                    ปฏิเสธ
                  </button>
                  <button
                    onClick={doApprove}
                    disabled={approving || rejecting || !signature || (isAdminStage && !adminName)}
                    className="btn-liquid py-2.5 rounded-xl font-semibold text-sm text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 shadow-md shadow-emerald-200/50"
                  >
                    {approving ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <CheckCircle2 className="w-4 h-4" />}
                    อนุมัติ
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function StatusBanner({ status }: { status: string }) {
  const config = {
    'เสร็จสิ้น': { bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300', icon: '✅', label: 'เสร็จสิ้น — อนุมัติครบทุกขั้นตอน' },
    'ปฏิเสธ':    { bg: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800', text: 'text-rose-700 dark:text-rose-300', icon: '❌', label: 'ปฏิเสธ — คำร้องไม่ผ่านการอนุมัติ' },
    'รอดำเนินการ': { bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', icon: '⏳', label: 'รอดำเนินการ — อยู่ระหว่างขั้นตอนอนุมัติ' },
  }[status] || { bg: 'bg-neutral-50 border-neutral-200', text: 'text-neutral-600', icon: '📋', label: status };

  return (
    <div className={`flex items-center gap-2.5 p-3 rounded-xl border text-sm font-semibold ${config.bg} ${config.text}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--ios-card-border)' }}>
      <div className="px-4 py-2.5 text-xs font-bold text-neutral-500 uppercase tracking-wider border-b" style={{ background: 'var(--compact-info-bg)', borderColor: 'var(--ios-card-border)' }}>
        {title}
      </div>
      <div className="p-4 space-y-2.5">{children}</div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="flex-shrink-0">{icon}</span>
      <span className="text-neutral-400 min-w-[90px] flex-shrink-0">{label}</span>
      <span className="font-medium break-all">{value}</span>
    </div>
  );
}

function PayloadSection({ petition }: { petition: Petition }) {
  const type = Number(petition.petition_type);
  const p = petition.payload || {};

  const rows: { label: string; value: string }[] = [];

  if (type === 1) {
    if (p.faculty)      rows.push({ label: 'คณะ/สังกัด', value: p.faculty });
    if (p.affiliation)  rows.push({ label: 'สังกัดย่อย', value: p.affiliation });
    if (p.advisorName)  rows.push({ label: 'ชื่ออาจารย์', value: p.advisorName });
    if (p.advisorEmail) rows.push({ label: 'อีเมล', value: p.advisorEmail });
  } else if (type === 2) {
    rows.push({ label: 'ตัวเลือก', value: p.option === 'A' ? 'ระบุอาจารย์' : 'ให้เจ้าหน้าที่หา' });
    if (p.option === 'A') {
      if (p.schoolAdvisorName)  rows.push({ label: 'ชื่ออาจารย์', value: p.schoolAdvisorName });
      if (p.schoolAdvisorEmail) rows.push({ label: 'อีเมล', value: p.schoolAdvisorEmail });
    }
  } else if (type === 3) {
    rows.push({ label: 'ประเภท', value: p.removeType === 'university' ? 'มหาวิทยาลัย' : 'โรงเรียน' });
    if (p.removeFaculty)    rows.push({ label: 'คณะ', value: p.removeFaculty });
    if (p.removeDepartment) rows.push({ label: 'สังกัด (ภาควิชา)', value: p.removeDepartment });
    if (p.removeName)    rows.push({ label: 'ชื่ออาจารย์', value: p.removeName });
    if (p.removeEmail)   rows.push({ label: 'อีเมล', value: p.removeEmail });
    if (p.removeReason)  rows.push({ label: 'เหตุผล', value: p.removeReason });
  } else if (type === 4) {
    if (p.newNameTH)     rows.push({ label: 'ชื่อใหม่ (ไทย)', value: p.newNameTH });
    if (p.newNameEN)     rows.push({ label: 'ชื่อใหม่ (EN)', value: p.newNameEN });
    if (p.renameReason)  rows.push({ label: 'เหตุผล', value: p.renameReason });
  } else if (type === 5) {
    if (p.currentField)  rows.push({ label: 'สาขาเดิม', value: p.currentField });
    if (p.newField)      rows.push({ label: 'สาขาใหม่', value: p.newField });
    if (p.fieldReason)   rows.push({ label: 'เหตุผล', value: p.fieldReason });
  } else if (type === 6) {
    if (p.description)   rows.push({ label: 'รายละเอียด', value: p.description });
  }

  if (rows.length === 0) return null;

  return (
    <Section title="รายละเอียดคำร้อง">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-3 text-sm">
          <span className="text-neutral-400 min-w-[110px] flex-shrink-0">{r.label}</span>
          <span className="font-medium break-words whitespace-pre-wrap">{r.value}</span>
        </div>
      ))}
    </Section>
  );
}

// ── Stage group header ────────────────────────────────────────────
function StageGroupHeader({ label, icon, done }: { label: string; icon: React.ReactNode; done: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold mb-3 ${done ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'}`}>
      {icon}
      {label}
      {done && <span className="ml-auto">✓ ผ่านแล้ว</span>}
    </div>
  );
}

function ApprovalTimeline({ petition }: { petition: Petition }) {
  const chain = petition.chain || [];
  if (chain.length === 0) return null;

  const stageOrder: StageOrder = petition.stageOrder || 'student_first';

  // Group into stages
  const studentSteps  = chain.filter(s => s.role.startsWith('student'));
  const advisorSteps  = chain.filter(s => ['advisor','coadvisor1','coadvisor2'].includes(s.role));
  const adminStep     = chain.find(s => s.role === 'admin');

  const allStudentsDone = studentSteps.every(s => !!(petition[s.role as keyof Petition] as any)?.status);
  const allAdvisorsDone = advisorSteps.every(s => !!(petition[s.role as keyof Petition] as any)?.status);
  const adminDone       = !!(petition.admin as any)?.status;

  const renderStep = (step: ChainStep, idx: number, stageActive: boolean) => {
    const approver = petition[step.role as keyof Petition] as any;
    const status  = approver?.status || '';
    const isDone  = !!status;
    const isPending = !isDone && stageActive;

    return (
      <div key={step.role} className="flex items-start gap-3 relative pl-2">
        {/* Step icon */}
        <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${
          status === 'อนุมัติ'  ? 'bg-emerald-100 border-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-600' :
          status === 'ปฏิเสธ'  ? 'bg-rose-100 border-rose-400 dark:bg-rose-900/30 dark:border-rose-600' :
          isPending             ? 'bg-amber-100 border-amber-400 dark:bg-amber-900/30 dark:border-amber-600' :
                                  'bg-neutral-100 border-neutral-300 dark:bg-neutral-800 dark:border-neutral-600'
        }`}>
          {status === 'อนุมัติ' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> :
           status === 'ปฏิเสธ' ? <XCircle className="w-3.5 h-3.5 text-rose-500" /> :
           isPending            ? <Clock className="w-3.5 h-3.5 text-amber-500" /> :
                                  <span className="text-[10px] text-neutral-400 font-bold">{idx + 1}</span>}
        </div>

        {/* Step content */}
        <div className="flex-1 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{ROLE_LABELS[step.role] || step.role}</span>
            {isDone && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                status === 'อนุมัติ' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                       'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
              }`}>{status}</span>
            )}
            {isPending && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">รออนุมัติ</span>}
          </div>
          {/* Show name for admin (selected at approval time), email for others */}
          {step.role === 'admin' ? (
            isDone && approver?.name
              ? <p className="text-xs text-neutral-400 mt-0.5">อนุมัติโดย: {approver.name}</p>
              : <p className="text-xs text-neutral-400 mt-0.5">ผู้ดูแลระบบ</p>
          ) : (
            <p className="text-xs text-neutral-400 mt-0.5">
              {step.name} · {step.email}
              {(step as any).token && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                  🔗 ลิงก์
                </span>
              )}
            </p>
          )}
          {isDone && approver?.time && (
            <p className="text-xs text-neutral-400 mt-0.5">
              {formatDateTimeTH(approver.time).date} {formatDateTimeTH(approver.time).time}
            </p>
          )}
          {isDone && approver?.note && (
            <div className="mt-1.5 p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-600 dark:text-neutral-300">
              💬 {approver.note}
            </div>
          )}
          {isDone && approver?.signature && (
            <div className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              ✍️ ลงนามแล้ว
            </div>
          )}
        </div>
      </div>
    );
  };

  // Stage blocks for students and advisors, reordered based on who filed the petition.
  // Both stages always render — nobody's sign-off is skipped, just the order changes.
  const studentBlock = studentSteps.length > 0 ? {
    key: 'students',
    label: 'นักเรียน',
    icon: <Users className="w-3.5 h-3.5" />,
    done: allStudentsDone,
    steps: studentSteps,
  } : null;
  const advisorBlock = advisorSteps.length > 0 ? {
    key: 'advisors',
    label: 'อาจารย์ที่ปรึกษา',
    icon: <Users className="w-3.5 h-3.5" />,
    done: allAdvisorsDone,
    steps: advisorSteps,
  } : null;

  const orderedKeys = getStageSequence(stageOrder); // e.g. ['students','advisors'] or ['advisors','students']
  const blocksByKey: Record<string, typeof studentBlock | typeof advisorBlock> = { students: studentBlock, advisors: advisorBlock };
  const orderedBlocks = orderedKeys.map(k => blocksByKey[k]).filter(Boolean) as Array<{ key: string; label: string; icon: JSX.Element; done: boolean; steps: ChainStep[] }>;

  // First incomplete block (in order) is the active one
  const firstIncompleteIdx = orderedBlocks.findIndex(b => !b.done);

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--ios-card-border)' }}>
      <div className="px-4 py-2.5 text-xs font-bold text-neutral-500 uppercase tracking-wider border-b" style={{ background: 'var(--compact-info-bg)', borderColor: 'var(--ios-card-border)' }}>
        ขั้นตอนการอนุมัติ
      </div>
      <div className="p-4 space-y-2">

        {orderedBlocks.map((block, blockIdx) => (
          <div key={block.key} className={blockIdx > 0 ? 'mt-3' : ''}>
            <StageGroupHeader
              label={`ขั้นที่ ${blockIdx + 1} — ${block.label}`}
              icon={block.icon}
              done={block.done}
            />
            <div className="space-y-1">
              {block.steps.map((s, i) => renderStep(s, i, blockIdx === firstIncompleteIdx))}
            </div>
          </div>
        ))}

        {/* Final stage: Admin */}
        {adminStep && (
          <div className="mt-3">
            <StageGroupHeader
              label={`ขั้นที่ ${orderedBlocks.length + 1} — ผู้ดูแลระบบ`}
              icon={<Shield className="w-3.5 h-3.5" />}
              done={adminDone}
            />
            {renderStep(adminStep, 0, allStudentsDone && allAdvisorsDone && !adminDone)}
          </div>
        )}

      </div>
    </div>
  );
}