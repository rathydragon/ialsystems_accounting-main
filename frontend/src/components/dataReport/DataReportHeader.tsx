import React from 'react';
import {
  BarChart3,
  Truck,
  Settings,
  FileSpreadsheet,
  ExternalLink,
  Zap,
  Check,
  Download,
  Database,
  HelpCircle,
  CheckCircle2,
  Save,
  AlertCircle
} from 'lucide-react';
import { ParsedSheetInfo } from '../../utils/googleSheetFetcher';
import { CountdownStore, CountdownText } from '../SyncCountdown';

interface DataReportHeaderProps {
  distReportsCount: number;
  onOpenDistModal: () => void;
  isConfigOpen: boolean;
  onToggleConfig: () => void;
  sheetUrl: string;
  directSheetUrl: string;
  parsedSheet: ParsedSheetInfo;
  isAutoSyncEnabled: boolean;
  isSyncingInBackground: boolean;
  countdownStore: CountdownStore;
  syncInterval: number;
  isAutoSyncMenuOpen: boolean;
  onToggleAutoSyncMenu: () => void;
  onToggleAutoSyncEnabled: (enabled: boolean) => void;
  onChangeSyncInterval: (interval: number) => void;
  isLoading: boolean;
  onRefresh: () => void;
  onExportCSV: () => void;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  // Config Drawer
  tempSheetUrl: string;
  setTempSheetUrl: (v: string) => void;
  tempSheetName: string;
  setTempSheetName: (v: string) => void;
  showHelpGuide: boolean;
  setShowHelpGuide: (v: boolean) => void;
  onSaveConfig: () => void;
  fetchError: string | null;
  hasRows: boolean;
  lastSyncedTime?: string;
  /** Rendered inside the header row between the title and the actions (e.g. embedded KPI chips) */
  kpiSlot?: React.ReactNode;
  /** Page title (default "Data Report") and where the data comes from, shown on hover */
  title?: string;
  sourceLabel?: string;
}

