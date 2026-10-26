import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileCheck,
  FolderOpen,
  ImagePlus,
  Layers,
  Loader2,
  Pencil,
  Printer,
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
import { HandoverManifestGroup, HandoverManifestModal } from './HandoverManifestModal';
import { compressImageToWebP } from '../utils/compression';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import { playScanSound, playWarningSound } from '../utils/scannerSound';
import { downloadCsv, formatCsv } from '../utils/csvHelper';
import {
  BarcodeLookup,
  HandoverCurrency,
  HandoverLinkInfo,
  HandoverInput,
  HandoverPage,
  InvoiceHandover,
  WAREHOUSE_STEP_LABEL,
  buildLinkInfo,
  deleteHandover,
  driveThumb,
  driveView,
  fetchHandovers,
  saveHandoverBatch,
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
const GROUP_KEY = 'inv_handover_group_op';
// Large pages so a batch is rarely split across two pages
const PAGE_SIZE = 500;
const POLL_MS = 30_000;

/** A scanned invoice waiting in the batch table until "រក្សាទុកសរុប" */
interface StagedItem {
  key: number;
  barcode: string;
  staffName: string;
  handoverDate: string;
  amount: string;
  currency: HandoverCurrency;
  note: string;
  image: string | null;
  /** checking = lookup running; notfound = not in Data Report / Warehouse / Invoice Numbers (still saveable) */
  status: 'checking' | 'ok' | 'notfound' | 'duplicate' | 'error';
  message?: string;
  linkSource: string | null;
  linkInfo: HandoverLinkInfo | null;
}

const STAGE_KEY = 'inv_handover_batch_v1';
const parseAmount = (s: string) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')));

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
  'w-full h-10 sm:h-9 px-2.5 rounded-lg text-sm sm:text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-600';
const labelCls = 'block text-[11px] sm:text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-0.5';
const cardCls = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm';

/** Every handover row means the invoice was received from the staff member. */
function ReceivedBadge() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
      ✓ បានទទួល
    </span>
  );
}

/** Checkbox that can also show "some selected". */
function Check({ state, onChange }: { state: boolean | 'some'; onChange: () => void }) {
  return (
    <input
      type="checkbox"
      checked={state === true}
      ref={(el) => {
        if (el) el.indeterminate = state === 'some';
      }}
      onChange={onChange}
      className="w-3.5 h-3.5 accent-cyan-600 cursor-pointer align-middle"
    />
  );
}

/** A batch in the list: one Operation Code (older records: staff + date + operator). */
type ListGroup = HandoverManifestGroup & { usd: number; khr: number; riders: string; firstAt: string | null };

/** Rows → batches, in the order the rows came (newest first). */
function groupRows(rows: InvoiceHandover[]): ListGroup[] {
  const map = new Map<string, ListGroup>();
  for (const h of rows) {
    const key = h.operationCode || `__${(h.staffName || '').toUpperCase()}|${h.handoverDate}|${(h.operatorEmail || '').toLowerCase()}`;
    let g = map.get(key);
    if (!g) {
      g = { key, code: h.operationCode || '', date: h.handoverDate, staff: '', operator: h.createdBy || '', rows: [], usd: 0, khr: 0, riders: '', firstAt: h.createdAt };
      map.set(key, g);
    }
    g.rows.push(h);
    if (h.amount) {
      if (h.currency === 'KHR') g.khr += h.amount;
      else g.usd += h.amount;
    }
    if (h.createdAt && (!g.firstAt || h.createdAt < g.firstAt)) g.firstAt = h.createdAt;
  }
  const uniq = (v: (string | null | undefined)[]) => [...new Set(v.filter(Boolean) as string[])].join(', ');
  for (const g of map.values()) {
    g.staff = uniq(g.rows.map((r) => r.staffName));
    g.riders = uniq(g.rows.map((r) => r.linkInfo?.warehousePerson));
  }
  return [...map.values()];
}

