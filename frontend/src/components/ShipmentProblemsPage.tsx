import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  ImagePlus,
  Loader2,
  PackageX,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  ScanLine,
  Search,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { AppSettings, AuthUser } from '../types';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { compressImageToWebP } from '../utils/compression';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import { playScanSound, playWarningSound } from '../utils/scannerSound';
import { downloadCsv, formatCsv } from '../utils/csvHelper';
import { WAREHOUSE_STEP_LABEL } from '../services/invoiceHandoverService';
import {
  PROBLEM_TYPES,
  ProblemLookup,
  ProblemPage,
  ProblemPhoto,
  ProblemStatus,
  ProblemType,
  ShipmentProblem,
  addProblemPhoto,
  deleteProblem,
  driveThumb,
  fetchProblems,
  lookupProblemBarcode,
  problemTypeOf,
  removeProblemPhoto,
  saveProblem,
  setProblemStatus,
} from '../services/shipmentProblemService';

interface ShipmentProblemsPageProps {
  currentUser: AuthUser | null;
  settings: AppSettings;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const MAX_PHOTOS = 10;
const PAGE_SIZE = 200;

type DatePreset = 'TODAY' | 'WEEK' | 'MONTH' | 'ALL' | 'CUSTOM';
type StatusTab = ProblemStatus | 'ALL';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => ymd(new Date());
const showDate = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const showDateTime = (iso?: string | null) => {
  if (!iso) return '';
  const t = new Date(iso);
  if (isNaN(t.getTime())) return '';
  return `${ymd(t).split('-').reverse().join('/')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
};

function rangeOf(preset: DatePreset, custom: { start: string; end: string }) {
  const now = new Date();
  if (preset === 'TODAY') return { startDate: todayStr(), endDate: todayStr() };
  if (preset === 'WEEK') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { startDate: ymd(d), endDate: todayStr() };
  }
  if (preset === 'MONTH') return { startDate: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: todayStr() };
  if (preset === 'CUSTOM') return { startDate: custom.start, endDate: custom.end };
  return { startDate: '', endDate: '' };
}

const inputCls =
  'w-full h-10 sm:h-9 px-2.5 rounded-lg text-sm sm:text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-rose-500';
const labelCls = 'block text-[11px] sm:text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-0.5';
const cardCls = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm';

function TypeBadge({ type }: { type: string }) {
  const t = problemTypeOf(type);
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap border ${t.tone}`}>{t.label}</span>;
}

function StatusBadge({ status }: { status: ProblemStatus }) {
  return status === 'RESOLVED' ? (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
      <CheckCircle2 className="w-3 h-3" /> ដោះស្រាយរួច
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800">
      <AlertTriangle className="w-3 h-3" /> មិនទាន់ដោះស្រាយ
    </span>
  );
}

