import React from 'react';
import {
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Check,
  Copy,
  History
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
}

const isBarcodeColumn = (col: SheetColumnDef) => (col.label || col.id || '').trim().toUpperCase() === 'BARCODE';

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
  isRowDelivered
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
    <div className="space-y-1.5">
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
        className={`${gridWrap} max-h-[70vh]`}
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
                      isBarcodeCol ? `${gridAfterGutter} z-30 ${compact ? 'min-w-[210px]' : 'min-w-[240px]'}` : ''
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
                    className={`${gridRow} ${
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
                            className={`${gridTd(compact)} ${gridSticky} ${gridAfterGutter} z-10 select-none ${
                              compact ? 'min-w-[210px]' : 'min-w-[240px]'
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
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isPackageCopied ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[13px] font-bold font-roboto bg-emerald-600 text-white shadow-2xs animate-in zoom-in-95 duration-150">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{strVal || '—'}</span>
                                  <span className="text-[10px] opacity-90 font-normal">Copied!</span>
                                </span>
                              ) : (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {/* 1. Click directly on BARCODE -> Copy full package details */}
                                  <span
                                    onClick={() => onCopyBarcodePackage(row, rowKey)}
                                    title="ចុចលើ BARCODE ដើម្បីចម្លងព័ត៌មានកញ្ចប់ទាំងអស់"
                                    className="font-mono font-semibold text-[13px] text-slate-900 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
                                  >
                                    {strVal || '—'}
                                  </span>

                                  {/* 2. Click on Copy icon -> Copy ONLY the BARCODE */}
                                  <button
                                    type="button"
                                    onClick={(e) => onCopyBarcodeOnly(strVal, cellId, e)}
                                    title="ចុចដើម្បីចម្លងតែលេខ BARCODE ប៉ុណ្ណោះ"
                                    className={`p-0.5 rounded transition cursor-pointer flex items-center justify-center ${
                                      isCopied
                                        ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60'
                                        : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    {isCopied ? (
                                      <Check className="w-3 h-3 text-emerald-600 animate-in zoom-in-75 duration-100" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>

                                  {/* 3. 🔍 Timeline Button */}
                                  {cleanCode && cleanCode !== '#N/A' && cleanCode !== '—' && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectTimeline(cleanCode, row);
                                      }}
                                      title={`🔍 ចុចមើលដំណើរការ និងប្រវត្តិស្កេនលម្អិត\nស្កេនឃ្លាំងសរុប៖ ${
                                        summary?.totalScans || 0
                                      } ដង`}
                                      className={`p-0.5 rounded transition cursor-pointer flex items-center justify-center ${
                                        summary?.hasHistory
                                          ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                                          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                      }`}
                                    >
                                      <History className="w-3 h-3" />
                                    </button>
                                  )}

                                  {/* 5. Distribution Alert */}
                                  {(() => {
                                    if (!cleanCode || cleanCode === '#N/A' || cleanCode === '—') return null;
                                    const distItem = distReportsByBarcode.get(cleanCode);

                                    if (distItem) {
                                      return (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenDistModal(cleanCode);
                                          }}
                                          title={`🚚 បានកត់ត្រាចែកចាយ៖ ${distItem.name || ''} (${distItem.date})\nចុចដើម្បីពិនិត្យ ឬកែប្រែ`}
                                          className="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 transition cursor-pointer shadow-2xs shrink-0 hover:scale-110 active:scale-95"
                                        >
                                          <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                                        </button>
                                      );
                                    }

                                    if (isDelivered) {
                                      return null;
                                    }

                                    return (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onOpenDistModal(cleanCode);
                                        }}
                                        title="កត់ត្រារបាយការណ៍ចែកចាយ (Barcode, Name, Date)"
                                        className="opacity-0 group-hover:opacity-100 transition-opacity px-1 py-0.5 rounded text-[9.5px] font-semibold text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 flex items-center gap-0.5 cursor-pointer shrink-0"
                                      >
                                        <span>+ Alert</span>
                                      </button>
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
                            onClick={() => onCopyCell(cellId, val)}
                            title="ចុចដើម្បីចម្លង (Copy)"
                            className={`${gridTd(compact)} cursor-pointer ${
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
                              {isCopied && <Check className="w-3 h-3 text-emerald-600 shrink-0" />}
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.id}
                          onClick={() => onCopyCell(cellId, val)}
                          title="ចុចដើម្បីចម្លង (Copy)"
                          className={`${gridTd(compact)} cursor-pointer ${
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
                            {isCopied && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
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
