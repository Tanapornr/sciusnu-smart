// ================================================================
// components/petition/CreatePetitionModal.tsx
// Wizard: Step 1 (type) → Step 2 (fields) → Step 3 (sign) → Step 4 (review) → Submit
// On submit: create petition then auto-sign so user doesn't need to open it again
// ================================================================
import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useProjectData } from '../../hooks/useProjectData';
import { parseProjectRow } from '../../utils';
import { apiCreatePetition, apiApprovePetition } from '../../services/petitionApi';
import type { PetitionType, PetitionPayload } from '../../types/petition';
import { PETITION_TYPE_LABELS } from '../../types/petition';
import { X, ChevronRight, ChevronLeft, Send, CheckCircle2 } from 'lucide-react';
import SignaturePad from './SignaturePad';
import Swal from 'sweetalert2';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

const PETITION_ICONS: Record<number, string> = {
  1: '🏫', 2: '🏫', 3: '🚫', 4: '✏️', 5: '🔄', 6: '📝',
};

const PETITION_DESCRIPTIONS: Record<number, string> = {
  1: 'เพิ่มอาจารย์ที่ปรึกษาจากมหาวิทยาลัย',
  2: 'เพิ่มอาจารย์ที่ปรึกษาจากโรงเรียน',
  3: 'ขอถอดถอนอาจารย์ที่ปรึกษาออกจากโครงงาน',
  4: 'ขอเปลี่ยนชื่อโครงงานภาษาไทยและ/หรืออังกฤษ',
  5: 'ขอเปลี่ยนสาขาหรือประเภทของโครงงาน',
  6: 'คำร้องอื่นๆ ที่ไม่อยู่ในประเภทข้างต้น',
};

// Total steps is now 4
type Step = 1 | 2 | 3 | 4;

