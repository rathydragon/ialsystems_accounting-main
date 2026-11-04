import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileDown, FileUp, Loader2, Pencil, ReceiptText, RefreshCw, Save, Search, Trash2, X } from 'lucide-react';
import { AuthUser } from '../types';
import {
  deleteIssueInvoices,
  fetchIssueInvoices,
  importIssueInvoices,
  ImportMode,
  IssueInvoice,
  IssueInvoicePage as PageData,
  saveIssueInvoice,
} from '../services/issueInvoiceService';
import { downloadIssueInvoiceTemplate, exportIssueInvoices, parseIssueInvoiceFile, ParsedIssueInvoiceFile } from '../utils/issueInvoiceExcel';

interface IssueInvoicePageProps {
  currentUser: AuthUser | null;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const inputCls =
  'w-full h-10 sm:h-9 px-2.5 rounded-lg text-sm sm:text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500';
const cardCls = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm';
const toolBtn =
  'h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40';

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const showDateTime = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const todayStr = () => new Date().toISOString().slice(0, 10);

type Upload = { file: string; parsed: ParsedIssueInvoiceFile; mode: ImportMode; busy: boolean; done: number };

export const IssueInvoicePage: React.FC<IssueInvoicePageProps> = ({ currentUser, onShowToast }) => {
  const role = String(currentUser?.role || '').toUpperCase();
  const isAdmin = role === 'ADMIN';
  const isViewer = role === 'VIEWER';
  const canCreate = isAdmin || (!isViewer && currentUser?.canCreate !== false);
  const canEdit = isAdmin || (!isViewer && currentUser?.canEdit !== false);
  const canDelete = isAdmin || (!isViewer && !!currentUser?.canDelete);

  // ── form ──
  const [editing, setEditing] = useState<IssueInvoice | null>(null);
  const [tracking, setTracking] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const trackingRef = useRef<HTMLInputElement>(null);

  // ── list ──
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  // ── upload ──
  const fileRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchIssueInvoices({ search: debounced, pageSize: 1000 }));
      setSelected(new Set());
    } catch (err: any) {
      onShowToast(err?.message || 'ទាញទិន្នន័យមិនបាន', 'error');
    } finally {
      setLoading(false);
    }
  }, [debounced, onShowToast]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = data?.rows || [];

  const resetForm = () => {
    setEditing(null);
    setTracking('');
    setUnitPrice('');
    setCustomerName('');
    setNote('');
    setTimeout(() => trackingRef.current?.focus(), 0);
  };

  const startEdit = (r: IssueInvoice) => {
    setEditing(r);
    setTracking(r.tracking);
    setUnitPrice(r.unitPrice === null ? '' : String(r.unitPrice));
    setCustomerName(r.customerName);
    setNote(r.note);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => trackingRef.current?.focus(), 0);
  };

  const handleSave = async () => {
    const code = tracking.trim().toUpperCase().replace(/\s+/g, '');
    if (!code) return onShowToast('សូមបញ្ចូល Tracking', 'error');
    const priceText = unitPrice.replace(/[$,\s]/g, '');
    const price = priceText === '' ? null : Number(priceText);
    if (price !== null && (!Number.isFinite(price) || price < 0)) return onShowToast('Unit Price មិនត្រឹមត្រូវ', 'error');
    setSaving(true);
    try {
      const saved = await saveIssueInvoice({ id: editing?.id, tracking: code, unitPrice: price, customerName, note });
      onShowToast(editing ? `បានកែប្រែ ${saved.tracking}` : `បានរក្សាទុក ${saved.tracking}`, 'success');
      const keepCustomer = !editing;
      resetForm();
      if (keepCustomer) setCustomerName(customerName); // typing several trackings for one customer
      load();
    } catch (err: any) {
      onShowToast(err?.message || 'រក្សាទុកមិនបាន', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeRows = async (ids: number[]) => {
    if (!ids.length) return;
    const label = ids.length === 1 ? rows.find((r) => r.id === ids[0])?.tracking || '' : `${ids.length} ជួរ`;
    if (!window.confirm(`លុប ${label}?`)) return;
    setBusyIds(new Set(ids));
    try {
      const { deleted } = await deleteIssueInvoices(ids);
      onShowToast(`បានលុប ${deleted} ជួរ`, 'success');
      if (editing && ids.includes(editing.id)) resetForm();
      load();
    } catch (err: any) {
      onShowToast(err?.message || 'លុបមិនបាន', 'error');
    } finally {
      setBusyIds(new Set());
    }
  };

  // ── Excel upload ──
  const pickFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setReading(true);
    try {
      const parsed = await parseIssueInvoiceFile(file);
      if (!parsed.rows.length) throw new Error('រកមិនឃើញជួរទិន្នន័យដែលត្រឹមត្រូវក្នុង File');
      setUpload({ file: file.name, parsed, mode: 'skip', busy: false, done: 0 });
    } catch (err: any) {
      onShowToast(err?.message || 'អាន File មិនបាន', 'error');
    } finally {
      setReading(false);
    }
  };

  const runUpload = async () => {
    if (!upload) return;
    setUpload({ ...upload, busy: true, done: 0 });
    try {
      const r = await importIssueInvoices(upload.parsed.rows, upload.mode, (done) => setUpload((u) => (u ? { ...u, done } : u)));
      const parts = [`បន្ថែម ${r.inserted}`];
      if (r.updated) parts.push(`កែប្រែ ${r.updated}`);
      if (r.skipped) parts.push(`រំលង ${r.skipped} (មានរួច)`);
      if (r.invalid.length) parts.push(`មិនត្រឹមត្រូវ ${r.invalid.length}`);
      onShowToast(`Upload រួចរាល់៖ ${parts.join(' · ')}`, 'success');
      setUpload(null);
      load();
    } catch (err: any) {
      onShowToast(err?.message || 'Upload មិនបាន', 'error');
      setUpload((u) => (u ? { ...u, busy: false } : u));
    }
  };

  const exportExcel = async () => {
    if (!rows.length) return;
    try {
      await exportIssueInvoices(rows, `Issue_Invoice_${todayStr()}.xlsx`);
    } catch (err: any) {
      onShowToast(err?.message || 'Export មិនបាន', 'error');
    }
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectedAmount = useMemo(() => rows.filter((r) => selected.has(r.id)).reduce((sum, r) => sum + (r.unitPrice || 0), 0), [rows, selected]);

  const renderActions = (r: IssueInvoice) => (
    <div className="flex items-center justify-end gap-0.5">
      {canEdit && (
        <button type="button" onClick={() => startEdit(r)} title="កែប្រែ" className="p-1.5 rounded-md text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      {canDelete && (
        <button type="button" onClick={() => removeRows([r.id])} title="លុប" className="p-1.5 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-2 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <ReceiptText className="w-4 h-4" />
          </div>
          <h1 className="min-w-0 truncate text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            Issue Invoice
            <span className="hidden sm:inline ml-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">ចេញវិក័យប័ត្រ — Tracking · Unit Price · Customers Name · Noted</span>
          </h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => downloadIssueInvoiceTemplate().catch((e) => onShowToast(e?.message || 'ទាញយកគំរូមិនបាន', 'error'))} title="ទាញយកគំរូ Excel សម្រាប់ Upload" className={toolBtn}>
            <FileDown className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">គំរូ Excel</span>
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={reading}
              title="Upload File Excel (.xlsx / .csv)"
              className="h-7 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1"
            >
              {reading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Upload Excel</span>
            </button>
          )}
          <button type="button" onClick={exportExcel} disabled={!rows.length} title="Export Excel" className={toolBtn}>
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button type="button" onClick={load} title="Refresh" className="h-7 w-7 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
      </div>

      {/* Form */}
      {(canCreate || editing) && (
        <div className={`${cardCls} p-2 space-y-1.5 ${editing ? 'ring-2 ring-amber-400' : ''}`}>
          {editing && (
            <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-amber-600 dark:text-amber-400">
              <span className="truncate">
                <Pencil className="inline w-3 h-3 mr-1" />
                កំពុងកែប្រែ {editing.tracking}
              </span>
              <button type="button" onClick={resetForm} className="shrink-0 underline">
                បោះបង់ការកែ
              </button>
            </div>
          )}
          <form
            className="grid grid-cols-2 gap-1.5 lg:grid-cols-[220px_130px_minmax(0,1fr)_minmax(0,1.3fr)_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <input
              ref={trackingRef}
              autoFocus
              value={tracking}
              onChange={(e) => setTracking(e.target.value.toUpperCase())}
              placeholder="Tracking *"
              className={`${inputCls} font-mono font-bold`}
            />
            <input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} inputMode="decimal" placeholder="Unit Price" className={`${inputCls} tabular-nums text-right`} />
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customers Name" className={`${inputCls} col-span-2 lg:col-span-1`} />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Noted" className={`${inputCls} col-span-2 lg:col-span-1`} />
            <button
              type="submit"
              disabled={saving || !tracking.trim()}
              className="col-span-2 lg:col-span-1 h-10 sm:h-9 px-4 rounded-lg bg-emerald-600 shadow-sm hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center gap-1"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              រក្សាទុក
            </button>
          </form>
        </div>
      )}

      {/* Search + totals */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ស្វែងរក Tracking, អតិថិជន, ចំណាំ..." className={`${inputCls} !h-8 pl-8`} />
        </div>
        <div className="flex items-center gap-1 text-[11px] font-bold">
          <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            ចំនួន <span className="tabular-nums text-slate-900 dark:text-white">{(data?.total || 0).toLocaleString()}</span>
          </span>
          <span className="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
            សរុប <span className="tabular-nums">${money(data?.totalAmount || 0)}</span>
          </span>
        </div>
      </div>

      {canDelete && selected.size > 0 && (
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
          <span>
            បានជ្រើស {selected.size} ជួរ · ${money(selectedAmount)}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setSelected(new Set())} className="px-2 py-1 rounded-md hover:bg-white/60 dark:hover:bg-slate-800">
              ឈប់ជ្រើស
            </button>
            <button
              type="button"
              onClick={() => removeRows([...selected])}
              disabled={busyIds.size > 0}
              className="px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1 disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" /> លុប
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading && !data ? (
        <div className={`${cardCls} p-8 flex items-center justify-center gap-2 text-xs text-slate-500`}>
          <Loader2 className="w-4 h-4 animate-spin" /> កំពុងទាញទិន្នន័យ...
        </div>
      ) : !rows.length ? (
        <div className={`${cardCls} p-8 text-center text-xs text-slate-500`}>
          {debounced ? 'រកមិនឃើញ' : 'មិនទាន់មានទិន្នន័យ — បញ្ចូលខាងលើ ឬ Upload File Excel'}
        </div>
      ) : (
        <>
          {/* Phone: cards */}
          <div className="md:hidden grid grid-cols-1 gap-1.5">
            {rows.map((r) => (
              <div key={r.id} className={`${cardCls} px-2 py-1.5 ${busyIds.has(r.id) ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-[13px] text-slate-900 dark:text-white select-all truncate">{r.tracking}</span>
                  <span className="ml-auto tabular-nums font-bold text-[12px] text-indigo-700 dark:text-indigo-300">{money(r.unitPrice)}</span>
                  {renderActions(r)}
                </div>
                <div className="text-[11.5px] text-slate-700 dark:text-slate-300 truncate">{r.customerName || '—'}</div>
                {r.note && <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 break-words">{r.note}</p>}
              </div>
            ))}
          </div>

          {/* Computer: table */}
          <div className={`${cardCls} hidden md:block overflow-x-auto`}>
            <table className="w-full text-[11.5px]">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-[10.5px]">
                <tr className="text-left">
                  {canDelete && (
                    <th className="px-2 py-1.5 w-8">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-indigo-600" />
                    </th>
                  )}
                  <th className="px-2 py-1.5 font-bold w-10">#</th>
                  <th className="px-2 py-1.5 font-bold">Tracking</th>
                  <th className="px-2 py-1.5 font-bold text-right whitespace-nowrap">Unit Price</th>
                  <th className="px-2 py-1.5 font-bold">Customers Name</th>
                  <th className="px-2 py-1.5 font-bold">Noted</th>
                  <th className="px-2 py-1.5 font-bold whitespace-nowrap">អ្នកបញ្ចូល</th>
                  <th className="px-2 py-1.5 font-bold text-right">សកម្មភាព</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r, idx) => (
                  <tr
                    key={r.id}
                    className={`align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${busyIds.has(r.id) ? 'opacity-50' : ''} ${editing?.id === r.id ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}
                  >
                    {canDelete && (
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} className="accent-indigo-600" />
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap font-mono font-bold text-[12.5px] text-slate-900 dark:text-white select-all">{r.tracking}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">{money(r.unitPrice)}</td>
                    <td className="px-2 py-1.5 min-w-[160px] max-w-[300px] text-slate-700 dark:text-slate-200">
                      <div className="truncate" title={r.customerName}>
                        {r.customerName || <span className="text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 min-w-[180px] max-w-[380px] text-slate-600 dark:text-slate-300">
                      {r.note ? <p className="line-clamp-2 break-words" title={r.note}>{r.note}</p> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {r.createdBy || '—'}
                      <div className="text-[10px] text-slate-400 tabular-nums">{showDateTime(r.createdAt)}</div>
                    </td>
                    <td className="px-2 py-1">{renderActions(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {data && data.total > rows.length && (
        <p className="text-center text-[11px] text-slate-500">
          បង្ហាញ {rows.length} ក្នុងចំណោម {data.total.toLocaleString()} — សូមស្វែងរក ដើម្បីរកកំណត់ត្រាផ្សេងទៀត
        </p>
      )}

      {/* Upload preview */}
      {upload && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => !upload.busy && setUpload(null)}>
          <div className="w-full sm:max-w-2xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Upload Excel</h2>
                <p className="text-[11px] text-slate-500 truncate">{upload.file}</p>
              </div>
              <button type="button" disabled={upload.busy} onClick={() => setUpload(null)} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-3 py-2 space-y-2 overflow-y-auto">
              <div className="flex flex-wrap gap-1 text-[11px] font-bold">
                <span className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                  ត្រឹមត្រូវ {upload.parsed.rows.length} ជួរ · ${money(upload.parsed.rows.reduce((s, r) => s + (r.unitPrice || 0), 0))}
                </span>
                {upload.parsed.missingTracking > 0 && (
                  <span className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">គ្មាន Tracking {upload.parsed.missingTracking}</span>
                )}
                {upload.parsed.duplicatesInFile > 0 && (
                  <span className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">ស្ទួនក្នុង File {upload.parsed.duplicatesInFile}</span>
                )}
                {upload.parsed.badPrice.length > 0 && (
                  <span className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300" title={upload.parsed.badPrice.join(', ')}>
                    Unit Price ខុស {upload.parsed.badPrice.length}
                  </span>
                )}
              </div>
              {upload.parsed.ignoredHeaders.length > 0 && (
                <p className="text-[10.5px] text-slate-500">ជួរឈរមិនស្គាល់ (រំលង)៖ {upload.parsed.ignoredHeaders.join(', ')}</p>
              )}

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-[10px]">
                    <tr className="text-left">
                      <th className="px-2 py-1">Tracking</th>
                      <th className="px-2 py-1 text-right">Unit Price</th>
                      <th className="px-2 py-1">Customers Name</th>
                      <th className="px-2 py-1">Noted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                    {upload.parsed.rows.slice(0, 8).map((r) => (
                      <tr key={r.tracking}>
                        <td className="px-2 py-1 font-mono font-bold">{r.tracking}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{money(r.unitPrice)}</td>
                        <td className="px-2 py-1 truncate max-w-[180px]">{r.customerName}</td>
                        <td className="px-2 py-1 truncate max-w-[200px]">{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {upload.parsed.rows.length > 8 && <p className="px-2 py-1 text-[10.5px] text-slate-400">... និង {upload.parsed.rows.length - 8} ជួរទៀត</p>}
              </div>

              {canEdit && (
                <label className="flex items-start gap-2 text-[11.5px] text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={upload.mode === 'overwrite'}
                    disabled={upload.busy}
                    onChange={(e) => setUpload({ ...upload, mode: e.target.checked ? 'overwrite' : 'skip' })}
                    className="mt-0.5 accent-indigo-600"
                  />
                  <span>
                    <b>សរសេរជាន់</b> — Tracking ដែលមានរួចហើយ នឹងត្រូវកែ Unit Price / Customers Name / Noted តាម File។ មិនធីក៖ រំលង Tracking ដែលមានរួច។
                  </span>
                </label>
              )}
            </div>

            <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500 tabular-nums">{upload.busy ? `កំពុង Upload ${upload.done}/${upload.parsed.rows.length}...` : ''}</span>
              <div className="flex items-center gap-1.5">
                <button type="button" disabled={upload.busy} onClick={() => setUpload(null)} className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40">
                  បោះបង់
                </button>
                <button type="button" disabled={upload.busy} onClick={runUpload} className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1">
                  {upload.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
                  Upload {upload.parsed.rows.length} ជួរ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
