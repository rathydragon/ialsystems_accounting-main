import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Users,
  MapPin
} from 'lucide-react';
import { ViewMode } from './types';

interface DataReportBottomBarProps {
  isFullScreen: boolean;
  viewMode: ViewMode;
  hasHorizontalOverflow: boolean;
  footerScrollRef: React.RefObject<HTMLDivElement | null>;
  onFooterScroll: () => void;
  tableScrollWidth: number;
  onScrollTableLeft: () => void;
  onScrollTableRight: () => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  sortedRowsLength: number;
  totalRowsLength: number;
  teamCounts: {
    ialFiltered: number;
    delFiltered: number;
  };
  locationCounts: {
    outOfTownFiltered: number;
    cityTownFiltered: number;
  };
}

export const DataReportBottomBar: React.FC<DataReportBottomBarProps> = ({
  isFullScreen,
  viewMode,
  hasHorizontalOverflow,
  footerScrollRef,
  onFooterScroll,
  tableScrollWidth,
  onScrollTableLeft,
  onScrollTableRight,
  pageSize,
  onPageSizeChange,
  currentPage,
  totalPages,
  onPageChange,
  sortedRowsLength,
  totalRowsLength,
  teamCounts,
  locationCounts
}) => {
  return (
    <div
      className={`sticky ${
        isFullScreen ? 'bottom-2 sm:bottom-3' : 'bottom-[4.25rem] lg:bottom-3'
      } z-30 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-2 sm:p-2.5 transition-all mt-2.5`}
    >
      {/* Synced Horizontal Scrollbar with Quick Nav Buttons */}
      {hasHorizontalOverflow && viewMode === 'table' && (
        <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={onScrollTableLeft}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
            title="Scroll ទៅឆ្វេង (Scroll Left)"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div
            ref={footerScrollRef}
            onScroll={onFooterScroll}
            className="flex-1 overflow-x-auto overflow-y-hidden h-2.5 sm:h-3 custom-scrollbar bg-slate-100/90 dark:bg-slate-800/70 rounded-full border border-slate-200/70 dark:border-slate-700/70 cursor-ew-resize hover:bg-slate-200/70 dark:hover:bg-slate-700/60 transition"
            title="អូស Scroll ឆ្វេង-ស្តាំ ដើម្បីរំកិលតារាង"
          >
            <div style={{ width: `${tableScrollWidth}px`, height: '1px' }} />
          </div>

          <button
            type="button"
            onClick={onScrollTableRight}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
            title="Scroll ទៅស្តាំ (Scroll Right)"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* MOBILE VIEW (< sm) */}
      <div className="flex sm:hidden items-center justify-between gap-2 text-xs">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="px-2 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
        >
          <option value={0}>ពេញអេក្រង់</option>
          <option value={15}>15 ជួរ</option>
          <option value={25}>25 ជួរ</option>
          <option value={50}>50 ជួរ</option>
          <option value={100}>100 ជួរ</option>
          <option value={200}>200 ជួរ</option>
          <option value={999999}>ទាំងអស់</option>
        </select>

        <div className="flex items-center gap-1.5 font-medium">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            title="ទំព័រមុន"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-[11px] text-slate-600 dark:text-slate-300 px-1 font-semibold whitespace-nowrap">
            ទំព័រ <strong className="text-blue-600 dark:text-blue-400 font-bold">{currentPage}</strong> / {totalPages || 1}
          </span>

          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            title="ទំព័របន្ទាប់"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-mono font-bold text-[11px] border border-blue-200/50 dark:border-blue-800/50">
          {sortedRowsLength} ជួរ
        </div>
      </div>

      {/* TABLET & DESKTOP VIEW (>= sm) */}
      <div className="hidden sm:flex flex-col lg:flex-row items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start w-full lg:w-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200/60 dark:border-slate-800">
            <span className="font-mono text-blue-600 dark:text-blue-400 font-black">Σ</span>
            <span>សរុប:</span>
            <span className="font-mono text-slate-900 dark:text-white">
              {sortedRowsLength.toLocaleString('en-US')}
            </span>
            <span className="text-[10px] text-slate-400 font-normal">ជួរ</span>
            {sortedRowsLength !== totalRowsLength && (
              <span className="text-[9.5px] text-amber-600 dark:text-amber-400 font-normal">
                (ពី {totalRowsLength.toLocaleString('en-US')})
              </span>
            )}
          </div>

          {/* Summary Badges: Teams (IAL / DEL) & Location (Out Of Town / City Town) */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-bold border border-blue-200/60 dark:border-blue-800/60">
            <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-[11px] text-blue-600/80 dark:text-blue-400/80 font-medium">Teams:</span>
            <span className="font-mono font-bold">IAL {teamCounts.ialFiltered.toLocaleString()}</span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="font-mono font-bold">DEL {teamCounts.delFiltered.toLocaleString()}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200/60 dark:border-emerald-800/60">
            <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 font-medium">Location:</span>
            <span className="font-mono font-bold">OOT {locationCounts.outOfTownFiltered.toLocaleString()}</span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="font-mono font-bold">City {locationCounts.cityTownFiltered.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap justify-center sm:justify-end w-full lg:w-auto text-xs">
          <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
            <span className="text-[10.5px] font-medium hidden sm:inline">បង្ហាញ:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="px-2 py-1 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value={0}>ពេញអេក្រង់ (Auto)</option>
              <option value={15}>15 ជួរ</option>
              <option value={25}>25 ជួរ</option>
              <option value={50}>50 ជួរ</option>
              <option value={100}>100 ជួរ</option>
              <option value={200}>200 ជួរ</option>
              <option value={999999}>ទាំងអស់</option>
            </select>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap mr-1">
                ទំព័រ <strong className="text-slate-900 dark:text-white">{currentPage}</strong> នៃ {totalPages}
              </span>

              <button
                type="button"
                onClick={() => onPageChange(1)}
                disabled={currentPage === 1}
                className="hidden sm:inline-block px-2 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                ដំបូង
              </button>

              <button
                type="button"
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                title="ទំព័រមុន"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = currentPage;
                if (currentPage <= 3) pageNum = i + 1;
                else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = currentPage - 2 + i;

                if (pageNum < 1 || pageNum > totalPages) return null;

                const isActive = pageNum === currentPage;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => onPageChange(pageNum)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                title="ទំព័របន្ទាប់"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onPageChange(totalPages)}
                disabled={currentPage === totalPages}
                className="hidden sm:inline-block px-2 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                ចុងក្រោយ
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
