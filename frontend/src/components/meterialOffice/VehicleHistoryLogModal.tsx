import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Plus,
  History,
  Pencil,
  Trash2,
  RefreshCw,
  Save,
  Paperclip,
  FileText,
  Calendar,
  Wrench,
  Gauge,
  User,
  MapPin,
  DollarSign,
  Store,
  AlertCircle,
  ArrowLeft,
  AlertTriangle,
  Droplet,
  MoreHorizontal
} from 'lucide-react';
import { compressImageToWebP } from '../../utils/compression';
import {
  LOG_TYPES,
  STATUS_IDS,
  logTypeOf,
  logStatusOf,
  typeConfigOf,
  fieldLabel,
  LogField,
  VehicleLog,
  VehicleLogInput,
  VehicleLogType,
  fetchVehicleLogs,
  saveVehicleLog,
  addVehicleLogFile,
  removeVehicleLogFile,
  deleteVehicleLog,
  driveThumb,
  readFileAsDataUrl,
  MAX_PDF_BYTES
} from '../../services/vehicleLogService';

export interface HistoryVehicle {
  id: number;
  modelNo: string;
  driver: string;
  vehicleType: string;
  station: string;
}

interface Props {
  vehicle: HistoryVehicle;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  webAppUrl?: string;
  onClose: () => void;
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void;
  /** Called after any change, so the page can refresh its row badges. */
  onChanged?: () => void;
}

