import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { formatCsv, downloadCsv } from '../../utils/csvHelper';
import { copyText } from '../../utils/clipboard';

/**
 * Shared Supabase-style data grid primitives:
 * full cell gridlines, quiet header, flat rows, checkbox + row-number gutter.
 */

export const gridWrap =
  'overflow-auto rounded-lg border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1c1c1c] custom-scrollbar';
export const gridTable = 'w-max min-w-full text-left border-separate border-spacing-0 text-[12.5px]';
export const gridTh = (compact = false) =>
  `sticky top-0 z-20 ${compact ? 'h-8' : 'h-9'} px-3 bg-slate-50 dark:bg-[#232323] border-b border-r border-slate-200 dark:border-[#2e2e2e] last:border-r-0 font-normal text-slate-600 dark:text-slate-300 whitespace-nowrap`;
export const gridTd = (compact = false) =>
  `${compact ? 'h-8' : 'h-9'} px-3 border-b border-r border-slate-100 dark:border-[#2a2a2a] last:border-r-0 whitespace-nowrap`;
export const gridRow = 'group hover:bg-slate-50 dark:hover:bg-[#262626]';
export const gridRowSelected = 'bg-emerald-50/70 dark:bg-emerald-500/10';
export const gridSticky = 'sticky bg-white dark:bg-[#1c1c1c] group-hover:bg-slate-50 dark:group-hover:bg-[#262626]';
export const gridStickySelected = '!bg-emerald-50 dark:!bg-[#1f2b24]';
export const gridType = 'ml-1.5 text-[11px] font-mono text-slate-400 dark:text-slate-500';
/** Width of the checkbox / row-number gutter; sticky columns after it start at this offset. */
export const GRID_GUTTER_PX = 48;
export const gridGutter = 'sb-gutter w-12 min-w-12 max-w-12 left-0 !px-0 text-center';
export const gridAfterGutter = 'left-12';
export const gridNull = <span className="text-slate-400 dark:text-slate-500 italic">NULL</span>;

