// ================================================================
// pages/PetitionDashboard.tsx
// ================================================================
import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiListPetitions } from '../services/petitionApi';
import { formatDateTimeTH } from '../utils';
import { exportViaPrint } from '../utils/exportPetitionPdf';
import { apiGetPetition } from '../services/petitionApi';
import type { Petition } from '../types/petition';
import { PETITION_TYPE_LABELS } from '../types/petition';
import {
  Plus, ChevronRight, RefreshCw, LogOut, Moon, Sun,
  ClipboardList, Inbox, FileDown
} from 'lucide-react';
import { Spinner } from '../components/ui';
import CreatePetitionModal from '../components/petition/CreatePetitionModal';
import PetitionDetailModal from '../components/petition/PetitionDetailModal';

type TabKey = 'all' | 'pending' | 'approved' | 'rejected';

const TAB_LABELS: Record<TabKey, string> = {
  all:      'ทั้งหมด',
  pending:  'รอดำเนินการ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธแล้ว',
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

  const canCreate = user?.role === 'student' || user?.role === 'advisor_main';

  // Export a petition to PDF — fetches full detail first (for payload + chain)
  const handleExport = async (e: React.MouseEvent, petitionId: string) => {
    e.stopPropagation(); // don't open the detail modal
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

  const filtered = petitions.filter(p => {
    if (activeTab === 'all')      return true;
    if (activeTab === 'pending')  return p.status === 'รอดำเนินการ';
    if (activeTab === 'approved') return p.status === 'เสร็จสิ้น';
    if (activeTab === 'rejected') return p.status === 'ปฏิเสธ';
    return true;
  });

  const counts: Record<TabKey, number> = {
    all:      petitions.length,
    pending:  petitions.filter(p => p.status === 'รอดำเนินการ').length,
    approved: petitions.filter(p => p.status === 'เสร็จสิ้น').length,
    rejected: petitions.filter(p => p.status === 'ปฏิเสธ').length,
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
              <p className="text-sm text-neutral-400">ไม่มีคำร้องในหมวดนี้</p>
              {canCreate && activeTab === 'all' && (
                <button onClick={() => setShowCreate(true)} className="mt-3 text-xs text-orange-500 hover:underline">
                  + ยื่นคำร้องแรก
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--table-head-border)' }}>
              {filtered.map(p => {
                const created = formatDateTimeTH(p.created_at);
                return (
                  <button
                    key={p.petition_id}
                    onClick={() => setSelectedPetition(p.petition_id)}
                    className="w-full text-left px-5 py-4 hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-colors flex items-center gap-4"
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
                  </button>
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