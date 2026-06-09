// ================================================================
// Reusable UI primitives
// ================================================================
import { clsx } from 'clsx';
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

// ── Spinner ─────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('animate-spin', className ?? 'h-8 w-8 text-orange-500')}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// ── LoadingScreen ────────────────────────────────────────────────
export function LoadingScreen({ label = 'กำลังโหลดข้อมูล...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-5">
      <Spinner className="h-10 w-10 text-orange-500" />
      <span className="text-sm text-neutral-500 font-medium tracking-wide">{label}</span>
    </div>
  );
}

// ── ErrorScreen ──────────────────────────────────────────────────
export function ErrorScreen({
  message = 'โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ',
}: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-rose-600">
      <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span className="font-bold text-sm">{message}</span>
    </div>
  );
}

// ── ThemeToggleButton ────────────────────────────────────────────
export function ThemeToggleButton({ className }: { className?: string }) {
  const { theme, toggleTheme } = useAuthStore();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      id="theme-toggle-btn"
      aria-label="Toggle theme"
      className={clsx(
        'btn-liquid p-2 sm:p-2.5 rounded-full outline-none transition-colors',
        'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300',
        'hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-transparent dark:border-neutral-700',
        className,
      )}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4 text-orange-400" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

// ── Button ───────────────────────────────────────────────────────
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  children: ReactNode;
}
export function Button({ variant = 'primary', loading, children, className, disabled, ...rest }: ButtonProps) {
  const variantClass: Record<string, string> = {
    primary: 'bg-neutral-800 dark:bg-neutral-700 text-white hover:bg-neutral-900 border border-neutral-900 dark:border-neutral-600',
    secondary: 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50',
    danger: 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50',
    ghost: 'bg-transparent text-neutral-600 dark:text-neutral-300',
  };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'btn-liquid font-bold rounded-xl px-4 py-3 text-sm flex items-center justify-center transition-all',
        variantClass[variant],
        (disabled || loading) && 'opacity-60 cursor-not-allowed',
        className,
      )}
    >
      {loading ? <Spinner className="h-4 w-4 mr-2 text-white" /> : null}
      {children}
    </button>
  );
}

// ── StatusBadge ──────────────────────────────────────────────────
type BadgeStatus = 'อนุมัติ' | 'ไม่อนุมัติ' | 'รออนุมัติ' | 'รอตรวจ' | 'รอการตรวจอนุมัติ' | string;

export function StatusBadge({ status }: { status: BadgeStatus }) {
  const approved = status === 'อนุมัติ';
  const rejected = status === 'ไม่อนุมัติ' || status === 'ต้องแก้ไข';
  const resubmit = status === 'รอการตรวจอนุมัติ';

  const cls = approved
    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
    : rejected
    ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/70 dark:text-rose-400 border border-rose-200 dark:border-rose-900'
    : resubmit
    ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
    : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800';

  const label = approved
    ? 'อนุมัติ'
    : rejected
    ? 'ต้องแก้ไข'
    : resubmit
    ? 'รอการตรวจอนุมัติ'
    : 'รออนุมัติ';

  return (
    <span className={clsx('px-3 py-1.5 rounded-lg text-xs font-extrabold inline-flex items-center whitespace-nowrap', cls)}>
      {approved && (
        <svg className="w-4 h-4 mr-1.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10"/></svg>
      )}
      {rejected && (
        <svg className="w-4 h-4 mr-1.5 flex-shrink-0 opacity-80" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      )}
      {!approved && !rejected && (
        <svg className="w-4 h-4 mr-1.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      )}
      {label}
    </span>
  );
}

// ── Modal ────────────────────────────────────────────────────────
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}
export function Modal({ isOpen, onClose, children, maxWidth = 'max-w-sm' }: ModalProps) {
  if (!isOpen) return null;
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className={clsx('modal-panel glass-panel', maxWidth)}>
        {children}
      </div>
    </div>
  );
}

// ── Input ────────────────────────────────────────────────────────
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  variant?: 'default' | 'login';
}
export function Input({ label, error, variant = 'default', className, id, ...rest }: InputProps) {
  const inputClass = 'glass-input';
  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 ml-1">
          {label}
        </label>
      )}
      <input
        id={id}
        className={clsx('w-full rounded-xl p-3.5 text-sm outline-none font-medium', inputClass, className)}
        {...rest}
      />
      {error && <p className="text-xs text-rose-500 mt-1 ml-1">{error}</p>}
    </div>
  );
}

// ── Avatar ───────────────────────────────────────────────────────
export function Avatar({
  src,
  alt,
  size = 'md',
  className,
}: { src?: string; alt?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const sizeClass = { sm: 'w-8 h-8', md: 'w-10 h-10', lg: 'w-14 h-14', xl: 'w-20 h-20' }[size];
  return (
    <img
      src={src || 'https://ui-avatars.com/api/?name=User&background=f0f0f0&color=1a1a1a'}
      alt={alt ?? 'avatar'}
      loading="lazy"
      className={clsx('rounded-full object-cover border-2 border-white dark:border-neutral-700 shadow-sm bg-white', sizeClass, className)}
    />
  );
}
