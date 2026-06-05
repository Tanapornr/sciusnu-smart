// ================================================================
// components/petition/PetitionDetailModal.tsx
// Shows petition details, timeline, approval chain, and action UI
// ================================================================
import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { apiGetPetition, apiApprovePetition, apiRejectPetition } from '../../services/petitionApi';
import { formatDateTimeTH } from '../../utils';
import type { Petition, ChainStep } from '../../types/petition';
import { PETITION_TYPE_LABELS } from '../../types/petition';
import {
  X, CheckCircle2, XCircle, Clock, ChevronRight,
  User as UserIcon, Calendar, FileText, AlertTriangle
} from 'lucide-react';
import { Spinner } from '../ui';
import SignaturePad from './SignaturePad';
import Swal from 'sweetalert2';

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
};

function normalizeEmailUtil(email: string) {
  return String(email || '').trim().toLowerCase();
}

export default function PetitionDetailModal({ petitionId, onClose, onUpdate }: Props) {
  const { user } = useAuthStore();
  const [petition, setPetition] = useState<Petition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Approval state
  const [showApproveUI, setShowApproveUI] = useState(false);
  const [note, setNote] = useState('');
  const [signature, setSignature] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

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

  // Determine if current user can approve
  const canApprove = (() => {
    if (!petition || !user) return false;
    if (petition.status !== 'รอดำเนินการ') return false;
    const chain = petition.chain || [];
    const pendingStep = chain.find(s => !petition[s.role as keyof Petition]?.status);
    if (!pendingStep) return false;
    return normalizeEmailUtil(pendingStep.email) === normalizeEmailUtil(user.email);
  })();

  async function doApprove() {
    if (!signature) {
      Swal.fire({ icon: 'warning', title: 'กรุณาลงนาม', text: 'ต้องลงลายเซ็นก่อนอนุมัติ', confirmButtonColor: '#f97316' });
      return;
    }
    setApproving(true);
    try {
      const res = await apiApprovePetition(petitionId, { note, signature });
      if (res.status === 'success') {
        await Swal.fire({ icon: 'success', title: 'อนุมัติสำเร็จ', confirmButtonColor: '#f97316' });
        onUpdate();
        onClose();
      } else throw new Error(res.message);
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: e.message, confirmButtonColor: '#f97316' });
    } finally { setApproving(false); }
  }

  async function doReject() {
    if (!signature) {
      Swal.fire({ icon: 'warning', title: 'กรุณาลงนาม', text: 'ต้องลงลายเซ็นก่อนปฏิเสธ', confirmButtonColor: '#f97316' });
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
      const res = await apiRejectPetition(petitionId, { note, signature });
      if (res.status === 'success') {
        await Swal.fire({ icon: 'success', title: 'ปฏิเสธแล้ว', confirmButtonColor: '#f97316' });
        onUpdate();
        onClose();
      } else throw new Error(res.message);
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: e.message, confirmButtonColor: '#f97316' });
    } finally { setRejecting(false); }
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
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
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
                ✍️ ดำเนินการอนุมัติ / ปฏิเสธ
              </button>
            )}

            {canApprove && showApproveUI && (
              <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--focus-border)', background: 'var(--focus-ring)' }}>
                <h3 className="font-bold text-sm text-orange-600">✍️ ดำเนินการคำร้อง</h3>

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
                    disabled={approving || rejecting || !signature}
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
    if (p.removeFaculty) rows.push({ label: 'คณะ', value: p.removeFaculty });
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

function ApprovalTimeline({ petition }: { petition: Petition }) {
  const chain = petition.chain || [];
  if (chain.length === 0) return null;

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--ios-card-border)' }}>
      <div className="px-4 py-2.5 text-xs font-bold text-neutral-500 uppercase tracking-wider border-b" style={{ background: 'var(--compact-info-bg)', borderColor: 'var(--ios-card-border)' }}>
        ขั้นตอนการอนุมัติ
      </div>
      <div className="p-4">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-5 bottom-5 w-0.5 bg-neutral-200 dark:bg-neutral-700" />

          <div className="space-y-4">
            {chain.map((step, i) => {
              const approver = petition[step.role as keyof Petition] as any;
              const status = approver?.status || '';
              const isDone = !!status;
              const isNext = !isDone && !chain.slice(0, i).some(s => !petition[s.role as keyof Petition]?.status);
              const isPending = !isDone && !isNext;

              return (
                <div key={step.role} className="flex items-start gap-4 relative">
                  {/* Step icon */}
                  <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${
                    status === 'อนุมัติ'  ? 'bg-emerald-100 border-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-600' :
                    status === 'ปฏิเสธ'  ? 'bg-rose-100 border-rose-400 dark:bg-rose-900/30 dark:border-rose-600' :
                    isNext               ? 'bg-amber-100 border-amber-400 dark:bg-amber-900/30 dark:border-amber-600' :
                                          'bg-neutral-100 border-neutral-300 dark:bg-neutral-800 dark:border-neutral-600'
                  }`}>
                    {status === 'อนุมัติ' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
                     status === 'ปฏิเสธ' ? <XCircle className="w-4 h-4 text-rose-500" /> :
                     isNext              ? <Clock className="w-4 h-4 text-amber-500" /> :
                                          <span className="text-xs text-neutral-400 font-bold">{i + 1}</span>}
                  </div>

                  {/* Step content */}
                  <div className="flex-1 pb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{ROLE_LABELS[step.role] || step.role}</span>
                      {isDone && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          status === 'อนุมัติ' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                               'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                        }`}>{status}</span>
                      )}
                      {isNext && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">รออนุมัติ</span>}
                    </div>
                    <p className="text-xs text-neutral-400 mt-0.5">{step.name} · {step.email}</p>
                    {isDone && approver.time && (
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {formatDateTimeTH(approver.time).date} {formatDateTimeTH(approver.time).time}
                      </p>
                    )}
                    {isDone && approver.note && (
                      <div className="mt-1.5 p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-600 dark:text-neutral-300">
                        💬 {approver.note}
                      </div>
                    )}
                    {isDone && approver.signature && (
                      <div className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        ✍️ ลงนามแล้ว
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
