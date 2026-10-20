import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const TYPE_MAP: Record<CustomerType, { label: string; icon: any; color: string }> = {
  INDIVIDUAL: { label: 'បុគ្គល (Individual)', icon: User, color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800' },
  BUSINESS: { label: 'ក្រុមហ៊ុន (Business)', icon: Building, color: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800' },
};

const EMPTY_FORM: Customer = {
  customer_code: '',
  name: '',
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
  'w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600';
const labelCls = 'block font-bold text-slate-700 dark:text-slate-300 mb-1';

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
      setCustomers(list);
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
    let business = 0;
    customers.forEach((c) => {
      if (c.status === 'ACTIVE') active++;
      if (c.customer_type === 'BUSINESS') business++;
    });
    return { total: customers.length, active, business, individual: customers.length - business };
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

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return customers.filter((c) => {
      if (typeFilter !== 'ALL' && c.customer_type !== typeFilter) return false;
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (saleFilter === 'NONE' && c.sale_handle) return false;
      if (saleFilter === 'UNLINKED' && !(c.sale_handle && !c.sale_linked)) return false;
      if (!['ALL', 'NONE', 'UNLINKED'].includes(saleFilter) && !(c.sale_linked && c.sale_user_id === saleFilter)) return false;
      if (!q) return true;
      return [c.customer_code, c.name, c.company, c.phone, c.phone2, c.email, c.telegram, c.address, c.province, c.sale_handle, c.notes]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [customers, searchTerm, typeFilter, statusFilter, saleFilter]);

  const selection = useRowSelection(useMemo(() => filtered.map((c) => c.id), [filtered]));

  const toMatrix = (rows: Customer[]): [string[], any[][]] => [
    ['Code', 'Name', 'Company', 'Type', 'Phone', 'Phone 2', 'Email', 'Telegram', 'Address', 'Province', 'Sale_Handle', 'Status', 'Notes', 'Created_At'],
    rows.map((c) => [
      c.customer_code || '', c.name, c.company || '', c.customer_type, c.phone || '', c.phone2 || '', c.email || '',
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
      setCustomers(await saveCustomer(editing));
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
      setCustomers(result.customers);
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
    try {
      setCustomers(await saveCustomer({ ...c, status: c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }));
    } catch (err: any) {
      onShowToast(err?.message || 'Update failed', 'error');
    }
  };

  const handleDelete = async (c: Customer) => {
    if (!c.id || !window.confirm(`តើអ្នកពិតជាចង់លុបអតិថិជន «${c.name}» មែនទេ?`)) return;
    try {
      setCustomers(await deleteCustomer(c.id));
      onShowToast('✓ បានលុបអតិថិជន', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Delete failed', 'error');
    }
  };

  const setField = <K extends keyof Customer>(key: K, value: Customer[K]) =>
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));

  const statusPill = (c: Customer) => {
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
        onClick={() => handleToggleStatus(c)}
        title="ចុចដើម្បីប្តូរស្ថានភាព"
        className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[11px] font-medium cursor-pointer transition hover:opacity-80 ${cls}`}
      >
        {content}
      </button>
    ) : (
      <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[11px] font-medium ${cls}`}>{content}</span>
    );
  };

  const rowActions = (c: Customer) => (
    <div className="flex items-center justify-end gap-0.5">
      {canSave && (
        <button
          type="button"
          onClick={() => setEditing({ ...EMPTY_FORM, ...c })}
          className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          title="កែប្រែ"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={() => handleDelete(c)}
          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
          title="លុប"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

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
        <div className="px-2.5 sm:px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex flex-wrap items-center gap-2">
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

          <div className="order-3 w-full lg:w-auto lg:flex-1 lg:min-w-[180px] relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ស្វែងរកតាមឈ្មោះ, លេខកូដ, ទូរស័ព្ទ, អាសយដ្ឋាន..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-7 h-8 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600"
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

          <div className="order-4 w-full lg:w-auto overflow-x-auto scrollbar-none flex items-center gap-1.5">
            <div className="inline-flex items-center gap-1 bg-white dark:bg-slate-800/90 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px]">
              <button type="button" onClick={() => setTypeFilter('ALL')} className={pill(typeFilter === 'ALL', 'bg-blue-600')}>
                ទាំងអស់ ({stats.total})
              </button>
              <button type="button" onClick={() => setTypeFilter('INDIVIDUAL')} className={pill(typeFilter === 'INDIVIDUAL', 'bg-blue-600')}>
                បុគ្គល ({stats.individual})
              </button>
              <button type="button" onClick={() => setTypeFilter('BUSINESS')} className={pill(typeFilter === 'BUSINESS', 'bg-indigo-600')}>
                ក្រុមហ៊ុន ({stats.business})
              </button>
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

          <div className="order-2 lg:order-5 ml-auto lg:ml-0 flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={load}
              disabled={isLoading}
              className="h-8 px-2 rounded-lg border border-emerald-200/80 dark:border-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1 transition shadow-2xs cursor-pointer disabled:opacity-50 shrink-0"
              title="ទាញទិន្នន័យថ្មីពី Hostinger Master Database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Live</span>
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
            {canSave && (
              <button
                type="button"
                onClick={openCreate}
                className="h-8 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-semibold flex items-center justify-center gap-1 transition shadow-xs cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>បន្ថែម</span>
              </button>
            )}
          </div>
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
              {/* Desktop table */}
              <div className="page-fill-body hidden lg:block space-y-1.5">
                {selection.count > 0 && (
                  <GridSelectionBar
                    count={selection.count}
                    onCopy={() => copyRowsAsTsv(...selectedMatrix())}
                    onExport={() => exportRowsAsCsv('customers_selected', ...selectedMatrix())}
                    onClear={selection.clear}
                  />
                )}
                <div className={`page-fill-scroll ${gridWrap} max-h-[calc(100vh-300px)]`}>
                  <table className={gridTable}>
                    <thead>
                      <tr>
                        <GridHeadGutter checked={selection.allChecked} indeterminate={selection.someChecked} onToggleAll={selection.toggleAll} />
                        <th className={`${gridTh()} min-w-[100px]`}><span className="font-medium">លេខកូដ</span></th>
                        <th className={`${gridTh()} min-w-[220px]`}><span className="font-medium">ឈ្មោះអតិថិជន</span></th>
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
                      {filtered.map((c, idx) => {
                        const typeInfo = TYPE_MAP[c.customer_type] || TYPE_MAP.INDIVIDUAL;
                        const TypeIcon = typeInfo.icon;
                        const isSelected = selection.isSelected(c.id);
                        return (
                          <tr key={c.id} className={`${gridRow} ${isSelected ? gridRowSelected : ''}`}>
                            <GridRowGutter selected={isSelected} rowNumber={idx + 1} onToggle={() => selection.toggle(c.id)} />
                            <td className={`${gridTd()} font-mono text-slate-600 dark:text-slate-300`}>{c.customer_code || gridNull}</td>
                            <td className={gridTd()}>
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center font-semibold text-[11px] shrink-0">
                                  {c.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-medium text-slate-900 dark:text-slate-100">{c.name}</div>
                                  {(c.company || c.notes) && (
                                    <div className="text-[11px] text-slate-400 truncate max-w-[220px]" title={c.notes || ''}>
                                      {[c.company, c.notes].filter(Boolean).join(' · ')}
                                    </div>
                                  )}
                                </div>
                              </div>
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
                              {c.address || c.province ? (
                                <span className="block truncate max-w-[260px]" title={[c.address, c.province].filter(Boolean).join(', ')}>
                                  {[c.address, c.province].filter(Boolean).join(', ')}
                                </span>
                              ) : gridNull}
                            </td>
                            <td className={gridTd()}>
                              {c.sale_handle ? <SaleBadge c={c} /> : gridNull}
                            </td>
                            <td className={gridTd()}>{statusPill(c)}</td>
                            <td className={`${gridTd()} text-right`}>{rowActions(c)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
                {filtered.map((c, idx) => {
                  const typeInfo = TYPE_MAP[c.customer_type] || TYPE_MAP.INDIVIDUAL;
                  const TypeIcon = typeInfo.icon;
                  return (
                    <div key={c.id} className="p-2.5 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-slate-400 font-mono text-xs font-semibold shrink-0">{idx + 1}.</span>
                          <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm truncate">{c.name}</span>
                          <span className={`inline-flex items-center gap-1 px-1.5 rounded text-[9.5px] font-bold border shrink-0 ${typeInfo.color}`}>
                            <TypeIcon className="w-2.5 h-2.5" />
                            <span>{typeInfo.label.split(' ')[0]}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {statusPill(c)}
                          {rowActions(c)}
                        </div>
                      </div>
                      <div className="pl-5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {c.customer_code && <span className="font-mono">{c.customer_code}</span>}
                        {c.phone && (
                          <a href={`tel:${c.phone}`} className="font-mono text-slate-700 dark:text-slate-300 flex items-center gap-1 font-semibold">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {c.phone}
                          </a>
                        )}
                        {c.company && (
                          <span className="flex items-center gap-1"><Building className="w-3 h-3 text-slate-400" />{c.company}</span>
                        )}
                        {c.sale_handle && <SaleBadge c={c} />}
                        {(c.address || c.province) && (
                          <span className="flex items-center gap-1 min-w-0">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[220px]">{[c.address, c.province].filter(Boolean).join(', ')}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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
                      {['#', 'លេខកូដ', 'ឈ្មោះ', 'ប្រភេទ', 'ទូរស័ព្ទ', 'ខេត្ត', 'Sale handle', 'ស្ថានភាព'].map((h) => (
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
                        <td className={gridTd(true)}>{c.customer_type === 'BUSINESS' ? 'ក្រុមហ៊ុន' : 'បុគ្គល'}</td>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full max-h-[92vh] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Contact className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    {editing.id ? 'កែប្រែព័ត៌មានអតិថិជន' : 'ចុះឈ្មោះអតិថិជនថ្មី'}
                  </h3>
                  <p className="text-[11px] text-slate-400">រក្សាទុកក្នុង Hostinger Master Database</p>
                </div>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3 text-xs overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>ឈ្មោះអតិថិជន <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={editing.name}
                    onChange={(e) => setField('name', e.target.value)}
                    placeholder="ឧ. លោក សុខា"
                    className={`${inputCls} font-bold`}
                  />
                </div>
                <div>
                  <label className={labelCls}>លេខកូដ</label>
                  <input
                    type="text"
                    value={editing.customer_code || ''}
                    onChange={(e) => setField('customer_code', e.target.value)}
                    placeholder="Auto (CUS-…)"
                    className={`${inputCls} font-mono`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>ប្រភេទ</label>
                  <select
                    value={editing.customer_type}
                    onChange={(e) => setField('customer_type', e.target.value as CustomerType)}
                    className={`${inputCls} font-bold cursor-pointer`}
                  >
                    <option value="INDIVIDUAL">{TYPE_MAP.INDIVIDUAL.label}</option>
                    <option value="BUSINESS">{TYPE_MAP.BUSINESS.label}</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>ក្រុមហ៊ុន / ហាង</label>
                  <input type="text" value={editing.company || ''} onChange={(e) => setField('company', e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`${labelCls} flex items-center gap-1`}><Phone className="w-3.5 h-3.5 text-slate-400" />លេខទូរស័ព្ទ</label>
                  <input type="tel" value={editing.phone || ''} onChange={(e) => setField('phone', e.target.value)} placeholder="012 345 678" className={`${inputCls} font-mono`} />
                </div>
                <div>
                  <label className={labelCls}>លេខទូរស័ព្ទទី ២</label>
                  <input type="tel" value={editing.phone2 || ''} onChange={(e) => setField('phone2', e.target.value)} className={`${inputCls} font-mono`} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`${labelCls} flex items-center gap-1`}><Mail className="w-3.5 h-3.5 text-slate-400" />Email</label>
                  <input type="email" value={editing.email || ''} onChange={(e) => setField('email', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={`${labelCls} flex items-center gap-1`}><Send className="w-3.5 h-3.5 text-slate-400" />Telegram</label>
                  <input type="text" value={editing.telegram || ''} onChange={(e) => setField('telegram', e.target.value)} placeholder="@username" className={inputCls} />
                </div>
              </div>

              <div>
                <label className={`${labelCls} flex items-center gap-1`}><MapPin className="w-3.5 h-3.5 text-slate-400" />អាសយដ្ឋាន</label>
                <textarea rows={2} value={editing.address || ''} onChange={(e) => setField('address', e.target.value)} placeholder="ផ្ទះលេខ, ផ្លូវ, សង្កាត់, ខណ្ឌ..." className={inputCls} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>ខេត្ត / ក្រុង</label>
                  <input type="text" value={editing.province || ''} onChange={(e) => setField('province', e.target.value)} placeholder="ឧ. ភ្នំពេញ" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>ស្ថានភាព</label>
                  <select
                    value={editing.status}
                    onChange={(e) => setField('status', e.target.value as CustomerStatus)}
                    className={`${inputCls} font-bold cursor-pointer`}
                  >
                    <option value="ACTIVE">សកម្ម (Active)</option>
                    <option value="INACTIVE">ផ្អាក (Inactive)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={`${labelCls} flex items-center gap-1`}><BadgeCheck className="w-3.5 h-3.5 text-slate-400" />Sale handle (គណនីអ្នកប្រើប្រាស់)</label>
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
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    «{editing.sale_handle}» មិនទាន់ភ្ជាប់គណនីណាមួយទេ — សូមជ្រើសរើសគណនីខាងលើ
                  </p>
                )}
                {saleUsers.length === 0 && (
                  <p className="mt-1 text-[11px] text-slate-400">មិនទាន់មានគណនីអ្នកប្រើប្រាស់ (បង្កើតនៅទំព័រ Permissions)</p>
                )}
              </div>

              <div>
                <label className={labelCls}>កំណត់ចំណាំ</label>
                <textarea rows={2} value={editing.notes || ''} onChange={(e) => setField('notes', e.target.value)} className={inputCls} />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  បោះបង់
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-1/2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-md flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
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
