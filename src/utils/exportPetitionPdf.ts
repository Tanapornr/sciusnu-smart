// ================================================================
// utils/exportPetitionPdf.ts
// Generates a filled PDF replicating the official
// "แบบฟอร์มแจ้งคำร้องทั่วไป" (วมว. มน.) via browser print.
// Thai-safe (uses Google Fonts Sarabun), signature-aware.
// ================================================================

import type { Petition, PetitionPayload } from '../types/petition';
import { formatDateTimeTH } from './index';

// ── Main export function ──────────────────────────────────────────

export async function exportViaPrint(petition: Petition): Promise<void> {
  const html = buildPetitionHtml(petition);

  // Create hidden iframe, write HTML, trigger print-to-PDF
  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;visibility:hidden;';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    return;
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  // Wait for fonts + signature images to load
  await new Promise<void>(resolve => {
    const timer = setTimeout(resolve, 900);
    iframe.contentWindow?.addEventListener('load', () => {
      clearTimeout(timer);
      setTimeout(resolve, 200);
    });
  });

  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();

  // Clean up after print dialog closes
  setTimeout(() => {
    try { document.body.removeChild(iframe); } catch { /* already removed */ }
  }, 3000);
}

// ── HTML template builder ─────────────────────────────────────────

function buildPetitionHtml(petition: Petition): string {
  const p: PetitionPayload = petition.payload || {};
  const type = Number(petition.petition_type);
  const created = formatDateTimeTH(petition.created_at);

  // Parse requester name parts
  const nameParts = (petition.requester_name || '').trim().split(/\s+/);
  const firstName = nameParts.slice(0, -1).join(' ') || nameParts[0] || '';
  const lastName  = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

  // Chain + approver helpers
  const chain = petition.chain || [];
  const getChainMember = (role: string) => chain.find(c => c.role === role);
  const getApprover    = (role: string): Record<string, string> =>
    ((petition as unknown as Record<string, unknown>)[role] as Record<string, string>) || {};

  const s1     = getChainMember('student1');
  const s2     = getChainMember('student2');
  const adv    = getChainMember('advisor');
  const coadv1 = getChainMember('coadvisor1');
  const coadv2 = getChainMember('coadvisor2');

  const s1App   = getApprover('student1');
  const s2App   = getApprover('student2');
  const advApp  = getApprover('advisor');
  const ca1App  = getApprover('coadvisor1');
  const ca2App  = getApprover('coadvisor2');

  // Status color
  const statusColor =
    petition.status === 'เสร็จสิ้น' ? '#10b981' :
    petition.status === 'ปฏิเสธ'    ? '#ef4444' : '#f59e0b';

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8" />
<title>คำร้อง ${esc(petition.petition_id)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Sarabun', 'TH Sarabun New', 'Noto Sans Thai', sans-serif;
    font-size: 10.5pt;
    color: #1a1a1a;
    background: #fff;
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 12mm 18mm 12mm 18mm;
    background: #fff;
  }
  /* Header */
  .header { text-align: center; margin-bottom: 5mm; }
  .logo-circle {
    width: 14mm; height: 14mm; border-radius: 50%;
    border: 2px solid #f97316;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 2.5mm;
    font-size: 9pt; color: #f97316; font-weight: 700;
    line-height: 1;
  }
  .title-main { font-size: 13pt; font-weight: 700; line-height: 1.45; }
  .title-sub  { font-size: 11pt; font-weight: 600; color: #374151; }

  /* Status strip */
  .status-strip {
    display: flex; align-items: center; justify-content: space-between;
    background: #f9fafb; border: 1px solid #e5e7eb;
    border-radius: 6px; padding: 2mm 3.5mm; margin-bottom: 3.5mm;
    font-size: 9pt;
  }
  .status-badge {
    font-weight: 700; padding: 1px 9px; border-radius: 20px;
    font-size: 8.5pt; color: #fff;
  }

  /* Section title */
  .section-title {
    font-weight: 700; font-size: 10pt;
    margin: 3mm 0 2mm;
    padding-bottom: 1mm;
    border-bottom: 1.5px solid #f97316;
    color: #c2410c;
  }

  /* Field lines */
  .field-grid {
    display: grid; gap: 1.5mm; margin-bottom: 1mm;
  }
  .field-line {
    display: flex; align-items: baseline; gap: 2mm;
    border-bottom: 1px dashed #cbd5e1;
    padding-bottom: 0.5mm;
  }
  .field-label  { font-weight: 600; white-space: nowrap; flex-shrink: 0; }
  .field-value  { flex: 1; word-break: break-word; padding-left: 1mm; }
  .field-spacer { flex: 1; min-width: 15mm; }

  /* Petition items */
  .petition-item {
    display: flex; align-items: flex-start; gap: 2mm;
    margin-bottom: 1.8mm; padding: 1.5mm 2.5mm; border-radius: 4px;
  }
  .petition-item.active  { background: #fff7ed; border: 1px solid #fed7aa; }
  .petition-item.inactive{ opacity: 0.4; }
  .item-num   { font-weight: 700; flex-shrink: 0; width: 5.5mm; font-size: 10pt; }
  .item-title { font-weight: 600; font-size: 10pt; }
  .item-detail{ font-size: 9pt; color: #374151; margin-top: 1mm; line-height: 1.6; }
  .detail-row { display: flex; gap: 2mm; margin-top: 0.8mm; }
  .detail-lbl { font-weight: 600; min-width: 28mm; flex-shrink: 0; color: #374151; }

  /* Signature grid */
  .sig-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3mm; margin-top: 3.5mm;
  }
  .sig-box {
    border: 1px solid #e5e7eb; border-radius: 6px;
    padding: 2mm 2.5mm; background: #fafafa;
    min-height: 26mm;
  }
  .sig-role  { font-size: 8pt; color: #6b7280; font-weight: 600; text-align: center; margin-bottom: 1mm; }
  .sig-image { height: 15mm; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .sig-image img { max-height: 14mm; max-width: 100%; object-fit: contain; }
  .sig-placeholder { color: #d1d5db; font-size: 8.5pt; text-align: center; }
  .sig-name  { font-size: 8.5pt; text-align: center; border-top: 1px dashed #d1d5db; padding-top: 1mm; margin-top: 1mm; color: #374151; }
  .sig-status-badge {
    font-size: 7.5pt; font-weight: 700;
    padding: 1px 7px; border-radius: 12px;
    display: block; text-align: center; margin-top: 1mm;
  }
  .approved { background: #d1fae5; color: #065f46; }
  .rejected { background: #fee2e2; color: #991b1b; }
  .pending  { background: #fef3c7; color: #92400e; }
  .sig-note { font-size: 7pt; color: #6b7280; text-align: center; margin-top: 0.5mm; }

  /* Footer note */
  .note-footer {
    background: #fffbeb; border: 1px solid #fcd34d;
    border-radius: 5px; padding: 2mm 3mm;
    font-size: 8.5pt; margin-top: 3mm; line-height: 1.65;
    color: #78350f;
  }

  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .page { padding: 10mm 15mm; }
    @page { size: A4 portrait; margin: 0; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="logo-circle">วมว<br/>มน.</div>
    <div class="title-main">แบบฟอร์มแจ้งคำร้องทั่วไป/และคำร้องขอเปลี่ยนแปลงข้อมูลโครงงาน</div>
    <div class="title-sub">สำหรับนักเรียนโครงการ วมว. มน.</div>
  </div>

  <div class="status-strip">
    <span>
      <strong>รหัสคำร้อง:</strong> ${esc(petition.petition_id)}
      &nbsp;·&nbsp;
      <strong>วันที่ยื่น:</strong> ${esc(created.date)} ${esc(created.time)}
    </span>
    <span class="status-badge" style="background:${statusColor}">${esc(petition.status)}</span>
  </div>

  <div class="section-title">ข้อมูลผู้ยื่นคำร้อง</div>
  <div class="field-grid">
    <div class="field-line">
      <span class="field-label">คำนำหน้า</span>
      <span class="field-value">${esc(p.requesterPrefix)}</span>
      <span class="field-label">ชื่อ</span>
      <span class="field-value">${esc(firstName)}</span>
      <span class="field-label">นามสกุล</span>
      <span class="field-value">${esc(lastName)}</span>
    </div>
    <div class="field-line">
      <span class="field-label">โครงการ วมว. รุ่น</span>
      <span class="field-value">${esc(p.requesterGen)}</span>
      <span class="field-label">รหัสโครงงาน</span>
      <span class="field-value">${esc(petition.project_code)}</span>
    </div>
    <div class="field-line">
      <span class="field-label">ชื่อโครงงาน</span>
      <span class="field-value">${esc(petition.project_name)}</span>
    </div>
    <div class="field-line">
      <span class="field-label">อีเมล์</span>
      <span class="field-value">${esc(petition.requester_email)}</span>
      <span class="field-label">เบอร์ติดต่อ (มือถือ)</span>
      <span class="field-value">${esc(p.requesterPhone)}</span>
    </div>
  </div>

  <div class="section-title">มีความประสงค์ที่จะดำเนินการ ดังต่อไปนี้</div>
  ${buildItemsHtml(type, p)}

  <div class="section-title">ลายเซ็นผู้เกี่ยวข้อง</div>
  <div class="sig-grid">
    ${buildSigBox('นักเรียน วมว. คนที่ 1', s1?.name || '', s1App)}
    ${buildSigBox('นักเรียน วมว. คนที่ 2', s2?.name || '', s2App)}
    ${buildSigBox('อาจารย์ที่ปรึกษาหลัก', adv?.name || '', advApp)}
    ${coadv1 ? buildSigBox('อาจารย์ที่ปรึกษาร่วม 1', coadv1.name || '', ca1App) : '<div></div>'}
    ${coadv2 ? buildSigBox('อาจารย์ที่ปรึกษาร่วม 2', coadv2.name || '', ca2App) : ''}
  </div>

</div>
</body>
</html>`;
}

// ── Escape HTML ───────────────────────────────────────────────────

function esc(s: string | undefined): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Petition items HTML ───────────────────────────────────────────

function buildItemsHtml(type: number, p: PetitionPayload): string {
  const items: { num: number; title: string; detail?: string }[] = [
    {
      num: 1,
      title: 'ขอเพิ่มชื่ออาจารย์ที่ปรึกษาจากมหาวิทยาลัยฯ',
      detail: type === 1 ? `
        <div class="detail-row"><span class="detail-lbl">คณะ/สังกัด:</span><span>${esc(p.faculty)}${p.affiliation ? ' — ' + esc(p.affiliation) : ''}</span></div>
        <div class="detail-row"><span class="detail-lbl">ชื่ออาจารย์:</span><span>${esc(p.advisorName)}</span></div>
        <div class="detail-row"><span class="detail-lbl">อีเมล:</span><span>${esc(p.advisorEmail)}</span></div>
      ` : undefined,
    },
    {
      num: 2,
      title: 'มีความประสงค์เพิ่มชื่ออาจารย์ที่ปรึกษาจากโรงเรียนมัธยมฯ',
      detail: type === 2 ? (p.option === 'A'
        ? `<div class="detail-row"><span class="detail-lbl">ชื่ออาจารย์:</span><span>${esc(p.schoolAdvisorName)}</span></div>
           <div class="detail-row"><span class="detail-lbl">อีเมล:</span><span>${esc(p.schoolAdvisorEmail)}</span></div>`
        : `<div class="detail-row"><span class="detail-lbl">ตัวเลือก:</span><span>ต้องการให้ทางโครงการ วมว. จัดหาให้</span></div>`
      ) : undefined,
    },
    {
      num: 3,
      title: 'ขอถอนชื่ออาจารย์ที่ปรึกษา',
      detail: type === 3 ? `
        <div class="detail-row"><span class="detail-lbl">ประเภท:</span><span>${p.removeType === 'university' ? 'จากมหาวิทยาลัย' : 'จากโรงเรียนมัธยมสาธิตฯ'}</span></div>
        ${p.removeFaculty ? `<div class="detail-row"><span class="detail-lbl">คณะ:</span><span>${esc(p.removeFaculty)}</span></div>` : ''}
        <div class="detail-row"><span class="detail-lbl">ชื่ออาจารย์:</span><span>${esc(p.removeName)}</span></div>
        ${p.removeEmail ? `<div class="detail-row"><span class="detail-lbl">อีเมล:</span><span>${esc(p.removeEmail)}</span></div>` : ''}
        <div class="detail-row"><span class="detail-lbl">เนื่องจาก:</span><span>${esc(p.removeReason)}</span></div>
      ` : undefined,
    },
    {
      num: 4,
      title: 'ขอเปลี่ยนชื่อโครงงาน เป็น (ข้อมูลใหม่)',
      detail: type === 4 ? `
        <div class="detail-row"><span class="detail-lbl">ชื่อใหม่ (ไทย):</span><span>${esc(p.newNameTH)}</span></div>
        <div class="detail-row"><span class="detail-lbl">ชื่อใหม่ (English):</span><span>${esc(p.newNameEN)}</span></div>
        <div class="detail-row"><span class="detail-lbl">เนื่องจาก:</span><span>${esc(p.renameReason)}</span></div>
      ` : undefined,
    },
    {
      num: 5,
      title: 'ขอเปลี่ยนแปลงสาขาโครงงาน',
      detail: type === 5 ? `
        <div class="detail-row"><span class="detail-lbl">สาขาเดิม:</span><span>${esc(p.currentField)}</span></div>
        <div class="detail-row"><span class="detail-lbl">สาขาใหม่:</span><span>${esc(p.newField)}</span></div>
        <div class="detail-row"><span class="detail-lbl">เนื่องจาก:</span><span>${esc(p.fieldReason)}</span></div>
      ` : undefined,
    },
    {
      num: 6,
      title: 'อื่นๆ (โปรดระบุ)',
      detail: type === 6 ? `
        <div class="detail-row"><span class="detail-lbl">รายละเอียด:</span><span>${esc(p.description)}</span></div>
      ` : undefined,
    },
  ];

  return items.map(item => {
    const isActive = item.num === type;
    return `<div class="petition-item ${isActive ? 'active' : 'inactive'}">
      <span class="item-num">${isActive ? '☑' : '☐'} ${item.num}.</span>
      <div>
        <div class="item-title">${item.title}</div>
        ${isActive && item.detail ? `<div class="item-detail">${item.detail}</div>` : ''}
      </div>
    </div>`;
  }).join('\n');
}

// ── Signature box HTML ────────────────────────────────────────────

function buildSigBox(roleLabel: string, name: string, approver: Record<string, string>): string {
  const sig    = approver?.signature || '';
  const status = approver?.status    || '';
  const note   = approver?.note      || '';

  const statusClass = status === 'อนุมัติ' ? 'approved' : status === 'ปฏิเสธ' ? 'rejected' : 'pending';
  const statusLabel = status || 'รอลงนาม';

  const sigContent = sig
    ? `<img src="${sig}" alt="ลายเซ็น" />`
    : '<span class="sig-placeholder">ยังไม่ได้ลงนาม</span>';

  return `<div class="sig-box">
    <div class="sig-role">${esc(roleLabel)}</div>
    <div class="sig-image">${sigContent}</div>
    <div class="sig-name">(${esc(name) || '...................................'})</div>
    <span class="sig-status-badge ${statusClass}">${esc(statusLabel)}</span>
    ${note ? `<div class="sig-note">💬 ${esc(note)}</div>` : ''}
  </div>`;
}
