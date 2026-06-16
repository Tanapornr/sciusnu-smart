// ================================================================
// RequireStudentEmail.tsx
// A full-screen, non-dismissible gate shown ONLY to students whose
// "E-mail นักเรียน" column is blank in the master sheet. They cannot
// reach any dashboard / petition / submission screen until they save
// a valid email — every notification (submission results, petition
// approvals, etc.) in this system is routed through that address, so
// without it a student silently misses every update about their work.
//
// Mounted by App.tsx, in front of <StudentDashboard>, whenever
// user.role === 'student' && !user.email.
// ================================================================
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuthStore } from '../../store/authStore';
import { apiUpdateProfile } from '../../services/api';
import { ThemeToggleButton } from '../ui';
import { Mail, LogOut, ShieldAlert } from 'lucide-react';
import Swal from 'sweetalert2';

const swalPopup = { popup: 'rounded-[1.5rem] sm:rounded-[2rem] p-5 sm:p-6 w-[90%] max-w-sm' };

export default function RequireStudentEmail() {
  const { user, updateProfile, logout } = useAuthStore();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  // Page background/glass tokens (page-login scope) are applied by
  // App.tsx, which is the single source of truth for html page-scope —
  // keeping that logic in one place avoids a render-order race between
  // this component and App's own effect when the gate mounts/unmounts.

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || saving) return;

    const trimmed = email.trim().toLowerCase();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(trimmed)) {
      Swal.fire({
        icon: 'warning',
        title: '<div class="font-bold text-sm sm:text-base">รูปแบบอีเมลไม่ถูกต้อง</div>',
        confirmButtonColor: '#f97316',
        customClass: swalPopup,
      });
      return;
    }

    setSaving(true);
    try {
      const res = await apiUpdateProfile({ email: user.email, newEmail: trimmed });
      if (res.status === 'success') {
        updateProfile({ email: res.newEmail || trimmed });
        Swal.fire({
          icon: 'success',
          title: '<div class="font-bold text-lg">บันทึกอีเมลเรียบร้อย!</div>',
          showConfirmButton: false,
          timer: 1300,
          customClass: swalPopup,
        });
      } else {
        throw new Error(res.message || 'บันทึกอีเมลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: '<div class="font-bold text-rose-600 text-sm sm:text-base">เกิดข้อผิดพลาด</div>',
        text: err.message,
        confirmButtonColor: '#f97316',
        customClass: swalPopup,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Swal.fire({
      icon: 'question',
      title: '<div class="font-bold text-sm sm:text-base">ออกจากระบบ?</div>',
      text: 'หากเข้าระบบผิดบัญชี คุณสามารถออกจากระบบแล้วเข้าสู่ระบบใหม่ได้',
      showCancelButton: true,
      confirmButtonText: 'ออกจากระบบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#f97316',
      cancelButtonColor: '#94a3b8',
      customClass: swalPopup,
    }).then((r) => { if (r.isConfirmed) logout(); });
  };

  return (
    <div className="login-page flex min-h-screen items-center justify-center relative overflow-x-hidden p-4 transition-colors">
      <div className="absolute top-10 left-10 w-64 h-64 sm:w-96 sm:h-96 bg-orange-500/30 dark:bg-orange-600/30 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[80px] animate-blob"></div>
      <div className="absolute top-0 right-10 w-64 h-64 sm:w-96 sm:h-96 bg-amber-500/30 dark:bg-amber-600/30 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[80px] animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-10 left-1/4 w-64 h-64 sm:w-96 sm:h-96 bg-yellow-500/30 dark:bg-yellow-600/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[80px] animate-blob animation-delay-4000"></div>

      <ThemeToggleButton className="!absolute top-6 right-6 z-50 shadow-md" />

      <div className="w-full max-w-md p-6 sm:p-8 rounded-[2rem] glass-panel relative z-10">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-tr from-orange-500 to-amber-400 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-orange-500/30 mb-4">
            <Mail className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white tracking-tight leading-snug mb-3">
            กรุณาระบุอีเมลของคุณ<br className="hidden sm:block" />ก่อนเริ่มใช้งาน
          </h1>
          <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            ยังไม่มีอีเมลของคุณ <b className="text-slate-700 dark:text-slate-200">{user?.name}</b> (รหัส {user?.studentId}) ในระบบ
            จำเป็นต้องระบุก่อนจึงจะใช้งานเมนูต่าง ๆ ได้ เพราะระบบจะส่งผลการตรวจงานและการอนุมัติคำร้องไปที่อีเมลนี้
          </p>
        </div>

        <div className="flex items-start gap-2.5 mb-6 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
            เมนูส่งงาน ยื่นคำร้อง และข้อมูลโครงงานจะใช้งานได้หลังบันทึกอีเมลแล้วเท่านั้น
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 ml-1">
              อีเมลของคุณ
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-5 h-5 opacity-80" />
              </div>
              <input
                type="email"
                autoFocus
                required
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
                className="w-full pl-11 pr-4 py-3.5 text-sm sm:text-base rounded-xl glass-input outline-none transition-all font-medium placeholder-slate-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full btn-liquid bg-[#1e293b] dark:bg-slate-700 text-white font-bold py-3.5 sm:py-4 rounded-xl text-sm sm:text-base flex items-center justify-center hover:shadow-lg transition-all border border-slate-900 dark:border-slate-600 disabled:opacity-60"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกและเข้าใช้งาน'}
          </button>
        </form>

        <div className="mt-7 text-center border-t border-slate-200 dark:border-slate-700/50 pt-5">
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-[12px] sm:text-xs text-slate-500 dark:text-slate-400 font-semibold hover:text-orange-600 dark:hover:text-orange-400 transition-colors outline-none"
          >
            <LogOut className="w-3.5 h-3.5" /> เข้าระบบผิดบัญชี? ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  );
}