/** Custom checkbox: 16px rounded square, emerald when checked, dash when indeterminate. */
export const GridCheckbox: React.FC<{
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  title?: string;
}> = ({ checked, indeterminate = false, onChange, title }) => {
  const on = checked || indeterminate;
  return (
    <label
      title={title}
      onClick={(e) => e.stopPropagation()}
      className="relative inline-flex items-center justify-center w-4 h-4 cursor-pointer align-middle"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-checked={indeterminate ? 'mixed' : checked}
        className="peer sr-only"
      />
      <span
        className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/40 ${
          on
            ? 'bg-emerald-600 border-emerald-600 text-white'
            : 'bg-white dark:bg-[#1c1c1c] border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
        }`}
      >
        {indeterminate ? (
          <span className="w-2 h-[2px] rounded-full bg-white" />
        ) : checked ? (
          <Check className="w-3 h-3 stroke-[3]" />
        ) : null}
      </span>
    </label>
  );
};

/** Header gutter cell: select-all checkbox */
export const GridHeadGutter: React.FC<{
  compact?: boolean;
  checked: boolean;
  indeterminate: boolean;
  onToggleAll: () => void;
  className?: string;
}> = ({ compact, checked, indeterminate, onToggleAll, className = '' }) => (
  <th className={`${gridTh(compact)} ${gridGutter} z-30 ${className}`}>
    <GridCheckbox checked={checked} indeterminate={indeterminate} onChange={onToggleAll} title="Select all" />
  </th>
);

/**
 * Body gutter cell: shows the row number; swaps to the checkbox on row hover
 * or while the row is selected (the row's <tr> must carry `group`).
 */
export const GridRowGutter: React.FC<{
  compact?: boolean;
  selected: boolean;
  rowNumber: number;
  onToggle: () => void;
  className?: string;
}> = ({ compact, selected, rowNumber, onToggle, className = '' }) => (
  <td
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    className={`${gridTd(compact)} ${gridGutter} ${gridSticky} z-10 cursor-pointer ${selected ? gridStickySelected : ''} ${className}`}
  >
    <div className="relative h-full flex items-center justify-center">
      <span
        className={`text-[11px] tabular-nums text-slate-400 dark:text-slate-500 select-none ${
          selected ? 'invisible' : 'group-hover:invisible'
        }`}
      >
        {rowNumber}
      </span>
      <span
        className={`absolute inset-0 flex items-center justify-center ${
          selected ? '' : 'invisible group-hover:visible'
        }`}
      >
        <GridCheckbox checked={selected} onChange={onToggle} />
      </span>
    </div>
  </td>
);

export const GridSelectionBar: React.FC<{
  count: number;
  onCopy: () => void;
  onExport: () => void;
  onClear: () => void;
  children?: React.ReactNode;
}> = ({ count, onCopy, onExport, onClear, children }) => {
  const [copied, setCopied] = useState(false);
  const btn =
    'flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer';
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-xs animate-in fade-in duration-150">
      <span className="font-medium text-emerald-800 dark:text-emerald-300">
        បានជ្រើសរើស <strong className="font-mono">{count.toLocaleString()}</strong> ជួរ
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            onCopy();
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className={btn}
        >
          {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" onClick={onExport} className={btn}>
          <Download className="w-3 h-3" /> Export CSV
        </button>
        {children}
        <button
          type="button"
          onClick={onClear}
          className="px-2 py-1 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
        >
          សម្អាត
        </button>
      </div>
    </div>
  );
};

/**
 * Row selection over the currently visible rows.
 * Selection resets when the set of visible keys changes (page, filter, search),
 * but survives a refetch that returns the same rows.
 */
export function useRowSelection<K>(visibleKeys: K[]) {
  const [selected, setSelected] = useState<Set<K>>(() => new Set());
  const signature = useMemo(() => visibleKeys.map(String).join('\u0001'), [visibleKeys]);

  useEffect(() => {
    setSelected(new Set());
  }, [signature]);

  const toggle = useCallback((key: K) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const count = selected.size;
  const allChecked = visibleKeys.length > 0 && count === visibleKeys.length;

  return {
    selected,
    count,
    isSelected: (key: K) => selected.has(key),
    toggle,
    toggleAll: () => setSelected(allChecked ? new Set() : new Set(visibleKeys)),
    clear: () => setSelected(new Set()),
    allChecked,
    someChecked: count > 0 && !allChecked,
  };
}

const cellText = (v: any) => (v === null || v === undefined ? '' : String(v));

/** Copy rows as tab-separated text (pastes cleanly into Excel / Google Sheets). */
export function copyRowsAsTsv(headers: string[], rows: any[][]) {
  const lines = [headers.join('\t'), ...rows.map((r) => r.map((v) => cellText(v).replace(/[\t\n\r]+/g, ' ')).join('\t'))];
  copyText(lines.join('\n'));
}

export function exportRowsAsCsv(filename: string, headers: string[], rows: any[][]) {
  downloadCsv(`${filename}_${new Date().toISOString().slice(0, 10)}.csv`, formatCsv(headers, rows.map((r) => r.map(cellText))));
}

/** Convenience: object rows → [headers, matrix] using the union of keys (minus `omit`). */
export function objectsToMatrix(objs: Record<string, any>[], omit: string[] = []): [string[], any[][]] {
  if (objs.length === 0) return [[], []];
  const headers: string[] = [];
  for (const o of objs) {
    for (const k of Object.keys(o)) {
      if (!omit.includes(k) && !headers.includes(k)) headers.push(k);
    }
  }
  const cell = (v: any) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
  return [headers, objs.map((o) => headers.map((h) => cell(o[h])))];
}

/** Selection over a list of row objects; exposes the selected objects too. */
export function useGridSelection<T>(rows: readonly T[], getKey: (row: T, idx: number) => string | number) {
  const keys = useMemo(() => rows.map(getKey), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const selection = useRowSelection(keys);
  const selectedRows = useMemo(
    () => rows.filter((_, i) => selection.selected.has(keys[i])),
    [rows, keys, selection.selected]
  );
  return { ...selection, keys, selectedRows };
}

/** Selection bar that copies / exports the selected row objects as-is. */
export const GridObjectSelectionBar: React.FC<{
  rows: Record<string, any>[];
  filename: string;
  onClear: () => void;
  omit?: string[];
  children?: React.ReactNode;
}> = ({ rows, filename, onClear, omit = [], children }) =>
  rows.length > 0 ? (
    <GridSelectionBar
      count={rows.length}
      onCopy={() => copyRowsAsTsv(...objectsToMatrix(rows, omit))}
      onExport={() => exportRowsAsCsv(filename, ...objectsToMatrix(rows, omit))}
      onClear={onClear}
    >
      {children}
    </GridSelectionBar>
  ) : null;
