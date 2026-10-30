import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Barcode,
  Camera,
  CheckCircle2,
  HardDrive,
  Pencil,
  Printer,
  RefreshCw,
  Save,
  ScanLine,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wand2,
  X,
  XCircle,
} from 'lucide-react';
import { AuthUser } from '../types';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { playScanSound, playWarningSound } from '../utils/scannerSound';
import { code128Svg, isCode128Encodable } from '../utils/code128';
import {
  BarcodeLabel,
  deleteLabels,
  findByBarcode,
  listLabels,
  markPrinted,
  nextBarcodes,
  normalizeBarcode,
  saveLabel,
  setLabelActive,
} from '../services/barcodeLabelService';

interface BarcodeLabelsPageProps {
  currentUser: AuthUser | null;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

type ActiveFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type VerifyResult = { code: string; label?: BarcodeLabel } | null;

const LABEL_SIZES = [
  { id: '40x30', w: 40, h: 30, name: '40 × 30 mm' },
  { id: '50x30', w: 50, h: 30, name: '50 × 30 mm' },
  { id: '60x40', w: 60, h: 40, name: '60 × 40 mm' },
  { id: '75x50', w: 75, h: 50, name: '75 × 50 mm' },
  { id: '100x50', w: 100, h: 50, name: '100 × 50 mm' },
  { id: '100x150', w: 100, h: 150, name: '100 × 150 mm' },
] as const;

const PREF_KEY = 'ial_barcode_label_prefs';
type Prefs = { size: string; copies: number; prefix: string; company: string; auto: boolean; digits: number; sizeV2?: boolean };
const DEFAULT_PREFS: Prefs = { size: '40x30', copies: 1, prefix: 'IAL', company: '', auto: true, digits: 8, sizeV2: true };
const MAX_QTY = 500;

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULT_PREFS;
    const saved = JSON.parse(raw);
    // One-time switch of older saved prefs to the new 40 × 30 mm default size.
    if (!saved.sizeV2) { saved.size = DEFAULT_PREFS.size; saved.sizeV2 = true; }
    return { ...DEFAULT_PREFS, ...saved };
  } catch {
    return DEFAULT_PREFS;
  }
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => ymd(new Date());
const showDate = (d?: string) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const inputCls =
  'w-full h-10 sm:h-9 px-2.5 rounded-lg text-sm sm:text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500';
const labelCls = 'block text-[11px] sm:text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-0.5';
const cardCls = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm';
const iconBtnCls =
  'w-7 h-7 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0';
const btnCls =
  'h-9 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed';

/** One label as HTML, sized by the print page. Used by the print window and the preview. */
function labelHtml(l: Pick<BarcodeLabel, 'barcode' | 'date' | 'companyName' | 'active'>) {
  return `<div class="lbl">
    <div class="bars">${code128Svg(l.barcode)}</div>
    <div class="num">${esc(l.barcode)}</div>
  </div>`;
}

const labelCss = (w: number, h: number) => `
  .lbl{width:${w}mm;height:${h}mm;box-sizing:border-box;padding:1.5mm 2.5mm;display:flex;flex-direction:column;
    align-items:center;justify-content:space-between;overflow:hidden;background:#fff;color:#000;
    font-family:'Kantumruy Pro','Noto Sans Khmer','Khmer OS',Arial,sans-serif;}
  .lbl .bars{width:100%;flex:1;min-height:0;margin:0.8mm 0;}
  .lbl .bars svg{display:block;width:100%;height:100%;}
  .lbl .num{font-family:'Courier New',monospace;font-weight:700;font-size:${Math.max(9, Math.min(16, h * 0.34))}pt;letter-spacing:0.5px;line-height:1.1;}
`;

