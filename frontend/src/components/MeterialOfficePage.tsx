import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Boxes,
  RefreshCw,
  Search,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Minimize2,
  Table2,
  LayoutGrid,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Zap,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  RotateCcw,
  SlidersHorizontal,
  Package,
  Layers,
  Save,
  Filter,
  Calendar,
  Hash,
  DollarSign,
  Eye,
  Link as LinkIcon,
  Smartphone,
  Laptop,
  CheckCheck,
  User,
  Truck,
  Navigation,
  CreditCard,
  Gauge,
  MapPin,
  Activity,
  Fuel,
  StickyNote,
  Tag,
  Printer,
  Plus,
  Pencil,
  Trash2
} from 'lucide-react';
import { AuthUser, AppSettings, UserPermission } from '../types';
import { GridHeadGutter, GridRowGutter, GridSelectionBar, useGridSelection, copyRowsAsTsv, exportRowsAsCsv } from './ui/DataGrid';
import { SheetColumnDef, SheetRowData } from '../utils/googleSheetFetcher';
import {
  getCachedMeterialOffice,
  fetchLiveMeterialOffice,
  MO_FIELDS,
  MO_COLUMNS,
  saveMeterialOfficeRow,
  deleteMeterialOfficeRows
} from '../services/meterialOfficeService';
import { getCachedSokimexData, fetchLiveSokimexData } from '../services/sokimexPostpaidService';
import { formatCsv, downloadCsv } from '../utils/csvHelper';
import { copyText } from '../utils/clipboard';
import { CountdownText, useCountdownStore } from './SyncCountdown';


interface MeterialOfficePageProps {
  currentUser: AuthUser | null;
  permissions?: UserPermission[];
  settings?: AppSettings;
  onUpdateSettings?: (newSettings: Partial<AppSettings>) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const STORAGE_KEY_AUTO_SYNC = 'accounting_meterial_office_auto_sync_enabled';
const STORAGE_KEY_SYNC_INTERVAL = 'accounting_meterial_office_sync_interval';
const STORAGE_KEY_VIEW_MODE = 'accounting_meterial_office_view_mode';

// Header styling shared by the toolbar controls so every button lines up at the same height
const HEADER_BTN =
  'inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold border transition cursor-pointer active:scale-95 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed';
const HEADER_BTN_NEUTRAL =
  'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 hover:border-slate-300 dark:hover:bg-slate-800';
const KPI_CHIP =
  'inline-flex items-center gap-1 h-7 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 whitespace-nowrap shrink-0';

// Helper to check if a value is a valid URL
const isValidUrl = (val: any): boolean => {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('www.');
};

// Format URL for anchor href
const formatUrlHref = (val: string): string => {
  const trimmed = val.trim();
  if (trimmed.startsWith('www.')) return `https://${trimmed}`;
  return trimmed;
};

// Check if a column represents an identifier (serial, card, phone, ID, code) rather than a summable financial metric
// Computed columns pulled from SOKIMEX POSTPAID (matched on Link_Sokimic = Card Holder Name)
const SK_COLUMNS: SheetColumnDef[] = [
  { id: 'sk_quantity', label: 'Quantity', type: 'number' },
  { id: 'sk_net_amount', label: 'Net Amount', type: 'number' }
];
const SK_COL_IDS = new Set(SK_COLUMNS.map((c) => c.id));
// Net Amount (from Sokimex) is compared against this stored limit
const LIMIT_COL_ID = 'net_amount_limit';
const NEAR_LIMIT_PCT = 0.9; // amber warning from 90% of the limit
const toNum = (v: any): number | null => {
  const s = String(v ?? '').replace(/[^0-9.-]+/g, '');
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
};
const fmtMoney = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Columns kept in the DB / edit form but not shown on the page
const HIDDEN_COL_IDS = new Set(['size_type', 'card_id', 'details', 'check_date', 'serial_gps']);
const normSokimexKey = (v: any) => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

const isLikelyIdentifierCol = (colId: string, colLabel: string): boolean => {
  const combined = `${colId} ${colLabel}`.toLowerCase();
  return /id|serial|gps|phone|tel|code|barcode|card|pin|lat|long|imei|sn\b/i.test(combined);
};

// ── Smart cell rendering: turn plain sheet text into easy-to-scan badges ──
const isEmptyVal = (s: string) => !s || s === '-' || s === '—';

// Warn this many days before a truck's Check Expire date
const EXPIRE_WARN_DAYS = 10;
const expireHint = (days: number) => (days === 0 ? 'ផុតថ្ងៃនេះ' : `សល់ ${days} ថ្ងៃ`);

const parseDmy = (s: string): Date | null => {
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
};

const PILL = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap';
const TONE = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900',
  red: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-900',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-900',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-900',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:ring-orange-900',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
};
const DOT = { green: 'bg-emerald-500', red: 'bg-rose-500', amber: 'bg-amber-500' };

const statusTone = (v: string): 'green' | 'red' | 'amber' | null => {
  if (/^(active|ok|ready|ដំណើរការ)$/i.test(v)) return 'green';
  if (/(ex?s?pire|expired|inactive|broken|ផុត|ខូច)/i.test(v)) return 'red';
  if (/(stand ?by|pending|wait|រង់ចាំ)/i.test(v)) return 'amber';
  return null;
};

const vehicleTone = (v: string): keyof typeof TONE => {
  if (/truck|ឡាន/i.test(v)) return 'blue';
  if (/moto|ម៉ូតូ/i.test(v)) return 'violet';
  if (/tuk/i.test(v)) return 'orange';
  return 'slate';
};

const nameInitials = (v: string) =>
  v
    .replace(/^(mr|ms|mrs|miss|dr)\.?\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

const SmartCell: React.FC<{ label: string; value: string; isFirst?: boolean; warnDays?: number; limitRow?: SheetRowData }> = ({
  label,
  value,
  isFirst,
  warnDays,
  limitRow
}) => {
  const l = label.toLowerCase();
  if (isEmptyVal(value)) return <span className="text-slate-300 dark:text-slate-600 select-none">—</span>;

  // Net Amount above (or close to) its Net Amount Limit
  if (limitRow?.__limitState) {
    const over = limitRow.__limitState === 'over';
    const net = toNum(limitRow.sk_net_amount) ?? 0;
    const limit = toNum(limitRow[LIMIT_COL_ID]) ?? 0;
    const pct = Math.round((limitRow.__limitPct || 0) * 100);
    const hint = over
      ? `លើស Limit ${fmtMoney(net - limit)} (${pct}%)`
      : `ជិតដល់ Limit ${pct}% — នៅសល់ ${fmtMoney(limit - net)}`;
    return (
      <span className={`${PILL} ${TONE[over ? 'red' : 'amber']}`} title={`${hint} · Limit ${fmtMoney(limit)}`}>
        <AlertCircle className="w-3 h-3" />
        <span className="tabular-nums">{value}</span>
        <span className="!text-[10px] opacity-90">{over ? `+${fmtMoney(net - limit)}` : `${pct}%`}</span>
      </span>
    );
  }

  // Truck about to expire: amber warning instead of the plain "Active" pill
  if (typeof warnDays === 'number' && /note|status/.test(l)) {
    return (
      <span className={`${PILL} ${TONE.amber}`} title={`ជិតផុតកំណត់ — ${expireHint(warnDays)}`}>
        <AlertCircle className="w-3 h-3" />
        {value} · {expireHint(warnDays)}
      </span>
    );
  }

  const sTone = statusTone(value);

  // First column: driver / holder name with avatar
  if (isFirst) {
    if (sTone) return <span className={`${PILL} ${TONE[sTone]}`}>{value}</span>;
    return (
      <span className="inline-flex items-center gap-2 min-w-0">
        <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
          {nameInitials(value) || '?'}
        </span>
        <span className="truncate max-w-[200px]">{value}</span>
      </span>
    );
  }

  // Status-like values (Status / Notes columns)
  if (sTone && /status|note|ស្ថានភាព/.test(l)) {
    return (
      <span className={`${PILL} ${TONE[sTone]}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${DOT[sTone]}`} />
        {value}
      </span>
    );
  }

  // License plate
  if (/model|plate|ផ្លាក/.test(l)) {
    return (
      <span className="inline-block px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 ring-1 ring-slate-300 dark:ring-slate-600 font-mono font-bold text-[11.5px] tracking-wide text-slate-800 dark:text-slate-100 shadow-2xs">
        {value}
      </span>
    );
  }

  // Vehicle type / tonnage
  if (/^type$|ប្រភេទ/.test(l)) {
    return <span className={`${PILL} ${TONE[vehicleTone(value)]}`}>{value}</span>;
  }

  // Dates — expiry columns get a warning colour
  const date = parseDmy(value);
  if (date) {
    if (/expire|expiry|ផុត/.test(l)) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
      const tone = days < 0 ? 'red' : days <= EXPIRE_WARN_DAYS ? 'amber' : 'green';
      const hint = days < 0 ? `ផុតកំណត់ ${-days} ថ្ងៃ` : expireHint(days);
      return (
        <span className="inline-flex items-center gap-1.5 tabular-nums" title={hint}>
          <span className={`w-1.5 h-1.5 rounded-full ${DOT[tone]}`} />
          <span className={tone === 'red' ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}>{value}</span>
          {tone !== 'green' && <span className={`${PILL} ${TONE[tone]} !py-0 !text-[10px]`}>{hint}</span>}
        </span>
      );
    }
    return <span className="tabular-nums text-slate-600 dark:text-slate-300">{value}</span>;
  }

  // Codes / IDs / serials
  if (isLikelyIdentifierCol(l, l) || /^[0-9A-F]{6,}$/i.test(value)) {
    return <span className="font-mono text-[11.5px] text-slate-600 dark:text-slate-300">{value}</span>;
  }

  // Amounts / limits
  if (/^\$?\d[\d,]*(\.\d+)?$/.test(value)) {
    return <span className="tabular-nums font-semibold text-slate-800 dark:text-slate-100">{value}</span>;
  }

  return <span className="block max-w-[260px] truncate" title={value.length > 30 ? value : undefined}>{value}</span>;
};

// Searchable Dropdown for Column Filters with Responsive Alignment
interface SearchableFilterDropdownProps {
  label: string;
  allLabel?: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  align?: 'left' | 'right';
}

