import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Database,
  Download,
  ExternalLink,
  FileCheck,
  FolderOpen,
  ImagePlus,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  ScanLine,
  Search,
  Ticket,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { AppSettings, AuthUser, Payer } from '../types';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { compressImageToWebP } from '../utils/compression';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import { playScanSound, playWarningSound } from '../utils/scannerSound';
import { downloadCsv, formatCsv } from '../utils/csvHelper';
import {
  BarcodeLookup,
  HandoverCurrency,
  HandoverPage,
  InvoiceHandover,
  WAREHOUSE_STEP_LABEL,
  buildLinkInfo,
  deleteHandover,
  driveThumb,
  driveView,
  fetchHandovers,
  lookupHandoverBarcode,
  saveHandover,
} from '../services/invoiceHandoverService';

interface InvoiceHandoverPageProps {
  currentUser: AuthUser | null;
  /** Company Staff — the person handing the invoice over */
  payers?: Payer[];
  settings: AppSettings;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1RsAso9t-Y4TQF4OF95wjhEpxzEWZaYw0';
const STAFF_KEY = 'inv_handover_staff';
const PAGE_SIZE = 100;
const POLL_MS = 30_000;

type DatePreset = 'TODAY' | 'YESTERDAY' | 'MONTH' | 'ALL' | 'CUSTOM';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => ymd(new Date());
const showDate = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const showTime = (iso?: string | null) => {
  if (!iso) return '';
  const t = new Date(iso);
  return isNaN(t.getTime()) ? '' : `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
};
const money = (amount: number | null, currency: HandoverCurrency) => {
  if (amount === null || amount === undefined) return '—';
  return currency === 'KHR' ? `${Math.round(amount).toLocaleString()} ៛` : `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function rangeOf(preset: DatePreset, custom: { start: string; end: string }) {
  const now = new Date();
  if (preset === 'TODAY') return { startDate: todayStr(), endDate: todayStr() };
  if (preset === 'YESTERDAY') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { startDate: ymd(y), endDate: ymd(y) };
  }
  if (preset === 'MONTH') return { startDate: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: todayStr() };
  if (preset === 'CUSTOM') return { startDate: custom.start, endDate: custom.end };
  return { startDate: '', endDate: '' };
}

const inputCls =
  'w-full h-9 px-2.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-600';
const labelCls = 'block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-0.5';
const cardCls = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm';

/** One line describing what the system knew about the barcode. */
function LinkSummary({ h }: { h: InvoiceHandover }) {
  const i = h.linkInfo;
  if (!i) return <span className="text-[10.5px] text-amber-600 dark:text-amber-400">មិនមានក្នុងប្រព័ន្ធ</span>;
  return (
    <div className="space-y-0.5 text-[10.5px] leading-tight text-slate-600 dark:text-slate-400">
      {(i.shipper || i.consignee) && (
        <div className="truncate">
          {i.shipper || '—'} → <span className="font-semibold text-slate-800 dark:text-slate-200">{i.consignee || '—'}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {i.destination && <span className="px-1.5 rounded bg-slate-100 dark:bg-slate-800">{i.destination}</span>}
        {i.warehouseType && (
          <span className="px-1.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            {WAREHOUSE_STEP_LABEL[i.warehouseType] || i.warehouseType}
          </span>
        )}
        {i.prepCode && (
          <span className="px-1.5 rounded bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">{i.prepCode}</span>
        )}
      </div>
    </div>
  );
}

export const InvoiceHandoverPage: React.FC<InvoiceHandoverPageProps> = ({ currentUser, payers = [], settings, onShowToast }) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const myEmail = (currentUser?.email || '').toLowerCase().trim();

  // ── form ──
  const [editing, setEditing] = useState<InvoiceHandover | null>(null);
  const [staffName, setStaffName] = useState<string>(() => {
    try {
      return localStorage.getItem(STAFF_KEY) || '';
    } catch {
      return '';
    }
  });
  const [handoverDate, setHandoverDate] = useState(todayStr());
  const [barcode, setBarcode] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<HandoverCurrency>('USD');
  const [note, setNote] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const [lookup, setLookup] = useState<BarcodeLookup | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const lookupSeq = useRef(0);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── list ──
  const [data, setData] = useState<HandoverPage | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [staffFilter, setStaffFilter] = useState('');
  const [preset, setPreset] = useState<DatePreset>('TODAY');
  const [custom, setCustom] = useState({ start: todayStr(), end: todayStr() });
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<InvoiceHandover | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    try {
      if (staffName.trim()) localStorage.setItem(STAFF_KEY, staffName.trim());
    } catch {
      /* storage blocked */
    }
  }, [staffName]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debouncedSearch, staffFilter, preset, custom.start, custom.end]);

  // Active Company Staff, A→Z, one entry per name
  const staffOptions = useMemo(() => {
    const seen = new Set<string>();
    return payers
      .filter((p) => p.status !== 'INACTIVE' && p.name?.trim())
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((p) => {
        const k = p.name.trim().toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((p) => ({ value: p.name.trim(), label: [p.category, p.area, p.phone].filter(Boolean).join(' • ') }));
  }, [payers]);
  const staffKnown = !staffName.trim() || staffOptions.some((o) => o.value.toLowerCase() === staffName.trim().toLowerCase());

  const filters = useMemo(
    () => ({ search: debouncedSearch, staff: staffFilter, ...rangeOf(preset, custom) }),
    [debouncedSearch, staffFilter, preset, custom]
  );

  const loadList = useCallback(
    async (quiet = false) => {
      if (!quiet) setListBusy(true);
      try {
        const res = await fetchHandovers({ ...filters, page, pageSize: PAGE_SIZE });
        setData(res);
        setListError('');
      } catch (err: any) {
        if (!quiet) setListError(err?.message || 'មិនអាចទាញទិន្នន័យបានទេ');
      } finally {
        if (!quiet) setListBusy(false);
      }
    },
    [filters, page]
  );

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Keep the list fresh while the page is open (other devices saving)
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && !saving) loadList(true);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [loadList, saving]);

  // ── barcode lookup ──
  const runLookup = useCallback(
    async (raw: string) => {
      const code = sanitizeTrackingCode(raw).trim().toUpperCase();
      setBarcode(code);
      if (!code) {
        setLookup(null);
        return;
      }
      const seq = ++lookupSeq.current;
      setLookupBusy(true);
      try {
        const res = await lookupHandoverBarcode(code);
        if (seq !== lookupSeq.current) return;
        setLookup(res);
        const isSelf = editing && res.existing?.id === editing.id;
        if (res.existing && !isSelf) playWarningSound();
        else playScanSound();
      } catch (err: any) {
        if (seq !== lookupSeq.current) return;
        setLookup(null);
        onShowToast(err?.message || 'ស្វែងរក Barcode បរាជ័យ', 'error');
      } finally {
        if (seq === lookupSeq.current) setLookupBusy(false);
      }
    },
    [editing, onShowToast]
  );

  const duplicate = lookup?.existing && (!editing || lookup.existing.id !== editing.id) ? lookup.existing : null;
  const notFound = lookup && !lookup.dataReport && !lookup.warehouse.length && !lookup.invoice;

  // ── photo ──
  const handleImage = async (file?: File | null) => {
    if (!file) return;
    setImageBusy(true);
    try {
      const r = await compressImageToWebP(file, 1600, 0.82);
      setImage(r.dataUrl);
    } catch (err: any) {
      onShowToast(err?.message || 'មិនអាចអានរូបភាពបានទេ', 'error');
    } finally {
      setImageBusy(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const resetForm = (keepStaff = true) => {
    lookupSeq.current++;
    setEditing(null);
    setBarcode('');
    setAmount('');
    setCurrency('USD');
    setNote('');
    setImage(null);
    setLookup(null);
    setLookupBusy(false);
    setHandoverDate(todayStr());
    if (!keepStaff) setStaffName('');
    setTimeout(() => barcodeRef.current?.focus(), 50);
  };

  const startEdit = (h: InvoiceHandover) => {
    setEditing(h);
    setStaffName(h.staffName);
    setHandoverDate(h.handoverDate);
    setBarcode(h.barcode);
    setAmount(h.amount === null ? '' : String(h.amount));
    setCurrency(h.currency);
    setNote(h.note || '');
    setImage(null);
    setLookup(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const canSave =
    !saving && !imageBusy && !lookupBusy && !!barcode.trim() && !!staffName.trim() && (!!image || !!editing) && !duplicate;

  const handleSave = async () => {
    if (!barcode.trim()) return onShowToast('សូមស្កេន ឬបញ្ចូល Barcode', 'error');
    if (!staffName.trim()) return onShowToast('សូមជ្រើសរើសឈ្មោះអ្នកប្រគល់', 'error');
    if (!image && !editing) return onShowToast('សូមថតរូប ឬជ្រើសរូបភាពវិក័យប័ត្រ', 'error');
    if (duplicate) return onShowToast(`Barcode ${barcode} បានប្រគល់រួចហើយ`, 'error');
    const amountNum = amount.trim() === '' ? null : Number(amount.replace(/,/g, ''));
    if (amountNum !== null && (!isFinite(amountNum) || amountNum < 0)) return onShowToast('ចំនួនទឹកប្រាក់មិនត្រឹមត្រូវ', 'error');

    setSaving(true);
    try {
      // Make sure the link info belongs to this barcode (typed but Enter not pressed)
      let l = lookup && lookup.barcode === barcode ? lookup : null;
      if (!l) {
        try {
          l = await lookupHandoverBarcode(barcode);
        } catch {
          l = null;
        }
        if (l?.existing && (!editing || l.existing.id !== editing.id)) {
          setLookup(l);
          playWarningSound();
          onShowToast(`Barcode ${barcode} បានប្រគល់រួចហើយ`, 'error');
          return;
        }
      }
      const link = l ? buildLinkInfo(l) : editing ? { linkSource: editing.linkSource, linkInfo: editing.linkInfo } : { linkSource: null, linkInfo: null };
      const saved = await saveHandover(
        {
          id: editing?.id,
          barcode,
          staffName: staffName.trim(),
          handoverDate,
          amount: amountNum,
          currency,
          note: note.trim(),
          ...link,
        },
        image,
        settings.webAppUrl
      );
      onShowToast(editing ? `✓ បានកែប្រែ ${saved.barcode}` : `✓ បានរក្សាទុក ${saved.barcode} និងរូបភាពទៅ Google Drive`, 'success');
      resetForm(true);
      loadList(true);
    } catch (err: any) {
      onShowToast(err?.message || 'រក្សាទុកបរាជ័យ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const canDeleteRow = (h: InvoiceHandover) => isAdmin || (!!currentUser?.canDelete && (h.operatorEmail || '').toLowerCase() === myEmail);
  const canEditRow = (h: InvoiceHandover) =>
    isAdmin || (currentUser?.role !== 'VIEWER' && currentUser?.canEdit !== false && (h.operatorEmail || '').toLowerCase() === myEmail);

  const handleDelete = async (h: InvoiceHandover) => {
    if (!window.confirm(`លុបកំណត់ត្រា Barcode ${h.barcode} មែនទេ?\n(រូបភាពនៅតែរក្សាទុកក្នុង Google Drive)`)) return;
    try {
      await deleteHandover(h.id);
      onShowToast(`បានលុប ${h.barcode}`, 'success');
      if (editing?.id === h.id) resetForm(true);
      if (preview?.id === h.id) setPreview(null);
      loadList(true);
    } catch (err: any) {
      onShowToast(err?.message || 'លុបបរាជ័យ', 'error');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const all: InvoiceHandover[] = [];
      for (let p = 1; p <= 20; p++) {
        const res = await fetchHandovers({ ...filters, page: p, pageSize: 500 });
        all.push(...res.rows);
        if (all.length >= res.total || !res.rows.length) break;
      }
      const csv = formatCsv(
        ['Barcode', 'អ្នកប្រគល់', 'កាលបរិច្ឆេទ', 'ទឹកប្រាក់', 'រូបិយប័ណ្ណ', 'ចំណាំ', 'អ្នកផ្ញើ', 'អ្នកទទួល', 'ទិសដៅ', 'ឃ្លាំង', 'Prep Code', 'រូបភាព (Drive)', 'អ្នកកត់ត្រា', 'ពេលកត់ត្រា'],
        all.map((h) => [
          h.barcode,
          h.staffName,
          h.handoverDate,
          h.amount ?? '',
          h.currency,
          h.note,
          h.linkInfo?.shipper || '',
          h.linkInfo?.consignee || '',
          h.linkInfo?.destination || '',
          h.linkInfo?.warehouseType || '',
          h.linkInfo?.prepCode || '',
          driveView(h),
          h.createdBy || '',
          h.createdAt || '',
        ])
      );
      downloadCsv(`invoice_handover_${todayStr()}.csv`, csv);
    } catch (err: any) {
      onShowToast(err?.message || 'Export បរាជ័យ', 'error');
    } finally {
      setExporting(false);
    }
  };

  const rows = data?.rows || [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  // ── render ──
  return (
    <div className="space-y-3 pb-24 md:pb-6">
      {/* Header */}
      <div className={`${cardCls} p-3 flex flex-wrap items-center gap-3`}>
        <div className="w-9 h-9 rounded-lg bg-cyan-600 text-white flex items-center justify-center shrink-0">
          <FileCheck className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold text-slate-900 dark:text-white">ប្រគល់វិក័យប័ត្រ (Invoice Handover)</h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">ស្កេន Barcode · ថតរូបវិក័យប័ត្រ · រូបភាពរក្សាទុកក្នុង Google Drive</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold">
          <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
            <Database className="inline w-3 h-3 mr-1" />
            Hostinger
          </span>
          <a
            href={DRIVE_FOLDER_URL}
            target="_blank"
            rel="noreferrer"
            className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
          >
            <FolderOpen className="inline w-3 h-3 mr-1" />
            Google Drive
          </a>
        </div>
      </div>

      {/* Form */}
      <div className={`${cardCls} p-3 ${editing ? 'ring-2 ring-amber-400' : ''}`}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200">
            {editing ? (
              <span className="text-amber-600 dark:text-amber-400">
                <Pencil className="inline w-3.5 h-3.5 mr-1" />
                កំពុងកែប្រែ {editing.barcode}
              </span>
            ) : (
              'ទទួលវិក័យប័ត្រពីអ្នកប្រគល់'
            )}
          </h2>
          <button
            type="button"
            onClick={() => resetForm(true)}
            className="text-[11px] px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {editing ? 'បោះបង់ការកែ' : 'សម្អាត (Clear)'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-3">
          <div className="space-y-2.5 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_150px] gap-2">
              <div>
                <label className={labelCls}>
                  ឈ្មោះអ្នកប្រគល់ (Company Staff) <span className="text-rose-500">*</span>
                </label>
                <input
                  list="inv-handover-staff"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder={staffOptions.length ? `ជ្រើសពី Company Staff (${staffOptions.length})` : 'ឈ្មោះអ្នកប្រគល់'}
                  className={inputCls}
                />
                <datalist id="inv-handover-staff">
                  {staffOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </datalist>
                {!staffKnown && (
                  <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">ឈ្មោះនេះមិនមានក្នុង Company Staff ទេ</p>
                )}
              </div>
              <div>
                <label className={labelCls}>កាលបរិច្ឆេទ</label>
                <input type="date" value={handoverDate} onChange={(e) => setHandoverDate(e.target.value || todayStr())} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>
                Barcode <span className="text-rose-500">*</span>
              </label>
              <div className="flex gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <ScanLine className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={barcodeRef}
                    autoFocus
                    value={barcode}
                    onChange={(e) => {
                      setBarcode(e.target.value.toUpperCase());
                      if (lookup) setLookup(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        runLookup(barcode);
                      }
                    }}
                    onBlur={() => {
                      if (barcode.trim() && (!lookup || lookup.barcode !== barcode.trim().toUpperCase())) runLookup(barcode);
                    }}
                    placeholder="ស្កេន ឬវាយ Barcode រួចចុច Enter"
                    className={`${inputCls} pl-8 font-mono font-bold tracking-wide`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  title="ស្កេនដោយកាមេរ៉ា"
                  className="h-9 px-3 rounded-lg bg-slate-800 text-white text-xs font-bold flex items-center gap-1 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 shrink-0"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">ស្កេន</span>
                </button>
              </div>

              {/* What the system knows about this barcode */}
              {lookupBusy && (
                <div className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> កំពុងស្វែងរកក្នុងប្រព័ន្ធ...
                </div>
              )}
              {!lookupBusy && lookup && (
                <div className="mt-1.5 space-y-1.5">
                  {duplicate && (
                    <div className="p-2 rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <div>
                        <b>Barcode នេះបានប្រគល់រួចហើយ</b> ({showDate(duplicate.handoverDate)}
                        {duplicate.staffName ? ` · ${duplicate.staffName}` : ''}
                        {duplicate.createdBy ? ` · កត់ត្រាដោយ ${duplicate.createdBy}` : ''}). មួយ Barcode មានរូបតែមួយប៉ុណ្ណោះ។
                      </div>
                    </div>
                  )}
                  {notFound && !duplicate && (
                    <div className="p-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      រកមិនឃើញ Barcode នេះក្នុង Data Report, Warehouse ឬលេខវិក័យប័ត្រទេ — សូមពិនិត្យម្តងទៀត (នៅតែអាចរក្សាទុកបាន)។
                    </div>
                  )}
                  {!notFound && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5 text-[11px]">
                      {lookup.dataReport && (
                        <div className="p-2 rounded-lg border border-purple-200 bg-purple-50/60 dark:border-purple-900 dark:bg-purple-950/30">
                          <div className="font-bold text-purple-700 dark:text-purple-300 mb-0.5">Data Report</div>
                          <div className="text-slate-700 dark:text-slate-300 truncate">
                            {lookup.dataReport.shipper || '—'} → <b>{lookup.dataReport.consignee || '—'}</b>
                          </div>
                          <div className="text-slate-500 truncate">
                            {[lookup.dataReport.destination, lookup.dataReport.status].filter(Boolean).join(' · ')}
                          </div>
                          {(lookup.dataReport.codUsd || lookup.dataReport.codKhr) && (
                            <button
                              type="button"
                              onClick={() => {
                                const usd = parseFloat(String(lookup.dataReport!.codUsd).replace(/[^0-9.]/g, ''));
                                const khr = parseFloat(String(lookup.dataReport!.codKhr).replace(/[^0-9.]/g, ''));
                                if (usd > 0) {
                                  setAmount(String(usd));
                                  setCurrency('USD');
                                } else if (khr > 0) {
                                  setAmount(String(khr));
                                  setCurrency('KHR');
                                }
                              }}
                              className="mt-1 text-[10.5px] font-bold text-purple-700 dark:text-purple-300 underline"
                            >
                              COD: {[lookup.dataReport.codUsd && `$${lookup.dataReport.codUsd}`, lookup.dataReport.codKhr && `${lookup.dataReport.codKhr}៛`].filter(Boolean).join(' / ')} — ប្រើចំនួននេះ
                            </button>
                          )}
                        </div>
                      )}
                      {lookup.warehouse[0] && (
                        <div className="p-2 rounded-lg border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30">
                          <div className="font-bold text-blue-700 dark:text-blue-300 mb-0.5 flex items-center gap-1">
                            <Truck className="w-3 h-3" /> Warehouse
                          </div>
                          <div className="text-slate-700 dark:text-slate-300">
                            {WAREHOUSE_STEP_LABEL[lookup.warehouse[0].type] || lookup.warehouse[0].type}
                          </div>
                          <div className="text-slate-500 truncate">
                            {[showDate(lookup.warehouse[0].date), lookup.warehouse[0].person, lookup.warehouse[0].operationCode].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      )}
                      {lookup.invoice && (
                        <div className="p-2 rounded-lg border border-cyan-200 bg-cyan-50/60 dark:border-cyan-900 dark:bg-cyan-950/30">
                          <div className="font-bold text-cyan-700 dark:text-cyan-300 mb-0.5 flex items-center gap-1">
                            <Ticket className="w-3 h-3" /> លេខវិក័យប័ត្រ
                          </div>
                          <div className="text-slate-700 dark:text-slate-300">
                            {lookup.invoice.prepCode || 'គ្មាន Prep Code'} · {lookup.invoice.status}
                          </div>
                          <div className="text-slate-500 truncate">{lookup.invoice.customer || lookup.invoice.namePrepare || ''}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] gap-2">
              <div>
                <label className={labelCls}>ចំនួនទឹកប្រាក់</label>
                <div className="flex gap-1">
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="0.00"
                    className={`${inputCls} text-right font-semibold`}
                  />
                  <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
                    {(['USD', 'KHR'] as HandoverCurrency[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCurrency(c)}
                        className={`px-2 text-[11px] font-bold ${currency === c ? 'bg-cyan-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500'}`}
                      >
                        {c === 'USD' ? '$' : '៛'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className={labelCls}>ចំណាំ</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ចំណាំបន្ថែម (បើមាន)" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Photo */}
          <div>
            <label className={labelCls}>
              រូបភាពវិក័យប័ត្រ {!editing && <span className="text-rose-500">*</span>}
            </label>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImage(e.target.files?.[0])} />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImage(e.target.files?.[0])} />
            <div
              className="relative h-40 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex items-center justify-center overflow-hidden"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleImage(e.dataTransfer.files?.[0]);
              }}
            >
              {imageBusy ? (
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              ) : image ? (
                <>
                  <img src={image} alt="invoice" className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={() => setImage(null)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                    title="ដករូបចេញ"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : editing?.driveFileId ? (
                <>
                  <img src={driveThumb(editing.driveFileId, 600)} alt="invoice" className="w-full h-full object-contain opacity-80" />
                  <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">រូបចាស់ · ថតថ្មីដើម្បីប្តូរ</span>
                </>
              ) : (
                <div className="text-center text-[11px] text-slate-400 px-2">
                  <ImagePlus className="w-7 h-7 mx-auto mb-1" />
                  ថតរូប ឬអូសរូបមកទីនេះ
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="h-9 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold flex items-center justify-center gap-1"
              >
                <Camera className="w-3.5 h-3.5" /> ថតរូប
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <ImagePlus className="w-3.5 h-3.5" /> ជ្រើសរូប
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="h-10 w-full sm:w-auto px-6 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-bold flex items-center justify-center gap-1.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'កំពុងរក្សាទុក (Upload រូបទៅ Drive)...' : editing ? 'រក្សាទុកការកែប្រែ' : 'រក្សាទុក'}
          </button>
        </div>
      </div>

      {/* Filters & totals */}
      <div className={`${cardCls} p-2.5 space-y-2`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ស្វែងរក Barcode, ឈ្មោះ, ចំណាំ..." className={`${inputCls} pl-8`} />
          </div>
          <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px] font-bold">
            {([
              ['TODAY', 'ថ្ងៃនេះ'],
              ['YESTERDAY', 'ម្សិលមិញ'],
              ['MONTH', 'ខែនេះ'],
              ['ALL', 'ទាំងអស់'],
              ['CUSTOM', 'ជ្រើស'],
            ] as [DatePreset, string][]).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPreset(k)}
                className={`px-2.5 py-1 rounded-md ${preset === k ? 'bg-white dark:bg-slate-900 text-cyan-700 dark:text-cyan-300 shadow-sm' : 'text-slate-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {preset === 'CUSTOM' && (
            <div className="flex items-center gap-1">
              <input type="date" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} className={`${inputCls} w-36`} />
              <span className="text-slate-400 text-xs">→</span>
              <input type="date" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} className={`${inputCls} w-36`} />
            </div>
          )}
          <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className={`${inputCls} w-auto max-w-[200px]`}>
            <option value="">អ្នកប្រគល់ទាំងអស់</option>
            {staffOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => loadList()}
            title="ផ្ទុកឡើងវិញ"
            className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${listBusy ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || !data?.total}
            className="h-9 px-3 rounded-lg border border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Excel
          </button>
        </div>
        {data && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
            <span>
              សរុប: <b className="text-slate-900 dark:text-white">{data.total.toLocaleString()}</b> វិក័យប័ត្រ
            </span>
            <span>
              អ្នកប្រគល់: <b className="text-slate-900 dark:text-white">{data.staffCount}</b>
            </span>
            <span>
              USD: <b className="text-emerald-700 dark:text-emerald-400">{money(data.totalUsd, 'USD')}</b>
            </span>
            <span>
              KHR: <b className="text-emerald-700 dark:text-emerald-400">{money(data.totalKhr, 'KHR')}</b>
            </span>
          </div>
        )}
      </div>

      {/* List */}
      <div className={`${cardCls} overflow-hidden`}>
        {listError ? (
          <div className="p-6 text-center text-xs text-rose-600">
            {listError}
            <button type="button" onClick={() => loadList()} className="ml-2 underline font-bold">
              ព្យាយាមម្តងទៀត
            </button>
          </div>
        ) : !data && listBusy ? (
          <div className="p-10 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> កំពុងទាញទិន្នន័យ...
          </div>
        ) : !rows.length ? (
          <div className="p-10 text-center text-xs text-slate-500">
            <FileCheck className="w-7 h-7 mx-auto mb-2 text-slate-300" />
            មិនទាន់មានវិក័យប័ត្រក្នុងចន្លោះនេះទេ
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10.5px] text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="px-2 py-2 text-left w-8">#</th>
                    <th className="px-2 py-2 text-left w-16">រូបភាព</th>
                    <th className="px-2 py-2 text-left">Barcode</th>
                    <th className="px-2 py-2 text-left">ព័ត៌មានភ្ជាប់</th>
                    <th className="px-2 py-2 text-left">អ្នកប្រគល់</th>
                    <th className="px-2 py-2 text-right">ទឹកប្រាក់</th>
                    <th className="px-2 py-2 text-left">ចំណាំ</th>
                    <th className="px-2 py-2 text-left">កាលបរិច្ឆេទ</th>
                    <th className="px-2 py-2 text-right w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((h, i) => (
                    <tr key={h.id} className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${editing?.id === h.id ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                      <td className="px-2 py-1.5 text-slate-400">{(data!.page - 1) * data!.pageSize + i + 1}</td>
                      <td className="px-2 py-1.5">
                        {h.driveFileId ? (
                          <button type="button" onClick={() => setPreview(h)} className="block w-12 h-12 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100">
                            <img src={driveThumb(h.driveFileId)} alt="" loading="lazy" className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">{h.barcode}</td>
                      <td className="px-2 py-1.5 max-w-[260px]">
                        <LinkSummary h={h} />
                      </td>
                      <td className="px-2 py-1.5 font-semibold text-slate-800 dark:text-slate-200">{h.staffName}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">{money(h.amount, h.currency)}</td>
                      <td className="px-2 py-1.5 text-slate-600 dark:text-slate-400 max-w-[200px] truncate" title={h.note}>
                        {h.note || '—'}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <div className="text-slate-800 dark:text-slate-200">{showDate(h.handoverDate)}</div>
                        <div className="text-[10px] text-slate-400">
                          {showTime(h.createdAt)} · {h.createdBy}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        {canEditRow(h) && (
                          <button type="button" onClick={() => startEdit(h)} title="កែប្រែ" className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDeleteRow(h) && (
                          <button type="button" onClick={() => handleDelete(h)} title="លុប" className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((h) => (
                <div key={h.id} className="p-2.5 flex gap-2.5">
                  {h.driveFileId ? (
                    <button type="button" onClick={() => setPreview(h)} className="w-16 h-16 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 shrink-0">
                      <img src={driveThumb(h.driveFileId)} alt="" loading="lazy" className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <div className="w-16 h-16 rounded-md bg-slate-100 dark:bg-slate-800 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white truncate">{h.barcode}</span>
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">{money(h.amount, h.currency)}</span>
                    </div>
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{h.staffName}</div>
                    <LinkSummary h={h} />
                    {h.note && <div className="text-[10.5px] text-slate-500 truncate">{h.note}</div>}
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] text-slate-400">
                        {showDate(h.handoverDate)} {showTime(h.createdAt)} · {h.createdBy}
                      </span>
                      <span>
                        {canEditRow(h) && (
                          <button type="button" onClick={() => startEdit(h)} className="p-1 text-slate-500">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDeleteRow(h) && (
                          <button type="button" onClick={() => handleDelete(h)} className="p-1 text-rose-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40">
                  ‹
                </button>
                <span className="text-slate-500">
                  {page} / {totalPages}
                </span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40">
                  ›
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Photo preview */}
      {preview && preview.driveFileId && (
        <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-3" onClick={() => setPreview(null)}>
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-white text-xs mb-2 gap-2">
              <div className="min-w-0">
                <div className="font-mono font-bold truncate">{preview.barcode}</div>
                <div className="text-white/70 truncate">
                  {preview.staffName} · {showDate(preview.handoverDate)} · {money(preview.amount, preview.currency)}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a href={driveView(preview)} target="_blank" rel="noreferrer" className="px-2.5 py-1.5 rounded-md bg-white/15 hover:bg-white/25 flex items-center gap-1 font-bold">
                  <ExternalLink className="w-3.5 h-3.5" /> Drive
                </a>
                <button type="button" onClick={() => setPreview(null)} className="w-8 h-8 rounded-md bg-white/15 hover:bg-white/25 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <img src={driveThumb(preview.driveFileId, 1600)} alt="invoice" className="w-full max-h-[80vh] object-contain rounded-lg bg-black" />
          </div>
        </div>
      )}

      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        autoCloseOnScan={true}
        currentPayerName={staffName}
        onScanSuccess={(decoded) => {
          setScannerOpen(false);
          runLookup(decoded);
          return { success: true };
        }}
      />

      {saving && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[70] px-3 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold shadow-lg flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> កំពុង Upload រូបទៅ Google Drive...
        </div>
      )}
    </div>
  );
};

export default InvoiceHandoverPage;
