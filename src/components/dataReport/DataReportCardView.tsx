import React from 'react';
import {
  Search,
  Check,
  Copy,
  History,
  ClipboardCheck,
  Truck,
  ChevronDown,
  ChevronUp,
  User,
  Phone,
  MapPin,
  Calendar,
  Receipt,
  UserCheck
} from 'lucide-react';
import { SheetColumnDef, SheetRowData } from '../../utils/googleSheetFetcher';
import { BarcodeWarehouseSummary, PackageDetails } from './types';
import { DistributionReportItem } from '../../types';

interface DataReportCardViewProps {
  paginatedRows: SheetRowData[];
  currentPage: number;
  pageSize: number;
  visibleColumns: SheetColumnDef[];
  copiedCellId: string | null;
  copiedPackageRowId: string | null;
  onCopyBarcodeOnly: (barcode: string, cellId: string, e?: React.MouseEvent) => void;
  onCopyBarcodePackage: (row: SheetRowData, rowKey: string, e?: React.MouseEvent) => void;
  onSelectTimeline: (barcode: string, row: SheetRowData) => void;
  onOpenDistModal: (barcode: string) => void;
  getBarcodeWarehouseSummary: (barcode: string) => BarcodeWarehouseSummary | null;
  distReportsByBarcode: Map<string, DistributionReportItem>;
  isRowDelivered: (row: SheetRowData) => boolean;
  getRowPackageDetails: (row: SheetRowData) => PackageDetails;
  hideEmptyCardFields: boolean;
  expandedCardIds: Set<string>;
  onToggleCardExpansion: (id: string) => void;
}

