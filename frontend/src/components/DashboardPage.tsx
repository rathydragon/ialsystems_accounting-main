import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  PackageCheck,
  Archive,
  PackageOpen,
  Undo2,
  Truck,
  Send,
  CalendarDays,
  Clock,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { AuthUser, DistributionReportItem, NavView, UserPermission, WarehouseScanItem, WarehouseScanType } from '../types';
import { canUserAccessPage } from '../services/userPermissionService';
import { subscribeToWarehouseScans } from '../services/warehouseScanService';
import { getInitialDistributionReports } from '../services/distributionReportService';
import { fetchTgBookings, TgBooking, TgBookingStatus } from '../services/telegramBookingService';
import { formatToIsoDateOnly } from '../utils/dateFormatter';

interface DashboardPageProps {
  currentUser: AuthUser;
  permissions: UserPermission[];
  onNavigate: (view: NavView) => void;
}

const TZ = 'Asia/Phnom_Penh';
const isoDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });

const SCAN_META: Record<WarehouseScanType, { label: string; sub: string; icon: React.ElementType; tone: string; badge: string }> = {
  SCAN_IN: { label: 'ScanIn', sub: 'ចូលឃ្លាំង', icon: ArrowDownToLine, tone: 'text-blue-600 bg-blue-500/10 dark:text-blue-400', badge: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-900' },
  SCAN_OUT: { label: 'ScanOut', sub: 'ចេញពីឃ្លាំង', icon: ArrowUpFromLine, tone: 'text-amber-600 bg-amber-500/10 dark:text-amber-400', badge: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900' },
  OUT_OF_DELIVERY: { label: 'Rider', sub: 'ចេញចែកចាយ', icon: PackageCheck, tone: 'text-indigo-600 bg-indigo-500/10 dark:text-indigo-400', badge: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-900' },
  HOLD_REMAINING: { label: 'Hold', sub: 'នៅសល់ក្នុងឃ្លាំង', icon: Archive, tone: 'text-slate-600 bg-slate-500/10 dark:text-slate-300', badge: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700' },
  ARRIVED_HUB: { label: 'Arrived Hub', sub: 'ទទួលចូលឃ្លាំង', icon: PackageOpen, tone: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900' },
  RETURN_SHIPMENTS: { label: 'Return', sub: 'បង្វិលត្រឡប់', icon: Undo2, tone: 'text-rose-600 bg-rose-500/10 dark:text-rose-400', badge: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900' },
};
const SCAN_ORDER: WarehouseScanType[] = ['SCAN_IN', 'SCAN_OUT', 'OUT_OF_DELIVERY', 'HOLD_REMAINING', 'ARRIVED_HUB', 'RETURN_SHIPMENTS'];

const BOOKING_META: { id: TgBookingStatus; label: string; bar: string }[] = [
  { id: 'PENDING', label: 'រង់ចាំ', bar: 'bg-amber-500' },
  { id: 'ASSIGNED', label: 'បានចាត់', bar: 'bg-blue-500' },
  { id: 'ACCEPTED', label: 'ទទួលយក', bar: 'bg-violet-500' },
  { id: 'DONE', label: 'រួចរាល់', bar: 'bg-emerald-500' },
  { id: 'NOT_PICKED', label: 'មិនបានយក', bar: 'bg-rose-500' },
  { id: 'CANCELLED', label: 'បោះបង់', bar: 'bg-slate-400' },
];

// Chart series: fixed colours per entity
const SERIES = [
  { type: 'SCAN_IN' as const, label: 'ScanIn', color: 'bg-blue-500' },
  { type: 'SCAN_OUT' as const, label: 'ScanOut', color: 'bg-amber-500' },
];

const KHMER_DAYS = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'];
const greeting = (h: number) => (h < 12 ? 'អរុណសួស្តី' : h < 17 ? 'ទិវាសួស្តី' : 'សាយណ្ហសួស្តី');

// A "nice" top for the chart axis: 1, 2, 2.5 or 5 × 10^n
const niceMax = (v: number) => {
  if (v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};

const scanDay = (s: WarehouseScanItem) => formatToIsoDateOnly(s.date) || formatToIsoDateOnly(s.createdAt);

export const DashboardPage: React.FC<DashboardPageProps> = ({ currentUser, permissions, onNavigate }) => {
  const [scans, setScans] = useState<WarehouseScanItem[]>([]);
  const [reports, setReports] = useState<DistributionReportItem[]>(() => getInitialDistributionReports());
  const [bookings, setBookings] = useState<TgBooking[] | null>(null);
  const [now, setNow] = useState(() => new Date());

  const can = (v: NavView) => canUserAccessPage(v, currentUser, permissions);
  const canScan = SCAN_ORDER.some(t => can(t));
  const canDistribution = can('DISTRIBUTION_REPORT');
  const canBooking = can('TG_BOOKING');

  // Warehouse scans (live cache, refreshed by the App master poll)
  useEffect(() => (canScan ? subscribeToWarehouseScans(items => setScans(items)) : undefined), [canScan]);

  // Distribution reports (local mirror of Hostinger, refreshed by the App master poll)
  useEffect(() => {
    const refresh = () => setReports(getInitialDistributionReports());
    window.addEventListener('ial_distribution_reports_updated', refresh);
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.removeEventListener('ial_distribution_reports_updated', refresh);
      window.clearInterval(timer);
    };
  }, []);

  // Today's Telegram bookings, refreshed every minute
  const today = isoDay(now);
  useEffect(() => {
    if (!canBooking) return;
    let alive = true;
    const load = () =>
      fetchTgBookings({ startDate: today, endDate: today, limit: 2000 })
        .then(rows => { if (alive) setBookings(Array.isArray(rows) ? rows : []); })
        .catch(() => { if (alive) setBookings(prev => prev ?? []); });
    load();
    const t = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, [canBooking, today]);

  const ownOnly = !!currentUser.viewOnlyOwn;
  const myEmail = (currentUser.email || '').toLowerCase();

  const stats = useMemo(() => {
    const mine = ownOnly ? scans.filter(s => (s.operatorEmail || '').toLowerCase() === myEmail) : scans;

    // Today / yesterday: unique barcodes per scan type
    const newSets = () => Object.fromEntries(SCAN_ORDER.map(t => [t, new Set<string>()])) as Record<WarehouseScanType, Set<string>>;
    const todaySets = newSets();
    const ySets = newSets();
    const yesterday = isoDay(new Date(now.getTime() - 86_400_000));

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getTime() - (6 - i) * 86_400_000);
      return { key: isoDay(d), label: KHMER_DAYS[d.getDay()], date: d.getDate(), SCAN_IN: new Set<string>(), SCAN_OUT: new Set<string>() };
    });
    const dayIndex = new Map(days.map((d, i) => [d.key, i]));

    for (const s of mine) {
      if (!todaySets[s.scanType]) continue;
      const k = scanDay(s);
      const code = (s.barcode || s.tracking || s.id || '').toUpperCase();
      if (k === today) todaySets[s.scanType].add(code);
      if (k === yesterday) ySets[s.scanType].add(code);
      const idx = dayIndex.get(k);
      if (idx !== undefined && (s.scanType === 'SCAN_IN' || s.scanType === 'SCAN_OUT')) days[idx][s.scanType].add(code);
    }

    const counts = Object.fromEntries(SCAN_ORDER.map(t => [t, todaySets[t].size])) as Record<WarehouseScanType, number>;
    const yCounts = Object.fromEntries(SCAN_ORDER.map(t => [t, ySets[t].size])) as Record<WarehouseScanType, number>;
    const chart = days.map(d => ({ key: d.key, label: d.label, date: d.date, SCAN_IN: d.SCAN_IN.size, SCAN_OUT: d.SCAN_OUT.size }));
    const axisMax = niceMax(Math.max(...chart.map(d => Math.max(d.SCAN_IN, d.SCAN_OUT))));

    // Latest operations (grouped by operation code)
    const ops = new Map<string, { code: string; type: WarehouseScanType; by: string; at: string; count: number }>();
    for (const s of mine) {
      const code = s.operationCode || s.batchId || s.id;
      const o = ops.get(code);
      if (o) {
        o.count++;
        if ((s.createdAt || '') > o.at) o.at = s.createdAt;
      } else {
        ops.set(code, { code, type: s.scanType, by: s.createdBy || s.operatorEmail || '', at: s.createdAt || '', count: 1 });
      }
    }
    const recent = [...ops.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 7);

    return { counts, yCounts, chart, axisMax, recent, todayTotal: SCAN_ORDER.reduce((a, t) => a + counts[t], 0) };
  }, [scans, now, today, ownOnly, myEmail]);

  const distToday = useMemo(() => {
    const list = reports
      .filter(r => formatToIsoDateOnly(r.date) === today)
      .filter(r => !ownOnly || (r.operatorEmail || '').toLowerCase() === myEmail);
    return { count: list.length, people: new Set(list.map(r => (r.name || '').trim()).filter(Boolean)).size };
  }, [reports, today, ownOnly, myEmail]);

  const bookingStats = useMemo(() => {
    const by = Object.fromEntries(BOOKING_META.map(b => [b.id, 0])) as Record<TgBookingStatus, number>;
    for (const b of bookings || []) if (by[b.status] !== undefined) by[b.status]++;
    return { by, total: (bookings || []).length };
  }, [bookings]);

  const firstName = (currentUser.name || currentUser.email || '').split(' ').slice(-1)[0];
  const dateLabel = `ថ្ងៃ${KHMER_DAYS[now.getDay()]} · ${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  const timeLabel = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const card = 'rounded-xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900';
  const visibleScanTypes = SCAN_ORDER.filter(t => can(t));
  const chartSeries = SERIES.filter(s => can(s.type));

  return (
    <div className="space-y-3 pb-4">
      {/* ── Header bar ── */}
      <section className={`${card} relative overflow-hidden px-4 py-3`}>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-500 to-violet-500" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
              {greeting(now.getHours())}, <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">{firstName}</span> 👋
            </h1>
            <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <CalendarDays className="w-3.5 h-3.5" /> {dateLabel}
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <Clock className="w-3.5 h-3.5" /> {timeLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canScan && <MiniPill label="ស្កេនថ្ងៃនេះ" value={stats.todayTotal} />}
            {canBooking && <MiniPill label="Booking ថ្ងៃនេះ" value={bookings ? bookingStats.total : '…'} />}
          </div>
        </div>
      </section>

      {/* ── Warehouse tiles (today, unique parcels) ── */}
      {visibleScanTypes.length > 0 && (
        <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {visibleScanTypes.map(t => {
            const m = SCAN_META[t];
            const Icon = m.icon;
            const v = stats.counts[t];
            const diff = v - stats.yCounts[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => onNavigate(t)}
                className={`${card} group text-left px-3.5 py-3 min-w-0 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition cursor-pointer`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${m.tone}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100 truncate leading-tight">{m.label}</p>
                    <p className="text-[10px] text-slate-400 truncate leading-tight">{m.sub}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition shrink-0" />
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-2">
                  <p className="text-[22px] font-extrabold text-slate-900 dark:text-white tabular-nums leading-none">{v.toLocaleString('en-US')}</p>
                  <span
                    className={`text-[10.5px] font-semibold tabular-nums ${diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : diff < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}
                    title="ធៀបនឹងម្សិលមិញ"
                  >
                    {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {Math.abs(diff)}
                  </span>
                </div>
              </button>
            );
          })}
        </section>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-5 gap-3">
        {/* ── 7-day ScanIn / ScanOut chart ── */}
        {chartSeries.length > 0 && (
          <div className={`${card} xl:col-span-3 flex flex-col p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">ទំនិញចូល / ចេញ ៧ ថ្ងៃ</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">ចំនួនបាកូដ · ដាក់កណ្ដុរលើរបារដើម្បីមើលលម្អិត</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {chartSeries.map(s => (
                  <span key={s.type} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    <span className={`w-2.5 h-2.5 rounded-sm ${s.color}`} /> {s.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-[220px] mt-3 flex gap-2">
              <div className="flex flex-col justify-between pb-6 text-[10px] text-slate-400 dark:text-slate-500 text-right w-7 shrink-0 tabular-nums">
                {[1, 0.5, 0].map(f => <span key={f} className="leading-none">{Math.round(stats.axisMax * f).toLocaleString('en-US')}</span>)}
              </div>
              <div className="flex-1 flex flex-col min-w-0">
                <div className="relative flex-1">
                  {[0, 50].map(t => (
                    <div key={t} className="absolute inset-x-0 border-t border-dashed border-slate-200/70 dark:border-slate-800" style={{ top: `${t}%` }} />
                  ))}
                  <div className="absolute inset-x-0 bottom-0 border-t border-slate-200 dark:border-slate-700" />
                  <div className="absolute inset-0 flex items-end gap-2 sm:gap-4 px-1">
                    {stats.chart.map(d => {
                      const top = Math.max(...chartSeries.map(s => d[s.type]));
                      return (
                        <div key={d.key} className="group relative flex-1 h-full flex items-end justify-center gap-0.5">
                          <div className="absolute inset-0 rounded-md group-hover:bg-slate-100/80 dark:group-hover:bg-slate-800/50 transition" />
                          {chartSeries.map(s => {
                            const v = d[s.type];
                            return (
                              <div
                                key={s.type}
                                className={`relative w-full max-w-[16px] rounded-t transition-all duration-500 ${s.color}`}
                                style={{ height: v > 0 ? `max(${(v / stats.axisMax) * 100}%, 3px)` : '2px', opacity: v > 0 ? 1 : 0.25 }}
                              />
                            );
                          })}
                          <div
                            className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition"
                            style={{ bottom: `calc(${Math.min((top / stats.axisMax) * 100, 65)}% + 8px)` }}
                          >
                            <div className="whitespace-nowrap rounded-md bg-slate-900 dark:bg-slate-700 text-white px-2 py-1 shadow-lg text-[10.5px] leading-snug">
                              <p className="font-bold">{d.label} {d.date}</p>
                              {chartSeries.map(s => (
                                <p key={s.type} className="flex items-center gap-1.5 text-slate-200 tabular-nums">
                                  <span className={`w-2 h-2 rounded-sm ${s.color}`} /> {s.label}: <b className="text-white">{d[s.type]}</b>
                                </p>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-2 sm:gap-4 px-1 h-6 pt-1">
                  {stats.chart.map((d, i) => {
                    const isToday = i === stats.chart.length - 1;
                    return (
                      <p key={d.key} className={`flex-1 text-center text-[10.5px] truncate ${isToday ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
                        {isToday ? 'ថ្ងៃនេះ' : `${d.label.slice(0, 3)} ${d.date}`}
                      </p>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Right column: bookings, distribution, latest warehouse activity ── */}
        {(canBooking || canDistribution || canScan) && (
          <div className={`${chartSeries.length > 0 ? 'xl:col-span-2' : 'xl:col-span-5'} flex flex-col gap-3`}>
            {canBooking && (
              <button type="button" onClick={() => onNavigate('TG_BOOKING')} className={`${card} text-left p-4 hover:border-blue-300 dark:hover:border-blue-700 transition cursor-pointer`}>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sky-600 bg-sky-500/10 dark:text-sky-400"><Send className="w-3.5 h-3.5" /></div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">Telegram Booking ថ្ងៃនេះ</h2>
                  </div>
                  <span className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">{bookings ? bookingStats.total : '…'}</span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 gap-px">
                  {bookingStats.total > 0 && BOOKING_META.map(b => bookingStats.by[b.id] > 0 && (
                    <div key={b.id} className={b.bar} style={{ width: `${(bookingStats.by[b.id] / bookingStats.total) * 100}%` }} />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 mt-3">
                  {BOOKING_META.map(b => (
                    <div key={b.id} className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-2 h-2 rounded-sm shrink-0 ${b.bar}`} />
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{b.label}</span>
                      <span className="ml-auto text-[12px] font-bold text-slate-900 dark:text-white tabular-nums">{bookingStats.by[b.id]}</span>
                    </div>
                  ))}
                </div>
              </button>
            )}

            {canDistribution && (
              <button type="button" onClick={() => onNavigate('DISTRIBUTION_REPORT')} className={`${card} text-left px-4 py-3 flex items-center gap-3 hover:border-blue-300 dark:hover:border-blue-700 transition cursor-pointer`}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-violet-600 bg-violet-500/10 dark:text-violet-400 shrink-0"><Truck className="w-4 h-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100">របាយការណ៍ចែកចាយថ្ងៃនេះ</p>
                  <p className="text-[10.5px] text-slate-400">{distToday.people} នាក់ចែកចាយ</p>
                </div>
                <span className="text-[22px] font-extrabold text-slate-900 dark:text-white tabular-nums">{distToday.count.toLocaleString('en-US')}</span>
              </button>
            )}

            {canScan && (
              <div className={`${card} p-4 flex-1`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Activity className="w-3.5 h-3.5 text-slate-400" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">សកម្មភាពឃ្លាំងចុងក្រោយ</h2>
                </div>
                {stats.recent.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">មិនទាន់មានការស្កេន</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {stats.recent.slice(0, chartSeries.length > 0 ? 4 : 7).map(o => {
                      const m = SCAN_META[o.type] || SCAN_META.SCAN_IN;
                      return (
                        <li key={o.code} className="flex items-center gap-2 py-1.5">
                          <span className={`shrink-0 text-[9.5px] font-bold px-1.5 rounded ring-1 ${m.badge}`}>{m.label}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11.5px] font-semibold text-slate-800 dark:text-slate-100 truncate">{o.code}</p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {o.by} · {o.at ? new Date(o.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                            </p>
                          </div>
                          <span className="text-[12px] font-bold text-slate-900 dark:text-white tabular-nums shrink-0">
                            {o.count} <span className="text-[10px] font-normal text-slate-400">pcs</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

const MiniPill: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 ring-1 ring-slate-200/70 dark:ring-slate-700">
    <span className="text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
    <span className="text-[13px] font-extrabold text-slate-900 dark:text-white tabular-nums">{value}</span>
  </div>
);

export default DashboardPage;
