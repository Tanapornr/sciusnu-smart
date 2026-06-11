import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { useAuthStore } from '../store/authStore';
import {
  apiSubmit,
  apiUpdateProfile,
  uploadFileToDrive,
} from '../services/api';
import { useProjectData } from '../hooks/useProjectData';
import {
  parseProjectRow,
  extractGroupMembers,
  parseSubmissionStatus,
  formatDateTimeTH,
  getSubmissionFileUrl,
  getSubmissionReason,
  getActiveRejectTypes,
  resizeProfileImage,
  getVal
} from '../utils';
import type {
  ProjectInfo,
  GroupMember,
  SubmissionRow,
  WorkType,
} from '../types';
import {
  BookOpen,
  History,
  Camera,
  ChevronRight,
  AlertTriangle,
  FileText,
  UploadCloud,
  LogOut,
  FolderDown,
  TrendingUp,
  Settings,
  Hash,
  User as UserIcon,
  Users,
  GraduationCap,
  UserPlus,
  School,
  Truck,
  Check,
  X,
  Plus,
  Minus,
  Save,
  Moon,
  Sun,
  FileUp,
  CloudUpload,
  Clock3,
  CheckCircle2,
  AlertCircle,
  Smile,
  ChevronDown,
  Clock
} from 'lucide-react';
import Swal from 'sweetalert2';
import PetitionDashboard from './PetitionDashboard';
import PetitionNavButton from '../components/petition/PetitionNavButton';
import type { PageView } from '../App';

// ── Downloadable form templates (.docx) ──────────────────────────
// Replace these with your actual Google Drive / hosted file URLs.
const FORM_DOWNLOAD_URLS: Record<string, string> = {
  proposal: 'https://docs.google.com/document/d/1CNu3RLyMV_5Ed2DGhpeBDqequcLaKOtr/edit?usp=sharing&ouid=105067184503016665340&rtpof=true&sd=true',
  progress: 'https://docs.google.com/document/d/1gIe6IvtvNvH0-TKQYnt1YnwTW61Q97yp/edit?usp=sharing&ouid=105067184503016665340&rtpof=true&sd=true',
  final:    'https://docs.google.com/document/d/1X6aaJXNvl_nWefa4jK5nKz7bQYtniQ2A/edit?usp=sharing&ouid=105067184503016665340&rtpof=true&sd=true',
};

