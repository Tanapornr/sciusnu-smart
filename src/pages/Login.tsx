import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiLogin, apiGetData } from '../services/api';
import { getDirectImageUrl } from '../utils';
import { User, Lock, Eye, EyeOff, BookOpen, LogIn, Moon, Sun } from 'lucide-react';
import Swal from 'sweetalert2';

export default function Login() {
  const { login, isAuthenticated, toggleTheme } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [isAuthenticated]);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const getMainAdvisorEmail = (project: any) => {
    const keys = Object.keys(project);
    return keys.length > 8 && project[keys[8]] != null ? project[keys[8]].toString().trim() : "";
  };

  const isMainAdvisorEmail = async (email: string) => {
    const targetEmail = String(email || '').trim().toLowerCase();
    if (!targetEmail) return false;

    try {
      const data = await apiGetData();
      const projects = data.projects || [];
      return projects.some((project: any) => {
        const advisorEmail = getMainAdvisorEmail(project);
        return advisorEmail.toLowerCase() === targetEmail;
      });
    } catch (error) {
      console.warn('Cannot verify main advisor email', error);
      return false;
    }
  };

  const normalizeRole = (role: string) => {
    return String(role || '').trim().toLowerCase();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      return;
    }

    setIsLoading(true);

    Swal.fire({
      title: 'กำลังตรวจสอบข้อมูล...',
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); },
      customClass: { 
        popup: 'rounded-[2rem] p-6 w-[80%] max-w-sm',
        title: 'text-lg font-bold text-slate-700 dark:text-slate-200 mt-2' 
      }
    });

    try {
      const result = await apiLogin(username.trim(), password.trim());
      
      if (result.status === 'success') {
        const normalizedRole = normalizeRole(result.role);
        let finalRole = normalizedRole;
        if (normalizedRole === 'admin' || normalizedRole === 'student') {
          finalRole = normalizedRole;
        } else {
          const isMainAdvisor = await isMainAdvisorEmail(result.email);
          if (isMainAdvisor) {
            finalRole = 'advisor_main';
          } else {
            finalRole = 'viewer';
          }
        }

        const directPicUrl = getDirectImageUrl(result.profileUrl);
        const fallbackPic = `https://ui-avatars.com/api/?name=${encodeURIComponent(result.name)}&background=random`;
        const finalPic = directPicUrl ? directPicUrl : fallbackPic;

        const idDisplay = result.studentId || finalRole;
        sessionStorage.removeItem('welcomed');

        Swal.fire({
          html: `
              <div class="text-center pt-2">
                  <h2 class="text-lg sm:text-xl font-bold text-slate-800 dark:text-white mb-4">ยินดีต้อนรับ!</h2>
                  <img src="${finalPic}" class="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover mx-auto mb-4 border-[3px] border-orange-50 dark:border-slate-700 shadow-md bg-white">
                  <h3 class="text-base sm:text-lg font-bold text-slate-800 dark:text-white mb-4">${result.name}</h3>
                  <div class="flex justify-center">
                      <span class="bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-4 py-1.5 rounded-full text-xs font-semibold border border-orange-200 dark:border-orange-800 shadow-sm">ID: ${idDisplay}</span>
                  </div>
              </div>
          `,
          showConfirmButton: false, timer: 2000, customClass: { popup: 'rounded-[2rem] p-6 w-[80%] max-w-sm' }
        }).then(() => {
          login({
            email: result.email,
            name: result.name,
            role: finalRole as any,
            studentId: result.studentId,
            profileUrl: finalPic,
          });
        });
      } else {
        throw new Error(result.message || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      }
    } catch (error: any) { 
      Swal.fire({ 
        icon: 'error', 
        title: 'เข้าสู่ระบบล้มเหลว', 
        text: error.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 
        confirmButtonColor: '#f97316', 
        customClass: { popup: 'rounded-[2rem] p-5 w-[90%] max-w-sm' }
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page flex min-h-screen items-center justify-center relative overflow-x-hidden p-4 transition-colors">
      <div className="absolute top-10 left-10 w-64 h-64 sm:w-96 sm:h-96 bg-orange-500/30 dark:bg-orange-600/30 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[80px] animate-blob"></div>
      <div className="absolute top-0 right-10 w-64 h-64 sm:w-96 sm:h-96 bg-amber-500/30 dark:bg-amber-600/30 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[80px] animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-10 left-1/4 w-64 h-64 sm:w-96 sm:h-96 bg-yellow-500/30 dark:bg-yellow-600/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[80px] animate-blob animation-delay-4000"></div>

      <button
        type="button"
        onClick={toggleTheme}
        aria-label="สลับธีมสว่าง/มืด"
        className="!absolute top-6 right-6 btn-liquid theme-toggle-btn p-3 rounded-full shadow-md z-50 outline-none"
      >
        <Moon className="w-5 h-5 dark:hidden" />
        <Sun className="w-5 h-5 hidden dark:block" />
      </button>

      <div className="w-full max-w-md p-6 sm:p-8 rounded-[2rem] glass-panel relative z-10">
        
        <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-tr from-orange-500 to-amber-400 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-orange-500/30 mb-4 transform hover:scale-105 transition-transform duration-300">
                <BookOpen className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight leading-none mb-1">SCiUSNU <span className="text-orange-500">SMART</span></h1>
            <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-400 mt-2 font-medium">ระบบจัดการโครงงาน วมว. มหาวิทยาลัยนเรศวร</p>
        </div>

        <form id="loginForm" onSubmit={handleSubmit}>
            <div className="mb-5">
                <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 ml-1">ชื่อผู้ใช้ / รหัสนักเรียน</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400"><User className="w-5 h-5 opacity-80" /></div>
                    <input 
                      type="text" 
                      id="username" 
                      placeholder="กรอกข้อมูลที่นี่..." 
                      required 
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={isLoading}
                      className="w-full pl-11 pr-4 py-3.5 text-sm sm:text-base rounded-xl glass-input outline-none transition-all font-medium placeholder-slate-400" 
                    />
                </div>
            </div>
            
            <div className="mb-8">
                <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 ml-1">รหัสผ่าน</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400"><Lock className="w-5 h-5 opacity-80" /></div>
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      id="password" 
                      placeholder="••••••••" 
                      required 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      className="w-full pl-11 pr-12 py-3.5 text-sm sm:text-base rounded-xl glass-input outline-none transition-all font-medium placeholder-slate-400" 
                    />
                    <button type="button" onClick={togglePasswordVisibility} className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 outline-none transition-colors">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                </div>
            </div>

            <button type="submit" id="submitBtn" disabled={isLoading} className="w-full btn-liquid bg-[#1e293b] dark:bg-slate-700 text-white font-bold py-3.5 sm:py-4 rounded-xl text-sm sm:text-base flex items-center justify-center hover:shadow-lg transition-all border border-slate-900 dark:border-slate-600">
                <LogIn className="w-5 h-5 mr-2" /> เข้าสู่ระบบ
            </button>
        </form>

        <div className="mt-8 text-center border-t border-slate-200 dark:border-slate-700/50 pt-6">
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">มีปัญหาการเข้าสู่ระบบ? <br className="sm:hidden" /><a href="https://line.me/ti/p/pnrY3kVbE0" target="_blank" className="text-orange-600 dark:text-orange-400 font-bold hover:underline ml-1">ติดต่อเจ้าหน้าที่โครงการ</a></p>
        </div>
      </div>
    </div>
  );
}