export default function CreatePetitionModal({ onClose, onSuccess }: Props) {
  const { user } = useAuthStore();
  const [step, setStep] = useState<Step>(1);
  const [petitionType, setPetitionType] = useState<PetitionType | null>(null);
  const [payload, setPayload] = useState<PetitionPayload>({});
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: rawData } = useProjectData();
  const [projectInfo, setProjectInfo] = useState<any>(null);

  useEffect(() => {
    if (rawData?.projects && user) {
      let myRow = null;
      if (user.role === 'student') {
        myRow = rawData.projects.find(p => (p['รหัสนักเรียน'] || '') === user.studentId);
      } else {
        myRow = rawData.projects.find(p => {
          const info = parseProjectRow(p);
          const userEmail = user.email.toLowerCase().trim();
          return (
            info.advEmail.toLowerCase().trim() === userEmail ||
            info.coAdvEmail.toLowerCase().trim() === userEmail ||
            info.schAdvEmail.toLowerCase().trim() === userEmail
          );
        });
      }

      if (myRow) {
        const info = parseProjectRow(myRow);

        setProjectInfo(info);
        setPayload(prev => ({
          ...prev,
          currentField: prev.currentField || info.field || '',
          requesterPhone: prev.requesterPhone || info.phone || '',
        }));
      }
    }
  }, [rawData, user]);

  function updatePayload(updates: Partial<PetitionPayload>) {
    setPayload(prev => ({ ...prev, ...updates }));
  }

  async function handleSubmit() {
    if (!petitionType) return;
    if (!signature) {
      Swal.fire({ icon: 'warning', title: 'กรุณาลงนาม', text: 'ต้องลงลายเซ็นก่อนส่งคำร้อง', confirmButtonColor: '#f97316' });
      return;
    }

    setSubmitting(true);
    try {
      // Step A: Create petition
      const res = await apiCreatePetition({ petition_type: petitionType, payload });
      if (res.status !== 'success') throw new Error(res.message || 'เกิดข้อผิดพลาด');

      const petitionId = res.petition_id;

      // Step B: Auto-sign (approve) as the requester so they don't have to open it again
      try {
        await apiApprovePetition(petitionId, { signature });
      } catch (_signErr) {
        // Auto-sign failed but petition was created — continue, user can sign manually
        await Swal.fire({
          icon: 'success',
          title: 'ยื่นคำร้องสำเร็จ',
          html: `รหัสคำร้อง: <strong>${petitionId}</strong><br><span class="text-sm text-amber-600">⚠️ ลงนามอัตโนมัติไม่สำเร็จ กรุณาเปิดคำร้องเพื่อลงนาม</span>`,
          confirmButtonColor: '#f97316',
        });
        onSuccess();
        return;
      }

      await Swal.fire({
        icon: 'success',
        title: 'ยื่นและลงนามคำร้องสำเร็จ',
        html: `รหัสคำร้อง: <strong>${petitionId}</strong><br><span class="text-sm text-emerald-600">✅ ลงนามเรียบร้อยแล้ว ระบบจะส่งแจ้งเตือนผู้อนุมัติลำดับถัดไปทันที</span>`,
        confirmButtonColor: '#f97316',
      });
      onSuccess();
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: e.message, confirmButtonColor: '#f97316' });
    } finally {
      setSubmitting(false);
    }
  }

  function validateStep2() {
    const hasRequesterInfo = !!(payload.requesterPrefix?.trim() && payload.requesterGen?.trim() && payload.requesterPhone?.trim());
    if (!hasRequesterInfo) return false;

    switch (petitionType) {
      case 1: return !!(payload.faculty && payload.advisorName && payload.advisorEmail);
      case 2:
        if (payload.option === 'A') return !!(payload.schoolAdvisorName && payload.schoolAdvisorEmail);
        if (payload.option === 'B') return true;
        return false;
      case 3: {
        return !!(
          payload.removeType &&
          payload.removeName &&
          payload.removeEmail &&
          payload.removeReason
        );
      }
      case 4: return !!(payload.newNameTH || payload.newNameEN) && !!payload.renameReason;
      case 5: return !!(payload.newField && payload.fieldReason);
      case 6: return !!(payload.description && payload.description.trim().length > 10);
      default: return false;
    }
  }

  const stepLabels = ['เลือกประเภท', 'กรอกข้อมูล', 'ลงนาม', 'ตรวจสอบ'];

  function canGoNext() {
    if (step === 1) return !!petitionType;
    if (step === 2) return validateStep2();
    if (step === 3) return !!signature;
    return true;
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--ios-card-border)' }}>
          <div>
            <h2 className="font-bold text-base">ยื่นคำร้องออนไลน์</h2>
            <p className="text-xs text-neutral-400 mt-0.5">ขั้นตอนที่ {step}/4</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1 px-5 pt-4">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step > s ? 'bg-orange-500 text-white' : step === s ? 'bg-orange-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-400'
              }`}>
                {step > s ? '✓' : s}
              </div>
              {s < 4 && <div className={`flex-1 h-0.5 w-8 transition-colors ${step > s ? 'bg-orange-500' : 'bg-neutral-200 dark:bg-neutral-700'}`} />}
            </div>
          ))}
          <div className="ml-2 text-xs text-neutral-400">
            {stepLabels[step - 1]}
          </div>
        </div>

        <div className="p-5">
          {/* ── Step 1: Select type ─────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-2">
              <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4">เลือกประเภทคำร้องที่ต้องการยื่น</p>
              {([1, 2, 3, 4, 5, 6] as PetitionType[]).map(type => (
                <button
                  key={type}
                  onClick={() => setPetitionType(type)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    petitionType === type
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-600'
                      : 'border-transparent hover:border-orange-200 dark:hover:border-orange-800'
                  }`}
                  style={petitionType !== type ? { background: 'var(--ios-card-bg)', borderColor: 'var(--ios-card-border)' } : {}}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">{PETITION_ICONS[type]}</span>
                    <div>
                      <div className="font-semibold text-sm">{PETITION_TYPE_LABELS[type]}</div>
                      <div className="text-xs text-neutral-400 mt-0.5">{PETITION_DESCRIPTIONS[type]}</div>
                    </div>
                    {petitionType === type && <CheckCircle2 className="w-4 h-4 text-orange-500 ml-auto mt-0.5 flex-shrink-0" />}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ── Step 2: Dynamic fields ──────────────────────────── */}
          {step === 2 && petitionType && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                <span className="text-lg">{PETITION_ICONS[petitionType]}</span>
                <span className="text-sm font-semibold">{PETITION_TYPE_LABELS[petitionType]}</span>
              </div>

              {/* ข้อมูลผู้ยื่นคำร้อง */}
              <div className="space-y-3 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30">
                <h4 className="font-bold text-xs text-neutral-400 uppercase tracking-wider">ข้อมูลผู้ยื่นคำร้อง</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">คำนำหน้า *</label>
                    <input
                      value={payload.requesterPrefix || ''}
                      onChange={e => updatePayload({ requesterPrefix: e.target.value })}
                      placeholder="เช่น นาย / นางสาว"
                      className="glass-input w-full rounded-xl px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">รุ่น วมว. *</label>
                    <input
                      value={payload.requesterGen || ''}
                      onChange={e => updatePayload({ requesterGen: e.target.value })}
                      placeholder="เช่น 15"
                      className="glass-input w-full rounded-xl px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">เบอร์ติดต่อ *</label>
                    <input
                      value={payload.requesterPhone || ''}
                      onChange={e => updatePayload({ requesterPhone: e.target.value })}
                      placeholder="เช่น 089xxxxxxx"
                      className="glass-input w-full rounded-xl px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Type 1 — Add University Advisor */}
              {petitionType === 1 && (
                <>
                  <Field label="คณะ / สังกัด *" value={payload.faculty || ''} onChange={v => updatePayload({ faculty: v })} placeholder="เช่น คณะวิทยาศาสตร์" />
                  <Field label="สังกัดย่อย (Affiliation)" value={payload.affiliation || ''} onChange={v => updatePayload({ affiliation: v })} placeholder="เช่น ภาควิชาเคมี" />
                  <Field label="ชื่ออาจารย์ *" value={payload.advisorName || ''} onChange={v => updatePayload({ advisorName: v })} placeholder="ดร. ชื่อ นามสกุล" />
                  <Field label="อีเมลอาจารย์ *" value={payload.advisorEmail || ''} onChange={v => updatePayload({ advisorEmail: v })} placeholder="email@nu.ac.th" type="email" />
                </>
              )}

              {/* Type 2 — Add School Advisor */}
              {petitionType === 2 && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">ตัวเลือก *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['A', 'B'] as const).map(opt => (
                        <button key={opt} onClick={() => updatePayload({ option: opt })}
                          className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                            payload.option === opt ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 text-orange-600' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-orange-300'
                          }`}>
                          {opt === 'A' ? '✍️ ระบุชื่ออาจารย์' : '🔍 ให้เจ้าหน้าที่หา'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {payload.option === 'A' && (
                    <>
                      <Field label="ชื่ออาจารย์ *" value={payload.schoolAdvisorName || ''} onChange={v => updatePayload({ schoolAdvisorName: v })} placeholder="ชื่อ-นามสกุล" />
                      <Field label="อีเมลอาจารย์ *" value={payload.schoolAdvisorEmail || ''} onChange={v => updatePayload({ schoolAdvisorEmail: v })} placeholder="email@school.ac.th" type="email" />
                    </>
                  )}
                  {payload.option === 'B' && (
                    <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 text-sm text-sky-700 dark:text-sky-300">
                      ระบบจะส่งคำร้องให้เจ้าหน้าที่โครงการ วมว. ดำเนินการหาอาจารย์ที่ปรึกษาโรงเรียนให้ท่าน
                    </div>
                  )}
                </>
              )}

              {/* Type 3 — Remove Advisor */}
              {petitionType === 3 && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">ประเภทที่ปรึกษา *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { val: 'university', label: '🎓 อาจารย์มหาวิทยาลัย' },
                        { val: 'school',     label: '🏫 อาจารย์โรงเรียน' },
                      ].map(opt => {
                        const info = opt.val === 'university'
                          ? { name: projectInfo?.coAdvName,  email: projectInfo?.coAdvEmail }
                          : { name: projectInfo?.schAdvName, email: projectInfo?.schAdvEmail };
                        const unavailable = !info.name || !info.email;
                        return (
                          <button
                            key={opt.val}
                            disabled={unavailable}
                            onClick={() => updatePayload({
                              removeType:       opt.val as any,
                              removeName:       info.name  || '',
                              removeEmail:      info.email || '',
                              removeFaculty:    opt.val === 'university' ? (projectInfo?.coAdvFaculty    || '') : '',
                              removeDepartment: opt.val === 'university' ? (projectInfo?.coAdvDepartment || '') : '',
                            })}
                            className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                              unavailable
                                ? 'opacity-40 cursor-not-allowed border-neutral-200 dark:border-neutral-700 text-neutral-400'
                                : payload.removeType === opt.val
                                  ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 text-orange-600'
                                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-orange-300'
                            }`}>
                            {opt.label}
                            {unavailable && <div className="text-[10px] font-normal mt-0.5 opacity-70">ไม่มีข้อมูล</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Read-only advisor info card — shown once type is selected */}
                  {payload.removeType && (
                    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 divide-y divide-neutral-100 dark:divide-neutral-800 text-sm overflow-hidden">
                      {[
                        { label: 'ชื่ออาจารย์', value: payload.removeName },
                        { label: 'อีเมล',        value: payload.removeEmail },
                        ...(payload.removeType === 'university' ? [
  {
    label: 'คณะ',
    value: [
      payload.removeFaculty,
      payload.removeDepartment,
    ]
      .filter(Boolean)
      .join(' / ')
  },
] : []),
                      ].filter(r => r.value).map(row => (
                        <div key={row.label} className="flex items-center px-3 py-2 gap-3">
                          <span className="text-xs text-neutral-400 dark:text-neutral-500 w-20 shrink-0">{row.label}</span>
                          <span className="text-xs font-medium flex-1">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-1.5">เหตุผล *</label>
                    <textarea value={payload.removeReason || ''} onChange={e => updatePayload({ removeReason: e.target.value })}
                      rows={3} placeholder="ระบุเหตุผลในการขอถอดถอน..."
                      className="glass-input w-full rounded-xl px-3 py-2 text-sm resize-none focus:outline-none" />
                  </div>
                </>
              )}

              {/* Type 4 — Change Project Name */}
              {petitionType === 4 && (
                <>
                  <Field label="ชื่อโครงงานใหม่ (ภาษาไทย)" value={payload.newNameTH || ''} onChange={v => updatePayload({ newNameTH: v })} placeholder="ชื่อโครงงานภาษาไทย" />
                  <Field label="ชื่อโครงงานใหม่ (ภาษาอังกฤษ)" value={payload.newNameEN || ''} onChange={v => updatePayload({ newNameEN: v })} placeholder="Project Name in English" />
                  <div>
                    <label className="block text-sm font-medium mb-1.5">เหตุผล *</label>
                    <textarea value={payload.renameReason || ''} onChange={e => updatePayload({ renameReason: e.target.value })}
                      rows={3} placeholder="ระบุเหตุผลในการขอเปลี่ยนชื่อ..."
                      className="glass-input w-full rounded-xl px-3 py-2 text-sm resize-none focus:outline-none" />
                  </div>
                </>
              )}

              {/* Type 5 — Change Field */}
              {petitionType === 5 && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">สาขาปัจจุบัน (ดึงจากข้อมูลโครงงาน)</label>
                    <input value={payload.currentField || '(ดึงจากฐานข้อมูล)'} readOnly
                      className="glass-input w-full rounded-xl px-3 py-2 text-sm opacity-60 focus:outline-none" />
                  </div>
                  <Field label="สาขาใหม่ *" value={payload.newField || ''} onChange={v => updatePayload({ newField: v })} placeholder="สาขาวิชาที่ต้องการเปลี่ยน" />
                  <div>
                    <label className="block text-sm font-medium mb-1.5">เหตุผล *</label>
                    <textarea value={payload.fieldReason || ''} onChange={e => updatePayload({ fieldReason: e.target.value })}
                      rows={3} placeholder="ระบุเหตุผลในการขอเปลี่ยนสาขา..."
                      className="glass-input w-full rounded-xl px-3 py-2 text-sm resize-none focus:outline-none" />
                  </div>
                </>
              )}

              {/* Type 6 — Other */}
              {petitionType === 6 && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">รายละเอียดคำร้อง * (อย่างน้อย 10 ตัวอักษร)</label>
                  <textarea value={payload.description || ''} onChange={e => updatePayload({ description: e.target.value })}
                    rows={6} placeholder="อธิบายรายละเอียดคำร้องของคุณ..."
                    className="glass-input w-full rounded-xl px-3 py-2 text-sm resize-none focus:outline-none" />
                  <p className="text-xs text-neutral-400 mt-1">{(payload.description || '').length} ตัวอักษร</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Signature ───────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 text-sm text-orange-700 dark:text-orange-300">
                ✍️ ลงนามเพื่อยืนยันการยื่นคำร้อง — ลายเซ็นนี้จะถูกบันทึกเป็นลายเซ็นของผู้ยื่นทันที
              </div>

              <SignaturePad
                onSign={setSignature}
                onClear={() => setSignature('')}
                label="ลายเซ็นผู้ยื่นคำร้อง"
              />

              {signature && (
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  ลงนามเรียบร้อยแล้ว — กดถัดไปเพื่อตรวจสอบก่อนส่ง
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Review ──────────────────────────────────── */}
          {step === 4 && petitionType && (
            <div className="space-y-4">
              <div className="rounded-xl border p-4 space-y-3" style={{ background: 'var(--compact-info-bg)', borderColor: 'var(--compact-info-border)' }}>
                <h3 className="font-semibold text-sm text-orange-600">📋 ตรวจสอบรายละเอียดคำร้อง</h3>

                <ReviewRow label="ผู้ยื่นคำร้อง" value={user?.name || ''} />
                <ReviewRow label="ประเภทผู้ใช้งาน" value={user?.role === 'student' ? 'นักเรียน' : 'อาจารย์ที่ปรึกษา'} />
                <ReviewRow label="คำนำหน้า" value={payload.requesterPrefix || '-'} />
                <ReviewRow label="รุ่น วมว." value={payload.requesterGen || '-'} />
                <ReviewRow label="เบอร์ติดต่อ" value={payload.requesterPhone || '-'} />
                <ReviewRow label="ประเภทคำร้อง" value={PETITION_TYPE_LABELS[petitionType]} />

                {petitionType === 1 && <>
                  <ReviewRow label="คณะ" value={payload.faculty || '-'} />
                  <ReviewRow label="ชื่ออาจารย์" value={payload.advisorName || '-'} />
                  <ReviewRow label="อีเมล" value={payload.advisorEmail || '-'} />
                </>}
                {petitionType === 2 && <>
                  <ReviewRow label="ตัวเลือก" value={payload.option === 'A' ? 'ระบุอาจารย์' : 'ให้เจ้าหน้าที่หา'} />
                  {payload.option === 'A' && <>
                    <ReviewRow label="ชื่ออาจารย์" value={payload.schoolAdvisorName || '-'} />
                    <ReviewRow label="อีเมล" value={payload.schoolAdvisorEmail || '-'} />
                  </>}
                </>}
                {petitionType === 3 && <>
                  <ReviewRow label="ประเภทที่ปรึกษา" value={payload.removeType === 'university' ? 'มหาวิทยาลัย' : 'โรงเรียน'} />
                  <ReviewRow label="ชื่ออาจารย์" value={payload.removeName || '-'} />
                  <ReviewRow label="อีเมล" value={payload.removeEmail || '-'} />
                  {payload.removeType === 'university' && <>
                    {(payload.removeFaculty || payload.removeDepartment) && <ReviewRow label="คณะ" value={[ payload.removeFaculty, payload.removeDepartment, ] .filter(Boolean).join(' / ')} />}
                  </>}
                  <ReviewRow label="เหตุผล" value={payload.removeReason || '-'} />
                </>}
                {petitionType === 4 && <>
                  {payload.newNameTH && <ReviewRow label="ชื่อใหม่ (ไทย)" value={payload.newNameTH} />}
                  {payload.newNameEN && <ReviewRow label="ชื่อใหม่ (EN)" value={payload.newNameEN} />}
                  <ReviewRow label="เหตุผล" value={payload.renameReason || '-'} />
                </>}
                {petitionType === 5 && <>
                  <ReviewRow label="สาขาใหม่" value={payload.newField || '-'} />
                  <ReviewRow label="เหตุผล" value={payload.fieldReason || '-'} />
                </>}
                {petitionType === 6 && <ReviewRow label="รายละเอียด" value={payload.description || '-'} />}
              </div>

              {/* Signature preview */}
              {signature && (
                <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--ios-card-border)' }}>
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">ลายเซ็นผู้ยื่นคำร้อง</p>
                  <img src={signature} alt="signature preview" className="h-16 w-auto rounded-lg border border-neutral-200 bg-white" />
                  <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> ลงนามแล้ว
                  </p>
                </div>
              )}

              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                ⚠️ เมื่อยืนยันส่งคำร้อง ระบบจะยื่นและลงนามพร้อมกันทันที และส่งแจ้งเตือนผู้อนุมัติลำดับถัดไปโดยอัตโนมัติ
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between gap-3 p-5 border-t" style={{ borderColor: 'var(--ios-card-border)' }}>
          <button
            onClick={() => step === 1 ? onClose() : setStep(s => (s - 1) as Step)}
            className="btn-liquid flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
            style={{ borderColor: 'var(--ios-card-border)' }}
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? 'ยกเลิก' : 'ย้อนกลับ'}
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep(s => (s + 1) as Step)}
              disabled={!canGoNext()}
              className="btn-liquid flex items-center gap-2 px-5 py-2 rounded-xl font-semibold text-sm text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-md shadow-orange-200/50"
            >
              ถัดไป <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-liquid flex items-center gap-2 px-5 py-2 rounded-xl font-semibold text-sm text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-60 transition-colors shadow-md shadow-orange-200/50"
            >
              {submitting ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Send className="w-4 h-4" />}
              {submitting ? 'กำลังส่งและลงนาม...' : 'ยืนยันส่งคำร้อง'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helper sub-components ──────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="glass-input w-full rounded-xl px-3 py-2 text-sm focus:outline-none" />
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-neutral-400 min-w-[120px] flex-shrink-0">{label}</span>
      <span className="font-medium break-all">{value}</span>
    </div>
  );
}
