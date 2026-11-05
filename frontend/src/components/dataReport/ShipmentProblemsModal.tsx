import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Barcode,
  Calendar,
  Camera,
  CheckCircle2,
  FileText,
  ImagePlus,
  Loader2,
  Maximize2,
  PackageX,
  Pencil,
  X
} from 'lucide-react';
import { AppSettings, AuthUser } from '../../types';
import { compressImageToWebP } from '../../utils/compression';
import { sanitizeTrackingCode } from '../../utils/sanitizeTracking';
import { playScanSound, playWarningSound } from '../../utils/scannerSound';
import { ScannerSoundSettingsPopover } from '../ScannerSoundSettingsPopover';
import {
  PROBLEM_TYPES,
  ProblemLookup,
  ProblemType,
  ShipmentProblem,
  addProblemPhoto,
  lookupProblemBarcode,
  problemTypeOf,
  saveProblem
} from '../../services/shipmentProblemService';

const BarcodeScannerModal = React.lazy(() =>
  import('../BarcodeScannerModal').then((m) => ({ default: m.BarcodeScannerModal }))
);

const MAX_PHOTOS = 10;

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => ymd(new Date());
const showDate = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');

const inputCls =
  'w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 transition';
const labelCls = 'block text-[11.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1';

interface ShipmentProblemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  settings?: AppSettings;
  prefilledBarcode?: string;
  /** Open problems (shown in the footer link) */
  openCount?: number;
  onChanged?: () => void;
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
}

