import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Contact,
  Plus,
  Search,
  Phone,
  MapPin,
  Mail,
  Send,
  Building,
  User,
  Edit3,
  Trash2,
  Download,
  AlertCircle,
  RefreshCw,
  X,
  Check,
  Loader2,
  BadgeCheck,
  FileUp,
  FileSpreadsheet,
  Banknote,
  HandCoins,
  ChevronDown,
} from 'lucide-react';
import { AuthUser } from '../types';
import { formatCsv, downloadCsv } from '../utils/csvHelper';
import {
  Customer,
  CustomerStatus,
  CustomerType,
  SaleUser,
  fetchCustomers,
  fetchSaleUsers,
  saveCustomer,
  deleteCustomer,
  deleteCustomers,
  importCustomers,
} from '../services/customerService';
import { ParsedCustomerFile, parseCustomerFile, downloadCustomerTemplate } from '../utils/customerExcelImport';
import {
  gridWrap,
  gridTable,
  gridTh,
  gridTd,
  gridRow,
  gridRowSelected,
  gridNull,
  GridHeadGutter,
  GridRowGutter,
  GridSelectionBar,
  useRowSelection,
  copyRowsAsTsv,
  exportRowsAsCsv,
} from './ui/DataGrid';

interface CustomersPageProps {
  currentUser: AuthUser | null;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const TYPE_MAP: Record<CustomerType, { label: string; short: string; pill: string; icon: any; color: string }> = {
  INDIVIDUAL: { label: 'បុគ្គល (Individual)', short: 'បុគ្គល', pill: 'bg-blue-600', icon: User, color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800' },
  BUSINESS: { label: 'ក្រុមហ៊ុន (Business)', short: 'ក្រុមហ៊ុន', pill: 'bg-indigo-600', icon: Building, color: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800' },
  CASH: { label: 'អ្នកផ្ញើបង់ (Cash)', short: 'អ្នកផ្ញើបង់', pill: 'bg-emerald-600', icon: Banknote, color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800' },
  COLLECT: { label: 'អ្នកទទួលបង់ (Collect)', short: 'អ្នកទទួលបង់', pill: 'bg-amber-600', icon: HandCoins, color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800' },
};

const EMPTY_FORM: Customer = {
  customer_code: '',
  name: '',
  nickname: '',
  company: '',
  customer_type: 'INDIVIDUAL',
  phone: '',
  phone2: '',
  email: '',
  telegram: '',
  address: '',
  province: '',
  status: 'ACTIVE',
  sale_user_id: null,
  sale_handle: null,
  notes: '',
};

const inputCls =
  'w-full h-[34px] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600';
const labelCls = 'block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-0.5';

const formatDateTime = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? String(value) : d.toLocaleString('en-GB', { hour12: false });
};

/** Linked account (violet) or a name that matches no account yet (amber). */
const SaleBadge: React.FC<{ c: Customer }> = ({ c }) =>
  c.sale_linked ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800">
      <BadgeCheck className="w-3 h-3" />
      {c.sale_handle}
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
      title="មិនទាន់ភ្ជាប់គណនីអ្នកប្រើប្រាស់ — សូម Edit ហើយជ្រើសរើស Sale ម្តងទៀត"
    >
      <AlertCircle className="w-3 h-3" />
      {c.sale_handle}
    </span>
  );

/** Rows rendered per chunk; more are appended as the user scrolls. */
const ROW_CHUNK = 100;

const DESKTOP_QUERY = '(min-width: 1024px)';
const useIsDesktop = () => {
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
};

const sameCustomer = (a: Customer, b: Customer) => {
  const keys = Object.keys(b) as (keyof Customer)[];
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] === b[k]);
};

/** Keep the previous object for unchanged rows so memoized rows skip re-rendering. */
const reconcileCustomers = (prev: Customer[], next: Customer[]) => {
  const byId = new Map(prev.map((p) => [p.id, p]));
  return next.map((n) => {
    const old = byId.get(n.id);
    return old && sameCustomer(old, n) ? old : n;
  });
};

interface RowProps {
  c: Customer;
  idx: number;
  selected?: boolean;
  canSave: boolean;
  canDelete: boolean;
  onSelect?: (id: Customer['id']) => void;
  onEdit: (c: Customer) => void;
  onDelete: (c: Customer) => void;
  onToggleStatus: (c: Customer) => void;
}

const StatusPill: React.FC<Pick<RowProps, 'c' | 'canSave' | 'onToggleStatus'>> = ({ c, canSave, onToggleStatus }) => {
  const active = c.status === 'ACTIVE';
  const cls = active
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30'
    : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
  const content = (
    <>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {active ? 'សកម្ម' : 'ផ្អាក'}
    </>
  );
  return canSave ? (
    <button
      type="button"
      onClick={() => onToggleStatus(c)}
      title="ចុចដើម្បីប្តូរស្ថានភាព"
      className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[11px] font-medium cursor-pointer transition hover:opacity-80 ${cls}`}
    >
      {content}
    </button>
  ) : (
    <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[11px] font-medium ${cls}`}>{content}</span>
  );
};