interface Props { pageView: PageView; setPageView: (v: PageView) => void; }
export default function StudentDashboard({ pageView, setPageView }: Props) {
    const { user, updateProfile, theme, toggleTheme, logout } = useAuthStore();

    const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
    const [members, setMembers] = useState<GroupMember[]>([]);
    const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [_error, setError] = useState<string | null>(null);

    // ── useProjectData: shared L3 cache — no redundant API calls ──
    const { data: rawData, loading: dataLoading, error: dataError, refetch } = useProjectData();

    // Transform raw API data into local state whenever it changes
    useEffect(() => {
      if (!rawData || !user?.studentId) return;
      setLoading(false);
      if (dataError) { setError(dataError); return; }

      const myRow = rawData.projects.find(
        (p) => (p['รหัสนักเรียน'] || '') === user.studentId,
      );
      if (!myRow) { setError('ไม่พบข้อมูลโครงงานของคุณในระบบ'); return; }

      const info = parseProjectRow(myRow);
      setProjectInfo(info);
      setPhone(info.phone || '');

      const groupMembers = extractGroupMembers(rawData.projects, info.projectId);
      setMembers(groupMembers);

      const mySubmissions = rawData.submissions.filter((s) => {
        const sPid = s['รหัสโครงงาน'] || s['รหัสกลุ่ม'] || '';
        return sPid.replace(/\s+/g, '').toLowerCase() === info.projectId.replace(/\s+/g, '').toLowerCase();
      });
      setSubmissions(mySubmissions);

      const rejects = getActiveRejectTypes(mySubmissions);
      setRejectTypes(rejects);
      if (rejects.length > 0) setSelectedWorkType(rejects[0]);
    }, [rawData, user?.studentId, dataError]);

    // Keep loading state in sync with hook
    useEffect(() => { setLoading(dataLoading); }, [dataLoading]);

    const [submitting, setSubmitting] = useState(false);
    const [uploadPct, setUploadPct] = useState(0);
    const [selectedWorkType, setSelectedWorkType] = useState<WorkType | ''>('');
    const [file1, setFile1] = useState<File | null>(null);
    const [_file2, _setFile2] = useState<File | null>(null);
    const [_resubmitReason, _setResubmitReason] = useState('');

    const [rejectTypes, setRejectTypes] = useState<WorkType[]>([]);

    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [phone, setPhone] = useState('');
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState('');
    
    const [showPasswordSection, setShowPasswordSection] = useState(false);
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);
    
    const [isDownloadOpen, setIsDownloadOpen] = useState(false);

    const fileInputRef1 = useRef<HTMLInputElement>(null);
    // const _fileInputRef2 = useRef<HTMLInputElement>(null);
    
    const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDownloadOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // (data fetching moved to useProjectData hook above)

  if (pageView === 'petitions') {
        return <PetitionDashboard setPageView={setPageView} />;
    }

  const steps: { name: WorkType; label: string; iconId: string; textId: string }[] = [
    { name: 'โครงร่าง (Proposal)', label: 'โครงร่าง (Proposal)', iconId: 'icon-proposal', textId: 'text-proposal' },
    { name: 'รายงานความก้าวหน้า', label: 'รายงานความก้าวหน้า', iconId: 'icon-progress', textId: 'text-progress' },
    { name: 'รายงานฉบับสมบูรณ์', label: 'รายงานฉบับสมบูรณ์', iconId: 'icon-final', textId: 'text-final' }
  ];

  const getStepStatus = (type: WorkType): 'completed' | 'current' | 'rejected' | 'pending' | 'none' => {
    const typeSubs = submissions.filter((s) => s['ประเภทงาน'] === type);
    if (typeSubs.length === 0) return 'none';

    const latest = [...typeSubs].sort(
      (a, b) => new Date(a.Timestamp ?? 0).getTime() - new Date(b.Timestamp ?? 0).getTime(),
    )[typeSubs.length - 1];

    const status = parseSubmissionStatus(latest['สถานะ']);
    if (status === 'อนุมัติ') return 'completed';
    if (status === 'ไม่อนุมัติ') return 'rejected';
    return 'current';
  };

  const handleLogout = () => {
    Swal.fire({
      title: '<div class="font-bold text-lg">คุณต้องการออกจากระบบหรือไม่?</div>',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ออกจากระบบ',
      cancelButtonText: 'ยกเลิก',
      buttonsStyling: false,
      customClass: {
        popup: 'rounded-[1.5rem] w-[90%] max-w-sm border border-neutral-100 dark:border-neutral-800 shadow-2xl',
        confirmButton: 'bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 px-6 rounded-full mx-2 transition-colors text-sm btn-liquid',
        cancelButton: 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold py-3 px-6 rounded-full mx-2 transition-colors text-sm btn-liquid',
      },
    }).then((result) => {
      if (result.isConfirmed) {
        logout();
      }
    });
  };

  const viewStudentPopup = (name: string, id: string, phoneStr: string, picUrl: string) => {
    Swal.fire({
      width: 'min(90vw, 22rem)',
      html: `<div class="text-center pt-2">
                <img src="${picUrl}" class="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover mx-auto mb-4 border-[4px] border-cyan-100 dark:border-neutral-800 shadow-md bg-white" loading="lazy">
                    <h3 class="text-lg sm:text-xl font-bold text-neutral-800 dark:text-white leading-tight">${name}</h3>
                    <p class="text-sm text-neutral-400 dark:text-neutral-500 mb-5 mt-1 font-medium">รหัสประจำตัว: ${id}</p>
                    <div class="bg-cyan-50 dark:bg-cyan-950/40 rounded-2xl p-4 inline-block w-full border border-cyan-100 dark:border-cyan-900/50">
                        <p class="text-[11px] sm:text-xs text-cyan-600 dark:text-cyan-400 mb-1.5 font-bold uppercase flex items-center justify-center">
                            <svg class="w-4 h-4 mr-1.5 opacity-80" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                             เบอร์โทรติดต่อ
                        </p>
                        <p class="text-lg font-bold text-cyan-800 dark:text-white tracking-wide">${phoneStr || 'ไม่มีข้อมูลติดต่อ'}</p>
                    </div>
                </div>`,
      showConfirmButton: true, confirmButtonText: 'ปิดหน้าต่าง', buttonsStyling: false, 
      customClass: { popup: 'rounded-[1.5rem] border border-neutral-100 dark:border-neutral-800 shadow-2xl', confirmButton: 'bg-neutral-800 dark:bg-neutral-700 text-white font-bold py-3.5 px-8 rounded-full mt-4 hover:bg-neutral-900 transition-colors text-sm w-full btn-liquid' }, backdrop: `rgba(0, 0, 0, 0.4)`
    });
  };

  const prepareResubmitPopup = async (type: WorkType) => {
    const previousRejectReason = getSubmissionReason((submissions.filter(s => s['ประเภทงาน'] === type).pop() || {}) as any);
    const previousReasonHtml = previousRejectReason
        ? `<div class="text-left bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 p-3 rounded-xl mb-3 text-xs leading-relaxed"><div class="font-bold mb-1">หมายเหตุที่ต้องแก้ไข</div></div>`
        : '';

    const { value: formValues } = await Swal.fire({
        title: '<div class="flex items-center justify-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg><span class="text-lg sm:text-xl font-bold">ส่งไฟล์แก้ไขใหม่</span></div>',
        html: `
            <div class="text-xs sm:text-sm text-left font-medium mb-3 text-neutral-500 dark:text-neutral-400 border-b border-neutral-100 dark:border-neutral-800 pb-2">งานที่ต้องส่งแก้: <span class="text-orange-500 font-bold">${type}</span></div>
            ${previousReasonHtml}
            <div class="text-left bg-neutral-50 dark:bg-neutral-900/50 p-4 rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-inner">
                <label class="block text-[11px] sm:text-xs font-bold mb-2 text-orange-600 dark:text-orange-500 ml-0.5">ไฟล์แนบที่แก้ไข (PDF)</label>
                <input type="file" id="popupFileReport" accept="application/pdf" class="w-full text-[10px] sm:text-xs text-neutral-500 cursor-pointer outline-none" required>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'อัปโหลดทันที',
        cancelButtonText: 'ยกเลิก',
        buttonsStyling: false,
        customClass: { 
            popup: 'rounded-[1.5rem] w-[90%] max-w-sm border border-neutral-100 dark:border-neutral-800',
            confirmButton: 'bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-full text-sm mr-2 shadow-sm transition-colors btn-liquid',
            cancelButton: 'bg-neutral-100 hover:bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 font-bold py-3 px-6 rounded-full text-sm shadow-sm transition-colors btn-liquid'
        },
        preConfirm: () => {
            const el = document.getElementById('popupFileReport') as HTMLInputElement;
            const rFile = el?.files?.[0];
            if (!rFile) { Swal.showValidationMessage('กรุณาอัปโหลดไฟล์'); return false; }
            return { rFile };
        }
    });

    if (formValues && projectInfo) {
        const MAX_SIZE = 25 * 1024 * 1024;
        if (formValues.rFile.size > MAX_SIZE) {
            Swal.fire({
                icon: 'error',
                title: '<div class="font-bold text-sm sm:text-base">ไฟล์มีขนาดใหญ่เกินไป</div>',
                text: `ไฟล์ของคุณมีขนาด ${(formValues.rFile.size / 1024 / 1024).toFixed(1)} MB แต่ระบบรองรับไฟล์สูงสุด 25 MB กรุณาบีบอัดหรือลดขนาดไฟล์แล้วลองใหม่`,
                confirmButtonColor: '#f97316',
                customClass: { popup: 'rounded-2xl' }
            });
            return;
        }

        setSubmitting(true);
        setUploadPct(0);

        try {
            const file1Url = await uploadFileToDrive(
              formValues.rFile,
              `${projectInfo.projectId}_${type}_file1`,
              setUploadPct,
            );
            
            const payload = {
                studentId: projectInfo.studentId,
                firstName: projectInfo.firstName,
                lastName: projectInfo.lastName,
                projectId: projectInfo.projectId,
                workType: type,
                advisorName: projectInfo.advName,
                file1Url,
                reason: previousRejectReason
            };
            
            const res = await apiSubmit(payload);
            
            if (res.status === 'success') {
                Swal.fire({ icon: 'success', title: '<div class="font-bold text-lg">ส่งไฟล์สำเร็จ!</div>', showConfirmButton: false, timer: 1500, customClass: {popup: 'rounded-2xl'} });
                refetch();
            } else {
                throw new Error(res.message);
            }
        } catch(e: any) {
             Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: e.message, confirmButtonColor: '#f97316', customClass: {popup: 'rounded-2xl'} });
        } finally {
            setSubmitting(false);
            setUploadPct(0);
        }
    }
  };

  const handleWorkSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!projectInfo) return;

    if (rejectTypes.length > 0 && !rejectTypes.includes(selectedWorkType as WorkType)) {
        Swal.fire({
            icon: 'error',
            title: '<div class="font-bold text-sm sm:text-base">กรุณาทำรายการที่ตารางประวัติ</div>',
            html: '<span class="text-xs sm:text-sm">งานนี้ต้องแก้ กรุณากดปุ่ม <b>"ส่งไฟล์แก้ไข"</b> ที่ตารางด้านขวาแทนครับ</span>',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#e11d48',
            customClass: { popup: 'rounded-[1.5rem]' }
        });
        return;
    }

    if (!file1) {
      return;
    }

    const MAX_SIZE = 25 * 1024 * 1024;
    if (file1.size > MAX_SIZE) {
        Swal.fire({
            icon: 'error',
            title: '<div class="font-bold text-sm sm:text-base">ไฟล์มีขนาดใหญ่เกินไป</div>',
            text: `ไฟล์ของคุณมีขนาด ${(file1.size / 1024 / 1024).toFixed(1)} MB แต่ระบบรองรับไฟล์สูงสุด 25 MB กรุณาบีบอัดหรือลดขนาดไฟล์แล้วลองใหม่`,
            confirmButtonColor: '#f97316',
            customClass: { popup: 'rounded-2xl' }
        });
        return;
    }

    setSubmitting(true);
    setUploadPct(0);

    try {
      const file1Url = await uploadFileToDrive(
        file1,
        `${projectInfo.projectId}_${selectedWorkType}_file1`,
        setUploadPct,
      );
      
      const payload = {
        studentId: projectInfo.studentId,
        firstName: projectInfo.firstName,
        lastName: projectInfo.lastName,
        projectId: projectInfo.projectId,
        workType: selectedWorkType as WorkType,
        advisorName: projectInfo.advName,
        file1Url,
      };

      const res = await apiSubmit(payload);

      if (res.status === 'success') {
        Swal.fire({
          icon: 'success',
          title: '<div class="font-bold text-lg">อัปโหลดสำเร็จ!</div>',
          showConfirmButton: false,
          timer: 1500,
          customClass: { popup: 'rounded-[1.5rem]' }
        });

        setFile1(null);
        setSelectedWorkType('');
        if (fileInputRef1.current) fileInputRef1.current.value = '';

        refetch();
      } else {
        throw new Error(res.message || 'บันทึกข้อมูลไม่สำเร็จ');
      }
    } catch (err: any) {
      Swal.fire({
        title: '<div class="font-bold text-rose-600 text-sm sm:text-base">เกิดข้อผิดพลาด</div>',
        text: err.message || 'ระบบไม่สามารถส่งไฟล์ได้ กรุณาลองใหม่อีกครั้ง',
        icon: 'error',
        confirmButtonColor: '#f97316',
        customClass: { popup: 'rounded-2xl'}
      });
    } finally {
      setSubmitting(false);
      setUploadPct(0);
    }
  };

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (showPasswordSection && (oldPassword || newPassword || confirmPassword)) {
        if (!oldPassword) { Swal.fire({icon: 'warning', title: '<div class="font-bold text-sm sm:text-base">โปรดระบุรหัสผ่านเดิม</div>', confirmButtonColor: '#f97316', customClass: {popup: 'rounded-2xl'} }); return; }
        if (newPassword !== confirmPassword) { Swal.fire({icon: 'warning', title: '<div class="font-bold text-sm sm:text-base">รหัสผ่านใหม่ไม่ตรงกัน</div>', confirmButtonColor: '#f97316', customClass: {popup: 'rounded-2xl'} }); return; }
    }
    
    if (!phone) { Swal.fire({ icon: 'warning', title: '<div class="font-bold text-sm sm:text-base">โปรดระบุเบอร์โทรศัพท์</div>', confirmButtonText: 'ตกลง', confirmButtonColor: '#f97316', customClass: { popup: 'rounded-[1.5rem]'} }); return; }
    
    setProfileSaving(true);

    try {
      let picData = null;
      let picMime = null;
      if (avatarFile) {
        if (avatarFile.size > 8 * 1024 * 1024) {
             throw new Error('ไฟล์รูปใหญ่เกินไป กรุณาใช้รูปไม่เกิน 8 MB');
        }
        const compressed = await resizeProfileImage(avatarFile);
        picData = compressed.data;
        picMime = compressed.mime;
      }
      
      const payload: any = {
        email: user.email,
        phone: phone.trim(),
        oldPassword: oldPassword.trim() || undefined,
        newPassword: newPassword.trim() || undefined,
      };
      if (picData) {
          payload.newPicData = picData;
          payload.newPicMime = picMime;
      }
      console.log('Updating profile with payload:', payload);
      const res = await apiUpdateProfile(payload);
      if (res.status === 'success') {
          Swal.fire({ icon: 'success', title: '<div class="font-bold text-lg">บันทึกข้อมูลเรียบร้อย!</div>', showConfirmButton: false, timer: 1500, customClass: {popup: 'rounded-2xl'} }); 
          if (res.profileUrl) {
              updateProfile({ profileUrl: res.profileUrl });
          }
          setIsProfileOpen(false);
          setShowPasswordSection(false);
          setOldPassword('');
          setNewPassword('');
          setConfirmPassword('');
      } else {
        throw new Error(res.message || 'ปรับปรุงข้อมูลส่วนตัวไม่สำเร็จ');
      }
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: '<div class="font-bold text-rose-600 text-sm sm:text-base">เกิดข้อผิดพลาด</div>', text: err.message, confirmButtonColor: '#f97316', customClass: {popup: 'rounded-2xl'} }); 
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  return (
    <div className="pb-10 app-shell transition-colors">
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav className="glass-panel border-b-0 shadow-sm relative z-40">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500"></div>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 px-4 py-3 sm:py-4 mt-1">
            <div className="flex items-center gap-3 sm:gap-4 w-full">
                <button 
                    onClick={() => setIsProfileOpen(true)} 
                    className="relative group outline-none rounded-full flex-shrink-0 transition-transform hover:scale-105 cursor-pointer"
                    >
                        <img 
                        src={user?.profileUrl} 
                        className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-[3px] border-white dark:border-neutral-800 shadow-lg bg-white" 
                        />
                        <div className="absolute bottom-0 right-0 bg-neutral-800 dark:bg-orange-600 rounded-full p-1 shadow-md border-2 border-white dark:border-slate-800">
                            <Settings className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
                        </div>
                    </button>
                <div className="flex-grow min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <h1 className="text-base sm:text-xl font-extrabold text-neutral-800 dark:text-white leading-tight truncate">
                            <span>{user?.name || 'กำลังโหลด...'}</span>
                        </h1>
                        {projectInfo && (
                            <span className="inline-flex bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold shadow-sm items-center border border-orange-200 dark:border-orange-800/50">
                                <Hash className="w-3 h-3 mr-0.5 inline-block opacity-80" />
                                <span>{projectInfo.projectId}</span>
                            </span>
                        )}
                    </div>
                    <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5 flex items-center truncate">
                        <UserIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0 opacity-70" /> รหัสนักเรียน: <span className="font-semibold text-orange-600 dark:text-orange-400 ml-1">{user?.studentId}</span>
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                <div className="relative" ref={dropdownRef}>
                    <button onClick={() => setIsDownloadOpen(!isDownloadOpen)} className="text-xs sm:text-[13px] font-bold bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400 px-3.5 py-2 sm:px-4 sm:py-2 rounded-full border border-blue-100 dark:border-blue-800/50 flex items-center hover:bg-blue-50 dark:hover:bg-neutral-700 transition-colors shadow-sm outline-none btn-liquid">
                        <FolderDown className="w-4 h-4 mr-1.5 opacity-80" />
                        <span className="hidden sm:inline">ดาวน์โหลด</span><span className="sm:hidden">ฟอร์ม</span>
                        <ChevronDown className="w-4 h-4 ml-1 opacity-70" />
                    </button>
                    <div className={`absolute right-0 mt-2 w-48 sm:w-52 bg-white dark:bg-neutral-800 rounded-2xl shadow-xl border border-neutral-100 dark:border-neutral-700 z-50 overflow-hidden transform transition-all origin-top-right ${isDownloadOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 hidden'}`}>
                        <div className="p-1.5">
                            <a href={FORM_DOWNLOAD_URLS.proposal} target="_blank" rel="noopener noreferrer" className="flex items-center px-3.5 py-3 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 rounded-xl transition-colors font-medium"><div className="bg-blue-50 dark:bg-blue-900/30 text-blue-500 p-2 rounded-lg mr-3"><FileText className="w-4 h-4" /></div> โครงร่าง (Proposal)</a>
                            <a href={FORM_DOWNLOAD_URLS.progress} target="_blank" rel="noopener noreferrer" className="flex items-center px-3.5 py-3 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 rounded-xl transition-colors font-medium"><div className="bg-purple-50 dark:bg-purple-900/30 text-purple-500 p-2 rounded-lg mr-3"><TrendingUp className="w-4 h-4" /></div> ความก้าวหน้า</a>
                            <a href={FORM_DOWNLOAD_URLS.final} target="_blank" rel="noopener noreferrer" className="flex items-center px-3.5 py-3 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 rounded-xl transition-colors font-medium"><div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500 p-2 rounded-lg mr-3"><CheckCircle2 className="w-4 h-4" /></div> ฉบับสมบูรณ์</a>
                            {/* <div className="h-px bg-neutral-100 dark:bg-neutral-700 my-1.5 mx-2"></div> */}
                        </div>
                    </div>
                </div>
                <PetitionNavButton pageView={pageView} setPageView={setPageView} />
                <button onClick={toggleTheme} className="btn-liquid bg-neutral-100 dark:bg-neutral-800 p-2 sm:p-2.5 rounded-full text-neutral-600 dark:text-neutral-300 outline-none hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-transparent dark:border-neutral-700">
                    {theme === 'dark' ? <Sun className="w-4.5 h-4.5 text-orange-400" /> : <Moon className="w-4.5 h-4.5" />}
                </button>
                <button onClick={handleLogout} className="text-xs sm:text-sm text-rose-600 dark:text-rose-400 font-bold bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2 sm:px-4 sm:py-2 rounded-full border border-rose-100 dark:border-rose-900/50 flex items-center btn-liquid flex-shrink-0">
                    <LogOut className="w-4 h-4 mr-1.5 opacity-90" /> <span className="hidden sm:inline">ออกระบบ</span>
                </button>
            </div>
        </div>
        
        {projectInfo && (
        <div className="compact-project-shell mt-2 pt-3 sm:pt-4 pb-3 max-w-7xl mx-auto px-4">
            <div className="space-y-3 sm:space-y-4">
                <div className="compact-card compact-title-card p-4 sm:p-5">
                    <div className="compact-accent bg-gradient-to-b from-orange-400 to-pink-500"></div>
                    <p className="compact-label text-[11px] sm:text-xs flex items-center font-bold mb-1.5 ml-2">
                        <span className="compact-icon mr-2 text-orange-500">
                            <BookOpen className="w-4 h-4" />
                        </span>
                        ชื่อโครงงานวิจัย
                    </p>
                    <p className="compact-title text-sm sm:text-lg w-full px-2 whitespace-normal break-words line-clamp-2" title={projectInfo.projectNameTH || "-"}>{projectInfo.projectNameTH || "-"}</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-stretch">
                    <div className="lg:col-span-8">
                        <div className="compact-info-grid h-full">
                            <div className="compact-info-item">
                                <div className="flex items-center mb-2">
                                    <span className="compact-icon mr-2 text-blue-500">
                                        <Users className="w-4 h-4" />
                                    </span>
                                    <p className="compact-label text-[11px] sm:text-xs font-bold">คู่โครงงาน</p>
                                </div>
                                <div className="w-full">
                                    {members.filter(m => m.studentId !== user?.studentId).length > 0 ? (
                                        members.filter(m => m.studentId !== user?.studentId).map(member => (
                                            <button key={member.studentId} type="button" onClick={() => viewStudentPopup(`${member.firstName} ${member.lastName}`, member.studentId, member.phone, member.profileUrl)} className="compact-partner-btn text-left flex items-center gap-2.5 p-2.5 btn-liquid">
                                                <img src={member.profileUrl} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-white dark:border-neutral-700 shadow-sm bg-white" loading="lazy" />
                                                <div className="flex flex-col leading-tight overflow-hidden">
                                                    <span className="text-xs sm:text-sm text-neutral-800 dark:text-neutral-100 font-extrabold truncate">{member.studentId}</span>
                                                    <span className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400 font-medium truncate mt-0.5">{member.firstName} {member.lastName}</span>
                                                </div>
                                                <ChevronRight className="w-4 h-4 ml-auto text-neutral-300 dark:text-neutral-600 flex-shrink-0" />
                                            </button>
                                        ))
                                    ) : (
                                        <div className="font-bold text-neutral-500 dark:text-neutral-400 text-sm px-2 mt-2">- (เดี่ยว)</div>
                                    )}
                                </div>
                            </div>

                            <div className="compact-info-item">
                                <div className="flex items-center mb-2">
                                    <span className="compact-icon mr-2 text-emerald-500">
                                        <GraduationCap className="w-4 h-4" />
                                    </span>
                                    <p className="compact-label text-[11px] sm:text-xs font-bold">อ.ที่ปรึกษาหลัก</p>
                                </div>
                                <div className="w-full">
                                    <div className="font-extrabold text-neutral-800 dark:text-neutral-100 text-xs sm:text-sm truncate">{projectInfo.advName || '-'}</div>
                                    <div className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">{projectInfo.advEmail || '-'}</div>
                                </div>
                            </div>

                            <div className="compact-info-item">
                                <div className="flex items-center mb-2">
                                    <span className="compact-icon mr-2 text-purple-500">
                                        <UserPlus className="w-4 h-4" />
                                    </span>
                                    <p className="compact-label text-[11px] sm:text-xs font-bold">อ.ที่ปรึกษาร่วม</p>
                                </div>
                                <div className="w-full">
                                    <div className="font-extrabold text-neutral-800 dark:text-neutral-100 text-xs sm:text-sm truncate">{projectInfo.coAdvName || '-'}</div>
                                    <div className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">{projectInfo.coAdvEmail || '-'}</div>
                                </div>
                            </div>

                            <div className="compact-info-item">
                                <div className="flex items-center mb-2">
                                    <span className="compact-icon mr-2 text-teal-500">
                                        <School className="w-4 h-4" />
                                    </span>
                                    <p className="compact-label text-[11px] sm:text-xs font-bold">อ.ที่ปรึกษาโรงเรียน</p>
                                </div>
                                <div className="w-full">
                                    <div className="font-extrabold text-neutral-800 dark:text-neutral-100 text-xs sm:text-sm truncate">{projectInfo.schAdvName || '-'}</div>
                                    <div className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">{projectInfo.schAdvEmail || '-'}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="compact-card compact-status-card lg:col-span-4 p-4 sm:p-5 h-full">
                        <p className="text-sm sm:text-base text-neutral-800 dark:text-neutral-100 font-extrabold mb-3 w-full border-b border-neutral-100 dark:border-neutral-800 pb-2.5 flex items-center">
                            <span className="compact-icon mr-2 text-indigo-500">
                                <Truck className="w-4 h-4" />
                            </span>
                            สถานะการส่งงาน
                        </p>

                        <div className="w-full pl-1">
                            {steps.map((step, idx) => {
                                const s = getStepStatus(step.name);
                                let iconContent = <>{idx + 1}</>;
                                let textClass = 'text-neutral-500 dark:text-neutral-500';
                                let textStr = 'รอการส่งงาน';
                                if (s === 'none') { textStr = 'ยังไม่ส่งงาน'; }

                                if (s === 'completed') {
                                    iconContent = <Check className="w-4 h-4 sm:w-5 sm:h-5" />;
                                    textClass = 'text-emerald-500 font-bold';
                                    textStr = step.name === 'รายงานฉบับสมบูรณ์' ? 'ผ่านเกณฑ์' : 'อนุมัติแล้ว';
                                } else if (s === 'rejected') {
                                    iconContent = <X className="w-4 h-4 sm:w-5 sm:h-5" />;
                                    textClass = 'text-rose-500 font-bold';
                                    textStr = 'ต้องแก้ไข';
                                } else if (s === 'current') {
                                    iconContent = <Clock className="w-4 h-4 sm:w-5 sm:h-5" />;
                                    textClass = 'text-orange-500 font-bold';
                                    textStr = 'รออนุมัติ';
                                }

                                return (
                                    <div className="timeline-step" key={step.name}>
                                        <div className={`timeline-icon ${s === 'completed' ? 'completed' : s === 'rejected' ? 'rejected' : s === 'current' ? 'current' : ''}`}>{iconContent}</div>
                                        <div className="ml-4">
                                            <p className="text-xs sm:text-sm font-extrabold text-neutral-800 dark:text-neutral-200">{step.label}</p>
                                            <p className={`text-[10px] sm:text-xs mt-0.5 ${textClass}`}>
                                                {s === 'completed' || s === 'rejected' || s === 'current' ? <span className="text-xs sm:text-sm">{textStr}</span> : textStr}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
        )}
      </nav>

      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto mt-4 sm:mt-6 px-3 sm:px-4 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        
        {/* Upload Box */}
        <div className="lg:col-span-1 space-y-4 sm:space-y-6 flex flex-col">
            <div className="glass-panel rounded-3xl sm:rounded-[2rem] p-5 sm:p-7 transition-all duration-500 border border-transparent shadow-sm">
                <h2 className="text-sm sm:text-base font-bold text-neutral-800 dark:text-white mb-5 border-b border-neutral-100 dark:border-neutral-800 pb-3.5 flex items-center">
                    <UploadCloud className="w-5 h-5 sm:w-6 sm:h-6 mr-2.5 text-orange-500" /> อัปโหลดส่งงาน
                </h2>
                <form className="space-y-4.5" onSubmit={handleWorkSubmit}>
                    <div>
                        <label className="block text-xs sm:text-sm font-semibold mb-1.5 text-neutral-600 dark:text-neutral-400 ml-1">ประเภทงาน <span className="text-rose-500">*</span></label>
                        <select 
                            required 
                            className={`w-full text-xs sm:text-sm rounded-xl sm:rounded-2xl p-3 sm:p-3.5 glass-input outline-none focus:ring-2 focus:ring-orange-400 ${rejectTypes.length > 0 ? 'opacity-70' : ''}`}
                            value={selectedWorkType}
                            onChange={(e) => setSelectedWorkType(e.target.value as WorkType)}
                            disabled={rejectTypes.length > 0}
                            title={rejectTypes.length > 0 ? 'ระบบล็อกให้เลือกเฉพาะงานที่ต้องแก้ไข' : ''}
                        >
                            <option value="">-- กรุณาเลือก --</option>
                            <option value="โครงร่าง (Proposal)">โครงร่าง (Proposal)</option>
                            <option value="รายงานความก้าวหน้า">รายงานความก้าวหน้า</option>
                            <option value="รายงานฉบับสมบูรณ์">รายงานฉบับสมบูรณ์</option>
                        </select>
                    </div>

                    <div className={`bg-rose-50 dark:bg-rose-950/40 p-4 rounded-xl border border-rose-100 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-medium flex items-start shadow-sm ${rejectTypes.length > 0 ? '' : 'hidden'}`}>
                        <AlertTriangle className="w-5 h-5 mr-2.5 flex-shrink-0 mt-0.5 text-rose-500" />
                        <span>ระบบล็อกประเภทงานให้ส่งแก้ไขเฉพาะรายการที่อาจารย์ไม่อนุมัติเท่านั้น</span>
                    </div>

                    <div className={`space-y-5 pt-2 ${rejectTypes.length > 0 ? 'form-locked hidden' : ''}`}>
                        <div className="bg-orange-50/50 dark:bg-orange-950/20 p-4 sm:p-5 rounded-2xl border border-orange-100/80 dark:border-orange-900/30 flex flex-col justify-center gap-2">
                            <label className="block text-xs sm:text-sm font-bold text-orange-800 dark:text-orange-400 flex items-center ml-0.5 mb-1.5">
                                <FileUp className="w-4.5 h-4.5 mr-2 opacity-80" /> ไฟล์รูปเล่ม (PDF)
                            </label>
                            <input 
                                type="file" 
                                accept="application/pdf" 
                                required={rejectTypes.length === 0} 
                                className="w-full text-xs sm:text-sm text-neutral-500 cursor-pointer outline-none"
                                ref={fileInputRef1}
                                onChange={(e) => setFile1(e.target.files?.[0] || null)}
                                disabled={submitting}
                            />
                        </div>
                        {submitting ? (
                            <div className="w-full mt-2 rounded-xl sm:rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                                <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-3">
                                    <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5 min-w-0 truncate">
                                        {uploadPct < 100
                                          ? <svg className="animate-spin h-3.5 w-3.5 text-orange-500 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                                          : <svg className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                        }
                                        {uploadPct < 10 ? 'กำลังส่งไฟล์...' : uploadPct < 92 ? 'กำลังส่งไปยัง Google Drive...' : uploadPct < 100 ? 'กำลังบันทึกลง Drive...' : 'อัปโหลดสำเร็จ!'}
                                    </span>
                                    <span className="text-xs font-extrabold text-orange-500 flex-shrink-0">{uploadPct}%</span>
                                </div>
                                <div className="mx-4 mb-3.5 h-2.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ease-out ${uploadPct >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-orange-400 to-pink-500'}`}
                                        style={{ width: `${uploadPct}%` }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <button type="submit" className="w-full btn-liquid bg-neutral-800 dark:bg-neutral-700 text-white font-bold py-3.5 sm:py-4 rounded-xl sm:rounded-2xl hover:shadow-md transition-all text-sm flex items-center justify-center mt-2 tracking-wide">
                                <UploadCloud className="w-4.5 h-4.5 mr-2" /> อัปโหลดส่งงาน
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>

        {/* History Table */}
        <div className="lg:col-span-2">
            <div className="glass-panel rounded-3xl sm:rounded-[2rem] p-4 sm:p-7 overflow-hidden shadow-sm border border-transparent">
                <h2 className="text-sm sm:text-base font-bold text-neutral-800 dark:text-white mb-4 sm:mb-5 border-b border-neutral-100 dark:border-neutral-800 pb-2.5 sm:pb-3.5 flex items-center">
                    <History className="w-5 h-5 sm:w-6 sm:h-6 mr-2.5 text-neutral-500 dark:text-neutral-400" /> ประวัติการส่งงานของกลุ่ม
                </h2>

                {submitting && rejectTypes.length > 0 && (
                    <div className="w-full mb-4 rounded-xl sm:rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                        <div className="px-4 pt-3.5 pb-2 flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5 min-w-0 truncate">
                                {uploadPct < 100
                                  ? <svg className="animate-spin h-3.5 w-3.5 text-orange-500 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                                  : <svg className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                }
                                {uploadPct < 10 ? 'กำลังส่งไฟล์...' : uploadPct < 92 ? 'กำลังส่งไปยัง Google Drive...' : uploadPct < 100 ? 'กำลังบันทึกลง Drive...' : 'อัปโหลดสำเร็จ!'}
                            </span>
                            <span className="text-xs font-extrabold text-orange-500 flex-shrink-0">{uploadPct}%</span>
                        </div>
                        <div className="mx-4 mb-3.5 h-2.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ease-out ${uploadPct >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-orange-400 to-pink-500'}`}
                                style={{ width: `${uploadPct}%` }}
                            />
                        </div>
                    </div>
                )}
                
                {loading ? (
                    <div className="text-center py-16 sm:py-20 text-sm text-neutral-500 flex flex-col items-center">
                        <svg className="animate-spin h-10 w-10 text-orange-500 mb-4 sm:mb-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <span className="font-medium tracking-wide">กำลังซิงค์ข้อมูลล่าสุด...</span>
                    </div>
                ) : (
                    <div className="overflow-x-auto w-full pb-4">
                        <table className="data-table data-table--history w-full text-left border-separate">
                            <thead className="bg-transparent text-xs sm:text-sm text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
                                <tr>
                                    <th className="px-2 sm:px-4 py-3 sm:py-4 font-bold uppercase tracking-wider">วันที่ส่ง</th>
                                    <th className="px-2 sm:px-4 py-3 sm:py-4 font-bold uppercase tracking-wider">งาน / ผู้ส่ง</th>
                                    <th className="px-2 sm:px-4 py-3 sm:py-4 text-center font-bold uppercase tracking-wider">สถานะ</th>
                                    <th className="px-2 sm:px-4 py-3 sm:py-4 text-left font-bold uppercase tracking-wider min-w-[150px]">หมายเหตุ</th>
                                    <th className="px-2 sm:px-4 py-3 sm:py-4 text-center font-bold uppercase tracking-wider min-w-[150px]">ไฟล์แนบ</th>
                                </tr>
                            </thead>
                            <tbody id="historyTableBody" className="history-table-body">
                                {submissions.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center py-12 text-neutral-500 text-sm font-medium"><Smile className="w-6 h-6 mr-2 inline-block opacity-70" /> ยินดีต้อนรับ! เริ่มส่งงานแรกของกลุ่มกันเลย</td></tr>
                                ) : (
                                    [...submissions].sort((a, b) => new Date(b.Timestamp ?? 0).getTime() - new Date(a.Timestamp ?? 0).getTime()).map((s, idx) => {
                                        const parsedStatus = parseSubmissionStatus(s['สถานะ']);
                                        const isMe = getVal(s, ['รหัสนักเรียน']) === user?.studentId;
                                        const cleanFirstName = getVal(s, ['ชื่อ']).split("และ")[0].replace(/\(ผู้ส่ง\)/g, '').trim();
                                        const submitterTag = isMe ? <span className="text-orange-600 font-semibold">(คุณ)</span> : <span className="text-neutral-500 dark:text-neutral-400 font-medium">({cleanFirstName})</span>;
                                        const workType = getVal(s, ['ประเภทงาน']) || 'ไม่ระบุ';
                                        
                                        let statusClass = "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800";
                                        let statusIcon = <Clock3 className="w-4 h-4 mr-1.5 flex-shrink-0" />;
                                        let statusText = "รออนุมัติ";
                                        
                                        const reason = getSubmissionReason(s as any);
                                        const fileUrl = getSubmissionFileUrl(s);

                                        if (parsedStatus === 'อนุมัติ') {
                                            statusClass = "bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800";
                                            statusIcon = <CheckCircle2 className="w-4 h-4 mr-1.5 flex-shrink-0" />;
                                            statusText = "อนุมัติ";
                                        } else if (parsedStatus === 'ไม่อนุมัติ') {
                                            statusClass = "bg-rose-50 text-rose-800 dark:bg-rose-950/70 dark:text-rose-400 border border-rose-200 dark:border-rose-900"; 
                                            statusIcon = <AlertCircle className="w-4 h-4 mr-1.5 flex-shrink-0 opacity-80" />;
                                            statusText = "ต้องแก้ไข";
                                        }

                                        let reasonHtml = <span className="text-neutral-300 dark:text-neutral-700 font-light opacity-50">-</span>;
                                        if (parsedStatus === 'ไม่อนุมัติ' && reason) {
                                            reasonHtml = <div className="text-xs text-rose-800 dark:text-rose-300 font-medium bg-rose-50 dark:bg-rose-950/30 p-3 sm:p-4 rounded-xl border border-rose-100 dark:border-rose-900/60 inline-block w-full max-w-[200px] whitespace-normal break-words shadow-inner text-left">{reason}</div>;
                                        }

                                        const { date, time } = formatDateTimeTH(s.Timestamp);

                                        return (
                                            <tr key={idx} className="dark:text-neutral-300">
                                                <td className="text-xs sm:text-sm align-middle opacity-80 font-normal py-4 sm:py-5 px-3 sm:px-4">
                                                    <div className="font-bold text-neutral-800 dark:text-neutral-200">{date}</div>
                                                    <div className="text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{time}</div>
                                                </td>
                                                <td className="font-bold text-xs sm:text-sm align-middle leading-tight py-4 sm:py-5 px-3 sm:px-4 whitespace-nowrap w-[1%]">
                                                    <span className="text-neutral-800 dark:text-white">{workType}</span><div className="mt-1 text-[10px] sm:text-[11px] font-medium opacity-80">{submitterTag}</div>
                                                </td>
                                                <td className="text-center align-middle py-4 sm:py-5 px-2">
                                                    <div className="flex flex-col items-center">
                                                      <span className={`px-3.5 py-2 rounded-lg text-xs font-extrabold ${statusClass} inline-flex items-center whitespace-nowrap justify-center`}>{statusIcon} {statusText}</span>
                                                        {parsedStatus === 'ไม่อนุมัติ' && rejectTypes.includes(workType as WorkType) && (
                                                            <button onClick={() => prepareResubmitPopup(workType as WorkType)} disabled={submitting} className="mt-2.5 w-full text-xs text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2.5 rounded-full flex items-center justify-center transition-all shadow-sm font-semibold btn-liquid"><CloudUpload className="w-4 h-4 mr-1.5 opacity-90" /> ส่งไฟล์แก้ไข</button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="text-left align-middle py-4 sm:py-5 px-3 sm:px-4">{reasonHtml}</td>
                                                <td className="text-center align-middle py-4 sm:py-5 px-3 sm:px-4">
                                                    <div className="flex justify-center items-center">
                                                      <a href={fileUrl || '#'} target="_blank" className="btn-liquid text-orange-800 dark:text-orange-400 bg-orange-50 dark:bg-neutral-800 px-4 py-2 rounded-lg text-xs font-extrabold border border-orange-200 dark:border-neutral-700 inline-flex items-center justify-center whitespace-nowrap min-w-[115px] hover:bg-orange-100 dark:hover:bg-neutral-700 transition-all shadow-sm"><FileText className="w-4 h-4 mr-1.5 opacity-80 flex-shrink-0" /><span>ไฟล์รูปเล่ม</span></a>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* ── Profile Modal ──────────────────────────────────────────────────────── */}
      {isProfileOpen && (
      <div className="modal-backdrop transition-opacity" onClick={(e) => { if (e.target === e.currentTarget) setIsProfileOpen(false); }}>
        <div className="modal-panel glass-panel">
            <button onClick={() => setIsProfileOpen(false)} className="!absolute top-4 sm:top-5 right-4 sm:right-5 text-neutral-400 hover:text-slate-700 dark:hover:text-white bg-slate-100/80 dark:bg-neutral-800/80 rounded-full p-2 transition-colors z-10 btn-liquid"><X className="w-4 h-4" /></button>
            <div className="p-5 sm:p-8 overflow-y-auto max-h-[85vh]">
                <div className="text-center mb-5 sm:mb-6">
                    <h2 className="text-lg sm:text-xl font-bold text-neutral-800 dark:text-white tracking-wide">ตั้งค่าโปรไฟล์</h2>
                    <p className="text-xs text-neutral-500 dark:text-slate-400 mt-1">อัปเดตข้อมูลส่วนตัวของคุณ</p>
                </div>
                <form className="space-y-4" onSubmit={handleProfileSave}>
                    <div className="flex flex-col items-center mb-4 sm:mb-6">
                        <div className="relative group cursor-pointer" onClick={() => document.getElementById('profilePicInput')?.click()}>
                            <img src={avatarPreview || user?.profileUrl} className="w-20 h-20 sm:w-28 sm:h-28 rounded-full object-cover border-[3px] border-neutral-100 dark:border-neutral-800 shadow-sm transition-all group-hover:border-orange-300" />
                            <div className="absolute inset-0 bg-neutral-900/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-white text-xs font-semibold">เปลี่ยนรูป</span></div>
                            <div className="absolute bottom-0 right-0 sm:bottom-1 sm:right-1 bg-orange-500 rounded-full p-2 sm:p-2.5 shadow-md border-2 border-white dark:border-neutral-900"><Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" /></div>
                        </div>
                       <input type="file" id="profilePicInput" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} disabled={profileSaving} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold mb-1.5 text-neutral-700 dark:text-slate-300 ml-1">เบอร์โทรศัพท์ <span className="text-red-500">*</span></label>
                        <input type="tel" required placeholder="0812345678" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={profileSaving} className="w-full text-sm rounded-xl sm:rounded-2xl p-3 sm:p-3.5 glass-input outline-none focus:ring-2 focus:ring-orange-400" />
                    </div>
                    <div className="pt-3 sm:pt-4 border-t border-neutral-100 dark:border-neutral-800">
                        <button type="button" onClick={() => setShowPasswordSection(!showPasswordSection)} className="w-full text-sm font-semibold text-neutral-600 dark:text-neutral-400 hover:text-orange-500 bg-neutral-50 dark:bg-neutral-800 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl flex items-center justify-center transition-colors btn-liquid">
                            {showPasswordSection ? <Minus className="w-4 h-4 mr-1.5 sm:mr-2" /> : <Plus className="w-4 h-4 mr-1.5 sm:mr-2" />} เปลี่ยนรหัสผ่านใหม่
                        </button>
                        {showPasswordSection && (
                        <div className="mt-3 sm:mt-3.5 space-y-3 sm:space-y-3.5">
                            <input type="password" placeholder="รหัสผ่านเดิม" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} disabled={profileSaving} className="w-full text-sm rounded-xl sm:rounded-2xl p-3 sm:p-3.5 glass-input outline-none focus:ring-2 focus:ring-orange-400" />
                            <input type="password" placeholder="รหัสผ่านใหม่" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={profileSaving} className="w-full text-sm rounded-xl sm:rounded-2xl p-3 sm:p-3.5 glass-input outline-none focus:ring-2 focus:ring-orange-400" />
                            <input type="password" placeholder="ยืนยันรหัสผ่านใหม่" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={profileSaving} className="w-full text-sm rounded-xl sm:rounded-2xl p-3 sm:p-3.5 glass-input outline-none focus:ring-2 focus:ring-orange-400" />
                        </div>
                        )}
                    </div>
                    <button type="submit" disabled={profileSaving} className="w-full btn-liquid bg-slate-800 dark:bg-orange-600 text-white font-bold py-3 sm:py-4 rounded-xl sm:rounded-2xl hover:shadow-lg transition-all mt-4 sm:mt-6 flex items-center justify-center text-sm">
                        {profileSaving ? <><svg className="animate-spin h-4 w-4 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> กำลังบันทึก...</> : <><Save className="w-4.5 h-4.5 mr-1.5 sm:mr-2" /> บันทึกข้อมูล</>}
                    </button>
                </form>
            </div>
        </div>
      </div>
      )}
    </div>
  );
}