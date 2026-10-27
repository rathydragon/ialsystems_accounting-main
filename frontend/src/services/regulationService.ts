import { authFetch } from './apiClient';

/**
 * Internal Regulations (បទបញ្ជាផ្ទៃក្នុង) — Hostinger MySQL tbl_internal_regulations via
 * /api/remote-mysql actions. Everyone can read; only ADMIN can change it.
 */

export type RegulationKind = 'CHAPTER' | 'SECTION' | 'ARTICLE' | 'NOTE';

export interface RegulationBlock {
  id?: number;
  kind: RegulationKind;
  title: string;
  body: string;
  sort_order?: number;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

const ENDPOINT = '/api/remote-mysql';

async function request<T>(method: 'GET' | 'POST', params: Record<string, unknown>): Promise<T> {
  const res =
    method === 'GET'
      ? await authFetch(`${ENDPOINT}?${new URLSearchParams(params as Record<string, string>).toString()}`)
      : await authFetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON error page
  }
  if (!res.ok || !json?.ok) throw new Error(json?.message || `Request failed (HTTP ${res.status})`);
  return json.data as T;
}

export const fetchRegulations = () => request<RegulationBlock[]>('GET', { action: 'regulations_list' });

/** Creates (no id) or updates a block. afterId: 0 = put at the top, a block id = put right after it, omitted = at the end. */
export const saveRegulation = (block: RegulationBlock, afterId?: number | null) =>
  request<RegulationBlock[]>('POST', { action: 'regulations_save', block, afterId: afterId ?? null });

export const deleteRegulation = (id: number) => request<RegulationBlock[]>('POST', { action: 'regulations_delete', id });

export const moveRegulation = (id: number, direction: 'up' | 'down') =>
  request<RegulationBlock[]>('POST', { action: 'regulations_move', id, direction });
