// ================================================================
// pages/PetitionDashboard.tsx
// ================================================================
import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { apiListPetitions } from '../services/petitionApi';
import { formatDateTimeTH } from '../utils';
import type { Petition } from '../types/petition';
import { PETITION_TYPE_LABELS } from '../types/petition';
import {
  Plus, ChevronRight, RefreshCw, LogOut, Moon, Sun,
  ClipboardList, Inbox
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

  const canCreate = user?.role === 'student' || user?.role === 'advisor_main';

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
    <div className="min-h-screen" style={{ background: 'var(--color-bg)', color: 'var(--color-fg)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b" style={{ background: 'var(--glass-panel-bg)', borderColor: 'var(--glass-panel-border)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {setPageView && (
              <button
                onClick={() => setPageView('main')}
                className="btn-liquid flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 transition-all border border-neutral-200/50 dark:border-neutral-700/50 mr-2"
              >
                ← หน้าหลัก
              </button>
            )}
            <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-sm">ระบบคำร้องออนไลน์</span>
              <span className="text-xs text-neutral-400 ml-2 hidden sm:inline">SCiUS NU</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchPetitions} title="รีเฟรช" className="btn-liquid p-2 rounded-full text-neutral-500 hover:text-orange-500 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={toggleTheme} className="btn-liquid p-2 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors">
              {theme === 'dark' ? <Sun className="w-4 h-4 text-orange-400" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={logout} className="btn-liquid flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
              <LogOut className="w-3.5 h-3.5" /> ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Page title + create button */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">คำร้องออนไลน์</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              {user?.name} · {user?.role === 'student' ? 'นักเรียน' : user?.role === 'advisor_main' ? 'อาจารย์ที่ปรึกษา' : user?.role === 'advisor' ? 'ที่ปรึกษาร่วม' : 'ผู้ดูแลระบบ'}
            </p>
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
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {statusBadge(p.status)}
                      <ChevronRight className="w-4 h-4 text-neutral-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>

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