/** Quick "report a shipment problem" form over Data Report, styled like the Distribution Report form. */
export const ShipmentProblemsModal: React.FC<ShipmentProblemsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  settings,
  prefilledBarcode = '',
  openCount = 0,
  onChanged,
  onNotify
}) => {
  const role = String(currentUser?.role || '').toUpperCase();
  const isAdmin = role === 'ADMIN';
  const isViewer = role === 'VIEWER';
  const myEmail = String(currentUser?.email || '').toLowerCase();
  const canCreate = isAdmin || (!isViewer && currentUser?.canCreate !== false);
  const canEditRow = (p: ShipmentProblem) =>
    isAdmin || (!isViewer && String(p.operatorEmail || '').toLowerCase() === myEmail && currentUser?.canEdit !== false);

  const [editing, setEditing] = useState<ShipmentProblem | null>(null);
  const [barcode, setBarcode] = useState('');
  const [problemType, setProblemType] = useState<ProblemType | ''>('');
  const [reportDate, setReportDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<ProblemLookup | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const lookupSeq = useRef(0);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setEditing(null);
    setBarcode('');
    setProblemType('');
    setReportDate(todayStr());
    setNote('');
    setImages([]);
    setFormError(null);
    setLookup(null);
    lookupSeq.current++;
    setLookupBusy(false);
  }, []);

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
        if (r.existing.some((p) => p.status === 'OPEN')) playWarningSound();
        else playScanSound();
      } catch (err: any) {
        if (seq === lookupSeq.current) onNotify(err?.message || 'ស្វែងរក Barcode មិនបាន', 'error');
      } finally {
        if (seq === lookupSeq.current) setLookupBusy(false);
      }
    },
    [onNotify]
  );

  const scanBarcode = (raw: string) => {
    const code = sanitizeTrackingCode(raw).toUpperCase();
    if (!code) return;
    setBarcode(code);
    setFormError(null);
    runLookup(code);
  };

  // Fresh form each time the popup opens (with the row's barcode when opened from a row)
  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    if (prefilledBarcode.trim()) {
      const code = sanitizeTrackingCode(prefilledBarcode).toUpperCase();
      setBarcode(code);
      runLookup(code);
    }
    setTimeout(() => barcodeRef.current?.focus(), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prefilledBarcode]);

  const addImages = async (files: File[]) => {
    const room = MAX_PHOTOS - images.length - (editing?.photos.length || 0);
    if (room <= 0) {
      onNotify(`មួយបញ្ហាបានរូបភាពច្រើនបំផុត ${MAX_PHOTOS} សន្លឹក`, 'error');
      return;
    }
    const list = files.filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (!list.length) return;
    setImageBusy(true);
    try {
      const out: string[] = [];
      for (const f of list) out.push((await compressImageToWebP(f, 1600, 0.82)).dataUrl);
      setImages((prev) => [...prev, ...out].slice(0, MAX_PHOTOS));
    } catch (err: any) {
      onNotify(err?.message || 'មិនអាចអានរូបភាពបានទេ', 'error');
    } finally {
      setImageBusy(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Ctrl+V an image while the popup is open
  const addImagesRef = useRef(addImages);
  addImagesRef.current = addImages;
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  const startEdit = (p: ShipmentProblem) => {
    setEditing(p);
    setBarcode(p.barcode);
    setProblemType(p.problemType);
    setReportDate(p.reportDate || todayStr());
    setNote(p.note);
    setImages([]);
    setFormError(null);
  };

  const handleSave = async () => {
    const code = sanitizeTrackingCode(barcode).toUpperCase();
    if (!code) return setFormError('សូមបញ្ចូល Barcode');
    if (!problemType) return setFormError('សូមជ្រើសរើសប្រភេទបញ្ហា');
    if (editing ? !canEditRow(editing) : !canCreate) return setFormError('អ្នកមិនមានសិទ្ធិរក្សាទុកទេ');
    setFormError(null);
    setSaving('កំពុងរក្សាទុក...');
    try {
      let row = await saveProblem({
        id: editing?.id,
        barcode: code,
        problemType,
        location: editing?.location || '',
        pieces: editing?.pieces ?? null,
        note: note.trim(),
        reportDate
      });
      let failed = 0;
      let lastError = '';
      for (let i = 0; i < images.length; i++) {
        setSaving(`កំពុង Upload រូប ${i + 1}/${images.length}...`);
        try {
          row = await addProblemPhoto(row.id, images[i], settings?.webAppUrl);
        } catch (err: any) {
          failed++;
          lastError = err?.message || '';
        }
      }
      if (failed) onNotify(`បានរក្សាទុក ${row.barcode} ប៉ុន្តែ Upload រូប ${failed} សន្លឹកបរាជ័យ — ${lastError}`, 'error');
      else onNotify(`✓ ${editing ? 'បានកែប្រែ' : 'បានកត់ត្រាបញ្ហា'} ${row.barcode}${row.photos.length ? ` · ${row.photos.length} រូប` : ''}`, 'success');
      onChanged?.();
      resetForm();
      setTimeout(() => barcodeRef.current?.focus(), 50);
    } catch (err: any) {
      setFormError(err?.message || 'រក្សាទុកបរាជ័យ');
    } finally {
      setSaving(null);
    }
  };

  const handleOpenFullPage = () => {
    onClose();
    window.location.hash = '#shipment_problems';
  };

  if (!isOpen) return null;

  const openOthers = lookup ? lookup.existing.filter((p) => p.id !== editing?.id && p.status === 'OPEN') : [];
  const info = lookup?.dataReport;
  const notFound = lookup && !lookup.dataReport && !lookup.warehouse.length;
  const photoCount = images.length + (editing?.photos.length || 0);
  const busy = !!saving || imageBusy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addImages(Array.from(e.dataTransfer.files || []));
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-rose-500 to-red-500 text-white flex items-center justify-center shadow-sm shadow-rose-500/20 shrink-0">
              <PackageX className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight truncate">
                {editing ? 'កែប្រែបញ្ហាទំនិញ' : 'បញ្ចូលបញ្ហាទំនិញថ្មី'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Shipment Problems (Barcode, ប្រភេទបញ្ហា, ពិពណ៌នា, រូបភាព)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ScannerSoundSettingsPopover size="sm" />
            <button
              type="button"
              onClick={handleOpenFullPage}
              className="h-7 px-2.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer border border-rose-200 dark:border-rose-800/60 shrink-0 whitespace-nowrap active:scale-95"
              title="បើកទំព័រ Shipment Problems ពេញលេញ"
            >
              <Maximize2 className="w-3.5 h-3.5 shrink-0" />
              <span>ទំព័រពេញ</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
              title="បិទ (Close)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {formError && (
            <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
              <span>{formError}</span>
            </div>
          )}

          {editing && (
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-[11px] font-bold text-amber-700 dark:text-amber-300">
              <span className="truncate">
                <Pencil className="inline w-3 h-3 mr-1" />
                កំពុងកែប្រែបញ្ហា {editing.barcode} ({showDate(editing.reportDate)})
              </span>
              <button type="button" onClick={resetForm} className="shrink-0 underline cursor-pointer">
                បោះបង់ការកែ
              </button>
            </div>
          )}

          {/* 1. Barcode */}
          <div>
            <div className="flex items-center justify-between mb-1 gap-2">
              <label className="text-[11.5px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Barcode className="w-3.5 h-3.5 text-rose-500" />
                <span>BARCODE (លេខបាកូដ / AWBN)</span>
                <span className="text-red-500">*</span>
              </label>
              {lookupBusy && (
                <span className="text-[10.5px] text-slate-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> កំពុងស្វែងរក...
                </span>
              )}
              {!lookupBusy && info && (
                <span className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> ក្នុង Data Report
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  ref={barcodeRef}
                  type="text"
                  placeholder="e.g. E12812211249 ឬ Scan..."
                  value={barcode}
                  disabled={!!editing}
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
                  className={`w-full px-3 py-1.5 rounded-lg border font-mono text-xs uppercase focus:outline-none focus:ring-2 transition disabled:opacity-70 ${
                    openOthers.length
                      ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 focus:ring-amber-500'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-rose-500'
                  }`}
                />
                {barcode && !editing && (
                  <button
                    type="button"
                    onClick={() => {
                      setBarcode('');
                      setLookup(null);
                      lookupSeq.current++;
                      setLookupBusy(false);
                      barcodeRef.current?.focus();
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                disabled={!!editing}
                onClick={() => setIsScannerOpen(true)}
                className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 flex items-center gap-1 text-[11px] font-bold transition shrink-0 cursor-pointer disabled:opacity-50"
                title="Scan Barcode តាមកាមេរ៉ា"
              >
                <Camera className="w-3.5 h-3.5 text-rose-500" />
                <span>Camera</span>
              </button>
            </div>

            {/* Already reported and still open */}
            {openOthers.length > 0 && (
              <div className="mt-1.5 p-2.5 rounded-xl border bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 text-[11px] flex items-start justify-between gap-2">
                <div className="flex items-start gap-1.5 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-bold">⚠️ Barcode នេះមានបញ្ហាមិនទាន់ដោះស្រាយ {openOthers.length}</div>
                    <div className="text-[10.5px] opacity-90 truncate">
                      {problemTypeOf(openOthers[0].problemType).label} ({showDate(openOthers[0].reportDate)})
                      {openOthers[0].note ? ` — ${openOthers[0].note}` : ''}
                    </div>
                  </div>
                </div>
                {canEditRow(openOthers[0]) && (
                  <button
                    type="button"
                    onClick={() => startEdit(openOthers[0])}
                    className="shrink-0 self-center px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10.5px] cursor-pointer"
                  >
                    កែប្រែចាស់
                  </button>
                )}
              </div>
            )}

            {!lookupBusy && notFound && (
              <div className="mt-1.5 text-[10.5px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> រកមិនឃើញក្នុង Data Report / ឃ្លាំង (នៅតែអាចរក្សាទុកបាន)
              </div>
            )}

            {info && (
              <div className="mt-1.5 p-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-[11px] space-y-0.5">
                <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                  <span>ព័ត៌មានកញ្ចប់ក្នុងប្រព័ន្ធ៖</span>
                  {info.status && (
                    <span className="px-1.5 rounded-full text-[9.5px] bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-mono">
                      {info.status}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-slate-600 dark:text-slate-300 text-[10.5px]">
                  {info.shipper && (
                    <div className="truncate">
                      <span className="font-semibold text-slate-500">Shipper:</span> {info.shipper}
                    </div>
                  )}
                  {info.consignee && (
                    <div className="truncate">
                      <span className="font-semibold text-slate-500">Consignee:</span> {info.consignee}
                    </div>
                  )}
                  {info.destination && (
                    <div className="truncate">
                      <span className="font-semibold text-slate-500">Dest:</span> {info.destination}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Problem type & 3. Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className={labelCls}>
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                <span>ប្រភេទបញ្ហា</span>
                <span className="text-red-500">*</span>
              </label>
              <select
                value={problemType}
                onChange={(e) => {
                  setProblemType(e.target.value as ProblemType);
                  setFormError(null);
                }}
                className={inputCls}
              >
                <option value="">— ជ្រើសរើសប្រភេទបញ្ហា —</option>
                {PROBLEM_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} ({t.en})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={`${labelCls} justify-between`}>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-rose-500" />
                  <span>DATE (កាលបរិច្ឆេទ)</span>
                  <span className="text-red-500">*</span>
                </span>
                <button
                  type="button"
                  onClick={() => setReportDate(todayStr())}
                  className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  ថ្ងៃនេះ
                </button>
              </label>
              <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* 4. Description */}
          <div>
            <label className={labelCls}>
              <FileText className="w-3.5 h-3.5 text-rose-500" />
              <span>ពិពណ៌នា (Description)</span>
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ពិពណ៌នាបញ្ហា (ឧ. ប្រអប់បែកជ្រុង ខូច ២ ដប...)"
              className={`${inputCls} resize-y min-h-[52px]`}
            />
          </div>

          {/* 5. Photos */}
          <div>
            <label className={`${labelCls} justify-between`}>
              <span className="flex items-center gap-1">
                <ImagePlus className="w-3.5 h-3.5 text-rose-500" />
                <span>រូបភាពបញ្ជាក់</span>
              </span>
              <span className="text-[10px] font-medium text-slate-400">
                {photoCount}/{MAX_PHOTOS} · អាច Ctrl+V ឬអូសទម្លាក់
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={busy || photoCount >= MAX_PHOTOS}
                onClick={() => cameraRef.current?.click()}
                className="h-8 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {imageBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                ថតរូប
              </button>
              <button
                type="button"
                disabled={busy || photoCount >= MAX_PHOTOS}
                onClick={() => fileRef.current?.click()}
                className="h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <ImagePlus className="w-3.5 h-3.5 text-rose-500" />
                ជ្រើសរូប
              </button>
              {images.map((src, i) => (
                <div key={i} className="relative w-10 h-10 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute top-0 right-0 w-4 h-4 bg-black/60 text-white flex items-center justify-center rounded-bl cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => addImages(Array.from(e.target.files || []))}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addImages(Array.from(e.target.files || []))}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
          <button
            type="button"
            onClick={handleOpenFullPage}
            className="text-[11.5px] text-rose-600 dark:text-rose-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer min-w-0"
          >
            <Maximize2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">មើលបញ្ហាទាំងអស់ ({openCount} មិនទាន់ដោះស្រាយ)</span>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-semibold transition cursor-pointer"
            >
              បិទ (Close)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-600 hover:to-red-600 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span className="max-w-[160px] truncate">{saving || (editing ? 'កែប្រែ' : 'រក្សាទុក (Save)')}</span>
            </button>
          </div>
        </div>
      </div>

      {isScannerOpen && (
        <React.Suspense fallback={null}>
          <BarcodeScannerModal
            isOpen={isScannerOpen}
            onClose={() => setIsScannerOpen(false)}
            onScanSuccess={(decoded) => {
              setIsScannerOpen(false);
              scanBarcode(decoded);
            }}
            autoCloseOnScan={true}
          />
        </React.Suspense>
      )}
    </div>
  );
};

export default ShipmentProblemsModal;
