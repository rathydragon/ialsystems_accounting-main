import React from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Check,
  Copy,
  History,
  BellPlus,
  ClipboardCheck,
  MoreHorizontal
} from 'lucide-react';
import { SheetColumnDef, SheetRowData } from '../../utils/googleSheetFetcher';
import { BarcodeWarehouseSummary, TableDensity } from './types';
import { DistributionReportItem } from '../../types';
import {
  gridWrap,
  gridTable,
  gridTh,
  gridTd,
  gridRow,
  gridRowSelected,
  gridSticky,
  gridStickySelected,
  gridAfterGutter,
  GridHeadGutter,
  GridRowGutter,
  GridSelectionBar,
  useRowSelection,
  copyRowsAsTsv,
  exportRowsAsCsv
} from '../ui/DataGrid';

interface DataReportTableProps {
  visibleColumns: SheetColumnDef[];
  paginatedRows: SheetRowData[];
  currentPage: number;
  pageSize: number;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
  onSort: (columnId: string) => void;
  tableDensity: TableDensity;
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  onTableScroll: () => void;
  copiedCellId: string | null;
  copiedPackageRowId: string | null;
  onCopyCell: (cellId: string, val: any) => void;
  onCopyBarcodeOnly: (barcode: string, cellId: string, e?: React.MouseEvent) => void;
  onCopyBarcodePackage: (row: SheetRowData, rowKey: string, e?: React.MouseEvent) => void;
  onSelectTimeline: (barcode: string, row: SheetRowData) => void;
  onOpenDistModal: (barcode: string) => void;
  getBarcodeWarehouseSummary: (barcode: string) => BarcodeWarehouseSummary | null;
  distReportsByBarcode: Map<string, DistributionReportItem>;
  isRowDelivered: (row: SheetRowData) => boolean;
  onOpenDetail: (row: SheetRowData, rowNumber: number, rowKey: string) => void;
}

const isBarcodeColumn = (col: SheetColumnDef) => (col.label || col.id || '').trim().toUpperCase() === 'BARCODE';

interface RowMenuItem {
  key: string;
  icon: React.ElementType;
  label: string;
  hint?: string;
  tone?: 'emerald';
  onSelect: (e: React.MouseEvent) => void;
}

const MENU_WIDTH = 248;

/** Small copy icon shown when hovering a cell (like Meterial_Office). */
const CellCopyButton: React.FC<{ copied: boolean; title?: string; onCopy: (e: React.MouseEvent) => void }> = ({
  copied,
  title = 'Copy',
  onCopy
}) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onCopy(e);
    }}
    title={title}
    className={`p-1 rounded-md shrink-0 transition cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 ${
      copied ? 'opacity-100' : 'opacity-0 group-hover/cell:opacity-100 focus-visible:opacity-100'
    }`}
  >
    {copied ? (
      <Check className="w-3 h-3 text-emerald-600" />
    ) : (
      <Copy className="w-3 h-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" />
    )}
  </button>
);

/**
 * "⋯" trigger + dropdown. Rendered in a portal with fixed positioning so it isn't clipped by the
 * scrolling table or the sticky barcode cell. A small dot on the trigger keeps the at-a-glance
 * status (scan history / distribution recorded) that the inline icons used to show.
 */