export const DataReportHeader: React.FC<DataReportHeaderProps> = ({
  distReportsCount,
  onOpenDistModal,
  isConfigOpen,
  onToggleConfig,
  sheetUrl,
  directSheetUrl,
  parsedSheet,
  isAutoSyncEnabled,
  isSyncingInBackground,
  countdownStore,
  syncInterval,
  isAutoSyncMenuOpen,
  onToggleAutoSyncMenu,
  onToggleAutoSyncEnabled,
  onChangeSyncInterval,
  onRefresh,
  onExportCSV,
  tempSheetUrl,
  setTempSheetUrl,
  tempSheetName,
  setTempSheetName,
  showHelpGuide,
  setShowHelpGuide,
  onSaveConfig,
  fetchError,
  hasRows,
  lastSyncedTime,
  kpiSlot,
  title = 'Data Report',
  sourceLabel = 'Google Sheets Live'
}) => {
  return (
    <div className="space-y-2">
      {/* 📊 1. HEADER & ACTION CONTROLS (+ embedded KPI chips on wide screens) */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
        {/* Left: Branding & Status (sync details on hover) */}
        <div
          className="order-1 flex items-center gap-2 shrink-0 min-w-0"
          title={`${title} (របាយការណ៍ទិន្នន័យ) • ${sourceLabel}${lastSyncedTime ? ` • Sync: ${lastSyncedTime}` : ''}`}
        >
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold shrink-0">
            <BarChart3 className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-sm font-black text-slate-900 dark:text-white tracking-tight whitespace-nowrap">
            {title}
          </h2>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        </div>

        {kpiSlot}

        {/* Right: Quick Action Buttons */}
        <div className="order-3 ml-auto flex items-center gap-1 sm:gap-1.5 shrink-0 justify-end">
          {/* 🚚 Distribution Alert Form Button */}
          <button
            id="btn-distribution-alert"
            type="button"
            onClick={onOpenDistModal}
            className="h-7.5 px-2 sm:px-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0 active:scale-[0.98]"
            title="Alert form សម្រាប់បញ្ចូលរបាយការណ៍ចែកចាយ (Barcode, Name, Date)"
          >
            <Truck className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden 2xl:inline">របាយការណ៍ចែកចាយ</span>
            <span className="hidden sm:inline 2xl:hidden">ចែកចាយ</span>
            {distReportsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/25 text-white font-mono font-bold">
                {distReportsCount}
              </span>
            )}
          </button>

          {/* Auto-Sync Dropdown Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={onToggleAutoSyncMenu}
              className={`h-7.5 px-2 sm:px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs shrink-0 ${
                isAutoSyncEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
              title="កំណត់ Auto-Sync ស្វ័យប្រវត្តិ"
            >
              <Zap className={`w-3.5 h-3.5 shrink-0 ${isAutoSyncEnabled ? 'text-amber-500' : 'text-slate-400'}`} />
              <span className="hidden sm:inline font-mono text-[11px] whitespace-nowrap">
                {isSyncingInBackground ? 'Syncing...' : isAutoSyncEnabled ? <CountdownText store={countdownStore} suffix="s" /> : 'Off'}
              </span>
            </button>

            {/* Auto-Sync Menu Popup */}
            {isAutoSyncMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 p-2 text-xs space-y-1 animate-in fade-in zoom-in-95 duration-100">
                <div className="font-bold text-[11px] text-slate-700 dark:text-slate-200 px-2 py-1 border-b border-slate-100 dark:border-slate-800">
                  កំណត់ Real-time Auto-Sync
                </div>
                <button
                  type="button"
                  onClick={() => onToggleAutoSyncEnabled(!isAutoSyncEnabled)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between font-medium cursor-pointer transition ${
                    isAutoSyncEnabled
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span>ស្ថានភាព (Status)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border bg-white dark:bg-slate-800">
                    {isAutoSyncEnabled ? 'បើក (ON)' : 'បិទ (OFF)'}
                  </span>
                </button>

                {isAutoSyncEnabled && (
                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 px-2 py-0.5 uppercase tracking-wider font-semibold">
                      រយៈពេល Sync:
                    </div>
                    {[10, 15, 30, 60].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => onChangeSyncInterval(sec)}
                        className={`w-full text-left px-2.5 py-1 rounded-md flex items-center justify-between text-xs cursor-pointer ${
                          syncInterval === sec
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <span>{sec} វិនាទី</span>
                        {syncInterval === sec && <Check className="w-3 h-3 text-blue-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CSV Export */}
          <button
            type="button"
            onClick={onExportCSV}
            disabled={!hasRows}
            className="h-7.5 px-2 sm:px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 transition shadow-2xs disabled:opacity-50 cursor-pointer shrink-0"
            title="ទាញយកជាឯកសារ Excel/CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          {/* Settings (Google Sheets link config) */}
          <button
            id="btn-edit-sheet-url"
            type="button"
            onClick={onToggleConfig}
            className={`h-7.5 px-2 rounded-lg border text-xs font-semibold flex items-center gap-1 transition cursor-pointer shadow-2xs shrink-0 ${
              isConfigOpen
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
            }`}
            title="Settings (ការកំណត់ Google Sheets)"
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      </div>

      {/* ⚙️ GOOGLE SHEETS LINK CONFIGURATION DRAWER */}
      {isConfigOpen && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3.5 sm:p-4 border border-blue-200 dark:border-blue-900/60 shadow-xs space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <Database className="w-4 h-4 text-blue-600" />
              <span>កំណត់ Link Google Sheets សម្រាប់ទាញយកទិន្នន័យ (Data Report Link)</span>
            </div>
            <div className="flex items-center gap-3">
              {sheetUrl && (
                <a
                  href={directSheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium"
                  title="បើកមើលលើ Google Sheets ផ្ទាល់"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>បើក Sheets</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              )}
              <button
                type="button"
                onClick={() => setShowHelpGuide(!showHelpGuide)}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>របៀប Share Google Sheets?</span>
              </button>
            </div>
          </div>

          {/* Help Guide Box */}
          {showHelpGuide && (
            <div className="p-3 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl text-xs text-blue-950 dark:text-blue-200 space-y-1.5 animate-in fade-in">
              <div className="font-bold flex items-center gap-1.5 text-blue-900 dark:text-blue-300 text-[11.5px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                <span>ការណែនាំ Share សិទ្ធិ Google Sheet ឲ្យដំណើរការលើគ្រប់កន្លែង (និង Vercel):</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 pl-1 text-[11px] text-slate-700 dark:text-slate-300">
                <li>បើក Google Sheet &gt; ចុច <strong>Share</strong> (នៅខាងលើស្តាំ)</li>
                <li>
                  នៅក្រោម General access ប្តូរទៅជា <strong>"Anyone with the link"</strong> &gt; <strong>Viewer</strong>
                </li>
                <li>
                  ចុច <strong>Copy link</strong> រួច Paste ក្នុងប្រអប់ខាងក្រោម ហើយចុច <strong>"រក្សាទុក & ទាញយកទិន្នន័យ"</strong>
                </li>
              </ol>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-end">
            <div className="lg:col-span-8 space-y-1">
              <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Google Spreadsheet Link ឬ ID *</span>
                {sheetUrl && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-normal normal-case">
                    ID: {parsedSheet.spreadsheetId || 'None'}
                  </span>
                )}
              </label>
              <input
                type="text"
                value={tempSheetUrl}
                onChange={(e) => setTempSheetUrl(e.target.value)}
                placeholder="ឧ. https://docs.google.com/spreadsheets/d/1BxiMVs0XR.../edit#gid=0"
                className="w-full h-8.5 px-3 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="lg:col-span-4 space-y-1">
              <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                <span>Sheet Tab Name (ស្រេចចិត្ត)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tempSheetName}
                  onChange={(e) => setTempSheetName(e.target.value)}
                  placeholder="ឧ. Sheet1 ឬ Data"
                  className="flex-1 h-8.5 px-3 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={onSaveConfig}
                  className="h-8.5 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer shrink-0 active:scale-98"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>រក្សាទុក</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fetch Error Alert */}
      {fetchError && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer shrink-0"
          >
            ព្យាយាមម្តងទៀត
          </button>
        </div>
      )}
    </div>
  );
};
