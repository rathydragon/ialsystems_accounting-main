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
} from 'lucide-react';
import { AuthUser, Payer } from '../types';
import { normalizePayerCategory } from './PayerManagementPage';
import {
  TgBooking,
  TgBookingReply,
  TgBookingStatus,
  TgTeamMember,
  TgBookingConfig,
  fetchTgBookings,
  fetchTgBookingReplies,
  fetchTgTeam,
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
  DONE: { label: 'រួចរាល់', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30' },
  CANCELLED: { label: 'បោះបង់', cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700/40 dark:text-slate-400 dark:border-slate-600' },
};

const REPLY_REASON: Record<string, string> = {
  assigned: 'បាន Update',
  not_authorized: 'មិនមែនអ្នក Assign',
  booking_not_found: 'រកសារដើមមិនឃើញ',
  superseded: 'មាន Reply ថ្មីជាង',
};

const todayKh = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const daysAgoKh = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA', { timeZone: TZ });
const fmtTime = (v?: string | null) =>
  v ? new Date(v).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '';
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
    return saved === 'SETTINGS' && !isAdmin ? 'BOOKINGS' : saved;
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

  // Live: poll a tiny version fingerprint and reload only when the data actually changed
  useEffect(() => {
    let lastFull = Date.now();
    const tick = async () => {
      if (document.visibilityState !== 'visible' || inFlightRef.current) return;
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
    const c = { ALL: bookings.length, PENDING: 0, ASSIGNED: 0, DONE: 0, CANCELLED: 0, UNMATCHED: 0 } as Record<string, number>;
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
      if (q) {
        const hay = [b.text, b.customer, b.phone, b.location, b.author, b.picked_up_by].join('\n').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [bookings, serverHits, status, driver, deferredSearch]);

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
      await updateTgBooking(b.id, { pickedUpBy: name, rememberAlias: remember });
      if (remember) {
        onShowToast(`បានចងចាំ "${b.pickup_raw}" ជាឈ្មោះរបស់ ${name}`, 'success');
        setTeam(await fetchTgTeam());
      }
    } catch (err: any) {
      patchLocal(b.id, prev);
      onShowToast(`Update បរាជ័យ: ${err?.message}`, 'error');
    }
  }, [patchLocal]);

  const handleStatus = useCallback(async (b: TgBooking, next: TgBookingStatus) => {
    const prevStatus = b.status;
    patchLocal(b.id, { status: next });
    try {
      await updateTgBooking(b.id, { status: next });
    } catch (err: any) {
      patchLocal(b.id, { status: prevStatus });
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
    { id: 'TEAM', label: 'ក្រុមការងារ', icon: Users, show: true },
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

          {/* Tabs (segmented) */}
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-700/60">
            {tabs.filter((t) => t.show).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.label}</span>
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
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ស្វែងរក ឈ្មោះ / លេខទូរស័ព្ទ / ទីតាំង"
                className={`${inputCls} h-8 !py-0 !rounded-lg pl-8`}
              />
            </div>
            <input type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} className={`${inputCls} h-8 !py-0 !rounded-lg !w-[132px] shrink-0`} title="ចាប់ពីថ្ងៃ" />
            <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className={`${inputCls} h-8 !py-0 !rounded-lg !w-[132px] shrink-0`} title="ដល់ថ្ងៃ" />
            <select value={driver} onChange={(e) => setDriver(e.target.value)} className={`${inputCls} h-8 !py-0 !rounded-lg !w-[160px] shrink-0 cursor-pointer`}>
              <option value="">អ្នកបើកបរទាំងអស់</option>
              {perDriver.map(([name, n]) => (
                <option key={name} value={name}>{name} ({n})</option>
              ))}
            </select>

            {/* Quick date + status pills */}
            <div className="w-full xl:w-auto flex items-center gap-1 overflow-x-auto no-scrollbar">
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
                { id: 'DONE', label: STATUS_META.DONE.label },
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
          onDelete={handleDelete}
        />
      )}
      {tab === 'TEAM' && <TeamPanel team={team} setTeam={setTeam} payers={payers} isAdmin={isAdmin} onShowToast={onShowToast} />}
      {tab === 'SETTINGS' && isAdmin && <SettingsPanel onShowToast={onShowToast} />}
    </div>
  );
};

/* ------------------------------------------------------------------ */

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
  onDelete: (b: TgBooking) => void;
}