const RowActions: React.FC<Pick<RowProps, 'c' | 'canSave' | 'canDelete' | 'onEdit' | 'onDelete'>> = ({ c, canSave, canDelete, onEdit, onDelete }) => (
  <div className="flex items-center justify-end gap-0.5">
    {canSave && (
      <button
        type="button"
        onClick={() => onEdit(c)}
        className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
        title="កែប្រែ"
      >
        <Edit3 className="w-3.5 h-3.5" />
      </button>
    )}
    {canDelete && (
      <button
        type="button"
        onClick={() => onDelete(c)}
        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
        title="លុប"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);

const CustomerTableRow = React.memo<RowProps>(({ c, idx, selected = false, canSave, canDelete, onSelect, onEdit, onDelete, onToggleStatus }) => {
  const typeInfo = TYPE_MAP[c.customer_type] || TYPE_MAP.INDIVIDUAL;
  const TypeIcon = typeInfo.icon;
  const place = [c.address, c.province].filter(Boolean).join(', ');
  return (
    <tr className={`${gridRow} ${selected ? gridRowSelected : ''}`}>
      <GridRowGutter selected={selected} rowNumber={idx + 1} onToggle={() => onSelect?.(c.id)} />
      <td className={`${gridTd()} font-mono text-slate-600 dark:text-slate-300`}>{c.customer_code || gridNull}</td>
      <td className={gridTd()}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center font-semibold text-[11px] shrink-0">
            {(c.company || c.name).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            {c.company && (
              <div className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[220px]" title={c.company}>{c.company}</div>
            )}
            <div className={c.company ? 'text-[11px] text-slate-400 truncate max-w-[220px]' : 'font-medium text-slate-900 dark:text-slate-100'} title={c.notes || ''}>
              {[c.name, c.notes].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
      </td>
      <td className={`${gridTd()} text-slate-700 dark:text-slate-300`}>
        {hasValue(c.nickname) ? <span className="block truncate max-w-[160px]" title={c.nickname || ''}>{c.nickname}</span> : gridNull}
      </td>
      <td className={gridTd()}>
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium ${typeInfo.color}`}>
          <TypeIcon className="w-3 h-3" />
          <span>{typeInfo.label}</span>
        </span>
      </td>
      <td className={`${gridTd()} font-mono tabular-nums`}>
        {c.phone ? (
          <div className="flex flex-col">
            <a href={`tel:${c.phone}`} className="text-slate-700 dark:text-slate-300 hover:text-emerald-600">{c.phone}</a>
            {c.phone2 && <a href={`tel:${c.phone2}`} className="text-[11px] text-slate-400 hover:text-emerald-600">{c.phone2}</a>}
          </div>
        ) : gridNull}
      </td>
      <td className={`${gridTd()} text-slate-600 dark:text-slate-300`}>
        {c.email || c.telegram ? (
          <div className="flex flex-col">
            {c.email && <a href={`mailto:${c.email}`} className="hover:text-blue-600">{c.email}</a>}
            {c.telegram && <span className="text-[11px] text-slate-400">{c.telegram}</span>}
          </div>
        ) : gridNull}
      </td>
      <td className={`${gridTd()} text-slate-600 dark:text-slate-300`}>
        {place ? <span className="block truncate max-w-[260px]" title={place}>{place}</span> : gridNull}
      </td>
      <td className={gridTd()}>{c.sale_handle ? <SaleBadge c={c} /> : gridNull}</td>
      <td className={gridTd()}><StatusPill c={c} canSave={canSave} onToggleStatus={onToggleStatus} /></td>
      <td className={`${gridTd()} text-right`}><RowActions c={c} canSave={canSave} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} /></td>
    </tr>
  );
});

/** Placeholder values imported from Excel ("Empty", "-", "N/A") that shouldn't be shown as real data */
const hasValue = (v?: string | null) => {
  const s = (v || '').trim().toLowerCase();
  return s !== '' && !['empty', '-', '—', 'n/a', 'na', 'null', 'none'].includes(s);
};

// Avatar tint per customer type (phone cards)
const TYPE_AVATAR: Record<CustomerType, string> = {
  INDIVIDUAL: 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300',
  BUSINESS: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300',
  CASH: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300',
  COLLECT: 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300',
};

const fmtStamp = (v?: string) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime())
    ? v
    : d.toLocaleString('en-GB', { timeZone: 'Asia/Phnom_Penh', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** One labelled line in the card's detail panel */
const DetailRow: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }> = ({ icon: Icon, label, children }) => (
  <div className="flex items-start gap-2.5 py-1.5">
    <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center shrink-0">
      <Icon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[10.5px] text-slate-400 leading-tight">{label}</p>
      <div className="text-[13px] text-slate-800 dark:text-slate-100 break-words leading-snug">{children}</div>
    </div>
  </div>
);

const CustomerCard = React.memo<RowProps>(({ c, idx, canSave, canDelete, onEdit, onDelete, onToggleStatus }) => {
  const [open, setOpen] = useState(false);
  const typeInfo = TYPE_MAP[c.customer_type] || TYPE_MAP.INDIVIDUAL;
  const TypeIcon = typeInfo.icon;
  const title = (hasValue(c.company) ? c.company : c.name) || '—';
  const contact = hasValue(c.company) && hasValue(c.name) ? c.name : '';
  const place = [c.address, c.province].filter(hasValue).join(', ');
  const phones = [c.phone, c.phone2].filter(hasValue) as string[];
  const active = c.status === 'ACTIVE';

  return (
    <div
      className={`rounded-2xl border bg-white dark:bg-slate-900 shadow-2xs overflow-hidden transition-colors ${
        open ? 'border-blue-300 dark:border-blue-700 ring-1 ring-blue-200/70 dark:ring-blue-900/60' : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* Summary — tap anywhere to open the details */}
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full text-left px-3 py-3 flex items-start gap-3 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/40">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-base shrink-0 ${TYPE_AVATAR[c.customer_type] || TYPE_AVATAR.INDIVIDUAL}`}>
          {title.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-[14px] font-bold leading-snug text-slate-900 dark:text-white break-words line-clamp-2">{title}</p>
            <span
              className={`shrink-0 mt-0.5 inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10.5px] font-semibold ${
                active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {active ? 'សកម្ម' : 'ផ្អាក'}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded-md border font-semibold ${typeInfo.color}`}>
              <TypeIcon className="w-3 h-3" />
              {typeInfo.short}
            </span>
            {hasValue(c.customer_code) && (
              <span className="px-1.5 py-px rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-slate-500 dark:text-slate-400">#{c.customer_code}</span>
            )}
            {phones[0] && (
              <span className="inline-flex items-center gap-1 font-mono text-slate-600 dark:text-slate-300">
                <Phone className="w-3 h-3 text-emerald-600" />
                {phones[0]}
              </span>
            )}
          </div>
        </div>

        <ChevronDown className={`w-4 h-4 mt-1 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Details */}
      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 px-3 pt-1.5 pb-3">
          <div className="divide-y divide-slate-200/60 dark:divide-slate-800">
            {contact && <DetailRow icon={User} label="អ្នកទំនាក់ទំនង">{contact}</DetailRow>}
            {hasValue(c.nickname) && <DetailRow icon={User} label="ឈ្មោះហៅក្រៅ">{c.nickname}</DetailRow>}
            {phones.length > 0 && (
              <DetailRow icon={Phone} label="លេខទូរស័ព្ទ">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {phones.map((p) => (
                    <a key={p} href={`tel:${p}`} className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">{p}</a>
                  ))}
                </div>
              </DetailRow>
            )}
            {hasValue(c.email) && (
              <DetailRow icon={Mail} label="Email">
                <a href={`mailto:${c.email}`} className="text-blue-600 dark:text-blue-400 hover:underline">{c.email}</a>
              </DetailRow>
            )}
            {hasValue(c.telegram) && <DetailRow icon={Send} label="Telegram">{c.telegram}</DetailRow>}
            {place && <DetailRow icon={MapPin} label="អាសយដ្ឋាន">{place}</DetailRow>}
            {hasValue(c.sale_handle) && (
              <DetailRow icon={BadgeCheck} label="Sale ទទួលបន្ទុក"><SaleBadge c={c} /></DetailRow>
            )}
            {hasValue(c.notes) && <DetailRow icon={FileSpreadsheet} label="កំណត់ចំណាំ">{c.notes}</DetailRow>}
            {(c.created_at || c.updated_at) && (
              <div className="pt-2 text-[10.5px] text-slate-400 space-y-0.5">
                {c.created_at && <p>បង្កើត៖ {fmtStamp(c.created_at)}{c.created_by ? ` · ${c.created_by}` : ''}</p>}
                {c.updated_at && c.updated_at !== c.created_at && <p>កែចុងក្រោយ៖ {fmtStamp(c.updated_at)}{c.updated_by ? ` · ${c.updated_by}` : ''}</p>}
              </div>
            )}
          </div>

          {(canSave || canDelete) && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {canSave ? (
                <button
                  type="button"
                  onClick={() => onToggleStatus(c)}
                  className={`h-9 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                    active
                      ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${active ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                  {active ? 'ផ្អាក' : 'បើកសកម្ម'}
                </button>
              ) : <span />}
              {canSave ? (
                <button type="button" onClick={() => onEdit(c)} className="h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                  <Edit3 className="w-3.5 h-3.5" />កែប្រែ
                </button>
              ) : <span />}
              {canDelete && (
                <button type="button" onClick={() => onDelete(c)} className="h-9 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" />លុប
                </button>
              )}
            </div>
          )}
          <p className="mt-2 text-center text-[10px] text-slate-400 font-mono">#{idx + 1}</p>
        </div>
      )}
    </div>
  );
});

export const CustomersPage: React.FC<CustomersPageProps> = ({ currentUser, onShowToast }) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const isViewer = currentUser?.role === 'VIEWER';
  const canSave = isAdmin || (!isViewer && !(currentUser?.canCreate === false && currentUser?.canEdit === false));
  const canDelete = isAdmin || (!isViewer && currentUser?.canDelete !== false);
  const canImport = isAdmin || (!isViewer && currentUser?.canCreate !== false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | CustomerType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CustomerStatus>('ALL');
  const [saleFilter, setSaleFilter] = useState('ALL');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<(ParsedCustomerFile & { fileName: string }) | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);

  const [saleUsers, setSaleUsers] = useState<SaleUser[]>([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [list, users] = await Promise.all([fetchCustomers(), fetchSaleUsers().catch(() => null)]);
      setCustomers((prev) => reconcileCustomers(prev, list));
      if (users) setSaleUsers(users);
      setLoadError('');
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load customers');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    let active = 0;
    const byType: Record<CustomerType, number> = { INDIVIDUAL: 0, BUSINESS: 0, CASH: 0, COLLECT: 0 };
    customers.forEach((c) => {
      if (c.status === 'ACTIVE') active++;
      byType[TYPE_MAP[c.customer_type] ? c.customer_type : 'INDIVIDUAL']++;
    });
    return { total: customers.length, active, byType };
  }, [customers]);

  // Sale filter options: accounts that handle at least one customer
  const saleFilterOptions = useMemo(() => {
    const byId = new Map<string, string>();
    customers.forEach((c) => {
      if (c.sale_linked && c.sale_user_id) byId.set(c.sale_user_id, c.sale_handle || c.sale_user_id);
    });
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [customers]);
  const unlinkedCount = useMemo(() => customers.filter((c) => c.sale_handle && !c.sale_linked).length, [customers]);

  // The signed-in user's own account (default Sale for "own data" users)
  const myAccount = useMemo(() => {
    const email = (currentUser?.email || '').toLowerCase().trim();
    return saleUsers.find((u) => u.user_id === currentUser?.id || (email && u.email.toLowerCase() === email)) || null;
  }, [saleUsers, currentUser]);

  const openCreate = () =>
    setEditing({
      ...EMPTY_FORM,
      ...(currentUser?.viewOnlyOwn && myAccount ? { sale_user_id: myAccount.user_id, sale_handle: myAccount.name || myAccount.email } : {}),
    });

  const deferredSearch = useDeferredValue(searchTerm);
  const filtered = useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();
    return customers.filter((c) => {
      if (typeFilter !== 'ALL' && c.customer_type !== typeFilter) return false;
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (saleFilter === 'NONE' && c.sale_handle) return false;
      if (saleFilter === 'UNLINKED' && !(c.sale_handle && !c.sale_linked)) return false;
      if (!['ALL', 'NONE', 'UNLINKED'].includes(saleFilter) && !(c.sale_linked && c.sale_user_id === saleFilter)) return false;
      if (!q) return true;
      return [c.customer_code, c.name, c.nickname, c.company, c.phone, c.phone2, c.email, c.telegram, c.address, c.province, c.sale_handle, c.notes]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [customers, deferredSearch, typeFilter, statusFilter, saleFilter]);

  const selection = useRowSelection(useMemo(() => filtered.map((c) => c.id), [filtered]));

  const toMatrix = (rows: Customer[]): [string[], any[][]] => [
    ['Code', 'Name', 'Nickname', 'Company', 'Type', 'Phone', 'Phone 2', 'Email', 'Telegram', 'Address', 'Province', 'Sale_Handle', 'Status', 'Notes', 'Created_At'],
    rows.map((c) => [
      c.customer_code || '', c.name, c.nickname || '', c.company || '', c.customer_type, c.phone || '', c.phone2 || '', c.email || '',
      c.telegram || '', c.address || '', c.province || '', c.sale_handle || '', c.status, c.notes || '', formatDateTime(c.created_at),
    ]),
  ];
  const selectedMatrix = () => toMatrix(filtered.filter((c) => selection.isSelected(c.id)));

  const handleExportCSV = () => {
    const [headers, rows] = toMatrix(filtered);
    downloadCsv(`Customers_${new Date().toISOString().slice(0, 10)}.csv`, formatCsv(headers, rows));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!editing.name.trim()) {
      onShowToast('សូមបញ្ចូលឈ្មោះអតិថិជន!', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const list = await saveCustomer(editing);
      setCustomers((prev) => reconcileCustomers(prev, list));
      onShowToast(editing.id ? '✓ បានកែប្រែព័ត៌មានអតិថិជន' : '✓ បានបន្ថែមអតិថិជនថ្មី', 'success');
      setEditing(null);
    } catch (err: any) {
      onShowToast(err?.message || 'Save failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    try {
      const parsed = await parseCustomerFile(file);
      if (parsed.rows.length === 0) {
        onShowToast('File គ្មានជួរអតិថិជនដែលមានឈ្មោះ', 'error');
        return;
      }
      setImportPreview({ ...parsed, fileName: file.name });
    } catch (err: any) {
      onShowToast(err?.message || 'មិនអាចអាន File បាន', 'error');
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    setImportProgress(`0 / ${importPreview.rows.length}`);
    try {
      const result = await importCustomers(importPreview.rows, (done, total) => setImportProgress(`${done} / ${total}`));
      setCustomers((prev) => reconcileCustomers(prev, result.customers));
      setImportPreview(null);
      onShowToast(
        `✓ Import រួចរាល់៖ ថ្មី ${result.inserted}, កែប្រែ ${result.updated}, រំលង (ស្ទួន) ${result.skipped}` +
          (result.unlinkedSale ? ` • ${result.unlinkedSale} ជួរ Sale រកមិនឃើញគណនី (មិនទាន់ភ្ជាប់)` : ''),
        'success'
      );
    } catch (err: any) {
      onShowToast(err?.message || 'Import failed', 'error');
      load(); // earlier batches may have been saved
    } finally {
      setImportProgress(null);
    }
  };

  const handleToggleStatus = async (c: Customer) => {
    const next: Customer = { ...c, status: c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' };
    setCustomers((prev) => prev.map((x) => (x.id === c.id ? next : x))); // optimistic
    try {
      const list = await saveCustomer(next);
      setCustomers((prev) => reconcileCustomers(prev, list));
    } catch (err: any) {
      setCustomers((prev) => prev.map((x) => (x.id === c.id ? c : x)));
      onShowToast(err?.message || 'Update failed', 'error');
    }
  };

  const handleDelete = async (c: Customer) => {
    if (!c.id || !window.confirm(`តើអ្នកពិតជាចង់លុបអតិថិជន «${c.name}» មែនទេ?`)) return;
    try {
      const list = await deleteCustomer(c.id);
      setCustomers((prev) => reconcileCustomers(prev, list));
      onShowToast('✓ បានលុបអតិថិជន', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Delete failed', 'error');
    }
  };

  const [bulkDeleting, setBulkDeleting] = useState(false);
  const handleBulkDelete = async () => {
    const ids = filtered.filter((c) => c.id && selection.isSelected(c.id)).map((c) => c.id as number);
    if (!ids.length) return;
    if (!window.confirm(`តើអ្នកពិតជាចង់លុបអតិថិជនទាំង ${ids.length} នាក់ដែលបានជ្រើសរើសមែនទេ? មិនអាចយកមកវិញបានទេ។`)) return;
    setBulkDeleting(true);
    try {
      const res = await deleteCustomers(ids);
      setCustomers((prev) => reconcileCustomers(prev, res.customers));
      selection.clear();
      onShowToast(`✓ បានលុបអតិថិជន ${res.deleted} នាក់`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Delete failed', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  const setField = <K extends keyof Customer>(key: K, value: Customer[K]) =>
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));

  // Stable row callbacks so memoized rows don't re-render on unrelated state changes
  const rowHandlers = useRef({ handleDelete, handleToggleStatus });
  rowHandlers.current = { handleDelete, handleToggleStatus };
  const onEditRow = useCallback((c: Customer) => setEditing({ ...EMPTY_FORM, ...c }), []);
  const onDeleteRow = useCallback((c: Customer) => rowHandlers.current.handleDelete(c), []);
  const onToggleStatusRow = useCallback((c: Customer) => rowHandlers.current.handleToggleStatus(c), []);

  // Progressive rendering: mount rows in chunks as the user scrolls
  const isDesktop = useIsDesktop();
  const [visibleCount, setVisibleCount] = useState(ROW_CHUNK);
  useEffect(() => setVisibleCount(ROW_CHUNK), [filtered]);
  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setVisibleCount((v) => v + ROW_CHUNK);
      },
      { root: isDesktop ? scrollRef.current : null, rootMargin: '400px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, visibleCount, isDesktop]);

  const pill = (active: boolean, activeCls: string) =>
    `h-7 px-2.5 rounded-md font-bold transition cursor-pointer whitespace-nowrap ${
      active ? `${activeCls} text-white shadow-2xs` : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
    }`;

  return (
    <div className="page-fill w-full space-y-2 animate-in fade-in duration-200 pb-24 lg:pb-0">
      {!canSave && (
        <div className="p-2 sm:p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span><b>សិទ្ធិមើលប៉ុណ្ណោះ (Read Only)៖</b> មិនអាចបន្ថែម ឬកែប្រែព័ត៌មានអតិថិជនបានឡើយ។</span>
        </div>
      )}

      <div className="page-fill-body bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Toolbar (phone: title/actions -> search -> filters; lg: one row) */}
        <div className="px-2.5 sm:px-3 py-2 lg:py-1.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex flex-wrap items-center gap-2">
          <div className="order-1 flex items-center gap-2 min-w-0 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Contact className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white tracking-tight whitespace-nowrap">ព័ត៌មានអតិថិជន</h2>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-mono font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60 whitespace-nowrap"
              title={`${stats.total} នាក់ • ${stats.active} សកម្ម`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {stats.active}/{stats.total}
            </span>
          </div>

          {/* Phone: forces the search + tools onto a new line under the title */}
          <div className="order-3 basis-full h-0 -mt-2 lg:hidden" aria-hidden="true" />

          <div className="order-4 lg:order-3 flex-1 min-w-0 lg:min-w-[180px] relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ស្វែងរក ឈ្មោះ, ឈ្មោះហៅក្រៅ, លេខកូដ, ទូរស័ព្ទ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-7 h-9 lg:h-8 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                title="សម្អាត"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="order-6 lg:order-4 w-full lg:w-auto overflow-x-auto scrollbar-none flex items-center gap-1.5 -mx-2.5 px-2.5 sm:mx-0 sm:px-0">
            <div className="inline-flex items-center gap-1 bg-white dark:bg-slate-800/90 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px]">
              <button type="button" onClick={() => setTypeFilter('ALL')} className={pill(typeFilter === 'ALL', 'bg-blue-600')}>
                ទាំងអស់ ({stats.total})
              </button>
              {(Object.keys(TYPE_MAP) as CustomerType[]).map((t) => (
                <button key={t} type="button" onClick={() => setTypeFilter(t)} className={pill(typeFilter === t, TYPE_MAP[t].pill)}>
                  {TYPE_MAP[t].short} ({stats.byType[t]})
                </button>
              ))}
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | CustomerStatus)}
              className="h-8 px-2 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none"
              title="ស្ថានភាព"
            >
              <option value="ALL">គ្រប់ស្ថានភាព</option>
              <option value="ACTIVE">សកម្ម</option>
              <option value="INACTIVE">ផ្អាក</option>
            </select>
            <select
              value={saleFilter}
              onChange={(e) => setSaleFilter(e.target.value)}
              className="h-8 px-2 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none"
              title="Sale handle"
            >
              <option value="ALL">គ្រប់ Sale</option>
              <option value="NONE">គ្មាន Sale</option>
              {unlinkedCount > 0 && <option value="UNLINKED">⚠ មិនទាន់ភ្ជាប់គណនី ({unlinkedCount})</option>}
              {saleFilterOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="order-5 flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={load}
              disabled={isLoading}
              className="h-8 px-2 rounded-lg border border-emerald-200/80 dark:border-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1 transition shadow-2xs cursor-pointer disabled:opacity-50 shrink-0"
              title="ទាញទិន្នន័យថ្មីពី Hostinger Master Database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Live</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition flex items-center gap-1 cursor-pointer text-xs font-semibold shadow-2xs shrink-0"
              title="ទាញយកជា CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </button>
            {canImport && (
              <>
                <input ref={fileInputRef} type="file" accept=".xlsx,.csv" onChange={handlePickFile} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition flex items-center gap-1 cursor-pointer text-xs font-semibold shadow-2xs shrink-0"
                  title="នាំចូលអតិថិជនពី File Excel (.xlsx) ឬ CSV"
                >
                  <FileUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">Import</span>
                </button>
              </>
            )}
          </div>

          {canSave && (
            <button
              type="button"
              onClick={openCreate}
              className="order-2 lg:order-6 ml-auto lg:ml-0 h-8 px-3 lg:px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-semibold flex items-center justify-center gap-1 transition shadow-xs cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>បន្ថែម</span>
            </button>
          )}
        </div>

        <div className="page-fill-body">
          {isLoading && customers.length === 0 ? (
            <div className="p-12 flex items-center justify-center gap-2 text-xs text-slate-500 font-semibold">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>កំពុងទាញព័ត៌មានអតិថិជន...</span>
            </div>
          ) : loadError && customers.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <AlertCircle className="w-10 h-10 mx-auto text-rose-400" />
              <p className="font-bold text-sm text-slate-600 dark:text-slate-300">មិនអាចទាញទិន្នន័យបាន</p>
              <p className="text-xs text-slate-400">{loadError}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Contact className="w-10 h-10 mx-auto opacity-30" />
              <p className="font-bold text-sm text-slate-600 dark:text-slate-300">
                {customers.length === 0 ? 'មិនទាន់មានអតិថិជននៅឡើយទេ' : 'រកមិនឃើញអតិថិជនដែលត្រូវនឹងការស្វែងរក'}
              </p>
              {customers.length === 0 && canSave && (
                <p className="text-xs text-slate-400">សូមចុចប៊ូតុង «+ បន្ថែម» ឬ «Import» ពី File Excel ដើម្បីចុះឈ្មោះអតិថិជន។</p>
              )}
              {customers.length === 0 && canImport && (
                <button
                  type="button"
                  onClick={() => downloadCustomerTemplate()}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  ទាញយកគំរូ Excel (Template)
                </button>
              )}
            </div>
          ) : (
            <>
              {isDesktop ? (
              /* Desktop table */
              <div className="page-fill-body space-y-1.5">
                {selection.count > 0 && (
                  <GridSelectionBar
                    count={selection.count}
                    onCopy={() => copyRowsAsTsv(...selectedMatrix())}
                    onExport={() => exportRowsAsCsv('customers_selected', ...selectedMatrix())}
                    onClear={selection.clear}
                  >
                    {canDelete && (
                      <button
                        type="button"
                        onClick={handleBulkDelete}
                        disabled={bulkDeleting}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                      >
                        <Trash2 className="w-3 h-3" />
                        {bulkDeleting ? 'កំពុងលុប...' : `លុប (${selection.count})`}
                      </button>
                    )}
                  </GridSelectionBar>
                )}
                <div ref={scrollRef} className={`page-fill-scroll ${gridWrap} max-h-[calc(100vh-300px)]`}>
                  <table className={gridTable}>
                    <thead>
                      <tr>
                        <GridHeadGutter checked={selection.allChecked} indeterminate={selection.someChecked} onToggleAll={selection.toggleAll} />
                        <th className={`${gridTh()} min-w-[100px]`}><span className="font-medium">លេខកូដ</span></th>
                        <th className={`${gridTh()} min-w-[220px]`}><span className="font-medium">ឈ្មោះអតិថិជន</span></th>
                        <th className={`${gridTh()} min-w-[130px]`}><span className="font-medium">ឈ្មោះហៅក្រៅ</span></th>
                        <th className={`${gridTh()} min-w-[150px]`}><span className="font-medium">ប្រភេទ</span></th>
                        <th className={`${gridTh()} min-w-[140px]`}><span className="font-medium">លេខទូរស័ព្ទ</span></th>
                        <th className={`${gridTh()} min-w-[160px]`}><span className="font-medium">Email / Telegram</span></th>
                        <th className={`${gridTh()} min-w-[220px]`}><span className="font-medium">អាសយដ្ឋាន</span></th>
                        <th className={`${gridTh()} min-w-[140px]`}><span className="font-medium">Sale handle</span></th>
                        <th className={`${gridTh()} min-w-[110px]`}><span className="font-medium">ស្ថានភាព</span></th>
                        <th className={`${gridTh()} text-right min-w-[80px]`}><span className="font-medium">សកម្មភាព</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((c, idx) => (
                        <CustomerTableRow
                          key={c.id}
                          c={c}
                          idx={idx}
                          selected={selection.selected.has(c.id)}
                          canSave={canSave}
                          canDelete={canDelete}
                          onSelect={selection.toggle}
                          onEdit={onEditRow}
                          onDelete={onDeleteRow}
                          onToggleStatus={onToggleStatusRow}
                        />
                      ))}
                    </tbody>
                  </table>
                  {hasMore && (
                    <div ref={sentinelRef} className="py-2 text-center text-[11px] text-slate-400">
                      បង្ហាញ {visibleRows.length} / {filtered.length} • កំពុងផ្ទុកបន្ថែម...
                    </div>
                  )}
                </div>
              </div>
              ) : (
              /* Mobile cards */
              <div className="p-2 space-y-2 bg-slate-50 dark:bg-slate-950/40">
                {visibleRows.map((c, idx) => (
                  <CustomerCard
                    key={c.id}
                    c={c}
                    idx={idx}
                    canSave={canSave}
                    canDelete={canDelete}
                    onEdit={onEditRow}
                    onDelete={onDeleteRow}
                    onToggleStatus={onToggleStatusRow}
                  />
                ))}
                {hasMore && (
                  <div ref={sentinelRef} className="py-3 text-center text-[11px] text-slate-400">
                    បង្ហាញ {visibleRows.length} / {filtered.length} • កំពុងផ្ទុកបន្ថែម...
                  </div>
                )}
              </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Excel import preview */}
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full max-h-[92vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">នាំចូលអតិថិជនពី Excel</h3>
                  <p className="text-[11px] text-slate-400 truncate">{importPreview.fileName}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={!!importProgress}
                onClick={() => setImportPreview(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800">
                  {importPreview.rows.length} ជួរនឹងនាំចូល
                </span>
                {importPreview.missingName > 0 && (
                  <span className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800">
                    {importPreview.missingName} ជួរគ្មានឈ្មោះ (រំលង)
                  </span>
                )}
                {importPreview.ignoredHeaders.length > 0 && (
                  <span
                    className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700"
                    title={importPreview.ignoredHeaders.join(', ')}
                  >
                    ជួរឈរមិនស្គាល់ (មិនយក)៖ {importPreview.ignoredHeaders.slice(0, 4).join(', ')}
                    {importPreview.ignoredHeaders.length > 4 ? '…' : ''}
                  </span>
                )}
              </div>

              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                ជួរដែលមាន <b>លេខកូដ</b> ដូចអតិថិជនមានស្រាប់ នឹង<b>កែប្រែ</b>អតិថិជននោះ។ ជួរគ្មានលេខកូដ ដែលមាន<b>ឈ្មោះ + លេខទូរស័ព្ទ</b>ដូចមានស្រាប់ នឹងត្រូវរំលង (មិនបង្កើតស្ទួន)។
              </p>

              <div className={`${gridWrap} max-h-[45vh]`}>
                <table className={gridTable}>
                  <thead>
                    <tr>
                      {['#', 'លេខកូដ', 'ឈ្មោះ', 'ឈ្មោះហៅក្រៅ', 'ប្រភេទ', 'ទូរស័ព្ទ', 'ខេត្ត', 'Sale handle', 'ស្ថានភាព'].map((h) => (
                        <th key={h} className={gridTh(true)}><span className="font-medium">{h}</span></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.slice(0, 50).map((c, idx) => (
                      <tr key={idx} className={gridRow}>
                        <td className={`${gridTd(true)} text-slate-400 font-mono`}>{idx + 1}</td>
                        <td className={`${gridTd(true)} font-mono`}>{c.customer_code || <span className="text-slate-400 italic">Auto</span>}</td>
                        <td className={`${gridTd(true)} font-medium`}>{c.name}</td>
                        <td className={gridTd(true)}>{c.nickname || gridNull}</td>
                        <td className={gridTd(true)}>{(TYPE_MAP[c.customer_type] || TYPE_MAP.INDIVIDUAL).short}</td>
                        <td className={`${gridTd(true)} font-mono`}>{c.phone || gridNull}</td>
                        <td className={gridTd(true)}>{c.province || gridNull}</td>
                        <td className={gridTd(true)}>{c.sale_handle || gridNull}</td>
                        <td className={gridTd(true)}>{c.status === 'ACTIVE' ? 'សកម្ម' : 'ផ្អាក'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importPreview.rows.length > 50 && (
                <p className="text-[11px] text-slate-400">បង្ហាញ 50 ជួរដំបូង ក្នុងចំណោម {importPreview.rows.length}</p>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => downloadCustomerTemplate()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline cursor-pointer mr-auto"
              >
                <Download className="w-3.5 h-3.5" />
                ទាញយកគំរូ Excel
              </button>
              <button
                type="button"
                disabled={!!importProgress}
                onClick={() => setImportPreview(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40"
              >
                បោះបង់
              </button>
              <button
                type="button"
                disabled={!!importProgress}
                onClick={handleConfirmImport}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-md flex items-center gap-1.5 disabled:opacity-70"
              >
                {importProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                <span>{importProgress ? `កំពុងនាំចូល ${importProgress}` : `នាំចូល ${importPreview.rows.length} អតិថិជន`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[94vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Contact className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight truncate">
                    {editing.id ? 'កែប្រែព័ត៌មានអតិថិជន' : 'ចុះឈ្មោះអតិថិជនថ្មី'}
                    {editing.id && editing.customer_code && (
                      <span className="ml-1.5 font-mono text-[11px] font-semibold text-slate-400">#{editing.customer_code}</span>
                    )}
                  </h3>
                  <p className="text-[10.5px] text-slate-400 leading-tight">រក្សាទុកក្នុង Hostinger Master Database</p>
                </div>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 text-xs">
              <div className="p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-6 gap-x-3 gap-y-2.5">
                {/* Identity */}
                <div className="col-span-2 sm:col-span-3">
                  <label className={`${labelCls} flex items-center gap-1`}><Building className="w-3 h-3 text-slate-400" />ក្រុមហ៊ុន / ហាង</label>
                  <input type="text" value={editing.company || ''} onChange={(e) => setField('company', e.target.value)} placeholder="ឧ. ABC Co., Ltd" className={`${inputCls} font-semibold`} />
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label className={`${labelCls} flex items-center gap-1`}><User className="w-3 h-3 text-slate-400" />ឈ្មោះអតិថិជន <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={editing.name}
                    onChange={(e) => setField('name', e.target.value)}
                    placeholder="ឧ. លោក សុខា"
                    className={`${inputCls} font-semibold`}
                  />
                </div>

                <div className="col-span-2 sm:col-span-3">
                  <label className={`${labelCls} flex items-center gap-1`}><User className="w-3 h-3 text-slate-400" />ឈ្មោះហៅក្រៅ (Nickname)</label>
                  <input type="text" value={editing.nickname || ''} onChange={(e) => setField('nickname', e.target.value)} placeholder="ឧ. បងសុខ" className={inputCls} />
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label className={labelCls}>លេខកូដ</label>
                  <input
                    type="text"
                    value={editing.customer_code || ''}
                    onChange={(e) => setField('customer_code', e.target.value)}
                    placeholder="Auto (CUS-…)"
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className={labelCls}>ប្រភេទ</label>
                  <select
                    value={editing.customer_type}
                    onChange={(e) => setField('customer_type', e.target.value as CustomerType)}
                    className={`${inputCls} cursor-pointer`}
                  >
                    {(Object.keys(TYPE_MAP) as CustomerType[]).map((t) => (
                      <option key={t} value={t}>{TYPE_MAP[t].label}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className={labelCls}>ស្ថានភាព</label>
                  <select
                    value={editing.status}
                    onChange={(e) => setField('status', e.target.value as CustomerStatus)}
                    className={`${inputCls} cursor-pointer font-semibold ${editing.status === 'ACTIVE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}
                  >
                    <option value="ACTIVE">● សកម្ម (Active)</option>
                    <option value="INACTIVE">○ ផ្អាក (Inactive)</option>
                  </select>
                </div>

                {/* Contact */}
                <div className="col-span-2 sm:col-span-6 flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">ទំនាក់ទំនង</span>
                  <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                </div>
                <div className="sm:col-span-2">
                  <label className={`${labelCls} flex items-center gap-1`}><Phone className="w-3 h-3 text-slate-400" />លេខទូរស័ព្ទ</label>
                  <input type="tel" value={editing.phone || ''} onChange={(e) => setField('phone', e.target.value)} placeholder="012 345 678" className={`${inputCls} font-mono`} />
                </div>
                <div className="sm:col-span-2">
                  <label className={`${labelCls} flex items-center gap-1`}><Phone className="w-3 h-3 text-slate-400" />លេខទូរស័ព្ទទី ២</label>
                  <input type="tel" value={editing.phone2 || ''} onChange={(e) => setField('phone2', e.target.value)} className={`${inputCls} font-mono`} />
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <label className={`${labelCls} flex items-center gap-1`}><Send className="w-3 h-3 text-slate-400" />Telegram</label>
                  <input type="text" value={editing.telegram || ''} onChange={(e) => setField('telegram', e.target.value)} placeholder="@username" className={inputCls} />
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label className={`${labelCls} flex items-center gap-1`}><Mail className="w-3 h-3 text-slate-400" />Email</label>
                  <input type="email" value={editing.email || ''} onChange={(e) => setField('email', e.target.value)} placeholder="name@example.com" className={inputCls} />
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label className={`${labelCls} flex items-center gap-1`}><MapPin className="w-3 h-3 text-slate-400" />ខេត្ត / ក្រុង</label>
                  <input type="text" value={editing.province || ''} onChange={(e) => setField('province', e.target.value)} placeholder="ឧ. ភ្នំពេញ" className={inputCls} />
                </div>
                <div className="col-span-2 sm:col-span-6">
                  <label className={labelCls}>អាសយដ្ឋាន</label>
                  <input type="text" value={editing.address || ''} onChange={(e) => setField('address', e.target.value)} placeholder="ផ្ទះលេខ, ផ្លូវ, សង្កាត់, ខណ្ឌ..." className={inputCls} />
                </div>

                {/* Other */}
                <div className="col-span-2 sm:col-span-6 flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">ផ្សេងៗ</span>
                  <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label className={`${labelCls} flex items-center gap-1`}><BadgeCheck className="w-3 h-3 text-slate-400" />Sale handle</label>
                  <select
                    value={editing.sale_linked !== false && editing.sale_user_id ? editing.sale_user_id : ''}
                    onChange={(e) => {
                      const u = saleUsers.find((x) => x.user_id === e.target.value);
                      setEditing((prev) =>
                        prev ? { ...prev, sale_user_id: u?.user_id || null, sale_handle: u ? u.name || u.email : null, sale_linked: Boolean(u) } : prev
                      );
                    }}
                    className={`${inputCls} cursor-pointer`}
                  >
                    <option value="">— គ្មាន Sale —</option>
                    {saleUsers
                      .filter((u) => u.status === 'ACTIVE' || u.user_id === editing.sale_user_id)
                      .map((u) => (
                        <option key={u.user_id} value={u.user_id}>
                          {u.name || u.email}{u.name && u.email ? ` — ${u.email}` : ''}{u.status !== 'ACTIVE' ? ' (ផ្អាក)' : ''}
                        </option>
                      ))}
                  </select>
                  {editing.sale_handle && (!editing.sale_user_id || editing.sale_linked === false) && (
                    <p className="mt-1 text-[10.5px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      «{editing.sale_handle}» មិនទាន់ភ្ជាប់គណនី — សូមជ្រើសរើសខាងលើ
                    </p>
                  )}
                  {saleUsers.length === 0 && (
                    <p className="mt-1 text-[10.5px] text-slate-400">មិនទាន់មានគណនី (បង្កើតនៅទំព័រ Permissions)</p>
                  )}
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label className={labelCls}>កំណត់ចំណាំ</label>
                  <textarea rows={1} value={editing.notes || ''} onChange={(e) => setField('notes', e.target.value)} placeholder="ចំណាំបន្ថែម..." className={`${inputCls} h-auto resize-y min-h-[34px]`} />
                </div>
              </div>

              <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  បោះបង់
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{editing.id ? 'រក្សាទុកការកែប្រែ' : 'បន្ថែមអតិថិជន'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
