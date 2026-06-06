import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiUpdateStatus } from '../services/api';
import { useProjectData } from '../hooks/useProjectData';
import {
  formatDateTimeTH,
  escapeHtml
} from '../utils';
import type { SubmissionRow, ProjectRow, WorkType } from '../types';
import {
  Search,
  Check,
  X,
  Moon,
  Sun,
  LogOut,
  BarChart2,
  Folder,
  Shield,
  FileText,
  FileX,
  PenTool,
  CheckCircle,
  XCircle,
  Clock,
  } from 'lucide-react';
import Swal from 'sweetalert2';
import PetitionDashboard from './PetitionDashboard';
import PetitionNavButton from '../components/petition/PetitionNavButton';
import type { PageView } from '../App';

interface Props { pageView: PageView; setPageView: (v: PageView) => void; }
export default function AdminDashboard({ pageView, setPageView }: Props) {
  const { theme, toggleTheme, logout } = useAuthStore();

  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [projectRows, setProjectRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // ── useProjectData: shared L3 cache ───────────────────────────
  const { data: rawData, loading: dataLoading, refetch } = useProjectData();

  useEffect(() => {
    setLoading(dataLoading);
    if (!rawData) return;
    setProjectRows(rawData.projects || []);
    setSubmissions(rawData.submissions || []);
  }, [rawData, dataLoading]);

    

  // FIX Vuln 6: Only allow Google Drive file URLs to prevent open redirect / phishing.
  const isValidFileUrl = (url: any): boolean => {
    const value = (url || '').toString().trim();
    if (!value || value === '-' || value === 'undefined' || value === 'null') return false;
    try {
      const parsed = new URL(value);
      return (
        parsed.protocol === 'https:' &&
        (parsed.hostname === 'drive.google.com' || parsed.hostname === 'docs.google.com')
      );
    } catch {
      return false;
    }
  };

  const getProcessedImgUrl = (url: any, studentName: string) => {
    if (!url || url === "-") return `https://ui-avatars.com/api/?name=${encodeURIComponent(studentName)}&background=random`;
    if (url.includes('drive.google.com')) { 
        const match = url.match(/[-\w]{25,}/); 
        if (match) return `https://drive.google.com/thumbnail?id=${match[0]}&sz=w500`; 
    }
    return url;
  };

  // (data fetching moved to useProjectData hook above)

  if (pageView === 'petitions') {
        return <PetitionDashboard setPageView={setPageView} />;
    }

  const viewStudentPopup = (name: string, id: string, phoneStr: string, picUrl: string) => {
    Swal.fire({
        html: `<div class="text-center pt-2"><img src="${picUrl}" class="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover mx-auto mb-4 border-[4px] border-orange-50 dark:border-orange-900/50 shadow-md bg-white" loading="lazy"><h3 class="text-lg sm:text-xl font-bold text-slate-800 dark:text-white leading-tight">${name}</h3><p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-5 mt-1">รหัสประจำตัว: ${id}</p><div class="bg-orange-50 dark:bg-orange-900/30 rounded-2xl p-3 sm:p-4 inline-block w-full max-w-[200px] border border-orange-100 dark:border-orange-800"><p class="text-[10px] sm:text-xs text-orange-600 dark:text-orange-400 mb-1 font-semibold uppercase flex items-center justify-center"><i data-lucide="phone" class="w-3 h-3 mr-1"></i> เบอร์โทรติดต่อ</p><p class="text-base sm:text-lg font-bold text-orange-800 dark:text-orange-300">${phoneStr || 'ไม่มีข้อมูล'}</p></div></div>`,
        showConfirmButton: true, confirmButtonText: 'ปิดหน้าต่าง', confirmButtonColor: '#334155', customClass: { popup: 'swal-admin rounded-[2rem] p-4 sm:p-6' }, backdrop: `rgba(15, 23, 42, 0.7)`
    });
  };

  const getFilteredData = () => {
    const query = searchQuery.toLowerCase().trim();
    const filteredProjects = projectRows.filter(p => {
        // Use named keys instead of positional index (col 4 = สาขา, col 5 = รหัสโครงงาน)
        const pid = (p['รหัสโครงงาน'] || "").toString().toLowerCase();
        const sid = (p['รหัสนักเรียน'] || "").toString().toLowerCase();
        const name = `${p['ชื่อ'] || ""} ${p['นามสกุล'] || ""}`.toLowerCase();
        return pid.includes(query) || sid.includes(query) || name.includes(query);
    });
    const filteredProjectIds = [...new Set(filteredProjects.map(p => {
        return (p['รหัสโครงงาน'] || '').toString();
    }).filter(id => id))];
    
    const filteredSubmissions = submissions.filter(s => {
        const pid = (s['รหัสโครงงาน'] || s['projectid'] || "").toString().toLowerCase();
        const sid = (s['รหัสนักเรียน'] || s['studentid'] || "").toString().toLowerCase();
        const name = `${s['ชื่อ'] || s['firstname'] || ""} ${s['นามสกุล'] || s['lastname'] || ""}`.toLowerCase();
        return pid.includes(query) || sid.includes(query) || name.includes(query);
    });
    
    const pendingPetitions = filteredSubmissions.filter(s => {
        let wt = (s['ประเภทงาน'] || s['ประเภทงาน (โครงร่าง/ความก้าวหน้า/สมบูรณ์)'] || "").toString().trim();
        let st = (s['สถานะ'] || s['สถานะ (รออนุมัติ/อนุมัติ/ไม่อนุมัติ)'] || "").toString().trim();
        return wt === "แบบคำร้อง" && st === "รออนุมัติ";
    });

    return { filteredProjectIds, filteredSubmissions, pendingPetitions };
  };

  const { filteredProjectIds, filteredSubmissions, pendingPetitions } = getFilteredData();

  const generateStudentInfoHtml = (submission: any) => {
    let targetProjId = (submission['รหัสโครงงาน'] || submission['projectid'] || "").toString().replace(/\s/g, '').toLowerCase(); 
    let targetStuId = (submission['รหัสนักเรียน'] || submission['studentid'] || "").toString().replace(/\s/g, '').toLowerCase(); 
    
    if (targetProjId === "") {
        for (let i = 0; i < projectRows.length; i++) {
            const sid = (projectRows[i]['รหัสนักเรียน'] || "").toString().replace(/\s/g, '').toLowerCase();
            if (sid === targetStuId) {
                targetProjId = (projectRows[i]['รหัสโครงงาน'] || "").toString().replace(/\s/g, '').toLowerCase(); break;
            }
        }
    }

    let groupMembers: any[] = [];
    for (let i = 0; i < projectRows.length; i++) {
        const p = projectRows[i];
        let rowProjId = (p['รหัสโครงงาน'] || "").toString().replace(/\s/g, '').toLowerCase();
        let rowStuId = (p['รหัสนักเรียน'] || "").toString().replace(/\s/g, '').toLowerCase();
        let isMatch = false;
        if (targetProjId !== "" && rowProjId === targetProjId) isMatch = true; 
        else if (targetStuId !== "" && rowStuId === targetStuId) isMatch = true;
        
        if (isMatch && rowStuId !== "") {
            let originalStuId = (p['รหัสนักเรียน'] || "").toString().trim();
            if (!groupMembers.find(m => m.id === originalStuId)) {
                // Find phone: key is "เบอร์โทรศัพท์" (may have trailing space)
                const phoneVal = Object.entries(p).find(([k]) => k.trim() === 'เบอร์โทรศัพท์')?.[1] || '';
                // Find profile pic: key is "รูปโปรไฟล์ " (trailing space)
                const picVal = Object.entries(p).find(([k]) => k.trim() === 'รูปโปรไฟล์')?.[1] || '';
                groupMembers.push({
                    id: originalStuId, 
                    firstName: (p['ชื่อ'] || "").toString().trim(), 
                    lastName: (p['นามสกุล'] || "").toString().trim(),
                    phone: phoneVal.toString().replace(/'/g, ''),
                    picUrl: getProcessedImgUrl(picVal.toString().trim(), (p['ชื่อ'] || "").toString().trim())
                });
            }
        }
    }

    return (
        <div>
            <span className="font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-2 sm:px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-[10px] sm:text-xs shadow-sm">
                {submission['รหัสโครงงาน'] || submission['projectid'] || '-'}
            </span>
            {groupMembers.map(m => {
                let isSender = (m.id.toLowerCase() === targetStuId);
                return (
                    <button key={m.id} type="button" onClick={() => viewStudentPopup(`${m.firstName} ${m.lastName}`, m.id, m.phone, m.picUrl)} className="w-full text-left flex items-center gap-2 mt-2 bg-orange-50 dark:bg-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-800/50 p-2 sm:p-2.5 rounded-xl border border-orange-100 dark:border-orange-800 transition-colors btn-liquid">
                        <img src={m.picUrl} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-white dark:border-slate-600 shadow-sm bg-white" loading="lazy" />
                        <div className="flex flex-col leading-tight overflow-hidden">
                            <p className="text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                                {m.id} {m.firstName} {m.lastName}
                                {isSender && <span className="bg-orange-500 text-white px-1.5 py-0.5 rounded-lg text-[8px] sm:text-[9px] font-bold ml-1">ผู้ส่ง</span>}
                            </p>
                        </div>
                    </button>
                );
            })}
        </div>
    );
  };

  const updateStatus = async (studentId: string, workType: string, newStatus: string) => {
    let reasonText = '';
    
    if (newStatus === 'ไม่อนุมัติ') {
        const result = await Swal.fire({
            title: 'ยืนยันผลการตรวจสอบ?',
            html: `คุณต้องการปรับสถานะเป็น <br><b class="text-rose-500 text-lg sm:text-xl">${newStatus}</b> ใช่หรือไม่?<br><br><div class="text-left text-sm text-slate-600 font-bold mb-2">ระบุเหตุผลที่ต้องแก้ไข (ถ้ามี):</div>`,
            icon: 'question',
            input: 'textarea',
            inputPlaceholder: 'พิมพ์เหตุผลการไม่อนุมัติที่นี่... (ไม่บังคับ)',
            showCancelButton: true,
            confirmButtonColor: '#f43f5e',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ยืนยันไม่อนุมัติ',
            cancelButtonText: 'ยกเลิก',
            customClass: {
                input: 'rounded-xl border-slate-300 focus:ring-rose-500 focus:border-rose-500 text-sm p-3 shadow-sm',
                popup: 'swal-admin'
            }
        });
        if (!result.isConfirmed) return;
        reasonText = result.value || '';
    } else {
        const result = await Swal.fire({
            title: `ยืนยันผลการตรวจสอบ?`,
            html: `คุณต้องการปรับสถานะเป็น <br><b class="text-emerald-500 text-lg sm:text-xl">${newStatus}</b> ใช่หรือไม่?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#10b981',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ยืนยัน',
            cancelButtonText: 'ยกเลิก',
            customClass: { popup: 'swal-admin' }
        });
        if (!result.isConfirmed) return;
    }

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }, customClass: { popup: 'swal-admin' } });
    try {
        const res = await apiUpdateStatus({
            studentId,
            projectId: '', // Backend handles finding it
            workType: workType as WorkType,
            status: newStatus as any,
            reason: reasonText,
        });
        if (res.status === 'success') { 
            await Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', showConfirmButton: false, timer: 1500, customClass: { popup: 'swal-admin' } }); 
            refetch(); 
        } else {
            throw new Error(res.message);
        }
    } catch (error: any) { 
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: error.message, confirmButtonColor: '#f97316', customClass: { popup: 'swal-admin' } }); 
    }
  };

  return (
    <div className="pb-10 app-shell transition-colors">
      <nav className="glass-panel border-b-0 shadow-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 px-4 py-4">
              <div className="flex items-center gap-4">
                  <div>
                      <h1 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white flex items-center"><Shield className="w-5 h-5 mr-2 text-orange-600 dark:text-orange-400" /> Administrator</h1>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">ผู้ดูแลระบบ: โครงการ วมว. มน.</p>
                  </div>
              </div>
              <div className="flex items-center gap-2">
                <PetitionNavButton pageView={pageView} setPageView={setPageView} />
                  <button onClick={toggleTheme} className="btn-liquid bg-slate-200/50 dark:bg-slate-700/50 p-2.5 rounded-full text-slate-700 dark:text-slate-200 outline-none hover:text-orange-500">
                      {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  </button>
                  <button onClick={logout} className="text-xs sm:text-sm text-red-600 dark:text-red-400 font-medium bg-red-50/50 dark:bg-red-900/20 px-4 py-2.5 rounded-xl border border-red-100 dark:border-red-800 flex items-center btn-liquid"><LogOut className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">ออกจากระบบ</span></button>
              </div>
          </div>
      </nav>

      <div className="max-w-7xl mx-auto mt-4 sm:mt-8 px-3 sm:px-4 space-y-4 sm:space-y-6">

          <div className="glass-panel rounded-3xl p-4 sm:p-6 flex flex-col items-center border-t-4 border-t-orange-500">
              <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white mb-4 w-full flex items-center"><Search className="w-5 h-5 mr-2" /> ค้นหาข้อมูลนักเรียน / โครงงาน</h2>
              <div className="relative w-full">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Search className="h-5 w-5 text-slate-400" /></div>
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="พิมพ์ รหัสโครงงาน, รหัสนักเรียน หรือ ชื่อ-นามสกุล..." className="w-full pl-11 pr-4 py-3.5 sm:py-4 text-sm sm:text-base rounded-2xl glass-input focus:ring-4 focus:ring-orange-100 dark:focus:ring-orange-900 outline-none transition-all font-medium" />
              </div>
          </div>

          {loading && (
              <div className="text-center py-10 sm:py-16 text-sm text-slate-500 flex flex-col items-center glass-panel rounded-3xl"><svg className="animate-spin h-6 w-6 sm:h-8 sm:w-8 text-orange-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>กำลังโหลดข้อมูลทั้งระบบ...</div>
          )}

          {!loading && (
              <>
                  <div className="glass-panel rounded-3xl p-4 sm:p-6 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 sm:w-1.5 h-full bg-rose-500"></div>
                      <h2 className="text-base sm:text-lg font-bold text-rose-600 dark:text-rose-400 mb-4 sm:mb-5 border-b border-slate-200 dark:border-slate-700 pb-2 sm:pb-3 flex items-center ml-2"><span className="bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-xs sm:text-sm mr-2 shadow-sm font-black">{pendingPetitions.length}</span> แบบคำร้อง รอการตรวจสอบจาก Admin</h2>
                      <div className="overflow-x-auto w-full pb-2">
                          <table className="data-table w-full text-left">
                              <thead className="admin-table-head uppercase border-b text-[10px] sm:text-sm"><tr><th className="px-2 py-3 sm:px-4 sm:py-4 font-semibold">เวลา</th><th className="px-2 py-3 sm:px-4 sm:py-4 font-semibold min-w-[150px]">ข้อมูลนักเรียน</th><th className="px-2 py-3 sm:px-4 sm:py-4 font-semibold">ประเภทงาน</th><th className="px-2 py-3 sm:px-4 sm:py-4 text-center font-semibold">ไฟล์แนบ</th><th className="px-2 py-3 sm:px-4 sm:py-4 text-center font-semibold">ดำเนินการ</th></tr></thead>
                              <tbody>
                                  {pendingPetitions.length === 0 ? (
                                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-xs sm:text-sm">ไม่มีแบบคำร้องที่รอการตรวจสอบ</td></tr>
                                  ) : (
                                      [...pendingPetitions].reverse().map((item, idx) => {
                                          const workType = item['ประเภทงาน'] || item['ประเภทงาน (โครงร่าง/ความก้าวหน้า/สมบูรณ์)'] || 'ไม่ระบุ';
                                          const petitionFileUrl = (item['URL ไฟล์เล่ม'] || '').toString().trim();
                                          return (
                                              <tr key={idx} className="border-b border-rose-100 dark:border-slate-700/50 hover:bg-rose-50/50 dark:hover:bg-rose-900/20 transition-colors">
                                                  <td className="px-2 py-4 sm:px-4 sm:py-5 text-[10px] sm:text-xs text-slate-500 align-middle">
                                                      {(() => {
                                                          const { date, time } = formatDateTimeTH(item.Timestamp);
                                                          return <>{date}<br/><span className="text-[9px] sm:text-[10px] opacity-70">{time} น.</span></>;
                                                      })()}
                                                  </td>
                                                  <td className="px-2 py-3 sm:px-4 sm:py-4 align-middle">{generateStudentInfoHtml(item)}</td>
                                                  <td className="px-2 py-4 sm:px-4 sm:py-5 font-bold text-rose-600 dark:text-rose-400 text-[10px] sm:text-sm align-middle leading-tight">{workType}</td>
                                                  <td className="px-2 py-4 sm:px-4 sm:py-5 text-center align-middle">
                                                      {isValidFileUrl(petitionFileUrl) ? (
                                                          <a href={petitionFileUrl} target="_blank" rel="noopener noreferrer" className="btn-liquid bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-3 py-2 rounded-lg text-[9px] sm:text-xs font-bold border border-orange-100 dark:border-orange-800 flex items-center justify-center mx-auto w-max"><FileText className="w-4 h-4 mr-1.5" />ไฟล์คำร้อง</a>
                                                      ) : (
                                                          <span className="inline-flex items-center justify-center mx-auto px-3 py-2 rounded-lg text-[9px] sm:text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-400 border border-slate-100 dark:border-slate-700"><FileX className="w-4 h-4 mr-1.5" />ไม่มีไฟล์แนบ</span>
                                                      )}
                                                  </td>
                                                  <td className="px-2 py-4 sm:px-4 sm:py-5 text-center align-middle">
                                                      <div className="flex flex-col gap-2">
                                                          <button onClick={() => updateStatus(item['รหัสนักเรียน'] as string, workType as string, 'อนุมัติ')} className="w-full btn-liquid btn-approve px-2 py-2 rounded-lg text-[10px] sm:text-xs font-bold flex items-center justify-center"><Check className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />อนุมัติ</button>
                                                          <button onClick={() => updateStatus(item['รหัสนักเรียน'] as string, workType as string, 'ไม่อนุมัติ')} className="w-full btn-liquid btn-reject px-2 py-2 rounded-lg text-[10px] sm:text-xs font-bold flex items-center justify-center"><X className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />ไม่อนุมัติ</button>
                                                      </div>
                                                  </td>
                                              </tr>
                                          )
                                      })
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>

                  <div className="glass-panel rounded-3xl p-4 sm:p-6 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 sm:w-1.5 h-full bg-orange-500"></div>
                      <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white mb-3 sm:mb-5 border-b border-slate-200 dark:border-slate-700 pb-2 sm:pb-3 flex items-center ml-2"><BarChart2 className="w-5 h-5 sm:w-6 sm:h-6 mr-2 text-orange-600 dark:text-orange-400" /> ภาพรวมสถานะโครงงานทั้งหมดในระบบ</h2>
                      <div className="overflow-x-auto w-full pb-2">
                          <table className="data-table w-full text-left">
                              <thead className="admin-table-head uppercase border-b text-[10px] sm:text-sm"><tr><th className="px-2 py-3 sm:px-4 sm:py-4 font-semibold whitespace-nowrap">รหัสโครงงาน</th><th className="px-2 py-3 sm:px-4 sm:py-4 font-semibold min-w-[150px]">นักเรียนในกลุ่ม</th><th className="px-2 py-3 sm:px-4 sm:py-4 text-center font-semibold">โครงร่าง</th><th className="px-2 py-3 sm:px-4 sm:py-4 text-center font-semibold">ความก้าวหน้า</th><th className="px-2 py-3 sm:px-4 sm:py-4 text-center font-semibold">ฉบับสมบูรณ์</th></tr></thead>
                              <tbody>
                                  {filteredProjectIds.length === 0 ? (
                                      <tr><td colSpan={5} className="px-4 py-10 sm:py-16 text-center text-slate-500">ไม่พบข้อมูล</td></tr>
                                  ) : (
                                      filteredProjectIds.map((pid: any) => {
                                          const members = projectRows.filter(p => {
                                              return (p['รหัสโครงงาน'] || '') === pid;
                                          });
                                          const memberIds = members.map(m => {
                                              return m['รหัสนักเรียน'] || '';
                                          });
                                          const projectSubs = submissions.filter(s => s && ((s['รหัสโครงงาน'] || s['projectid']) == pid || memberIds.includes(s['รหัสนักเรียน'] || s['studentid'])));
                                          
                                          const getStatusBadge = (workType: string) => {
                                              const subs = projectSubs.filter(s => (s['ประเภทงาน'] || s['ประเภทงาน (โครงร่าง/ความก้าวหน้า/สมบูรณ์)']) === workType);
                                              if (subs.length === 0) return <span className="px-2 py-1 rounded-lg text-[9px] sm:text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-400 opacity-60">➖ ยังไม่ส่ง</span>;
                                              const status = subs[subs.length - 1]['สถานะ'] || subs[subs.length - 1]['สถานะ (รออนุมัติ/อนุมัติ/ไม่อนุมัติ)'];
                                              if (status === 'อนุมัติ') return <span className="px-2 py-1 rounded-lg text-[9px] sm:text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center"><CheckCircle className="w-3 h-3 mr-1" /> อนุมัติ</span>;
                                              if (status === 'ไม่อนุมัติ') return <span className="px-2 py-1 rounded-lg text-[9px] sm:text-[10px] font-bold bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 flex items-center justify-center"><XCircle className="w-3 h-3 mr-1" /> ไม่อนุมัติ</span>;
                                              return <span className="px-2 py-1 rounded-lg text-[9px] sm:text-[10px] font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex items-center justify-center"><Clock className="w-3 h-3 mr-1" /> รออนุมัติ</span>;
                                          };

                                          return (
                                              <tr key={pid} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-orange-50/30 dark:hover:bg-orange-900/20 transition-colors">
                                                  <td className="px-2 py-4 sm:px-4 sm:py-5 align-top font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm border-r border-slate-50 dark:border-slate-700/50">{pid}</td>
                                                  <td className="px-2 py-2 sm:px-4 sm:py-3 align-top border-r border-slate-50 dark:border-slate-700/50">
                                                      {members.map((m: any) => {
                                                          const id = m['รหัสนักเรียน'] || '';
                                                          const fname = m['ชื่อ'] || '';
                                                          const lname = m['นามสกุล'] || '';
                                                          // Phone: key "เบอร์โทรศัพท์" may have trailing space
                                                          const phone = (Object.entries(m).find(([k]) => k.trim() === 'เบอร์โทรศัพท์')?.[1] || '').toString().replace(/'/g, '');
                                                          // Profile pic: key "รูปโปรไฟล์ " has trailing space
                                                          const picRaw = (Object.entries(m).find(([k]) => k.trim() === 'รูปโปรไฟล์')?.[1] || '').toString().trim();
                                                          const pic = getProcessedImgUrl(picRaw, fname);
                                                          return (
                                                              <button key={id} type="button" onClick={() => viewStudentPopup(`${fname} ${lname}`, id, phone, pic)} className="w-full text-left flex items-center gap-2 sm:gap-3 mb-2 bg-slate-50 dark:bg-slate-800/50 p-2 sm:p-2.5 rounded-xl border border-slate-100 dark:border-slate-700 btn-liquid transition-colors">
                                                                  <img src={pic} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border-2 border-white dark:border-slate-600 shadow-sm" loading="lazy" />
                                                                  <div className="flex flex-col leading-tight overflow-hidden">
                                                                      <span className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-200 font-bold truncate">{id}</span>
                                                                      <span className="text-[9px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">{fname} {lname}</span>
                                                                  </div>
                                                              </button>
                                                          );
                                                      })}
                                                  </td>
                                                  <td className="px-2 py-4 sm:px-4 sm:py-5 align-top text-center">{getStatusBadge('โครงร่าง (Proposal)')}</td>
                                                  <td className="px-2 py-4 sm:px-4 sm:py-5 align-top text-center">{getStatusBadge('รายงานความก้าวหน้า')}</td>
                                                  <td className="px-2 py-4 sm:px-4 sm:py-5 align-top text-center">{getStatusBadge('รายงานฉบับสมบูรณ์')}</td>
                                              </tr>
                                          )
                                      })
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>

                  <div className="glass-panel rounded-3xl p-4 sm:p-6 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 sm:w-1.5 h-full bg-amber-400"></div>
                      <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white mb-3 sm:mb-5 border-b border-slate-200 dark:border-slate-700 pb-2 sm:pb-3 flex items-center ml-2"><Folder className="w-5 h-5 sm:w-6 sm:h-6 mr-2 text-slate-700 dark:text-slate-300" /> ประวัติการส่งงาน/คำร้องทั้งหมด</h2>
                      <div className="overflow-x-auto w-full pb-2">
                          <table className="data-table w-full text-left">
                              <thead className="admin-table-head uppercase border-b text-[10px] sm:text-sm"><tr><th className="px-2 py-3 sm:px-4 sm:py-4 font-semibold">เวลา</th><th className="px-2 py-3 sm:px-4 sm:py-4 font-semibold min-w-[150px]">ข้อมูลนักเรียน</th><th className="px-2 py-3 sm:px-4 sm:py-4 font-semibold">ประเภทงาน</th><th className="px-2 py-3 sm:px-4 sm:py-4 text-center font-semibold">หมายเหตุ</th><th className="px-2 py-3 sm:px-4 sm:py-4 text-center font-semibold">ไฟล์แนบ</th><th className="px-2 py-3 sm:px-4 sm:py-4 text-center font-semibold">สถานะปัจจุบัน</th></tr></thead>
                              <tbody>
                                  {filteredSubmissions.length === 0 ? (
                                      <tr><td colSpan={6} className="px-4 py-10 sm:py-16 text-center text-slate-500 text-xs sm:text-sm">ไม่พบข้อมูล</td></tr>
                                  ) : (
                                      [...filteredSubmissions].reverse().map((item, idx) => {
                                          const workType = item['ประเภทงาน'] || item['ประเภทงาน (โครงร่าง/ความก้าวหน้า/สมบูรณ์)'] || 'ไม่ระบุ';
                                          const status = item['สถานะ'] || item['สถานะ (รออนุมัติ/อนุมัติ/ไม่อนุมัติ)'] || 'รออนุมัติ';
                                          
                                          let reasonKey = Object.keys(item).find(k => String(k).includes('หมายเหตุ') || String(k).includes('เหตุผล'));
                                          let reason = (reasonKey && item[reasonKey as keyof SubmissionRow]) ? item[reasonKey as keyof SubmissionRow]?.toString().trim() : '';

                                          const reportFileUrl = (item['URL ไฟล์เล่ม'] || '').toString().trim();
                                          const signatureFileUrl = (item['URL ลายเซ็น'] || '').toString().trim();
                                          let fileReportLabel = workType === 'แบบคำร้อง' ? 'ไฟล์คำร้อง' : 'รูปเล่ม';
                                          
                                          return (
                                              <tr key={idx} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                                                  <td className="px-2 py-4 sm:px-4 sm:py-5 text-[10px] sm:text-xs text-slate-500 align-middle">
                                                      {(() => {
                                                          const { date, time } = formatDateTimeTH(item.Timestamp);
                                                          return <>{date}<br/><span className="text-[9px] sm:text-[10px] opacity-70">{time} น.</span></>;
                                                      })()}
                                                  </td>
                                                  <td className="px-2 py-3 sm:px-4 sm:py-4 align-middle">{generateStudentInfoHtml(item)}</td>
                                                  <td className="px-2 py-4 sm:px-4 sm:py-5 font-bold text-orange-700 dark:text-orange-400 text-[10px] sm:text-sm align-middle leading-tight">{workType}</td>
                                                  <td className="px-2 py-4 sm:px-4 sm:py-5 text-center align-middle">
                                                      {reason ? <div className="text-[9px] sm:text-[11px] text-rose-500 font-medium bg-rose-50 dark:bg-rose-900/30 p-1.5 rounded-md inline-block w-full max-w-[150px] whitespace-normal break-words" title={reason}>{escapeHtml(reason)}</div> : <span className="text-slate-300">-</span>}
                                                  </td>
                                                  <td className="px-2 py-4 sm:px-4 sm:py-5 text-center align-middle">
                                                      <div className="flex flex-col gap-1.5">
                                                          {isValidFileUrl(reportFileUrl) ? (
                                                              <a href={reportFileUrl} target="_blank" rel="noopener noreferrer" className="btn-liquid bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-1.5 rounded-lg text-[9px] sm:text-xs font-bold border border-orange-100 dark:border-orange-800 flex items-center justify-center"><FileText className="w-3 h-3 mr-1" />{fileReportLabel}</a>
                                                          ) : (
                                                              <span className="inline-flex items-center justify-center px-2 py-1.5 rounded-lg text-[9px] sm:text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-400 border border-slate-100 dark:border-slate-700"><FileX className="w-3 h-3 mr-1" />ไม่มีไฟล์แนบ</span>
                                                          )}
                                                          {workType !== 'แบบคำร้อง' && isValidFileUrl(signatureFileUrl) && (
                                                              <a href={signatureFileUrl} target="_blank" rel="noopener noreferrer" className="btn-liquid bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-1.5 rounded-lg text-[9px] sm:text-xs font-bold border border-amber-100 dark:border-amber-800 flex items-center justify-center"><PenTool className="w-3 h-3 mr-1" />หน้าลายเซ็น</a>
                                                          )}
                                                      </div>
                                                  </td>
                                                  <td className="px-2 py-4 sm:px-4 sm:py-5 text-center align-middle">
                                                      {status === 'อนุมัติ' ? (
                                                          <span className="px-2 py-1 rounded-lg text-[9px] sm:text-[11px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 shadow-sm flex items-center justify-center"><CheckCircle className="w-3 h-3 mr-1" />อนุมัติแล้ว</span>
                                                      ) : status === 'ไม่อนุมัติ' ? (
                                                          <span className="px-2 py-1 rounded-lg text-[9px] sm:text-[11px] font-bold bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 shadow-sm flex items-center justify-center"><XCircle className="w-3 h-3 mr-1" />ไม่อนุมัติ</span>
                                                      ) : (
                                                          <span className="px-2 py-1 rounded-lg text-[9px] sm:text-[11px] font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 shadow-sm flex items-center justify-center"><Clock className="w-3 h-3 mr-1" />รออนุมัติ</span>
                                                      )}
                                                  </td>
                                              </tr>
                                          )
                                      })
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </>
          )}

      </div>
    </div>
  );
}