const BookingList: React.FC<BookingListProps> = ({ rows, team, loading, refreshing, error, canEdit, isAdmin, expanded, flash, onToggle, onAssign, onStatus, onDelete }) => {
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
      {rows.map((b) => (
        <BookingRow
          key={b.id}
          b={b}
          activeTeam={activeTeam}
          isOpen={expanded === b.id}
          flashing={flash.has(b.id)}
          canEdit={canEdit}
          isAdmin={isAdmin}
          onToggle={onToggle}
          onAssign={onAssign}
          onStatus={onStatus}
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
  onDelete: (b: TgBooking) => void;
}

// Supergroup/channel chat ids look like -100XXXXXXXXXX; t.me/c/ links only work for those
const tgMessageLink = (b: TgBooking): string => {
  const chat = String(b.chat_id ?? '');
  return chat.startsWith('-100') && b.message_id ? `https://t.me/c/${chat.slice(4)}/${b.message_id}` : '';
};

// Memoized: live refreshes and filter changes only re-render the rows whose data actually changed
const BookingRow = memo(({ b, activeTeam, isOpen, flashing, canEdit, isAdmin, onToggle, onAssign, onStatus, onDelete }: BookingRowProps) => {
  const inTeam = !b.picked_up_by || activeTeam.some((t) => t.name === b.picked_up_by);
  return (
    <div
      key={b.id}
      className={`transition-colors duration-700 ${b.status === 'CANCELLED' ? 'opacity-60' : ''} ${flashing ? 'bg-emerald-50 dark:bg-emerald-500/10' : ''}`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-2 px-3 py-2.5">
        {/* Message */}
        <button type="button" onClick={() => onToggle(b.id)} className="flex items-start gap-2 min-w-0 flex-1 text-left cursor-pointer">
          {isOpen ? <ChevronDown className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono">{fmtTime(b.posted_at)}</span>
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
              <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">{b.author || 'Channel'}</span>
              {b.service_type && (
                <span className="px-1.5 py-px rounded-md bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300 text-[11px] font-semibold">
                  {b.service_type}
                </span>
              )}
            </div>
            <p className={`text-sm leading-snug text-slate-800 dark:text-slate-100 mt-0.5 ${isOpen ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>
              {b.customer && <span className="font-bold">{b.customer} · </span>}
              {b.text}
            </p>
            {(b.phone || b.location || b.map_url) && (
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
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
        <div className="flex items-center gap-2 pl-5.5 lg:pl-0 shrink-0">
          <div className="flex flex-col items-start lg:items-end gap-0.5">
            <select
              value={b.picked_up_by || ''}
              disabled={!canEdit}
              onChange={(e) => onAssign(b, e.target.value)}
              className={`${inputCls} !w-44 !text-sm cursor-pointer ${b.pickup_unmatched ? '!border-amber-400 !bg-amber-50 dark:!bg-amber-500/10' : ''}`}
              title={b.assigned_by ? `Assign ដោយ ${b.assigned_by} ${fmtDateTime(b.assigned_at)}` : undefined}
            >
              <option value="">— Pick up by —</option>
              {!inTeam && b.picked_up_by && <option value={b.picked_up_by}>⚠ {b.picked_up_by}</option>}
              {activeTeam.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
            {b.pickup_unmatched ? (
              <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />Reply "{b.pickup_raw}" មិនស្គាល់ — ជ្រើសឈ្មោះ
              </span>
            ) : b.assigned_by ? (
              <span className="text-[11px] text-slate-400">ដោយ {b.assigned_by} · {fmtTime(b.assigned_at)}</span>
            ) : null}
          </div>
          <select
            value={b.status}
            disabled={!canEdit}
            onChange={(e) => onStatus(b, e.target.value as TgBookingStatus)}
            className={`px-2 py-1.5 text-sm font-semibold rounded-xl border cursor-pointer focus:outline-none ${STATUS_META[b.status]?.cls || ''}`}
          >
            {(Object.keys(STATUS_META) as TgBookingStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>
          {isAdmin && (
            <button type="button" onClick={() => onDelete(b)} title="លុប" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer">
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
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchTgBookingReplies(booking.id)
      .then((r) => alive && setReplies(r))
      .catch((e) => alive && setError(e?.message || 'Failed'));
    return () => { alive = false; };
  }, [booking.id, booking.picked_up_by]);

  return (
    <div className="px-3 pb-3 pl-8.5">
      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 p-2.5 space-y-1.5">
        <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">ប្រវត្តិ Reply</p>
        {error && <p className="text-[11px] text-red-500">{error}</p>}
        {!replies && !error && <p className="text-[11px] text-slate-400">កំពុងទាញ...</p>}
        {replies && replies.length === 0 && <p className="text-[11px] text-slate-400">មិនទាន់មាន Reply</p>}
        {replies?.map((r) => (
          <div key={r.id} className="flex items-start gap-2 text-[11px]">
            <span className="font-mono text-slate-400 shrink-0">{fmtTime(r.posted_at)}</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">{r.author || r.author_id || '?'}</span>
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

  const startEdit = (m: TgTeamMember) => {
    setEditing({ ...m });
    setAliasText(m.aliases.join(', '));
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
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100">ក្រុមការងារ (Pick up)</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Reply របស់អ្នក Assign ត្រូវបានផ្ទៀងផ្ទាត់នឹងឈ្មោះ និងឈ្មោះហៅក្រៅ (មិនខ្វល់អក្សរធំតូច និងពាក្យ "driver")
          </p>
        </div>
        {isAdmin && !editing && !importing && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => setImporting(true)} className={`${btnCls} bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20`}>
              <Download className="w-3.5 h-3.5" />នាំចូលពីអ្នកប្រគល់ប្រាក់
            </button>
            <button type="button" onClick={() => startEdit(emptyMember())} className={`${btnCls} bg-emerald-600 text-white hover:bg-emerald-700`}>
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

      {team.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-6">មិនទាន់មានឈ្មោះក្រុមការងារ</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {team.map((m) => (
            <div key={m.id ?? m.name} className={`flex items-center gap-3 px-3 py-2 ${m.active ? '' : 'opacity-50'}`}>
              <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[11px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                {m.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {m.name} <span className="font-normal text-slate-400">· {m.role}{m.phone ? ` · ${m.phone}` : ''}</span>
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{m.aliases.length ? m.aliases.join(', ') : 'គ្មានឈ្មោះហៅក្រៅ'}</p>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => startEdit(m)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 cursor-pointer" title="កែ">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => remove(m)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer" title="លុប">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */

const SettingsPanel: React.FC<{ onShowToast: TelegramBookingPageProps['onShowToast'] }> = ({ onShowToast }) => {
  const [cfg, setCfg] = useState<TgBookingConfig | null>(null);
  const [form, setForm] = useState({ assigner_ids: '', assigner_names: '', chat_id: '' });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const c = await fetchTgConfig();
      setCfg(c);
      setForm({ assigner_ids: c.assigner_ids || '', assigner_names: c.assigner_names || '', chat_id: c.chat_id || '' });
    } catch (err: any) {
      onShowToast(`ទាញការកំណត់បរាជ័យ: ${err?.message}`, 'error');
    }
  }, [onShowToast]);

  useEffect(() => { reload(); }, [reload]);

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
      <div className={`${cardCls} p-10 flex items-center justify-center gap-2 text-xs text-slate-500`}>
        <Loader2 className="w-4 h-4 animate-spin text-emerald-600" /> កំពុងទាញ...
      </div>
    );
  }

  const hookUrl = cfg.webhook?.url || '';
  const hookOk = Boolean(hookUrl) && !cfg.webhook?.last_error_message;
  const inlineOn = Boolean(cfg.bot?.supports_inline_queries);
  // An empty allowed_updates list means "all except a few", which includes inline_query.
  const hookHasInline = !cfg.webhook?.allowed_updates?.length || cfg.webhook.allowed_updates.includes('inline_query');
  const inlineText = !cfg.bot
    ? 'មិនទាន់ដឹង'
    : !inlineOn
      ? 'មិនទាន់បើក — @BotFather → /setinline'
      : hookUrl && !hookHasInline
        ? 'ចុច "ភ្ជាប់ Webhook ម្ដងទៀត"'
        : `វាយ @${cfg.bot.username} ក្នុង Channel ដើម្បីរើសឈ្មោះ`;

  return (
    <div className="space-y-2.5">
      <div className={`${cardCls} p-3 space-y-2`}>
        <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100">ស្ថានភាព Bot</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <StatusRow ok={cfg.botConfigured && !cfg.botError} label="Bot Token (TELEGRAM_BOOKING_BOT_TOKEN)"
            value={cfg.bot?.username ? `@${cfg.bot.username}` : cfg.botError || (cfg.botConfigured ? '' : 'មិនទាន់កំណត់ក្នុង Server env')} />
          <StatusRow ok={hookOk} label="Webhook"
            value={hookUrl ? (cfg.webhook?.last_error_message ? `Error: ${cfg.webhook.last_error_message}` : hookUrl) : 'មិនទាន់ភ្ជាប់'} />
          <StatusRow ok={inlineOn && Boolean(hookUrl) && hookHasInline} label="Inline mode (រើសឈ្មោះ)" value={inlineText} />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={connect} disabled={busy || !cfg.botConfigured} className={`${btnCls} bg-sky-600 text-white hover:bg-sky-700`}>
            <Link2 className="w-3.5 h-3.5" />{hookUrl ? 'ភ្ជាប់ Webhook ម្ដងទៀត' : 'ភ្ជាប់ Webhook'}
          </button>
          <span className="text-[11px] text-slate-400">Webhook ចង្អុលទៅគេហទំព័រដែល Deploy (HTTPS)។ ពី localhost នឹងសួររក URL នោះ។</span>
        </div>
      </div>

      <div className={`${cardCls} p-3 space-y-2.5`}>
        <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100">អ្នក Assign (Reply = Pick up by)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 space-y-1">
            <span>Telegram User ID</span>
            <input value={form.assigner_ids} onChange={(e) => setForm({ ...form, assigner_ids: e.target.value })} className={`${inputCls} font-mono`} placeholder="556322085" />
          </label>
          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 space-y-1">
            <span>ឈ្មោះហត្ថលេខា (Signature)</span>
            <input value={form.assigner_names} onChange={(e) => setForm({ ...form, assigner_names: e.target.value })} className={inputCls} placeholder="B Khu 011" />
          </label>
          <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 space-y-1">
            <span>Chat ID របស់ Channel</span>
            <input value={form.chat_id} onChange={(e) => setForm({ ...form, chat_id: e.target.value })} className={`${inputCls} font-mono`} placeholder="ចាប់យកដោយស្វ័យប្រវត្តិ" />
          </label>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          អាចដាក់ច្រើននាក់ បំបែកដោយសញ្ញា , ។ ក្នុង Channel, Telegram មិនផ្ញើ User ID ទេ — ផ្ញើតែឈ្មោះហត្ថលេខា ដូច្នេះត្រូវបើក
          <b> Sign messages</b> ហើយឈ្មោះខាងលើត្រូវដូចឈ្មោះ Telegram របស់អ្នក Assign។ User ID ប្រើពេល Telegram ផ្ញើមក (Group)។
        </p>
        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={busy} className={`${btnCls} bg-emerald-600 text-white hover:bg-emerald-700`}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}រក្សាទុក
          </button>
        </div>
      </div>

      <div className={`${cardCls} p-3 space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300`}>
        <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100">ជំហានរៀបចំ</h2>
        <ol className="list-decimal pl-4 space-y-1">
          <li>បង្កើត Bot ថ្មីតាម @BotFather ហើយដាក់ Token ក្នុង Server env ជា <code className="font-mono">TELEGRAM_BOOKING_BOT_TOKEN</code> (Vercel → Settings → Environment Variables) រួច Redeploy។</li>
          <li>បន្ថែម Bot ជា Admin ក្នុង Channel "IAL Booking" (សិទ្ធិ Post messages មិនចាំបាច់)។</li>
          <li>Channel → Edit → បើក <b>Sign messages</b>។</li>
          <li>ចុច "ភ្ជាប់ Webhook" ខាងលើ។</li>
          <li>បន្ថែមឈ្មោះអ្នកបើកបរក្នុងផ្ទាំង "ក្រុមការងារ"។</li>
          <li>
            (ជម្រើស) រើសឈ្មោះលឿន: @BotFather → <code className="font-mono">/setinline</code> → ជ្រើស Bot → ដាក់ placeholder (ឧ. ស្វែងរកឈ្មោះ…) រួចចុច "ភ្ជាប់ Webhook ម្ដងទៀត"។
            បន្ទាប់មក Reply លើ Post ហើយវាយ <code className="font-mono">@{cfg.bot?.username || 'ឈ្មោះBot'}</code> នោះបញ្ជីឈ្មោះនឹងលោតឡើង។
          </li>
        </ol>
      </div>
    </div>
  );
};

const StatusRow: React.FC<{ ok: boolean; label: string; value: string }> = ({ ok, label, value }) => (
  <div className="flex items-start gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-2.5 py-2">
    <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
    <div className="min-w-0">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 break-all">{value || '—'}</p>
    </div>
  </div>
);
