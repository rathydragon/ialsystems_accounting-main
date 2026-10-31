import React from 'react';
import { Calendar, Check, ChevronDown, Copy, Package, X } from 'lucide-react';
import { SheetColumnDef, SheetRowData } from '../../utils/googleSheetFetcher';

interface DataReportRowDetailModalProps {
  row: SheetRowData;
  rowNumber: number;
  rowKey: string;
  /** All sheet columns, including ones hidden from the table. */
  columns: SheetColumnDef[];
  copiedCellId: string | null;
  copiedPackageRowId: string | null;
  onCopyCell: (cellId: string, val: any) => void;
  onCopyPackage: (row: SheetRowData, rowKey: string, e?: React.MouseEvent) => void;
  onClose: () => void;
}

const isEmpty = (v: string) => !v || v === '-' || v === '—';
const labelOf = (c: SheetColumnDef) => c.label || c.id;
const keyOf = (c: SheetColumnDef) => labelOf(c).trim().toUpperCase();

// Columns shown in the header / party block instead of the tile grid.
const HEADER_KEYS = ['BARCODE', 'STATUS', 'DATE'];
const PARTY_KEYS = ['SHIPPER', 'CONSIGNEE'];

const statusTone = (s: string) => {
  const u = s.toUpperCase();
  if (u.includes('DELIVER')) return 'bg-emerald-500';
  if (u.includes('RETURN') || u.includes('FAIL') || u.includes('CANCEL')) return 'bg-rose-500';
  if (u.includes('PENDING') || u.includes('HOLD')) return 'bg-amber-500';
  return 'bg-slate-400';
};