const RowActionsMenu: React.FC<{
  items: RowMenuItem[];
  copied?: boolean;
  indicator?: 'emerald' | 'indigo' | null;
  indicatorTitle?: string;
}> = ({ items, copied, indicator, indicatorTitle }) => {
  const [pos, setPos] = React.useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const open = pos !== null;

  const close = React.useCallback(() => setPos(null), []);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) return close();
    const r = triggerRef.current!.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const estHeight = items.length * 36 + 12;
    setPos(
      r.bottom + estHeight + 8 > window.innerHeight
        ? { bottom: window.innerHeight - r.top + 4, left }
        : { top: r.bottom + 4, left }
    );
  };

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  const alwaysVisible = open || copied || !!indicator;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        title={indicatorTitle || 'សកម្មភាព'}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition cursor-pointer ${
          copied
            ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60'
            : open
            ? 'text-slate-800 bg-slate-100 dark:text-slate-100 dark:bg-slate-800'
            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
        } ${alwaysVisible ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
      >
        {copied ? <Check className="w-3.5 h-3.5 animate-in zoom-in-75 duration-100" /> : <MoreHorizontal className="w-4 h-4" />}
        {indicator && !copied && (
          <span
            className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ring-2 ring-white dark:ring-[#1c1c1c] ${
              indicator === 'emerald' ? 'bg-emerald-500' : 'bg-indigo-500'
            }`}
          />
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: MENU_WIDTH }}
            className="z-[60] p-1 rounded-lg bg-white dark:bg-[#232323] border border-slate-200 dark:border-[#2e2e2e] shadow-lg shadow-slate-900/10 animate-in fade-in zoom-in-95 duration-100"
          >
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    close();
                    item.onSelect(e);
                  }}
                  className="w-full h-9 px-2.5 rounded-md flex items-center gap-2.5 text-left text-[12.5px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2e2e2e] transition cursor-pointer"
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${item.tone === 'emerald' ? 'text-emerald-600' : 'text-slate-400'}`}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && (
                    <span className="max-w-[80px] truncate text-[11px] text-slate-400 tabular-nums">{item.hint}</span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
};

export const DataReportTable: React.FC<DataReportTableProps> = React.memo(({
  visibleColumns,
  paginatedRows,
  currentPage,
  pageSize,
  sortColumn,
  sortDirection,
  onSort,
  tableDensity,
  tableContainerRef,
  onTableScroll,
  copiedCellId,
  copiedPackageRowId,
  onCopyCell,
  onCopyBarcodeOnly,
  onCopyBarcodePackage,
  onSelectTimeline,
  onOpenDistModal,
  getBarcodeWarehouseSummary,
  distReportsByBarcode,
  isRowDelivered,
  onOpenDetail
}) => {
  const compact = tableDensity === 'compact';
  const rowKeys = React.useMemo(() => paginatedRows.map((row, idx) => row._id || `row_${idx}`), [paginatedRows]);
  const selection = useRowSelection(rowKeys);

  const selectedMatrix = () => {
    const headers = visibleColumns.map((c) => c.label || c.id);
    const rows = paginatedRows
      .filter((_, idx) => selection.isSelected(rowKeys[idx]))
      .map((row) => visibleColumns.map((c) => row[c.id]));
    return [headers, rows] as const;
  };

  return (
    <div className="space-y-1.5 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
      {selection.count > 0 && (
        <GridSelectionBar
          count={selection.count}
          onCopy={() => copyRowsAsTsv(...selectedMatrix())}
          onExport={() => exportRowsAsCsv('data_report_selected', ...selectedMatrix())}
          onClear={selection.clear}
        />
      )}
      <div
        ref={tableContainerRef}
        onScroll={onTableScroll}
        className={`${gridWrap} max-h-[70vh] lg:max-h-none lg:flex-1 lg:min-h-0`}
      >
        <table className={gridTable}>
          <thead>
            <tr>
              <GridHeadGutter
                compact={compact}
                checked={selection.allChecked}
                indeterminate={selection.someChecked}
                onToggleAll={selection.toggleAll}
              />
              {visibleColumns.map((col) => {
                const isSorted = sortColumn === col.id;
                const isBarcodeCol = isBarcodeColumn(col);

                return (
                  <th
                    key={col.id}
                    onClick={() => onSort(col.id)}
                    className={`${gridTh(compact)} cursor-pointer select-none hover:text-slate-900 dark:hover:text-white ${
                      isBarcodeCol ? `${gridAfterGutter} z-30 ${compact ? 'min-w-[150px]' : 'min-w-[160px]'}` : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{col.label || col.id}</span>
                      {isSorted ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-emerald-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="py-12 text-center text-slate-400">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="font-semibold text-xs">មិនមានទិន្នន័យដែលត្រូវនឹងពាក្យស្វែងរកឡើយ</p>
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, idx) => {
                const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                const rowKey = rowKeys[idx];
                const isPackageCopied = copiedPackageRowId === rowKey;
                const isDelivered = isRowDelivered(row);
                const isSelected = selection.isSelected(rowKey);

                return (
                  <tr
                    key={row._id || idx}
                    onClick={() => onOpenDetail(row, rowNumber, rowKey)}
                    title="ចុចដើម្បីមើលព័ត៌មានលម្អិត"
                    className={`${gridRow} cursor-pointer ${
                      isPackageCopied ? 'bg-emerald-50/50 dark:bg-emerald-950/30' : isSelected ? gridRowSelected : ''
                    }`}
                  >
                    <GridRowGutter
                      compact={compact}
                      selected={isSelected}
                      rowNumber={rowNumber}
                      onToggle={() => selection.toggle(rowKey)}
                    />

                    {/* Visible Columns */}
                    {visibleColumns.map((col) => {
                      const val = row[col.id];
                      const cellId = `${row._id || idx}_${col.id}`;
                      const isCopied = copiedCellId === cellId;
                      const strVal = val !== undefined && val !== null ? String(val) : '';
                      const isBarcodeCol = isBarcodeColumn(col);
                      const isStatusCol = (col.label || col.id || '').trim().toUpperCase().includes('STATUS');

                      const isNumeric =
                        col.type === 'number' ||
                        (!isNaN(Number(strVal)) &&
                          strVal.trim() !== '' &&
                          !strVal.startsWith('0') &&
                          strVal.length < 15);

                      // Specialized rendering for BARCODE column (Sticky freeze column)
                      if (isBarcodeCol) {
                        const cleanCode = (strVal || '').trim().toUpperCase();
                        const summary =
                          cleanCode && cleanCode !== '#N/A' && cleanCode !== '—'
                            ? getBarcodeWarehouseSummary(cleanCode)
                            : null;

                        return (
                          <td
                            key={col.id}
                            className={`${gridTd(compact)} ${gridSticky} ${gridAfterGutter} z-10 select-none group/cell ${
                              compact ? 'min-w-[150px]' : 'min-w-[160px]'
                            } ${
                              isPackageCopied
                                ? '!bg-emerald-50 dark:!bg-emerald-950'
                                : isCopied
                                ? '!bg-blue-50 dark:!bg-blue-950'
                                : isSelected
                                ? gridStickySelected
                                : ''
                            }`}
                          >
                            <div className="flex items-center">
                              {isPackageCopied ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px] font-semibold font-roboto bg-emerald-600 text-white shadow-2xs animate-in zoom-in-95 duration-150">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{strVal || '—'}</span>
                                  <span className="text-[10px] opacity-90 font-normal">Copied!</span>
                                </span>
                              ) : (
                                <div className="flex items-center justify-between gap-2 w-full">
                                  <span className="flex items-center gap-0.5 min-w-0">
                                    <span className="font-mono font-medium text-[12px] tracking-tight tabular-nums text-slate-900 dark:text-slate-100 truncate">
                                      {strVal || '—'}
                                    </span>
                                    {/* Copy icon on hover -> copy full package details */}
                                    {strVal && (
                                      <CellCopyButton
                                        copied={false}
                                        title="ចម្លងព័ត៌មានកញ្ចប់ទាំងអស់"
                                        onCopy={(e) => onCopyBarcodePackage(row, rowKey, e)}
                                      />
                                    )}
                                  </span>

                                  {/* Row actions grouped behind a "⋯" menu */}
                                  {cleanCode && cleanCode !== '#N/A' && cleanCode !== '—' && (() => {
                                    const distItem = distReportsByBarcode.get(cleanCode);
                                    const items: RowMenuItem[] = [
                                      {
                                        key: 'copy',
                                        icon: Copy,
                                        label: 'ចម្លងលេខ Barcode',
                                        onSelect: (e) => onCopyBarcodeOnly(strVal, cellId, e)
                                      },
                                      {
                                        key: 'timeline',
                                        icon: History,
                                        label: 'មើលដំណើរការ & ប្រវត្តិស្កេន',
                                        hint: summary?.totalScans ? `${summary.totalScans} ដង` : undefined,
                                        onSelect: () => onSelectTimeline(cleanCode, row)
                                      }
                                    ];
                                    if (distItem) {
                                      items.push({
                                        key: 'dist',
                                        icon: ClipboardCheck,
                                        label: 'មើល / កែរបាយការណ៍ចែកចាយ',
                                        hint: distItem.name || distItem.date,
                                        tone: 'emerald',
                                        onSelect: () => onOpenDistModal(cleanCode)
                                      });
                                    } else if (!isDelivered) {
                                      items.push({
                                        key: 'dist',
                                        icon: BellPlus,
                                        label: 'កត់ត្រារបាយការណ៍ចែកចាយ',
                                        onSelect: () => onOpenDistModal(cleanCode)
                                      });
                                    }

                                    return (
                                      <RowActionsMenu
                                        items={items}
                                        copied={isCopied}
                                        indicator={distItem ? 'emerald' : summary?.hasHistory ? 'indigo' : null}
                                        indicatorTitle={
                                          distItem
                                            ? `បានកត់ត្រាចែកចាយ៖ ${distItem.name || ''} (${distItem.date})`
                                            : summary?.hasHistory
                                            ? `មានប្រវត្តិស្កេនឃ្លាំង ${summary.totalScans || 0} ដង`
                                            : undefined
                                        }
                                      />
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      }

                      // Status Column Badge
                      if (isStatusCol && strVal.trim()) {
                        const upper = strVal.trim().toUpperCase();
                        const isDeliv = upper === 'DELIVERED';
                        return (
                          <td
                            key={col.id}
                            className={`${gridTd(compact)} group/cell ${
                              isCopied ? 'bg-emerald-50 dark:bg-emerald-950/60' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span
                                className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[11px] font-medium ${
                                  isDeliv
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30'
                                    : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isDeliv ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                {strVal}
                              </span>
                              <CellCopyButton copied={isCopied} onCopy={() => onCopyCell(cellId, val)} />
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.id}
                          className={`${gridTd(compact)} group/cell ${
                            isNumeric
                              ? 'font-mono tabular-nums text-slate-800 dark:text-slate-200'
                              : 'text-slate-700 dark:text-slate-300'
                          } ${isCopied ? 'bg-emerald-50 dark:bg-emerald-950/60' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            {strVal ? (
                              <span className="truncate max-w-xs">{strVal}</span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">—</span>
                            )}
                            {strVal && <CellCopyButton copied={isCopied} onCopy={() => onCopyCell(cellId, val)} />}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
