// ================================================================
// pages/PetitionDashboard.tsx
// ================================================================
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiListPetitions } from '../services/petitionApi';
import { apiGetSettings } from '../services/api';
import { formatDateTimeTH } from '../utils';
import { exportViaPrint } from '../utils/exportPetitionPdf';
import { apiGetPetition } from '../services/petitionApi';
import type { Petition } from '../types/petition';
import type { SettingWindow } from '../types';
import { PETITION_TYPE_LABELS } from '../types/petition';
import {
  Plus, ChevronRight, RefreshCw, LogOut, Moon, Sun,
  ClipboardList, Inbox, FileDown, Search, X, ChevronDown,
  ArrowUpDown, SlidersHorizontal, CalendarClock, CalendarX2
} from 'lucide-react';
import { Spinner } from '../components/ui';
import CreatePetitionModal from '../components/petition/CreatePetitionModal';
import PetitionDetailModal from '../components/petition/PetitionDetailModal';

type TabKey = 'all' | 'pending' | 'approved' | 'rejected';
type SortKey = 'newest' | 'oldest' | 'type_az' | 'code_az';

const TAB_LABELS: Record<TabKey, string> = {
  all:      'ทั้งหมด',
  pending:  'รอดำเนินการ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธแล้ว',
};

const SORT_LABELS: Record<SortKey, string> = {
  newest:  'ใหม่สุด → เก่าสุด',
  oldest:  'เก่าสุด → ใหม่สุด',
  type_az: 'ประเภทคำร้อง (A-Z)',
  code_az: 'รหัสโครงงาน (A-Z)',
};

function statusBadge(status: string) {
  if (status === 'เสร็จสิ้น')
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">✓ เสร็จสิ้น</span>;
  if (status === 'ปฏิเสธ')
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">✗ ปฏิเสธ</span>;
  return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">⏳ รอดำเนินการ</span>;
}

function typeIcon(type: string) {
  const icons: Record<string, string> = {
    '1': '🏫', '2': '🏫', '3': '🚫', '4': '✏️', '5': '🔄', '6': '📝',
  };
  return icons[type] || '📋';
}

import type { PageView } from '../App';

interface Props {
  setPageView?: (v: PageView) => void;
}

