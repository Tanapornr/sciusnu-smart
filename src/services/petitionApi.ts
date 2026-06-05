// ================================================================
// services/petitionApi.ts — All petition API calls
// ================================================================
import type {
  PetitionListResponse,
  PetitionDetailResponse,
  CreatePetitionPayload,
  PetitionApprovePayload,
} from '../types/petition';

const BASE = import.meta.env.VITE_API_URL as string;
const TOKEN_KEY = 'sciusnu_session_token';

function getToken() { return sessionStorage.getItem(TOKEN_KEY); }

async function petitionFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(text).message ?? msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ── Create Petition ───────────────────────────────────────────────
export async function apiCreatePetition(payload: CreatePetitionPayload) {
  return petitionFetch<{ status: string; petition_id: string; message?: string }>(
    '/api/petitions',
    { method: 'POST', body: JSON.stringify(payload) }
  );
}

// ── List Petitions ────────────────────────────────────────────────
export async function apiListPetitions(): Promise<PetitionListResponse> {
  return petitionFetch<PetitionListResponse>('/api/petitions');
}

// ── Get Petition Detail ───────────────────────────────────────────
export async function apiGetPetition(id: string): Promise<PetitionDetailResponse> {
  return petitionFetch<PetitionDetailResponse>(`/api/petitions/${encodeURIComponent(id)}`);
}

// ── Approve Petition ──────────────────────────────────────────────
export async function apiApprovePetition(id: string, payload: PetitionApprovePayload) {
  return petitionFetch<{ status: string; message?: string }>(
    `/api/petitions/${encodeURIComponent(id)}/approve`,
    { method: 'POST', body: JSON.stringify(payload) }
  );
}

// ── Reject Petition ───────────────────────────────────────────────
export async function apiRejectPetition(id: string, payload: PetitionApprovePayload) {
  return petitionFetch<{ status: string; message?: string }>(
    `/api/petitions/${encodeURIComponent(id)}/reject`,
    { method: 'POST', body: JSON.stringify(payload) }
  );
}
