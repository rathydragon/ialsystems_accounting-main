import React, { useState, useRef, useEffect } from 'react';
import {
  Settings2,
  ChevronDown,
  FileSpreadsheet,
  Code2,
  Database,
  Download,
  Trash2,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

interface WarehouseToolsDropdownProps {
  isSyncingSheets: boolean;
  onSyncGoogleSheets: () => void;
  onOpenCodeGsModal: () => void;
  isBackingUpPg: boolean;
  onBackupPostgres: () => void;
  onExportCSV: () => void;
  canExportCSV: boolean;
  canDelete: boolean;
  scansCount: number;
  isClearingAll: boolean;
  onOpenClearAllConfirm: () => void;
}

export const WarehouseToolsDropdown: React.FC<WarehouseToolsDropdownProps> = ({
  isSyncingSheets,
  onSyncGoogleSheets,
  onOpenCodeGsModal,
  isBackingUpPg,
  onBackupPostgres,
  onExportCSV,
  canExportCSV,
  canDelete,
  scansCount,
  isClearingAll,
  onOpenClearAllConfirm
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const isAnyActionBusy = isSyncingSheets || isBackingUpPg || isClearingAll;

  return (
    <div className="relative inline-block">
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`h-8 px-2.5 sm:px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs select-none ${
          isOpen
            ? 'border-cyan-400 dark:border-cyan-600 bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-200'
            : isAnyActionBusy
            ? 'border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
        }`}
        title="ឧបករណ៍បន្ថែម និងសមកាលកម្មទិន្នន័យ (Tools & Sync Menu)"
      >
        {isAnyActionBusy ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600 dark:text-amber-400" />
        ) : (
          <Settings2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
        )}
        <span className="font-bold">ឧបករណ៍ & Sync</span>
        <ChevronDown
          className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-cyan-600' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full mt-2 w-72 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-100 divide-y divide-slate-100 dark:divide-slate-800"
          style={{ transformOrigin: 'top right' }}
        >
          {/* Section 1: Cloud & Database Sync */}
          <div className="pb-1.5 space-y-1">
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              សមកាលកម្ម & ទិន្នន័យ (Data & Sync)
            </div>

            {/* 1. Sync Sheets */}
            <button
              type="button"
              disabled={isSyncingSheets}
              onClick={() => {
                onSyncGoogleSheets();
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-200 transition cursor-pointer disabled:opacity-50 group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-100/70 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  {isSyncingSheets ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold leading-tight group-hover:text-emerald-700 dark:group-hover:text-emerald-300">
                    Sync Google Sheets
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {isSyncingSheets ? 'កំពុងបញ្ជូនទិន្នន័យ...' : 'បញ្ជូនទិន្នន័យទៅ Sheets'}
                  </p>
                </div>
              </div>
              {isSyncingSheets && (
                <span className="text-[10px] font-bold font-mono text-emerald-600 animate-pulse">Syncing</span>
              )}
            </button>

            {/* 2. Code.gs */}
            <button
              type="button"
              onClick={() => {
                onOpenCodeGsModal();
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-amber-50/70 dark:hover:bg-amber-950/40 text-slate-700 dark:text-slate-200 transition cursor-pointer group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-100/70 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Code2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-xs font-bold leading-tight group-hover:text-amber-700 dark:group-hover:text-amber-300">
                    មើលកូដ Code.gs
                  </p>
                  <p className="text-[10px] text-slate-400">Apps Script Backend Service</p>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-500" />
            </button>

            {/* 3. Backup PG */}
            <button
              type="button"
              disabled={isBackingUpPg}
              onClick={() => {
                onBackupPostgres();
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 transition cursor-pointer disabled:opacity-50 group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-100/70 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  {isBackingUpPg ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Database className="w-3.5 h-3.5" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold leading-tight group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
                    Backup PostgreSQL
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {isBackingUpPg ? 'កំពុង Backup PG...' : 'បម្រុងទុកទិន្នន័យឃ្លាំង PG'}
                  </p>
                </div>
              </div>
              {isBackingUpPg && (
                <span className="text-[10px] font-bold font-mono text-indigo-600 animate-pulse">Running</span>
              )}
            </button>
          </div>

          {/* Section 2: Export & Data Actions */}
          <div className="pt-1.5 space-y-1">
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              នាំចេញ & គ្រប់គ្រង (Export & Actions)
            </div>

            {/* 4. Export CSV */}
            <button
              type="button"
              disabled={!canExportCSV}
              onClick={() => {
                onExportCSV();
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition cursor-pointer disabled:opacity-40 group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-teal-100/70 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Download className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-xs font-bold leading-tight group-hover:text-teal-700 dark:group-hover:text-teal-300">
                    ទាញយកជា CSV
                  </p>
                  <p className="text-[10px] text-slate-400">Export filtered warehouse data</p>
                </div>
              </div>
            </button>

            {/* 5. Clear All Warehouse Scans (Only if user has delete permission) */}
            {canDelete && scansCount > 0 && (
              <button
                type="button"
                disabled={isClearingAll}
                onClick={() => {
                  onOpenClearAllConfirm();
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-rose-50/70 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-300 transition cursor-pointer disabled:opacity-50 group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-rose-100/70 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    {isClearingAll ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold leading-tight">
                      សម្អាតទិន្នន័យឃ្លាំងទាំងអស់
                    </p>
                    <p className="text-[10px] text-rose-400/80">Clear All ({scansCount} records)</p>
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
