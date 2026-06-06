import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useProjectData } from '../hooks/useProjectData';
import { formatDateTimeTH, getVal, escapeHtml } from '../utils';
import type { SubmissionRow, ProjectRow } from '../types';
import {
  Eye,
  Moon,
  Sun,
  LogOut,
  BarChart2,
  FolderOpen,
  Hash,
  CheckCircle,
  XCircle,
  Clock,
  Info,
  User,
} from 'lucide-react';
import Swal from 'sweetalert2';
import PetitionDashboard from './PetitionDashboard';
import PetitionNavButton from '../components/petition/PetitionNavButton';
import type { PageView } from '../App';

interface Props {
  pageView: PageView;
  setPageView: (v: PageView) => void;
}

export default function ViewerDashboard({ pageView, setPageView }: Props) {
  const { user, theme, toggleTheme, logout } = useAuthStore();

  const [myAssignedProjects, setMyAssignedProjects] = useState<ProjectRow[]>([]);
  const [myAssignedSubmissions, setMyAssignedSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPermWarning, setShowPermWarning] = useState(false);

  // ── useProjectData: shared L3 cache ───────────────────────────
  const { data: rawData, loading: dataLoading } = useProjectData();

  useEffect(() => {
    setLoading(dataLoading);
    if (!rawData) return;

    const allProjects = rawData.projects || [];
    const allSubs     = rawData.submissions || [];
    const userEmail   = (user?.email || '').toLowerCase().trim();
    const userRole    = user?.role || '';

    if (userRole !== 'admin') setShowPermWarning(true);

    if (userRole === 'admin') {
      setMyAssignedProjects(allProjects);
      setMyAssignedSubmissions(allSubs);
    } else {
      let myProjectIds: string[] = [];
      allProjects.forEach(p => {
        const matchEmail = Object.values(p).some(val => val && val.toString().toLowerCase().trim() === userEmail);
        if (matchEmail) {
          const pid = getVal(p, ['รหัสโครงงาน', 'projectid', 'รหัสโปรเจกต์']);
          if (pid) myProjectIds.push(pid);
        }
      });
      myProjectIds = [...new Set(myProjectIds)];
      setMyAssignedProjects(allProjects.filter(p => myProjectIds.includes(getVal(p, ['รหัสโครงงาน', 'projectid']))));
      setMyAssignedSubmissions(allSubs.filter(s => myProjectIds.includes(getVal(s, ['รหัสโครงงาน', 'projectid']))));
    }
  }, [rawData, dataLoading, user]);

  const getProcessedImgUrl = (url: any, studentName: string) => {
    if (!url || url === '-' || url === '') return `https://ui-avatars.com/api/?name=${encodeURIComponent(studentName)}&background=f0f0f0&color=1a1a1a`;
    if (url.includes('drive.google.com')) {
      const match = url.match(/[-\w]{25,}/);
      if (match) return `https://drive.google.com/thumbnail?id=${match[0]}&sz=w500`;
    }
    return url;
  };

  const parseSubmissionStatus = (rawStatus: any) => {
    const status = String(rawStatus || '').replace(/\s+/g, '').toLowerCase();
    if (!status) return 'รอตรวจ';
    if (status.includes('ไม่อนุมัติ') || status.includes('ต้องแก้ไข') || status.includes('reject')) return 'ไม่อนุมัติ';
    if (status === 'อนุมัติ' || status === 'อนุมัติแล้ว' || status === 'approved') return 'อนุมัติ';
    return 'รอตรวจ';
  };

  // (data fetching moved to useProjectData hook above)

  if (pageView === 'petitions') {
    return <PetitionDashboard setPageView={setPageView} />;
  }

  const viewStudentPopup = (name: string, id: string, phoneStr: string, picUrl: string) => {
    Swal.fire({
      html: `<div class="text-center pt-2"><img src="${picUrl}" class="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover mx-auto mb-4 border-[4px] border-cyan-100 dark:border-neutral-800 shadow-md bg-white" loading="lazy"><h3 class="text-lg sm:text-xl font-bold text-neutral-800 dark:text-white leading-tight">${name}</h3><p class="text-xs sm:text-sm text-neutral-400 dark:text-neutral-500 mb-5 mt-1 font-medium">รหัสประจำตัวนักเรียน: ${id}</p><div class="bg-cyan-50 dark:bg-cyan-950/40 rounded-2xl p-3 sm:p-4 inline-block w-full border border-cyan-100 dark:border-cyan-900/50"><p class="text-[10px] sm:text-xs text-cyan-600 dark:text-cyan-400 mb-1.5 font-bold uppercase flex items-center justify-center"> เบอร์โทรติดต่อ</p><p class="text-base sm:text-lg font-extrabold text-cyan-800 dark:text-cyan-300 tracking-wide">${phoneStr || 'ไม่มีข้อมูลติดต่อ'}</p></div></div>`,
      showConfirmButton: true,
      confirmButtonText: 'ปิดหน้าต่าง',
      buttonsStyling: false,
      customClass: {
        popup: 'rounded-[1.5rem] w-[90%] max-w-sm border border-neutral-100 dark:border-neutral-800 shadow-2xl',
        confirmButton: 'bg-neutral-800 dark:bg-neutral-700 text-white font-bold py-3 px-8 rounded-full mt-5 hover:bg-neutral-900 transition-colors text-sm w-full btn-liquid'
      },
      backdrop: 'rgba(0, 0, 0, 0.4)'
    });
  };

  const finalProjIds = [...new Set(myAssignedProjects.map(p => getVal(p, ['รหัสโครงงาน'])).filter(id => id !== ''))];

  const generateStudentInfoHtml = (submission: any) => {
    let targetProjId = getVal(submission, ['รหัสโครงงาน', 'projectid']).toLowerCase();
    let targetStuId = getVal(submission, ['รหัสนักเรียน', 'studentid', 'รหัสประจำตัว']).toLowerCase();

    const groupMembers: any[] = [];
    for (const p of myAssignedProjects) {
      const rowProjId = getVal(p, ['รหัสโครงงาน']).toLowerCase();
      if (targetProjId !== '' && rowProjId === targetProjId) {
        const stuId = getVal(p, ['รหัสนักเรียน', 'studentid']);
        if (!groupMembers.find(m => m.id === stuId)) {
          const firstName = getVal(p, ['ชื่อ', 'firstname']);
          const picUrl = getProcessedImgUrl(getVal(p, ['รูปโปรไฟล์', 'pic']), firstName);
          groupMembers.push({
            id: stuId,
            firstName,
            lastName: getVal(p, ['นามสกุล', 'lastname']),
            // Use "เบอร์โทรศัพท์" (full name) not "เบอร์โทร" (partial)
            phone: getVal(p, ['เบอร์โทรศัพท์', 'เบอร์โทร', 'phone']).replace(/'/g, ''),
            picUrl,
          });
        }
      }
    }

    return (
      <div>
        <span className="font-extrabold text-neutral-800 dark:text-white bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-[10px] sm:text-xs shadow-sm flex items-center gap-1 w-fit">
          <Hash className="w-3 h-3 text-cyan-600" /> {getVal(submission, ['รหัสโครงงาน']) || '-'}
        </span>
        {groupMembers.map(m => {
          const isSender = m.id.toLowerCase() === targetStuId;
          return (
            <button key={m.id} type="button" onClick={() => viewStudentPopup(`${m.firstName} ${m.lastName}`, m.id, m.phone, m.picUrl)} className="w-full text-left flex items-center gap-2.5 mt-2 bg-neutral-50 dark:bg-neutral-800/60 hover:bg-neutral-100 dark:hover:bg-neutral-700/80 p-2 rounded-xl border border-neutral-100 dark:border-neutral-700 transition-colors btn-liquid">
              <img src={m.picUrl} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-white dark:border-neutral-600 shadow-sm bg-white" loading="lazy" />
              <div className="flex flex-col leading-tight overflow-hidden">
                <p className="text-[10px] sm:text-xs font-bold text-neutral-700 dark:text-neutral-200 truncate">
                  {m.id} {m.firstName} {m.lastName}
                  {isSender && <span className="bg-cyan-500 text-white px-1.5 py-0.5 rounded-lg text-[8px] sm:text-[9px] font-bold ml-1">ผู้ส่ง</span>}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const getStatusBadge = (projectSubs: SubmissionRow[], workType: string) => {
    const subs = projectSubs.filter(s => getVal(s, ['ประเภทงาน']) === workType);
    if (subs.length === 0) return <span className="px-3 py-1.5 rounded-full text-[9px] sm:text-[10px] font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-400 opacity-70 border border-neutral-200 dark:border-neutral-700">➖ ยังไม่ส่ง</span>;
    const parsedStatus = parseSubmissionStatus(getVal(subs[subs.length - 1], ['สถานะ', 'status']));
    if (parsedStatus === 'อนุมัติ') return <span className="px-3 py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-900/60 shadow-sm"><CheckCircle className="w-3.5 h-3.5 mr-1.5 opacity-80" /> อนุมัติ</span>;
    if (parsedStatus === 'ไม่อนุมัติ') return <span className="px-3 py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 flex items-center justify-center border border-rose-100 dark:border-rose-900/60 shadow-sm"><XCircle className="w-3.5 h-3.5 mr-1.5 opacity-80" /> ต้องแก้ไข</span>;
    return <span className="px-3 py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center border border-amber-100 dark:border-amber-900/60 shadow-sm"><Clock className="w-3.5 h-3.5 mr-1.5 opacity-80" /> รอตรวจ</span>;
  };

  const getSubmissionBadge = (status: string) => {
    if (status === 'อนุมัติ') return <span className="px-3 py-1.5 rounded-full text-[9px] sm:text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 shadow-sm flex items-center justify-center border border-emerald-100 dark:border-emerald-900/60"><CheckCircle className="w-3.5 h-3.5 mr-1.5 opacity-80" />อนุมัติแล้ว</span>;
    if (status === 'ไม่อนุมัติ') return <span className="px-3 py-1.5 rounded-full text-[9px] sm:text-[11px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 shadow-sm flex items-center justify-center border border-rose-100 dark:border-rose-900/60"><XCircle className="w-3.5 h-3.5 mr-1.5 opacity-80" />ไม่อนุมัติ</span>;
    return <span className="px-3 py-1.5 rounded-full text-[9px] sm:text-[11px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 shadow-sm flex items-center justify-center border border-amber-100 dark:border-amber-900/60"><Clock className="w-3.5 h-3.5 mr-1.5 opacity-80" />รอตรวจ</span>;
  };

  return (
    <div className="pb-10 app-shell transition-colors duration-300">

      {/* NAV — exact match to viewer.html */}
      <nav className="glass-panel border-b-0 shadow-sm sticky top-0 z-40 relative">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-cyan-500 to-blue-500"></div>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 px-4 py-4 mt-1">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-neutral-800 dark:text-white flex items-center tracking-wide">
                <Eye className="w-5 h-5 mr-2 text-cyan-500" /> ศูนย์ติดตามโครงงาน
              </h1>
              <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5 flex items-center font-medium">
                <User className="w-3.5 h-3.5 mr-1.5 opacity-80" /> ผู้ประเมิน/ที่ปรึกษา:&nbsp;
                <span className="font-bold text-cyan-600 dark:text-cyan-400">{user?.name || 'ผู้ประเมินโครงงาน'}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PetitionNavButton pageView={pageView} setPageView={setPageView} />
            <button onClick={toggleTheme} className="btn-liquid bg-neutral-100 dark:bg-neutral-800 p-2.5 rounded-full text-neutral-600 dark:text-neutral-300 outline-none hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-transparent dark:border-neutral-700">
              {theme === 'dark' ? <Sun className="w-4 h-4 text-orange-400" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={logout} className="text-xs sm:text-sm text-rose-600 dark:text-rose-400 font-bold bg-rose-50 dark:bg-rose-950/30 px-4 py-2 rounded-full border border-rose-100 dark:border-rose-900/50 flex items-center btn-liquid">
              <LogOut className="w-3.5 h-3.5 mr-1.5 opacity-90" /> ออกระบบ
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto mt-4 sm:mt-8 px-3 sm:px-4 space-y-4 sm:space-y-6">

        {/* Loading */}
        {loading && (
          <div className="text-center py-20 text-sm text-neutral-500 flex flex-col items-center glass-panel rounded-[2rem]">
            <svg className="animate-spin h-10 w-10 text-cyan-500 mb-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="font-medium tracking-wide">กำลังโหลดข้อมูลกลุ่มของคุณ...</span>
          </div>
        )}

        {/* Permission warning for non-admin */}
        {!loading && showPermWarning && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 p-4 rounded-[1.5rem] flex items-start gap-3 shadow-sm">
            <Info className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="flex-grow">
              <p className="text-sm sm:text-base text-blue-800 dark:text-blue-300 font-bold mb-1">สิทธิ์การเข้าถึงข้อมูล (Read-Only)</p>
              <p className="text-xs sm:text-sm text-blue-700/80 dark:text-blue-200/80">ระบบได้กรองเฉพาะรายชื่อกลุ่มโครงงานที่คุณรับผิดชอบมาแสดงเท่านั้น คุณสามารถติดตามสถานะความคืบหน้าของนักเรียนได้ <span className="font-bold underline">แต่ระบบจะสงวนสิทธิ์การดาวน์โหลดไฟล์เนื้อหาไว้ครับ</span></p>
            </div>
          </div>
        )}

        {/* Overview Table */}
        {!loading && (
          <div className="glass-panel rounded-[2rem] p-4 sm:p-7 relative overflow-hidden">
            <h2 className="text-base sm:text-lg font-bold text-neutral-800 dark:text-white mb-4 sm:mb-5 border-b border-neutral-100 dark:border-neutral-800 pb-3 flex items-center">
              <BarChart2 className="w-5 h-5 sm:w-6 sm:h-6 mr-2.5 text-cyan-500" /> ภาพรวมสถานะโครงงาน
            </h2>
            <div className="overflow-x-auto w-full pb-2">
              <table className="data-table w-full text-left">
                <thead className="text-[10px] sm:text-xs text-neutral-500">
                  <tr>
                    <th className="px-3 py-3 font-semibold uppercase tracking-wider min-w-[250px]">รหัสโครงงาน / ชื่อโครงงาน</th>
                    <th className="px-3 py-3 font-semibold uppercase tracking-wider min-w-[200px]">รายชื่อนักเรียนในกลุ่ม</th>
                    <th className="px-2 py-3 text-center font-semibold uppercase tracking-wider">โครงร่าง</th>
                    <th className="px-2 py-3 text-center font-semibold uppercase tracking-wider">ความก้าวหน้า</th>
                    <th className="px-2 py-3 text-center font-semibold uppercase tracking-wider">ฉบับสมบูรณ์</th>
                  </tr>
                </thead>
                <tbody id="overviewTableBody" className="text-neutral-700 dark:text-neutral-200 text-xs sm:text-sm">
                  {finalProjIds.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-neutral-500 font-medium">ไม่มีข้อมูลโครงงานที่ท่านดูแล</td></tr>
                  ) : (
                    finalProjIds.map(pid => {
                      const members = myAssignedProjects.filter(p => getVal(p, ['รหัสโครงงาน']) === pid);
                      let projectNameTH = members.length > 0 ? getVal(members[0], ['ชื่อโครงงาน', 'projectname']) : '-';
                      if (!projectNameTH || projectNameTH === '-') {
                        // Fallback: search for key that trims to "ชื่อโครงงาน" (handles trailing spaces)
                        if (members.length > 0) {
                          const entry = Object.entries(members[0]).find(([k]) => k.trim() === 'ชื่อโครงงาน');
                          if (entry) projectNameTH = String(entry[1] || '').trim();
                        }
                      }

                      const memberIds = members.map(m => getVal(m, ['รหัสนักเรียน', 'studentid']));
                      const projectSubs = myAssignedSubmissions.filter(s => s && (getVal(s, ['รหัสโครงงาน']) == pid || memberIds.includes(getVal(s, ['รหัสนักเรียน']))));

                      return (
                        <tr key={pid}>
                          <td className="px-3 py-4 align-top">
                            <div className="flex flex-col items-start gap-1">
                              <div className="font-extrabold text-neutral-800 dark:text-white bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs sm:text-sm shadow-sm">
                                <span className="text-cyan-600 dark:text-cyan-400">#</span> {pid}
                              </div>
                              <div className="text-xs sm:text-sm font-bold text-neutral-700 dark:text-neutral-200 mt-1 pl-1 whitespace-normal break-words w-full project-title-wrap">{projectNameTH}</div>
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            {members.map(m => {
                              const mId = getVal(m, ['รหัสนักเรียน', 'studentid']);
                              const mFName = getVal(m, ['ชื่อ', 'firstname']);
                              const mLName = getVal(m, ['นามสกุล', 'lastname']);
                              const mPhone = getVal(m, ['เบอร์โทรศัพท์', 'เบอร์โทร', 'phone']).replace(/'/g, '');
                              const pic = getProcessedImgUrl(getVal(m, ['รูปโปรไฟล์']), mFName);
                              return (
                                <button key={mId} type="button" onClick={() => viewStudentPopup(`${mFName} ${mLName}`, mId, mPhone, pic)} className="w-full text-left flex items-center gap-2.5 mb-2.5 bg-neutral-50 dark:bg-neutral-800/60 p-2 sm:p-2.5 rounded-2xl border border-neutral-100 dark:border-neutral-700 btn-liquid transition-colors">
                                  <img src={pic} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-white dark:border-neutral-600 shadow-sm bg-white" loading="lazy" />
                                  <div className="flex flex-col leading-tight overflow-hidden">
                                    <span className="text-[10px] sm:text-[11px] text-neutral-700 dark:text-neutral-200 font-bold truncate">{mId}</span>
                                    <span className="text-[9px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 font-medium truncate mt-0.5">{mFName} {mLName}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </td>
                          <td className="px-2 py-4 align-top text-center">{getStatusBadge(projectSubs, 'โครงร่าง (Proposal)')}</td>
                          <td className="px-2 py-4 align-top text-center">{getStatusBadge(projectSubs, 'รายงานความก้าวหน้า')}</td>
                          <td className="px-2 py-4 align-top text-center">{getStatusBadge(projectSubs, 'รายงานฉบับสมบูรณ์')}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* All Works Table */}
        {!loading && (
          <div className="glass-panel rounded-[2rem] p-4 sm:p-7 relative overflow-hidden">
            <h2 className="text-base sm:text-lg font-bold text-neutral-800 dark:text-white mb-4 sm:mb-5 border-b border-neutral-100 dark:border-neutral-800 pb-3 flex items-center">
              <FolderOpen className="w-5 h-5 sm:w-6 sm:h-6 mr-2.5 text-indigo-500" /> ประวัติการส่งงานทั้งหมด
            </h2>
            <div className="overflow-x-auto w-full pb-2">
              <table className="data-table w-full text-left">
                <thead className="text-[10px] sm:text-xs text-neutral-500">
                  <tr>
                    <th className="px-3 py-3 font-semibold uppercase tracking-wider">วันที่ส่ง</th>
                    <th className="px-3 py-3 font-semibold uppercase tracking-wider min-w-[200px]">ข้อมูลผู้ส่งและกลุ่ม</th>
                    <th className="px-3 py-3 font-semibold uppercase tracking-wider">ประเภทงาน</th>
                    <th className="px-3 py-3 text-left font-semibold uppercase tracking-wider min-w-[150px]">หมายเหตุ</th>
                    <th className="px-3 py-3 text-center font-semibold uppercase tracking-wider">สถานะ</th>
                  </tr>
                </thead>
                <tbody id="allWorksTableBody" className="text-neutral-700 dark:text-neutral-200 text-xs sm:text-sm">
                  {[...myAssignedSubmissions].reverse().length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-neutral-500 font-medium">ยังไม่มีประวัติการส่งงานจากกลุ่มที่ดูแล</td></tr>
                  ) : (
                    [...myAssignedSubmissions].reverse().map((item, idx) => {
                      const workType = getVal(item, ['ประเภทงาน']) || 'ไม่ระบุ';
                      const rawStatus = getVal(item, ['สถานะ', 'status']) || 'รออนุมัติ';
                      const parsedStatus = parseSubmissionStatus(rawStatus);
                      const reason = getVal(item, ['หมายเหตุ', 'เหตุผล']);
                      const { date, time } = formatDateTimeTH(item.Timestamp);

                      return (
                        <tr key={idx}>
                          <td className="px-3 py-4 align-middle opacity-80">
                            <div className="font-bold text-neutral-800 dark:text-neutral-200">{date}</div>
                            <div className="text-[9px] text-neutral-400 mt-0.5">{time} น.</div>
                          </td>
                          <td className="px-3 py-3 align-middle">{generateStudentInfoHtml(item)}</td>
                          <td className="px-3 py-4 font-bold text-indigo-700 dark:text-indigo-400 text-[10px] sm:text-sm align-middle leading-tight">{workType}</td>
                          <td className="px-3 py-4 text-left align-middle">
                            {reason
                              ? <div className="text-[10px] sm:text-[11px] text-rose-700 dark:text-rose-300 font-medium bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl inline-block w-full max-w-[200px] whitespace-normal break-words border border-rose-100 dark:border-rose-900/60 text-left shadow-inner">{escapeHtml(reason)}</div>
                              : <span className="text-neutral-300 dark:text-neutral-700">-</span>
                            }
                          </td>
                          <td className="px-3 py-4 text-center align-middle">{getSubmissionBadge(parsedStatus)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
