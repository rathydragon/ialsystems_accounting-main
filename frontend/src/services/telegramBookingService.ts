import { authFetch } from './apiClient';

/**
 * Telegram "IAL Booking" channel records (Hostinger MySQL via /api/telegram-bookings).
 * Posts arrive through the bot webhook; this service only reads and edits them.
 */

export type TgBookingStatus = 'PENDING' | 'ASSIGNED' | 'DONE' | 'CANCELLED';

export interface TgBooking {
  id: number;
  chat_id: number;
  message_id: number;
  posted_at: string;
  author: string | null;
  author_id: number | null;
  text: string | null;
  customer: string | null;
  phone: string | null;
  service_type: string | null;
  location: string | null;
  map_url: string | null;
  status: TgBookingStatus;
  picked_up_by: string | null;
  pickup_raw: string | null;
  pickup_unmatched: number;
  assigned_by: string | null;
  assigned_at: string | null;
  note: string | null;
  updated_by: string | null;
}

export interface TgBookingReply {
  id: number;
  message_id: number;
  author: string | null;
  author_id: number | null;
  text: string | null;
  accepted: number;
  reason: string | null;
  posted_at: string;
}

export interface TgTeamMember {
  id?: number;
  name: string;
  aliases: string[];
  role: string;
  phone?: string | null;
  active: boolean;
}

export interface TgBookingConfig {
  assigner_ids: string;
  assigner_names: string;
  chat_id: string;
  botConfigured: boolean;
  bot?: { username?: string; first_name?: string } | null;
  webhook?: { url?: string; pending_update_count?: number; last_error_message?: string; last_error_date?: number } | null;
  botError?: string;
}

export interface TgBookingFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
  pickedUpBy?: string;
  search?: string;
  limit?: number;
}

const ENDPOINT = '/api/telegram-bookings';

async function request<T>(method: 'GET' | 'POST', params: Record<string, any>): Promise<T> {
  let res: Response;
  if (method === 'GET') {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    res = await authFetch(`${ENDPOINT}?${qs.toString()}`);
  } else {
    res = await authFetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON error page
  }
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || `Request failed (HTTP ${res.status})`);
  }
  return json.data as T;
}

export const fetchTgBookings = (filters: TgBookingFilters) =>
  request<TgBooking[]>('GET', { action: 'list', ...filters });

export const fetchTgBookingReplies = (id: number) =>
  request<TgBookingReply[]>('GET', { action: 'replies', id });

export const fetchTgTeam = () => request<TgTeamMember[]>('GET', { action: 'team' });

export const fetchTgConfig = () => request<TgBookingConfig>('GET', { action: 'config' });

export const updateTgBooking = (
  id: number,
  patch: Partial<{
    status: TgBookingStatus;
    pickedUpBy: string;
    rememberAlias: boolean;
    customer: string;
    phone: string;
    location: string;
    serviceType: string;
    note: string;
  }>
) => request<void>('POST', { action: 'update_booking', id, ...patch });

export const deleteTgBooking = (id: number) => request<void>('POST', { action: 'delete_booking', id });

export const saveTgTeamMember = (member: TgTeamMember) =>
  request<TgTeamMember[]>('POST', { action: 'save_team_member', member });

export const deleteTgTeamMember = (id: number) =>
  request<TgTeamMember[]>('POST', { action: 'delete_team_member', id });

export const saveTgConfig = (config: Partial<Pick<TgBookingConfig, 'assigner_ids' | 'assigner_names' | 'chat_id'>>) =>
  request<TgBookingConfig>('POST', { action: 'save_config', config });

export const setTgWebhook = (baseUrl?: string) =>
  request<{ url: string }>('POST', { action: 'set_webhook', baseUrl });
