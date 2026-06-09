import { LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { ThemeToggleButton, Avatar } from '../ui';
import Swal from 'sweetalert2';

interface HeaderProps {
  onProfileClick?: () => void;
  showProfileBtn?: boolean;
}

export function Header({ onProfileClick, showProfileBtn = false }: HeaderProps) {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Swal.fire({
      title: 'คุณต้องการออกจากระบบหรือไม่?',
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

  if (!user) return null;

  return (
    <header className="glass-panel sticky top-0 z-40 w-full transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 sm:h-20">
          {/* Logo & Platform Name */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-orange-500 to-rose-500 flex items-center justify-center text-white font-black text-base sm:text-xl shadow-md shadow-orange-500/20">
              S
            </div>
            <div>
              <span className="font-extrabold text-sm sm:text-lg block tracking-tight">
                SCI&apos;US NU
              </span>
              <span className="text-[10px] sm:text-xs text-neutral-400 dark:text-neutral-500 font-bold block tracking-wider -mt-1 uppercase">
                Smart submission
              </span>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeToggleButton />

            {/* Profile trigger (if student dashboard) */}
            {showProfileBtn && onProfileClick ? (
              <button
                type="button"
                onClick={onProfileClick}
                className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity outline-none"
              >
                <Avatar
                  src={user.profileUrl}
                  alt={user.name}
                  size="sm"
                  className="sm:w-9 sm:h-9"
                />
                <div className="hidden md:block">
                  <p className="text-xs font-bold text-neutral-800 dark:text-white leading-tight">
                    {user.name}
                  </p>
                  <p className="text-[10px] text-neutral-400 font-medium">
                    {user.studentId ? `รหัสนักเรียน: ${user.studentId}` : user.email}
                  </p>
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Avatar
                  src={user.profileUrl}
                  alt={user.name}
                  size="sm"
                  className="sm:w-9 sm:h-9"
                />
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold text-neutral-800 dark:text-white leading-tight">
                    {user.name}
                  </p>
                  <p className="text-[10px] text-neutral-400 font-medium">
                    {user.role === 'admin'
                      ? 'ผู้ดูแลระบบ (Admin)'
                      : user.role === 'advisor_main'
                      ? 'อาจารย์ที่ปรึกษาหลัก'
                      : user.role === 'advisor'
                      ? 'อาจารย์ที่ปรึกษา'
                      : 'ผู้เข้าชม (Viewer)'}
                  </p>
                </div>
              </div>
            )}

            {/* Logout Button */}
            <button
              type="button"
              onClick={handleLogout}
              className="btn-liquid p-2 sm:p-2.5 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-500 dark:text-rose-400 transition-colors border border-transparent hover:border-rose-100 dark:hover:border-rose-950/30"
              title="ออกจากระบบ"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