/** Detail popup for one Data Report row: every column, each value click-to-copy. */
export const DataReportRowDetailModal: React.FC<DataReportRowDetailModalProps> = ({
  row,
  rowNumber,
  rowKey,
  columns,
  copiedCellId,
  copiedPackageRowId,
  onCopyCell,
  onCopyPackage,
  onClose
}) => {
  const [showEmpty, setShowEmpty] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const valOf = (c?: SheetColumnDef) => {
    if (!c) return '';
    const v = row[c.id];
    return v === undefined || v === null ? '' : String(v).trim();
  };
  const colBy = (k: string) => columns.find((c) => keyOf(c) === k);
  const cellIdOf = (c: SheetColumnDef) => `detail_${rowKey}_${c.id}`;
  const copy = (c?: SheetColumnDef) => c && !isEmpty(valOf(c)) && onCopyCell(cellIdOf(c), valOf(c));
  const isCopied = (c?: SheetColumnDef) => !!c && copiedCellId === cellIdOf(c);

  const barcodeCol = colBy('BARCODE');
  const statusCol = colBy('STATUS');
  const dateCol = colBy('DATE');
  const barcode = valOf(barcodeCol);
  const status = valOf(statusCol);
  const date = valOf(dateCol);

  // Shipper / Consignee first, then the rest in sheet order. Header fields are not repeated.
  const partyCols = PARTY_KEYS.map(colBy).filter((c): c is SheetColumnDef => !!c && !isEmpty(valOf(c)));
  const reserved = new Set([...HEADER_KEYS, ...PARTY_KEYS]);
  const listCols = [...partyCols, ...columns.filter((c) => !reserved.has(keyOf(c)) && !isEmpty(valOf(c)))];
  const emptyCols = columns.filter((c) => isEmpty(valOf(c)));
  const filledCount = columns.length - emptyCols.length;
  const packageCopied = copiedPackageRowId === rowKey;

  const CopyMark: React.FC<{ on: boolean; className?: string }> = ({ on, className = '' }) =>
    on ? (
      <Check className={`w-3.5 h-3.5 shrink-0 text-blue-700 dark:text-blue-400 ${className}`} />
    ) : (
      <Copy className={`w-3.5 h-3.5 shrink-0 text-slate-400 opacity-0 group-hover/f:opacity-100 transition ${className}`} />
    );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-5 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-slate-50 dark:bg-slate-950 rounded-t-2xl sm:rounded-2xl max-w-2xl w-full shadow-2xl shadow-black/30 ring-1 ring-black/5 dark:ring-white/10 max-h-[92vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: one line — barcode, status, date (each click-to-copy) */}
        <div className="shrink-0 px-3.5 py-2.5 bg-blue-900 border-t-4 border-red-600 text-white flex items-center gap-2">
          <div className="min-w-0 flex-1 flex items-center gap-x-2 gap-y-1 flex-wrap">
            <button
              type="button"
              onClick={() => copy(barcodeCol)}
              title="ចុចដើម្បី Copy Barcode"
              className="group/f flex items-center gap-1.5 min-w-0 text-left cursor-copy"
            >
              <span className="text-lg font-black font-mono tracking-tight truncate">{isEmpty(barcode) ? '—' : barcode}</span>
              {isCopied(barcodeCol) ? (
                <Check className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Copy className="w-3.5 h-3.5 shrink-0 opacity-50 group-hover/f:opacity-100 transition" />
              )}
            </button>
            {!isEmpty(status) && (
              <button
                type="button"
                onClick={() => copy(statusCol)}
                title="ចុចដើម្បី Copy"
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white text-slate-800 text-[10.5px] font-bold shadow-sm cursor-copy"
              >
                {isCopied(statusCol) ? (
                  <Check className="w-3 h-3 text-blue-800" />
                ) : (
                  <span className={`w-1.5 h-1.5 rounded-full ${statusTone(status)}`} />
                )}
                {status}
              </button>
            )}
            {!isEmpty(date) && (
              <button
                type="button"
                onClick={() => copy(dateCol)}
                title="ចុចដើម្បី Copy"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 ring-1 ring-white/25 text-[10.5px] font-semibold cursor-copy"
              >
                {isCopied(dateCol) ? <Check className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                {date}
              </button>
            )}
          </div>
          <span
            className="hidden sm:inline-flex items-center gap-1 shrink-0 text-[10.5px] font-semibold text-white/70"
            title={`${filledCount}/${columns.length} មានទិន្នន័យ`}
          >
            <Package className="w-3 h-3" />#{rowNumber}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full bg-white/10 hover:bg-white/25 ring-1 ring-white/20 transition cursor-pointer shrink-0"
            title="បិទ (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-1.5">
          {/* Filled fields: label left, value right; two columns on wider screens, long values full width */}
          {listCols.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200/80 dark:ring-slate-800 overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-flow-row-dense sm:gap-x-4 px-3 -mb-px">
                {listCols.map((c) => {
                  const v = valOf(c);
                  return (
                    <div
                      key={c.id}
                      onClick={() => copy(c)}
                      title="ចុចដើម្បី Copy"
                      className={`group/f flex items-start gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800 cursor-copy transition ${
                        v.length > 24 ? 'sm:col-span-2' : ''
                      } ${isCopied(c) ? 'text-blue-800' : ''}`}
                    >
                      <span className="w-[96px] shrink-0 pt-px text-[10.5px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 truncate">
                        {labelOf(c)}
                      </span>
                      <span
                        className={`min-w-0 flex-1 text-[12px] font-semibold break-words group-hover/f:text-red-600 dark:group-hover/f:text-red-400 ${
                          isCopied(c) ? 'text-blue-800 dark:text-blue-400' : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {v}
                      </span>
                      <CopyMark on={isCopied(c)} className="!w-3 !h-3 mt-0.5" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty fields, collapsed by default */}
          {emptyCols.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowEmpty((s) => !s)}
                className="inline-flex items-center gap-1 px-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition ${showEmpty ? 'rotate-180' : ''}`} />
                គ្មានទិន្នន័យ ({emptyCols.length})
              </button>
              {showEmpty && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {emptyCols.map((c) => (
                    <span
                      key={c.id}
                      className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/70 text-[10.5px] text-slate-400 dark:text-slate-500"
                    >
                      {labelOf(c)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800">
          <span className="hidden sm:inline text-[10.5px] text-slate-400">ចុចលើ Field ណាមួយដើម្បី Copy • Esc បិទ</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={(e) => onCopyPackage(row, rowKey, e)}
              className={`h-7 px-3 rounded-full ring-1 text-xs font-bold cursor-pointer transition inline-flex items-center gap-1 ${
                packageCopied
                  ? 'ring-blue-300 bg-blue-50 text-blue-800 dark:ring-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                  : 'ring-slate-200 dark:ring-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="ចម្លងព័ត៌មានកញ្ចប់ទាំងអស់"
            >
              {packageCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{packageCopied ? 'បានចម្លង!' : 'Copy កញ្ចប់'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-7 px-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm cursor-pointer transition active:scale-95"
            >
              បិទ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
