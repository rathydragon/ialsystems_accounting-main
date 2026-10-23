import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  RefreshCw,
  Search,
  Users,
  Settings2,
  ListChecks,
  AlertTriangle,
  MapPin,
  Phone,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Link2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Download,
  CalendarDays,
  MessageSquare,
} from 'lucide-react';
import { AuthUser, Payer } from '../types';
import { normalizePayerCategory } from './PayerManagementPage';
import {
  TgBooking,
  TgBookingReply,
  TgBookingStatus,
  TgTeamMember,
  TgBookingConfig,
  TgAccount,
  TgNotifyResult,
  TgStatusLog,
  notifyTgPickup,
  fetchTgStatusLog,
  fetchTgBookings,
  fetchTgBookingReplies,
  fetchTgTeam,
  fetchTgAccounts,
  fetchTgVersion,
  fetchTgConfig,
  updateTgBooking,
  deleteTgBooking,
  saveTgTeamMember,
  importTgTeam,
  deleteTgTeamMember,
  saveTgConfig,
  setTgWebhook,
} from '../services/telegramBookingService';

interface TelegramBookingPageProps {
  currentUser: AuthUser | null;
  payers?: Payer[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

type Tab = 'BOOKINGS' | 'TEAM' | 'SETTINGS';
const TAB_STORAGE_KEY = 'tg_booking_tab';
const readSavedTab = (): Tab => {
  try {
    const v = localStorage.getItem(TAB_STORAGE_KEY);
    if (v === 'BOOKINGS' || v === 'TEAM' || v === 'SETTINGS') return v;
  } catch { /* storage unavailable */ }
  return 'BOOKINGS';
};

const TZ = 'Asia/Phnom_Penh';
const LIVE_POLL_MS = 3000; // cheap version check
const FULL_REFRESH_MS = 60000; // safety net in case a change slips past the version check
const FLASH_MS = 6000;
const LOAD_LIMIT = 2000; // newest bookings loaded per date range; search falls back to the server past this

const STATUS_META: Record<TgBookingStatus, { label: string; cls: string }> = {
  PENDING: { label: 'រង់ចាំ', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30' },
  ASSIGNED: { label: 'បានចាត់', cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30' },
  ACCEPTED: { label: 'ទទួលយក', cls: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30' },
  DONE: { label: 'រួចរាល់', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30' },
  NOT_PICKED: { label: 'មិនបានយក', cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30' },
  CANCELLED: { label: 'បោះបង់', cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700/40 dark:text-slate-400 dark:border-slate-600' },
};

const REPLY_REASON: Record<string, string> = {
  assigned: 'បាន Update',
  not_authorized: 'មិនមែនអ្នក Assign',
  booking_not_found: 'រកសារដើមមិនឃើញ',
  superseded: 'មាន Reply ថ្មីជាង',
  thread: 'ឆ្លើយក្នុងខ្សែ',
  self_assigned: 'យកខ្លួនឯង',
  status_accepted: '→ ទទួលយក',
  status_done: '→ រួចរាល់',
  status_cancelled: '→ បោះបង់',
  status_not_picked: '→ មិនបានយក',
};

const STATUS_SOURCE: Record<string, string> = {
  tg_button: 'ប៊ូតុង Telegram',
  tg_dm: 'DM Telegram',
  tg_reply: 'Reply ក្នុង Group',
  web: 'Web',
};

const todayKh = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const daysAgoKh = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA', { timeZone: TZ });
const fmtTime = (v?: string | null) =>
  v ? new Date(v).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '';
/** e.g. "21 Oct 2026" — the day a booking message was posted (Cambodia time) */
const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }) : '';
const fmtDateTime = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

const inputCls =
  'w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white';
const btnCls =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
const cardCls = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl';

export const TelegramBookingPage: React.FC<TelegramBookingPageProps> = ({ currentUser, payers = [], onShowToast }) => {
  const isAdmin = String(currentUser?.role || '').toUpperCase() === 'ADMIN';
  // Only Admin may change Pick up by / status on bookings
  const canEdit = isAdmin;

  const [tab, setTab] = useState<Tab>(() => {
    const saved = readSavedTab();
    // Team and Settings are admin-only
    return saved !== 'BOOKINGS' && !isAdmin ? 'BOOKINGS' : saved;
  });
  useEffect(() => {
    try { localStorage.setItem(TAB_STORAGE_KEY, tab); } catch { /* storage unavailable */ }
  }, [tab]);
  const [bookings, setBookings] = useState<TgBooking[]>([]);
  const [team, setTeam] = useState<TgTeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState('');

  const [startDate, setStartDate] = useState(todayKh());
  const [endDate, setEndDate] = useState(todayKh());
  const [status, setStatus] = useState<string>('ALL');
  const [driver, setDriver] = useState('');
  const [sender, setSender] = useState(''); // '' = all senders
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const toastRef = useRef(onShowToast);
  toastRef.current = onShowToast;

  const [flash, setFlash] = useState<Set<number>>(new Set());
  const prevRowsRef = useRef<Map<number, string> | null>(null);
  const versionRef = useRef('');
  const inFlightRef = useRef(false);
  const reqIdRef = useRef(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(flashTimerRef.current), []);

  // Search runs client-side on the loaded range, so typing never waits on the network
  const deferredSearch = useDeferredValue(search);

  const load = useCallback(async (quiet = false) => {
    const reqId = ++reqIdRef.current;
    if (!quiet) setLoading(true);
    inFlightRef.current = true;
    try {
      const [rows, members] = await Promise.all([
        fetchTgBookings({ startDate, endDate, limit: LOAD_LIMIT }),
        fetchTgTeam(),
      ]);
      if (reqId !== reqIdRef.current) return; // a newer request superseded this one
      // Highlight rows that are new or changed since the last live refresh
      const sig = (b: TgBooking) => `${b.status}|${b.picked_up_by || ''}|${b.text || ''}|${b.note || ''}`;
      const prev = prevRowsRef.current;
      if (quiet && prev) {
        const changed = rows.filter((b) => prev.get(b.id) !== sig(b)).map((b) => b.id);
        if (changed.length) {
          setFlash(new Set(changed));
          clearTimeout(flashTimerRef.current);
          flashTimerRef.current = setTimeout(() => setFlash(new Set()), FLASH_MS);
        }
      }
      prevRowsRef.current = new Map(rows.map((b) => [b.id, sig(b)]));
      // Keep unchanged rows' object identity so memoized rows skip re-rendering
      setBookings((prevRows) => {
        const byId = new Map(prevRows.map((b) => [b.id, b]));
        return rows.map((r) => {
          const old = byId.get(r.id);
          return old && JSON.stringify(old) === JSON.stringify(r) ? old : r;
        });
      });
      setTeam(members);
      setLastLoaded(new Date());
      setLoadError('');
    } catch (err: any) {
      if (reqId !== reqIdRef.current) return;
      setLoadError(err?.message || 'Load failed');
      if (!quiet) toastRef.current(`ទាញទិន្នន័យ Booking បរាជ័យ: ${err?.message}`, 'error');
    } finally {
      if (reqId === reqIdRef.current) {
        inFlightRef.current = false;
        setLoading(false);
      }
    }
  }, [startDate, endDate]);

  // Short debounce so stepping through a date picker doesn't fire a request per keystroke
  const firstLoadRef = useRef(true);
  useEffect(() => {
    prevRowsRef.current = null; // new filters: don't flash the whole list
    const t = setTimeout(() => load(), firstLoadRef.current ? 0 : 250);
    firstLoadRef.current = false;
    return () => clearTimeout(t);
  }, [load]);

  // Settings shows no booking data, so live polling pauses there
  const tabRef = useRef(tab);
  tabRef.current = tab;

  // Live: poll a tiny version fingerprint and reload only when the data actually changed
  useEffect(() => {
    let lastFull = Date.now();
    const tick = async () => {
      if (document.visibilityState !== 'visible' || inFlightRef.current || tabRef.current === 'SETTINGS') return;
      try {
        const { version } = await fetchTgVersion();
        const due = Date.now() - lastFull > FULL_REFRESH_MS;
        if (version !== versionRef.current || due) {
          const first = !versionRef.current;
          versionRef.current = version;
          if (!first || due) {
            lastFull = Date.now();
            await load(true);
          }
        }
        setLoadError('');
      } catch (err: any) {
        setLoadError(err?.message || 'Live update failed');
      }
    };
    tick();
    const timer = setInterval(tick, LIVE_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [load]);

  // The range hit the load limit, so older bookings aren't in memory: search them on the server
  const truncated = bookings.length >= LOAD_LIMIT;
  const [serverHits, setServerHits] = useState<TgBooking[] | null>(null);
  useEffect(() => {
    const q = deferredSearch.trim();
    setServerHits(null);
    if (!truncated || !q) return;
    let alive = true;
    const t = setTimeout(() => {
      fetchTgBookings({ startDate, endDate, search: q, limit: LOAD_LIMIT })
        .then((rows) => alive && setServerHits(rows))
        .catch((err) => alive && toastRef.current(`ស្វែងរកបរាជ័យ: ${err?.message}`, 'error'));
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [truncated, deferredSearch, startDate, endDate]);

  // Status / driver filters run client-side so the counts on the chips stay accurate
  const counts = useMemo(() => {
    const c = { ALL: bookings.length, PENDING: 0, ASSIGNED: 0, ACCEPTED: 0, DONE: 0, NOT_PICKED: 0, CANCELLED: 0, UNMATCHED: 0 } as Record<string, number>;
    bookings.forEach((b) => {
      c[b.status] = (c[b.status] || 0) + 1;
      if (b.pickup_unmatched) c.UNMATCHED += 1;
    });
    return c;
  }, [bookings]);

  const visible = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return (serverHits ?? bookings).filter((b) => {
      if (status === 'UNMATCHED') { if (!b.pickup_unmatched) return false; }
      else if (status !== 'ALL' && b.status !== status) return false;
      if (driver && (b.picked_up_by || '') !== driver) return false;
      if (sender && senderOf(b) !== sender) return false;
      if (q) {
        const hay = [b.text, b.customer, b.phone, b.location, b.author, b.picked_up_by].join('\n').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [bookings, serverHits, status, driver, sender, deferredSearch]);

  // Who posted bookings in the selected date range, with a status breakdown — most messages first
  const perSender = useMemo(() => {
    const m = new Map<string, SenderStat>();
    bookings.forEach((b) => {
      const name = senderOf(b);
      const s = m.get(name) || { name, total: 0, PENDING: 0, ASSIGNED: 0, ACCEPTED: 0, DONE: 0, NOT_PICKED: 0, CANCELLED: 0 };
      s.total += 1;
      s[b.status] = (s[b.status] || 0) + 1;
      m.set(name, s);
    });
    return [...m.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [bookings]);

  // The selected sender may drop out of a new date range — fall back to "all"
  useEffect(() => {
    if (sender && !perSender.some((s) => s.name === sender)) setSender('');
  }, [sender, perSender]);

  const perDriver = useMemo(() => {
    const m = new Map<string, number>();
    bookings.forEach((b) => {
      if (b.picked_up_by && b.status !== 'CANCELLED') m.set(b.picked_up_by, (m.get(b.picked_up_by) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [bookings]);

  const patchLocal = useCallback((id: number, patch: Partial<TgBooking>) => {
    const apply = (list: TgBooking[]) => list.map((b) => (b.id === id ? { ...b, ...patch } : b));
    setBookings(apply);
    setServerHits((cur) => (cur ? apply(cur) : cur));
  }, []);

  // Stable handlers (via refs) so memoized rows don't all re-render on every state change
  const teamRef = useRef(team);
  teamRef.current = team;

  const handleAssign = useCallback(async (b: TgBooking, name: string) => {
    const onShowToast = toastRef.current;
    const remember = Boolean(b.pickup_unmatched && b.pickup_raw && name && teamRef.current.some((t) => t.name === name));
    const prev = { ...b };
    patchLocal(b.id, {
      picked_up_by: name || null,
      pickup_unmatched: 0,
      status: name && b.status === 'PENDING' ? 'ASSIGNED' : b.status,
    });
    try {
      const res = await updateTgBooking(b.id, { pickedUpBy: name, rememberAlias: remember });
      if (res?.notify) patchLocal(b.id, notifyPatch(res.notify));
      else if (!name) patchLocal(b.id, { notify_status: null, notify_error: null, notified_to: null, notified_at: null });
      if (remember) {
        onShowToast(`បានចងចាំ "${b.pickup_raw}" ជាឈ្មោះរបស់ ${name}`, 'success');
        setTeam(await fetchTgTeam());
      }
    } catch (err: any) {
      patchLocal(b.id, prev);
      onShowToast(`Update បរាជ័យ: ${err?.message}`, 'error');
    }
  }, [patchLocal]);

  const handleNotify = useCallback(async (b: TgBooking) => {
    try {
      const { notify } = await notifyTgPickup(b.id);
      if (!notify) return;
      patchLocal(b.id, notifyPatch(notify));
      toastRef.current(
        notify.status === 'sent' ? `បានផ្ញើទៅ ${notify.to}` : `ផ្ញើមិនបាន: ${notifyErrorText(notify.status, notify.error)}`,
        notify.status === 'sent' ? 'success' : 'error'
      );
    } catch (err: any) {
      toastRef.current(`ផ្ញើមិនបាន: ${err?.message}`, 'error');
    }
  }, [patchLocal]);

  const handleStatus = useCallback(async (b: TgBooking, next: TgBookingStatus) => {
    const prevStatus = b.status;
    const prevAt = b.status_changed_at;
    patchLocal(b.id, { status: next, status_changed_at: new Date().toISOString() });
    try {
      await updateTgBooking(b.id, { status: next });
    } catch (err: any) {
      patchLocal(b.id, { status: prevStatus, status_changed_at: prevAt });
      toastRef.current(`Update បរាជ័យ: ${err?.message}`, 'error');
    }
  }, [patchLocal]);

  const handleDelete = useCallback(async (b: TgBooking) => {
    if (!window.confirm(`លុប Booking នេះ?\n\n${b.text || ''}`)) return;
    try {
      await deleteTgBooking(b.id);
      setBookings((prev) => prev.filter((x) => x.id !== b.id));
      setServerHits((cur) => (cur ? cur.filter((x) => x.id !== b.id) : cur));
      toastRef.current('បានលុប Booking', 'success');
    } catch (err: any) {
      toastRef.current(`លុបបរាជ័យ: ${err?.message}`, 'error');
    }
  }, []);

  const handleToggle = useCallback((id: number) => setExpanded((cur) => (cur === id ? null : id)), []);

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; show: boolean }[] = [
    { id: 'BOOKINGS', label: 'Booking', icon: ListChecks, show: true },
    { id: 'TEAM', label: 'ក្រុមការងារ', icon: Users, show: isAdmin },
    { id: 'SETTINGS', label: 'ការកំណត់', icon: Settings2, show: isAdmin },
  ];

  return (
    <div className="space-y-2.5">
      {/* Header: title + tabs + live/refresh in one row, then a single filter row */}
      <div className={`${cardCls} px-2.5 sm:px-3 py-1.5 space-y-1.5`}>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 shrink-0" title={'សារពី Channel "IAL Booking" · Reply ពីអ្នក Assign = Pick up by'}>
            <div className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-300 flex items-center justify-center shrink-0">
              <Send className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-sm font-black text-slate-900 dark:text-white whitespace-nowrap">Telegram Booking</h1>
          </div>

          {/* Tabs (segmented) — full-width row below the title on phones */}
          <div className="order-last sm:order-none w-full sm:w-auto flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-700/60">
            {tabs.filter((t) => t.show).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  // Leaving Settings: catch up right away instead of waiting for the next poll
                  if (tab === 'SETTINGS' && t.id !== 'SETTINGS') load(true);
                  setTab(t.id);
                }}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 h-8 sm:h-7 px-2.5 rounded-md text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            {lastLoaded && (
              <span
                className={`flex items-center gap-1 text-[11px] ${loadError ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}
                title={loadError ? `Live update error: ${loadError}` : `Live · update ចុងក្រោយ ${fmtTime(lastLoaded.toISOString())}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${loadError ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
                <span className="font-semibold">{loadError ? 'Offline' : 'Live'}</span>
                <span className="hidden sm:inline text-slate-400">· {fmtTime(lastLoaded.toISOString())}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              title="Refresh"
              className={`${btnCls} h-8 !px-2 !rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {tab === 'BOOKINGS' && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
            <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ស្វែងរក ឈ្មោះ / លេខទូរស័ព្ទ / ទីតាំង"
                className={`${inputCls} h-8 !py-0 !rounded-lg pl-8`}
              />
            </div>
            <input type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} className={`${inputCls} h-8 !py-0 !rounded-lg flex-1 basis-0 min-w-0 sm:flex-none sm:!w-[132px]`} title="ចាប់ពីថ្ងៃ" />
            <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className={`${inputCls} h-8 !py-0 !rounded-lg flex-1 basis-0 min-w-0 sm:flex-none sm:!w-[132px]`} title="ដល់ថ្ងៃ" />
            <select value={driver} onChange={(e) => setDriver(e.target.value)} className={`${inputCls} h-8 !py-0 !rounded-lg w-full sm:!w-[160px] shrink-0 cursor-pointer`}>
              <option value="">អ្នកបើកបរទាំងអស់</option>
              {perDriver.map(([name, n]) => (
                <option key={name} value={name}>{name} ({n})</option>
              ))}
            </select>

            {/* Quick date + status pills */}
            <div className="w-full xl:w-auto flex items-center gap-1 overflow-x-auto no-scrollbar -mx-2.5 px-2.5 sm:mx-0 sm:px-0">
              {[
                { label: 'ថ្ងៃនេះ', days: 0 },
                { label: '7 ថ្ងៃ', days: 6 },
                { label: '30 ថ្ងៃ', days: 29 },
              ].map((r) => {
                const from = daysAgoKh(r.days);
                const to = todayKh();
                const active = startDate === from && endDate === to;
                return (
                  <button
                    key={r.days}
                    type="button"
                    onClick={() => {
                      setStartDate(from);
                      setEndDate(to);
                    }}
                    className={`flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                      active
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 border border-sky-200/70 dark:border-sky-800/60'
                    }`}
                  >
                    {r.days === 0 && <CalendarDays className="w-3 h-3" />}
                    {r.label}
                  </button>
                );
              })}
              <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 shrink-0" />
              {[
                { id: 'ALL', label: 'ទាំងអស់' },
                { id: 'PENDING', label: STATUS_META.PENDING.label },
                { id: 'ASSIGNED', label: STATUS_META.ASSIGNED.label },
                { id: 'ACCEPTED', label: STATUS_META.ACCEPTED.label },
                { id: 'DONE', label: STATUS_META.DONE.label },
                { id: 'NOT_PICKED', label: STATUS_META.NOT_PICKED.label },
                { id: 'CANCELLED', label: STATUS_META.CANCELLED.label },
                { id: 'UNMATCHED', label: 'ឈ្មោះមិនស្គាល់' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStatus(s.id)}
                  className={`flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                    status === s.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60'
                  } ${s.id === 'UNMATCHED' && counts.UNMATCHED > 0 && status !== s.id ? '!text-amber-700 dark:!text-amber-300' : ''}`}
                >
                  {s.id === 'UNMATCHED' && <AlertTriangle className="w-3 h-3" />}
                  {s.label}
                  <span className={`text-[10px] font-mono ${status === s.id ? 'text-emerald-100' : 'text-slate-400'}`}>{counts[s.id] || 0}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {tab === 'BOOKINGS' && perSender.length > 0 && (
        <SenderSummary senders={perSender} counts={counts} selected={sender} onSelect={setSender} />
      )}

      {tab === 'BOOKINGS' && (
        <BookingList
          rows={visible}
          team={team}
          loading={loading && bookings.length === 0}
          refreshing={loading && bookings.length > 0}
          error={loadError}
          canEdit={canEdit}
          isAdmin={isAdmin}
          expanded={expanded}
          flash={flash}
          onToggle={handleToggle}
          onAssign={handleAssign}
          onStatus={handleStatus}
          onNotify={handleNotify}
          onDelete={handleDelete}
        />
      )}
      {tab === 'TEAM' && isAdmin && <TeamPanel team={team} setTeam={setTeam} payers={payers} isAdmin={isAdmin} onShowToast={onShowToast} />}
      {tab === 'SETTINGS' && isAdmin && <SettingsPanel onShowToast={onShowToast} />}
    </div>
  );
};

/* ------------------------------------------------------------------ */

/** Name shown as the sender of a booking message */
const senderOf = (b: TgBooking): string => (b.author || '').trim() || 'Channel';

type SenderStat = { name: string; total: number } & Record<TgBookingStatus, number>;

// Status order + colors used by the sender breakdown (bar segment / dot / text)
const SENDER_STATUS: { id: TgBookingStatus; bar: string; dot: string; text: string }[] = [
  { id: 'PENDING', bar: 'bg-amber-400', dot: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-300' },
  { id: 'ASSIGNED', bar: 'bg-blue-500', dot: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-300' },
  { id: 'ACCEPTED', bar: 'bg-violet-500', dot: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300' },
  { id: 'DONE', bar: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
  { id: 'NOT_PICKED', bar: 'bg-rose-500', dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300' },
  { id: 'CANCELLED', bar: 'bg-slate-300 dark:bg-slate-600', dot: 'bg-slate-400', text: 'text-slate-500 dark:text-slate-400' },
];

const SENDERS_COLLAPSED = 8; // tiles shown before "មើលទាំងអស់"

/** Stacked bar: share of each status in a sender's messages */
const StatusBar: React.FC<{ s: Record<TgBookingStatus, number>; total: number }> = ({ s, total }) => (
  <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
    {SENDER_STATUS.map((st) =>
      s[st.id] ? <div key={st.id} className={st.bar} style={{ width: `${(s[st.id] / total) * 100}%` }} /> : null
    )}
  </div>
);

interface SenderSummaryProps {
  senders: SenderStat[];
  counts: Record<string, number>;
  selected: string;
  onSelect: (name: string) => void;
}

/** Card: who sent booking messages in the range, with each sender's status breakdown. Tap a sender to filter. */
const SenderSummary: React.FC<SenderSummaryProps> = ({ senders, counts, selected, onSelect }) => {
  const [open, setOpen] = useState(false); // starts folded: only the totals line shows
  const [showAll, setShowAll] = useState(false);
  const total = counts.ALL || 0;
  const shown = showAll ? senders : senders.slice(0, SENDERS_COLLAPSED);

  return (
    <div className={`${cardCls} px-2.5 sm:px-3 py-2.5 space-y-2.5`}>
      {/* Header: totals + overall status split — tap the title to show/hide the sender tiles */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 min-w-0 text-left cursor-pointer group"
          title={open ? 'លាក់ព័ត៌មានលម្អិត' : 'បង្ហាញព័ត៌មានលម្អិតតាមអ្នកផ្ញើ'}
        >
          <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-300 flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">អ្នកផ្ញើសារ Booking</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              សរុប <strong className="text-sky-700 dark:text-sky-300 font-mono text-xs">{senders.length}</strong> នាក់ ·{' '}
              <strong className="text-slate-800 dark:text-slate-100 font-mono text-xs">{total}</strong> សារ
            </p>
          </div>
          <span className="ml-1 inline-flex items-center gap-0.5 h-6 px-2 rounded-full text-[11px] font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/40 group-hover:bg-sky-100 dark:group-hover:bg-sky-900/60 shrink-0">
            {open ? 'លាក់' : 'លម្អិត'}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {/* Overall status totals already live in the filter pills above, so only the reset shows here */}
        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
          {selected && (
            <button type="button" onClick={() => onSelect('')} className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/40 border border-sky-200 dark:border-sky-800 cursor-pointer">
              <X className="w-3 h-3" />បង្ហាញទាំងអស់
            </button>
          )}
        </div>
      </div>

      {open && (
      <>
      {/* One tile per sender */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5 sm:gap-2">
        {shown.map((s) => {
          const active = selected === s.name;
          const pct = total ? Math.round((s.total / total) * 100) : 0;
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => onSelect(active ? '' : s.name)}
              title={`បង្ហាញតែសាររបស់ ${s.name}`}
              className={`text-left rounded-xl border px-2.5 py-2 space-y-1.5 cursor-pointer transition-all ${
                active
                  ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30 ring-1 ring-sky-500'
                  : 'border-slate-200 dark:border-slate-800 hover:border-sky-300 dark:hover:border-sky-700 hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{s.name}</span>
                <span className="shrink-0 flex items-baseline gap-1">
                  <strong className="text-sm font-black font-mono text-sky-700 dark:text-sky-300">{s.total}</strong>
                  <span className="text-[10px] text-slate-400">សារ · {pct}%</span>
                </span>
              </div>
              <StatusBar s={s} total={s.total} />
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px]">
                {SENDER_STATUS.map((st) => (
                  <span key={st.id} className={`inline-flex items-center gap-1 ${s[st.id] ? '' : 'opacity-40'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                    <span className="text-slate-500 dark:text-slate-400">{STATUS_META[st.id].label}</span>
                    <strong className={`font-mono ${st.text}`}>{s[st.id]}</strong>
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {senders.length > SENDERS_COLLAPSED && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full flex items-center justify-center gap-1 h-7 rounded-lg text-[11px] font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/30 cursor-pointer"
        >
          {showAll ? 'បង្រួម' : `មើលទាំងអស់ (${senders.length} នាក់)`}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`} />
        </button>
      )}
      </>
      )}
    </div>
  );
};

interface BookingListProps {
  rows: TgBooking[];
  team: TgTeamMember[];
  loading: boolean;
  refreshing: boolean;
  error: string;
  canEdit: boolean;
  isAdmin: boolean;
  expanded: number | null;
  flash: Set<number>;
  onToggle: (id: number) => void;
  onAssign: (b: TgBooking, name: string) => void;
  onStatus: (b: TgBooking, s: TgBookingStatus) => void;
  onNotify: (b: TgBooking) => Promise<void>;
  onDelete: (b: TgBooking) => void;
}

const BookingList: React.FC<BookingListProps> = ({ rows, team, loading, refreshing, error, canEdit, isAdmin, expanded, flash, onToggle, onAssign, onStatus, onNotify, onDelete }) => {
  const activeTeam = useMemo(() => team.filter((t) => t.active), [team]);

  if (loading) {
    return (
      <div className={`${cardCls} p-10 flex items-center justify-center gap-2 text-xs text-slate-500`}>
        <Loader2 className="w-4 h-4 animate-spin text-emerald-600" /> កំពុងទាញទិន្នន័យ...
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className={`${cardCls} p-10 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
        <p className="font-semibold">{error ? `មិនអាចទាញទិន្នន័យ: ${error}` : 'មិនមាន Booking ក្នុងចន្លោះថ្ងៃនេះទេ'}</p>
        {!error && <p className="text-[11px]">សារថ្មីៗក្នុង Channel នឹងបង្ហាញនៅទីនេះដោយស្វ័យប្រវត្តិ</p>}
      </div>
    );
  }

  return (
    <div className={`${cardCls} relative divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden transition-opacity duration-200 ${refreshing ? 'opacity-70' : ''}`}>
      {refreshing && <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-500/70 animate-pulse" />}
      {rows.map((b, i) => (
        <BookingRow
          key={b.id}
          b={b}
          stripe={i % 2 === 0 ? ROW_STRIPES[(i / 2) % ROW_STRIPES.length] : 'border-l-transparent'}
          activeTeam={activeTeam}
          isOpen={expanded === b.id}
          flashing={flash.has(b.id)}
          canEdit={canEdit}
          isAdmin={isAdmin}
          onToggle={onToggle}
          onAssign={onAssign}
          onStatus={onStatus}
          onNotify={onNotify}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

interface BookingRowProps {
  b: TgBooking;
  activeTeam: TgTeamMember[];
  isOpen: boolean;
  flashing: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  onToggle: (id: number) => void;
  onAssign: (b: TgBooking, name: string) => void;
  onStatus: (b: TgBooking, s: TgBookingStatus) => void;
  onNotify: (b: TgBooking) => Promise<void>;
  onDelete: (b: TgBooking) => void;
  /** Left stripe color: every other row gets one (row 1, 3, 5…), cycling through ROW_STRIPES; the rows between stay plain */
  stripe: string;
}

// Left stripe colors, used in turn down the list (row 1, 2, 3, …)
const ROW_STRIPES = [
  'border-l-sky-500',
  'border-l-violet-500',
  'border-l-emerald-500',
  'border-l-amber-400',
  'border-l-rose-500',
  'border-l-indigo-500',
  'border-l-teal-500',
  'border-l-orange-500',
  'border-l-fuchsia-500',
  'border-l-lime-500',
];

// Supergroup/channel chat ids look like -100XXXXXXXXXX; t.me/c/ links only work for those
const tgMessageLink = (b: TgBooking): string => {
  const chat = String(b.chat_id ?? '');
  return chat.startsWith('-100') && b.message_id ? `https://t.me/c/${chat.slice(4)}/${b.message_id}` : '';
};

const notifyPatch = (n: TgNotifyResult): Partial<TgBooking> => ({
  notify_status: n.status,
  notify_error: n.error,
  notified_to: n.to,
  notified_at: new Date().toISOString(),
});

const notifyErrorText = (status: string | null | undefined, error: string | null | undefined): string => {
  if (status === 'no_id') return 'ឈ្មោះនេះមិនទាន់មាន Telegram user_id (Tab ក្រុមការងារ)';
  if (error === 'need_start') return 'អ្នកដឹកមិនទាន់ចុច Start លើ @bookingial_bot';
  return error || 'Telegram error';
};

/** Whether the bot's direct message reached the current pickup person, with a resend button. */
const PickupNotify: React.FC<{ b: TgBooking; canResend: boolean; onNotify: (b: TgBooking) => Promise<void> }> = ({ b, canResend, onNotify }) => {
  const [busy, setBusy] = useState(false);
  if (!b.picked_up_by) return null;
  const resend = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try { await onNotify(b); } finally { setBusy(false); }
  };
  const sendBtn = (label: string) => canResend && (
    <button type="button" onClick={resend} disabled={busy} className="underline hover:no-underline cursor-pointer disabled:opacity-50" title={label}>
      {busy ? <Loader2 className="w-3 h-3 animate-spin inline" /> : label}
    </button>
  );
  // Picked before DMs existed, or the result is for an earlier pickup person: nothing sent to this one yet
  if (!b.notify_status || b.notified_to !== b.picked_up_by) {
    return (
      <span className="text-[11px] leading-tight text-slate-400 flex items-center gap-1">
        <Send className="w-3 h-3 shrink-0" />មិនទាន់ផ្ញើ {sendBtn('ផ្ញើ')}
      </span>
    );
  }
  const resendBtn = sendBtn('ផ្ញើម្ដងទៀត');
  if (b.notify_status === 'sent') {
    return (
      <span className="text-[11px] leading-tight text-emerald-600 dark:text-emerald-400 flex items-center gap-1" title={`Bot បានផ្ញើ Pick up សម្រាប់ ${b.notified_to} ${fmtDateTime(b.notified_at)}`}>
        <Send className="w-3 h-3 shrink-0" />Bot បានផ្ញើ · {fmtTime(b.notified_at)} {resendBtn}
      </span>
    );
  }
  return (
    <span className={`text-[11px] leading-tight flex items-center gap-1 ${b.notify_status === 'no_id' ? 'text-slate-400' : 'text-red-500'}`} title={notifyErrorText(b.notify_status, b.notify_error)}>
      <X className="w-3 h-3 shrink-0" />
      <span className="truncate max-w-[180px]">{b.notify_status === 'no_id' ? 'គ្មាន TG user_id' : b.notify_error === 'need_start' ? 'មិនទាន់ Start Bot' : 'Bot ផ្ញើមិនបាន'}</span>
      {resendBtn}
    </span>
  );
};

// Memoized: live refreshes and filter changes only re-render the rows whose data actually changed
const BookingRow = memo(({ b, stripe, activeTeam, isOpen, flashing, canEdit, isAdmin, onToggle, onAssign, onStatus, onNotify, onDelete }: BookingRowProps) => {
  const inTeam = !b.picked_up_by || activeTeam.some((t) => t.name === b.picked_up_by);
  return (
    <div
      key={b.id}
      className={`border-l-4 ${stripe} transition-colors duration-700 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${isOpen ? 'bg-slate-50/80 dark:bg-slate-800/40' : ''} ${b.status === 'CANCELLED' ? 'opacity-60' : ''} ${flashing ? '!bg-emerald-50 dark:!bg-emerald-500/10' : ''}`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 lg:gap-2 px-3 py-3 lg:py-2.5">
        {/* Message */}
        <button type="button" onClick={() => onToggle(b.id)} className="flex items-start gap-2 min-w-0 flex-1 text-left cursor-pointer">
          {isOpen ? <ChevronDown className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 min-w-0">
              <span className="inline-flex items-center gap-1 shrink-0 px-1.5 py-px rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono" title="ថ្ងៃខែផ្ញើសារ">
                <CalendarDays className="w-3 h-3 text-slate-400" />
                {fmtDate(b.posted_at)}
              </span>
              <span className="font-mono shrink-0">{fmtTime(b.posted_at)}</span>
              {b.message_id ? (
                tgMessageLink(b) ? (
                  <a
                    href={tgMessageLink(b)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="បើកសារដើមក្នុង Telegram"
                    className="font-mono text-sky-600 hover:underline"
                  >
                    #{b.message_id}
                  </a>
                ) : (
                  <span className="font-mono" title="Telegram message_id">#{b.message_id}</span>
                )
              ) : null}
              <span>·</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                {b.author || 'Channel'}
                {/* Team name of the posting Telegram account, when linked */}
                {b.author_member && b.author_member !== b.author && (
                  <span className="font-normal text-slate-400"> ({b.author_member})</span>
                )}
              </span>
              {b.service_type && (
                <span className="shrink-0 px-1.5 py-px rounded-md bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300 text-[11px] font-semibold">
                  {b.service_type}
                </span>
              )}
            </div>
            <p className={`text-sm leading-snug text-slate-800 dark:text-slate-100 mt-1 lg:mt-0.5 ${isOpen ? 'whitespace-pre-wrap break-words' : 'line-clamp-2 lg:line-clamp-1 break-words'}`}>
              {b.customer && <span className="font-bold">{b.customer} · </span>}
              {b.text}
            </p>
            {(b.phone || b.location || b.map_url) && (
              <div className="flex items-center gap-x-3 gap-y-1 mt-1.5 lg:mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                {b.phone && b.phone.split(',').map((p) => (
                  <a key={p} href={`tel:${p.trim()}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 hover:text-emerald-600 font-mono">
                    <Phone className="w-3.5 h-3.5" />{p.trim()}
                  </a>
                ))}
                {b.location && <span className="flex items-center gap-1 truncate max-w-[260px]"><MapPin className="w-3.5 h-3.5 shrink-0" />{b.location}</span>}
                {b.map_url && (
                  <a href={b.map_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-sky-600 hover:underline">
                    <Link2 className="w-3.5 h-3.5" />Map
                  </a>
                )}
              </div>
            )}
          </div>
        </button>

        {/* Pick up by + status */}
        <div className="flex items-start gap-2 pl-6 lg:pl-0 shrink-0">
          <div className="flex-1 min-w-0 lg:flex-none flex flex-col items-stretch lg:items-end gap-0.5">
            <select
              value={b.picked_up_by || ''}
              disabled={!canEdit}
              onChange={(e) => onAssign(b, e.target.value)}
              className={`${inputCls} h-9 !py-0 !w-full lg:!w-44 !text-sm cursor-pointer ${b.pickup_unmatched ? '!border-amber-400 !bg-amber-50 dark:!bg-amber-500/10' : ''}`}
              title={b.assigned_by ? `Assign ដោយ ${b.assigned_by} ${fmtDateTime(b.assigned_at)}` : undefined}
            >
              <option value="">— Pick up by —</option>
              {!inTeam && b.picked_up_by && <option value={b.picked_up_by}>⚠ {b.picked_up_by}</option>}
              {activeTeam.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
            {b.pickup_unmatched ? (
              <span className="text-[11px] leading-tight text-amber-600 dark:text-amber-400 flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 mt-px shrink-0" />Reply "{b.pickup_raw}" មិនស្គាល់ — ជ្រើសឈ្មោះ
              </span>
            ) : b.assigned_by ? (
              <span className="text-[11px] text-slate-400">ដោយ {b.assigned_by} · {fmtTime(b.assigned_at)}</span>
            ) : null}
            <PickupNotify b={b} canResend={isAdmin} onNotify={onNotify} />
          </div>
          <div className="shrink-0 flex flex-col items-end gap-0.5">
            <select
              value={b.status}
              disabled={!canEdit}
              onChange={(e) => onStatus(b, e.target.value as TgBookingStatus)}
              className={`h-9 px-2 text-sm font-semibold rounded-xl border cursor-pointer focus:outline-none ${STATUS_META[b.status]?.cls || ''}`}
            >
              {(Object.keys(STATUS_META) as TgBookingStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
            {/* When the current status was set (full history when the row is opened) */}
            {b.status_changed_at && (
              <span className="text-[11px] text-slate-400 font-mono" title={fmtDateTime(b.status_changed_at)}>{fmtTime(b.status_changed_at)}</span>
            )}
          </div>
          {isAdmin && (
            <button type="button" onClick={() => onDelete(b)} title="លុប" className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      {isOpen && <ReplyHistory booking={b} />}
    </div>
  );
});

const ReplyHistory: React.FC<{ booking: TgBooking }> = ({ booking }) => {
  const [replies, setReplies] = useState<TgBookingReply[] | null>(null);
  const [statusLog, setStatusLog] = useState<TgStatusLog[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchTgBookingReplies(booking.id)
      .then((r) => alive && setReplies(r))
      .catch((e) => alive && setError(e?.message || 'Failed'));
    // Older servers don't have the history yet: just show none
    fetchTgStatusLog(booking.id)
      .then((r) => alive && setStatusLog(r))
      .catch(() => alive && setStatusLog([]));
    return () => { alive = false; };
  }, [booking.id, booking.picked_up_by, booking.status]);

  return (
    <div className="px-3 pb-3 pl-8.5 space-y-2">
      {statusLog && statusLog.length > 0 && (
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 p-2.5 space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">ប្រវត្តិស្ថានភាព</p>
          {statusLog.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="font-mono text-slate-400 shrink-0">{fmtDateTime(s.changed_at)}</span>
              <span className={`shrink-0 px-1.5 rounded-md border font-semibold ${STATUS_META[s.status]?.cls || ''}`}>{STATUS_META[s.status]?.label || s.status}</span>
              <span className="text-slate-600 dark:text-slate-300 truncate">{s.changed_by || '?'}</span>
              <span className="text-slate-400 shrink-0">· {STATUS_SOURCE[s.source || ''] || s.source}</span>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 p-2.5 space-y-1.5">
        <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">ប្រវត្តិ Reply</p>
        {error && <p className="text-[11px] text-red-500">{error}</p>}
        {!replies && !error && <p className="text-[11px] text-slate-400">កំពុងទាញ...</p>}
        {replies && replies.length === 0 && <p className="text-[11px] text-slate-400">មិនទាន់មាន Reply</p>}
        {replies?.map((r) => (
          <div key={r.id} className="flex items-start gap-2 text-[11px]">
            <span className="font-mono text-slate-400 shrink-0">{fmtTime(r.posted_at)}</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">
              {r.author || r.author_id || '?'}
              {r.author_member && r.author_member !== r.author && (
                <span className="font-normal text-slate-400"> ({r.author_member})</span>
              )}
              {/* Reply to another reply: show who it answers */}
              {r.reason === 'thread' && r.reply_to_author && (
                <span className="font-normal text-slate-400"> → {r.reply_to_author}</span>
              )}
            </span>
            <span className="text-slate-600 dark:text-slate-300 flex-1 break-words">{r.text}</span>
            <span className={`shrink-0 px-1.5 rounded-md ${r.accepted ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
              {REPLY_REASON[r.reason || ''] || r.reason}
            </span>
          </div>
        ))}
        {booking.updated_by && <p className="text-[10px] text-slate-400 pt-1">កែចុងក្រោយក្នុងប្រព័ន្ធដោយ {booking.updated_by}</p>}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

const emptyMember = (): TgTeamMember => ({ name: '', aliases: [], role: 'Driver', phone: '', active: true });

/** "MR. SOK DARA" / "Ms.Lina" → "SOK DARA" / "Lina". */
const stripTitle = (name: string) =>
  name.replace(/^\s*(?:(?:mrs|mr|ms|miss)\b\.?\s*)+/i, '').replace(/\s+/g, ' ').trim();

type ImportRow = { key: string; name: string; phone: string; role: string; category: string };

const ImportFromPayers: React.FC<{
  payers: Payer[];
  team: TgTeamMember[];
  onDone: (team: TgTeamMember[], inserted: number) => void;
  onCancel: () => void;
  onShowToast: TelegramBookingPageProps['onShowToast'];
}> = ({ payers, team, onDone, onCancel, onShowToast }) => {
  const rows = useMemo<ImportRow[]>(() => {
    const taken = new Set(team.map((m) => m.name.toLowerCase()));
    const out: ImportRow[] = [];
    for (const p of payers) {
      if (p.status === 'INACTIVE') continue;
      const name = stripTitle(String(p.name || ''));
      const key = name.toLowerCase();
      if (!name || taken.has(key)) continue;
      taken.add(key);
      const category = normalizePayerCategory(p);
      out.push({ key, name, phone: String(p.phone || '').trim(), role: category === 'RIDER' ? 'Driver' : 'Staff', category });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [payers, team]);

  const [picked, setPicked] = useState<Set<string>>(() => new Set(rows.map((r) => r.key)));
  const [saving, setSaving] = useState(false);
  const allPicked = rows.length > 0 && picked.size === rows.length;

  const toggle = (key: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const run = async () => {
    const members = rows.filter((r) => picked.has(r.key)).map(({ name, role, phone }) => ({ name, role, phone }));
    if (!members.length) return;
    setSaving(true);
    try {
      const { inserted, team: next } = await importTgTeam(members);
      onDone(next, inserted);
    } catch (err: any) {
      onShowToast(`នាំចូលបរាជ័យ: ${err?.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/50 dark:bg-sky-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          នាំចូលពី អ្នកប្រគល់ប្រាក់ (Company Staff) <span className="font-normal text-slate-400">· ដក MR./MS. ចេញ · លាក់ឈ្មោះដែលមានរួច</span>
        </p>
        {rows.length > 0 && (
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={allPicked}
              onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.key)))}
              className="accent-emerald-600"
            />
            ជ្រើសទាំងអស់
          </label>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-4">គ្មានឈ្មោះថ្មីសម្រាប់នាំចូលទេ</p>
      ) : (
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
          {rows.map((r) => (
            <label key={r.key} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <input type="checkbox" checked={picked.has(r.key)} onChange={() => toggle(r.key)} className="accent-emerald-600" />
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex-1 min-w-0 truncate">{r.name}</span>
              <span className="text-[11px] text-slate-400 shrink-0">{r.role}{r.phone ? ` · ${r.phone}` : ''}</span>
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className={`${btnCls} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}>
          <X className="w-3.5 h-3.5" />បោះបង់
        </button>
        <button type="button" onClick={run} disabled={saving || picked.size === 0} className={`${btnCls} bg-emerald-600 text-white hover:bg-emerald-700`}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}នាំចូល ({picked.size})
        </button>
      </div>
    </div>
  );
};

const TEAM_CHECKED_KEY = 'tg_team_checked';

const TeamPanel: React.FC<{
  team: TgTeamMember[];
  setTeam: (t: TgTeamMember[]) => void;
  payers: Payer[];
  isAdmin: boolean;
  onShowToast: TelegramBookingPageProps['onShowToast'];
}> = ({ team, setTeam, payers, isAdmin, onShowToast }) => {
  const [editing, setEditing] = useState<TgTeamMember | null>(null);
  const [aliasText, setAliasText] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  // Personal check marks, kept in this browser only
  const [checked, setChecked] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(TEAM_CHECKED_KEY) || '[]')); } catch { return new Set(); }
  });
  const memberKey = (m: TgTeamMember) => String(m.id ?? m.name);
  const toggleChecked = (m: TgTeamMember) => {
    setChecked((prev) => {
      const next = new Set(prev);
      const k = memberKey(m);
      if (next.has(k)) next.delete(k); else next.add(k);
      try { localStorage.setItem(TEAM_CHECKED_KEY, JSON.stringify([...next])); } catch { /* storage unavailable */ }
      return next;
    });
  };
  const clearChecked = () => {
    setChecked(new Set());
    try { localStorage.removeItem(TEAM_CHECKED_KEY); } catch { /* storage unavailable */ }
  };
  const checkedCount = team.filter((m) => checked.has(memberKey(m))).length;
  const q = query.trim().toLowerCase();
  const shownTeam = q
    ? team.filter((m) =>
        [m.name, m.role, m.phone, m.tg_user_id, ...m.aliases].some((v) => String(v ?? '').toLowerCase().includes(q))
      )
    : team;
  // Telegram accounts seen in the chat, loaded when the editor opens
  const [accounts, setAccounts] = useState<TgAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState('');

  const startEdit = (m: TgTeamMember) => {
    setEditing({ ...m, tg_user_id: m.tg_user_id ? String(m.tg_user_id) : '' });
    setAliasText(m.aliases.join(', '));
    if (!accounts) {
      setAccountsError('');
      fetchTgAccounts().then(setAccounts).catch((e) => {
        setAccounts([]);
        setAccountsError(e?.message || 'Failed');
      });
    }
  };

  const save = async () => {
    if (!editing?.name.trim()) {
      onShowToast('សូមបញ្ចូលឈ្មោះ', 'error');
      return;
    }
    setSaving(true);
    try {
      const aliases = aliasText.split(',').map((a) => a.trim()).filter(Boolean);
      setTeam(await saveTgTeamMember({ ...editing, name: editing.name.trim(), aliases }));
      setEditing(null);
      setAccounts(null); // links changed: reload next time
      onShowToast('បានរក្សាទុក', 'success');
    } catch (err: any) {
      onShowToast(`រក្សាទុកបរាជ័យ: ${err?.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: TgTeamMember) => {
    if (!m.id || !window.confirm(`លុប ${m.name} ចេញពីក្រុមការងារ?`)) return;
    try {
      setTeam(await deleteTgTeamMember(m.id));
    } catch (err: any) {
      onShowToast(`លុបបរាជ័យ: ${err?.message}`, 'error');
    }
  };

  return (
    <div className={`${cardCls} p-3 space-y-3`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5">
        <div className="min-w-0">
          <h2 className="text-sm sm:text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            ក្រុមការងារ (Pick up)
            <span className="px-1.5 py-px rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {team.length}
            </span>
            {checkedCount > 0 && (
              <span className="inline-flex items-center gap-1 pl-1.5 pr-0.5 py-px rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                <Check className="w-3 h-3" />{checkedCount}
                <button type="button" onClick={clearChecked} className="p-0.5 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-500/20 cursor-pointer" title="ដោះ Check ទាំងអស់" aria-label="ដោះ Check ទាំងអស់">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
          </h2>
        </div>
        {isAdmin && !editing && !importing && (
          <div className="grid grid-cols-[1fr_auto] sm:flex sm:items-center gap-2 sm:gap-1.5 sm:shrink-0">
            <button type="button" onClick={() => setImporting(true)} className={`${btnCls} justify-center min-w-0 min-h-9 sm:min-h-0 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20`}>
              <Download className="w-3.5 h-3.5 shrink-0" /><span className="truncate">នាំចូលពីអ្នកប្រគល់ប្រាក់</span>
            </button>
            <button type="button" onClick={() => startEdit(emptyMember())} className={`${btnCls} justify-center min-h-9 sm:min-h-0 bg-emerald-600 text-white hover:bg-emerald-700`}>
              <Plus className="w-3.5 h-3.5" />បន្ថែម
            </button>
          </div>
        )}
      </div>

      {importing && (
        <ImportFromPayers
          payers={payers}
          team={team}
          onCancel={() => setImporting(false)}
          onShowToast={onShowToast}
          onDone={(next, inserted) => {
            setTeam(next);
            setImporting(false);
            onShowToast(`បាននាំចូល ${inserted} ឈ្មោះ`, 'success');
          }}
        />
      )}

      {editing && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-500/5 p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 space-y-1">
            <span>ឈ្មោះ</span>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputCls} placeholder="Rin" autoFocus />
          </label>
          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 space-y-1">
            <span>ឈ្មោះហៅក្រៅ (បំបែកដោយ ,)</span>
            <input value={aliasText} onChange={(e) => setAliasText(e.target.value)} className={inputCls} placeholder="rin driver, រិន" />
          </label>
          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 space-y-1">
            <span>តួនាទី</span>
            <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })} className={`${inputCls} cursor-pointer`}>
              {['Driver', 'Moto', 'Tuktuk', 'Car', 'Truck', 'Staff'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 space-y-1">
            <span>លេខទូរស័ព្ទ</span>
            <input value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className={inputCls} />
          </label>
          <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 space-y-1 sm:col-span-2">
            <span>Telegram user_id <span className="font-normal text-slate-400">(Mention ពេលរើសឈ្មោះ · ស្គាល់អ្នកផ្ញើ · Reply លើ Booking ទំនេរ = យកខ្លួនឯង)</span></span>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={accounts?.some((a) => String(a.author_id) === String(editing.tg_user_id)) ? String(editing.tg_user_id) : ''}
                onChange={(e) => e.target.value && setEditing({ ...editing, tg_user_id: e.target.value })}
                className={`${inputCls} cursor-pointer sm:flex-1`}
              >
                <option value="">{accounts ? '— ជ្រើសពីគណនីដែលធ្លាប់ផ្ញើសារ —' : 'កំពុងទាញ...'}</option>
                {accounts?.map((a) => {
                  const linkedElsewhere = a.member && a.member !== editing.name && String(a.author_id) !== String(editing.tg_user_id);
                  return (
                    <option key={a.author_id} value={String(a.author_id)} disabled={Boolean(linkedElsewhere)}>
                      {a.author || '?'} · {a.author_id}{a.member ? ` (${a.member})` : ''}
                    </option>
                  );
                })}
              </select>
              <input
                value={String(editing.tg_user_id ?? '')}
                onChange={(e) => setEditing({ ...editing, tg_user_id: e.target.value.replace(/\D/g, '') })}
                className={`${inputCls} sm:w-44 font-mono`}
                inputMode="numeric"
                placeholder="882173247"
              />
            </div>
            {accountsError ? (
              <p className="font-normal text-red-500">ទាញបញ្ជីគណនីមិនបាន ({accountsError}) — Server ប្រហែលជាជំនាន់ចាស់ សូម Restart/Deploy។ អាចវាយលេខដោយដៃបាន។</p>
            ) : accounts && editing.tg_user_id && !accounts.some((a) => String(a.author_id) === String(editing.tg_user_id)) ? (
              <p className="font-normal text-amber-600 dark:text-amber-400">លេខនេះមិនទាន់ធ្លាប់ផ្ញើសារក្នុង Chat — រក្សាទុកបាន ហើយនឹងស្គាល់ពេលគាត់ផ្ញើសារលើកក្រោយ។</p>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
            <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} className="accent-emerald-600" />
            កំពុងធ្វើការ (Active)
          </label>
          <div className="flex items-center justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setEditing(null)} className={`${btnCls} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}>
              <X className="w-3.5 h-3.5" />បោះបង់
            </button>
            <button type="button" onClick={save} disabled={saving} className={`${btnCls} bg-emerald-600 text-white hover:bg-emerald-700`}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}រក្សាទុក
            </button>
          </div>
        </div>
      )}

      {team.length > 0 && (
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ស្វែងរក ឈ្មោះ / ឈ្មោះហៅក្រៅ / លេខទូរស័ព្ទ / TG"
            className={`${inputCls} h-9 sm:h-8 !py-0 !rounded-lg pl-8`}
          />
        </div>
      )}

      {team.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-6">មិនទាន់មានឈ្មោះក្រុមការងារ</p>
      ) : shownTeam.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-6">រកមិនឃើញ "{query.trim()}"</p>
      ) : (
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
          {shownTeam.map((m) => {
            const driver = m.role === 'Driver';
            const isChecked = checked.has(memberKey(m));
            return (
              <div
                key={m.id ?? m.name}
                className={`group relative overflow-hidden rounded-lg border px-2.5 py-2 hover:shadow-sm transition ${isChecked ? 'border-emerald-400 bg-emerald-50/60 dark:border-emerald-500/50 dark:bg-emerald-500/10' : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-300 dark:hover:border-emerald-500/40'} ${m.active ? '' : 'opacity-50'}`}
              >
                <span className={`absolute inset-y-0 left-0 w-0.5 ${driver ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ring-1 ${driver ? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20' : 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20'}`}>
                    {m.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] font-semibold leading-tight text-slate-800 dark:text-slate-100 truncate" title={m.name}>{m.name}</p>
                    <p className={`text-[10px] leading-tight truncate ${m.aliases.length ? 'text-slate-500 dark:text-slate-400' : 'text-slate-300 dark:text-slate-600 italic'}`}>
                      {m.aliases.length ? m.aliases.join(', ') : 'គ្មានឈ្មោះហៅក្រៅ'}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                      <button type="button" onClick={() => startEdit(m)} className="p-1 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 cursor-pointer" title="កែ" aria-label={`កែ ${m.name}`}>
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button type="button" onClick={() => remove(m)} className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer" title="លុប" aria-label={`លុប ${m.name}`}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isChecked}
                    onClick={() => toggleChecked(m)}
                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition cursor-pointer ${isChecked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600 text-transparent hover:border-emerald-500'}`}
                    title={isChecked ? 'ដោះ Check' : 'Check ចំណាំ'}
                    aria-label={`Check ${m.name}`}
                  >
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[9.5px] leading-none">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${driver ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{m.role}</span>
                  {m.tg_user_id && (
                    <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300 font-mono" title="Telegram user_id">
                      TG {m.tg_user_id}
                    </span>
                  )}
                  {m.phone && <span className="text-slate-500 dark:text-slate-400 font-mono">{m.phone}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

// Last config seen, kept across tab switches so the panel shows instantly and refreshes in the background
let cachedConfig: TgBookingConfig | null = null;
const formFromConfig = (c: TgBookingConfig | null) => ({
  assigner_ids: c?.assigner_ids || '',
  assigner_names: c?.assigner_names || '',
  chat_id: c?.chat_id || '',
  notify_chat_id: c?.notify_chat_id || '',
});

const SettingsPanel: React.FC<{ onShowToast: TelegramBookingPageProps['onShowToast'] }> = ({ onShowToast }) => {
  const [cfg, setCfg] = useState<TgBookingConfig | null>(cachedConfig);
  const [form, setForm] = useState(() => formFromConfig(cachedConfig));
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const toastRef = useRef(onShowToast);
  toastRef.current = onShowToast;
  const dirtyRef = useRef(false); // don't overwrite fields the user is typing in

  const reload = useCallback(async (resetForm = true) => {
    setRefreshing(true);
    setError('');
    try {
      const c = await fetchTgConfig();
      cachedConfig = c;
      setCfg(c);
      if (resetForm || !dirtyRef.current) {
        setForm(formFromConfig(c));
        dirtyRef.current = false;
      }
    } catch (err: any) {
      setError(err?.message || 'Load failed');
      if (cachedConfig) toastRef.current(`ទាញការកំណត់បរាជ័យ: ${err?.message}`, 'error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { reload(false); }, [reload]);

  const editForm = (patch: Partial<ReturnType<typeof formFromConfig>>) => {
    dirtyRef.current = true;
    setForm((f) => ({ ...f, ...patch }));
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveTgConfig(form);
      onShowToast('បានរក្សាទុកការកំណត់', 'success');
      await reload();
    } catch (err: any) {
      onShowToast(`រក្សាទុកបរាជ័យ: ${err?.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    // Telegram only calls public HTTPS URLs; from localhost, point it at the deployed site instead.
    let base = window.location.origin;
    if (!base.startsWith('https://')) {
      let saved = '';
      try { saved = localStorage.getItem('tg_booking_public_url') || ''; } catch {}
      const input = window.prompt('Telegram ត្រូវការ URL HTTPS សាធារណៈ។ សូមបញ្ចូល URL គេហទំព័រដែល Deploy (ឧ. https://xxx.vercel.app):', saved);
      if (!input) return;
      base = input.trim().replace(/\/+$/, '');
      if (!/^https:\/\/[^/]+/i.test(base)) {
        onShowToast('URL ត្រូវចាប់ផ្តើមដោយ https://', 'error');
        return;
      }
      try { localStorage.setItem('tg_booking_public_url', base); } catch {}
    }
    setBusy(true);
    try {
      const r = await setTgWebhook(base);
      onShowToast(`បានភ្ជាប់ Webhook: ${r.url}`, 'success');
      await reload();
    } catch (err: any) {
      onShowToast(`ភ្ជាប់ Webhook បរាជ័យ: ${err?.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!cfg) {
    return (
      <div className={`${cardCls} p-10 flex flex-col items-center justify-center gap-2 text-xs text-slate-500`}>
        {error ? (
          <>
            <p className="font-semibold text-red-500">ទាញការកំណត់បរាជ័យ: {error}</p>
            <button type="button" onClick={() => reload()} className={`${btnCls} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200`}>
              <RefreshCw className="w-3.5 h-3.5" />ព្យាយាមម្ដងទៀត
            </button>
          </>
        ) : (
          <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-emerald-600" /> កំពុងទាញ...</span>
        )}
      </div>
    );
  }

  const hookUrl = cfg.webhook?.url || '';
  const hookOk = Boolean(hookUrl) && !cfg.webhook?.last_error_message;
  const inlineOn = Boolean(cfg.bot?.supports_inline_queries);
  // An empty allowed_updates list means "all except a few", which includes inline_query.
  const hookHasInline = !cfg.webhook?.allowed_updates?.length || cfg.webhook.allowed_updates.includes('inline_query');
  // Button presses in the pickup DM arrive as callback_query; webhooks set before that was added miss them
  const hookHasButtons = !cfg.webhook?.allowed_updates?.length || cfg.webhook.allowed_updates.includes('callback_query');
  const inlineText = !cfg.bot
    ? 'មិនទាន់ដឹង'
    : !inlineOn
      ? 'មិនទាន់បើក — @BotFather → /setinline'
      : hookUrl && !hookHasInline
        ? 'ចុច "ភ្ជាប់ Webhook ម្ដងទៀត"'
        : `វាយ @${cfg.bot.username} ក្នុង Channel ដើម្បីរើសឈ្មោះ`;

  const statuses = [
    {
      ok: cfg.botConfigured && !cfg.botError,
      label: 'Bot Token',
      value: cfg.bot?.username ? `@${cfg.bot.username}` : cfg.botError || (cfg.botConfigured ? '' : 'មិនទាន់កំណត់ក្នុង Server env'),
    },
    {
      ok: hookOk,
      label: 'Webhook',
      value: hookUrl ? (cfg.webhook?.last_error_message ? `Error: ${cfg.webhook.last_error_message}` : hookUrl.replace(/^https:\/\//, '')) : 'មិនទាន់ភ្ជាប់',
      mono: Boolean(hookUrl) && !cfg.webhook?.last_error_message,
    },
    { ok: inlineOn && Boolean(hookUrl) && hookHasInline, label: 'Inline (រើសឈ្មោះ)', value: inlineText },
    {
      ok: Boolean(hookUrl) && hookHasButtons,
      label: 'ប៊ូតុង DM',
      value: !hookUrl ? 'មិនទាន់ភ្ជាប់ Webhook' : hookHasButtons ? '✅ យកបាន / ❌ បោះបង់' : 'ចុច "ភ្ជាប់ Webhook ម្ដងទៀត"',
    },
  ];
  const okCount = statuses.filter((s) => s.ok).length;

  return (
    <div className="space-y-2.5">
      <div className={`${cardCls} p-3 space-y-2.5`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm sm:text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            ស្ថានភាព Bot
            {refreshing && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
          </h2>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              okCount === statuses.length
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
            }`}
          >
            {okCount}/{statuses.length} ដំណើរការ
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-2 divide-y sm:divide-y-0 divide-slate-100 dark:divide-slate-800 border sm:border-0 border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {statuses.map((s) => <StatusRow key={s.label} {...s} />)}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
          <button type="button" onClick={connect} disabled={busy || !cfg.botConfigured} className={`${btnCls} justify-center min-h-9 sm:min-h-0 bg-sky-600 text-white hover:bg-sky-700`}>
            <Link2 className="w-3.5 h-3.5" />{hookUrl ? 'ភ្ជាប់ Webhook ម្ដងទៀត' : 'ភ្ជាប់ Webhook'}
          </button>
          <span className="text-[10px] sm:text-[11px] text-slate-400 text-center sm:text-left">Webhook ចង្អុលទៅគេហទំព័រដែល Deploy (HTTPS)។ ពី localhost នឹងសួររក URL នោះ។</span>
        </div>
      </div>

      <div className={`${cardCls} p-3 space-y-2.5`}>
        <h2 className="text-sm sm:text-xs font-bold text-slate-800 dark:text-slate-100">អ្នក Assign <span className="font-normal text-slate-400">(Reply = Pick up by)</span></h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-2">
          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 space-y-1">
            <span>Telegram User ID</span>
            <input value={form.assigner_ids} onChange={(e) => editForm({ assigner_ids: e.target.value })} className={`${inputCls} font-mono`} placeholder="556322085" />
          </label>
          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 space-y-1">
            <span>ឈ្មោះហត្ថលេខា (Signature)</span>
            <input value={form.assigner_names} onChange={(e) => editForm({ assigner_names: e.target.value })} className={inputCls} placeholder="B Khu 011" />
          </label>
          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 space-y-1">
            <span>Chat ID របស់ Channel</span>
            <input value={form.chat_id} onChange={(e) => editForm({ chat_id: e.target.value })} className={`${inputCls} font-mono`} placeholder="ចាប់យកដោយស្វ័យប្រវត្តិ" />
          </label>
        </div>
        <details className="group text-[11px] text-slate-500 dark:text-slate-400">
          <summary className="flex items-center gap-1 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden font-medium text-slate-500 dark:text-slate-400">
            <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />ព័ត៌មានបន្ថែម
          </summary>
          <p className="mt-1.5 pl-4.5 leading-relaxed">
            អាចដាក់ច្រើននាក់ បំបែកដោយសញ្ញា , ។ ក្នុង Channel, Telegram មិនផ្ញើ User ID ទេ — ផ្ញើតែឈ្មោះហត្ថលេខា ដូច្នេះត្រូវបើក
            <b> Sign messages</b> ហើយឈ្មោះខាងលើត្រូវដូចឈ្មោះ Telegram របស់អ្នក Assign។ User ID ប្រើពេល Telegram ផ្ញើមក (Group)។
          </p>
        </details>
        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 space-y-1">
          <span>Chat ID របស់ Group/Channel ទទួល Pick up <span className="font-normal text-slate-400">(ទុកទទេ = ផ្ញើ DM ទៅអ្នក Pick up ម្នាក់ៗ)</span></span>
          <input value={form.notify_chat_id} onChange={(e) => editForm({ notify_chat_id: e.target.value })} className={`${inputCls} font-mono`} placeholder="-100xxxxxxxxxx" />
          <span className="block font-normal text-slate-400 leading-relaxed">
            ពេល Assign, Bot Post សារ Pick up ក្នុង Group/Channel នេះជំនួស DM (Mention ឈ្មោះអ្នកដែលមាន Telegram user_id)។ ត្រូវបញ្ចូល Bot ក្នុង Group នោះ; បើជា Channel ត្រូវដាក់ Bot ជា Admin មានសិទ្ធិ Post messages។
          </span>
        </label>
        <div className="flex sm:justify-end">
          <button type="button" onClick={save} disabled={busy} className={`${btnCls} w-full sm:w-auto justify-center min-h-9 sm:min-h-0 bg-emerald-600 text-white hover:bg-emerald-700`}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}រក្សាទុក
          </button>
        </div>
      </div>

      <details className={`${cardCls} group p-3 text-[11px] text-slate-600 dark:text-slate-300`}>
        <summary className="flex items-center justify-between gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
          <h2 className="text-sm sm:text-xs font-bold text-slate-800 dark:text-slate-100">ជំហានរៀបចំ</h2>
          <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        <ol className="mt-2.5 space-y-2">
          {[
            <>បង្កើត Bot ថ្មីតាម @BotFather ហើយដាក់ Token ក្នុង Server env ជា <code className="font-mono break-all">TELEGRAM_BOOKING_BOT_TOKEN</code> (Vercel → Settings → Environment Variables) រួច Redeploy។</>,
            <>បន្ថែម Bot ជា Admin ក្នុង Channel "IAL Booking" (សិទ្ធិ Post messages មិនចាំបាច់)។</>,
            <>Channel → Edit → បើក <b>Sign messages</b>។</>,
            <>ចុច "ភ្ជាប់ Webhook" ខាងលើ។</>,
            <>បន្ថែមឈ្មោះអ្នកបើកបរក្នុងផ្ទាំង "ក្រុមការងារ"។</>,
            <>
              (ជម្រើស) រើសឈ្មោះលឿន: @BotFather → <code className="font-mono">/setinline</code> → ជ្រើស Bot → ដាក់ placeholder (ឧ. ស្វែងរកឈ្មោះ…) រួចចុច "ភ្ជាប់ Webhook ម្ដងទៀត"។
              បន្ទាប់មក Reply លើ Post ហើយវាយ <code className="font-mono">@{cfg.bot?.username || 'ឈ្មោះBot'}</code> នោះបញ្ជីឈ្មោះនឹងលោតឡើង។
            </>,
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2 leading-relaxed">
              <span className="mt-px w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
};

const StatusRow: React.FC<{ ok: boolean; label: string; value: string; mono?: boolean }> = ({ ok, label, value, mono }) => (
  <div className="flex items-center gap-2.5 px-3 py-2.5 sm:py-2 sm:rounded-xl sm:border border-slate-200 dark:border-slate-800">
    <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
    <div className="min-w-0 flex-1">
      <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p
        className={`text-xs font-semibold text-slate-800 dark:text-slate-100 ${mono ? 'font-mono text-[11px] truncate' : 'break-words'}`}
        title={value}
      >
        {value || '—'}
      </p>
    </div>
  </div>
);