/** Prints labels through a hidden iframe (no popup blocker). */
function printLabels(labels: BarcodeLabel[], size: { w: number; h: number }, copies: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = labels
      .flatMap(l => Array.from({ length: copies }, () => `<div class="page">${labelHtml(l)}</div>`))
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Barcode Labels</title>
      <style>
        @page{size:${size.w}mm ${size.h}mm;margin:0;}
        html,body{margin:0;padding:0;}
        /* A little under the page height so rounding never spills a blank extra page. */
        .page{width:${size.w}mm;height:${size.h - 0.5}mm;overflow:hidden;}
        .page + .page{page-break-before:always;break-before:page;}
        ${labelCss(size.w, size.h - 0.5)}
      </style></head><body>${body}</body></html>`;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      iframe.remove();
      reject(new Error('Print មិនបាន'));
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    const go = () => {
      try {
        win.focus();
        win.print();
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        setTimeout(() => iframe.remove(), 60_000);
      }
    };
    // Give the browser a moment to lay out SVGs / fonts.
    const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) fonts.ready.then(() => setTimeout(go, 150)).catch(() => setTimeout(go, 150));
    else setTimeout(go, 300);
  });
}

const ActiveBadge: React.FC<{ active: boolean }> = ({ active }) =>
  active ? (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
      <ShieldCheck className="w-3 h-3" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
      <ShieldAlert className="w-3 h-3" /> Inactive
    </span>
  );

const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; title?: string }> = ({ checked, onChange, title }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    title={title}
    onClick={() => onChange(!checked)}
    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
  >
    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
  </button>
);

export const BarcodeLabelsPage: React.FC<BarcodeLabelsPageProps> = ({ currentUser, onShowToast }) => {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [rows, setRows] = useState<BarcodeLabel[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [barcode, setBarcode] = useState('');
  const [date, setDate] = useState(todayStr());
  const [companyName, setCompanyName] = useState(prefs.company);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qty, setQty] = useState(1);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Verify
  const [verifyCode, setVerifyCode] = useState('');
  const [verify, setVerify] = useState<VerifyResult>(null);
  const verifyRef = useRef<HTMLInputElement>(null);

  // List
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ActiveFilter>('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [scanTarget, setScanTarget] = useState<'FORM' | 'VERIFY' | null>(null);

  const size = LABEL_SIZES.find(s => s.id === prefs.size) || LABEL_SIZES[0];

  const updatePrefs = (p: Partial<Prefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...p };
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listLabels());
    } catch (e) {
      onShowToast(e instanceof Error ? e.message : 'អានទិន្នន័យមិនបាន', 'error');
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto mode: always show the next free number (refreshes after every save).
  const autoOn = prefs.auto && !editingId;
  const digits = Math.min(10, Math.max(3, Number(prefs.digits) || 8));
  useEffect(() => {
    if (!autoOn || loading) return;
    let cancelled = false;
    nextBarcodes(prefs.prefix || '', 1, digits)
      .then(([c]) => {
        if (!cancelled) setBarcode(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [autoOn, prefs.prefix, digits, rows, loading]);

  const companies = useMemo(
    () => Array.from(new Set<string>(rows.map(r => r.companyName).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filter === 'ACTIVE' && !r.active) return false;
      if (filter === 'INACTIVE' && r.active) return false;
      if (!q) return true;
      return r.barcode.toLowerCase().includes(q) || r.companyName.toLowerCase().includes(q) || showDate(r.date).includes(q);
    });
  }, [rows, search, filter]);

  const counts = useMemo(() => ({ all: rows.length, active: rows.filter(r => r.active).length }), [rows]);

  const code = normalizeBarcode(barcode);
  const codeValid = !code || isCode128Encodable(code);

  const resetForm = (keepCompany = true) => {
    setEditingId(null);
    setBarcode('');
    setDate(todayStr());
    if (!keepCompany) setCompanyName(prefs.company);
    setActive(true);
    setQty(1);
    setTimeout(() => barcodeRef.current?.focus(), 0);
  };

  // Auto mode: create `qty` labels with running numbers in one go.
  const submitAuto = async (alsoPrint: boolean) => {
    if (!date) return onShowToast('សូមជ្រើសរើស Date', 'error');
    if (!companyName.trim()) return onShowToast('សូមបញ្ចូល Company name', 'error');
    if (alsoPrint && !active) return onShowToast('Label Inactive មិនអាច Print បានទេ', 'error');
    const n = Math.max(1, Math.min(MAX_QTY, qty || 1));
    setSaving(true);
    try {
      const codes = await nextBarcodes(prefs.prefix || '', n, digits);
      if (!isCode128Encodable(codes[0])) throw new Error('Prefix ប្រើបានតែអក្សរឡាតាំង លេខ និងសញ្ញា');
      const saved: BarcodeLabel[] = [];
      for (const c of codes) {
        saved.push(await saveLabel({ barcode: c, date, companyName, active }, currentUser?.email || currentUser?.name));
      }
      updatePrefs({ company: companyName.trim() });
      onShowToast(n > 1 ? `បានបង្កើត ${n} Label (${codes[0]} → ${codes[n - 1]})` : `បានរក្សាទុក ${codes[0]}`, 'success');
      if (alsoPrint) {
        await printLabels(saved, size, prefs.copies);
        await markPrinted(saved.map(r => r.id));
      }
      setQty(1);
      await load();
    } catch (e) {
      playWarningSound();
      onShowToast(e instanceof Error ? e.message : 'រក្សាទុកមិនបាន', 'error');
    } finally {
      setSaving(false);
    }
  };

  const submit = async (alsoPrint: boolean) => {
    if (autoOn) return submitAuto(alsoPrint);
    if (!code) return onShowToast('សូមបញ្ចូល Barcode number', 'error');
    if (!isCode128Encodable(code)) return onShowToast('Barcode ប្រើបានតែអក្សរឡាតាំង លេខ និងសញ្ញា', 'error');
    if (!date) return onShowToast('សូមជ្រើសរើស Date', 'error');
    if (!companyName.trim()) return onShowToast('សូមបញ្ចូល Company name', 'error');
    if (alsoPrint && !active) return onShowToast('Label Inactive មិនអាច Print បានទេ', 'error');
    setSaving(true);
    try {
      const saved = await saveLabel({ id: editingId || undefined, barcode: code, date, companyName, active }, currentUser?.email || currentUser?.name);
      updatePrefs({ company: saved.companyName });
      onShowToast(editingId ? 'បានកែប្រែ Label' : 'បានរក្សាទុក Label', 'success');
      if (alsoPrint) {
        await printLabels([saved], size, prefs.copies);
        await markPrinted([saved.id]);
      }
      resetForm();
      await load();
    } catch (e) {
      playWarningSound();
      onShowToast(e instanceof Error ? e.message : 'រក្សាទុកមិនបាន', 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (r: BarcodeLabel) => {
    setEditingId(r.id);
    setBarcode(r.barcode);
    setDate(r.date);
    setCompanyName(r.companyName);
    setActive(r.active);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => barcodeRef.current?.focus(), 0);
  };

  const runVerify = async (raw: string) => {
    const c = normalizeBarcode(raw);
    if (!c) return;
    setVerifyCode(c);
    try {
      const label = await findByBarcode(c);
      setVerify({ code: c, label });
      if (label?.active) playScanSound();
      else playWarningSound();
    } catch (e) {
      onShowToast(e instanceof Error ? e.message : 'Verify មិនបាន', 'error');
    }
    setTimeout(() => verifyRef.current?.select(), 0);
  };

  const toggleActive = async (r: BarcodeLabel, value: boolean) => {
    try {
      await setLabelActive(r.id, value);
      setRows(prev => prev.map(x => (x.id === r.id ? { ...x, active: value } : x)));
      if (verify?.label?.id === r.id) setVerify({ ...verify, label: { ...verify.label, active: value } });
    } catch (e) {
      onShowToast(e instanceof Error ? e.message : 'កែស្ថានភាពមិនបាន', 'error');
    }
  };

  const doPrint = async (list: BarcodeLabel[]) => {
    const printable = list.filter(r => r.active);
    const skipped = list.length - printable.length;
    if (!printable.length) return onShowToast('គ្មាន Label Active សម្រាប់ Print ទេ', 'error');
    try {
      await printLabels(printable, size, prefs.copies);
      await markPrinted(printable.map(r => r.id));
      if (skipped) onShowToast(`រំលង ${skipped} Label ដែល Inactive`, 'info');
      await load();
    } catch (e) {
      onShowToast(e instanceof Error ? e.message : 'Print មិនបាន', 'error');
    }
  };

  const doDelete = async (ids: string[]) => {
    if (!ids.length) return;
    if (!window.confirm(`លុប ${ids.length} Label? (មិនអាចយកមកវិញបានទេ)`)) return;
    try {
      await deleteLabels(ids);
      setSelected(new Set());
      if (editingId && ids.includes(editingId)) resetForm();
      onShowToast(`បានលុប ${ids.length} Label`, 'success');
      await load();
    } catch (e) {
      onShowToast(e instanceof Error ? e.message : 'លុបមិនបាន', 'error');
    }
  };

  const selectedRows = rows.filter(r => selected.has(r.id));
  const allVisibleSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id));
  const toggleAllVisible = () =>
    setSelected(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach(r => next.delete(r.id));
      else filtered.forEach(r => next.add(r.id));
      return next;
    });

  const previewHtml = useMemo(() => {
    if (!code || !codeValid) return '';
    return labelHtml({ barcode: code, date, companyName, active });
  }, [code, codeValid, date, companyName, active]);

  // Preview keeps the label's aspect ratio inside a ~215 x 95 px box (1mm ≈ 3.78px).
  const previewScale = Math.min(1, 215 / (size.w * 3.78), 95 / (size.h * 3.78));
  const autoPrefix = normalizeBarcode(prefs.prefix);
  const runningPart = barcode.startsWith(autoPrefix) ? barcode.slice(autoPrefix.length) : '…';

  return (
    <div className="space-y-2 pb-24 md:pb-6">
      {/* Header: title + Verify box */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
          <Barcode className="w-4 h-4" />
        </div>
        <h1 className="min-w-0 truncate text-sm sm:text-base font-bold text-slate-900 dark:text-white">Barcode Labels</h1>
        <span
          title="ទិន្នន័យរក្សាទុកតែក្នុង Browser នេះប៉ុណ្ណោះ (Local database) — មិនបញ្ជូនទៅ Server ទេ"
          className="hidden sm:flex h-5 px-1.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-[10px] font-bold items-center gap-1 shrink-0"
        >
          <HardDrive className="w-3 h-3" /> Local
        </span>
        <div className="flex-1" />

        <div className="relative w-44 sm:w-72 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-600" />
          <input
            ref={verifyRef}
            value={verifyCode}
            onChange={e => {
              setVerifyCode(e.target.value.toUpperCase());
              setVerify(null);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runVerify(verifyCode);
              }
              if (e.key === 'Escape') setVerify(null);
            }}
            placeholder="Verify Barcode..."
            className="w-full h-8 pl-8 pr-14 rounded-lg text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <div className="absolute right-0.5 top-1/2 -translate-y-1/2 flex">
            <button type="button" onClick={() => runVerify(verifyCode)} title="Verify" className={iconBtnCls}>
              <Search className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setScanTarget('VERIFY')} title="ស្កេនដោយកាមេរ៉ា" className={iconBtnCls}>
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>

          {verify && (
            <div
              className={`absolute right-0 top-full mt-1 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-xl border shadow-lg p-2.5 text-xs ${
                !verify.label
                  ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-300'
                  : verify.label.active
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200'
                    : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200'
              }`}
            >
              <div className="flex items-start gap-1.5">
                {!verify.label ? (
                  <XCircle className="w-4 h-4 shrink-0" />
                ) : verify.label.active ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-bold">
                    {!verify.label ? `រកមិនឃើញ ${verify.code}` : verify.label.active ? 'ត្រឹមត្រូវ — Active' : 'Inactive — មិនទាន់/លែងប្រើ'}
                  </div>
                  {verify.label && (
                    <div className="mt-0.5 text-[11px] leading-snug">
                      <span className="font-mono font-bold">{verify.label.barcode}</span>
                      <span className="opacity-70"> · {showDate(verify.label.date)}</span>
                      <div className="truncate font-semibold">{verify.label.companyName}</div>
                    </div>
                  )}
                </div>
                {verify.label && <Switch checked={verify.label.active} onChange={v => toggleActive(verify.label!, v)} title="Verify active" />}
                <button type="button" onClick={() => setVerify(null)} className="opacity-60 hover:opacity-100 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={load}
          title="Refresh"
          className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Form + Preview */}
      <div className={`${cardCls} p-2 flex flex-col lg:flex-row gap-2 ${editingId ? 'ring-2 ring-amber-400' : ''}`}>
        <div className="flex-1 min-w-0 space-y-1.5">
          {editingId && (
            <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-amber-600 dark:text-amber-400">
              <span className="truncate">
                <Pencil className="inline w-3 h-3 mr-1" />
                កំពុងកែប្រែ {barcode}
              </span>
              <button type="button" onClick={() => resetForm()} className="shrink-0 underline">
                បោះបង់
              </button>
            </div>
          )}

          {/* Row 1: Barcode | Date | Company */}
          <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.3fr)_140px_minmax(0,1fr)] gap-1.5">
            <div className="col-span-2 sm:col-span-1 min-w-0">
              <label className={labelCls}>Barcode number *</label>
              <div
                onClick={() => barcodeRef.current?.focus()}
                className={`h-10 sm:h-9 flex items-center gap-1 pl-2 pr-0.5 rounded-lg border bg-white dark:bg-slate-900 focus-within:ring-1 cursor-text ${
                  codeValid ? 'border-slate-200 dark:border-slate-700 focus-within:ring-indigo-500' : 'border-rose-400 focus-within:ring-rose-500'
                }`}
              >
                <ScanLine className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {autoOn ? (
                  <>
                    <input
                      ref={barcodeRef}
                      autoFocus
                      value={prefs.prefix}
                      onChange={e => updatePrefs({ prefix: e.target.value.toUpperCase().replace(/[^\x20-\x7E]/g, '').slice(0, 20) })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          submit(false);
                        }
                      }}
                      title="ក្បាលកូដ (Prefix) — ចុចដើម្បីកែ"
                      placeholder="ក្បាល"
                      style={{ width: `${Math.max(prefs.prefix.length, 3) + 1.5}ch` }}
                      className="h-6 px-1 rounded font-mono font-bold text-sm sm:text-xs tracking-wide bg-amber-50 dark:bg-amber-950/40 border border-dashed border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 placeholder:text-amber-400 placeholder:font-sans placeholder:font-normal focus:outline-none focus:border-solid focus:border-amber-500"
                    />
                    <span className="min-w-0 truncate font-mono font-bold text-sm sm:text-xs tracking-wide text-indigo-700 dark:text-indigo-300">
                      {runningPart}
                    </span>
                    <div className="flex-1" />
                    <select
                      value={digits}
                      onChange={e => updatePrefs({ digits: Number(e.target.value) })}
                      onClick={e => e.stopPropagation()}
                      title="ចំនួនខ្ទង់លេខរៀង"
                      className="h-6 pl-1 pr-0 rounded text-[10.5px] font-semibold bg-transparent text-slate-500 dark:text-slate-400 focus:outline-none cursor-pointer"
                    >
                      {[3, 4, 5, 6, 7, 8, 9, 10].map(d => (
                        <option key={d} value={d}>
                          {d} ខ្ទង់
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <input
                      ref={barcodeRef}
                      autoFocus
                      value={barcode}
                      onChange={e => setBarcode(e.target.value.toUpperCase())}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          submit(false);
                        }
                      }}
                      placeholder="ស្កេន ឬវាយលេខ"
                      className="flex-1 min-w-0 h-full bg-transparent font-mono font-bold text-sm sm:text-xs tracking-wide text-slate-900 dark:text-white placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:outline-none"
                    />
                    <button type="button" onClick={() => setScanTarget('FORM')} title="ស្កេនដោយកាមេរ៉ា" className={iconBtnCls}>
                      <Camera className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    if (prefs.auto) setBarcode('');
                    updatePrefs({ auto: !prefs.auto });
                    setTimeout(() => barcodeRef.current?.focus(), 0);
                  }}
                  disabled={!!editingId}
                  title={prefs.auto ? 'Auto ON — ចុចដើម្បីវាយ/ស្កេនលេខដោយខ្លួនឯង' : 'Auto OFF — ចុចដើម្បីបង្កើតលេខដោយស្វ័យប្រវត្តិ'}
                  className={`h-7 px-1.5 rounded-md text-[10.5px] font-bold flex items-center gap-1 shrink-0 disabled:opacity-40 ${
                    prefs.auto
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Wand2 className="w-3 h-3" /> Auto
                </button>
              </div>
            </div>
            <div>
              <label className={labelCls}>Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
            </div>
            <div className="min-w-0">
              <label className={labelCls}>Company name *</label>
              <input
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                list="barcode-label-companies"
                placeholder="ឈ្មោះក្រុមហ៊ុន"
                className={inputCls}
              />
              <datalist id="barcode-label-companies">
                {companies.map(c => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Row 2: Active | Size | Qty | Copies | buttons */}
          <div className="flex flex-wrap items-end gap-1.5">
            <div>
              <label className={labelCls}>Verify active</label>
              <div
                className={`h-10 sm:h-9 px-2 rounded-lg border flex items-center gap-1.5 ${
                  active
                    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
                }`}
                title={active ? 'Active — ស្កេន Verify ជាប់ ហើយអាច Print បាន' : 'Inactive — Verify មិនជាប់ ហើយមិនអាច Print បាន'}
              >
                <Switch checked={active} onChange={setActive} />
                <span className={`text-[11px] font-bold w-12 ${active ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500'}`}>
                  {active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            <div>
              <label className={labelCls}>Size</label>
              <select value={size.id} onChange={e => updatePrefs({ size: e.target.value })} className={`${inputCls} w-auto pr-6`}>
                {LABEL_SIZES.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {autoOn && (
              <div>
                <label className={labelCls}>ចំនួន</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_QTY}
                  value={qty}
                  onChange={e => setQty(Math.max(1, Math.min(MAX_QTY, Number(e.target.value) || 1)))}
                  title="បង្កើត Label ច្រើនក្នុងពេលតែមួយ (លេខរៀងបន្តគ្នា)"
                  className={`${inputCls} w-16 text-center`}
                />
              </div>
            )}
            <div>
              <label className={labelCls}>Copies</label>
              <input
                type="number"
                min={1}
                max={100}
                value={prefs.copies}
                onChange={e => updatePrefs({ copies: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                title="Print Label នីមួយៗប៉ុន្មានសន្លឹក"
                className={`${inputCls} w-14 text-center`}
              />
            </div>
            <div className="flex-1" />
            <div className="flex gap-1.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={saving}
                className={`${btnCls} flex-1 sm:flex-none h-10 sm:h-9 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800`}
              >
                <Save className="w-3.5 h-3.5" /> {editingId ? 'Update' : autoOn && qty > 1 ? `Save ${qty}` : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={saving || !active}
                title={!active ? 'Label Inactive មិនអាច Print បាន' : undefined}
                className={`${btnCls} flex-1 sm:flex-none h-10 sm:h-9 bg-indigo-600 hover:bg-indigo-700 text-white`}
              >
                <Printer className="w-3.5 h-3.5" /> {autoOn && qty > 1 ? `Save & Print ${qty}` : 'Save & Print'}
              </button>
            </div>
          </div>

          {(!codeValid || (autoOn && qty > 1 && code)) && (
            <p className={`text-[10.5px] ${codeValid ? 'text-slate-500 dark:text-slate-400' : 'font-semibold text-rose-600'}`}>
              {codeValid
                ? `នឹងបង្កើត ${qty} Label: ${code} → ${prefs.prefix}${String(Number(runningPart) + qty - 1).padStart(digits, '0')}`
                : 'Barcode ប្រើបានតែអក្សរឡាតាំង លេខ និងសញ្ញា (A-Z, 0-9, - / . …)'}
            </p>
          )}
        </div>

        {/* Preview */}
        <div className="lg:w-[230px] shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 p-1.5 flex flex-col items-center justify-center relative min-h-[110px]">
          <span className="absolute top-1 left-1.5 text-[9.5px] font-bold text-slate-400 uppercase tracking-wide">Preview · {size.name}</span>
          {previewHtml ? (
            <div style={{ width: `${size.w * previewScale}mm`, height: `${size.h * previewScale}mm` }} className="relative shadow-md mt-3">
              <div
                style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}
                className={active ? '' : 'opacity-40'}
                dangerouslySetInnerHTML={{ __html: `<style>${labelCss(size.w, size.h)}</style>${previewHtml}` }}
              />
            </div>
          ) : (
            <span className="text-[11px] text-slate-400">បញ្ចូល Barcode ដើម្បីមើល Label</span>
          )}
        </div>
      </div>

      {/* List */}
      <div className={cardCls}>
        <div className="p-2 flex flex-wrap items-center gap-1.5 border-b border-slate-100 dark:border-slate-800">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ស្វែងរក Barcode / Company / Date" className={`${inputCls} pl-8`} />
          </div>
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-[11px] font-bold">
            {(
              [
                ['ALL', `All ${counts.all}`],
                ['ACTIVE', `Active ${counts.active}`],
                ['INACTIVE', `Inactive ${counts.all - counts.active}`],
              ] as const
            ).map(([k, t]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`h-9 px-2.5 ${filter === k ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="px-2 py-1.5 flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900 text-xs">
            <span className="font-bold text-indigo-700 dark:text-indigo-300">បានជ្រើស {selected.size}</span>
            <button type="button" onClick={() => setSelected(new Set())} className="text-slate-500 hover:text-slate-700">
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="flex-1" />
            <button type="button" onClick={() => doPrint(selectedRows)} className={`${btnCls} h-8 bg-indigo-600 hover:bg-indigo-700 text-white`}>
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button type="button" onClick={() => doDelete([...selected])} className={`${btnCls} h-8 border border-rose-200 dark:border-rose-800 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40`}>
              <Trash2 className="w-3.5 h-3.5" /> លុប
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-[10.5px] uppercase">
              <tr>
                <th className="w-8 px-2 py-1.5 text-left">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                </th>
                <th className="px-2 py-1.5 text-left">Barcode</th>
                <th className="px-2 py-1.5 text-left">Date</th>
                <th className="px-2 py-1.5 text-left">Company</th>
                <th className="px-2 py-1.5 text-left">Verify active</th>
                <th className="px-2 py-1.5 text-center">Printed</th>
                <th className="px-2 py-1.5 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(r => (
                <tr key={r.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${editingId === r.id ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() =>
                        setSelected(prev => {
                          const next = new Set(prev);
                          if (next.has(r.id)) next.delete(r.id);
                          else next.add(r.id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">{r.barcode}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-600 dark:text-slate-300">{showDate(r.date)}</td>
                  <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200 max-w-[220px] truncate">{r.companyName}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Switch checked={r.active} onChange={v => toggleActive(r, v)} />
                      <ActiveBadge active={r.active} />
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center text-slate-500" title={r.lastPrintedAt ? `ចុងក្រោយ ${new Date(r.lastPrintedAt).toLocaleString()}` : undefined}>
                    {r.printCount || 0}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => doPrint([r])}
                        disabled={!r.active}
                        title={r.active ? 'Print' : 'Inactive — មិនអាច Print'}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-30"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        title="កែប្រែ"
                        className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => doDelete([r.id])}
                        title="លុប"
                        className="w-7 h-7 rounded-md flex items-center justify-center text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={7} className="px-2 py-8 text-center text-slate-400">
                    {loading ? 'កំពុងអាន...' : rows.length ? 'រកមិនឃើញ' : 'មិនទាន់មាន Label — បញ្ចូល Barcode ខាងលើ'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BarcodeScannerModal
        isOpen={scanTarget !== null}
        onClose={() => setScanTarget(null)}
        autoCloseOnScan={true}
        onScanSuccess={decoded => {
          const target = scanTarget;
          setScanTarget(null);
          if (target === 'VERIFY') runVerify(decoded);
          else {
            setBarcode(normalizeBarcode(decoded));
            playScanSound();
          }
          return { success: true };
        }}
      />
    </div>
  );
};
