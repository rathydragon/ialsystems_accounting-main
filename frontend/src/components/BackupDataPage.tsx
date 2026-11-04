import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { RestoreBackupModal } from './RestoreBackupModal';

// Viewer for the local PostgreSQL backup (works on the local machine only).
// Restore puts back only rows missing from Hostinger (see RestoreBackupModal).

interface BackupTable {
  name: string;
  rowCount: number;
}

interface LastBackup {
  status: string;
  message?: string;
  records: number;
  finishedAt: string | null;
}

interface RowsResult {
  table: string;
  columns: string[];
  hiddenColumns: string[];
  rows: Record<string, string | null>[];
  total: number;
  page: number;
  pageSize: number;
}

interface BackupDataPageProps {
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const PAGE_SIZES = [25, 50, 100, 200];
const API = '/api/backup-postgres';

async function getJson(params: Record<string, string | number>) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${API}?${qs}`, { method: 'GET' });
  const data = await res.json().catch(() => ({ ok: false, message: `HTTP ${res.status}` }));
  return data;
}

const fmtNumber = (n: number) => n.toLocaleString('en-US');

function fmtDate(v: string | null | undefined) {
  if (!v) return '-';
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString('en-GB');
}

function csvCell(v: unknown) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const BackupDataPage: React.FC<BackupDataPageProps> = ({ onShowToast }) => {
  const [tables, setTables] = useState<BackupTable[]>([]);
  const [lastBackup, setLastBackup] = useState<LastBackup | null>(null);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCloud, setIsCloud] = useState(false);
  const [tableFilter, setTableFilter] = useState('');

  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<RowsResult | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const requestId = useRef(0);

  // Fill the screen: fit the page to the window height, or cover the whole window.
  const rootRef = useRef<HTMLDivElement>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [fitHeight, setFitHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const measure = () => {
      const el = rootRef.current;
      if (!el || fullScreen || window.innerWidth < 1024) return setFitHeight(undefined);
      const top = el.getBoundingClientRect().top + window.scrollY;
      // Leave room for the page container's bottom padding so the window doesn't scroll
      const main = el.closest('main');
      const padBottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      setFitHeight(Math.max(420, Math.floor(window.innerHeight - top - padBottom)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [fullScreen]);

  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullScreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullScreen]);

  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    setError(null);
    try {
      const data = await getJson({ browse: 'tables' });
      if (!data.ok) {
        setIsCloud(!!data.isCloud);
        setError(data.message || 'មិនអាចទាញបញ្ជី table បានទេ');
        setTables([]);
        return;
      }
      if (!Array.isArray(data.tables)) {
        // Older backend answered with the plain backup status
        setError('Backend មិនទាន់មានកូដ Backup Data ថ្មីទេ។ សូម Restart backend (npm run dev) ម្ដងទៀត។');
        setTables([]);
        return;
      }
      setTables(data.tables);
      setLastBackup(data.lastBackup || null);
      setSelected((cur) => cur ?? data.tables?.[0]?.name ?? null);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setTablesLoading(false);
    }
  }, []);

  useEffect(() => { loadTables(); }, [loadTables]);

  // Wait a moment after typing before searching
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadRows = useCallback(async () => {
    if (!selected) return;
    const id = ++requestId.current;
    setRowsLoading(true);
    setRowsError(null);
    try {
      const params: Record<string, string | number> = { browse: 'rows', table: selected, page, pageSize };
      if (search) params.search = search;
      if (sort) { params.sort = sort.col; params.dir = sort.dir; }
      const data = await getJson(params);
      if (id !== requestId.current) return;
      if (!data.ok) {
        setRowsError(data.message || 'មិនអាចទាញទិន្នន័យបានទេ');
        setResult(null);
        return;
      }
      setResult(data);
    } catch (err: any) {
      if (id === requestId.current) setRowsError(err?.message || String(err));
    } finally {
      if (id === requestId.current) setRowsLoading(false);
    }
  }, [selected, page, pageSize, search, sort]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const selectTable = (name: string) => {
    if (name === selected) return;
    setSelected(name);
    setResult(null);
    setPage(1);
    setSort(null);
    setSearchInput('');
    setSearch('');
  };

  const toggleSort = (col: string) => {
    setPage(1);
    setSort((cur) => (cur?.col !== col ? { col, dir: 'asc' } : cur.dir === 'asc' ? { col, dir: 'desc' } : null));
  };

  const exportCsv = async () => {
    if (!selected || !result) return;
    setExporting(true);
    try {
      const all: Record<string, string | null>[] = [];
      const size = 500;
      for (let p = 1; ; p++) {
        const params: Record<string, string | number> = { browse: 'rows', table: selected, page: p, pageSize: size };
        if (search) params.search = search;
        if (sort) { params.sort = sort.col; params.dir = sort.dir; }
        const data = await getJson(params);
        if (!data.ok) throw new Error(data.message);
        all.push(...data.rows);
        if (data.rows.length < size || all.length >= data.total) break;
      }
      const cols = result.columns;
      const lines = [cols.map(csvCell).join(','), ...all.map((r) => cols.map((c) => csvCell(r[c])).join(','))];
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_${selected}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      onShowToast(`បាន Export ${fmtNumber(all.length)} ជួរ`, 'success');
    } catch (err: any) {
      onShowToast('Export បរាជ័យ: ' + (err?.message || err), 'error');
    } finally {
      setExporting(false);
    }
  };

  const filteredTables = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    return q ? tables.filter((t) => t.name.toLowerCase().includes(q)) : tables;
  }, [tables, tableFilter]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const firstRow = result && result.total ? (result.page - 1) * result.pageSize + 1 : 0;
  const lastRow = result ? Math.min(result.total, result.page * result.pageSize) : 0;


  const iconBtn =
    'inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 hover:text-indigo-600 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none';
  const inputCls =
    'w-full pl-8 pr-2 h-8 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-900';
  const selectedInfo = tables.find((t) => t.name === selected);

  return (
    <div
      ref={rootRef}
      style={fullScreen ? undefined : { height: fitHeight }}
      className={fullScreen
        ? 'fixed inset-0 z-[100] flex flex-col gap-2 p-2 bg-slate-50 dark:bg-slate-950'
        : 'flex flex-col gap-2'}
    >
      {/* Header: one slim row */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
          <Database className="w-4 h-4" />
        </div>
        <div className="min-w-0 leading-tight">
          <h1 className="text-[15px] font-bold text-slate-900 dark:text-white">Backup Data</h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">Local PostgreSQL · មើល និង Restore ជួរដែលបាត់</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {lastBackup && (
            <span
              title={lastBackup.message || ''}
              className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${lastBackup.status === 'SUCCESS' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              Backup ចុងក្រោយ <b className="font-semibold text-slate-800 dark:text-slate-100">{fmtDate(lastBackup.finishedAt)}</b>
            </span>
          )}
          <button onClick={() => { loadTables(); loadRows(); }} title="Refresh" className={iconBtn}>
            <RefreshCw className={`w-3.5 h-3.5 ${tablesLoading || rowsLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setFullScreen((v) => !v)}
            title={fullScreen ? 'បិទពេញអេក្រង់ (Esc)' : 'ពេញអេក្រង់'}
            className={iconBtn}
          >
            {fullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {error ? (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${isCloud
          ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200'
          : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-200'}`}>
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">{isCloud ? 'មិនអាចប្រើបាននៅទីនេះ' : 'មិនអាចភ្ជាប់ទៅ Backup បានទេ'}</p>
            <p className="mt-1">{error}</p>
            {isCloud && <p className="mt-1 text-xs">សូមបើក App នៅលើម៉ាស៊ីន Local ដែលមាន PostgreSQL Backup។</p>}
          </div>
        </div>
      ) : (
        /* One card: table list on the left, data on the right */
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          {/* Table list */}
          <aside className="lg:w-52 shrink-0 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900">
            <div className="p-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  placeholder={`ស្វែងរក table (${tables.length})`}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="overflow-y-auto max-h-48 lg:max-h-none flex-1 px-1.5 pb-1.5 space-y-px">
              {tablesLoading && !tables.length ? (
                <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> កំពុងទាញ...
                </div>
              ) : filteredTables.length === 0 ? (
                <p className="p-3 text-xs text-slate-500">មិនមាន table ទេ</p>
              ) : (
                filteredTables.map((t) => {
                  const active = t.name === selected;
                  return (
                    <button
                      key={t.name}
                      onClick={() => selectTable(t.name)}
                      className={`w-full flex items-center justify-between gap-2 px-2 h-7 rounded-md text-left text-xs transition-colors ${active
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'}`}
                    >
                      <span className="truncate" title={t.name}>{t.name}</span>
                      <span className={`shrink-0 text-[10px] tabular-nums ${active ? 'text-indigo-100' : t.rowCount ? 'text-slate-400' : 'text-slate-300 dark:text-slate-600'}`}>
                        {fmtNumber(t.rowCount)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Data */}
          <section className="flex-1 min-w-0 min-h-0 flex flex-col">
            <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 border-b border-slate-200 dark:border-slate-800">
              <div className="mr-auto flex items-center gap-2 min-w-0">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{selected || '-'}</span>
                {selectedInfo && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 tabular-nums">
                    {result ? `${result.columns.length} columns · ` : ''}{fmtNumber(result?.total ?? selectedInfo.rowCount)} ជួរ
                  </span>
                )}
              </div>
              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="ស្វែងរកក្នុងគ្រប់ column..."
                  className={`${inputCls} pr-7`}
                />
                {searchInput && (
                  <button onClick={() => setSearchInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setRestoreOpen(true)}
                disabled={!selected}
                title="Restore ជួរដែលបាត់ពី Hostinger (មិនសរសេរជាន់ទិន្នន័យដែលមានស្រាប់)"
                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore
              </button>
              <button
                onClick={exportCsv}
                disabled={!result || !result.total || exporting}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                CSV
              </button>
            </div>

            <div className={`relative overflow-auto flex-1 min-h-[200px] ${fullScreen ? '' : 'max-h-[70vh] lg:max-h-none'} lg:min-h-0`}>
              {rowsLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/50 dark:bg-slate-900/50">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                </div>
              )}
              {rowsError ? (
                <p className="p-4 text-sm text-rose-600">{rowsError}</p>
              ) : result && result.rows.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">
                  {search ? 'រកមិនឃើញទិន្នន័យដែលត្រូវនឹងការស្វែងរកទេ' : 'Table នេះមិនមានទិន្នន័យទេ'}
                </p>
              ) : result ? (
                <table className="min-w-full text-xs border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 dark:bg-slate-800">
                      <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800 px-2 h-8 text-right font-medium text-slate-400 border-b border-slate-200 dark:border-slate-700 w-10">#</th>
                      {result.columns.map((c) => (
                        <th key={c} className="px-2 h-8 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap border-b border-slate-200 dark:border-slate-700">
                          <button
                            onClick={() => toggleSort(c)}
                            className={`inline-flex items-center gap-1 hover:text-indigo-600 ${sort?.col === c ? 'text-indigo-600 dark:text-indigo-400' : ''}`}
                          >
                            {c}
                            {sort?.col === c && (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="group odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900 dark:even:bg-slate-800/30 hover:!bg-indigo-50/70 dark:hover:!bg-indigo-900/20">
                        <td className="sticky left-0 bg-inherit px-2 h-7 text-right text-[10px] text-slate-400 tabular-nums border-b border-slate-100 dark:border-slate-800">
                          {firstRow + i}
                        </td>
                        {result.columns.map((c) => {
                          const v = row[c];
                          return (
                            <td
                              key={c}
                              title={v ?? ''}
                              className="px-2 h-7 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[260px] truncate border-b border-slate-100 dark:border-slate-800"
                            >
                              {v == null || v === '' ? <span className="text-slate-300 dark:text-slate-600">·</span> : v}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>

            {/* Pagination */}
            {result && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="tabular-nums">
                  {fmtNumber(firstRow)}–{fmtNumber(lastRow)} នៃ {fmtNumber(result.total)}
                  {result.hiddenColumns.length > 0 && (
                    <span className="ml-2 text-slate-400">· លាក់: {result.hiddenColumns.join(', ')}</span>
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="h-7 px-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / ទំព័រ</option>)}
                  </select>
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className={`${iconBtn} !w-7 !h-7`}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="tabular-nums px-1">{page} / {fmtNumber(totalPages)}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className={`${iconBtn} !w-7 !h-7`}>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
      {restoreOpen && selected && (
        <RestoreBackupModal table={selected} onClose={() => setRestoreOpen(false)} onShowToast={onShowToast} />
      )}
    </div>
  );
};
