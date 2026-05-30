import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiGetData, apiUpdateStatus, apiUpdateAdvisorPassword } from '../services/api';
import {
  parseSubmissionStatus,
  formatDateTimeTH,
  getSubmissionFileUrl,
  getSubmissionReason,
  escapeHtml
} from '../utils';
import type { SubmissionRow, ProjectRow, WorkType } from '../types';
import {
  ShieldCheck,
  User as UserIcon,
  Moon,
  Sun,
  LogOut,
  Settings,
  BarChart2,
  FolderOpen,
  X,
  Save,
  CheckCircle,
  XCircle,
  Clock3,
  Hash,
    Eye,
  Check,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import Swal from 'sweetalert2';

export default function AdvisorDashboard() {
  const { user, theme, toggleTheme, logout } = useAuthStore();

  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [projectRows, setProjectRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [isPassModalOpen, setIsPassModalOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passSaving, setPassSaving] = useState(false);



  const getMainAdvisorEmail = (projectRow: any) => {
    // Use named key "E-mail อ.ที่ปรึกษา" (col 8) instead of positional index
    return (projectRow['E-mail อ.ที่ปรึกษา'] || '').toString().trim();
  };

  const isLoggedInMainAdvisor = (projectRow: any) => {
    const loginEmail = String(user?.email || '').trim().toLowerCase();
    const mainAdvisorEmail = getMainAdvisorEmail(projectRow).toLowerCase();
    return loginEmail && mainAdvisorEmail && loginEmail === mainAdvisorEmail;
  };

  const canCurrentUserReviewSubmission = (submission: any) => {
    if (user?.role === 'admin') return true;
    if (user?.role !== 'advisor_main') return false;

    const projectId = submission['รหัสโครงงาน'] || submission['projectid'] || '';
    const rows = projectRows.filter(p => {
        const keys = Object.keys(p);
        const pId = keys.length > 4 ? p[keys[4]] : '';
        return pId === projectId;
    });

    return rows.some(p => isLoggedInMainAdvisor(p));
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await apiGetData();
      if (res.status === 'success') {
        let allProjs = res.projects || [];
        let allSubs = res.submissions || [];
        
        if (user?.role === 'admin') {
            setProjectRows(allProjs);
            setSubmissions(allSubs);
        } else {
            let myProjectIds: string[] = [];
            allProjs.forEach(p => {
                if (isLoggedInMainAdvisor(p)) {
                    // Use named key "รหัสโครงงาน" (col 5) not positional keys[4]
                    const pid = (p['รหัสโครงงาน'] || '').toString();
                    if (pid) myProjectIds.push(pid);
                }
            });
            myProjectIds = [...new Set(myProjectIds)];

            const filteredProjs = allProjs.filter(p => {
                const pid = (p['รหัสโครงงาน'] || '').toString();
                return myProjectIds.includes(pid);
            });
            
            const filteredSubs = allSubs.filter(s => {
                const pid = s['รหัสโครงงาน'] || s['projectid'] || '';
                return myProjectIds.includes(pid);
            });

            setProjectRows(filteredProjs);
            setSubmissions(filteredSubs);
        }
      } else {
        throw new Error(res.message || 'ดึงข้อมูลล้มเหลว');
      }
    } catch (err: any) {
        Swal.fire({
            title: '<div class="font-bold text-rose-600">ผิดพลาด</div>',
            text: err.message,
            icon: 'error',
            customClass: { popup: 'rounded-[1.5rem]' }
        });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const viewStudentPopup = (name: string, id: string, phoneStr: string, picUrl: string) => {
    Swal.fire({
      html: `<div class="text-center pt-2"><img src="${picUrl}" class="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover mx-auto mb-4 border-[4px] border-cyan-100 dark:border-neutral-800 shadow-md bg-white" loading="lazy"><h3 class="text-lg sm:text-xl font-bold text-neutral-800 dark:text-white leading-tight">${name}</h3><p class="text-xs sm:text-sm text-neutral-400 dark:text-neutral-500 mb-5 mt-1 font-medium">รหัสประจำตัวนักเรียน: ${id}</p><div class="bg-cyan-50 dark:bg-cyan-950/40 rounded-2xl p-3 sm:p-4 inline-block w-full border border-cyan-100 dark:border-cyan-900/50"><p class="text-[10px] sm:text-xs text-cyan-600 dark:text-cyan-400 mb-1.5 font-bold uppercase flex items-center justify-center"><i data-lucide="phone" class="w-3.5 h-3.5 mr-1.5"></i> เบอร์โทรติดต่อ</p><p class="text-base sm:text-lg font-extrabold text-cyan-800 dark:text-cyan-300 tracking-wide">${phoneStr || 'ไม่มีข้อมูลติดต่อ'}</p></div></div>`,
      showConfirmButton: true, confirmButtonText: 'ปิดหน้าต่าง', buttonsStyling: false, 
      customClass: { popup: 'rounded-[1.5rem] w-[90%] max-w-sm border border-neutral-100 dark:border-neutral-800 shadow-2xl', confirmButton: 'bg-neutral-800 dark:bg-neutral-700 text-white font-bold py-3 px-8 rounded-full mt-5 hover:bg-neutral-900 transition-colors text-sm w-full btn-liquid' }, backdrop: `rgba(0, 0, 0, 0.4)`
    });
  };

  const handlePassSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (newPassword !== confirmPassword) {
        Swal.fire({icon: 'warning', title: 'รหัสผ่านใหม่ไม่ตรงกัน', confirmButtonColor: '#f97316', customClass: {popup: 'rounded-2xl'} }); 
        return;
    }
    
    setPassSaving(true);

    try {
      const res = await apiUpdateAdvisorPassword({
        email: user.email,
        role: user?.role || 'advisor',
        oldPassword,
        newPassword,
      });

      if (res.status === 'success') {
        Swal.fire({
          title: 'เปลี่ยนรหัสผ่านเรียบร้อย!',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false,
          customClass: { popup: 'rounded-2xl' },
        });
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setIsPassModalOpen(false);
      } else {
        throw new Error(res.message);
      }
    } catch (err: any) {
      Swal.fire({
        title: 'เกิดข้อผิดพลาด',
        text: err.message,
        icon: 'error',
        confirmButtonColor: '#f97316',
        customClass: { popup: 'rounded-2xl' },
      });
    } finally {
      setPassSaving(false);
    }
  };

  const openActionModal = async (studentId: string, workType: string, _currentStatus: string, currentReason: string, nextStatus: string) => {
    const targetSubmission = submissions.find(item =>
        (item['รหัสนักเรียน'] || '') === studentId &&
        (item['ประเภทงาน'] || '') === workType
    );

    if (!targetSubmission || !canCurrentUserReviewSubmission(targetSubmission)) {
        Swal.fire({
            icon: 'warning',
            title: 'ไม่มีสิทธิ์อนุมัติ',
            text: 'คุณต้องเป็นที่ปรึกษาหลักของโครงงานนี้เท่านั้น จึงจะสามารถจัดการสถานะได้',
            confirmButtonText: 'รับทราบ',
            customClass: { popup: 'rounded-[1.5rem]' }
        });
        return;
    }

    if (nextStatus === 'อนุมัติ') {
        Swal.fire({
            title: '<div class="font-bold text-lg sm:text-xl text-emerald-600">อนุมัติผ่านเกณฑ์?</div>',
            html: `<div class="text-sm">ยืนยันการอนุมัติ <b>${workType}</b> ของรหัสนักเรียน <b>${studentId}</b></div>`,
            showCancelButton: true,
            confirmButtonText: 'ยืนยันอนุมัติ',
            cancelButtonText: 'ยกเลิก',
            buttonsStyling: false,
            customClass: {
                popup: 'rounded-[1.5rem] w-[90%] max-w-sm',
                confirmButton: 'bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-6 rounded-full mx-2 text-sm btn-liquid',
                cancelButton: 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold py-3 px-6 rounded-full mx-2 text-sm btn-liquid'
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                Swal.fire({
                    title: 'กำลังอัปเดตสถานะ...',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); },
                    customClass: { popup: 'rounded-[1.5rem]' }
                });
                try {
                    const res = await apiUpdateStatus({
                        studentId: studentId,
                        projectId: targetSubmission['รหัสโครงงาน'] || targetSubmission['รหัสกลุ่ม'] || '',
                        workType: workType as WorkType,
                        status: 'อนุมัติ',
                        reviewerEmail: user?.email || '',
                        reviewerName: user?.name || '',
                        role: user?.role || 'advisor'
                    });
                    if (res.status === 'success') {
                        Swal.fire({ icon: 'success', title: 'อนุมัติสำเร็จ!', showConfirmButton: false, timer: 1500, customClass: { popup: 'rounded-[1.5rem]' } });
                        fetchData();
                    } else {
                        throw new Error(res.message);
                    }
                } catch(e: any) {
                    Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: e.message, customClass: { popup: 'rounded-[1.5rem]' } });
                }
            }
        });
    } else {
        Swal.fire({
            title: '<div class="font-bold text-lg sm:text-xl text-rose-600">ต้องการให้แก้ไขงาน?</div>',
            text: 'ระบุรายละเอียดข้อบกพร่องที่ต้องการให้นักเรียนปรับปรุงแก้ไข:',
            input: 'textarea',
            inputPlaceholder: 'กรอกเหตุผลหรือคำเสนอแนะเพิ่มเติม...',
            inputValue: currentReason || '',
            showCancelButton: true,
            confirmButtonText: 'ส่งข้อความให้แก้ไข',
            cancelButtonText: 'ยกเลิก',
            buttonsStyling: false,
            customClass: {
                popup: 'rounded-[1.5rem] w-[90%] max-w-md',
                confirmButton: 'bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 px-6 rounded-full mx-2 text-sm btn-liquid',
                cancelButton: 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold py-3 px-6 rounded-full mx-2 text-sm btn-liquid'
            },
            inputValidator: (value) => {
                if (!value) return 'จำเป็นต้องระบุข้อเสนอแนะเพื่อให้เด็กไปปรับปรุงงาน';
            }
        }).then(async (result) => {
            if (result.isConfirmed && result.value) {
                Swal.fire({
                    title: 'กำลังส่งข้อมูลแก้ไข...',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); },
                    customClass: { popup: 'rounded-[1.5rem]' }
                });
                try {
                    const res = await apiUpdateStatus({
                        studentId: studentId,
                        projectId: targetSubmission['รหัสโครงงาน'] || targetSubmission['รหัสกลุ่ม'] || '',
                        workType: workType as WorkType,
                        status: 'ไม่อนุมัติ',
                        reason: result.value,
                        reviewerEmail: user?.email || '',
                        reviewerName: user?.name || '',
                        role: user?.role || 'advisor'
                    });
                    if (res.status === 'success') {
                        Swal.fire({ icon: 'success', title: 'ส่งคำขอแก้ไขเรียบร้อย', showConfirmButton: false, timer: 1500, customClass: { popup: 'rounded-[1.5rem]' } });
                        fetchData();
                    } else {
                        throw new Error(res.message);
                    }
                } catch(e: any) {
                    Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: e.message, customClass: { popup: 'rounded-[1.5rem]' } });
                }
            }
        });
    }
  };

  const getPreviousRejectInfo = (target: any) => {
    const targetKey = `${(target['รหัสโครงงาน'] || '').toLowerCase()}|${(target['ประเภทงาน'] || '').toLowerCase()}`;
    const rows = submissions
        .filter(item => `${(item['รหัสโครงงาน'] || '').toLowerCase()}|${(item['ประเภทงาน'] || '').toLowerCase()}` === targetKey)
        .sort((a, b) => new Date(a.Timestamp ?? 0).getTime() - new Date(b.Timestamp ?? 0).getTime());

    let lastReject = null;
    for (const item of rows) {
        if (item === target) {
            return lastReject || { reason: '', timestamp: '' };
        }
        const parsedStatus = parseSubmissionStatus(item['สถานะ']);
        const reason = getSubmissionReason(item);

        if (parsedStatus === 'ไม่อนุมัติ') {
            lastReject = { reason, timestamp: item['Timestamp'] };
        } else if (parsedStatus === 'อนุมัติ') {
            lastReject = null;
        }
    }
    return { reason: '', timestamp: '' };
  };

  const projectIds = [...new Set(projectRows.map(p => {
      // Use named key "รหัสโครงงาน" (col 5) not positional keys[4]
      return (p['รหัสโครงงาน'] || '').toString();
  }).filter(id => id !== ""))];

  return (
    <div className="pb-10 app-shell transition-colors">
      <nav className="glass-panel border-b-0 shadow-sm sticky top-0 z-40 relative">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-500 to-pink-500"></div>
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 px-4 py-4 mt-1">
              <div className="flex items-center gap-4 w-full">
                  <button onClick={() => setIsPassModalOpen(true)} className="relative group outline-none rounded-full flex-shrink-0 transition-transform hover:scale-105">
                      <img src={user?.profileUrl} className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-[3px] border-white dark:border-neutral-800 shadow-md bg-white" />
                      <div className="absolute bottom-0 right-0 bg-neutral-800 dark:bg-orange-600 rounded-full p-1 shadow-md border-2 border-white dark:border-slate-800"><Settings className="w-2.5 h-2.5 text-white" /></div>
                  </button>
                  <div className="flex-grow min-w-0">
                      <h1 className="text-lg sm:text-xl font-extrabold text-neutral-800 dark:text-white flex items-center tracking-wide truncate"><ShieldCheck className="w-5 h-5 mr-2 text-orange-500" /> ศูนย์ติดตามโครงงาน (ที่ปรึกษาหลัก)</h1>
                      <p className="text-[11px] sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5 flex items-center font-medium truncate"><UserIcon className="w-3.5 h-3.5 mr-1.5 opacity-80" /> อ.ที่ปรึกษา: <span className="font-bold text-orange-600 dark:text-orange-400 ml-1 truncate">{user?.name}</span></p>
                  </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={toggleTheme} className="btn-liquid bg-neutral-100 dark:bg-neutral-800 p-2.5 rounded-full text-neutral-600 dark:text-neutral-300 outline-none hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-transparent dark:border-neutral-700">
                      {theme === 'dark' ? <Sun className="w-4.5 h-4.5 text-orange-400" /> : <Moon className="w-4.5 h-4.5" />}
                  </button>
                  <button onClick={logout} className="text-xs sm:text-sm text-rose-600 dark:text-rose-400 font-bold bg-rose-50 dark:bg-rose-950/30 px-4 py-2 rounded-full border border-rose-100 dark:border-rose-900/50 flex items-center btn-liquid"><LogOut className="w-3.5 h-3.5 mr-1.5 opacity-90" /> ออกระบบ</button>
              </div>
          </div>
      </nav>

      <div className="max-w-7xl mx-auto mt-4 sm:mt-8 px-3 sm:px-4 space-y-4 sm:space-y-6">
        
        {loading && (
            <div className="text-center py-20 text-sm text-neutral-500 flex flex-col items-center glass-panel rounded-[2rem]">
                <svg className="animate-spin h-10 w-10 text-orange-500 mb-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span className="font-medium tracking-wide">กำลังโหลดข้อมูลกลุ่มโครงงานของคุณ...</span>
            </div>
        )}

        {!loading && (
            <>
                {/* ── Overview Section ── */}
                <div className="glass-panel rounded-[2rem] p-4 sm:p-7 relative overflow-hidden">
                    <h2 className="text-base sm:text-lg font-bold text-neutral-800 dark:text-white mb-4 sm:mb-5 border-b border-neutral-100 dark:border-neutral-800 pb-3 flex items-center"><BarChart2 className="w-5 h-5 sm:w-6 sm:h-6 mr-2.5 text-orange-500" /> ภาพรวมสถานะโครงงานของกลุ่มที่คุณดูแล</h2>
                    <div className="table-fit-wrap w-full pb-2 overflow-x-hidden">
                        <table className="data-table advisor-table w-full text-left">
                            <thead className="text-[10px] sm:text-xs text-neutral-500">
                                <tr>
                                    <th className="px-3 py-3 font-semibold uppercase tracking-wider">รหัสโครงงาน / ชื่อโครงงาน</th>
                                    <th className="px-3 py-3 font-semibold uppercase tracking-wider">รายชื่อนักเรียนในกลุ่ม</th>
                                    <th className="px-2 py-3 text-center font-semibold uppercase tracking-wider">โครงร่าง</th>
                                    <th className="px-2 py-3 text-center font-semibold uppercase tracking-wider">ความก้าวหน้า</th>
                                    <th className="px-2 py-3 text-center font-semibold uppercase tracking-wider">ฉบับสมบูรณ์</th>
                                </tr>
                            </thead>
                            <tbody id="overviewTableBody" className="text-neutral-700 dark:text-neutral-200 text-xs sm:text-sm">
                                {projectIds.length === 0 ? (
                                    <tr><td colSpan={5} className="px-4 py-10 text-center text-neutral-500 font-medium">ไม่มีข้อมูลโครงงานที่ท่านดูแล</td></tr>
                                ) : (
                                    projectIds.map((pid: any) => {
                                        const members = projectRows.filter(p => {
                                            return (p['รหัสโครงงาน'] || '') === pid;
                                        });
                                        // "ชื่อโครงงาน " has a trailing space in the sheet
                                        let projectNameTH = members.length > 0
                                            ? (Object.entries(members[0]).find(([k]) => k.trim() === 'ชื่อโครงงาน')?.[1] || '') as string
                                            : '-';
                                        if (!projectNameTH) projectNameTH = '-';

                                        const memberIds = members.map(m => {
                                            return (m['รหัสนักเรียน'] || '').toString();
                                        });

                                        const projectSubs = submissions.filter(s => (s['รหัสโครงงาน'] || '') === pid || memberIds.includes(s['รหัสนักเรียน'] || ''));

                                        const getStatusBadge = (workType: string) => {
                                            const subs = projectSubs.filter(s => s['ประเภทงาน'] === workType);
                                            if (subs.length === 0) return <span className="px-3 py-1.5 rounded-full text-[9px] sm:text-[10px] font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-400 opacity-70 border border-neutral-200 dark:border-neutral-700">➖ ยังไม่ส่ง</span>;
                                            const parsedStatus = parseSubmissionStatus(subs[subs.length - 1]['สถานะ']);
                                            if (parsedStatus === 'อนุมัติ') return <span className="px-3 py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-900/60 shadow-sm"><CheckCircle className="w-3.5 h-3.5 mr-1.5 opacity-80" /> อนุมัติ</span>;
                                            if (parsedStatus === 'ไม่อนุมัติ') return <span className="px-3 py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 flex items-center justify-center border border-rose-100 dark:border-rose-900/60 shadow-sm"><XCircle className="w-3.5 h-3.5 mr-1.5 opacity-80" /> ต้องแก้ไข</span>;
                                            return <span className="px-3 py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center border border-amber-100 dark:border-amber-900/60 shadow-sm"><Clock3 className="w-3.5 h-3.5 mr-1.5 opacity-80" /> รอตรวจ</span>;
                                        };

                                        return (
                                            <tr key={pid}>
                                                <td className="px-3 py-4 align-top">
                                                    <div className="flex flex-col items-start gap-1">
                                                        <div className="font-extrabold text-neutral-800 dark:text-white bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs sm:text-sm shadow-sm"><span className="text-cyan-600 dark:text-cyan-400">#</span> {pid}</div>
                                                        <div className="text-xs sm:text-sm font-bold text-neutral-700 dark:text-neutral-200 mt-1 pl-1 whitespace-normal break-words w-full project-title-wrap">{projectNameTH}</div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 align-top">
                                                    {members.length > 0 ? members.map((m: any) => {
                                                        const mId = (m['รหัสนักเรียน'] || '').toString();
                                                        const mFName = (m['ชื่อ'] || '').toString();
                                                        const mLName = (m['นามสกุล'] || '').toString();
                                                        // Phone: key "เบอร์โทรศัพท์" may have trailing space
                                                        const mPhone = (Object.entries(m).find(([k]) => k.trim() === 'เบอร์โทรศัพท์')?.[1] || '').toString().replace(/'/g, '');
                                                        // Profile pic: key "รูปโปรไฟล์ " has trailing space
                                                        const picRaw = (Object.entries(m).find(([k]) => k.trim() === 'รูปโปรไฟล์')?.[1] || '').toString();
                                                        const pic = picRaw || `https://ui-avatars.com/api/?name=${encodeURIComponent(mFName)}&background=f0f0f0&color=1a1a1a`;
                                                        return (
                                                            <button key={mId} type="button" onClick={() => viewStudentPopup(`${mFName} ${mLName}`, mId, mPhone, pic)} className="w-full text-left flex items-center gap-2.5 mb-2.5 bg-neutral-50 dark:bg-neutral-800/60 p-2 sm:p-2.5 rounded-2xl border border-neutral-100 dark:border-neutral-700 btn-liquid transition-colors">
                                                                <img src={pic} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-white dark:border-neutral-600 shadow-sm bg-white" loading="lazy" />
                                                                <div className="flex flex-col leading-tight overflow-hidden">
                                                                    <span className="text-[10px] sm:text-[11px] text-neutral-700 dark:text-neutral-200 font-bold truncate">{mId}</span>
                                                                    <span className="text-[9px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 font-medium truncate mt-0.5">{mFName} {mLName}</span>
                                                                </div>
                                                            </button>
                                                        );
                                                    }) : <span className="text-neutral-300 text-xs">ไม่มีข้อมูลนักเรียน</span>}
                                                </td>
                                                <td className="px-2 py-4 align-top text-center">{getStatusBadge('โครงร่าง (Proposal)')}</td>
                                                <td className="px-2 py-4 align-top text-center">{getStatusBadge('รายงานความก้าวหน้า')}</td>
                                                <td className="px-2 py-4 align-top text-center">{getStatusBadge('รายงานฉบับสมบูรณ์')}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── All Works Section ── */}
                <div id="allWorksSection" className="glass-panel rounded-[2rem] p-4 sm:p-7 relative overflow-hidden">
                    <h2 className="text-base sm:text-lg font-bold text-neutral-800 dark:text-white mb-4 sm:mb-5 border-b border-neutral-100 dark:border-neutral-800 pb-3 flex items-center"><FolderOpen className="w-5 h-5 sm:w-6 sm:h-6 mr-2.5 text-indigo-500" /> ประวัติการส่งงานทั้งหมด</h2>
                    <div className="table-fit-wrap w-full pb-2 overflow-x-hidden">
                        <table className="data-table advisor-table w-full text-left">
                            <thead className="text-[10px] sm:text-xs text-neutral-500">
                                <tr>
                                    <th className="px-2 py-3 font-semibold uppercase tracking-wider">วันที่ส่ง</th>
                                    <th className="px-2 py-3 font-semibold uppercase tracking-wider">ข้อมูลผู้ส่งและกลุ่ม</th>
                                    <th className="px-2 py-3 font-semibold uppercase tracking-wider">ประเภทงาน</th>
                                    <th className="px-2 py-3 text-left font-semibold uppercase tracking-wider">หมายเหตุ</th>
                                    <th className="px-2 py-3 text-center font-semibold uppercase tracking-wider">สถานะ</th>
                                    <th className="px-2 py-3 text-center font-semibold uppercase tracking-wider">ไฟล์แนบ</th>
                                    <th className="px-2 py-3 text-center font-semibold uppercase tracking-wider">ตรวจงาน</th>
                                </tr>
                            </thead>
                            <tbody id="allWorksTableBody" className="text-neutral-700 dark:text-neutral-200 text-xs sm:text-sm">
                                {submissions.length === 0 ? (
                                    <tr><td colSpan={7} className="px-4 py-12 text-center text-neutral-500 font-medium">ยังไม่มีประวัติการส่งงานจากกลุ่มที่ดูแล</td></tr>
                                ) : (
                                    [...submissions].reverse().map((item, idx) => {
                                        const workType = item['ประเภทงาน'] || 'ไม่ระบุ';
                                        const status = item['สถานะ'] || 'รออนุมัติ';
                                        const studentIdStr = item['รหัสนักเรียน'] || '';
                                        const parsedStatus = parseSubmissionStatus(status);
                                        const previousReject = getPreviousRejectInfo(item);

                                        let reason = getSubmissionReason(item);
                                        const isPendingResubmit = parsedStatus === 'รอตรวจ' && previousReject.reason;
                                        const reviewReason = reason || (isPendingResubmit ? previousReject.reason : '');

                                        let reasonHtml = reviewReason
                                            ? <div className={`text-[10px] sm:text-[11px] ${isPendingResubmit ? 'text-blue-700 bg-blue-50 border-blue-100' : 'text-rose-700 bg-rose-50 border-rose-100'} font-medium p-2.5 rounded-xl inline-block w-full whitespace-normal break-words border text-left`}>{escapeHtml(reviewReason)}</div>
                                            : <span className="text-neutral-300">-</span>;

                                        let badge = <></>;
                                        if (parsedStatus === 'อนุมัติ') badge = <span className="px-3 py-1.5 rounded-lg text-[10px] font-extrabold bg-emerald-50 text-emerald-600 border border-emerald-200 inline-flex items-center justify-center whitespace-nowrap"><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />อนุมัติ</span>;
                                        else if (parsedStatus === 'ไม่อนุมัติ') badge = <span className="px-3 py-1.5 rounded-lg text-[10px] font-extrabold bg-rose-50 text-rose-600 border border-rose-200 inline-flex items-center justify-center whitespace-nowrap"><XCircle className="w-3.5 h-3.5 mr-1.5" />ไม่อนุมัติ</span>;
                                        else if (isPendingResubmit) badge = <span className="px-3 py-1.5 rounded-lg text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center justify-center whitespace-nowrap"><Clock3 className="w-3.5 h-3.5 mr-1.5" />รอตรวจไฟล์แก้ไข</span>;
                                        else badge = <span className="px-3 py-1.5 rounded-lg text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center justify-center whitespace-nowrap"><Clock3 className="w-3.5 h-3.5 mr-1.5" />รอการตรวจ</span>;

                                        const fileUrl = getSubmissionFileUrl(item);

                                        return (
                                            <tr key={idx}>
                                                <td className="px-2 py-4 align-middle opacity-80 text-xs">
                                                    {(() => {
                                                        const { date, time } = formatDateTimeTH(item.Timestamp);
                                                        return <><div className="font-bold text-neutral-800 dark:text-neutral-200">{date}</div><div className="text-[9px] text-neutral-400 mt-0.5">{time} น.</div></>;
                                                    })()}
                                                </td>
                                                <td className="px-2 py-3 align-middle">
                                                    <div>
                                                        <span className="font-extrabold text-neutral-800 dark:text-white bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-[10px] sm:text-xs shadow-sm"><Hash className="w-3 h-3 inline-block mr-0.5 text-cyan-600" /> {item['รหัสโครงงาน'] || '-'}</span>
                                                        {(() => {
                                                            const mProjId = (item['รหัสโครงงาน'] || '').toLowerCase();
                                                            const mTargetStuId = (item['รหัสนักเรียน'] || '').toLowerCase();
                                                            let groupMembers: any[] = [];
                                                            projectRows.forEach(p => {
                                                                if ((p['รหัสโครงงาน'] || '').toLowerCase() === mProjId) {
                                                                    const stuId = (p['รหัสนักเรียน'] || '').toString();
                                                                    if (!groupMembers.find(m => m.id === stuId)) {
                                                                        const firstName = (p['ชื่อ'] || '').toString();
                                                                        const phoneVal = (Object.entries(p).find(([k]) => k.trim() === 'เบอร์โทรศัพท์')?.[1] || '').toString().replace(/'/g, '');
                                                                        const picRaw = (Object.entries(p).find(([k]) => k.trim() === 'รูปโปรไฟล์')?.[1] || '').toString();
                                                                        groupMembers.push({
                                                                            id: stuId,
                                                                            firstName,
                                                                            lastName: (p['นามสกุล'] || '').toString(),
                                                                            phone: phoneVal,
                                                                            picUrl: picRaw || `https://ui-avatars.com/api/?name=${encodeURIComponent(firstName)}&background=f0f0f0&color=1a1a1a`
                                                                        });
                                                                    }
                                                                }
                                                            });
                                                            return groupMembers.map(m => {
                                                                const isSender = (m.id.toLowerCase() === mTargetStuId);
                                                                return (
                                                                    <button key={m.id} type="button" onClick={() => viewStudentPopup(`${m.firstName} ${m.lastName}`, m.id, m.phone, m.picUrl)} className="w-full text-left flex items-center gap-2.5 mt-2 bg-neutral-50 dark:bg-neutral-800/60 hover:bg-neutral-100 dark:hover:bg-neutral-700/80 p-2 rounded-xl border border-neutral-100 dark:border-neutral-700 transition-colors btn-liquid">
                                                                        <img src={m.picUrl} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-white dark:border-neutral-600 shadow-sm bg-white" loading="lazy" />
                                                                        <div className="flex flex-col leading-tight overflow-hidden">
                                                                            <p className="text-[10px] sm:text-xs font-bold text-neutral-700 dark:text-neutral-200 truncate">{m.id} {m.firstName} {m.lastName} {isSender && <span className="bg-cyan-500 text-white px-1.5 py-0.5 rounded-lg text-[8px] sm:text-[9px] font-bold ml-1">ผู้ส่ง</span>}</p>
                                                                        </div>
                                                                    </button>
                                                                );
                                                            });
                                                        })()}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-4 font-bold text-indigo-700 text-xs align-middle leading-tight">{workType}</td>
                                                <td className="px-2 py-4 text-left align-middle">{reasonHtml}</td>
                                                <td className="px-2 py-4 text-center align-middle">{badge}</td>
                                                <td className="px-2 py-4 text-center align-middle">
                                                    {fileUrl ? <a href={fileUrl} target="_blank" className="btn-liquid text-orange-800 bg-orange-50 px-2 py-2 rounded-lg text-[10px] font-extrabold border border-orange-200 inline-flex items-center justify-center whitespace-nowrap hover:bg-orange-100 transition-colors"><ExternalLink className="w-3.5 h-3.5 mr-1" />เปิดไฟล์</a> : <span className="text-neutral-300 text-xs">-</span>}
                                                </td>
                                                <td className="px-2 py-4 text-center align-middle">
                                                    {canCurrentUserReviewSubmission(item) ? (
                                                        <div className="grid gap-[0.4rem]">
                                                            <button type="button" onClick={() => openActionModal(studentIdStr, workType, status, reviewReason, 'อนุมัติ')} className="w-full min-h-[2.15rem] rounded-full border border-emerald-200 bg-gradient-to-b from-white to-emerald-50 text-emerald-700 shadow-sm font-bold text-[0.62rem] inline-flex items-center justify-center gap-1 transition-transform hover:-translate-y-[1px] active:scale-95"><Check className="w-3.5 h-3.5" /><span>อนุมัติ</span></button>
                                                            <button type="button" onClick={() => openActionModal(studentIdStr, workType, status, reviewReason, 'ไม่อนุมัติ')} className="w-full min-h-[2.15rem] rounded-full border border-rose-200 bg-gradient-to-b from-white to-rose-50 text-rose-700 shadow-sm font-bold text-[0.62rem] inline-flex items-center justify-center gap-1 transition-transform hover:-translate-y-[1px] active:scale-95"><X className="w-3.5 h-3.5" /><span>ไม่อนุมัติ</span></button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-neutral-400 bg-neutral-50 px-2 py-2 rounded-lg text-[10px] font-bold border border-neutral-200 inline-flex items-center justify-center whitespace-nowrap"><Eye className="w-3.5 h-3.5 mr-1" />ดูเท่านั้น</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </>
        )}
      </div>

      {isPassModalOpen && (
      <div className="modal-backdrop transition-opacity">
        <div className="modal-panel glass-panel">
            <button onClick={() => setIsPassModalOpen(false)} className="absolute top-5 right-5 text-neutral-400 hover:text-slate-700 dark:hover:text-white bg-slate-100/80 dark:bg-neutral-800/80 rounded-full p-2 transition-colors z-10 btn-liquid"><X className="w-4 h-4" /></button>
            <div className="p-6 sm:p-8 overflow-y-auto max-h-[85vh]">
                <div className="text-center mb-6">
                    <h2 className="text-xl font-bold text-neutral-800 dark:text-white tracking-wide">ตั้งค่าบัญชี</h2>
                    <p className="text-xs text-neutral-500 dark:text-slate-400 mt-1">เปลี่ยนรหัสผ่านอาจารย์</p>
                </div>
                <form className="space-y-4" onSubmit={handlePassSave}>
                    <div className="space-y-3.5 mt-2">
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 ml-1">รหัสผ่านเดิม <span className="text-red-500">*</span></label>
                        <input type="password" required className="w-full text-sm rounded-2xl p-3.5 glass-input outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-neutral-800" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} disabled={passSaving} />
                        
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 ml-1 mt-3">รหัสผ่านใหม่ <span className="text-red-500">*</span></label>
                        <input type="password" required className="w-full text-sm rounded-2xl p-3.5 glass-input outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-neutral-800" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={passSaving} />
                        
                        <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 ml-1 mt-3">ยืนยันรหัสผ่านใหม่ <span className="text-red-500">*</span></label>
                        <input type="password" required className="w-full text-sm rounded-2xl p-3.5 glass-input outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-neutral-800" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={passSaving} />
                    </div>
                    <button type="submit" disabled={passSaving} className="w-full btn-liquid bg-neutral-800 dark:bg-orange-600 text-white font-bold py-4 rounded-2xl hover:shadow-lg transition-all mt-6 flex items-center justify-center">
                        {passSaving ? <><svg className="animate-spin h-4 w-4 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> กำลังบันทึก...</> : <><Save className="w-4.5 h-4.5 mr-2" /> บันทึกข้อมูล</>}
                    </button>
                </form>
            </div>
        </div>
      </div>
      )}
    </div>
  );
}