export default function PetitionDashboard({ setPageView }: Props = {}) {
  const { user, theme, toggleTheme, logout } = useAuthStore();
  const [petitions, setPetitions] = useState<Petition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedPetition, setSelectedPetition] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  // ── Sort & Filter state ──
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [searchId, setSearchId] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCode, setFilterCode] = useState('');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  // ── Open/close window for advisor add/remove petitions (type 1/2/3) ──
  const [advisorWindow, setAdvisorWindow] = useState<SettingWindow | null>(null);

  useEffect(() => {
    apiGetSettings()
      .then(res => { if (res.status === 'success') setAdvisorWindow(res.settings.petition_advisor); })
      .catch(() => { /* non-critical — fall back to "always open" */ });
  }, []);

  // Close sort menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const canCreate = user?.role === 'student' || user?.role === 'advisor_main';

  // Unique petition types and project codes for filter dropdowns
  const uniqueTypes = useMemo(() => {
    const seen = new Set<string>();
    const result: { value: string; label: string }[] = [];
    petitions.forEach(p => {
      if (!seen.has(p.petition_type)) {
        seen.add(p.petition_type);
        result.push({
          value: p.petition_type,
          label: p.petition_type_label || PETITION_TYPE_LABELS[Number(p.petition_type)] || `ประเภท ${p.petition_type}`,
        });
      }
    });
    return result.sort((a, b) => Number(a.value) - Number(b.value));
  }, [petitions]);

  const uniqueCodes = useMemo(() => {
    const seen = new Set<string>();
    petitions.forEach(p => seen.add(p.project_code));
    return Array.from(seen).sort();
  }, [petitions]);

  // Count active filters
  const activeFilterCount = [searchId, filterType, filterCode].filter(Boolean).length;

  const handleExport = async (e: React.MouseEvent, petitionId: string) => {
    e.stopPropagation();
    setExportingId(petitionId);
    try {
      const res = await apiGetPetition(petitionId);
      if (res.status === 'success') {
        await exportViaPrint(res.petition);
      }
    } catch {
      // silently ignore
    } finally {
      setExportingId(null);
    }
  };

  const fetchPetitions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiListPetitions();
      if (res.status === 'success') {
        setPetitions(res.petitions);
      } else {
        setError(res.message || 'โหลดข้อมูลล้มเหลว');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPetitions(); }, [fetchPetitions]);

  // ── Filter + Sort pipeline ──
  const filtered = useMemo(() => {
    let list = [...petitions];

    // Tab filter (status)
    if (activeTab === 'pending')  list = list.filter(p => p.status === 'รอดำเนินการ');
    if (activeTab === 'approved') list = list.filter(p => p.status === 'เสร็จสิ้น');
    if (activeTab === 'rejected') list = list.filter(p => p.status === 'ปฏิเสธ');

    // Search by ID
    if (searchId.trim()) {
      const q = searchId.trim().toLowerCase();
      list = list.filter(p => p.petition_id.toLowerCase().includes(q));
    }

    // Filter by type
    if (filterType) list = list.filter(p => p.petition_type === filterType);

    // Filter by project code
    if (filterCode) list = list.filter(p => p.project_code === filterCode);

    // Sort
    list.sort((a, b) => {
      if (sortKey === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortKey === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortKey === 'type_az') {
        const la = a.petition_type_label || PETITION_TYPE_LABELS[Number(a.petition_type)] || '';
        const lb = b.petition_type_label || PETITION_TYPE_LABELS[Number(b.petition_type)] || '';
        return la.localeCompare(lb, 'th');
      }
      if (sortKey === 'code_az') return a.project_code.localeCompare(b.project_code);
      return 0;
    });

    return list;
  }, [petitions, activeTab, sortKey, searchId, filterType, filterCode]);

  const counts: Record<TabKey, number> = {
    all:      petitions.length,
    pending:  petitions.filter(p => p.status === 'รอดำเนินการ').length,
    approved: petitions.filter(p => p.status === 'เสร็จสิ้น').length,
    rejected: petitions.filter(p => p.status === 'ปฏิเสธ').length,
  };

  const clearFilters = () => {
    setSearchId('');
    setFilterType('');
    setFilterCode('');
  };

  return (
    <div className="pb-10 app-shell transition-colors">
      {/* Header */}
      <nav className="glass-panel border-b-0 shadow-sm sticky top-0 z-40 relative">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-500 to-pink-500"></div>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 px-4 py-4 mt-1">
          <div className="flex items-center gap-4 w-full">
            {setPageView && (
              <button
                onClick={() => setPageView('main')}
                className="btn-liquid text-xs sm:text-sm font-bold bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 px-3.5 py-2 rounded-full border border-neutral-200 dark:border-neutral-700 flex items-center hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors shadow-sm outline-none"
              >
                ← หน้าหลัก
              </button>
            )}
            <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-neutral-800 dark:text-white flex items-center">ระบบคำร้องออนไลน์</h1>
              <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                {user?.name} · {user?.role === 'student' ? 'นักเรียน' : user?.role === 'advisor_main' ? 'อาจารย์ที่ปรึกษา' : user?.role === 'advisor' ? 'ที่ปรึกษาร่วม' : 'ผู้ดูแลระบบ'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={fetchPetitions} title="รีเฟรช" className="btn-liquid bg-neutral-100 dark:bg-neutral-800 p-2.5 rounded-full text-neutral-600 dark:text-neutral-300 outline-none hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-transparent dark:border-neutral-700">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={toggleTheme} className="btn-liquid bg-neutral-100 dark:bg-neutral-800 p-2.5 rounded-full text-neutral-600 dark:text-neutral-300 outline-none hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-transparent dark:border-neutral-700">
              {theme === 'dark' ? <Sun className="w-4.5 h-4.5 text-orange-400" /> : <Moon className="w-4.5 h-4.5" />}
            </button>
            <button onClick={logout} className="text-xs sm:text-sm text-rose-600 dark:text-rose-400 font-bold bg-rose-50 dark:bg-rose-950/30 px-4 py-2 rounded-full border border-rose-100 dark:border-rose-900/50 flex items-center btn-liquid">
              <LogOut className="w-3.5 h-3.5 mr-1.5 opacity-90" /> <span className="hidden sm:inline">ออกระบบ</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto mt-4 sm:mt-8 px-3 sm:px-4 space-y-4 sm:space-y-6">
        {/* Page title + create button */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-neutral-800 dark:text-white flex items-center"><ClipboardList className="w-5 h-5 mr-2 text-orange-500" /> คำร้องออนไลน์</h2>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="btn-liquid flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm text-white bg-orange-500 hover:bg-orange-600 shadow-md shadow-orange-200/60 dark:shadow-orange-900/30 transition-colors"
            >
              <Plus className="w-4 h-4" /> ยื่นคำร้องใหม่
            </button>
          )}
        </div>

        {/* ── Notice: open/close window for advisor add/remove petitions ── */}
        {advisorWindow && advisorWindow.hasLimit && (
          <div className={`rounded-2xl border p-3.5 sm:p-4 flex items-start gap-3 text-xs sm:text-sm ${
            advisorWindow.isOpen
              ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-300'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300'
          }`}>
            {advisorWindow.isOpen
              ? <CalendarClock className="w-5 h-5 mt-0.5 flex-shrink-0 opacity-80" />
              : <CalendarX2 className="w-5 h-5 mt-0.5 flex-shrink-0 opacity-80" />
            }
            <div>
              <p className="font-bold">
                {advisorWindow.isOpen ? 'เปิดรับคำร้องเพิ่ม/ถอดถอนอาจารย์ที่ปรึกษา' : 'ปิดรับคำร้องเพิ่ม/ถอดถอนอาจารย์ที่ปรึกษาแล้ว'}
              </p>
              <p className="mt-0.5 opacity-90">
                {advisorWindow.openAt && (
                  <>เปิด: {formatDateTimeTH(advisorWindow.openAt).date} {formatDateTimeTH(advisorWindow.openAt).time}</>
                )}
                {advisorWindow.openAt && advisorWindow.closeAt && '  —  '}
                {advisorWindow.closeAt && (
                  <>ปิด: {formatDateTimeTH(advisorWindow.closeAt).date} {formatDateTimeTH(advisorWindow.closeAt).time}</>
                )}
              </p>
              {!advisorWindow.isOpen && (
                <p className="mt-1 opacity-90">คำร้องประเภทอื่น (เปลี่ยนชื่อ/สาขาโครงงาน, คำร้องอื่นๆ) ยังสามารถยื่นได้ตามปกติ</p>
              )}
            </div>
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.keys(TAB_LABELS) as TabKey[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl p-4 text-left transition-all border ${
                activeTab === tab
                  ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-700 shadow-sm'
                  : 'border-transparent bg-white dark:bg-neutral-800/60 hover:border-orange-200 dark:hover:border-orange-800'
              }`}
              style={activeTab !== tab ? { background: 'var(--ios-card-bg)', borderColor: 'var(--ios-card-border)' } : {}}
            >
              <div className="text-2xl font-bold text-orange-500">{counts[tab]}</div>
              <div className="text-xs text-neutral-500 mt-0.5">{TAB_LABELS[tab]}</div>
            </button>
          ))}
        </div>

        {/* ── Sort & Filter bar ── */}
        <div className="space-y-2">
          {/* Row 1: Search + Sort + Filter toggle */}
          <div className="flex items-center gap-2">
            {/* Search by ID */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
              <input
                type="text"
                value={searchId}
                onChange={e => setSearchId(e.target.value)}
                placeholder="ค้นหาเลขที่คำร้อง..."
                className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border outline-none transition-colors"
                style={{
                  background: 'var(--glass-input-bg)',
                  borderColor: 'var(--ios-card-border)',
                  color: 'var(--glass-input-fg)',
                }}
              />
              {searchId && (
                <button
                  onClick={() => setSearchId('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort dropdown */}
            <div className="relative flex-shrink-0" ref={sortMenuRef}>
              <button
                onClick={() => setShowSortMenu(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  sortKey !== 'newest'
                    ? 'bg-orange-50 border-orange-300 text-orange-600 dark:bg-orange-900/20 dark:border-orange-700 dark:text-orange-400'
                    : 'border-transparent hover:border-neutral-200 dark:hover:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                }`}
                style={sortKey === 'newest' ? { background: 'var(--ios-card-bg)', borderColor: 'var(--ios-card-border)' } : {}}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">เรียง</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showSortMenu ? 'rotate-180' : ''}`} />
              </button>
              {showSortMenu && (
                <div
                  className="absolute right-0 top-full mt-1.5 w-52 rounded-xl overflow-hidden shadow-lg z-50 border"
                  style={{ background: 'var(--glass-panel-bg)', borderColor: 'var(--ios-card-border)' }}
                >
                  {(Object.keys(SORT_LABELS) as SortKey[]).map(key => (
                    <button
                      key={key}
                      onClick={() => { setSortKey(key); setShowSortMenu(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                        sortKey === key
                          ? 'text-orange-500 bg-orange-50 dark:bg-orange-900/20 font-semibold'
                          : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/60'
                      }`}
                    >
                      {SORT_LABELS[key]}
                      {sortKey === key && <span className="text-orange-500">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors flex-shrink-0 ${
                activeFilterCount > 0
                  ? 'bg-orange-50 border-orange-300 text-orange-600 dark:bg-orange-900/20 dark:border-orange-700 dark:text-orange-400'
                  : 'border-transparent hover:border-neutral-200 dark:hover:border-neutral-700 text-neutral-600 dark:text-neutral-300'
              }`}
              style={activeFilterCount === 0 ? { background: 'var(--ios-card-bg)', borderColor: 'var(--ios-card-border)' } : {}}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ตัวกรอง</span>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Row 2: Filter dropdowns (collapsible) */}
          {showFilters && (
            <div className="flex flex-wrap gap-2 items-center p-3 rounded-xl border" style={{ background: 'var(--ios-card-bg)', borderColor: 'var(--ios-card-border)' }}>
              {/* Filter by type */}
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="flex-1 min-w-[160px] px-3 py-2 text-sm rounded-lg border outline-none transition-colors appearance-none cursor-pointer"
                style={{
                  background: 'var(--glass-input-bg)',
                  borderColor: filterType ? '#f97316' : 'var(--ios-card-border)',
                  color: 'var(--glass-input-fg)',
                }}
              >
                <option value="">ทุกประเภทคำร้อง</option>
                {uniqueTypes.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>

              {/* Filter by project code */}
              <select
                value={filterCode}
                onChange={e => setFilterCode(e.target.value)}
                className="flex-1 min-w-[140px] px-3 py-2 text-sm rounded-lg border outline-none transition-colors appearance-none cursor-pointer"
                style={{
                  background: 'var(--glass-input-bg)',
                  borderColor: filterCode ? '#f97316' : 'var(--ios-card-border)',
                  color: 'var(--glass-input-fg)',
                }}
              >
                <option value="">ทุกรหัสโครงงาน</option>
                {uniqueCodes.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* Clear filters */}
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-rose-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex-shrink-0"
                >
                  <X className="w-3 h-3" /> ล้างตัวกรอง
                </button>
              )}
            </div>
          )}

          {/* Active filter summary */}
          {(activeFilterCount > 0 || sortKey !== 'newest') && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              <span>แสดง</span>
              <span className="font-semibold text-orange-500">{filtered.length}</span>
              <span>รายการ</span>
              {sortKey !== 'newest' && (
                <span className="px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400">
                  เรียง: {SORT_LABELS[sortKey]}
                </span>
              )}
              {filterType && (
                <span className="px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 flex items-center gap-1">
                  {uniqueTypes.find(t => t.value === filterType)?.label}
                  <button onClick={() => setFilterType('')}><X className="w-2.5 h-2.5" /></button>
                </span>
              )}
              {filterCode && (
                <span className="px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 flex items-center gap-1">
                  {filterCode}
                  <button onClick={() => setFilterCode('')}><X className="w-2.5 h-2.5" /></button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Tabs + List */}
        <div className="rounded-2xl overflow-hidden border" style={{ background: 'var(--glass-panel-bg)', borderColor: 'var(--ios-card-border)', boxShadow: 'var(--ios-card-shadow)' }}>
          {/* Tab bar */}
          <div className="flex border-b" style={{ borderColor: 'var(--table-head-border)' }}>
            {(Object.keys(TAB_LABELS) as TabKey[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-xs font-semibold transition-colors relative ${
                  activeTab === tab ? 'text-orange-500' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
              >
                {TAB_LABELS[tab]}
                {tab !== 'all' && counts[tab] > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                    {counts[tab]}
                  </span>
                )}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* List */}
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner className="w-8 h-8 text-orange-500" />
            </div>
          ) : error ? (
            <div className="py-12 text-center text-rose-500 text-sm">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Inbox className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-400">
                {activeFilterCount > 0 || searchId ? 'ไม่พบคำร้องที่ตรงกับเงื่อนไข' : 'ไม่มีคำร้องในหมวดนี้'}
              </p>
              {activeFilterCount > 0 || searchId ? (
                <button onClick={() => { clearFilters(); setSearchId(''); }} className="mt-3 text-xs text-orange-500 hover:underline">
                  ล้างตัวกรองทั้งหมด
                </button>
              ) : canCreate && activeTab === 'all' ? (
                <button onClick={() => setShowCreate(true)} className="mt-3 text-xs text-orange-500 hover:underline">
                  + ยื่นคำร้องแรก
                </button>
              ) : null}
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--table-head-border)' }}>
              {filtered.map(p => {
                const created = formatDateTimeTH(p.created_at);
                return (
                  <div
                    key={p.petition_id}
                    onClick={() => setSelectedPetition(p.petition_id)}
                    className="w-full text-left px-5 py-4 hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-colors flex items-center gap-4 cursor-pointer"
                  >
                    <div className="text-2xl flex-shrink-0">{typeIcon(p.petition_type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold truncate">
                          {p.petition_type_label || PETITION_TYPE_LABELS[Number(p.petition_type)] || `คำร้องประเภท ${p.petition_type}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-neutral-400">
                        <span className="font-mono">{p.petition_id}</span>
                        <span>·</span>
                        <span>{p.project_code}</span>
                        <span className="hidden sm:inline">·</span>
                        <span className="hidden sm:inline">{created.date}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {statusBadge(p.status)}
                      <button
                        onClick={e => handleExport(e, p.petition_id)}
                        disabled={exportingId === p.petition_id}
                        title="ส่งออก PDF"
                        className="p-1.5 rounded-lg transition-colors hover:bg-orange-100 dark:hover:bg-orange-900/20 text-orange-400 hover:text-orange-600 disabled:opacity-40"
                      >
                        {exportingId === p.petition_id
                          ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin block" />
                          : <FileDown className="w-3.5 h-3.5" />
                        }
                      </button>
                      <ChevronRight className="w-4 h-4 text-neutral-400" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreate && (
        <CreatePetitionModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); fetchPetitions(); }}
        />
      )}
      {selectedPetition && (
        <PetitionDetailModal
          petitionId={selectedPetition}
          onClose={() => setSelectedPetition(null)}
          onUpdate={fetchPetitions}
        />
      )}
    </div>
  );
}