const SearchableFilterDropdown: React.FC<SearchableFilterDropdownProps> = ({
  label,
  allLabel,
  value,
  onChange,
  options,
  align = 'left'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      setTimeout(() => searchInputRef.current?.focus(), 60);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase().trim();
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, query]);

  const isSelected = value !== 'ALL';

  return (
    <div className="relative space-y-1" ref={dropdownRef}>
      <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
        <span className="flex items-center gap-1.5 truncate">
          <span className="truncate">{label}</span>
          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
            ({options.length})
          </span>
          {isSelected && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 shrink-0 animate-pulse" />
          )}
        </span>
        {isSelected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('ALL');
            }}
            className="text-[11px] text-rose-500 hover:text-rose-700 dark:text-rose-400 font-bold hover:underline cursor-pointer"
            title="លុបការចម្រាញ់"
          >
            លុប
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setQuery('');
        }}
        className={`w-full min-h-[38px] px-3 py-1.5 rounded-xl text-xs border flex items-center justify-between gap-1.5 transition cursor-pointer text-left ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-400 dark:border-blue-600 text-blue-700 dark:text-blue-300 font-bold shadow-2xs'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
        }`}
      >
        <span className="truncate">
          {isSelected ? value : allLabel || `គ្រប់ ${label}`}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-blue-500' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute top-full mt-1.5 w-64 max-w-[85vw] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={`ស្វែងរក ${label}...`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-8 pr-7 h-8 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1 text-xs">
            <button
              type="button"
              onClick={() => {
                onChange('ALL');
                setIsOpen(false);
              }}
              className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between text-left transition cursor-pointer mb-0.5 ${
                value === 'ALL'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>{allLabel || `គ្រប់ ${label} (All)`}</span>
              {value === 'ALL' && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
            </button>

            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-slate-400 text-xs">
                មិនមាន "{query}" ឡើយ
              </div>
            ) : (
              filteredOptions.slice(0, 150).map((opt) => {
                const isItemActive = value === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                    }}
                    className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between text-left transition cursor-pointer truncate ${
                      isItemActive
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate">{opt}</span>
                    {isItemActive && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                  </button>
                );
              })
            )}

            {filteredOptions.length > 150 && (
              <div className="px-2.5 py-1 text-[10px] text-slate-400 text-center border-t border-slate-100 dark:border-slate-800 mt-1">
                បង្ហាញ 150 នៃ {filteredOptions.length} (សូមវាយអក្សរដើម្បីស្វែងរក)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const MeterialOfficePage: React.FC<MeterialOfficePageProps> = ({
  currentUser,
  permissions,
  settings,
  onUpdateSettings,
  onShowToast
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';

  // 2. Data State
  const cached = useMemo(() => getCachedMeterialOffice(), []);
  const [baseColumns, setColumns] = useState<SheetColumnDef[]>(cached.columns);
  const [baseRows, setRows] = useState<SheetRowData[]>(cached.rows);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // SOKIMEX POSTPAID rows (Google Sheet) — summed per "Card Holder Name" to fill Quantity / Net Amount
  const [sokimexRows, setSokimexRows] = useState<{ rows: SheetRowData[]; columns: SheetColumnDef[] }>(() => {
    const c = getCachedSokimexData();
    return { rows: c.rows, columns: c.columns };
  });
  const loadSokimex = useCallback(async () => {
    const res = await fetchLiveSokimexData();
    if (res.rows.length || res.success) setSokimexRows({ rows: res.rows, columns: res.columns });
  }, []);

  const sokimexTotals = useMemo(() => {
    const totals = new Map<string, { qty: number; net: number }>();
    const cols = sokimexRows.columns;
    const lbl = (c: SheetColumnDef) => (c.label || '').toLowerCase().trim();
    const holderCol = cols.find((c) => lbl(c).includes('card') && lbl(c).includes('holder'));
    const qtyCol = cols.find((c) => lbl(c) === 'quantity' || lbl(c) === 'qty' || lbl(c).includes('quantity'));
    const netCol = cols.find((c) => lbl(c) === 'net amount' || (lbl(c).includes('net') && lbl(c).includes('amount')));
    if (!holderCol) return totals;
    const num = (v: any) => {
      const n = Number(String(v ?? '').replace(/[^0-9.-]+/g, ''));
      return isNaN(n) ? 0 : n;
    };
    for (const r of sokimexRows.rows) {
      const key = normSokimexKey(r[holderCol.id]);
      if (!key) continue;
      const t = totals.get(key) || { qty: 0, net: 0 };
      if (qtyCol) t.qty += num(r[qtyCol.id]);
      if (netCol) t.net += num(r[netCol.id]);
      totals.set(key, t);
    }
    return totals;
  }, [sokimexRows]);

  // Page columns = DB columns + the two computed Sokimex columns
  const columns = useMemo<SheetColumnDef[]>(
    () => (baseColumns.length ? [
            ...baseColumns.filter((c) => !SK_COL_IDS.has(c.id) && !HIDDEN_COL_IDS.has(c.id) && c.id !== LIMIT_COL_ID),
            ...SK_COLUMNS,
            ...baseColumns.filter((c) => c.id === LIMIT_COL_ID)
          ] : baseColumns),
    [baseColumns]
  );
  const rawRows = useMemo<SheetRowData[]>(
    () =>
      baseRows.map((r) => {
        const t = sokimexTotals.get(normSokimexKey(r.link_sokimic));
        const next: SheetRowData = {
          ...r,
          sk_quantity: t ? t.qty.toFixed(2) : '',
          sk_net_amount: t ? t.net.toFixed(2) : ''
        };
        // Compare Net Amount with Net Amount Limit → __limitState over / near
        const limit = toNum(r[LIMIT_COL_ID]);
        if (t && limit !== null && limit > 0) {
          next.__limitPct = t.net / limit;
          if (t.net > limit) next.__limitState = 'over';
          else if (t.net >= limit * NEAR_LIMIT_PCT) next.__limitState = 'near';
        }
        return next;
      }),
    [baseRows, sokimexTotals]
  );

  // Truck rule: Type = Truck → Notes is "Exspire" when Check Expire is empty or before today, otherwise "Active".
  // Trucks expiring within EXPIRE_WARN_DAYS get `__expireDays` so the UI can warn ahead of time.
  const truckStatusCols = useMemo(() => {
    const lbl = (c: SheetColumnDef) => (c.label || c.id).trim();
    const typeCol = columns.find(
      (c) => /^type$/i.test(lbl(c)) && rawRows.some((r) => /^truck$/i.test(String(r[c.id] ?? '').trim()))
    );
    const expireCol = columns.find((c) => /expire|expiry/i.test(lbl(c)));
    const notesCol = columns.find((c) => /^notes?$/i.test(lbl(c)));
    return typeCol && expireCol && notesCol ? { typeCol, expireCol, notesCol } : null;
  }, [columns, rawRows]);

  const rows = useMemo<SheetRowData[]>(() => {
    if (!truckStatusCols) return rawRows;
    const { typeCol, expireCol, notesCol } = truckStatusCols;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return rawRows.map((r) => {
      if (!/^truck$/i.test(String(r[typeCol.id] ?? '').trim())) return r;
      const d = parseDmy(String(r[expireCol.id] ?? '').trim());
      const days = d ? Math.round((d.getTime() - today.getTime()) / 86_400_000) : null;
      // No Check Expire date (or unreadable) counts as not inspected → Exspire
      const next: SheetRowData = { ...r, [notesCol.id]: days === null || days < 0 ? 'Exspire' : 'Active' };
      if (days !== null && days >= 0 && days <= EXPIRE_WARN_DAYS) next.__expireDays = days;
      return next;
    });
  }, [rawRows, truckStatusCols]);

  // Trucks expiring within the warning window (soonest first)
  const expiringSoon = useMemo(
    () =>
      rows
        .filter((r) => typeof r.__expireDays === 'number')
        .sort((a, b) => a.__expireDays - b.__expireDays),
    [rows]
  );
  // Vehicles whose Net Amount is above their Net Amount Limit (biggest overrun first)
  const overLimitRows = useMemo(
    () =>
      rows
        .filter((r) => r.__limitState === 'over')
        .sort((a, b) => (b.__limitPct || 0) - (a.__limitPct || 0)),
    [rows]
  );
  const [isSyncingInBackground, setIsSyncingInBackground] = useState<boolean>(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string>('');
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 3. UI State
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_VIEW_MODE);
    if (saved === 'table' || saved === 'cards') return saved;
    // On small mobile screens (< 640px), default to cards view for superior readability
    if (typeof window !== 'undefined' && window.innerWidth < 640) return 'cards';
    return 'table';
  });

  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(false);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [copiedCellId, setCopiedCellId] = useState<string | null>(null);

  // Selected row for Detail Modal (Mobile / Tablet modal viewer)
  const [selectedRowDetail, setSelectedRowDetail] = useState<{
    row: SheetRowData;
    rowNumber: number;
    index: number;
  } | null>(null);

  // Save viewMode preference
  const handleSetViewMode = (mode: 'table' | 'cards') => {
    setViewMode(mode);
    localStorage.setItem(STORAGE_KEY_VIEW_MODE, mode);
  };

  // Full Screen Handler with Native Browser Fullscreen API Support
  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement && !isFullScreen) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      setIsFullScreen(true);
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullScreen(false);
    }
  }, [isFullScreen]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullScreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

  // 4. Auto-Sync State
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY_AUTO_SYNC) === 'true';
  });
  const [syncInterval, setSyncInterval] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SYNC_INTERVAL);
    return saved ? parseInt(saved, 10) : 30;
  });
  const countdownStore = useCountdownStore(syncInterval);
  const setCountdown = countdownStore.set;
  const [isAutoSyncMenuOpen, setIsAutoSyncMenuOpen] = useState<boolean>(false);
  const autoSyncDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (autoSyncDropdownRef.current && !autoSyncDropdownRef.current.contains(e.target as Node)) {
        setIsAutoSyncMenuOpen(false);
      }
    };
    if (isAutoSyncMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isAutoSyncMenuOpen]);

  // Synced Horizontal Scrollbar
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const footerScrollRef = useRef<HTMLDivElement>(null);
  const activeScrollSource = useRef<'table' | 'footer' | null>(null);
  const scrollResetTimer = useRef<number | null>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState<number>(0);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState<boolean>(false);

  const updateScrollDimensions = useCallback(() => {
    if (tableContainerRef.current) {
      const { scrollWidth, clientWidth } = tableContainerRef.current;
      setTableScrollWidth((prev) => (Math.abs(prev - scrollWidth) > 2 ? scrollWidth : prev));
      setHasHorizontalOverflow((prev) => {
        const next = scrollWidth > clientWidth + 4;
        return prev !== next ? next : prev;
      });
    }
  }, []);

  useEffect(() => {
    updateScrollDimensions();
    const el = tableContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      updateScrollDimensions();
    });
    observer.observe(el);

    window.addEventListener('resize', updateScrollDimensions);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScrollDimensions);
    };
  }, [updateScrollDimensions, columns, rows, viewMode, pageSize, currentPage]);

  const handleTableScroll = useCallback(() => {
    if (activeScrollSource.current === 'footer') return;
    activeScrollSource.current = 'table';

    if (tableContainerRef.current && footerScrollRef.current) {
      const tableEl = tableContainerRef.current;
      const footerEl = footerScrollRef.current;

      const maxTableScroll = tableEl.scrollWidth - tableEl.clientWidth;
      const maxFooterScroll = footerEl.scrollWidth - footerEl.clientWidth;

      if (maxTableScroll > 0 && maxFooterScroll > 0) {
        const ratio = tableEl.scrollLeft / maxTableScroll;
        const target = Math.round(ratio * maxFooterScroll);
        if (Math.abs(footerEl.scrollLeft - target) > 1) {
          footerEl.scrollLeft = target;
        }
      }
    }

    if (scrollResetTimer.current) window.clearTimeout(scrollResetTimer.current);
    scrollResetTimer.current = window.setTimeout(() => {
      activeScrollSource.current = null;
    }, 100);
  }, []);

  const handleFooterScroll = useCallback(() => {
    if (activeScrollSource.current === 'table') return;
    activeScrollSource.current = 'footer';

    if (tableContainerRef.current && footerScrollRef.current) {
      const tableEl = tableContainerRef.current;
      const footerEl = footerScrollRef.current;

      const maxTableScroll = tableEl.scrollWidth - tableEl.clientWidth;
      const maxFooterScroll = footerEl.scrollWidth - footerEl.clientWidth;

      if (maxTableScroll > 0 && maxFooterScroll > 0) {
        const ratio = footerEl.scrollLeft / maxFooterScroll;
        const target = Math.round(ratio * maxTableScroll);
        if (Math.abs(tableEl.scrollLeft - target) > 1) {
          tableEl.scrollLeft = target;
        }
      }
    }

    if (scrollResetTimer.current) window.clearTimeout(scrollResetTimer.current);
    scrollResetTimer.current = window.setTimeout(() => {
      activeScrollSource.current = null;
    }, 100);
  }, []);

  const scrollTableLeft = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({ left: -320, behavior: 'smooth' });
    }
  };

  const scrollTableRight = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({ left: 320, behavior: 'smooth' });
    }
  };

  // Toast helper
  const notify = useCallback(
    (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
      if (onShowToast) {
        onShowToast(msg, type);
      }
    },
    [onShowToast]
  );


  const rowsRef = useRef<SheetRowData[]>([]);
  rowsRef.current = baseRows;
  const lastFingerprintRef = useRef<string>('');

  // Load Data function (Hostinger MySQL tbl_meterial_office)
  const loadData = useCallback(
    async (isBackground = false) => {
      if (isBackground) {
        setIsSyncingInBackground(true);
      } else {
        setIsLoading(true);
        setFetchError(null);
      }

      loadSokimex().catch(() => {});
      try {
        const result = await fetchLiveMeterialOffice();
        if (result.success) {
          const firstRow = result.rows[0];
          const lastRow = result.rows[result.rows.length - 1];
          const newFingerprint = `${result.rows.length}_${result.columns.length}_${firstRow?.id || firstRow?.barcode || ''}_${lastRow?.id || lastRow?.barcode || ''}`;
          const isChanged = !lastFingerprintRef.current || lastFingerprintRef.current !== newFingerprint || JSON.stringify(result.rows) !== JSON.stringify(rowsRef.current);

          if (!isBackground || isChanged) {
            const prevScrollTop = tableContainerRef.current?.scrollTop;
            const prevScrollLeft = tableContainerRef.current?.scrollLeft;

            setColumns(result.columns);
            setRows(result.rows);
            rowsRef.current = result.rows;
            lastFingerprintRef.current = newFingerprint;

            if (prevScrollTop !== undefined || prevScrollLeft !== undefined) {
              requestAnimationFrame(() => {
                if (tableContainerRef.current) {
                  if (prevScrollTop !== undefined) tableContainerRef.current.scrollTop = prevScrollTop;
                  if (prevScrollLeft !== undefined) tableContainerRef.current.scrollLeft = prevScrollLeft;
                }
              });
            }
          }

          setLastSyncedTime(new Date().toLocaleTimeString('km-KH'));
        } else {
          const errMsg = result.error || 'មិនអាចទាញយកទិន្នន័យពី Database បានឡើយ';
          if (!isBackground) {
            setFetchError(errMsg);
            notify(`កំហុស៖ ${errMsg}`, 'error');
          } else {
            console.warn('Auto-sync background check failed:', errMsg);
          }
        }
      } catch (err: any) {
        const errMsg = err?.message || 'Error fetching data';
        if (!isBackground) {
          setFetchError(errMsg);
          notify(`កំហុស៖ ${errMsg}`, 'error');
        } else {
          console.warn('Auto-sync background check error:', errMsg);
        }
      } finally {
        if (!isBackground) {
          setIsLoading(false);
        }
        setIsSyncingInBackground(false);
      }
    },
    [notify, loadSokimex]
  );

  // Initial Fetch on mount
  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Auto-Sync Timer
  useEffect(() => {
    if (!isAutoSyncEnabled) return;

    setCountdown(syncInterval);
    const intervalTimer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          loadData(true);
        }
        return prev <= 1 ? syncInterval : prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalTimer);
  }, [isAutoSyncEnabled, syncInterval, loadData]);

  // Replace the shown rows after a save / delete / import (server returns the full fresh list)
  const applyServerRows = useCallback((fresh: SheetRowData[]) => {
    setColumns(MO_COLUMNS);
    setRows(fresh);
    rowsRef.current = fresh;
    lastFingerprintRef.current = '';
    setLastSyncedTime(new Date().toLocaleTimeString('km-KH'));
  }, []);

  // ── Add / Edit / Delete (Hostinger) ──
  const isViewer = String(currentUser?.role || '').toUpperCase() === 'VIEWER';
  const canCreate = isAdmin || (!isViewer && currentUser?.canCreate !== false);
  const canEditRow = isAdmin || (!isViewer && currentUser?.canEdit !== false);
  const canDeleteRow = isAdmin || (!isViewer && currentUser?.canDelete !== false);

  const isDbEmpty = rawRows.length === 0 && !isLoading && !fetchError;

  // null = closed, {} = new row, {id,...} = editing
  const [editingRow, setEditingRow] = useState<Record<string, any> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Always edit the stored values (not the Truck rule's computed Notes)
  const openEdit = (row: SheetRowData) => {
    const raw = rawRows.find((r) => r._id === row._id) || row;
    const form: Record<string, any> = { id: Number(raw.id ?? raw._id) };
    MO_FIELDS.forEach((f) => (form[f.key] = String(raw[f.key] ?? '')));
    setEditingRow(form);
  };
  const openCreate = () => {
    const form: Record<string, any> = {};
    MO_FIELDS.forEach((f) => (form[f.key] = ''));
    setEditingRow(form);
  };

  const handleSaveRow = async () => {
    if (!editingRow) return;
    if (!String(editingRow.model_no || '').trim() && !String(editingRow.name_handle || '').trim()) {
      notify('សូមបញ្ចូល Model No. ឬ Name Handle', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const fresh = await saveMeterialOfficeRow(editingRow);
      applyServerRows(fresh);
      notify(editingRow.id ? '✓ បានកែប្រែរួចរាល់' : '✓ បានបន្ថែមរួចរាល់', 'success');
      setEditingRow(null);
    } catch (err: any) {
      notify(`កំហុស៖ ${err?.message || 'រក្សាទុកមិនបានសម្រេច'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRows = async (targets: SheetRowData[]) => {
    const ids = targets.map((r) => Number(r.id ?? r._id)).filter((n) => n > 0);
    if (!ids.length) return;
    const label =
      ids.length === 1
        ? `"${String(targets[0].model_no || targets[0].name_handle || '').trim() || '#' + ids[0]}"`
        : `${ids.length} ជួរ`;
    if (!window.confirm(`តើអ្នកពិតជាចង់លុប ${label} មែនទេ? (មិនអាចត្រឡប់វិញបានទេ)`)) return;
    try {
      const fresh = await deleteMeterialOfficeRows(ids);
      applyServerRows(fresh);
      setSelectedRowDetail(null);
      moSelection.clear();
      notify(`✓ បានលុប ${label}`, 'success');
    } catch (err: any) {
      notify(`កំហុស៖ ${err?.message || 'លុបមិនបានសម្រេច'}`, 'error');
    }
  };


  // Auto detect columns for filter dropdowns (columns with 2 to 45 distinct non-empty values)
  const filterableColumns = useMemo(() => {
    if (!columns.length || !rows.length) return [];
    const validCols: { col: SheetColumnDef; distinctValues: string[] }[] = [];

    for (const col of columns) {
      const distinctSet = new Set<string>();
      for (const row of rows) {
        const val = String(row[col.id] ?? '').trim();
        if (val) distinctSet.add(val);
        if (distinctSet.size > 50) break;
      }
      if (distinctSet.size >= 2 && distinctSet.size <= 45) {
        validCols.push({
          col,
          distinctValues: Array.from(distinctSet).sort((a, b) => a.localeCompare(b))
        });
      }
    }
    return validCols;
  }, [columns, rows]);

  // Filter & Search Logic
  const filteredRows = useMemo(() => {
    let result = rows;

    // 1. Column-specific filters
    Object.entries(columnFilters).forEach(([colId, filterVal]) => {
      if (filterVal && filterVal !== 'ALL') {
        result = result.filter((row) => String(row[colId] ?? '').trim() === filterVal);
      }
    });

    // 2. Global search across all columns
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((row) => {
        return Object.values(row).some((val) => {
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(q);
        });
      });
    }

    // 3. Sorting
    if (sortColumn) {
      result = [...result].sort((a, b) => {
        const valA = a[sortColumn];
        const valB = b[sortColumn];

        if (valA === valB) return 0;
        if (valA === null || valA === undefined || valA === '') return 1;
        if (valB === null || valB === undefined || valB === '') return -1;

        const numA = Number(valA);
        const numB = Number(valB);

        if (!isNaN(numA) && !isNaN(numB)) {
          return sortDirection === 'asc' ? numA - numB : numB - numA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        return sortDirection === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });
    }

    return result;
  }, [rows, columnFilters, searchQuery, sortColumn, sortDirection]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    return Object.values(columnFilters).filter((v) => v && v !== 'ALL').length;
  }, [columnFilters]);

  // Numeric column aggregations for KPI summary cards
  // Filter out IDs, Serial numbers, Phone numbers, and GPS values that shouldn't be summed!
  const numericSummaries = useMemo(() => {
    if (!columns.length || !filteredRows.length) return [];
    const summaries: { col: SheetColumnDef; sum: number; avg: number }[] = [];

    for (const col of columns) {
      if (col.type === 'number' && !isLikelyIdentifierCol(col.id, col.label)) {
        let sum = 0;
        let count = 0;
        let hasAbnormallyLargeNumber = false;

        for (const row of filteredRows) {
          const val = Number(row[col.id]);
          if (!isNaN(val)) {
            // Numbers > 10,000,000 without decimal are usually barcodes or serials
            if (val > 10_000_000 && Number.isInteger(val)) {
              hasAbnormallyLargeNumber = true;
            }
            sum += val;
            count++;
          }
        }

        if (count > 0 && sum > 0 && !hasAbnormallyLargeNumber) {
          summaries.push({
            col,
            sum,
            avg: Math.round((sum / count) * 100) / 100
          });
        }
      }
    }
    return summaries.slice(0, 2);
  }, [columns, filteredRows]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    if (pageSize >= 9999) return filteredRows;
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const moSelection = useGridSelection(paginatedRows, (r: any, i: number) => (r._id || `row_${i}`) as string);
  const selectedMoMatrix = (): [string[], any[][]] => [
    columns.map((c: any) => c.label || c.id),
    moSelection.selectedRows.map((r: any) => columns.map((c: any) => r[c.id])),
  ];

  // One column per sheet column (no stacking) so every header lines up with its own values.
  const tableColumnGroups = useMemo(() => columns.map((c) => [c]), [columns]);

  // Reset to page 1 on search or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, columnFilters, pageSize]);

  // Sort handler
  const handleSort = (columnId: string) => {
    if (sortColumn === columnId) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumn(columnId);
      setSortDirection('asc');
    }
  };

  // Copy cell text helper
  const handleCopyCell = (text: string, cellKey: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!text) return;
    copyText(text);
    setCopiedCellId(cellKey);
    setTimeout(() => setCopiedCellId(null), 1500);
  };

  const handleExportCSV = () => {
    if (!filteredRows.length || !columns.length) {
      notify('មិនមានទិន្នន័យដើម្បី Export ឡើយ', 'error');
      return;
    }

    const headers = columns.map((c) => c.label || c.id);
    const rows = filteredRows.map((row) => columns.map((col) => row[col.id] ?? ''));

    const csvContent = formatCsv(headers, rows);
    downloadCsv(`Meterial_Office_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
    notify('✓ បានទាញយក File CSV ជោគជ័យ', 'success');
  };

  // Print: every filtered row (not just the current page) as a clean landscape A4 table
  const handlePrint = () => {
    if (!filteredRows.length || !columns.length) {
      notify('មិនមានទិន្នន័យដើម្បី Print ឡើយ', 'error');
      return;
    }
    const w = window.open('', '_blank');
    if (!w) {
      notify('Browser បានបិទ Pop-up សូមអនុញ្ញាតហើយសាកម្តងទៀត', 'error');
      return;
    }
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const notesId = truckStatusCols?.notesCol.id;

    const cellHtml = (row: SheetRowData, col: SheetColumnDef) => {
      const v = String(row[col.id] ?? '').trim();
      if (isEmptyVal(v)) return '<span class="muted">—</span>';
      const l = (col.label || col.id).toLowerCase();
      if (col.id === notesId && typeof row.__expireDays === 'number') {
        return `<span class="pill amber">${esc(v)} · ${esc(expireHint(row.__expireDays))}</span>`;
      }
      if (col.id === 'sk_net_amount' && row.__limitState) {
        return `<span class="pill ${row.__limitState === 'over' ? 'red' : 'amber'}">${esc(v)} (${Math.round((row.__limitPct || 0) * 100)}%)</span>`;
      }
      const tone = /status|note/.test(l) ? statusTone(v) : null;
      if (tone) return `<span class="pill ${tone}">${esc(v)}</span>`;
      if (/model|plate/.test(l)) return `<span class="plate">${esc(v)}</span>`;
      return esc(v);
    };

    const head = columns.map((c) => `<th>${esc(c.label || c.id)}</th>`).join('');
    const body = filteredRows
      .map(
        (r, i) =>
          `<tr><td class="num">${i + 1}</td>${columns.map((c) => `<td>${cellHtml(r, c)}</td>`).join('')}</tr>`
      )
      .join('');

    const filterParts: string[] = [];
    if (searchQuery.trim()) filterParts.push(`ស្វែងរក: "${esc(searchQuery.trim())}"`);
    Object.entries(columnFilters).forEach(([id, val]) => {
      if (val && val !== 'ALL') {
        const c = columns.find((x) => x.id === id);
        filterParts.push(`${esc(String(c?.label || id))}: ${esc(String(val))}`);
      }
    });
    const printedAt = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('');

    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Meterial_Office</title>${styles}
<style>
  @page { size: A4 landscape; margin: 10mm; }
  html, body { background: #fff !important; color: #0f172a; }
  body { padding: 0; margin: 0; font-size: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hdr { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1e40af; padding-bottom: 6px; margin-bottom: 8px; }
  .hdr h1 { font-size: 16px; font-weight: 800; margin: 0; color: #1e3a8a; }
  .hdr .meta { font-size: 10px; color: #475569; text-align: right; }
  .filters { font-size: 10px; color: #475569; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: #eff6ff !important; color: #1e3a8a; font-weight: 700; text-align: left; padding: 4px 5px; border: 1px solid #cbd5e1; white-space: nowrap; }
  td { padding: 3px 5px; border: 1px solid #e2e8f0; vertical-align: middle; }
  tbody tr:nth-child(even) td { background: #f8fafc !important; }
  td.num { text-align: center; color: #64748b; width: 22px; }
  .muted { color: #cbd5e1; }
  .plate { font-family: ui-monospace, monospace; font-weight: 700; border: 1px solid #94a3b8; border-radius: 3px; padding: 0 3px; white-space: nowrap; }
  .pill { display: inline-block; padding: 0 6px; border-radius: 999px; font-weight: 700; font-size: 9.5px; white-space: nowrap; border: 1px solid; }
  .pill.green { background: #ecfdf5 !important; color: #047857; border-color: #a7f3d0; }
  .pill.red { background: #fff1f2 !important; color: #be123c; border-color: #fecdd3; }
  .pill.amber { background: #fffbeb !important; color: #b45309; border-color: #fde68a; }
</style></head><body>
<div class="hdr">
  <h1>Meterial_Office</h1>
  <div class="meta">សរុប ${filteredRows.length} ជួរដេក${filteredRows.length !== rows.length ? ` (ពី ${rows.length})` : ''}<br/>Print: ${esc(printedAt)}</div>
</div>
${filterParts.length ? `<div class="filters">កំពុងចម្រាញ់៖ ${filterParts.join(' • ')}</div>` : ''}
<table><thead><tr><th>#</th>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`);
    w.document.close();
    w.onload = () => {
      w.focus();
      w.print();
    };
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setColumnFilters({});
    setSortColumn(null);
    setSortDirection('asc');
    setCurrentPage(1);
    notify('បានកំណត់ការចម្រាញ់ឡើងវិញ', 'info');
  };

  const hasActiveFilters = Boolean(
    searchQuery.trim() || activeFiltersCount > 0 || sortColumn
  );

  // Navigate next/prev in Detail Modal
  const handleNavigateDetail = (direction: 'prev' | 'next') => {
    if (!selectedRowDetail) return;
    const newIndex =
      direction === 'prev'
        ? Math.max(0, selectedRowDetail.index - 1)
        : Math.min(filteredRows.length - 1, selectedRowDetail.index + 1);

    setSelectedRowDetail({
      row: filteredRows[newIndex],
      rowNumber: newIndex + 1,
      index: newIndex
    });
  };

  // Detail modal keyboard shortcuts: ← / → switch record, Esc closes
  useEffect(() => {
    if (!selectedRowDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation(); // close only the modal, don't also exit full screen
        setSelectedRowDetail(null);
      } else if (e.key === 'ArrowLeft') handleNavigateDetail('prev');
      else if (e.key === 'ArrowRight') handleNavigateDetail('next');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <div
      className={`page-fill w-full min-h-full space-y-3 sm:space-y-4 pb-28 lg:pb-0 transition-all duration-200 ${
        isFullScreen
          ? 'fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 p-2 sm:p-5 overflow-y-auto w-screen h-screen'
          : 'w-full px-1 sm:px-2'
      }`}
    >
      {/* Floating Exit Button in Fullscreen Mode */}
      {isFullScreen && (
        <div className="fixed top-3 right-4 z-50 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
          <button
            type="button"
            onClick={toggleFullScreen}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900/95 hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold shadow-xl border border-slate-700/80 flex items-center gap-1.5 transition active:scale-95 cursor-pointer backdrop-blur-md"
            title="ចេញពី Full Screen (ឬចុច Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
            <span>ចេញពី Full Screen (Esc)</span>
          </button>
        </div>
      )}

      {/* 1. Unified Header: brand + search + filters + actions, KPI strip, active filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl px-2.5 py-1.5 sm:px-3 shadow-2xs dark:shadow-none transition-all space-y-1.5">
        <div className="flex flex-wrap xl:flex-nowrap items-center gap-2">
          {/* Title & Live Status (last sync time on hover) */}
          <div
            className="flex items-center gap-2 min-w-0 shrink-0"
            title={`Live • Hostinger Database • Sync ចុងក្រោយ: ${lastSyncedTime || (rows.length ? 'ទើបតែ Sync' : 'មិនទាន់ Sync')}`}
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-sm shadow-blue-500/25 shrink-0">
              <Boxes className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-sm font-black text-slate-900 dark:text-white tracking-tight whitespace-nowrap">
              Meterial_Office
            </h1>
            {isSyncingInBackground ? (
              <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" aria-label="Syncing..." />
            ) : (
              <span className="relative flex w-2 h-2 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
              </span>
            )}
          </div>

          {/* Search & filter toggle (own row on phone/tablet, inline on wide screens) */}
          <div className="order-last xl:order-none w-full xl:w-auto xl:flex-1 flex items-center gap-2 min-w-0">
            {/* Global Search Input */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ស្វែងរក (ឈ្មោះ, លេខកូដ, ប្រភេទ, ចំនួន, ...)"
                className="w-full h-8 pl-9 pr-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* Filter Toggle Button */}
            {filterableColumns.length > 0 && (
              <button
                type="button"
                onClick={() => setIsFilterExpanded(!isFilterExpanded)}
                className={`${HEADER_BTN} ${
                  isFilterExpanded || activeFiltersCount > 0
                    ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                    : HEADER_BTN_NEUTRAL
                }`}
                title="បិទ/បើកបញ្ជីចម្រាញ់"
              >
                <Filter className="w-3.5 h-3.5 text-blue-500" />
                <span className="hidden sm:inline">តម្រង</span>
                {activeFiltersCount > 0 ? (
                  <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold">
                    {activeFiltersCount}
                  </span>
                ) : (
                  <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-semibold">
                    {filterableColumns.length}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                    isFilterExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>
            )}

            {/* Reset All Filters Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className={`${HEADER_BTN} text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-900 hover:bg-rose-100 dark:hover:bg-rose-900/60`}
                title="កំណត់ការចម្រាញ់ឡើងវិញ"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">កំណត់ឡើងវិញ</span>
              </button>
            )}
          </div>

          {/* KPI chips (own row on phone/tablet, inline on wide screens) */}
          <div className="order-last xl:order-none w-full xl:w-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 xl:max-w-[40%] text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span className={KPI_CHIP}>
              <Layers className="w-3.5 h-3.5 text-blue-500" />
              <span>ជួរដេក</span>
              <b className="font-bold tabular-nums text-slate-900 dark:text-white">{rows.length.toLocaleString('en-US')}</b>
              {hasActiveFilters && (
                <span className="text-blue-600 dark:text-blue-400">→ {filteredRows.length.toLocaleString('en-US')}</span>
              )}
            </span>
            <span className={KPI_CHIP}>
              <Hash className="w-3.5 h-3.5 text-emerald-500" />
              <span>ជួរឈរ</span>
              <b className="font-bold tabular-nums text-slate-900 dark:text-white">{columns.length}</b>
            </span>
            {numericSummaries.map(({ col, sum, avg }) => (
              <span
                key={col.id}
                className={KPI_CHIP}
                title={`${col.label || col.id} — មធ្យមភាគ៖ ${avg.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
              >
                <DollarSign className="w-3.5 h-3.5 text-violet-500" />
                <span>{col.label || col.id}</span>
                <b className="font-bold tabular-nums text-slate-900 dark:text-white">{sum.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <span>មធ្យម <span className="tabular-nums text-slate-700 dark:text-slate-300">{avg.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span></span>
              </span>
            ))}
          </div>

          {/* Action Bar */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 shrink-0">
            {/* Add new row (Hostinger) */}
            {canCreate && (
              <button
                type="button"
                onClick={openCreate}
                className={`${HEADER_BTN} bg-blue-600 hover:bg-blue-700 border-blue-600 text-white`}
                title="បន្ថែមជួរថ្មី"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">បន្ថែម</span>
              </button>
            )}

            {/* Auto-Sync Dropdown */}
            <div className="relative flex items-center shrink-0" ref={autoSyncDropdownRef}>
              <button
                type="button"
                onClick={() => setIsAutoSyncMenuOpen(!isAutoSyncMenuOpen)}
                className={`${HEADER_BTN} ${
                  isAutoSyncEnabled
                    ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                    : HEADER_BTN_NEUTRAL
                }`}
                title="កំណត់ Auto Sync"
              >
                {isLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                )}
                <span className="whitespace-nowrap tabular-nums">
                  {isAutoSyncEnabled ? <CountdownText store={countdownStore} suffix="s" /> : 'Auto: បិទ'}
                </span>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isAutoSyncMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isAutoSyncMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl z-50 p-1.5 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Auto-Sync Interval
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAutoSyncEnabled(false);
                      localStorage.setItem(STORAGE_KEY_AUTO_SYNC, 'false');
                      setIsAutoSyncMenuOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-left transition cursor-pointer ${
                      !isAutoSyncEnabled
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 font-bold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span>បិទ (Off)</span>
                    {!isAutoSyncEnabled && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </button>
                  {[15, 30, 60, 300].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        setIsAutoSyncEnabled(true);
                        setSyncInterval(sec);
                        setCountdown(sec);
                        localStorage.setItem(STORAGE_KEY_AUTO_SYNC, 'true');
                        localStorage.setItem(STORAGE_KEY_SYNC_INTERVAL, String(sec));
                        setIsAutoSyncMenuOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-left transition cursor-pointer ${
                        isAutoSyncEnabled && syncInterval === sec
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 font-bold'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span>រៀងរាល់ {sec >= 60 ? `${sec / 60} នាទី` : `${sec} វិនាទី`}</span>
                      {isAutoSyncEnabled && syncInterval === sec && (
                        <Check className="w-3.5 h-3.5 text-blue-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={!filteredRows.length}
              className={`${HEADER_BTN} ${HEADER_BTN_NEUTRAL}`}
              title="Export CSV File"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden md:inline">Export</span>
            </button>

            {/* Print (all filtered rows) */}
            <button
              type="button"
              onClick={handlePrint}
              disabled={!filteredRows.length}
              className={`${HEADER_BTN} ${HEADER_BTN_NEUTRAL}`}
              title="Print ទិន្នន័យទាំងអស់ដែលកំពុងចម្រាញ់"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden md:inline">Print</span>
            </button>

            {/* View Mode Toggle (iOS-style Segmented Control) */}
            <div className="flex items-center gap-0.5 h-8 bg-slate-100/80 dark:bg-slate-800/70 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-700 shrink-0">
              <button
                type="button"
                onClick={() => handleSetViewMode('table')}
                className={`flex items-center gap-1 h-7 px-2 rounded-md text-xs transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Table View (តារាង)"
              >
                <Table2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Table</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetViewMode('cards')}
                className={`flex items-center gap-1 h-7 px-2 rounded-md text-xs transition cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Cards View (កាតចល័ត)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>
          </div>
        </div>

        {/* Active Filter Pills Bar (Direct visibility of what's filtering the data) */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">កំពុងចម្រាញ់៖</span>

            {searchQuery.trim() && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-100/70 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-800 text-[11px]">
                <span>ពាក្យស្វែងរក: "{searchQuery}"</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="hover:text-blue-950 dark:hover:text-white p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {Object.entries(columnFilters).map(([colId, val]) => {
              if (!val || val === 'ALL') return null;
              const colDef = columns.find((c) => c.id === colId);
              const label = colDef?.label || colId;
              return (
                <span
                  key={colId}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold border border-slate-200 dark:border-slate-700 text-[11px]"
                >
                  <span>{label}: <strong>{val}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      setColumnFilters((prev) => {
                        const next = { ...prev };
                        delete next[colId];
                        return next;
                      });
                    }}
                    className="hover:text-rose-600 dark:hover:text-rose-400 p-0.5 cursor-pointer"
                    title={`លុបចម្រាញ់ ${label}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}

            <button
              type="button"
              onClick={handleResetFilters}
              className="text-[11px] text-rose-500 hover:text-rose-700 dark:text-rose-400 font-bold ml-1 hover:underline cursor-pointer"
            >
              លុបទាំងអស់
            </button>
          </div>
        )}

        {/* Collapsible Categorical Filter Dropdown Grid */}
        {isFilterExpanded && filterableColumns.length > 0 && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
              {filterableColumns.map(({ col, distinctValues }, index) => {
                const currentVal = columnFilters[col.id] || 'ALL';
                // Align right on columns at the right edge
                const isRightEdge = (index + 1) % 4 === 0 || (index + 1) % 6 === 0;

                return (
                  <SearchableFilterDropdown
                    key={col.id}
                    label={col.label || col.id}
                    value={currentVal}
                    options={distinctValues}
                    align={isRightEdge ? 'right' : 'left'}
                    onChange={(val) => {
                      setColumnFilters((prev) => {
                        const next = { ...prev };
                        if (val === 'ALL') {
                          delete next[col.id];
                        } else {
                          next[col.id] = val;
                        }
                        return next;
                      });
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Truck expiry warning: trucks whose Check Expire is within EXPIRE_WARN_DAYS days */}
      {expiringSoon.length > 0 && (() => {
        const plateCol = columns.find((c) => /model|plate|ផ្លាក/i.test(c.label || c.id));
        const nameCol = columns[0];
        return (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl px-3 py-2 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 text-xs">
              <div className="font-bold text-amber-800 dark:text-amber-300">
                ប្រយ័ត្ន៖ ឡាន Truck {expiringSoon.length} គ្រឿង នឹងផុតកំណត់ (Check Expire) ក្នុងរយៈពេល {EXPIRE_WARN_DAYS} ថ្ងៃខាងមុខ
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {expiringSoon.map((r) => {
                  const plate = plateCol ? String(r[plateCol.id] ?? '').trim() : '';
                  const name = nameCol ? String(r[nameCol.id] ?? '').trim() : '';
                  const expire = truckStatusCols ? String(r[truckStatusCols.expireCol.id] ?? '').trim() : '';
                  return (
                    <button
                      key={r._id}
                      type="button"
                      onClick={() => plate && setSearchQuery(plate)}
                      title={`Check Expire: ${expire} — ចុចដើម្បីស្វែងរក`}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 ring-1 ring-amber-200 dark:ring-amber-800 hover:ring-amber-400 text-[11px] cursor-pointer transition"
                    >
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{plate || '—'}</span>
                      {name && !isEmptyVal(name) && <span className="text-slate-500 dark:text-slate-400">{name}</span>}
                      <span className="font-bold text-amber-700 dark:text-amber-300">{expireHint(r.__expireDays)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Net Amount over Net Amount Limit warning */}
      {overLimitRows.length > 0 && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl px-3 py-2 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-xs">
            <div className="font-bold text-rose-800 dark:text-rose-300">
              ប្រមាន៖ ឡាន {overLimitRows.length} គ្រឿង មាន Net Amount លើស Net Amount Limit
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {overLimitRows.map((r) => {
                const plate = String(r.model_no ?? '').trim();
                const name = String(r.name_handle ?? '').trim();
                const net = toNum(r.sk_net_amount) ?? 0;
                const limit = toNum(r[LIMIT_COL_ID]) ?? 0;
                return (
                  <button
                    key={r._id}
                    type="button"
                    onClick={() => plate && setSearchQuery(plate)}
                    title={`Net Amount ${fmtMoney(net)} / Limit ${fmtMoney(limit)} — ចុចដើម្បីស្វែងរក`}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 ring-1 ring-rose-200 dark:ring-rose-800 hover:ring-rose-400 text-[11px] cursor-pointer transition"
                  >
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{plate || '—'}</span>
                    {name && !isEmptyVal(name) && <span className="text-slate-500 dark:text-slate-400">{name}</span>}
                    <span className="font-bold text-rose-700 dark:text-rose-300 tabular-nums">+{fmtMoney(net - limit)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 5. Error Banner if fetch failed */}
      {fetchError && (
        <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <h4 className="font-bold text-rose-800 dark:text-rose-300">
              មានបញ្ហាក្នុងការទាញទិន្នន័យពី Database
            </h4>
            <p className="text-rose-700 dark:text-rose-400 mt-0.5">
              {fetchError}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadData(false)}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs"
              >
                ព្យាយាមម្តងទៀត
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Empty State: database has no rows yet */}
      {isDbEmpty && (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto space-y-4 my-8">
          <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-sm">
            <Boxes className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white">
              Database មិនទាន់មានទិន្នន័យនៅឡើយទេ
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              ចុច "បន្ថែមថ្មី" ដើម្បីបញ្ចូលទិន្នន័យទៅ Hostinger Database។
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {canCreate && (
              <button
                type="button"
                onClick={openCreate}
                className="px-5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                បន្ថែមថ្មី
              </button>
            )}
          </div>
        </div>
      )}

      {/* 7. Main Data Display: Table or Cards View */}
      {!isDbEmpty && (
        <div className="page-fill-body bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-xs overflow-hidden flex flex-col">
          {/* Top Bar of Data Container */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs bg-slate-50/50 dark:bg-slate-950/40">
            <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <span>
                បង្ហាញ {filteredRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} ដល់{' '}
                {Math.min(currentPage * pageSize, filteredRows.length)} នៃ {filteredRows.length} ជួរដេក
              </span>
              {hasActiveFilters && (
                <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md">
                  (ចម្រាញ់ពីសរុប {rows.length})
                </span>
              )}
            </div>

            {/* Quick Horizontal Scroll Controls for Table Mode */}
            {hasHorizontalOverflow && viewMode === 'table' && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400 hidden sm:inline">រំកិលមើល៖</span>
                <button
                  type="button"
                  onClick={scrollTableLeft}
                  className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer shadow-2xs"
                  title="រំកិលទៅឆ្វេង"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={scrollTableRight}
                  className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer shadow-2xs"
                  title="រំកិលទៅស្តាំ"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {viewMode === 'table' && moSelection.count > 0 && (
            <div className="px-3 py-1.5">
              <GridSelectionBar
                count={moSelection.count}
                onCopy={() => copyRowsAsTsv(...selectedMoMatrix())}
                onExport={() => exportRowsAsCsv('material_office_selected', ...selectedMoMatrix())}
                onClear={moSelection.clear}
              >
                {canDeleteRow && (
                  <button
                    type="button"
                    onClick={() => handleDeleteRows(moSelection.selectedRows as SheetRowData[])}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    លុប
                  </button>
                )}
              </GridSelectionBar>
            </div>
          )}

          {/* Table View (Optimized for PC & iPad, with pinned row numbers & sticky headers) */}
          {viewMode === 'table' ? (
            <div
              ref={tableContainerRef}
              onScroll={handleTableScroll}
              className={`page-fill-scroll overflow-x-auto overflow-y-auto custom-scrollbar relative ${
                isFullScreen ? 'max-h-[calc(100vh-220px)]' : 'max-h-[75vh]'
              }`}
            >
              {/* w-max: columns size to their content (scroll horizontally) instead of squeezing into "2AL-2…" */}
              <table className="sb-grid w-max min-w-full text-left">
                {/* Sticky Header */}
                <thead className="select-none">
                  <tr>
                    <GridHeadGutter
                      checked={moSelection.allChecked}
                      indeterminate={moSelection.someChecked}
                      onToggleAll={moSelection.toggleAll}
                    />
                    {tableColumnGroups.map((group, idx) => {
                      const col = group[0];
                      const isSorted = sortColumn === col.id;
                      const isFirstCol = idx === 0;

                      return (
                        <th
                          key={col.id}
                          onClick={() => handleSort(col.id)}
                          className={`py-3 px-3.5 font-bold border-b border-slate-200 dark:border-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-800/70 transition cursor-pointer whitespace-nowrap ${
                            isFirstCol
                              ? 'sticky left-12 z-30'
                              : ''
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>{col.label || col.id}</span>
                            <span className="text-slate-400">
                              {isSorted ? (
                                sortDirection === 'asc' ? (
                                  <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                ) : (
                                  <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                )
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100" />
                              )}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                    <th className="py-3 px-3 text-center font-bold border-b border-slate-200 dark:border-slate-800 w-24">
                      សកម្មភាព
                    </th>
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody>
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={columns.length + 2}
                        className="py-14 text-center text-slate-400 text-xs"
                      >
                        {isLoading ? (
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                            <span>កំពុងទាញទិន្នន័យ...</span>
                          </div>
                        ) : (
                          'មិនមានទិន្នន័យស្របតាមលក្ខខណ្ឌចម្រាញ់ឡើយ'
                        )}
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, index) => {
                      const rowNum = (currentPage - 1) * pageSize + index + 1;
                      const globalIndex = (currentPage - 1) * pageSize + index;

                      return (
                        <tr
                          key={row._id || index}
                          onClick={() =>
                            setSelectedRowDetail({
                              row,
                              rowNumber: rowNum,
                              index: globalIndex
                            })
                          }
                          className={`group cursor-pointer ${moSelection.isSelected(moSelection.keys[index]) ? 'sb-selected' : ''}`}
                        >
                          {/* Checkbox + row number (Pinned sticky left) */}
                          <GridRowGutter
                            selected={moSelection.isSelected(moSelection.keys[index])}
                            rowNumber={rowNum}
                            onToggle={() => moSelection.toggle(moSelection.keys[index])}
                          />

                          {/* Data Columns */}
                          {tableColumnGroups.map((group, idx) => {
                            const col = group[0];
                            const rawVal = row[col.id];
                            const strVal = rawVal !== null && rawVal !== undefined ? String(rawVal).trim() : '';
                            const cellKey = `${row._id || index}_${col.id}`;
                            const isCopied = copiedCellId === cellKey;
                            const isUrl = isValidUrl(strVal);
                            const isFirstCol = idx === 0;

                            return (
                              <td
                                key={col.id}
                                className={`py-3 px-3.5 text-slate-700 dark:text-slate-200 whitespace-nowrap group/cell relative ${
                                  isFirstCol
                                    ? `sticky left-12 z-10 bg-white dark:bg-[#1c1c1c] group-hover:bg-slate-50 dark:group-hover:bg-[#262626] font-semibold text-slate-900 dark:text-white ${moSelection.isSelected(moSelection.keys[index]) ? '!bg-emerald-50 dark:!bg-[#1f2b24]' : ''}`
                                    : ''
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  {isUrl ? (
                                    <a
                                      href={formatUrlHref(strVal)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 underline max-w-[220px]"
                                      title={strVal}
                                    >
                                      <LinkIcon className="w-3 h-3 shrink-0" />
                                      <span className="truncate">{strVal}</span>
                                    </a>
                                  ) : (
                                    <SmartCell label={col.label || col.id} value={strVal} isFirst={isFirstCol} warnDays={col.id === truckStatusCols?.notesCol.id ? row.__expireDays : undefined} limitRow={col.id === 'sk_net_amount' ? row : undefined} />
                                  )}

                                  {!isEmptyVal(strVal) && (
                                    <button
                                      type="button"
                                      onClick={(e) => handleCopyCell(strVal, cellKey, e)}
                                      className="opacity-0 group-hover/cell:opacity-100 transition p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                      title="Copy cell text"
                                    >
                                      {isCopied ? (
                                        <Check className="w-3 h-3 text-emerald-500" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </td>
                            );
                          })}

                          {/* Row actions: view / edit / delete */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRowDetail({
                                  row,
                                  rowNumber: rowNum,
                                  index: globalIndex
                                });
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition cursor-pointer"
                              title="មើលព័ត៌មានលម្អិត"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {canEditRow && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEdit(row);
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950 transition cursor-pointer"
                                title="កែប្រែ"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDeleteRow && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteRows([row]);
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 transition cursor-pointer"
                                title="លុប"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* Cards View: Highly polished for Mobile and Tablet touch use */
            <div
              className={`page-fill-scroll p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 auto-rows-max content-start gap-2.5 overflow-y-auto custom-scrollbar ${
                isFullScreen ? 'max-h-[calc(100vh-220px)]' : 'max-h-[75vh]'
              }`}
            >
              {paginatedRows.length === 0 ? (
                <div className="col-span-full py-14 text-center text-slate-400 text-xs">
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                      <span>កំពុងទាញទិន្នន័យ...</span>
                    </div>
                  ) : (
                    'មិនមានទិន្នន័យស្របតាមលក្ខខណ្ឌចម្រាញ់ឡើយ'
                  )}
                </div>
              ) : (
                paginatedRows.map((row, index) => {
                  const rowNum = (currentPage - 1) * pageSize + index + 1;
                  const globalIndex = (currentPage - 1) * pageSize + index;
                  const v = (k: string) => String(row[k] ?? '').trim();
                  const has = (k: string) => !isEmptyVal(v(k));
                  const name = v('name_handle');
                  const plate = v('model_no');
                  const vType = v('vehicle_type');
                  const notes = v('notes');
                  const status = v('status');
                  const statusT = statusTone(status);
                  const isStandBy = /stand ?by/i.test(name);
                  const notesTone = statusTone(notes);
                  const warnDays = typeof row.__expireDays === 'number' ? (row.__expireDays as number) : undefined;

                  // Sokimex fuel usage vs Net Amount Limit
                  const net = toNum(row.sk_net_amount);
                  const qty = toNum(row.sk_quantity);
                  const limit = toNum(row[LIMIT_COL_ID]);
                  const pct = net !== null && limit ? (net / limit) * 100 : null;
                  const limitState = row.__limitState as 'over' | 'near' | undefined;
                  const barColor = limitState === 'over' ? 'bg-rose-500' : limitState === 'near' ? 'bg-amber-500' : 'bg-emerald-500';
                  const netColor =
                    limitState === 'over'
                      ? 'text-rose-600 dark:text-rose-400'
                      : limitState === 'near'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-900 dark:text-white';
                  const accent =
                    limitState === 'over'
                      ? 'before:bg-rose-500'
                      : limitState === 'near' || warnDays !== undefined
                      ? 'before:bg-amber-500'
                      : 'before:bg-transparent';

                  const openDetail = () => setSelectedRowDetail({ row, rowNumber: rowNum, index: globalIndex });

                  return (
                    <div
                      key={row._id || index}
                      onClick={openDetail}
                      title={`#${rowNum}`}
                      className={`relative overflow-hidden bg-white dark:bg-slate-950/70 border rounded-xl p-3 space-y-2 shadow-2xs hover:shadow-md transition-all duration-150 cursor-pointer group before:absolute before:inset-y-0 before:left-0 before:w-1 ${accent} ${
                        limitState === 'over'
                          ? 'border-rose-300 dark:border-rose-900 hover:border-rose-400'
                          : 'border-slate-200/80 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600'
                      }`}
                    >
                      {/* Plate + type / station + status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-inset ${TONE[vehicleTone(vType)]}`}>
                            <Truck className="w-3.5 h-3.5" />
                          </span>
                          <div className="min-w-0">
                            <div className="font-mono font-extrabold text-[13.5px] tracking-wide text-slate-900 dark:text-white leading-tight">
                              {plate || '—'}
                            </div>
                            <div className="flex items-center gap-1 text-[10.5px] text-slate-500 dark:text-slate-400 min-w-0 leading-tight">
                              {vType && <span className="font-semibold uppercase shrink-0">{vType}</span>}
                              {vType && has('station') && <span className="text-slate-300 dark:text-slate-600">•</span>}
                              {has('station') && <span className="truncate">{v('station')}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {warnDays !== undefined ? (
                            <span className={`${PILL} ${TONE.amber} !text-[10px]`}>
                              <AlertCircle className="w-3 h-3" />
                              {expireHint(warnDays)}
                            </span>
                          ) : notesTone ? (
                            <span className={`${PILL} ${TONE[notesTone]} !text-[10px]`}>{notes}</span>
                          ) : statusT && statusT !== 'green' ? (
                            <span className={`${PILL} ${TONE[statusT]} !text-[10px]`}>{status}</span>
                          ) : null}
                          {canEditRow && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(row);
                              }}
                              className="p-1 rounded-md text-slate-300 hover:text-amber-600 hover:bg-slate-100 dark:text-slate-600 dark:hover:bg-slate-800 cursor-pointer"
                              title="កែប្រែ"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Driver + Check Expire */}
                      <div className="flex items-center justify-between gap-2 text-[11.5px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {name && !isStandBy ? (
                            <>
                              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[8.5px] font-bold flex items-center justify-center shrink-0">
                                {nameInitials(name)}
                              </span>
                              <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{name}</span>
                            </>
                          ) : (
                            <>
                              <User className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
                              <span className={`font-semibold ${isStandBy ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                                {isStandBy ? 'Stand by' : 'មិនទាន់មានអ្នកបើក'}
                              </span>
                            </>
                          )}
                        </div>
                        {has('check_expire') && (
                          <span
                            className={`inline-flex items-center gap-1 shrink-0 tabular-nums text-[10.5px] ${
                              notesTone === 'red' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'
                            }`}
                            title="Check Expire"
                          >
                            <Calendar className="w-3 h-3" />
                            {v('check_expire')}
                          </span>
                        )}
                      </div>

                      {/* Net Amount (SOKIMEX) vs Limit */}
                      <div
                        className={`px-2.5 py-2 rounded-lg ${
                          limitState === 'over' ? 'bg-rose-50 dark:bg-rose-950/30' : 'bg-slate-50 dark:bg-slate-900/70'
                        }`}
                      >
                        {net !== null ? (
                          <>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="inline-flex items-baseline gap-1.5 min-w-0">
                                <Fuel className="w-3 h-3 text-slate-400 self-center shrink-0" />
                                <span className={`text-[15px] font-extrabold tabular-nums ${netColor}`}>${fmtMoney(net)}</span>
                                {qty !== null && (
                                  <span className="text-[10.5px] text-slate-400 tabular-nums">
                                    {qty.toLocaleString('en-US', { maximumFractionDigits: 2 })} L
                                  </span>
                                )}
                              </span>
                              <span className="text-[10.5px] text-slate-400 tabular-nums shrink-0">
                                {limit ? `/ $${fmtMoney(limit)}` : 'គ្មាន Limit'}
                              </span>
                            </div>
                            {pct !== null && limit !== null && (
                              <div className="mt-1 flex items-center gap-2">
                                <div className="flex-1 h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                                </div>
                                <span className={`text-[10px] font-bold tabular-nums shrink-0 ${limitState ? netColor : 'text-slate-500'}`}>
                                  {limitState === 'over' ? `⚠ +$${fmtMoney(net - limit)}` : `${Math.round(pct)}%`}
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-300 dark:text-slate-600">
                            <Fuel className="w-3 h-3" />
                            {has('link_sokimic') ? 'មិនទាន់មានការចាក់ប្រេង' : 'មិនទាន់ភ្ជាប់ Sokimex'}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Synced Bottom Horizontal Scrollbar for Table View */}
          {hasHorizontalOverflow && viewMode === 'table' && (
            <div
              ref={footerScrollRef}
              onScroll={handleFooterScroll}
              className="overflow-x-auto bg-slate-50 dark:bg-slate-950/90 border-t border-slate-200 dark:border-slate-800 py-1.5 px-3 custom-scrollbar"
              style={{ minHeight: '16px' }}
            >
              <div style={{ width: `${tableScrollWidth}px`, height: '1px' }} />
            </div>
          )}

          {/* Pagination Footer (Mobile & Desktop Friendly) */}
          <div className="px-4 py-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3 bg-white dark:bg-slate-900">
            {/* Page Size Selector */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="hidden sm:inline">បង្ហាញ៖</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-white font-semibold cursor-pointer text-xs"
              >
                <option value={15}>15 ជួរ</option>
                <option value={25}>25 ជួរ</option>
                <option value={50}>50 ជួរ</option>
                <option value={100}>100 ជួរ</option>
                <option value={250}>250 ជួរ</option>
                <option value={10000}>ទាំងអស់ (All)</option>
              </select>
            </div>

            {/* Pagination Controls with Touch targets */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 cursor-pointer shadow-2xs"
                title="ទំព័រមុន"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 px-2 select-none">
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 cursor-pointer shadow-2xs"
                title="ទំព័របន្ទាប់"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Record Detail Slide-over Modal (Mobile & iPad friendly full-detail viewer) */}
      {selectedRowDetail && (() => {
        const row = selectedRowDetail.row;
        const valOf = (c?: SheetColumnDef) => (c ? String(row[c.id] ?? '').trim() : '');
        const findCol = (re: RegExp) => columns.find((c) => re.test(c.label || c.id));
        const titleCol = columns[0];
        const titleVal = valOf(titleCol);
        const plateCol = findCol(/model|plate|ផ្លាក/i);
        const statusCol = findCol(/^status$/i);
        const typeCols = columns.filter((c) => /^type$/i.test(c.label || c.id));
        const stationCol = findCol(/station|location|branch/i);
        const plateVal = valOf(plateCol);
        const statusVal = valOf(statusCol);
        const stationVal = valOf(stationCol);
        const typeVals = typeCols.map(valOf).filter((v) => v && v !== '-');
        const numericIds = new Set(numericSummaries.map((n) => n.col.id));
        const highlightCols = columns.filter((c) => numericIds.has(c.id) || /expire|expiry|ផុត/i.test(c.label || c.id));
        const bodyCols = columns.slice(1);
        const filledCount = columns.filter((c) => {
          const v = valOf(c);
          return v && v !== '-';
        }).length;
        const statusTone = /activ|ok|ready|ដំណើរការ/i.test(statusVal)
          ? 'bg-emerald-400'
          : /expir|inactiv|broken|ខូច|ផុត/i.test(statusVal)
          ? 'bg-rose-400'
          : 'bg-amber-300';
        const fieldIcon = (label: string) => {
          const l = label.toLowerCase();
          if (/name|handle|driver|ឈ្មោះ/.test(l)) return User;
          if (/model|plate|truck|vehicle/.test(l)) return Truck;
          if (/link|url/.test(l)) return LinkIcon;
          if (/gps|serial/.test(l)) return Navigation;
          if (/card|\bid\b/.test(l)) return CreditCard;
          if (/date|expire|check/.test(l)) return Calendar;
          if (/limit|amount|price|cost|total/.test(l)) return Gauge;
          if (/station|location|branch/.test(l)) return MapPin;
          if (/status/.test(l)) return Activity;
          if (/detail|fuel|diesel|gas/.test(l)) return Fuel;
          if (/note|remark/.test(l)) return StickyNote;
          if (/type/.test(l)) return Tag;
          return Hash;
        };

        return (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-5 animate-in fade-in duration-150"
          onClick={() => setSelectedRowDetail(null)}
        >
          <div
            className="bg-slate-50 dark:bg-slate-950 rounded-t-3xl sm:rounded-3xl max-w-2xl w-full shadow-2xl shadow-black/30 ring-1 ring-black/5 dark:ring-white/10 max-h-[94vh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Hero header */}
            <div className="relative shrink-0 px-5 pt-4 pb-10 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white overflow-hidden">
              <div className="absolute -top-16 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
              <div className="absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-cyan-300/20 blur-3xl pointer-events-none" />

              <div className="relative flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/15 ring-1 ring-white/20 text-[11px] font-semibold backdrop-blur-sm">
                  <Boxes className="w-3 h-3" />
                  <span className="font-mono">#{selectedRowDetail.rowNumber}</span>
                  <span className="opacity-60">•</span>
                  <span>{filledCount}/{columns.length} មានទិន្នន័យ</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedRowDetail(null)}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/25 ring-1 ring-white/20 transition cursor-pointer"
                  title="បិទ (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="relative mt-3 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-white/70">{titleCol?.label || titleCol?.id}</div>
                  <h3 className="text-xl sm:text-2xl font-black tracking-tight truncate">
                    {titleVal && titleVal !== '-' ? titleVal : 'មិនមានឈ្មោះ'}
                  </h3>
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {statusVal && statusVal !== '-' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white text-slate-800 text-[11px] font-bold shadow-sm">
                        <span className={`w-1.5 h-1.5 rounded-full ${statusTone}`} />
                        {statusVal}
                      </span>
                    )}
                    {typeVals.map((t) => (
                      <span key={t} className="px-2.5 py-0.5 rounded-full bg-white/15 ring-1 ring-white/25 text-[11px] font-semibold">
                        {t}
                      </span>
                    ))}
                    {stationVal && stationVal !== '-' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 ring-1 ring-white/25 text-[11px] font-semibold">
                        <MapPin className="w-3 h-3" />
                        {stationVal}
                      </span>
                    )}
                  </div>
                </div>

                {/* License-plate style badge */}
                {plateVal && plateVal !== '-' && (
                  <div className="hidden sm:block shrink-0 rounded-lg bg-white text-slate-900 ring-2 ring-slate-900/80 shadow-lg overflow-hidden text-center rotate-[-2deg]">
                    <div className="bg-blue-700 text-white text-[8px] font-bold tracking-[0.2em] px-3 py-0.5">CAMBODIA</div>
                    <div className="px-3 py-1 font-mono font-black text-lg tracking-wider">{plateVal}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Highlight tiles overlapping the hero */}
            {highlightCols.length > 0 && (
              <div className="relative -mt-6 px-4 sm:px-5 grid grid-cols-2 sm:grid-cols-3 gap-2 shrink-0">
                {highlightCols.slice(0, 3).map((c) => {
                  const v = valOf(c);
                  const Icon = fieldIcon(c.label || c.id);
                  const empty = !v || v === '-';
                  return (
                    <div key={c.id} className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200/80 dark:ring-slate-800 shadow-md shadow-slate-900/5 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                        <Icon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="truncate">{c.label || c.id}</span>
                      </div>
                      <div className={`mt-0.5 font-black font-mono truncate ${empty ? 'text-slate-300 dark:text-slate-600 text-base' : 'text-slate-900 dark:text-white text-lg'}`}>
                        {empty ? '—' : v}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Field list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-5 py-3">
              {/* Details list: label on the left, value on the right, one field per row */}
              <div className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200/80 dark:ring-slate-800 overflow-hidden grid grid-cols-1 sm:grid-cols-2">
                {bodyCols.filter((col) => {
                  const v = valOf(col);
                  return v && v !== '-';
                }).map((col) => {
                  const str = valOf(col);
                  const isUrl = isValidUrl(str);
                  const isWide = isUrl || str.length > 22;
                  const cellKey = `modal_${col.id}`;
                  const isCopied = copiedCellId === cellKey;
                  const Icon = fieldIcon(col.label || col.id);

                  return (
                    <div
                      key={col.id}
                      onClick={!isUrl ? (e) => handleCopyCell(str, cellKey, e) : undefined}
                      title={!isUrl ? 'ចុចដើម្បី Copy' : undefined}
                      className={`group/field flex items-center gap-2 px-3 py-1.5 min-h-[34px] border-b border-slate-100 dark:border-slate-800/80 sm:odd:border-r ${
                        isWide ? 'sm:col-span-2 sm:border-r-0' : ''
                      } ${!isUrl ? 'cursor-copy hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30' : ''} transition`}
                    >
                      {/* Label */}
                      <div className={`flex items-center gap-1.5 shrink-0 min-w-0 ${isWide ? 'w-[38%] sm:w-[19%]' : 'w-[38%]'}`}>
                        <Icon className="w-3.5 h-3.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
                        <span className="text-[11.5px] font-medium text-slate-500 dark:text-slate-400 truncate">
                          {col.label || col.id}
                        </span>
                      </div>

                      {/* Value */}
                      <div className="min-w-0 flex-1 text-[12.5px] font-semibold text-slate-900 dark:text-white break-words">
                        {isUrl ? (
                          <a
                            href={formatUrlHref(str)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline break-all"
                          >
                            <span>{str}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                          </a>
                        ) : (
                          <SmartCell label={col.label || col.id} value={str} warnDays={col.id === truckStatusCols?.notesCol.id ? row.__expireDays : undefined} limitRow={col.id === 'sk_net_amount' ? row : undefined} />
                        )}
                      </div>

                      {!isUrl && (
                        <span className={`shrink-0 transition ${isCopied ? 'opacity-100' : 'opacity-0 group-hover/field:opacity-100'}`}>
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Empty fields collapsed into one line to save space */}
              {(() => {
                const emptyCols = bodyCols.filter((c) => {
                  const v = valOf(c);
                  return !v || v === '-';
                });
                if (!emptyCols.length) return null;
                return (
                  <div className="mt-2 px-1 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                    <span className="font-semibold">គ្មានទិន្នន័យ៖</span>{' '}
                    {emptyCols.map((c) => c.label || c.id).join(' • ')}
                  </div>
                );
              })()}
            </div>

            {/* Footer navigation */}
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-5 py-3 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleNavigateDetail('prev')}
                  disabled={selectedRowDetail.index <= 0}
                  className="w-8 h-8 rounded-full ring-1 ring-slate-200 dark:ring-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center transition"
                  title="មុន (←)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 text-xs font-mono font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                  {selectedRowDetail.index + 1} / {filteredRows.length}
                </span>
                <button
                  type="button"
                  onClick={() => handleNavigateDetail('next')}
                  disabled={selectedRowDetail.index >= filteredRows.length - 1}
                  className="w-8 h-8 rounded-full ring-1 ring-slate-200 dark:ring-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center transition"
                  title="បន្ទាប់ (→)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="hidden md:inline text-[10.5px] text-slate-400 ml-1">← → ប្តូរជួរ • Esc បិទ</span>
              </div>

              <div className="flex items-center gap-1.5">
                {canDeleteRow && (
                  <button
                    type="button"
                    onClick={() => handleDeleteRows([row])}
                    className="h-8 px-3 rounded-full ring-1 ring-rose-200 dark:ring-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-xs font-bold cursor-pointer transition inline-flex items-center gap-1"
                    title="លុប"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">លុប</span>
                  </button>
                )}
                {canEditRow && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRowDetail(null);
                      openEdit(row);
                    }}
                    className="h-8 px-3 rounded-full ring-1 ring-slate-200 dark:ring-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold cursor-pointer transition inline-flex items-center gap-1"
                    title="កែប្រែ"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>កែប្រែ</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedRowDetail(null)}
                  className="px-5 py-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/25 cursor-pointer transition active:scale-95"
                >
                  បិទ
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* 9. Add / Edit form (saved to Hostinger) */}
      {editingRow && (() => {
        const isNew = !editingRow.id;
        const setField = (key: string, value: string) => setEditingRow((prev) => (prev ? { ...prev, [key]: value } : prev));
        // dd/mm/yyyy (stored) <-> yyyy-mm-dd (date input)
        const toIso = (s: string) => {
          const d = parseDmy(String(s || '').trim());
          return d
            ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            : '';
        };
        const fromIso = (s: string) => {
          const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
        };
        const optionsFor = (key: string) =>
          Array.from(new Set(rawRows.map((r) => String(r[key] ?? '').trim()).filter((v) => v && v !== '-'))).sort();
        const LABELS: Record<string, string> = {
          size_type: 'Type (ទំហំ ឧ. T 1.5)',
          vehicle_type: 'Type (Truck / MOTO / TUK TUK)',
          net_amount_limit: 'Net Amount Limit ($) — ប្រមានពេល Net Amount លើស'
        };
        const isTruck = /^truck$/i.test(String(editingRow.vehicle_type || '').trim());
        const inputCls =
          'w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10';

        return (
          <div
            className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-5 animate-in fade-in duration-150"
            onClick={() => !isSaving && setEditingRow(null)}
          >
            <form
              className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl max-w-2xl w-full shadow-2xl ring-1 ring-black/5 dark:ring-white/10 max-h-[94vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveRow();
              }}
            >
              <div className="shrink-0 flex items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isNew ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400'}`}>
                    {isNew ? <Plus className="w-4.5 h-4.5" /> : <Pencil className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {isNew ? 'បន្ថែមជួរថ្មី' : `កែប្រែ ${editingRow.model_no || editingRow.name_handle || ''}`}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">រក្សាទុកក្នុង Hostinger Database</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  disabled={isSaving}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                {MO_FIELDS.map((f) => {
                  const value = String(editingRow[f.key] ?? '');
                  const isDate = f.key === 'check_date' || f.key === 'check_expire';
                  const opts = isDate ? [] : optionsFor(f.key);
                  const listId = `mo-opt-${f.key}`;
                  const required = f.key === 'model_no';
                  return (
                    <label key={f.key} className={`block ${f.key === 'link_sokimic' ? 'sm:col-span-2' : ''}`}>
                      <span className="block text-[11.5px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        {LABELS[f.key] || f.label}
                        {required && <span className="text-rose-500"> *</span>}
                      </span>
                      {isDate ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="date"
                            value={toIso(value)}
                            onChange={(e) => setField(f.key, fromIso(e.target.value))}
                            className={inputCls}
                          />
                          {value && (
                            <button
                              type="button"
                              onClick={() => setField(f.key, '')}
                              className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer"
                              title="លុបថ្ងៃ"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => setField(f.key, e.target.value)}
                            list={opts.length ? listId : undefined}
                            autoFocus={f.key === 'name_handle'}
                            className={`${inputCls} ${f.key === 'model_no' ? 'font-mono font-bold uppercase' : ''}`}
                          />
                          {opts.length > 0 && (
                            <datalist id={listId}>
                              {opts.slice(0, 200).map((o) => (
                                <option key={o} value={o} />
                              ))}
                            </datalist>
                          )}
                        </>
                      )}
                      {f.key === 'notes' && isTruck && (
                        <span className="block mt-1 text-[10.5px] text-amber-600 dark:text-amber-400">
                          សម្រាប់ Truck ប្រព័ន្ធបង្ហាញ Active / Exspire ដោយស្វ័យប្រវត្តិតាម Check Expire
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                >
                  បោះបង់
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {isSaving ? 'កំពុងរក្សាទុក...' : 'រក្សាទុក'}
                </button>
              </div>
            </form>
          </div>
        );
      })()}
    </div>
  );
};
