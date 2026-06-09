// ================================================================
// src/hooks/useProjectData.ts  (new file)
// Session-level L3 cache for project + submission data.
//
// WHY:
//   Each dashboard page previously called apiGetData() independently
//   on mount. Navigating between pages triggered redundant network
//   requests. This hook shares one in-memory memo across all pages
//   for the duration of the browser session.
//
// USAGE:
//   import { useProjectData } from '../hooks/useProjectData';
//
//   function StudentDashboard() {
//     const { data, loading, error, refetch } = useProjectData();
//     if (loading) return <Spinner />;
//     if (error)   return <ErrorBanner message={error} />;
//     const { projects, submissions } = data;
//     ...
//   }
//
// LOGOUT:
//   Call clearDataCache() when the user logs out so the next login
//   always fetches fresh data:
//
//   import { clearDataCache } from '../hooks/useProjectData';
//   await apiLogout();
//   clearDataCache();
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import { apiGetData } from '../services/api';
import type { DataApiResponse } from '../types';

// ── Module-level memo (survives component unmount within a session) ──
interface CacheEntry {
  data: DataApiResponse;
  fetchedAt: number;
}

const TTL_MS = 60_000; // 1 minute — matches the backend L1 cache TTL
let _cache: CacheEntry | null = null;
// Tracks any in-flight request so concurrent callers share one fetch
let _inflight: Promise<DataApiResponse> | null = null;

/** Call this when the user logs out to guarantee fresh data on next login. */
export function clearDataCache(): void {
  _cache    = null;
  _inflight = null;
}

/** Force-bust the cache (e.g. after a submit or status update). */
export function invalidateDataCache(): void {
  _cache = null;
}

// ── Hook ─────────────────────────────────────────────────────────

interface UseProjectDataResult {
  data:     DataApiResponse | null;
  loading:  boolean;
  error:    string | null;
  /** Manually trigger a fresh fetch (bypasses cache). */
  refetch:  () => void;
}

export function useProjectData(): UseProjectDataResult {
  const [data,    setData]    = useState<DataApiResponse | null>(_cache?.data ?? null);
  const [loading, setLoading] = useState<boolean>(!_cache);
  const [error,   setError]   = useState<string | null>(null);
  const [tick,    setTick]    = useState(0); // increment to trigger refetch

  const fetch = useCallback(async (force = false) => {
    // Check cache freshness
    const fresh = _cache && (Date.now() - _cache.fetchedAt) < TTL_MS;
    if (!force && fresh) {
      setData(_cache!.data);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Deduplicate concurrent calls — share one inflight promise
      if (!_inflight) {
        _inflight = apiGetData().finally(() => { _inflight = null; });
      }
      const result = await _inflight;
      _cache = { data: result, fetchedAt: Date.now() };
      setData(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch(tick > 0); // first mount: respect cache; explicit refetch: force
  }, [fetch, tick]);

  const refetch = useCallback(() => {
    invalidateDataCache();
    setTick(t => t + 1);
  }, []);

  return { data, loading, error, refetch };
}