export const DataReportCardView: React.FC<DataReportCardViewProps> = React.memo(({
  paginatedRows,
  currentPage,
  pageSize,
  visibleColumns,
  copiedCellId,
  copiedPackageRowId,
  onCopyBarcodeOnly,
  onCopyBarcodePackage,
  onSelectTimeline,
  onOpenDistModal,
  getBarcodeWarehouseSummary,
  distReportsByBarcode,
  isRowDelivered,
  getRowPackageDetails,
  hideEmptyCardFields,
  expandedCardIds,
  onToggleCardExpansion
}) => {
  if (paginatedRows.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center text-slate-400 border border-slate-200 dark:border-slate-800 shadow-2xs">
        <Search className="w-10 h-10 mx-auto mb-2.5 opacity-30 text-blue-500" />
        <p className="font-bold text-sm text-slate-700 dark:text-slate-300">
          មិនមានទិន្នន័យដែលត្រូវនឹងការស្វែងរកឡើយ
        </p>
        <p className="text-xs text-slate-400 mt-1">សូមសាកល្បងផ្លាស់ប្តូរពាក្យស្វែងរក ឬសម្អាត Filters</p>
      </div>
    );
  }

  const coreLabels = new Set([
    'BARCODE', 'STATUS', 'ស្ថានភាព', 'CONSIGNEE', 'អ្នកទទួល', 'PHONE', 'លេខទូរស័ព្ទ',
    'DESTINATION', 'DEST', 'ទិសដៅ', 'SHIPPER', 'អ្នកផ្ញើ', 'DESCRIPTION', 'DESC', 'ទំនិញ',
    'PAYMENT', 'ការទូទាត់', 'HANDLE BY', 'HANDLEBY', 'HANDLED BY', 'DATE', 'កាលបរិច្ឆេទ', 'ថ្ងៃខែ',
    'ORIGIN', 'ប្រភព'
  ]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
      {paginatedRows.map((row, idx) => {
        const rowNumber = (currentPage - 1) * pageSize + idx + 1;
        const rowKey = row._id || `row_${idx}`;
        const isPackageCopied = copiedPackageRowId === rowKey;
        const pkg = getRowPackageDetails(row);
        const cleanCode = pkg.barcode && pkg.barcode !== '—' ? pkg.barcode.trim().toUpperCase() : '';
        const summary = cleanCode ? getBarcodeWarehouseSummary(cleanCode) : null;
        const distItem = cleanCode ? distReportsByBarcode.get(cleanCode) : null;
        const isDelivered = isRowDelivered(row);
        const isExpanded = expandedCardIds.has(rowKey);

        const extraColumns = visibleColumns.filter((col) => {
          const colLabel = (col.label || col.id || '').trim().toUpperCase();
          if (coreLabels.has(colLabel)) return false;
          if (hideEmptyCardFields) {
            const val = row[col.id];
            if (val === undefined || val === null) return false;
            const s = String(val).trim();
            if (s === '' || s === '—' || s === '-' || s === '#N/A' || s === 'N/A') return false;
          }
          return true;
        });

        const displayExtraColumns = isExpanded ? extraColumns : [];

        return (
          <div
            key={rowKey}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-blue-400 dark:hover:border-blue-600 transition-all flex flex-col justify-between overflow-hidden group"
          >
            {/* 1. TOP HEADER: Index, Barcode, Warehouse Badges, Status */}
            <div className="p-2 pb-1.5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/40 flex items-center justify-between gap-1.5 flex-wrap">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                {/* Index Badge */}
                <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
                  #{rowNumber}
                </span>

                {/* Barcode with Quick Action */}
                {cleanCode ? (
                  <div className="flex items-center gap-1">
                    <span
                      onClick={() => onCopyBarcodePackage(row, rowKey)}
                      title="ចុចលើ BARCODE ដើម្បីចម្លងព័ត៌មានកញ្ចប់ទាំងអស់"
                      className="font-roboto text-[14px] font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition"
                    >
                      {cleanCode}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => onCopyBarcodeOnly(cleanCode, `${rowKey}_barcode`, e)}
                      title="ចុចដើម្បីចម្លងតែលេខ BARCODE ប៉ុណ្ណោះ"
                      className="p-0.5 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer"
                    >
                      {copiedCellId === `${rowKey}_barcode` ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3 text-slate-400" />
                      )}
                    </button>
                    {/* Timeline Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTimeline(cleanCode, row);
                      }}
                      title="🔍 ចុចមើលដំណើរការ និងប្រវត្តិស្កេនលម្អិត"
                      className="p-0.5 rounded text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition cursor-pointer"
                    >
                      <History className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </div>

              {/* Status Badge */}
              {pkg.status ? (
                <span
                  className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold shrink-0 ${
                    isDelivered
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                  }`}
                >
                  {pkg.status}
                </span>
              ) : null}
            </div>

            {/* 2. BODY SPECS: Ultra-compact, clean 2-column key-values */}
            <div className="p-2 space-y-1 text-xs">
              {/* Warehouse Scans Summary Pill if any */}
              {summary && summary.hasHistory && (
                <div className="flex items-center gap-1 flex-wrap pb-1 border-b border-slate-100 dark:border-slate-800/60">
                  {summary.outOfDelivery && (
                    <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200">
                      🛵 {summary.outOfDelivery.riderName || 'Rider'}
                    </span>
                  )}
                  {summary.holdRemaining && (
                    <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200">
                      ⏳ {summary.holdRemaining.holdReason || 'Hold'}
                    </span>
                  )}
                  {summary.scanIn && (
                    <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200">
                      📥 In
                    </span>
                  )}
                  {summary.scanOut && (
                    <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200">
                      📤 Out
                    </span>
                  )}
                </div>
              )}

              {/* Core Attributes */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                {pkg.consignee && (
                  <div className="col-span-2 flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-semibold truncate">
                    <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="truncate">{pkg.consignee}</span>
                    {pkg.phone && (
                      <span className="text-slate-500 font-normal font-mono text-[10.5px]">
                        ({pkg.phone})
                      </span>
                    )}
                  </div>
                )}

                {pkg.destination && (
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 truncate">
                    <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span className="truncate">{pkg.destination}</span>
                  </div>
                )}

                {pkg.shipper && (
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 truncate">
                    <span className="text-[10px] text-slate-400 font-semibold">Shipper:</span>
                    <span className="truncate">{pkg.shipper}</span>
                  </div>
                )}

                {pkg.handleBy && (
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 truncate">
                    <UserCheck className="w-3 h-3 text-indigo-500 shrink-0" />
                    <span className="truncate">{pkg.handleBy}</span>
                  </div>
                )}

                {pkg.date && (
                  <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 truncate">
                    <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">{pkg.date}</span>
                  </div>
                )}

                {pkg.teams && (
                  <div className="flex items-center gap-1 text-[10.5px] font-semibold text-indigo-600 dark:text-indigo-400">
                    <span>Team:</span>
                    <span>{pkg.teams}</span>
                  </div>
                )}

                {pkg.location && (
                  <div className="flex items-center gap-1 text-[10.5px] font-semibold text-amber-600 dark:text-amber-400 truncate">
                    <span>Loc:</span>
                    <span className="truncate">{pkg.location}</span>
                  </div>
                )}
              </div>

              {/* Extra Columns Details when expanded */}
              {displayExtraColumns.length > 0 && (
                <div className="pt-1.5 mt-1 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[10.5px]">
                  {displayExtraColumns.map((col) => {
                    const val = row[col.id];
                    if (val === undefined || val === null || String(val).trim() === '') return null;
                    return (
                      <div key={col.id} className="flex items-center justify-between gap-1 text-slate-600 dark:text-slate-400">
                        <span className="text-slate-400 truncate">{col.label || col.id}:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[150px]">
                          {String(val)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Expand Toggle if has extra columns */}
              {extraColumns.length > 0 && (
                <button
                  type="button"
                  onClick={() => onToggleCardExpansion(rowKey)}
                  className="w-full text-center py-0.5 text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-center gap-0.5 cursor-pointer"
                >
                  {isExpanded ? (
                    <>
                      <span>បង្រួម</span>
                      <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      <span>+ បង្ហាញបន្ថែម ({extraColumns.length})</span>
                      <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
              )}
            </div>

            {/* 3. CARD FOOTER: Action Buttons */}
            <div className="p-2 pt-1 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-950/20 flex items-center justify-between gap-1.5">
              {/* Copy Full Package Details Button */}
              <button
                type="button"
                onClick={(e) => onCopyBarcodePackage(row, rowKey, e)}
                className={`h-7 px-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                  isPackageCopied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                }`}
                title="ចម្លងព័ត៌មានកញ្ចប់ទាំងអស់"
              >
                {isPackageCopied ? (
                  <>
                    <Check className="w-3 h-3" />
                    <span className="text-[10px]">Copied!</span>
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px]">ចម្លងទាំងអស់</span>
                  </>
                )}
              </button>

              {/* Distribution Alert Modal Button */}
              {cleanCode && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDistModal(cleanCode);
                  }}
                  className={`h-7 px-2 rounded-lg text-[10.5px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                    distItem
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                  }`}
                  title={distItem ? 'បានកត់ត្រាចែកចាយរួច' : 'កត់ត្រារបាយការណ៍ចែកចាយ'}
                >
                  <Truck className="w-3 h-3" />
                  <span>{distItem ? 'បានចែកចាយ' : '+ Alert'}</span>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
