// ================================================================
// components/petition/PetitionNavButton.tsx
// Drop-in nav button to add to existing dashboards (Student, Advisor, Admin)
// Shows pending badge count for approvers
// ================================================================
import { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { apiListPetitions } from '../../services/petitionApi';
import { useAuthStore } from '../../store/authStore';
import type { PageView } from '../../App';

interface Props {
  pageView: PageView;
  setPageView: (v: PageView) => void;
}

export default function PetitionNavButton({ pageView, setPageView }: Props) {
  const { user } = useAuthStore();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    // Only fetch badge count for approvers
    if (!user) return;

    apiListPetitions()
      .then(res => {
        if (res.status !== 'success') return;
        const email = (user.email || '').trim().toLowerCase();
        let count = 0;
        for (const p of res.petitions) {
          if (p.status !== 'รอดำเนินการ') continue;
          try {
            const chainData = JSON.parse(p.payload_json || '{}');
            const chain = chainData.chain || [];
            // Find the first step with no status
            const pendingStep = chain.find(
              (s: { role: string; email: string }) =>
                !(p as any)[s.role]?.status
            );
            if (pendingStep && pendingStep.email.trim().toLowerCase() === email) {
              count++;
            }
          } catch { /* ignore */ }
        }
        setPendingCount(count);
      })
      .catch(() => {/* silently ignore */});
  }, [user]);

  const active = pageView === 'petitions';

  return (
    <button
      onClick={() => setPageView(active ? 'main' : 'petitions')}
      className={`btn-liquid relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
        active
          ? 'bg-orange-500 text-white shadow-md shadow-orange-200/50 dark:shadow-orange-900/30'
          : 'text-neutral-600 dark:text-neutral-300 hover:bg-orange-50 dark:hover:bg-orange-900/20 hover:text-orange-600'
      }`}
      title="ระบบคำร้องออนไลน์"
    >
      <ClipboardList className="w-4 h-4 flex-shrink-0" />
      <span className="hidden sm:inline">คำร้อง</span>

      {/* Pending badge */}
      {pendingCount > 0 && !active && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
          {pendingCount > 9 ? '9+' : pendingCount}
        </span>
      )}
    </button>
  );
}