// UTC+7 (Phnom Penh)
const today = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const fmtDate = (d: string | null) => {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const fmtMoney = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isPdf = (mime: string, name = '') => mime === 'application/pdf' || /\.pdf$/i.test(name);

const PILL = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-bold whitespace-nowrap';
/** Input with a leading icon: the box draws the border, the input inside is borderless. */
const boxCls =
  'flex items-center gap-2 h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 transition';
const fieldCls = 'flex-1 min-w-0 h-full bg-transparent text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none';
const STATUS_DOT: Record<string, string> = { OPEN: 'bg-rose-500', IN_PROGRESS: 'bg-amber-500', DONE: 'bg-emerald-500' };
const TYPE_ICON: Record<string, React.ReactNode> = {
  PROBLEM: <AlertTriangle />,
  REPAIR: <Wrench />,
  MAINTENANCE: <Droplet />,
  SPEEDING: <Gauge />,
  DOCUMENT: <FileText />,
  OTHER: <MoreHorizontal />
};

const emptyForm = (vehicle: HistoryVehicle): VehicleLogInput => ({
  vehicleId: vehicle.id,
  logType: 'PROBLEM',
  logDate: today(),
  title: '',
  description: '',
  status: 'OPEN',
  cost: '',
  shop: '',
  odometer: '',
  driver: vehicle.driver,
  speedKmh: '',
  speedLimitKmh: '',
  location: ''
});

const toForm = (l: VehicleLog): VehicleLogInput => ({
  id: l.id,
  vehicleId: l.vehicleId,
  logType: l.logType,
  logDate: l.logDate || today(),
  title: l.title,
  description: l.description,
  status: l.status,
  cost: l.cost === null ? '' : String(l.cost),
  shop: l.shop,
  odometer: l.odometer === null ? '' : String(l.odometer),
  driver: l.driver,
  speedKmh: l.speedKmh === null ? '' : String(l.speedKmh),
  speedLimitKmh: l.speedLimitKmh === null ? '' : String(l.speedLimitKmh),
  location: l.location
});

/** A file picked in the form, ready to upload (images already compressed). */
interface PendingFile {
  name: string;
  dataUrl: string;
  pdf: boolean;
}

async function prepareFiles(files: File[], notify: Props['notify']): Promise<PendingFile[]> {
  const out: PendingFile[] = [];
  for (const f of files) {
    try {
      if (f.type === 'application/pdf') {
        if (f.size > MAX_PDF_BYTES) {
          notify(`${f.name}: PDF ធំពេក (អតិបរមា 3MB)`, 'error');
          continue;
        }
        out.push({ name: f.name, dataUrl: await readFileAsDataUrl(f), pdf: true });
      } else if (f.type.startsWith('image/')) {
        out.push({ name: f.name, dataUrl: (await compressImageToWebP(f, 1600, 0.82)).dataUrl, pdf: false });
      } else {
        notify(`${f.name}: អាចភ្ជាប់បានតែរូបភាព ឬ PDF`, 'error');
      }
    } catch (e: any) {
      notify(`${f.name}: ${e?.message || 'មិនអាចអានឯកសារបាន'}`, 'error');
    }
  }
  return out;
}

export const VehicleHistoryLogModal: React.FC<Props> = ({ vehicle, canCreate, canEdit, canDelete, webAppUrl, onClose, notify, onChanged }) => {
  const [logs, setLogs] = useState<VehicleLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<VehicleLogType | ''>('');
  const [form, setForm] = useState<VehicleLogInput | null>(null);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const formFileRef = useRef<HTMLInputElement>(null);
  const rowFileRef = useRef<HTMLInputElement>(null);
  const rowFileTarget = useRef<VehicleLog | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLogs(await fetchVehicleLogs(vehicle.id));
    } catch (e: any) {
      setError(e?.message || 'មិនអាចទាញទិន្នន័យបានទេ');
    } finally {
      setLoading(false);
    }
  }, [vehicle.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Esc closes the form first, then the modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || saving) return;
      if (form) setForm(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [form, saving, onClose]);

  const replaceLog = (updated: VehicleLog | null, removedId?: number) =>
    setLogs((prev) => {
      if (removedId) return prev.filter((l) => l.id !== removedId);
      if (!updated) return prev;
      const exists = prev.some((l) => l.id === updated.id);
      const next = exists ? prev.map((l) => (l.id === updated.id ? updated : l)) : [updated, ...prev];
      return next.sort((a, b) => (b.logDate || '').localeCompare(a.logDate || '') || b.id - a.id);
    });

  const stats = useMemo(() => {
    let cost = 0;
    let open = 0;
    for (const l of logs) {
      cost += l.cost || 0;
      if (l.status !== 'DONE') open++;
    }
    return { total: logs.length, open, cost };
  }, [logs]);

  const countsByType = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) m.set(l.logType, (m.get(l.logType) || 0) + 1);
    return m;
  }, [logs]);

  const shown = typeFilter ? logs.filter((l) => l.logType === typeFilter) : logs;

  /** Uploads files one by one; returns the record after the last successful upload. */
  const uploadFiles = async (log: VehicleLog, files: PendingFile[]) => {
    let row = log;
    let failed = 0;
    for (const f of files) {
      try {
        row = await addVehicleLogFile(row.id, f.dataUrl, f.name, webAppUrl);
      } catch (e: any) {
        failed++;
        notify(`${f.name}: ${e?.message || 'Upload បរាជ័យ'}`, 'error');
      }
    }
    return { row, failed };
  };

  const handleSave = async () => {
    if (!form) return;
    if (!form.title.trim() && !form.description.trim()) {
      notify('សូមបញ្ចូលចំណងជើង ឬការពិពណ៌នា', 'error');
      return;
    }
    // Fields that don't belong to this type are saved empty, so the record matches its type
    const fields = typeConfigOf(form.logType).fields;
    const payload: VehicleLogInput = {
      ...form,
      cost: fields.includes('cost') ? form.cost : '',
      shop: fields.includes('shop') ? form.shop : '',
      odometer: fields.includes('odometer') ? form.odometer : '',
      driver: fields.includes('driver') ? form.driver : '',
      speedKmh: fields.includes('speed') ? form.speedKmh : '',
      speedLimitKmh: fields.includes('speed') ? form.speedLimitKmh : '',
      location: fields.includes('location') ? form.location : ''
    };
    setSaving(true);
    try {
      let saved = await saveVehicleLog(payload);
      if (pending.length) saved = (await uploadFiles(saved, pending)).row;
      replaceLog(saved);
      notify(form.id ? 'បានកែប្រែកំណត់ត្រា' : 'បានបន្ថែមកំណត់ត្រា', 'success');
      setForm(null);
      setPending([]);
      onChanged?.();
    } catch (e: any) {
      notify(e?.message || 'រក្សាទុកមិនបាន', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (log: VehicleLog) => {
    if (!window.confirm(`លុបកំណត់ត្រា "${log.title || logTypeOf(log.logType).label}" (${fmtDate(log.logDate)})?`)) return;
    setBusyId(log.id);
    try {
      await deleteVehicleLog(log.id);
      replaceLog(null, log.id);
      notify('បានលុបកំណត់ត្រា', 'success');
      onChanged?.();
    } catch (e: any) {
      notify(e?.message || 'លុបមិនបាន', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveFile = async (log: VehicleLog, fileId: number) => {
    if (!window.confirm('ដកឯកសារនេះចេញពីកំណត់ត្រា? (ឯកសារនៅតែរក្សាទុកក្នុង Google Drive)')) return;
    setBusyId(log.id);
    try {
      const updated = await removeVehicleLogFile(fileId);
      replaceLog(updated);
    } catch (e: any) {
      notify(e?.message || 'លុបមិនបាន', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const addFilesToRow = async (files: File[]) => {
    const log = rowFileTarget.current;
    if (rowFileRef.current) rowFileRef.current.value = '';
    if (!log || !files.length) return;
    setBusyId(log.id);
    try {
      const prepared = await prepareFiles(files, notify);
      if (!prepared.length) return;
      const { row, failed } = await uploadFiles(log, prepared);
      replaceLog(row);
      if (prepared.length > failed) notify(`បានភ្ជាប់ ${prepared.length - failed} ឯកសារ`, 'success');
    } finally {
      setBusyId(null);
    }
  };

  const setField = <K extends keyof VehicleLogInput>(k: K, v: VehicleLogInput[K]) => setForm((p) => (p ? { ...p, [k]: v } : p));

  // ── Form view ──────────────────────────────────────────────────────────
  const renderForm = (f: VehicleLogInput) => {
    const cfg = typeConfigOf(f.logType);
    const show = (k: LogField) => cfg.fields.includes(k);
    const label = (k: LogField) => fieldLabel(f.logType, k);

    // Detail fields in display order; the last one stretches to fill its row (3 per row)
    const details: { key: string; label: string; icon: React.ReactNode; input: React.ReactNode }[] = [];
    const numInput = (k: 'odometer' | 'speedKmh' | 'speedLimitKmh' | 'cost', extra: Record<string, any> = {}) => (
      <input type="number" min="0" inputMode="numeric" value={f[k]} onChange={(e) => setField(k, e.target.value)} className={fieldCls} {...extra} />
    );
    const textInput = (k: 'driver' | 'shop' | 'location', max: number) => (
      <input type="text" value={f[k]} onChange={(e) => setField(k, e.target.value)} className={fieldCls} maxLength={max} />
    );
    if (show('driver')) details.push({ key: 'driver', label: label('driver'), icon: <User />, input: textInput('driver', 150) });
    if (show('odometer')) details.push({ key: 'odometer', label: label('odometer'), icon: <Gauge />, input: numInput('odometer', { step: 1 }) });
    if (show('speed')) {
      details.push({ key: 'speed', label: 'ល្បឿនពិត (km/h)', icon: <Gauge />, input: numInput('speedKmh', { max: 400, step: 1 }) });
      details.push({ key: 'limit', label: 'ល្បឿនកំណត់ (km/h)', icon: <AlertCircle />, input: numInput('speedLimitKmh', { max: 400, step: 1 }) });
    }
    if (show('cost')) details.push({ key: 'cost', label: label('cost'), icon: <DollarSign />, input: numInput('cost', { step: 0.01, inputMode: 'decimal', placeholder: '0.00' }) });
    if (show('shop')) details.push({ key: 'shop', label: label('shop'), icon: <Store />, input: textInput('shop', 150) });
    if (show('location')) details.push({ key: 'location', label: label('location'), icon: <MapPin />, input: textInput('location', 200) });
    const lastSpan = ['', 'sm:col-span-3', 'sm:col-span-2'][(3 - (details.length % 3)) % 3] || '';
    const over = f.speedKmh && f.speedLimitKmh ? Number(f.speedKmh) - Number(f.speedLimitKmh) : 0;

    return (
      <form
        className="flex-1 min-h-0 flex flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-4 space-y-3.5">
          {/* Type */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {LOG_TYPES.map((t) => {
              const active = f.logType === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setField('logType', t.id)}
                  className={`flex flex-col items-center justify-center gap-1 h-14 px-1 rounded-xl border text-[10.5px] font-bold leading-tight text-center cursor-pointer transition ${
                    active
                      ? `${t.tone} shadow-sm`
                      : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <span className="[&>svg]:w-4 [&>svg]:h-4">{TYPE_ICON[t.id]}</span>
                  <span className="line-clamp-2">{t.short}</span>
                </button>
              );
            })}
          </div>

          {/* Date + status */}
          <div className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-2.5">
            <div className={boxCls}>
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input type="date" value={f.logDate} onChange={(e) => setField('logDate', e.target.value)} className={fieldCls} required title="ថ្ងៃខែ" />
            </div>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/70">
              {STATUS_IDS.map((id) => {
                const st = logStatusOf(id, f.logType);
                const active = f.status === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setField('status', id)}
                    className={`h-7 px-1.5 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition min-w-0 ${
                      active ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                    title={st.label}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[id]} ${active ? '' : 'opacity-50'}`} />
                    <span className="truncate">{st.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title + description in one box */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 transition">
            <input
              type="text"
              value={f.title}
              onChange={(e) => setField('title', e.target.value)}
              placeholder={cfg.titlePlaceholder}
              className="w-full h-10 px-3 bg-transparent text-[13.5px] font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:font-normal focus:outline-none"
              autoFocus
              maxLength={200}
            />
            <div className="mx-3 border-t border-slate-100 dark:border-slate-800" />
            <textarea
              value={f.description}
              onChange={(e) => setField('description', e.target.value)}
              rows={2}
              maxLength={5000}
              placeholder={cfg.descPlaceholder}
              className="block w-full px-3 py-2 bg-transparent text-[12.5px] text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none resize-y min-h-[52px]"
            />
          </div>

          {/* Details for this type */}
          {details.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-2.5 gap-y-2">
              {details.map((d, i) => (
                <label key={d.key} className={`block ${i === details.length - 1 ? lastSpan : ''}`}>
                  <span className="block text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5 pl-0.5">{d.label}</span>
                  <span className={boxCls}>
                    <span className="text-slate-400 shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5">{d.icon}</span>
                    {d.input}
                  </span>
                </label>
              ))}
            </div>
          )}
          {over > 0 && <p className="-mt-1 text-[11px] font-bold text-fuchsia-600 dark:text-fuchsia-400">លើសល្បឿនកំណត់ {over} km/h</p>}

          {/* Files to upload with this save */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => formFileRef.current?.click()}
              className="h-12 px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 inline-flex items-center gap-2 text-[11.5px] font-semibold cursor-pointer transition"
            >
              <Paperclip className="w-4 h-4" />
              <span className="text-left leading-tight">
                ភ្ជាប់ឯកសារ
                <span className="block text-[10px] font-normal text-slate-400">រូបភាព / PDF ≤ 3MB</span>
              </span>
            </button>
            {pending.map((p, i) => (
              <div key={i} className="relative w-12 h-12 rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800 flex items-center justify-center" title={p.name}>
                {p.pdf ? <FileText className="w-5 h-5 text-rose-500" /> : <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />}
                <button
                  type="button"
                  onClick={() => setPending((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer"
                  title="ដកចេញ"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            <input
              ref={formFileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={async (e) => {
                const list: File[] = Array.from(e.target.files || []);
                e.target.value = '';
                const prepared = await prepareFiles(list, notify);
                setPending((prev) => [...prev, ...prepared].slice(0, 15));
              }}
            />
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button
            type="button"
            onClick={() => {
              setForm(null);
              setPending([]);
            }}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
          >
            បោះបង់
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? (pending.length ? 'កំពុង Upload...' : 'កំពុងរក្សាទុក...') : 'រក្សាទុក'}
          </button>
        </div>
      </form>
    );
  };

  // ── One record in the timeline ─────────────────────────────────────────
  const renderLog = (l: VehicleLog) => {
    const t = logTypeOf(l.logType);
    const s = logStatusOf(l.status, l.logType);
    const busy = busyId === l.id;
    const over = l.speedKmh !== null && l.speedLimitKmh !== null ? l.speedKmh - l.speedLimitKmh : null;
    const facts: { icon: React.ReactNode; text: string; cls?: string }[] = [];
    const costLabel = fieldLabel(l.logType, 'cost').replace(/\s*\(\$\)\s*$/, '');
    if (l.cost !== null) facts.push({ icon: <DollarSign className="w-3 h-3" />, text: `${costLabel} $${fmtMoney(l.cost)}`, cls: 'font-bold text-slate-800 dark:text-slate-100' });
    if (l.shop) facts.push({ icon: <Store className="w-3 h-3" />, text: l.shop });
    if (l.odometer !== null) facts.push({ icon: <Gauge className="w-3 h-3" />, text: `${l.odometer.toLocaleString('en-US')} km` });
    if (l.driver) facts.push({ icon: <User className="w-3 h-3" />, text: l.driver });
    if (l.speedKmh !== null)
      facts.push({
        icon: <AlertCircle className="w-3 h-3" />,
        text: `${l.speedKmh} km/h${l.speedLimitKmh !== null ? ` / កំណត់ ${l.speedLimitKmh}` : ''}${over !== null && over > 0 ? ` (លើស ${over})` : ''}`,
        cls: 'font-bold text-fuchsia-700 dark:text-fuchsia-300'
      });
    if (l.location) facts.push({ icon: <MapPin className="w-3 h-3" />, text: l.location });

    return (
      <li key={l.id} className="relative pl-6">
        <span className="absolute left-[5px] top-2 bottom-[-12px] w-px bg-slate-200 dark:bg-slate-800" />
        <span className={`absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full ring-2 ring-white dark:ring-slate-900 ${l.status === 'DONE' ? 'bg-emerald-500' : l.status === 'IN_PROGRESS' ? 'bg-amber-500' : 'bg-rose-500'}`} />
        <div className={`rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 bg-white dark:bg-slate-900 p-3 ${busy ? 'opacity-60' : ''}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  {fmtDate(l.logDate)}
                </span>
                <span className={`${PILL} ${t.tone}`}>{t.label}</span>
                <span className={`${PILL} ${s.tone}`}>{s.label}</span>
              </div>
              {l.title && <p className="text-[13px] font-bold text-slate-900 dark:text-white break-words">{l.title}</p>}
              {l.description && <p className="text-[12px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">{l.description}</p>}
            </div>
            <div className="flex items-center shrink-0">
              {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400 mx-1" />}
              {(canCreate || canEdit) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    rowFileTarget.current = l;
                    rowFileRef.current?.click();
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 cursor-pointer disabled:opacity-40"
                  title="ភ្ជាប់ឯកសារ"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setPending([]);
                    setForm(toForm(l));
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 cursor-pointer disabled:opacity-40"
                  title="កែប្រែ"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDelete(l)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer disabled:opacity-40"
                  title="លុប"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {facts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-slate-500 dark:text-slate-400">
              {facts.map((x, i) => (
                <span key={i} className={`inline-flex items-center gap-1 ${x.cls || ''}`}>
                  <span className="text-slate-400">{x.icon}</span>
                  {x.text}
                </span>
              ))}
            </div>
          )}

          {l.files.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {l.files.map((file) => (
                <div key={file.id} className="relative group">
                  <a
                    href={file.driveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-16 h-16 rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800"
                    title={file.fileName}
                  >
                    {isPdf(file.mimeType, file.fileName) ? (
                      <span className="w-full h-full flex flex-col items-center justify-center gap-0.5">
                        <FileText className="w-6 h-6 text-rose-500" />
                        <span className="text-[9px] font-bold text-slate-500">PDF</span>
                      </span>
                    ) : (
                      <img src={driveThumb(file.driveFileId, 160)} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    )}
                  </a>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(l, file.id)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white items-center justify-center cursor-pointer hidden group-hover:flex"
                      title="ដកឯកសារ"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {(l.createdBy || l.updatedBy) && (
            <p className="mt-2 text-[10.5px] text-slate-400">
              {l.createdBy && <>បង្កើតដោយ {l.createdBy}</>}
              {l.updatedBy && l.updatedBy !== l.createdBy && <> • កែដោយ {l.updatedBy}</>}
            </p>
          )}
        </div>
      </li>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-5 animate-in fade-in duration-150"
      onClick={() => !saving && onClose()}
    >
      <div
        className={`bg-slate-50 dark:bg-slate-950 rounded-t-3xl sm:rounded-2xl max-w-2xl w-full shadow-2xl ring-1 ring-black/5 dark:ring-white/10 max-h-[94vh] sm:max-h-[88vh] flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-5 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            {form ? (
              <button
                type="button"
                onClick={() => {
                  setForm(null);
                  setPending([]);
                }}
                disabled={saving}
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                title="ត្រលប់"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                <History className="w-4.5 h-4.5" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {form ? (form.id ? 'កែប្រែកំណត់ត្រា' : 'បន្ថែមកំណត់ត្រាថ្មី') : 'កំណត់ត្រាលម្អិត (History Log)'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{vehicle.modelNo || '—'}</span>
                {vehicle.vehicleType && <> • {vehicle.vehicleType}</>}
                {vehicle.driver && <> • {vehicle.driver}</>}
                {vehicle.station && <> • {vehicle.station}</>}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {form ? (
          renderForm(form)
        ) : (
          <>
            {/* Stats + filters */}
            {logs.length > 0 && (
            <div className="shrink-0 px-5 pt-3 pb-2 space-y-2 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                {/* Totals in one compact bar */}
                <div className="inline-flex items-center divide-x divide-slate-200 dark:divide-slate-700 rounded-xl ring-1 ring-slate-200 dark:ring-slate-700 bg-slate-50 dark:bg-slate-800/60 text-[11.5px]">
                  <span className="px-2.5 py-1 text-slate-500">
                    សរុប <b className="text-slate-900 dark:text-white tabular-nums">{stats.total}</b>
                  </span>
                  <span className="px-2.5 py-1 inline-flex items-center gap-1.5 text-slate-500">
                    <span className={`w-1.5 h-1.5 rounded-full ${stats.open ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                    មិនទាន់រួច <b className={`tabular-nums ${stats.open ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{stats.open}</b>
                  </span>
                  <span className="px-2.5 py-1 text-slate-500">
                    ចំណាយ <b className="text-emerald-700 dark:text-emerald-400 tabular-nums">${fmtMoney(stats.cost)}</b>
                  </span>
                </div>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={load}
                  disabled={loading}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  title="ទាញទិន្នន័យម្តងទៀត"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => {
                      setPending([]);
                      setForm(emptyForm(vehicle));
                    }}
                    className="h-8 px-3.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    បន្ថែមកំណត់ត្រា
                  </button>
                )}
              </div>
              {LOG_TYPES.filter((t) => countsByType.get(t.id)).length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                  <button
                    type="button"
                    onClick={() => setTypeFilter('')}
                    className={`${PILL} cursor-pointer ${!typeFilter ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700'}`}
                  >
                    ទាំងអស់ {logs.length}
                  </button>
                  {LOG_TYPES.filter((t) => countsByType.get(t.id)).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTypeFilter(typeFilter === t.id ? '' : t.id)}
                      className={`${PILL} cursor-pointer ${typeFilter === t.id ? `${t.tone} ring-2 ring-blue-400` : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700'}`}
                    >
                      {t.label} {countsByType.get(t.id)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Timeline */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-4">
              {loading && !logs.length ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  កំពុងទាញទិន្នន័យ...
                </div>
              ) : error ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <AlertCircle className="w-6 h-6 text-rose-500" />
                  <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
                  <button type="button" onClick={load} className="text-xs font-bold text-blue-600 hover:underline cursor-pointer">
                    ព្យាយាមម្តងទៀត
                  </button>
                </div>
              ) : !logs.length ? (
                // Empty: short message + one-click start for each record type
                <div className="py-2">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                      <History className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-slate-700 dark:text-slate-200">មិនទាន់មានកំណត់ត្រាទេ</p>
                      <p className="text-[11.5px] text-slate-400">
                        {canCreate ? 'ជ្រើសប្រភេទខាងក្រោម ដើម្បីចាប់ផ្តើមកត់ត្រា' : 'រថយន្តនេះមិនទាន់មានប្រវត្តិ'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={load}
                      disabled={loading}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                      title="ទាញទិន្នន័យម្តងទៀត"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  {canCreate && (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {LOG_TYPES.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setPending([]);
                            setForm({ ...emptyForm(vehicle), logType: t.id });
                          }}
                          className={`group flex flex-col items-center justify-center gap-1 h-16 px-1 rounded-xl border border-dashed text-[10.5px] font-bold leading-tight text-center cursor-pointer transition bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-solid hover:border-blue-300 dark:hover:border-blue-700 hover:text-slate-800 dark:hover:text-slate-100 hover:shadow-sm`}
                        >
                          <span className={`[&>svg]:w-4 [&>svg]:h-4 ${t.tone.split(' ')[1]}`}>{TYPE_ICON[t.id]}</span>
                          <span className="line-clamp-2">{t.short}</span>
                          <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 transition -mt-0.5" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : !shown.length ? (
                <p className="py-8 text-center text-sm text-slate-400">គ្មានកំណត់ត្រាប្រភេទនេះទេ</p>
              ) : (
                <ul className="space-y-3">{shown.map(renderLog)}</ul>
              )}
            </div>
          </>
        )}

        <input
          ref={rowFileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => addFilesToRow(Array.from(e.target.files || []))}
        />
      </div>
    </div>
  );
};

export default VehicleHistoryLogModal;
