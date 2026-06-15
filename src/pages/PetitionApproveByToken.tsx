// ================================================================
// src/pages/PetitionApproveByToken.tsx
//
// PUBLIC page — no login required.
// A new co-advisor clicks the magic link from their email:
//   https://yoursite.com/?petitionToken=abc123
//
// This page:
//   1. Reads the token from the URL query string
//   2. Fetches petition info from the backend (no JWT needed)
//   3. Shows the petition details + signature pad
//   4. Lets them approve or reject
// ================================================================
import { useState, useEffect, useCallback } from 'react';
import SignaturePad from '../components/petition/SignaturePad';
import {
  apiGetPetitionByToken,
  apiApproveByToken,
} from '../services/petitionApi';
import type { PetitionByTokenInfo } from '../types/petition';
import { CheckCircle, XCircle, Clock, AlertTriangle, FileText } from 'lucide-react';

// ── What state this page can be in ───────────────────────────────
type PageState =
  | 'loading'      // fetching petition info from backend
  | 'invalid'      // token missing, expired, or not found
  | 'waiting'      // found but not the advisor stage yet (students haven't approved)
  | 'already_done' // this person already approved/rejected
  | 'form'         // ready to sign
  | 'submitting'   // waiting for backend response
  | 'success'      // approved/rejected successfully
  | 'error';       // network or server error