/** One line describing what the system knew about the barcode. */
function LinkSummary({ info: i }: { info: HandoverLinkInfo | null }) {
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
  // ── batch table (scans wait here until "រក្សាទុកសរុប") ──
  const stageKey = `${STAGE_KEY}:${myEmail}`;
  const [staged, setStaged] = useState<StagedItem[]>(() => {
    try {
      const list = JSON.parse(localStorage.getItem(`${STAGE_KEY}:${myEmail}`) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  });
  const stagedKey = useRef(staged.reduce((m, s) => Math.max(m, s.key || 0), 0));
  const [batchSaving, setBatchSaving] = useState(false);
  const [photoUploads, setPhotoUploads] = useState(0);
  const [lastBatchCode, setLastBatchCode] = useState<string | null>(null);
  // Keep the batch if the page is refreshed (photos too, when the browser has room)
  useEffect(() => {
    try {
      localStorage.setItem(stageKey, JSON.stringify(staged));
    } catch {
      try {
        localStorage.setItem(stageKey, JSON.stringify(staged.map((s) => ({ ...s, image: null }))));
      } catch {
        /* storage blocked */
      }
    }
  }, [staged, stageKey]);

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
  const [groupMode, setGroupMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(GROUP_KEY) !== '0';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(GROUP_KEY, groupMode ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  }, [groupMode]);

  useEffect(() => {
    try {
      if (staffName.trim()) localStorage.setItem(STAFF_KEY, staffName.trim());
      else localStorage.removeItem(STAFF_KEY);
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
  const loadListRef = useRef(loadList);
  loadListRef.current = loadList;

  // ── batch table ──
  const patchStaged = useCallback((key: number, patch: Partial<StagedItem>) => {
    setStaged((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }, []);

  /** Look a staged barcode up: already handed over? what does the system know about it? */
  const checkStaged = useCallback(
    async (item: StagedItem) => {
      patchStaged(item.key, { status: 'checking', message: undefined });
      try {
        const l = await lookupHandoverBarcode(item.barcode);
        if (l.existing) {
          const ex = l.existing;
          playWarningSound();
          patchStaged(item.key, {
            status: 'duplicate',
            message: `បានប្រគល់រួចហើយ${ex.handoverDate ? ` (${showDate(ex.handoverDate)}${ex.staffName ? ` · ${ex.staffName}` : ''})` : ''}`,
          });
          return;
        }
        const link = buildLinkInfo(l);
        const notFound = !l.dataReport && !l.warehouse.length && !l.invoice;
        patchStaged(item.key, { status: notFound ? 'notfound' : 'ok', message: undefined, ...link });
      } catch (err: any) {
        patchStaged(item.key, { status: 'error', message: err?.message || 'ស្វែងរកមិនបាន (នៅតែរក្សាទុកបាន)' });
      }
    },
    [patchStaged]
  );

  // After a refresh, finish the checks that were still running
  useEffect(() => {
    staged.filter((s) => s.status === 'checking').forEach((s) => void checkStaged(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeStaged = (key: number) => setStaged((list) => list.filter((s) => s.key !== key));
  const clearStaged = () => {
    if (staged.length && !window.confirm(`លុបវិក័យប័ត្រទាំង ${staged.length} ចេញពី Batch មែនទេ? (មិនទាន់បានរក្សាទុក)`)) return;
    setStaged([]);
  };

  const stagedReady = staged.filter((s) => s.status === 'ok' || s.status === 'notfound' || s.status === 'error');
  const stagedChecking = staged.some((s) => s.status === 'checking');

  /** "រក្សាទុកសរុប": save the whole batch at once under one Operation Code */
  const saveStaged = async () => {
    if (batchSaving) return;
    if (stagedChecking) return onShowToast('កំពុងពិនិត្យ Barcode — សូមរង់ចាំបន្តិច', 'info');
    if (!stagedReady.length) return onShowToast('មិនមានវិក័យប័ត្រដែលអាចរក្សាទុកបានទេ', 'error');
    const bad = stagedReady.find((s) => {
      const n = parseAmount(s.amount);
      return n !== null && (!isFinite(n) || n < 0);
    });
    if (bad) return onShowToast(`${bad.barcode}: ចំនួនទឹកប្រាក់មិនត្រឹមត្រូវ`, 'error');

    setBatchSaving(true);
    try {
      const inputs: HandoverInput[] = stagedReady.map((s) => ({
        barcode: s.barcode,
        staffName: s.staffName,
        handoverDate: s.handoverDate,
        amount: parseAmount(s.amount),
        currency: s.currency,
        note: s.note.trim(),
        linkSource: s.linkSource,
        linkInfo: s.linkInfo,
      }));
      const res = await saveHandoverBatch(inputs);
      const savedBy = new Map(res.saved.map((h) => [h.barcode.toUpperCase(), h]));
      const dupBy = new Map(res.duplicates.map((d) => [d.barcode.toUpperCase(), d.message]));
      const failBy = new Map(res.failed.map((d) => [d.barcode.toUpperCase(), d.message]));
      // Photos go up one by one after the batch is saved
      const photos = stagedReady.filter((s) => s.image && savedBy.has(s.barcode)).map((s) => ({ s, h: savedBy.get(s.barcode)! }));
      setStaged((list) =>
        list
          .filter((s) => !savedBy.has(s.barcode))
          .map((s) =>
            dupBy.has(s.barcode)
              ? { ...s, status: 'duplicate' as const, message: dupBy.get(s.barcode) }
              : failBy.has(s.barcode)
                ? { ...s, status: 'error' as const, message: failBy.get(s.barcode) }
                : s
          )
      );
      if (res.operationCode) setLastBatchCode(res.operationCode);
      if (res.saved.length) {
        playScanSound();
        onShowToast(`✓ បានរក្សាទុក ${res.saved.length} វិក័យប័ត្រ · ${res.operationCode}`, 'success');
        if (res.operationCode) setExpanded((s) => new Set(s).add(res.operationCode!));
      }
      if (res.duplicates.length || res.failed.length) {
        playWarningSound();
        onShowToast(`${res.duplicates.length + res.failed.length} វិក័យប័ត្រ មិនបានរក្សាទុក (មើលក្នុង Batch)`, 'error');
      }
      loadList(true);
      if (photos.length) void uploadPhotos(photos);
    } catch (err: any) {
      onShowToast(err?.message || 'រក្សាទុកបរាជ័យ', 'error');
    } finally {
      setBatchSaving(false);
    }
  };

  const uploadPhotos = async (photos: { s: StagedItem; h: InvoiceHandover }[]) => {
    setPhotoUploads((n) => n + photos.length);
    let ok = 0;
    for (const { s, h } of photos) {
      try {
        await saveHandover(
          {
            id: h.id,
            barcode: h.barcode,
            staffName: h.staffName,
            handoverDate: h.handoverDate,
            amount: h.amount,
            currency: h.currency,
            note: h.note,
            linkSource: h.linkSource,
            linkInfo: h.linkInfo,
          },
          s.image,
          settings.webAppUrl
        );
        ok++;
      } catch (err: any) {
        onShowToast(`${h.barcode}: រូបភាព Upload បរាជ័យ — ${err?.message || ''} (សូមកែប្រែ ហើយដាក់រូបម្តងទៀត)`, 'error');
      } finally {
        setPhotoUploads((n) => n - 1);
      }
    }
    if (ok) onShowToast(`✓ បាន Upload រូបភាព ${ok} ទៅ Google Drive`, 'success');
    loadListRef.current(true);
  };

  // Warn before leaving while photos upload, or when unsaved scans hold photos (scans themselves are kept)
  const mustStay = photoUploads > 0 || staged.some((s) => s.image);
  useEffect(() => {
    if (!mustStay) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [mustStay]);

  // Keep the list fresh while the page is open (other devices saving)
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && !saving) loadList(true);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [loadList, saving]);

  // ── barcode lookup ──
  const runLookup = useCallback(
    async (raw: string): Promise<{ code: string; res: BarcodeLookup } | null> => {
      const code = sanitizeTrackingCode(raw).trim().toUpperCase();
      setBarcode(code);
      if (!code) {
        setLookup(null);
        return null;
      }
      const seq = ++lookupSeq.current;
      setLookupBusy(true);
      try {
        const res = await lookupHandoverBarcode(code);
        if (seq !== lookupSeq.current) return null;
        setLookup(res);
        const isSelf = editing && res.existing?.id === editing.id;
        if (res.existing && !isSelf) playWarningSound();
        else playScanSound();
        return { code, res };
      } catch (err: any) {
        if (seq !== lookupSeq.current) return null;
        setLookup(null);
        onShowToast(err?.message || 'ស្វែងរក Barcode បរាជ័យ', 'error');
        return null;
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
      const r = await compressImageToWebP(file, 2000, 0.85);
      setImage(r.dataUrl);
    } catch (err: any) {
      onShowToast(err?.message || 'មិនអាចអានរូបភាពបានទេ', 'error');
    } finally {
      setImageBusy(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Ctrl+V an image anywhere on the page (text paste into inputs still works)
  const handleImageRef = useRef(handleImage);
  handleImageRef.current = handleImage;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.kind === 'file' && i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      handleImageRef.current(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

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

  const canSave = !saving && !imageBusy && !lookupBusy && !!editing && !!barcode.trim() && !!staffName.trim() && !duplicate;

  /** Editing a saved record (new scans go to the batch table instead). */
  const handleSave = async () => {
    if (saving || !editing) return;
    const code = barcode.trim();
    if (!code) return onShowToast('សូមស្កេន ឬបញ្ចូល Barcode', 'error');
    if (!staffName.trim()) return onShowToast('សូមជ្រើសរើសឈ្មោះអ្នកប្រគល់', 'error');
    if (duplicate) return onShowToast(`Barcode ${code} បានប្រគល់រួចហើយ`, 'error');
    const amountNum = parseAmount(amount);
    if (amountNum !== null && (!isFinite(amountNum) || amountNum < 0)) return onShowToast('ចំនួនទឹកប្រាក់មិនត្រឹមត្រូវ', 'error');

    setSaving(true);
    try {
      // The barcode may have been changed: use link info that belongs to it
      let l = lookup && lookup.barcode === code ? lookup : null;
      if (!l && code !== editing.barcode) {
        l = await lookupHandoverBarcode(code).catch(() => null);
        if (l?.existing && l.existing.id !== editing.id) {
          setLookup(l);
          playWarningSound();
          onShowToast(`Barcode ${code} បានប្រគល់រួចហើយ`, 'error');
          return;
        }
      }
      const link = l ? buildLinkInfo(l) : { linkSource: editing.linkSource, linkInfo: editing.linkInfo };
      const input: HandoverInput = {
        id: editing.id,
        barcode: code,
        staffName: staffName.trim(),
        handoverDate,
        amount: amountNum,
        currency,
        note: note.trim(),
        ...link,
      };
      const saved = await saveHandover(input, image, settings.webAppUrl);
      onShowToast(`✓ បានកែប្រែ ${saved.barcode}`, 'success');
      resetForm(true);
      loadList(true);
    } catch (err: any) {
      onShowToast(err?.message || 'រក្សាទុកបរាជ័យ', 'error');
    } finally {
      setSaving(false);
    }
  };

  /** Clear what belongs to one invoice, keep staff / date / currency for the next scan. */
  const clearScanFields = () => {
    lookupSeq.current++;
    setBarcode('');
    setAmount('');
    setNote('');
    setImage(null);
    setLookup(null);
    setLookupBusy(false);
    setTimeout(() => barcodeRef.current?.focus(), 30);
  };

  // Scanner / Enter: the barcode goes into the batch table (checked there), the field clears at once
  const scanBarcode = (raw: string) => {
    if (editing || imageBusy) {
      void runLookup(raw);
      return;
    }
    const code = sanitizeTrackingCode(raw).trim().toUpperCase();
    if (!code) return;
    if (!staffName.trim()) {
      setBarcode(code);
      playWarningSound();
      onShowToast('សូមជ្រើសរើសឈ្មោះអ្នកប្រគល់ មុននឹងស្កេន', 'error');
      return;
    }
    if (staged.some((s) => s.barcode === code)) {
      playWarningSound();
      onShowToast(`Barcode ${code} មានក្នុង Batch រួចហើយ`, 'error');
      clearScanFields();
      return;
    }
    const amountNum = parseAmount(amount);
    if (amountNum !== null && (!isFinite(amountNum) || amountNum < 0)) {
      setBarcode(code);
      return onShowToast('ចំនួនទឹកប្រាក់មិនត្រឹមត្រូវ', 'error');
    }
    const item: StagedItem = {
      key: ++stagedKey.current,
      barcode: code,
      staffName: staffName.trim(),
      handoverDate,
      amount: amount.trim(),
      currency,
      note: note.trim(),
      image,
      status: 'checking',
      linkSource: null,
      linkInfo: null,
    };
    setStaged((list) => [item, ...list]);
    void checkStaged(item);
    playScanSound();
    clearScanFields();
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

  const exportRows = (list: InvoiceHandover[], fileName: string) => {
    const csv = formatCsv(
      ['Operation Code', 'Barcode', 'អ្នកចែក', 'អ្នកប្រគល់', 'ស្ថានភាព', 'កាលបរិច្ឆេទ', 'ទឹកប្រាក់', 'រូបិយប័ណ្ណ', 'ចំណាំ', 'អ្នកផ្ញើ', 'អ្នកទទួល', 'ទិសដៅ', 'ឃ្លាំង', 'Prep Code', 'រូបភាព (Drive)', 'អ្នកកត់ត្រា', 'ពេលកត់ត្រា'],
      list.map((h) => [
          h.operationCode || '',
          h.barcode,
          h.linkInfo?.warehousePerson || '',
          h.staffName,
          'បានទទួល',
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
    downloadCsv(fileName.replace(/[^\w.\-]+/g, '_'), csv);
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
      exportRows(all, `invoice_handover_${todayStr()}.csv`);
    } catch (err: any) {
      onShowToast(err?.message || 'Export បរាជ័យ', 'error');
    } finally {
      setExporting(false);
    }
  };

  const rows = data?.rows || [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  // ── batches in the list (Group តាមប្រតិបត្តិការ, like the warehouse Customer page) ──
  const groups = useMemo(() => groupRows(rows), [rows]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleExpand = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const allExpanded = groups.length > 0 && groups.every((g) => expanded.has(g.key));

  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  useEffect(() => setSelected(new Set()), [filters, page]);
  const selectedRows = useMemo(() => rows.filter((h) => selected.has(h.id)), [rows, selected]);
  const toggleRow = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const setMany = (list: InvoiceHandover[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      list.forEach((h) => (on ? n.add(h.id) : n.delete(h.id)));
      return n;
    });
  const stateOf = (list: InvoiceHandover[]): boolean | 'some' => {
    const c = list.filter((h) => selected.has(h.id)).length;
    return c === 0 ? false : c === list.length ? true : 'some';
  };

  const [manifest, setManifest] = useState<HandoverManifestGroup[] | null>(null);
  const printRows = (list: InvoiceHandover[]) => list.length && setManifest(groupRows(list));

  const deleteMany = async (list: InvoiceHandover[]) => {
    const allowed = list.filter(canDeleteRow);
    if (!allowed.length) return onShowToast('អ្នកមិនមានសិទ្ធិលុបកំណត់ត្រាទាំងនេះទេ', 'error');
    const skipped = list.length - allowed.length;
    if (
      !window.confirm(
        `លុប ${allowed.length} វិក័យប័ត្រ មែនទេ?${skipped ? `\n(${skipped} មិនមានសិទ្ធិលុប នឹងរំលង)` : ''}\n(រូបភាពនៅតែរក្សាទុកក្នុង Google Drive)`
      )
    )
      return;
    let done = 0;
    for (const h of allowed) {
      try {
        await deleteHandover(h.id);
        done++;
      } catch (err: any) {
        onShowToast(`${h.barcode}: ${err?.message || 'លុបបរាជ័យ'}`, 'error');
      }
    }
    if (done) onShowToast(`បានលុប ${done} វិក័យប័ត្រ`, 'success');
    if (editing && allowed.some((h) => h.id === editing.id)) resetForm(true);
    setMany(allowed, false);
    loadList(true);
  };

  const copyText = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => onShowToast(`បានចម្លង ${text}`, 'success'),
      () => undefined
    );
  };

  // One invoice row (flat table and inside an expanded batch)
  const rowHead = (
    <tr>
      <th className="px-2 py-2 w-8">
        <span className="sr-only">ជ្រើស</span>
      </th>
      <th className="px-2 py-2 text-left w-8">#</th>
      <th className="px-2 py-2 text-left w-16">រូបភាព</th>
      <th className="px-2 py-2 text-left">Barcode</th>
      <th className="px-2 py-2 text-left">ព័ត៌មានភ្ជាប់</th>
      <th className="px-2 py-2 text-left">អ្នកចែក</th>
      <th className="px-2 py-2 text-left">អ្នកប្រគល់</th>
      <th className="px-2 py-2 text-left">ស្ថានភាព</th>
      <th className="px-2 py-2 text-right">ទឹកប្រាក់</th>
      <th className="px-2 py-2 text-left">ចំណាំ</th>
      <th className="px-2 py-2 text-left">កាលបរិច្ឆេទ</th>
      <th className="px-2 py-2 text-right w-20"></th>
    </tr>
  );
  const rowView = (h: InvoiceHandover, n: number) => (
    <tr
      key={h.id}
      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${editing?.id === h.id ? 'bg-amber-50 dark:bg-amber-950/20' : selected.has(h.id) ? 'bg-cyan-50/60 dark:bg-cyan-950/20' : ''}`}
    >
      <td className="px-2 py-1.5">
        <Check state={selected.has(h.id)} onChange={() => toggleRow(h.id)} />
      </td>
      <td className="px-2 py-1.5 text-slate-400">{n}</td>
      <td className="px-2 py-1.5">
        {h.driveFileId ? (
          <button type="button" onClick={() => setPreview(h)} className="block w-12 h-12 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100">
            <img src={driveThumb(h.driveFileId)} alt="" loading="lazy" className="w-full h-full object-cover" />
          </button>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-2 py-1.5 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
        {h.barcode}
        <button type="button" onClick={() => copyText(h.barcode)} title="ចម្លង" className="ml-1 align-middle text-slate-300 hover:text-slate-500">
          <Copy className="inline w-3 h-3" />
        </button>
      </td>
      <td className="px-2 py-1.5 max-w-[260px]">
        <LinkSummary info={h.linkInfo} />
      </td>
      <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">{h.linkInfo?.warehousePerson || <span className="text-slate-300">—</span>}</td>
      <td className="px-2 py-1.5 font-semibold text-slate-800 dark:text-slate-200">{h.staffName}</td>
      <td className="px-2 py-1.5">
        <ReceivedBadge />
      </td>
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
  );
  const mobileCard = (h: InvoiceHandover) => (
    <div key={h.id} className={`p-3 flex gap-3 ${editing?.id === h.id ? 'bg-amber-50 dark:bg-amber-950/20' : selected.has(h.id) ? 'bg-cyan-50/60 dark:bg-cyan-950/20' : ''}`}>
      <div className="pt-0.5">
        <Check state={selected.has(h.id)} onChange={() => toggleRow(h.id)} />
      </div>
      {h.driveFileId ? (
        <button type="button" onClick={() => setPreview(h)} className="w-14 h-14 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 shrink-0">
          <img src={driveThumb(h.driveFileId)} alt="" loading="lazy" className="w-full h-full object-cover" />
        </button>
      ) : (
        <div className="w-14 h-14 rounded-md bg-slate-100 dark:bg-slate-800 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono font-bold text-xs text-slate-900 dark:text-white truncate">{h.barcode}</span>
          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">{money(h.amount, h.currency)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">{h.staffName}</span>
          <ReceivedBadge />
        </div>
        {h.linkInfo?.warehousePerson && <div className="text-[10.5px] text-slate-500 truncate">អ្នកចែក: {h.linkInfo.warehousePerson}</div>}
        <LinkSummary info={h.linkInfo} />
        {h.note && <div className="text-[10.5px] text-slate-500 truncate">{h.note}</div>}
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-slate-400">
            {showDate(h.handoverDate)} {showTime(h.createdAt)} · {h.createdBy}
          </span>
          <span>
            {canEditRow(h) && (
              <button type="button" onClick={() => startEdit(h)} className="p-2 -my-1 rounded-md text-slate-500 active:bg-slate-100 dark:active:bg-slate-800">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {canDeleteRow(h) && (
              <button type="button" onClick={() => handleDelete(h)} className="p-2 -my-1 rounded-md text-rose-500 active:bg-rose-50 dark:active:bg-rose-950/40">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
  // Print / Excel / expand / delete for one batch
  const groupActions = (g: ListGroup, size: 'sm' | 'lg') => {
    const btn = size === 'sm' ? 'p-1.5' : 'p-2';
    return (
      <span className="inline-flex items-center gap-0.5">
        <button type="button" onClick={() => printRows(g.rows)} title="បោះពុម្ព Manifest" className={`${btn} rounded-md text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950/40`}>
          <Printer className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => exportRows(g.rows, `invoice_handover_${g.code || `${g.date}_${g.staff}`}.csv`)}
          title="Excel"
          className={`${btn} rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40`}
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => toggleExpand(g.key)}
          title={expanded.has(g.key) ? 'បង្រួម' : 'ពង្រីកមើល Barcode'}
          className={`${btn} rounded-md text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/40`}
        >
          {expanded.has(g.key) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {g.rows.some(canDeleteRow) && (
          <button type="button" onClick={() => deleteMany(g.rows)} title="លុបប្រតិបត្តិការនេះ" className={`${btn} rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40`}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </span>
    );
  };
  const groupCode = (g: ListGroup) =>
    g.code ? (
      <span className="inline-flex items-center gap-1">
        <span className="px-1.5 py-0.5 rounded-md bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 font-mono text-[11px] font-bold text-violet-700 dark:text-violet-300 whitespace-nowrap">
          <Layers className="inline w-3 h-3 mr-1 -mt-0.5" />
          {g.code}
        </span>
        <button type="button" onClick={() => copyText(g.code)} title="ចម្លង" className="text-slate-300 hover:text-slate-500">
          <Copy className="w-3 h-3" />
        </button>
      </span>
    ) : (
      <span className="text-[11px] text-slate-500 dark:text-slate-400" title="កត់ត្រាមុនពេលមានលេខប្រតិបត្តិការ">
        (ចាស់) {g.staff} · {showDate(g.date)}
      </span>
    );

  // ── render ──
  return (
    <div className="space-y-3 pb-24 md:pb-6">
      {/* Header */}
      <div className={`${cardCls} px-3 py-2 sm:p-3 flex items-center gap-2.5 sm:gap-3`}>
        <div className="w-9 h-9 rounded-lg bg-cyan-600 text-white flex items-center justify-center shrink-0">
          <FileCheck className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] sm:text-sm font-bold leading-snug text-slate-900 dark:text-white truncate">
            ប្រគល់វិក័យប័ត្រ <span className="hidden sm:inline">(Invoice Handover)</span>
          </h1>
          <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400 truncate">
            <span className="sm:hidden">Invoice Handover · ស្កេន · ថតរូប</span>
            <span className="hidden sm:inline">ស្កេន Barcode · ថតរូបវិក័យប័ត្រ · រូបភាពរក្សាទុកក្នុង Google Drive</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10.5px] font-bold shrink-0">
          <span
            title="Hostinger"
            className="h-7 w-7 sm:h-auto sm:w-auto sm:px-2 sm:py-1 rounded-full flex items-center justify-center bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
          >
            <Database className="w-3.5 h-3.5 sm:w-3 sm:h-3 sm:mr-1" />
            <span className="hidden sm:inline">Hostinger</span>
          </span>
          <a
            href={DRIVE_FOLDER_URL}
            target="_blank"
            rel="noreferrer"
            title="Google Drive"
            className="h-7 w-7 sm:h-auto sm:w-auto sm:px-2 sm:py-1 rounded-full flex items-center justify-center bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
          >
            <FolderOpen className="w-3.5 h-3.5 sm:w-3 sm:h-3 sm:mr-1" />
            <span className="hidden sm:inline">Google Drive</span>
          </a>
        </div>
      </div>

      {/* Form */}
      <div className={`${cardCls} p-2.5 sm:p-3 ${editing ? 'ring-2 ring-amber-400' : ''}`}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="min-w-0 truncate text-sm sm:text-xs font-bold text-slate-800 dark:text-slate-200">
            {editing ? (
              <span className="text-amber-600 dark:text-amber-400">
                <Pencil className="inline w-3.5 h-3.5 mr-1" />
                កំពុងកែប្រែ {editing.barcode}
              </span>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                ទទួលវិក័យប័ត្រពីអ្នកប្រគល់
                {lastBatchCode && (
                  <span
                    title="Batch ដែលបានរក្សាទុកចុងក្រោយ"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 font-mono text-[10.5px] font-bold text-violet-700 dark:text-violet-300"
                  >
                    <Layers className="w-3 h-3" />
                    {lastBatchCode}
                  </span>
                )}
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={() => resetForm(!!editing)}
            className="shrink-0 text-[11px] px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {editing ? 'បោះបង់ការកែ' : 'សម្អាត (Clear)'}
          </button>
        </div>

        <div
          className="space-y-2 xl:space-y-0 xl:grid xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:gap-x-2 xl:gap-y-1.5 xl:items-end"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleImage(e.dataTransfer.files?.[0]);
          }}
        >
            <div className="grid grid-cols-[minmax(0,1fr)_128px] sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_150px] gap-2">
              <div>
                <label className={labelCls}>
                  អ្នកប្រគល់<span className="hidden sm:inline"> (Company Staff)</span> <span className="text-rose-500">*</span>
                </label>
                <input
                  list="inv-handover-staff"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder={staffOptions.length ? `ជ្រើសឈ្មោះ (${staffOptions.length})` : 'ឈ្មោះអ្នកប្រគល់'}
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
                <input type="date" value={handoverDate} onChange={(e) => setHandoverDate(e.target.value || todayStr())} className={`${inputCls} px-1.5 sm:px-2.5`} />
              </div>
            <div className="col-span-2 sm:col-span-1 min-w-0 order-first">
              <div className="flex items-center justify-between gap-2">
                <label className={labelCls}>
                  Barcode <span className="text-rose-500">*</span>
                </label>
                {!editing && (
                  <span className="mb-0.5 text-[10.5px] font-semibold text-slate-400" title="ស្កេន ឬវាយហើយចុច Enter — ចូល Batch ខាងក្រោម រួចចុច រក្សាទុកសរុប">
                    ស្កេន → ចូល Batch
                  </span>
                )}
              </div>
              <div className="flex gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <ScanLine className="w-4 h-4 sm:w-3.5 sm:h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
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
                        scanBarcode(barcode);
                      }
                    }}
                    onBlur={() => {
                      if (barcode.trim() && (!lookup || lookup.barcode !== barcode.trim().toUpperCase())) runLookup(barcode);
                    }}
                    placeholder="ស្កេន ឬវាយ Barcode"
                    className={`${inputCls} pl-8 font-mono font-bold tracking-wide`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  title="ស្កេនដោយកាមេរ៉ា"
                  className="h-10 sm:h-9 w-11 sm:w-auto sm:px-3 rounded-lg bg-slate-800 text-white text-xs font-bold flex justify-center items-center gap-1 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 shrink-0"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">ស្កេន</span>
                </button>
              </div>
            </div>
            </div>

              {/* What the system knows about this barcode */}
              {lookupBusy && (
                <div className="mt-1.5 xl:mt-0 xl:col-span-2 xl:order-last text-[11px] text-slate-500 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> កំពុងស្វែងរកក្នុងប្រព័ន្ធ...
                </div>
              )}
              {!lookupBusy && lookup && (
                <div className="mt-1.5 xl:mt-0 xl:col-span-2 xl:order-last space-y-1.5">
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

            <div className="grid grid-cols-2 sm:grid-cols-[190px_minmax(0,1fr)_auto_auto] gap-2 items-end">
              <div>
                <label className={labelCls}>ចំនួនទឹកប្រាក់</label>
                <div className="flex gap-1">
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="0.00"
                    className={`${inputCls} min-w-0 px-2 text-right font-semibold`}
                  />
                  <div className="flex h-10 sm:h-9 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
                    {(['USD', 'KHR'] as HandoverCurrency[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCurrency(c)}
                        className={`w-7 sm:w-8 text-xs sm:text-[11px] font-bold ${currency === c ? 'bg-cyan-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-500'}`}
                      >
                        {c === 'USD' ? '$' : '៛'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className={labelCls}>ចំណាំ</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="បើមាន" className={inputCls} />
              </div>

              {/* Photo (optional) */}
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>
                  រូបភាព <span className="text-slate-400 font-normal">(មិនបាច់ · Ctrl+V)</span>
                </label>
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImage(e.target.files?.[0])} />
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImage(e.target.files?.[0])} />
                <div className="flex items-center gap-1.5">
                  {imageBusy ? (
                    <div className="h-10 sm:h-9 w-10 sm:w-9 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    </div>
                  ) : image || editing?.driveFileId ? (
                    <div className="relative h-10 sm:h-9 w-10 sm:w-9 shrink-0 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100">
                      <img
                        src={image || driveThumb(editing!.driveFileId!, 200)}
                        alt="invoice"
                        title={image ? 'រូបថ្មី' : 'រូបចាស់ · ថតថ្មីដើម្បីប្តូរ'}
                        className={`w-full h-full object-cover ${image ? '' : 'opacity-70'}`}
                      />
                      {image && (
                        <button
                          type="button"
                          onClick={() => setImage(null)}
                          className="absolute top-0 right-0 w-4 h-4 rounded-bl bg-black/60 text-white flex items-center justify-center"
                          title="ដករូបចេញ"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                    title="ថតរូប"
                    className="h-10 sm:h-9 flex-1 sm:flex-none sm:px-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold flex items-center justify-center gap-1"
                  >
                    <Camera className="w-3.5 h-3.5" /> ថតរូប
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    title="ជ្រើសរូប (ឬអូសរូបមកលើ Form / Ctrl+V)"
                    className="h-10 sm:h-9 flex-1 sm:flex-none sm:px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <ImagePlus className="w-3.5 h-3.5" /> ជ្រើសរូប
                  </button>
                </div>
              </div>

              {/* New records save on scan / Enter; the button is only for editing */}
              {editing && (
                <button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={!canSave}
                  className="col-span-2 sm:col-span-1 h-11 sm:h-9 px-5 rounded-lg bg-emerald-600 shadow-sm hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-bold flex items-center justify-center gap-1.5"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'កំពុងរក្សាទុក...' : 'រក្សាទុកការកែប្រែ'}
                </button>
              )}
            </div>
        </div>
      </div>

      {/* Batch table: scans wait here until "រក្សាទុកសរុប" */}
      {(staged.length > 0 || photoUploads > 0) && (
        <div className={`${cardCls} overflow-hidden border-cyan-200 dark:border-cyan-900`}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 sm:px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-cyan-50/50 dark:bg-cyan-950/20">
            <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
              <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                Batch រង់ចាំរក្សាទុក <span className="px-1.5 rounded-full bg-cyan-600 text-white text-[10.5px]">{staged.length}</span>
              </span>
              {(() => {
                const usd = stagedReady.reduce((s, i) => s + (i.currency === 'USD' ? parseAmount(i.amount) || 0 : 0), 0);
                const khr = stagedReady.reduce((s, i) => s + (i.currency === 'KHR' ? parseAmount(i.amount) || 0 : 0), 0);
                const dup = staged.filter((s) => s.status === 'duplicate').length;
                const nf = staged.filter((s) => s.status === 'notfound').length;
                return (
                  <>
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">រក្សាទុកបាន: {stagedReady.length}</span>
                    {dup > 0 && <span className="text-rose-600 font-semibold">ស្ទួន: {dup}</span>}
                    {nf > 0 && <span className="text-amber-600 font-semibold">មិនមានក្នុងប្រព័ន្ធ: {nf}</span>}
                    {usd > 0 && <span className="font-semibold text-slate-700 dark:text-slate-300">{money(usd, 'USD')}</span>}
                    {khr > 0 && <span className="font-semibold text-slate-700 dark:text-slate-300">{money(khr, 'KHR')}</span>}
                    {photoUploads > 0 && (
                      <span className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-300">
                        <Loader2 className="w-3 h-3 animate-spin" /> កំពុង Upload រូប {photoUploads}...
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {staged.some((s) => s.status === 'duplicate') && (
                <button
                  type="button"
                  onClick={() => setStaged((l) => l.filter((s) => s.status !== 'duplicate'))}
                  className="h-9 px-2.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 text-[11px] font-bold hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  ដកស្ទួនចេញ
                </button>
              )}
              {staged.length > 0 && (
                <button
                  type="button"
                  onClick={clearStaged}
                  disabled={batchSaving}
                  className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-bold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  លុបទាំងអស់
                </button>
              )}
              {staged.length > 0 && (
                <button
                  type="button"
                  onClick={saveStaged}
                  disabled={batchSaving || stagedChecking || !stagedReady.length}
                  className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  {batchSaving || stagedChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {batchSaving ? 'កំពុងរក្សាទុក...' : stagedChecking ? 'កំពុងពិនិត្យ...' : `រក្សាទុកសរុប (${stagedReady.length})`}
                </button>
              )}
            </div>
          </div>
          {staged.length > 0 && (
            <div className="max-h-[50vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 text-[10.5px] text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="px-2 py-1.5 text-left w-8">#</th>
                    <th className="px-2 py-1.5 text-left">Barcode</th>
                    <th className="px-2 py-1.5 text-left">ព័ត៌មានភ្ជាប់ / ស្ថានភាព</th>
                    <th className="px-2 py-1.5 text-left hidden lg:table-cell">អ្នកចែក</th>
                    <th className="px-2 py-1.5 text-left hidden sm:table-cell">អ្នកប្រគល់</th>
                    <th className="px-2 py-1.5 text-left w-36">ទឹកប្រាក់</th>
                    <th className="px-2 py-1.5 text-left hidden md:table-cell">ចំណាំ</th>
                    <th className="px-2 py-1.5 text-left w-10">រូប</th>
                    <th className="px-2 py-1.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {staged.map((s, i) => (
                    <tr
                      key={s.key}
                      className={s.status === 'duplicate' ? 'bg-rose-50/70 dark:bg-rose-950/20' : s.status === 'notfound' ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}
                    >
                      <td className="px-2 py-1 text-slate-400">{staged.length - i}</td>
                      <td className="px-2 py-1 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">{s.barcode}</td>
                      <td className="px-2 py-1 max-w-[280px]">
                        {s.status === 'checking' ? (
                          <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-500">
                            <Loader2 className="w-3 h-3 animate-spin" /> កំពុងពិនិត្យ...
                          </span>
                        ) : s.status === 'duplicate' ? (
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-rose-600">
                            <AlertTriangle className="w-3 h-3 shrink-0" /> {s.message}
                          </span>
                        ) : s.status === 'error' ? (
                          <span className="flex items-center gap-1 text-[10.5px] text-amber-600">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span className="truncate" title={s.message}>{s.message}</span>
                            <button type="button" onClick={() => checkStaged(s)} title="ពិនិត្យម្តងទៀត" className="text-cyan-700 shrink-0">
                              <RefreshCw className="w-3 h-3" />
                            </button>
                          </span>
                        ) : (
                          <LinkSummary info={s.linkInfo} />
                        )}
                      </td>
                      <td className="px-2 py-1 text-slate-700 dark:text-slate-300 whitespace-nowrap hidden lg:table-cell">{s.linkInfo?.warehousePerson || <span className="text-slate-300">—</span>}</td>
                      <td className="px-2 py-1 font-semibold text-slate-800 dark:text-slate-200 hidden sm:table-cell">{s.staffName}</td>
                      <td className="px-2 py-1">
                        <div className="flex gap-1">
                          <input
                            inputMode="decimal"
                            value={s.amount}
                            onChange={(e) => patchStaged(s.key, { amount: e.target.value.replace(/[^0-9.,]/g, '') })}
                            placeholder="0.00"
                            className="w-full min-w-0 h-7 px-1.5 rounded-md text-right text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-600"
                          />
                          <button
                            type="button"
                            onClick={() => patchStaged(s.key, { currency: s.currency === 'USD' ? 'KHR' : 'USD' })}
                            title="ប្តូររូបិយប័ណ្ណ"
                            className="h-7 w-7 shrink-0 rounded-md bg-cyan-600 text-white text-[11px] font-bold"
                          >
                            {s.currency === 'USD' ? '$' : '៛'}
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-1 hidden md:table-cell">
                        <input
                          value={s.note}
                          onChange={(e) => patchStaged(s.key, { note: e.target.value })}
                          placeholder="—"
                          className="w-full min-w-[120px] h-7 px-1.5 rounded-md text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-600"
                        />
                      </td>
                      <td className="px-2 py-1">
                        {s.image ? (
                          <span className="relative block w-7 h-7 rounded overflow-hidden border border-slate-200 dark:border-slate-700">
                            <img src={s.image} alt="" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => patchStaged(s.key, { image: null })}
                              title="ដករូបចេញ"
                              className="absolute top-0 right-0 w-3 h-3 bg-black/60 text-white flex items-center justify-center"
                            >
                              <X className="w-2 h-2" />
                            </button>
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button
                          type="button"
                          onClick={() => removeStaged(s.key)}
                          disabled={batchSaving}
                          title="ដកចេញពី Batch"
                          className="p-1 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Filters & totals */}
      <div className={`${cardCls} p-2 sm:p-2.5 space-y-1.5 sm:space-y-2`}>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <div className="relative flex-1 min-w-0 sm:min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ស្វែងរក Barcode, ឈ្មោះ, ចំណាំ..." className={`${inputCls} pl-8`} />
          </div>
          <div className="order-last sm:order-none flex w-full sm:w-auto rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px] font-bold">
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
                className={`flex-1 sm:flex-none px-1.5 sm:px-2.5 py-1.5 sm:py-1 rounded-md whitespace-nowrap ${preset === k ? 'bg-white dark:bg-slate-900 text-cyan-700 dark:text-cyan-300 shadow-sm' : 'text-slate-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {preset === 'CUSTOM' && (
            <div className="order-last sm:order-none flex w-full sm:w-auto items-center gap-1">
              <input type="date" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} className={`${inputCls} flex-1 sm:flex-none sm:w-36`} />
              <span className="text-slate-400 text-xs">→</span>
              <input type="date" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} className={`${inputCls} flex-1 sm:flex-none sm:w-36`} />
            </div>
          )}
          <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className={`${inputCls} order-last sm:order-none basis-full sm:basis-auto sm:w-auto sm:max-w-[200px]`}>
            <option value="">អ្នកប្រគល់ទាំងអស់</option>
            {staffOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setGroupMode((v) => !v)}
            title="បង្ហាញជាក្រុម តាមលេខប្រតិបត្តិការ (Operation Code)"
            className={`h-10 sm:h-9 px-2.5 shrink-0 rounded-lg border text-[11px] font-bold flex items-center gap-1 ${
              groupMode
                ? 'border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Group តាមប្រតិបត្តិការ:</span>
            <span className={`px-1 rounded text-[10px] ${groupMode ? 'bg-violet-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>{groupMode ? 'ON' : 'OFF'}</span>
          </button>
          {groupMode && groups.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(allExpanded ? new Set() : new Set(groups.map((g) => g.key)))}
              title={allExpanded ? 'បង្រួមទាំងអស់' : 'ពង្រីកទាំងអស់'}
              className="h-10 sm:h-9 px-2.5 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {allExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span className="hidden lg:inline">{allExpanded ? 'បង្រួមទាំងអស់' : 'ពង្រីកទាំងអស់'}</span>
            </button>
          )}
          {selectedRows.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => printRows(selectedRows)}
                title="បោះពុម្ព Manifest នៃវិក័យប័ត្រដែលបានជ្រើស"
                className="h-10 sm:h-9 px-2.5 shrink-0 rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 text-[11px] font-bold flex items-center gap-1"
              >
                <Printer className="w-3.5 h-3.5" /> Print ({selectedRows.length})
              </button>
              <button
                type="button"
                onClick={() => exportRows(selectedRows, `invoice_handover_selected_${todayStr()}.csv`)}
                className="h-10 sm:h-9 px-2.5 shrink-0 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> Excel ({selectedRows.length})
              </button>
              {selectedRows.some(canDeleteRow) && (
                <button
                  type="button"
                  onClick={() => deleteMany(selectedRows)}
                  className="h-10 sm:h-9 px-2.5 shrink-0 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-[11px] font-bold flex items-center gap-1 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="w-3.5 h-3.5" /> លុប ({selectedRows.filter(canDeleteRow).length})
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                title="ដកការជ្រើសចេញ"
                className="h-10 w-10 sm:h-9 sm:w-9 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => loadList()}
            title="ផ្ទុកឡើងវិញ"
            className="h-10 w-10 sm:h-9 sm:w-9 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${listBusy ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || !data?.total}
            title="Excel"
            className="h-10 sm:h-9 w-10 sm:w-auto sm:px-3 justify-center shrink-0 rounded-lg border border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Excel</span>
          </button>
        </div>
        {data && (
          <div className="flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-0.5 px-0.5 text-[11px] text-slate-600 dark:text-slate-400">
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
          <div className="p-6 sm:p-10 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> កំពុងទាញទិន្នន័យ...
          </div>
        ) : !rows.length ? (
          <div className="p-6 sm:p-10 text-center text-xs text-slate-500">
            <FileCheck className="w-7 h-7 mx-auto mb-2 text-slate-300" />
            មិនទាន់មានវិក័យប័ត្រក្នុងចន្លោះនេះទេ
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              {groupMode ? (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10.5px] text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="px-2 py-2 w-8">
                        <Check state={stateOf(rows)} onChange={() => setMany(rows, stateOf(rows) !== true)} />
                      </th>
                      <th className="px-2 py-2 text-left w-8">#</th>
                      <th className="px-2 py-2 text-left">លេខប្រតិបត្តិការ (Operation Code)</th>
                      <th className="px-2 py-2 text-left">កាលបរិច្ឆេទ & ម៉ោង</th>
                      <th className="px-2 py-2 text-left">អ្នកកត់ត្រា</th>
                      <th className="px-2 py-2 text-left">អ្នកប្រគល់</th>
                      <th className="px-2 py-2 text-left">អ្នកចែក</th>
                      <th className="px-2 py-2 text-right">ទឹកប្រាក់សរុប</th>
                      <th className="px-2 py-2 text-center">ចំនួន</th>
                      <th className="px-2 py-2 text-right">សកម្មភាព</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {groups.map((g, gi) => {
                      const open = expanded.has(g.key);
                      const st = stateOf(g.rows);
                      return (
                        <React.Fragment key={g.key}>
                          <tr className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${st ? 'bg-cyan-50/40 dark:bg-cyan-950/10' : ''}`}>
                            <td className="px-2 py-2">
                              <Check state={st} onChange={() => setMany(g.rows, st !== true)} />
                            </td>
                            <td className="px-2 py-2 text-slate-400">{gi + 1}</td>
                            <td className="px-2 py-2">
                              <button type="button" onClick={() => toggleExpand(g.key)} className="mr-1.5 align-middle text-violet-500" title={open ? 'បង្រួម' : 'ពង្រីក'}>
                                {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                              {groupCode(g)}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap font-mono text-slate-700 dark:text-slate-300">
                              {showDate(g.date)} <span className="text-slate-400">{showTime(g.firstAt)}</span>
                            </td>
                            <td className="px-2 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{g.operator || '—'}</td>
                            <td className="px-2 py-2 font-semibold text-slate-800 dark:text-slate-200">{g.staff}</td>
                            <td className="px-2 py-2 text-slate-700 dark:text-slate-300 max-w-[220px] truncate" title={g.riders}>
                              {g.riders || <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-2 py-2 text-right font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                              {[g.usd ? money(g.usd, 'USD') : '', g.khr ? money(g.khr, 'KHR') : ''].filter(Boolean).join(' · ') || '—'}
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => toggleExpand(g.key)}
                                className="px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 text-[11px] font-bold text-cyan-700 dark:text-cyan-300 whitespace-nowrap"
                              >
                                {g.rows.length} វិក័យប័ត្រ
                              </button>
                            </td>
                            <td className="px-2 py-2 text-right whitespace-nowrap">{groupActions(g, 'sm')}</td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={10} className="px-3 pb-3 pt-1 bg-slate-50/60 dark:bg-slate-950/30">
                                <div className="rounded-lg border border-violet-200 dark:border-violet-900 bg-white dark:bg-slate-900 overflow-hidden">
                                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-violet-50/50 dark:bg-violet-950/20">
                                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                      បញ្ជី Barcode {g.code && <span className="font-mono text-violet-700 dark:text-violet-300">{g.code}</span>}{' '}
                                      <span className="ml-1 px-1.5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-[10px]">
                                        {g.rows.length}
                                      </span>
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => printRows(g.rows)}
                                        className="px-2 py-1 rounded-md border border-violet-200 dark:border-violet-800 text-[10.5px] font-bold text-violet-700 dark:text-violet-300 flex items-center gap-1"
                                      >
                                        <Printer className="w-3 h-3" /> ព្រីន Manifest ({g.rows.length})
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => exportRows(g.rows, `invoice_handover_${g.code || `${g.date}_${g.staff}`}.csv`)}
                                        className="px-2 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1"
                                      >
                                        <Download className="w-3 h-3" /> Excel
                                      </button>
                                    </span>
                                  </div>
                                  <table className="w-full text-xs">
                                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10.5px] text-slate-600 dark:text-slate-400">{rowHead}</thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{g.rows.map((h, i) => rowView(h, i + 1))}</tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10.5px] text-slate-600 dark:text-slate-400">{rowHead}</thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((h, i) => rowView(h, (data!.page - 1) * data!.pageSize + i + 1))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {groupMode
                ? groups.map((g) => {
                    const open = expanded.has(g.key);
                    const st = stateOf(g.rows);
                    return (
                      <div key={g.key}>
                        <div className="px-3 py-2 flex gap-2.5 items-start bg-violet-50/40 dark:bg-violet-950/10">
                          <div className="pt-0.5">
                            <Check state={st} onChange={() => setMany(g.rows, st !== true)} />
                          </div>
                          <button type="button" onClick={() => toggleExpand(g.key)} className="min-w-0 flex-1 text-left">
                            <div className="truncate">{groupCode(g)}</div>
                            <div className="mt-0.5 text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">{g.staff}</div>
                            <div className="text-[10.5px] text-slate-500 truncate">
                              {showDate(g.date)} {showTime(g.firstAt)} · {g.rows.length} វិក័យប័ត្រ
                              {g.usd ? ` · ${money(g.usd, 'USD')}` : ''}
                              {g.khr ? ` · ${money(g.khr, 'KHR')}` : ''}
                            </div>
                          </button>
                          {groupActions(g, 'lg')}
                        </div>
                        {open && <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-violet-100 dark:border-violet-900/50">{g.rows.map(mobileCard)}</div>}
                      </div>
                    );
                  })
                : rows.map(mobileCard)}
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

      {manifest && <HandoverManifestModal groups={manifest} onClose={() => setManifest(null)} />}

      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        autoCloseOnScan={true}
        currentPayerName={staffName}
        onScanSuccess={(decoded) => {
          setScannerOpen(false);
          scanBarcode(decoded);
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