export const ShipmentProblemsPage: React.FC<ShipmentProblemsPageProps> = ({ currentUser, settings, onShowToast }) => {
  const isAdmin = String(currentUser?.role || '').toUpperCase() === 'ADMIN';
  const isViewer = String(currentUser?.role || '').toUpperCase() === 'VIEWER';
  const myEmail = String(currentUser?.email || '').toLowerCase();
  const isOwn = (p: ShipmentProblem) => String(p.operatorEmail || '').toLowerCase() === myEmail;
  const canCreate = isAdmin || (!isViewer && currentUser?.canCreate !== false);
  const canEditRow = (p: ShipmentProblem) => isAdmin || (!isViewer && isOwn(p) && currentUser?.canEdit !== false);
  const canResolve = isAdmin || (!isViewer && currentUser?.canEdit !== false);
  const canDeleteRow = (p: ShipmentProblem) => isAdmin || (isOwn(p) && !!currentUser?.canDelete);

  // ── form ──
  const [editing, setEditing] = useState<ShipmentProblem | null>(null);
  const [barcode, setBarcode] = useState('');
  const [problemType, setProblemType] = useState<ProblemType | null>(null);
  const [reportDate, setReportDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [lookup, setLookup] = useState<ProblemLookup | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const lookupSeq = useRef(0);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── list ──
  const [data, setData] = useState<ProblemPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusTab, setStatusTab] = useState<StatusTab>('OPEN');
  const [typeFilter, setTypeFilter] = useState<ProblemType | ''>('');
  const [preset, setPreset] = useState<DatePreset>('ALL');
  const [custom, setCustom] = useState({ start: todayStr(), end: todayStr() });
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [viewer, setViewer] = useState<{ problem: ShipmentProblem; index: number } | null>(null);
  const [resolving, setResolving] = useState<{ problem: ShipmentProblem; note: string; busy: boolean } | null>(null);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const addPhotoRef = useRef<HTMLInputElement>(null);
  const addPhotoTarget = useRef<ShipmentProblem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const range = useMemo(() => rangeOf(preset, custom), [preset, custom]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchProblems({
        search: debounced,
        status: statusTab === 'ALL' ? '' : statusTab,
        type: typeFilter,
        ...range,
        page: 1,
        pageSize: PAGE_SIZE,
      });
      setData(page);
    } catch (err: any) {
      onShowToast(err?.message || 'មិនអាចទាញទិន្នន័យបានទេ', 'error');
    } finally {
      setLoading(false);
    }
  }, [debounced, statusTab, typeFilter, range, onShowToast]);

  useEffect(() => {
    load();
  }, [load]);

  /** Put a changed row back into the list (or drop it when it no longer matches the tab). */
  const replaceRow = (row: ShipmentProblem | null, removedId?: number) => {
    setData((d) => {
      if (!d) return d;
      let rows = d.rows;
      if (removedId) rows = rows.filter((r) => r.id !== removedId);
      if (row) {
        const fits = statusTab === 'ALL' || row.status === statusTab;
        const i = rows.findIndex((r) => r.id === row.id);
        if (i >= 0) rows = fits ? rows.map((r) => (r.id === row.id ? row : r)) : rows.filter((r) => r.id !== row.id);
        else if (fits) rows = [row, ...rows];
      }
      return { ...d, rows };
    });
    setViewer((v) => (v && row && v.problem.id === row.id ? { problem: row, index: Math.min(v.index, Math.max(row.photos.length - 1, 0)) } : v));
  };

  // ── barcode lookup ──
  const runLookup = useCallback(
    async (raw: string) => {
      const code = sanitizeTrackingCode(raw).toUpperCase();
      if (!code) return;
      const seq = ++lookupSeq.current;
      setLookupBusy(true);
      try {
        const r = await lookupProblemBarcode(code);
        if (seq !== lookupSeq.current) return;
        setLookup(r);
        const others = r.existing.filter((p) => p.id !== editing?.id && p.status === 'OPEN');
        if (others.length) playWarningSound();
        else playScanSound();
      } catch (err: any) {
        if (seq === lookupSeq.current) onShowToast(err?.message || 'ស្វែងរក Barcode មិនបាន', 'error');
      } finally {
        if (seq === lookupSeq.current) setLookupBusy(false);
      }
    },
    [editing, onShowToast]
  );

  const scanBarcode = (raw: string) => {
    const code = sanitizeTrackingCode(raw).toUpperCase();
    if (!code) return;
    setBarcode(code);
    runLookup(code);
  };

  const openOthers = lookup ? lookup.existing.filter((p) => p.id !== editing?.id && p.status === 'OPEN') : [];
  const notFound = lookup && !lookup.dataReport && !lookup.warehouse.length;

  // ── photos (form) ──
  const addImages = async (files: File[]) => {
    const room = MAX_PHOTOS - images.length - (editing?.photos.length || 0);
    if (room <= 0) {
      onShowToast(`មួយបញ្ហាបានរូបភាពច្រើនបំផុត ${MAX_PHOTOS} សន្លឹក`, 'error');
      return;
    }
    const list = files.filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (!list.length) return;
    setImageBusy(true);
    try {
      const out: string[] = [];
      for (const f of list) out.push((await compressImageToWebP(f, 1600, 0.82)).dataUrl);
      setImages((prev) => [...prev, ...out].slice(0, MAX_PHOTOS));
      if (files.length > room) onShowToast(`បានយកតែ ${room} រូប (អតិបរមា ${MAX_PHOTOS})`, 'info');
    } catch (err: any) {
      onShowToast(err?.message || 'មិនអាចអានរូបភាពបានទេ', 'error');
    } finally {
      setImageBusy(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Ctrl+V an image anywhere on the page
  const addImagesRef = useRef(addImages);
  addImagesRef.current = addImages;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items || [])
        .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
        .map((i) => i.getAsFile())
        .filter((f): f is File => !!f);
      if (!files.length) return;
      e.preventDefault();
      addImagesRef.current(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const resetForm = () => {
    setEditing(null);
    setBarcode('');
    setProblemType(null);
    setNote('');
    setImages([]);
    setLookup(null);
    lookupSeq.current++;
    setLookupBusy(false);
    setTimeout(() => barcodeRef.current?.focus(), 50);
  };

  const startEdit = (p: ShipmentProblem) => {
    setEditing(p);
    setBarcode(p.barcode);
    setProblemType(p.problemType);
    setReportDate(p.reportDate || todayStr());
    setNote(p.note);
    setImages([]);
    setLookup(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Uploads photos one by one; returns the latest row and how many failed. */
  const uploadPhotos = async (problem: ShipmentProblem, list: string[]) => {
    let row = problem;
    let failed = 0;
    let lastError = '';
    for (let i = 0; i < list.length; i++) {
      setSaving(`កំពុង Upload រូប ${i + 1}/${list.length} ទៅ Google Drive...`);
      try {
        row = await addProblemPhoto(row.id, list[i], settings.webAppUrl);
      } catch (err: any) {
        failed++;
        lastError = err?.message || '';
      }
    }
    return { row, failed, lastError };
  };

  const canSave =
    !saving && !imageBusy && !!barcode.trim() && !!problemType && (editing ? canEditRow(editing) : canCreate);

  const handleSave = async () => {
    if (!canSave || !problemType) return;
    setSaving('កំពុងរក្សាទុក...');
    try {
      const saved = await saveProblem({
        id: editing?.id,
        barcode: sanitizeTrackingCode(barcode).toUpperCase(),
        problemType,
        location: editing?.location || '',
        pieces: editing?.pieces ?? null,
        note: note.trim(),
        reportDate,
      });
      const { row, failed, lastError } = images.length ? await uploadPhotos(saved, images) : { row: saved, failed: 0, lastError: '' };
      replaceRow(row);
      if (!editing) setData((d) => (d ? { ...d, open: d.open + 1, total: d.total + (statusTab === 'RESOLVED' ? 0 : 1) } : d));
      if (failed) {
        onShowToast(`បានរក្សាទុកបញ្ហា ${row.barcode} ប៉ុន្តែ Upload រូប ${failed} សន្លឹកបរាជ័យ — ${lastError} (អាចបន្ថែមរូបពីបញ្ជីខាងក្រោម)`, 'error');
      } else {
        onShowToast(`${editing ? 'បានកែប្រែ' : 'បានកត់ត្រាបញ្ហា'} ${row.barcode}${row.photos.length ? ` · ${row.photos.length} រូប` : ''}`, 'success');
      }
      resetForm();
    } catch (err: any) {
      onShowToast(err?.message || 'រក្សាទុកបរាជ័យ', 'error');
    } finally {
      setSaving(null);
    }
  };

  // ── row actions ──
  const pickPhotosFor = (p: ShipmentProblem) => {
    addPhotoTarget.current = p;
    addPhotoRef.current?.click();
  };

  const addPhotosToRow = async (files: File[]) => {
    const p = addPhotoTarget.current;
    if (addPhotoRef.current) addPhotoRef.current.value = '';
    if (!p || !files.length) return;
    const room = MAX_PHOTOS - p.photos.length;
    if (room <= 0) {
      onShowToast(`មួយបញ្ហាបានរូបភាពច្រើនបំផុត ${MAX_PHOTOS} សន្លឹក`, 'error');
      return;
    }
    setRowBusy(p.id);
    try {
      const list: string[] = [];
      for (const f of files.filter((x) => x.type.startsWith('image/')).slice(0, room)) list.push((await compressImageToWebP(f, 1600, 0.82)).dataUrl);
      const { row, failed, lastError } = await uploadPhotos(p, list);
      replaceRow(row);
      if (failed) onShowToast(`Upload រូប ${failed} សន្លឹកបរាជ័យ — ${lastError}`, 'error');
      else onShowToast(`បានបន្ថែម ${list.length} រូប ទៅ ${p.barcode}`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'បន្ថែមរូបបរាជ័យ', 'error');
    } finally {
      setSaving(null);
      setRowBusy(null);
    }
  };

  const handleRemovePhoto = async (problem: ShipmentProblem, photo: ProblemPhoto) => {
    if (!window.confirm('ដករូបនេះចេញពីបញ្ហានេះ? (ឯកសារនៅតែមានក្នុង Google Drive)')) return;
    try {
      const row = await removeProblemPhoto(photo.id);
      if (row) replaceRow(row);
      else replaceRow({ ...problem, photos: problem.photos.filter((x) => x.id !== photo.id) });
    } catch (err: any) {
      onShowToast(err?.message || 'ដករូបមិនបាន', 'error');
    }
  };

  const handleStatus = async (p: ShipmentProblem, status: ProblemStatus, resolveNote = '') => {
    setRowBusy(p.id);
    try {
      const row = await setProblemStatus(p.id, status, resolveNote);
      replaceRow(row);
      setData((d) => (d ? { ...d, open: d.open + (status === 'OPEN' ? 1 : -1), resolved: d.resolved + (status === 'RESOLVED' ? 1 : -1) } : d));
      onShowToast(status === 'RESOLVED' ? `បានដោះស្រាយ ${p.barcode}` : `បានបើកបញ្ហា ${p.barcode} ឡើងវិញ`, 'success');
      return true;
    } catch (err: any) {
      onShowToast(err?.message || 'ប្តូរស្ថានភាពមិនបាន', 'error');
      return false;
    } finally {
      setRowBusy(null);
    }
  };

  const handleDelete = async (p: ShipmentProblem) => {
    if (!window.confirm(`លុបបញ្ហា ${p.barcode}? (រូបភាពនៅតែមានក្នុង Google Drive)`)) return;
    setRowBusy(p.id);
    try {
      await deleteProblem(p.id);
      replaceRow(null, p.id);
      setData((d) => (d ? { ...d, [p.status === 'OPEN' ? 'open' : 'resolved']: Math.max(0, (p.status === 'OPEN' ? d.open : d.resolved) - 1) } : d));
      if (editing?.id === p.id) resetForm();
      onShowToast(`បានលុប ${p.barcode}`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'លុបមិនបាន', 'error');
    } finally {
      setRowBusy(null);
    }
  };

  const exportCsv = () => {
    const rows = data?.rows || [];
    if (!rows.length) return;
    const headers = ['Date', 'Barcode', 'Problem', 'Status', 'Location', 'Pieces', 'Note', 'Shipper', 'Consignee', 'Destination', 'Reported by', 'Reported at', 'Resolved by', 'Resolve note', 'Photos'];
    const body = rows.map((p) => [
      p.reportDate,
      p.barcode,
      `${problemTypeOf(p.problemType).label} (${problemTypeOf(p.problemType).en})`,
      p.status,
      p.location,
      p.pieces ?? '',
      p.note,
      p.linkInfo?.shipper || '',
      p.linkInfo?.consignee || '',
      p.linkInfo?.destination || '',
      p.createdBy || '',
      showDateTime(p.createdAt),
      p.resolvedBy || '',
      p.resolveNote,
      p.photos.map((x) => x.driveUrl).join(' '),
    ]);
    downloadCsv(`shipment_problems_${todayStr()}.csv`, formatCsv(headers, body));
  };

  const rows = data?.rows || [];
  const photoCount = images.length + (editing?.photos.length || 0);

  return (
    <div className="space-y-2 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <PackageX className="w-4 h-4" />
          </div>
          <h1 className="min-w-0 truncate text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            Shipment Problems
            <span className="hidden sm:inline ml-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">ទំនិញមានបញ្ហាពេលទៅដល់ទីតាំង + រូបបញ្ជាក់</span>
          </h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!rows.length}
            title="Export CSV"
            className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </button>
          <button
            type="button"
            onClick={load}
            title="Refresh"
            className="h-7 w-7 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Form */}
      {(canCreate || editing) && (
        <div
          className={`${cardCls} p-2 space-y-1.5 ${editing ? 'ring-2 ring-amber-400' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addImages(Array.from(e.dataTransfer.files || []));
          }}
        >
          {editing && (
            <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-amber-600 dark:text-amber-400">
              <span className="truncate">
                <Pencil className="inline w-3 h-3 mr-1" />
                កំពុងកែប្រែ {editing.barcode}
              </span>
              <button type="button" onClick={resetForm} className="shrink-0 underline">
                បោះបង់ការកែ
              </button>
            </div>
          )}

          {/* Row 1: barcode */}
          <div>
            <div className="min-w-0">
              <div className="relative min-w-0">
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
                      scanBarcode(barcode);
                    }
                  }}
                  onBlur={() => {
                    if (barcode.trim() && (!lookup || lookup.barcode !== barcode.trim().toUpperCase())) runLookup(barcode);
                  }}
                  placeholder="Barcode * (ស្កេន ឬវាយ)"
                  className={`${inputCls} pl-8 ${barcode && !editing ? 'pr-[74px]' : 'pr-12'} font-mono font-bold tracking-wide`}
                />
                {/* Clear + camera scan, built into the right side of the box */}
                <div className="absolute inset-y-0 right-0 flex items-center">
                  {barcode && !editing && (
                    <button
                      type="button"
                      onClick={resetForm}
                      title="សម្អាត"
                      className="mr-1 w-5 h-5 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    title="ស្កេនដោយកាមេរ៉ា"
                    className="h-full w-10 sm:w-9 flex items-center justify-center border-l border-slate-200 dark:border-slate-700 rounded-r-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:bg-rose-100 transition-colors"
                  >
                    <Camera className="w-[18px] h-[18px]" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* What the system knows about this barcode (one line) */}
          {lookupBusy && (
            <div className="text-[10.5px] text-slate-500 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> កំពុងស្វែងរក...
            </div>
          )}
          {!lookupBusy && lookup && (
            <div className="flex flex-wrap items-center gap-1 text-[10.5px] leading-tight">
              {openOthers.length > 0 && (
                <span
                  title={openOthers.map((p) => `${problemTypeOf(p.problemType).label} (${showDate(p.reportDate)}${p.location ? ` · ${p.location}` : ''})`).join('\n')}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 font-bold"
                >
                  <AlertTriangle className="w-3 h-3" /> មានបញ្ហាមិនទាន់ដោះស្រាយ {openOthers.length}
                </span>
              )}
              {notFound && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                  <AlertTriangle className="w-3 h-3" /> រកមិនឃើញក្នុង Data Report / Warehouse
                </span>
              )}
              {lookup.dataReport && (
                <span className="min-w-0 max-w-full truncate px-1.5 py-0.5 rounded-md border border-purple-200 bg-purple-50/60 dark:border-purple-900 dark:bg-purple-950/30 text-slate-700 dark:text-slate-300">
                  {lookup.dataReport.shipper || '—'} → <b>{lookup.dataReport.consignee || '—'}</b>
                  {[lookup.dataReport.destination, lookup.dataReport.status].filter(Boolean).map((x) => ` · ${x}`).join('')}
                </span>
              )}
              {lookup.warehouse[0] && (
                <span className="min-w-0 max-w-full truncate inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30 text-slate-700 dark:text-slate-300">
                  <Truck className="w-3 h-3 shrink-0 text-blue-600" />
                  {WAREHOUSE_STEP_LABEL[lookup.warehouse[0].type] || lookup.warehouse[0].type} · {showDate(lookup.warehouse[0].date)}
                  {lookup.warehouse[0].person ? ` · ${lookup.warehouse[0].person}` : ''}
                </span>
              )}
            </div>
          )}

          {/* Row 2: problem type · date */}
          <div className="grid grid-cols-[minmax(0,1fr)_128px] sm:grid-cols-[minmax(0,1fr)_150px] gap-1.5">
            <div className="relative min-w-0">
              <AlertTriangle className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${problemType ? 'text-rose-500' : 'text-slate-400'}`} />
              <select
                value={problemType || ''}
                onChange={(e) => setProblemType((e.target.value || null) as ProblemType | null)}
                title="ប្រភេទបញ្ហា"
                className={`${inputCls} pl-8 pr-2 appearance-auto font-semibold ${problemType ? 'text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800' : '!text-slate-400'}`}
              >
                <option value="" disabled>
                  ប្រភេទបញ្ហា *
                </option>
                {PROBLEM_TYPES.map((t) => (
                  <option key={t.id} value={t.id} className="text-slate-900 dark:text-white">
                    {t.label} ({t.en})
                  </option>
                ))}
              </select>
            </div>
            <input
              type="date"
              value={reportDate}
              title="កាលបរិច្ឆេទ"
              onChange={(e) => setReportDate(e.target.value || todayStr())}
              className={`${inputCls} !text-xs !px-1.5 min-w-0`}
            />
          </div>

          {/* Row 3: note · photos · save */}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => addImages(Array.from(e.target.files || []))} />
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addImages(Array.from(e.target.files || []))} />
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-1.5">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ពិពណ៌នាបញ្ហា (ឧ. ប្រអប់បែកជ្រុង ខូច ២ ដុំ)"
              className={`${inputCls} col-span-3 sm:col-span-1`}
            />
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={photoCount >= MAX_PHOTOS}
              title="ថតរូប"
              className="h-10 sm:h-9 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1"
            >
              <Camera className="w-3.5 h-3.5" /> ថតរូប
              {photoCount > 0 && <span className="ml-0.5 px-1 rounded bg-white/25 text-[10px]">{photoCount}</span>}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={photoCount >= MAX_PHOTOS}
              title={`ជ្រើសរូប (អតិបរមា ${MAX_PHOTOS} · Ctrl+V ឬអូសរូបមកដាក់)`}
              className="h-10 sm:h-9 w-10 sm:w-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              title={!problemType && barcode.trim() ? 'សូមជ្រើសរើសប្រភេទបញ្ហាជាមុនសិន' : undefined}
              className="h-10 sm:h-9 px-4 rounded-lg bg-emerald-600 shadow-sm hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center gap-1"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              រក្សាទុក
            </button>
          </div>

          {(images.length > 0 || imageBusy || (editing?.photos.length || 0) > 0) && (
            <div className="flex flex-wrap items-center gap-1">
              {editing?.photos.map((ph) => (
                <img
                  key={ph.id}
                  src={driveThumb(ph.driveFileId, 120)}
                  alt="photo"
                  title="រូបដែលបានរក្សាទុករួច"
                  className="h-10 w-10 rounded-md object-cover border border-slate-200 dark:border-slate-700 opacity-75"
                />
              ))}
              {images.map((src, i) => (
                <div key={i} className="relative h-10 w-10 rounded-md overflow-hidden border-2 border-rose-300 dark:border-rose-700 bg-slate-100">
                  <img src={src} alt="new" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, k) => k !== i))}
                    className="absolute top-0 right-0 w-4 h-4 rounded-bl bg-black/60 text-white flex items-center justify-center"
                    title="ដករូបចេញ"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              {imageBusy && (
                <div className="h-10 w-10 rounded-md border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                </div>
              )}
              <span className="text-[10px] text-slate-400 ml-1">
                {photoCount}/{MAX_PHOTOS}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Filters: one row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="w-full sm:w-auto flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold shrink-0">
          {(
            [
              ['OPEN', 'មិនទាន់', data?.open ?? 0],
              ['RESOLVED', 'រួច', data?.resolved ?? 0],
              ['ALL', 'ទាំងអស់', (data?.open ?? 0) + (data?.resolved ?? 0)],
            ] as [StatusTab, string, number][]
          ).map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusTab(id)}
              className={`flex-1 sm:flex-none px-2.5 h-7 rounded-md flex items-center justify-center gap-1 ${
                statusTab === id ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {label}
              <span
                className={`min-w-[18px] px-1 rounded-full text-[10px] leading-4 ${
                  statusTab === id ? (id === 'RESOLVED' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white') : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                {n}
              </span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-0 sm:order-last">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ស្វែងរក..." className={`${inputCls} !h-8 pl-8`} />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ProblemType | '')} className={`${inputCls} !h-8 !w-[92px] sm:!w-auto text-[11px] px-1.5`}>
          <option value="">គ្រប់ប្រភេទ</option>
          {PROBLEM_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select value={preset} onChange={(e) => setPreset(e.target.value as DatePreset)} className={`${inputCls} !h-8 !w-[78px] sm:!w-auto text-[11px] px-1.5`}>
          <option value="ALL">គ្រប់ថ្ងៃ</option>
          <option value="TODAY">ថ្ងៃនេះ</option>
          <option value="WEEK">៧ ថ្ងៃ</option>
          <option value="MONTH">ខែនេះ</option>
          <option value="CUSTOM">ជ្រើសថ្ងៃ...</option>
        </select>
        {preset === 'CUSTOM' && (
          <div className="w-full sm:w-auto flex items-center gap-1">
            <input type="date" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} className={`${inputCls} !h-8 flex-1 sm:!w-32 !text-xs !px-1.5`} />
            <span className="text-slate-400 text-xs">→</span>
            <input type="date" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} className={`${inputCls} !h-8 flex-1 sm:!w-32 !text-xs !px-1.5`} />
          </div>
        )}
      </div>

      {/* List */}
      {loading && !data ? (
        <div className="flex items-center justify-center p-8 text-slate-500 text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> កំពុងទាញទិន្នន័យ...
        </div>
      ) : !rows.length ? (
        <div className="py-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          {statusTab === 'OPEN' && !debounced && !typeFilter ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> គ្មានបញ្ហាមិនទាន់ដោះស្រាយទេ
            </>
          ) : (
            <>
              <PackageX className="w-4 h-4" /> មិនមានទិន្នន័យត្រូវនឹងការស្វែងរក
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-1.5">
          {rows.map((p) => {
            const busy = rowBusy === p.id;
            const link = p.linkInfo && (p.linkInfo.shipper || p.linkInfo.consignee) ? p.linkInfo : null;
            return (
              <div key={p.id} className={`${cardCls} px-2 py-1.5 border-l-4 ${p.status === 'OPEN' ? 'border-l-rose-500' : 'border-l-emerald-500'} ${busy ? 'opacity-60' : ''}`}>
                {/* Line 1: barcode · badges · actions */}
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-[13px] text-slate-900 dark:text-white select-all truncate">{p.barcode}</span>
                  <TypeBadge type={p.problemType} />
                  {p.pieces !== null && <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">{p.pieces} pcs</span>}
                  <div className="ml-auto flex items-center gap-0.5 shrink-0">
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 mr-0.5" />}
                    {(canEditRow(p) || canResolve) && p.photos.length < MAX_PHOTOS && (
                      <button type="button" disabled={busy} onClick={() => pickPhotosFor(p)} title="បន្ថែមរូប" className="w-7 h-7 rounded-md text-rose-600 dark:text-rose-400 flex items-center justify-center hover:bg-rose-50 dark:hover:bg-rose-950/40">
                        <Camera className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canEditRow(p) && (
                      <button type="button" disabled={busy} onClick={() => startEdit(p)} title="កែប្រែ" className="w-7 h-7 rounded-md text-slate-500 dark:text-slate-400 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canDeleteRow(p) && (
                      <button type="button" disabled={busy} onClick={() => handleDelete(p)} title="លុប" className="w-7 h-7 rounded-md text-rose-500 flex items-center justify-center hover:bg-rose-50 dark:hover:bg-rose-950/40">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canResolve &&
                      (p.status === 'OPEN' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setResolving({ problem: p, note: '', busy: false })}
                          className="h-7 px-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-bold flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">ដោះស្រាយ</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleStatus(p, 'OPEN')}
                          title="បើកឡើងវិញ"
                          className="w-7 h-7 rounded-md text-slate-500 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      ))}
                  </div>
                </div>

                {/* Line 2: date · location · who · shipper → consignee */}
                <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                  {showDate(p.reportDate)}
                  {p.location ? ` · 📍${p.location}` : ''} · {p.createdBy || '—'}
                  {link && (
                    <span className="text-slate-600 dark:text-slate-300">
                      {' '}
                      · {link.shipper || '—'} → <b>{link.consignee || '—'}</b>
                    </span>
                  )}
                </div>

                {(p.note || p.photos.length > 0) && (
                  <div className="mt-1 flex items-start gap-1.5">
                    {p.photos.length > 0 && (
                      <div className="flex gap-1 shrink-0">
                        {p.photos.slice(0, 4).map((ph, i) => (
                          <button
                            key={ph.id}
                            type="button"
                            onClick={() => setViewer({ problem: p, index: i })}
                            className="relative h-11 w-11 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"
                          >
                            <img src={driveThumb(ph.driveFileId, 120)} alt="proof" loading="lazy" className="w-full h-full object-cover" />
                            {i === 3 && p.photos.length > 4 && (
                              <span className="absolute inset-0 bg-black/55 text-white text-[11px] font-bold flex items-center justify-center">+{p.photos.length - 4}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {p.note && <p className="min-w-0 text-[11.5px] text-slate-800 dark:text-slate-200 line-clamp-3 break-words" title={p.note}>{p.note}</p>}
                  </div>
                )}

                {p.status === 'RESOLVED' && (
                  <div className="mt-1 text-[10.5px] text-emerald-700 dark:text-emerald-400 truncate" title={p.resolveNote}>
                    ✓ {p.resolvedBy || '—'} {showDateTime(p.resolvedAt)}
                    {p.resolveNote ? ` — ${p.resolveNote}` : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {data && data.total > rows.length && (
        <p className="text-center text-[11px] text-slate-500">
          បង្ហាញ {rows.length} ក្នុងចំណោម {data.total} — សូមប្រើតម្រង ឬស្វែងរក ដើម្បីរកកំណត់ត្រាចាស់ៗ
        </p>
      )}

      <input
        ref={addPhotoRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => addPhotosToRow(Array.from(e.target.files || []))}
      />

      {/* Resolve dialog */}
      {resolving && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-3" onClick={() => !resolving.busy && setResolving(null)}>
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">ដោះស្រាយបញ្ហា {resolving.problem.barcode}</h3>
            <p className="text-[11px] text-slate-500 mb-2">
              <TypeBadge type={resolving.problem.problemType} /> {resolving.problem.location}
            </p>
            <label className={labelCls}>របៀបដោះស្រាយ (មិនបាច់)</label>
            <textarea
              autoFocus
              rows={3}
              value={resolving.note}
              onChange={(e) => setResolving((r) => (r ? { ...r, note: e.target.value } : r))}
              placeholder="ឧ. បានសងប្រាក់ជូនអតិថិជន / ផ្ញើទំនិញថ្មីជំនួស..."
              className={`${inputCls} h-auto py-2`}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                disabled={resolving.busy}
                onClick={() => setResolving(null)}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                បោះបង់
              </button>
              <button
                type="button"
                disabled={resolving.busy}
                onClick={async () => {
                  setResolving((r) => (r ? { ...r, busy: true } : r));
                  const ok = await handleStatus(resolving.problem, 'RESOLVED', resolving.note.trim());
                  if (ok) setResolving(null);
                  else setResolving((r) => (r ? { ...r, busy: false } : r));
                }}
                className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1"
              >
                {resolving.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                បញ្ជាក់ថាដោះស្រាយរួច
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo viewer */}
      {viewer && viewer.problem.photos[viewer.index] && (
        <div className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-3" onClick={() => setViewer(null)}>
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 mb-2 text-white">
              <div className="min-w-0 text-xs">
                <span className="font-mono font-bold">{viewer.problem.barcode}</span> · {problemTypeOf(viewer.problem.problemType).label} · រូប {viewer.index + 1}/{viewer.problem.photos.length}
                <div className="text-white/60 text-[10.5px]">
                  {viewer.problem.photos[viewer.index].createdBy} {showDateTime(viewer.problem.photos[viewer.index].createdAt)}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {canEditRow(viewer.problem) && (
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(viewer.problem, viewer.problem.photos[viewer.index])}
                    title="ដករូបនេះចេញ"
                    className="w-8 h-8 rounded-md bg-white/15 hover:bg-rose-600 flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <a
                  href={viewer.problem.photos[viewer.index].driveUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="បើកក្នុង Google Drive"
                  className="w-8 h-8 rounded-md bg-white/15 hover:bg-white/25 flex items-center justify-center"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button type="button" onClick={() => setViewer(null)} className="w-8 h-8 rounded-md bg-white/15 hover:bg-white/25 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="relative">
              <img
                src={driveThumb(viewer.problem.photos[viewer.index].driveFileId, 1600)}
                alt="proof"
                className="w-full max-h-[78vh] object-contain rounded-lg bg-black"
              />
              {viewer.problem.photos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setViewer((v) => (v ? { ...v, index: (v.index - 1 + v.problem.photos.length) % v.problem.photos.length } : v))}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewer((v) => (v ? { ...v, index: (v.index + 1) % v.problem.photos.length } : v))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        autoCloseOnScan={true}
        onScanSuccess={(decoded) => {
          setScannerOpen(false);
          scanBarcode(decoded);
          return { success: true };
        }}
      />

      {saving && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[70] px-3 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold shadow-lg flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {saving}
        </div>
      )}
    </div>
  );
};

export default ShipmentProblemsPage;