export default function PetitionApproveByToken() {
  const [pageState, setPageState]     = useState<PageState>('loading');
  const [petition, setPetition]       = useState<PetitionByTokenInfo | null>(null);
  const [signature, setSignature]     = useState('');
  const [note, setNote]               = useState('');
  const [submitAction, setSubmitAction] = useState<'approve' | 'reject' | null>(null);
  const [errorMsg, setErrorMsg]       = useState('');
  const [sigError, setSigError]       = useState('');

  // ── Read ?petitionToken=... from URL on mount ─────────────────
  const token = new URLSearchParams(window.location.search).get('petitionToken') ?? '';

  useEffect(() => {
    if (!token) {
      setPageState('invalid');
      return;
    }

    apiGetPetitionByToken(token)
      .then((info) => {
        setPetition(info);
        if (info.petition_status === 'เสร็จสิ้น' || info.petition_status === 'ปฏิเสธ') {
          setPageState('already_done');
        } else if (info.already_actioned) {
          setPageState('already_done');
        } else if (info.active_stage !== 'advisors') {
          setPageState('waiting');
        } else {
          setPageState('form');
        }
      })
      .catch(() => setPageState('invalid'));
  }, [token]);

  // ── Handle approve / reject button ───────────────────────────
  const handleSubmit = useCallback(async (action: 'approve' | 'reject') => {
    setSigError('');
    if (!signature) {
      setSigError('กรุณาลงนามในกรอบด้านล่างก่อน');
      return;
    }

    setSubmitAction(action);
    setPageState('submitting');

    try {
      await apiApproveByToken({ token, signature, note, action });
      setPageState('success');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      setPageState('error');
    }
  }, [token, signature, note]);

  // ── Render helpers ────────────────────────────────────────────

  if (pageState === 'loading') {
    return (
      <PageShell>
        <div className="token-status-card">
          <div className="token-spinner" />
          <p className="token-status-text muted">กำลังโหลดข้อมูลคำร้อง...</p>
        </div>
      </PageShell>
    );
  }

  if (pageState === 'invalid') {
    return (
      <PageShell>
        <div className="token-status-card">
          <XCircle size={48} className="token-status-icon red" />
          <h2 className="token-status-title">ลิงก์ไม่ถูกต้อง</h2>
          <p className="token-status-text muted">
            ลิงก์นี้ไม่ถูกต้อง หรืออาจหมดอายุแล้ว
            <br />กรุณาติดต่อนักเรียนเพื่อขอลิงก์ใหม่
          </p>
        </div>
      </PageShell>
    );
  }

  if (pageState === 'waiting') {
    const waitingMsg = petition?.active_stage === 'students'
      ? 'รอให้นักเรียนทุกคนอนุมัติก่อน'
      : petition?.active_stage === 'admin'
        ? 'คำร้องอยู่ในขั้นตอนของผู้ดูแลระบบแล้ว'
        : 'รอขั้นตอนก่อนหน้าให้ครบก่อน';
    return (
      <PageShell>
        <div className="token-status-card">
          <Clock size={48} className="token-status-icon yellow" />
          <h2 className="token-status-title">ยังไม่ถึงขั้นตอนของคุณ</h2>
          <p className="token-status-text muted">
            {waitingMsg}
            <br />ระบบจะส่งอีเมลแจ้งให้คุณทราบเมื่อถึงขั้นตอนของคุณ
          </p>
        </div>
      </PageShell>
    );
  }

  if (pageState === 'already_done') {
    const petStatus = petition?.petition_status;
    const isFinished = petStatus === 'เสร็จสิ้น' || petStatus === 'ปฏิเสธ';
    return (
      <PageShell>
        <div className="token-status-card">
          <CheckCircle size={48} className="token-status-icon green" />
          <h2 className="token-status-title">{isFinished ? 'คำร้องสิ้นสุดแล้ว' : 'ดำเนินการแล้ว'}</h2>
          <p className="token-status-text muted">
            {isFinished
              ? <>คำร้องนี้ <strong>{petStatus}</strong> เรียบร้อยแล้ว</>
              : <>คุณได้ <strong>{petition?.my_status}</strong> คำร้องนี้เรียบร้อยแล้ว</>
            }
          </p>
        </div>
      </PageShell>
    );
  }

  if (pageState === 'success') {
    return (
      <PageShell>
        <div className="token-status-card">
          <CheckCircle size={48} className="token-status-icon green" />
          <h2 className="token-status-title">
            {submitAction === 'approve' ? 'อนุมัติเรียบร้อยแล้ว' : 'ปฏิเสธเรียบร้อยแล้ว'}
          </h2>
          <p className="token-status-text muted">
            ขอบคุณ ระบบได้บันทึกการดำเนินการของคุณแล้ว
          </p>
        </div>
      </PageShell>
    );
  }

  if (pageState === 'error') {
    return (
      <PageShell>
        <div className="token-status-card">
          <AlertTriangle size={48} className="token-status-icon red" />
          <h2 className="token-status-title">เกิดข้อผิดพลาด</h2>
          <p className="token-status-text muted">{errorMsg}</p>
          <button
            className="token-retry-btn"
            onClick={() => setPageState('form')}
          >
            ลองใหม่
          </button>
        </div>
      </PageShell>
    );
  }

  // ── Main form (pageState === 'form' | 'submitting') ───────────
  return (
    <PageShell>
      <div className="token-main-card">

        {/* ── Header ── */}
        <div className="token-card-header">
          <div className="token-header-icon">
            <FileText size={22} />
          </div>
          <div>
            <span className="token-badge purple">คำร้องรอลายเซ็น</span>
            <h1 className="token-petition-type">{petition?.petition_type_label}</h1>
            <p className="token-petition-id">{petition?.petition_id}</p>
          </div>
        </div>

        {/* ── Petition details ── */}
        <div className="token-info-block">
          <InfoRow label="โครงงาน"    value={`${petition?.project_code} — ${petition?.project_name}`} />
          <InfoRow label="ผู้ยื่นคำร้อง" value={petition?.requester_name ?? ''} />
          <InfoRow label="ผู้ลงนาม"   value={petition?.approver_name ?? ''} highlight />
        </div>

        <div className="token-divider" />

        {/* ── Signature pad ── */}
        <div className="token-section">
          <SignaturePad
            onSign={(data) => { setSignature(data); setSigError(''); }}
            onClear={() => setSignature('')}
            label="ลายเซ็นของคุณ"
          />
          {sigError && <p className="token-field-error">{sigError}</p>}
        </div>

        {/* ── Note ── */}
        <div className="token-section">
          <label className="token-section-label">หมายเหตุ (ถ้ามี)</label>
          <textarea
            className="token-textarea"
            rows={3}
            placeholder="ระบุหมายเหตุเพิ่มเติม..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pageState === 'submitting'}
          />
        </div>

        {/* ── Action buttons ── */}
        <div className="token-action-row">
          <button
            className="token-btn reject"
            disabled={pageState === 'submitting'}
            onClick={() => handleSubmit('reject')}
          >
            {pageState === 'submitting' && submitAction === 'reject'
              ? 'กำลังบันทึก...'
              : '✕  ปฏิเสธ'}
          </button>
          <button
            className="token-btn approve"
            disabled={pageState === 'submitting'}
            onClick={() => handleSubmit('approve')}
          >
            {pageState === 'submitting' && submitAction === 'approve'
              ? 'กำลังบันทึก...'
              : '✓  อนุมัติ'}
          </button>
        </div>

      </div>
    </PageShell>
  );
}

// ── Small helper components ───────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="token-page-shell">
      <div className="token-page-logo">
        <img src="/logo.jpg" alt="SCiUSNU" className="token-logo-img" />
        <span className="token-logo-label">SCiUSNU Smart</span>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="token-info-row">
      <span className="token-info-label">{label}</span>
      <span className={`token-info-value ${highlight ? 'highlight' : ''}`}>{value}</span>
    </div>
  );
}