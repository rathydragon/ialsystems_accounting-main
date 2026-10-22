import { authFetch } from './apiClient';

/**
 * Telegram "IAL Booking" channel records (Hostinger MySQL via /api/telegram-bookings).
 * Posts arrive through the bot webhook; this service only reads and edits them.
 */

/** NOT_PICKED: the driver went but could not pick up the shipment. */
export type TgBookingStatus = 'PENDING' | 'ASSIGNED' | 'ACCEPTED' | 'DONE' | 'NOT_PICKED' | 'CANCELLED';

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
  /** Team member linked to the posting Telegram account (team tg_user_id = author_id). */
  author_member?: string | null;
  /** Bot's direct message to the pickup person. */
  notify_status?: TgNotifyStatus | null;
  /** 'need_start' when the person never pressed Start on the bot; otherwise Telegram's error. */
  notify_error?: string | null;
  notified_to?: string | null;
  notified_at?: string | null;
  /** When the current status was set (latest row of the status history). */
  status_changed_at?: string | null;
}

/** One status change: tg_button / tg_dm / tg_reply (Telegram) or web. */
export interface TgStatusLog {
  status: TgBookingStatus;
  changed_by: string | null;
  source: string | null;
  changed_at: string;
}

export type TgNotifyStatus = 'sent' | 'failed' | 'no_id';

export interface TgNotifyResult {
  status: TgNotifyStatus;
  error: string | null;
  to: string;
}

export interface TgBookingReply {
  id: number;
  message_id: number;
  /** Message this reply answers: the booking post, or another reply in the same thread. */
  reply_to_message_id?: number;
  /** Booking post the whole reply chain belongs to. */
  root_message_id?: number | null;
  reply_to_author?: string | null;
  author: string | null;
  author_id: number | null;
  author_member?: string | null;
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
  /** Telegram user id: mention in the name picker, sender name, self pick-up. */
  tg_user_id?: number | string | null;
  active: boolean;
}

/** A Telegram account seen in the booking chat. */
export interface TgAccount {
  author_id: number;
  author: string | null;
  last_at: string;
  /** Team member already linked to this account. */
  member: string | null;
}

export interface TgBookingConfig {
  assigner_ids: string;
  assigner_names: string;
  chat_id: string;
  botConfigured: boolean;
  bot?: { username?: string; first_name?: string; supports_inline_queries?: boolean } | null;
  webhook?: { url?: string; pending_update_count?: number; last_error_message?: string; last_error_date?: number; allowed_updates?: string[] } | null;
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

/** Changes whenever a booking, reply or team member is added, edited or removed. */
export const fetchTgVersion = () => request<{ version: string }>('GET', { action: 'version' });

export const fetchTgTeam = () => request<TgTeamMember[]>('GET', { action: 'team' });

export const fetchTgAccounts = () => request<TgAccount[]>('GET', { action: 'tg_accounts' });

export const fetchTgStatusLog = (id: number) => request<TgStatusLog[]>('GET', { action: 'status_log', id });

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
) => request<{ notify: TgNotifyResult | null } | undefined>('POST', { action: 'update_booking', id, ...patch });

/** Send the booking to the pickup person's Telegram again (e.g. after they pressed Start). */
export const notifyTgPickup = (id: number) =>
  request<{ notify: TgNotifyResult | null }>('POST', { action: 'notify_pickup', id });

export const deleteTgBooking = (id: number) => request<void>('POST', { action: 'delete_booking', id });

export const saveTgTeamMember = (member: TgTeamMember) =>
  request<TgTeamMember[]>('POST', { action: 'save_team_member', member });

/** Adds many members at once; names already in the team are skipped by the server. */
export const importTgTeam = (members: Pick<TgTeamMember, 'name' | 'role' | 'phone'>[]) =>
  request<{ inserted: number; team: TgTeamMember[] }>('POST', { action: 'import_team', members });

export const deleteTgTeamMember = (id: number) =>
  request<TgTeamMember[]>('POST', { action: 'delete_team_member', id });

export const saveTgConfig = (config: Partial<Pick<TgBookingConfig, 'assigner_ids' | 'assigner_names' | 'chat_id'>>) =>
  request<TgBookingConfig>('POST', { action: 'save_config', config });

export const setTgWebhook = (baseUrl?: string) =>
  request<{ url: string }>('POST', { action: 'set_webhook', baseUrl });
