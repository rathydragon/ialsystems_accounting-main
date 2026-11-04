import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';

// Insert-only restore: puts back rows that are in the backup but missing from Hostinger.
// Rows that exist in Hostinger are never changed.

type Row = Record<string, string | null>;

interface Preview {
  table: string;
  columns: string[];
  pk: string[];
  skippedColumns: string[];
  backupCount: number;
  liveCount: number;
  backupAt: string | null;
  counts: { missing: number; same: number; different: number; tombstoned: number };
  maxPerRun: number;
  missing: { key: string; row: Row }[];
  different: { key: string; row: Row }[];
  tombstoned: { key: string; row: Row }[];
}

interface Props {
  table: string;
  onClose: () => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const API = '/api/backup-postgres';
const fmt = (n: number) => n.toLocaleString('en-US');

async function post(action: string, body: unknown) {
  const res = await fetch(`${API}?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false, message: `HTTP ${res.status}` }));
}

function fmtDate(v: string | null) {
  if (!v) return '-';
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString('en-GB');
}

const RowTable: React.FC<{
  columns: string[];
  rows: { key: string; row: Row }[];
  checked?: Set<string>;
  onToggle?: (key: string) => void;
}> = ({ columns, rows, checked, onToggle }) => (
  <div className="overflow-auto max-h-64 border border-slate-200 dark:border-slate-700 rounded-lg">
    <table className="min-w-full text-[11px] border-separate border-spacing-0">
      <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
        <tr>
          {checked && <th className="w-8 border-b border-slate-200 dark:border-slate-700" />}
          {columns.map((c) => (
            <th key={c} className="px-2 h-7 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap border-b border-slate-200 dark:border-slate-700">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ key, row }) => (
          <tr key={key} className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-800/30">
            {checked && (
              <td className="px-2 text-center border-b border-slate-100 dark:border-slate-800">
                <input type="checkbox" checked={checked.has(key)} onChange={() => onToggle?.(key)} className="accent-indigo-600" />
              </td>
            )}
            {columns.map((c) => (
              <td key={c} title={row[c] ?? ''} className="px-2 h-6 whitespace-nowrap max-w-[200px] truncate text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800">
                {row[c] ?? <span className="text-slate-300 dark:text-slate-600">·</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const RestoreBackupModal: React.FC<Props> = ({ table, onClose, onShowToast }) => {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await post('get_restore_preview', { table });
      if (!data.ok) {
        setError(data.message || 'មិនអាចពិនិត្យបានទេ');
        setPreview(null);
        return;
      }
      setPreview(data);
      setChecked(new Set(data.missing.map((m: { key: string }) => m.key)));
      setConfirmText('');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [table]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !restoring) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, restoring]);

  // Show the key columns first, then a few others
  const shownColumns = useMemo(() => {
    if (!preview) return [];
    const rest = preview.columns.filter((c) => !preview.pk.includes(c));
    return [...preview.pk, ...rest].slice(0, 8);
  }, [preview]);

  const toggle = (key: string) => setChecked((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const allChecked = !!preview && preview.missing.length > 0 && checked.size === preview.missing.length;
  const canRestore = !!preview && checked.size > 0 && confirmText.trim() === table && !restoring;

  const restore = async () => {
    if (!canRestore) return;
    setRestoring(true);
    try {
      const data = await post('restore_backup', { table, keys: [...checked], confirm: confirmText.trim() });
      if (!data.ok) {
        onShowToast(data.message || 'Restore បរាជ័យ', 'error');
        return;
      }
      setDone(data.message);
      onShowToast(data.message, 'success');
      await load();
    } catch (err: any) {
      onShowToast('Restore បរាជ័យ: ' + (err?.message || err), 'error');
    } finally {
      setRestoring(false);
    }
  };

  const tile = (label: string, value: number, cls: string, note: string) => (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <div className="text-[11px] opacity-80">{label}</div>
      <div className="text-lg font-bold tabular-nums">{fmt(value)}</div>
      <div className="text-[10px] opacity-70">{note}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={() => !restoring && onClose()}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <RotateCcw className="w-4 h-4 text-amber-600" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Restore ទៅ Hostinger · <span className="text-indigo-600 dark:text-indigo-400">{table}</span></h2>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={load} disabled={loading || restoring} title="ពិនិត្យម្ដងទៀត" className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} disabled={restoring} className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm text-slate-700 dark:text-slate-300">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            បញ្ចូលតែជួរដែលមានក្នុង Backup តែ <b>បាត់</b> ពី Hostinger ប៉ុណ្ណោះ។ ជួរដែលមានរួចហើយក្នុង Hostinger មិនត្រូវកែ ឬលុបទេ។
          </p>

          {done && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-800 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> {done}
            </div>
          )}

          {loading && !preview ? (
            <div className="flex items-center gap-2 py-10 justify-center text-slate-500 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> កំពុងប្រៀបធៀប Backup ជាមួយ Hostinger...
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-200 dark:border-rose-800 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          ) : preview ? (
            <>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Backup ចុងក្រោយ: <b>{fmtDate(preview.backupAt)}</b> · Backup {fmt(preview.backupCount)} ជួរ · Hostinger ឥឡូវ {fmt(preview.liveCount)} ជួរ · Key: {preview.pk.join(', ')}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {tile('បាត់ពី Hostinger', preview.counts.missing, 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-100', 'អាច Restore')}
                {tile('ដូចគ្នា', preview.counts.same, 'bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100', 'រំលង')}
                {tile('ខុសគ្នា', preview.counts.different, 'bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-900/20 dark:border-sky-800 dark:text-sky-100', 'Hostinger ថ្មីជាង · មិនកែ')}
                {tile('ធ្លាប់លុបដោយចេតនា', preview.counts.tombstoned, 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-100', 'រំលង')}
              </div>

              {preview.skippedColumns.length > 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Column មិនមានក្នុង Hostinger ទៀតទេ (មិនបញ្ចូល): {preview.skippedColumns.join(', ')}
                </p>
              )}

              {preview.missing.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold">ជួរដែលបាត់ ({fmt(checked.size)} / {fmt(preview.missing.length)} បានជ្រើស)</h3>
                    <button
                      onClick={() => setChecked(allChecked ? new Set() : new Set(preview.missing.map((m) => m.key)))}
                      className="text-[11px] text-indigo-600 hover:underline"
                    >
                      {allChecked ? 'ដកការជ្រើសទាំងអស់' : 'ជ្រើសទាំងអស់'}
                    </button>
                  </div>
                  {preview.counts.missing > preview.missing.length && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      បង្ហាញតែ {fmt(preview.maxPerRun)} ជួរដំបូង។ Restore ម្ដងបានច្រើនបំផុត {fmt(preview.maxPerRun)} ជួរ — បន្ទាប់ពី Restore ចុច ពិនិត្យម្ដងទៀត ដើម្បីបន្ត។
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    ពិនិត្យឱ្យច្បាស់៖ ជួរដែលអ្នកប្រើបានលុបចោលក្រោយ Backup ក៏បង្ហាញជា "បាត់" ដែរ។ ដកការជ្រើសជួរណាដែលមិនចង់យកមកវិញ។
                  </p>
                  <RowTable columns={shownColumns} rows={preview.missing} checked={checked} onToggle={toggle} />
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-200 dark:border-emerald-800 text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> គ្មានជួរណាបាត់ពី Hostinger ទេ — មិនចាំបាច់ Restore។
                </div>
              )}

              {preview.different.length > 0 && (
                <details className="space-y-2">
                  <summary className="text-xs font-bold cursor-pointer">ជួរខុសគ្នា (តម្លៃក្នុង Backup) — មើលតែប៉ុណ្ណោះ {preview.counts.different > preview.different.length ? `(${preview.different.length} ដំបូង)` : ''}</summary>
                  <RowTable columns={shownColumns} rows={preview.different} />
                </details>
              )}

              {preview.tombstoned.length > 0 && (
                <details className="space-y-2">
                  <summary className="text-xs font-bold cursor-pointer">ជួរធ្លាប់លុបដោយចេតនា — មិន Restore {preview.counts.tombstoned > preview.tombstoned.length ? `(${preview.tombstoned.length} ដំបូង)` : ''}</summary>
                  <RowTable columns={shownColumns} rows={preview.tombstoned} />
                </details>
              )}
            </>
          ) : null}
        </div>

        {preview && preview.missing.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900">
            <label className="text-xs text-slate-600 dark:text-slate-300">
              វាយ <b className="font-mono">{table}</b> ដើម្បីបញ្ជាក់:
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={table}
              className="h-8 px-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:border-amber-400 w-56"
            />
            <button
              onClick={restore}
              disabled={!canRestore}
              className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              Restore {fmt(checked.size)} ជួរ
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
