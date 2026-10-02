import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  BarChart3,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Download,
  ExternalLink,
  Settings,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Maximize2,
  Minimize2,
  Table2,
  LayoutGrid,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Zap,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  ClipboardCheck,
  HelpCircle,
  Save,
  Filter,
  Layers,
  Database,
  Users,
  MapPin,
  SlidersHorizontal,
  Calendar,
  RotateCcw,
  Truck
} from 'lucide-react';
import { AuthUser, AppSettings, DistributionReportItem, UserPermission } from '../types';
import { SheetColumnDef, SheetRowData, parseGoogleSheetInput } from '../utils/googleSheetFetcher';
import {
  getInitialDataReportConfig,
  saveDataReportConfig,
  subscribeToDataReportConfig,
  getCachedDataReport,
  fetchLiveDataReport
} from '../services/dataReportService';
import {
  getInitialDistributionReports,
  saveDistributionReport,
  deleteDistributionReport,
  subscribeToDistributionReports
} from '../services/distributionReportService';
import { DistributionReportModal } from './DistributionReportModal';


interface DataReportPageProps {
  currentUser: AuthUser | null;
  permissions?: UserPermission[];
  settings?: AppSettings;
  onUpdateSettings?: (newSettings: Partial<AppSettings>) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const STORAGE_KEY_AUTO_SYNC = 'accounting_data_report_auto_sync_enabled';
const STORAGE_KEY_SYNC_INTERVAL = 'accounting_data_report_sync_interval';

// Reusable Searchable Dropdown for Column Filters
interface SearchableFilterDropdownProps {
  label: string;
  allLabel?: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
}

const SearchableFilterDropdown: React.FC<SearchableFilterDropdownProps> = ({
  label,
  allLabel,
  value,
  onChange,
  options
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Click outside listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      setTimeout(() => searchInputRef.current?.focus(), 60);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Filtered list based on search query
  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase().trim();
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, query]);

  const isSelected = value !== 'ALL';

  return (
    <div className="relative space-y-1" ref={dropdownRef}>
      <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
        <span className="flex items-center gap-1 truncate">
          <span>{label} ({options.length})</span>
          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
        </span>
        {isSelected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('ALL');
            }}
            className="text-xs text-rose-500 hover:text-rose-700 cursor-pointer font-bold hover:underline"
            title="លុបការចម្រាញ់"
          >
            Clear
          </button>
        )}
      </div>

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setQuery('');
        }}
        className={`w-full h-9 px-3 rounded-lg text-xs border flex items-center justify-between gap-1.5 transition cursor-pointer text-left truncate ${
          isSelected
            ? 'bg-blue-50/80 border-blue-400 dark:bg-blue-950/60 dark:border-blue-600 text-blue-700 dark:text-blue-300 font-bold shadow-2xs'
            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
        }`}
      >
        <span className="truncate">
          {isSelected ? value : allLabel || `គ្រប់ ${label} (All)`}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-blue-500' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 max-w-[90vw] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Box */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={`ស្វែងរក ${label}...`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-8 pr-7 h-7 rounded-md text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto custom-scrollbar p-1 text-xs">
            {/* 'ALL' option */}
            <button
              type="button"
              onClick={() => {
                onChange('ALL');
                setIsOpen(false);
              }}
              className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition cursor-pointer mb-0.5 ${
                value === 'ALL'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>{allLabel || `គ្រប់ ${label} (All)`}</span>
              {value === 'ALL' && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
            </button>

            {/* Filtered Options */}
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-slate-400 text-xs">
                មិនមាន "{query}" ឡើយ
              </div>
            ) : (
              filteredOptions.slice(0, 150).map((opt) => {
                const isItemActive = value === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition cursor-pointer truncate ${
                      isItemActive
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate">{opt}</span>
                    {isItemActive && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                  </button>
                );
              })
            )}

            {filteredOptions.length > 150 && (
              <div className="px-2.5 py-1 text-[10px] text-slate-400 text-center border-t border-slate-100 dark:border-slate-800 mt-1">
                បង្ហាញ 150 នៃ {filteredOptions.length} (សូមវាយអក្សរដើម្បីស្វែងរកបន្ថែម)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const DataReportPage: React.FC<DataReportPageProps> = ({
  currentUser,
  permissions,
  settings,
  onUpdateSettings,
  onShowToast
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';

  // 1. Sheet Config State
  const initialConfig = useMemo(() => getInitialDataReportConfig(), []);
  const [sheetUrl, setSheetUrl] = useState<string>(() => {
    return (settings?.dataReportSheetUrl && settings.dataReportSheetUrl.trim())
      ? settings.dataReportSheetUrl.trim()
      : initialConfig.sheetUrl;
  });
  const [sheetName, setSheetName] = useState<string>(() => {
    return (settings?.dataReportSheetName && settings.dataReportSheetName.trim())
      ? settings.dataReportSheetName.trim()
      : (initialConfig.sheetName || '');
  });

  const [tempSheetUrl, setTempSheetUrl] = useState<string>(sheetUrl);
  const [tempSheetName, setTempSheetName] = useState<string>(sheetName);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(!sheetUrl);
  const [showHelpGuide, setShowHelpGuide] = useState<boolean>(false);

  // 2. Data State
  const cached = useMemo(() => getCachedDataReport(), []);
  const [columns, setColumns] = useState<SheetColumnDef[]>(cached.columns);
  const [rows, setRows] = useState<SheetRowData[]>(cached.rows);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncingInBackground, setIsSyncingInBackground] = useState<boolean>(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string>('');
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 3. UI State
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedColumnFilter, setSelectedColumnFilter] = useState<string>('ALL');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [copiedCellId, setCopiedCellId] = useState<string | null>(null);
  const [copiedPackageRowId, setCopiedPackageRowId] = useState<string | null>(null);

  // 4. Auto-Sync State
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY_AUTO_SYNC) === 'true';
  });
  const [syncInterval, setSyncInterval] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SYNC_INTERVAL);
    return saved ? parseInt(saved, 10) : 30;
  });
  const [countdown, setCountdown] = useState<number>(syncInterval);
  const [isAutoSyncMenuOpen, setIsAutoSyncMenuOpen] = useState<boolean>(false);

  // 5. Distribution Reports State (របាយការណ៍ចែកចាយ)
  const [isDistModalOpen, setIsDistModalOpen] = useState<boolean>(false);
  const [distReports, setDistReports] = useState<DistributionReportItem[]>(() => getInitialDistributionReports());
  const [distPrefilledBarcode, setDistPrefilledBarcode] = useState<string>('');

  // Subscribe to real-time Firestore distribution reports
  useEffect(() => {
    const unsubscribe = subscribeToDistributionReports((items) => {
      setDistReports(items);
    });
    return () => unsubscribe();
  }, []);

  // Quick lookup map: barcode -> DistributionReportItem
  const distReportsByBarcode = useMemo(() => {
    const map = new Map<string, DistributionReportItem>();
    for (const r of distReports) {
      if (r.barcode) {
        map.set(r.barcode.toUpperCase().trim(), r);
      }
    }
    return map;
  }, [distReports]);

  const handleOpenDistModal = useCallback((code?: string) => {
    setDistPrefilledBarcode(code ? code.trim() : '');
    setIsDistModalOpen(true);
  }, []);

  const handleSaveDistReport = useCallback(
    async (item: Omit<DistributionReportItem, 'id' | 'createdAt'> & { id?: string }) => {
      const saved = await saveDistributionReport({
        ...item,
        createdBy: currentUser?.name || currentUser?.email || 'User',
        operatorEmail: currentUser?.email || ''
      });
      setDistReports((prev) => {
        const idx = prev.findIndex((p) => p.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [saved, ...prev];
      });
    },
    [currentUser]
  );

  const handleDeleteDistReport = useCallback(async (id: string) => {
    await deleteDistributionReport(id);
    setDistReports((prev) => prev.filter((p) => p.id !== id));
  }, []);


  // Synced Horizontal Scrollbar Refs & State (Fixed Footer like FollowUp BM Page)
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const footerScrollRef = useRef<HTMLDivElement>(null);
  const activeScrollSource = useRef<'table' | 'footer' | null>(null);
  const scrollResetTimer = useRef<number | null>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState<number>(0);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState<boolean>(false);

  const updateScrollDimensions = useCallback(() => {
    if (tableContainerRef.current) {
      const { scrollWidth, clientWidth } = tableContainerRef.current;
      setTableScrollWidth((prev) => (Math.abs(prev - scrollWidth) > 2 ? scrollWidth : prev));
      setHasHorizontalOverflow((prev) => {
        const next = scrollWidth > clientWidth + 4;
        return prev !== next ? next : prev;
      });
    }
  }, []);

  useEffect(() => {
    updateScrollDimensions();
    const el = tableContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      updateScrollDimensions();
    });
    observer.observe(el);

    window.addEventListener('resize', updateScrollDimensions);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScrollDimensions);
    };
  }, [updateScrollDimensions, columns, rows, viewMode, pageSize, currentPage]);

  const handleTableScroll = useCallback(() => {
    if (activeScrollSource.current === 'footer') return;
    activeScrollSource.current = 'table';

    if (tableContainerRef.current && footerScrollRef.current) {
      const tableEl = tableContainerRef.current;
      const footerEl = footerScrollRef.current;

      const maxTableScroll = tableEl.scrollWidth - tableEl.clientWidth;
      const maxFooterScroll = footerEl.scrollWidth - footerEl.clientWidth;

      if (maxTableScroll > 0 && maxFooterScroll > 0) {
        const ratio = tableEl.scrollLeft / maxTableScroll;
        const target = Math.round(ratio * maxFooterScroll);
        if (Math.abs(footerEl.scrollLeft - target) > 1) {
          footerEl.scrollLeft = target;
        }
      }
    }

    if (scrollResetTimer.current) window.clearTimeout(scrollResetTimer.current);
    scrollResetTimer.current = window.setTimeout(() => {
      activeScrollSource.current = null;
    }, 100);
  }, []);

  const handleFooterScroll = useCallback(() => {
    if (activeScrollSource.current === 'table') return;
    activeScrollSource.current = 'footer';

    if (tableContainerRef.current && footerScrollRef.current) {
      const tableEl = tableContainerRef.current;
      const footerEl = footerScrollRef.current;

      const maxTableScroll = tableEl.scrollWidth - tableEl.clientWidth;
      const maxFooterScroll = footerEl.scrollWidth - footerEl.clientWidth;

      if (maxTableScroll > 0 && maxFooterScroll > 0) {
        const ratio = footerEl.scrollLeft / maxFooterScroll;
        const target = Math.round(ratio * maxTableScroll);
        if (Math.abs(tableEl.scrollLeft - target) > 1) {
          tableEl.scrollLeft = target;
        }
      }
    }

    if (scrollResetTimer.current) window.clearTimeout(scrollResetTimer.current);
    scrollResetTimer.current = window.setTimeout(() => {
      activeScrollSource.current = null;
    }, 100);
  }, []);

  const scrollTableLeft = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({ left: -250, behavior: 'smooth' });
    }
  };

  const scrollTableRight = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({ left: 250, behavior: 'smooth' });
    }
  };

  // Toast Notification Helper
  const notify = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (onShowToast) {
      onShowToast(msg, type);
    }
  }, [onShowToast]);

  // Sync with Firestore Config
  useEffect(() => {
    const unsubscribe = subscribeToDataReportConfig((updated) => {
      if (updated.sheetUrl && updated.sheetUrl !== sheetUrl) {
        setSheetUrl(updated.sheetUrl);
        setTempSheetUrl(updated.sheetUrl);
        if (updated.sheetName !== undefined) {
          setSheetName(updated.sheetName);
          setTempSheetName(updated.sheetName);
        }
      }
    });
    return () => unsubscribe();
  }, [sheetUrl]);

  // Sync with settings prop
  useEffect(() => {
    if (settings?.dataReportSheetUrl && settings.dataReportSheetUrl.trim()) {
      const u = settings.dataReportSheetUrl.trim();
      setSheetUrl(u);
      setTempSheetUrl(u);
    }
    if (settings?.dataReportSheetName && settings.dataReportSheetName.trim()) {
      const n = settings.dataReportSheetName.trim();
      setSheetName(n);
      setTempSheetName(n);
    }
  }, [settings?.dataReportSheetUrl, settings?.dataReportSheetName]);

  // Fetch Data Function
  const loadData = useCallback(async (isBackground = false) => {
    if (!sheetUrl.trim()) return;

    if (isBackground) {
      setIsSyncingInBackground(true);
    } else {
      setIsLoading(true);
    }
    setFetchError(null);

    try {
      const result = await fetchLiveDataReport(sheetUrl, sheetName);
      if (result.success) {
        setColumns(result.columns);
        setRows(result.rows);
        setLastSyncedTime(new Date().toLocaleTimeString('km-KH'));
        if (!isBackground) {
          notify(`✓ បានទាញយកទិន្នន័យ Data Report ជោគជ័យ (${result.rows.length} ជួរដេក)`, 'success');
        }
      } else {
        const errMsg = result.error || 'មិនអាចទាញយកទិន្នន័យពី Google Sheets បានឡើយ';
        setFetchError(errMsg);
        if (!isBackground) {
          notify(`កំហុស៖ ${errMsg}`, 'error');
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Error fetching data';
      setFetchError(errMsg);
      if (!isBackground) {
        notify(`កំហុស៖ ${errMsg}`, 'error');
      }
    } finally {
      setIsLoading(false);
      setIsSyncingInBackground(false);
    }
  }, [sheetUrl, sheetName, notify]);

  // Initial Fetch on Mount or URL change
  useEffect(() => {
    if (sheetUrl.trim()) {
      loadData(false);
    }
  }, [sheetUrl, sheetName]);

  // Auto-Sync Timer
  useEffect(() => {
    if (!isAutoSyncEnabled || !sheetUrl.trim()) return;

    setCountdown(syncInterval);
    const intervalTimer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          loadData(true);
          return syncInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalTimer);
  }, [isAutoSyncEnabled, syncInterval, sheetUrl, sheetName, loadData]);

  // Save new Sheet Config
  const handleSaveConfig = async () => {
    const trimmedUrl = tempSheetUrl.trim();
    const trimmedName = tempSheetName.trim();

    if (!trimmedUrl) {
      notify('សូមបញ្ចូល Link Google Sheets!', 'error');
      return;
    }

    setSheetUrl(trimmedUrl);
    setSheetName(trimmedName);
    setIsConfigOpen(false);

    // Save to Firestore and LocalStorage
    await saveDataReportConfig({
      sheetUrl: trimmedUrl,
      sheetName: trimmedName,
      updatedBy: currentUser?.name || currentUser?.email || 'admin'
    });

    if (onUpdateSettings) {
      onUpdateSettings({
        dataReportSheetUrl: trimmedUrl,
        dataReportSheetName: trimmedName
      });
    }

    notify('✓ បានរក្សាទុក Link Google Sheets ថ្មី!', 'success');
  };

  // Direct Link to Google Sheets
  const parsedSheet = useMemo(() => parseGoogleSheetInput(sheetUrl), [sheetUrl]);
  const directSheetUrl = useMemo(() => {
    if (parsedSheet.spreadsheetId) {
      return `https://docs.google.com/spreadsheets/d/${parsedSheet.spreadsheetId}/edit${parsedSheet.gid ? `#gid=${parsedSheet.gid}` : ''}`;
    }
    return sheetUrl;
  }, [parsedSheet, sheetUrl]);

  // Status Column Detection
  const statusColumn = useMemo(() => {
    if (!columns.length) return null;
    // 1. Direct case-insensitive match on label or id
    const direct = columns.find((c) => {
      const lbl = (c.label || '').trim().toLowerCase();
      const id = (c.id || '').trim().toLowerCase();
      return lbl === 'status' || lbl === 'ស្ថានភាព' || id === 'status';
    });
    if (direct) return direct;

    // 2. Partial match containing 'status'
    const partial = columns.find((c) => {
      const lbl = (c.label || '').trim().toLowerCase();
      const id = (c.id || '').trim().toLowerCase();
      return lbl.includes('status') || id.includes('status');
    });
    if (partial) return partial;

    // 3. Scan first 50 rows to detect which column contains 'DELIVERED'
    for (const col of columns) {
      const match = rows.slice(0, 50).some((r) => {
        const val = String(r[col.id] || '').trim().toUpperCase();
        return val === 'DELIVERED';
      });
      if (match) return col;
    }

    return null;
  }, [columns, rows]);

  // Check if a row has Status === DELIVERED
  const isRowDelivered = useCallback(
    (row: SheetRowData): boolean => {
      if (statusColumn) {
        const val = String(row[statusColumn.id] || '').trim().toUpperCase();
        return val === 'DELIVERED';
      }
      return Object.values(row).some((v) => String(v || '').trim().toUpperCase() === 'DELIVERED');
    },
    [statusColumn]
  );

  // Status Filter State: 'ALL' | 'DELIVERED' | 'NOT_DELIVERED'
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DELIVERED' | 'NOT_DELIVERED'>('ALL');

  // Teams Column Detection (TEAMS, Team, Teams, etc.)
  const teamsColumn = useMemo(() => {
    if (!columns.length) return null;
    const direct = columns.find((c) => {
      const lbl = (c.label || '').trim().toLowerCase();
      const id = (c.id || '').trim().toLowerCase();
      return lbl === 'teams' || lbl === 'team' || id === 'teams' || id === 'team';
    });
    if (direct) return direct;

    const partial = columns.find((c) => {
      const lbl = (c.label || '').trim().toLowerCase();
      const id = (c.id || '').trim().toLowerCase();
      return lbl.includes('team') || id.includes('team');
    });
    if (partial) return partial;

    for (const col of columns) {
      const match = rows.slice(0, 50).some((r) => {
        const val = String(r[col.id] || '').trim().toUpperCase();
        return val === 'IAL' || val === 'DEL';
      });
      if (match) return col;
    }
    return null;
  }, [columns, rows]);

  // Helper to extract Team value from a row
  const getRowTeam = useCallback(
    (row: SheetRowData): string => {
      if (teamsColumn) {
        return String(row[teamsColumn.id] || '').trim().toUpperCase();
      }
      for (const val of Object.values(row)) {
        const str = String(val || '').trim().toUpperCase();
        if (str === 'IAL' || str === 'DEL') return str;
      }
      return '';
    },
    [teamsColumn]
  );

  // Teams Filter State: 'ALL' | 'IAL_OR_DEL'
  const [teamsFilter, setTeamsFilter] = useState<'ALL' | 'IAL_OR_DEL'>('ALL');

  // Location Column Detection (LOCATION, Location, etc.)
  const locationColumn = useMemo(() => {
    if (!columns.length) return null;
    const direct = columns.find((c) => {
      const lbl = (c.label || '').trim().toLowerCase();
      const id = (c.id || '').trim().toLowerCase();
      return lbl === 'location' || id === 'location';
    });
    if (direct) return direct;

    const partial = columns.find((c) => {
      const lbl = (c.label || '').trim().toLowerCase();
      const id = (c.id || '').trim().toLowerCase();
      return lbl.includes('location') || id.includes('location');
    });
    if (partial) return partial;

    for (const col of columns) {
      const match = rows.slice(0, 50).some((r) => {
        const val = String(r[col.id] || '').trim().toLowerCase();
        return val === 'out of town' || val === 'city town';
      });
      if (match) return col;
    }
    return null;
  }, [columns, rows]);

  // Helper to extract Location value from a row
  const getRowLocation = useCallback(
    (row: SheetRowData): string => {
      if (locationColumn) {
        return String(row[locationColumn.id] || '').trim();
      }
      for (const val of Object.values(row)) {
        const str = String(val || '').trim().toLowerCase();
        if (str === 'out of town' || str === 'city town') {
          return String(val).trim();
        }
      }
      return '';
    },
    [locationColumn]
  );

  // Location Filter State: 'ALL' | 'LOCATION_VALID'
  const [locationFilter, setLocationFilter] = useState<'ALL' | 'LOCATION_VALID'>('ALL');

  // Column references for dedicated column filters
  const shipperColumn = useMemo(() => {
    if (!columns.length) return null;
    return (
      columns.find((c) => (c.label || '').trim().toUpperCase() === 'SHIPPER' || c.id.toUpperCase() === 'SHIPPER') ||
      columns.find((c) => (c.label || '').trim().toUpperCase().includes('SHIPPER'))
    );
  }, [columns]);

  const destinationColumn = useMemo(() => {
    if (!columns.length) return null;
    return (
      columns.find((c) => (c.label || '').trim().toUpperCase() === 'DESTINATION' || c.id.toUpperCase() === 'DESTINATION') ||
      columns.find((c) => (c.label || '').trim().toUpperCase().includes('DESTINATION'))
    );
  }, [columns]);

  const reDestColumn = useMemo(() => {
    if (!columns.length) return null;
    return (
      columns.find((c) => {
        const l = (c.label || '').trim().toUpperCase();
        return l === 'RE-DEST' || l === 'RE DEST' || l === 'REDEST';
      }) ||
      columns.find((c) => (c.label || '').trim().toUpperCase().includes('RE-DEST'))
    );
  }, [columns]);

  const originColumn = useMemo(() => {
    if (!columns.length) return null;
    return (
      columns.find((c) => (c.label || '').trim().toUpperCase() === 'ORIGIN' || c.id.toUpperCase() === 'ORIGIN') ||
      columns.find((c) => (c.label || '').trim().toUpperCase().includes('ORIGIN'))
    );
  }, [columns]);

  const customersCareColumn = useMemo(() => {
    if (!columns.length) return null;
    return (
      columns.find((c) => {
        const l = (c.label || '').trim().toUpperCase();
        return l === 'CUSTOMERS CARE' || l === 'CUSTOMER CARE' || l === 'CS';
      }) ||
      columns.find((c) => (c.label || '').trim().toUpperCase().includes('CARE'))
    );
  }, [columns]);

  const dateColumn = useMemo(() => {
    if (!columns.length) return null;
    return (
      columns.find((c) => (c.label || '').trim().toUpperCase() === 'DATE' || c.id.toUpperCase() === 'DATE') ||
      columns.find((c) => (c.label || '').trim().toUpperCase().includes('DATE'))
    );
  }, [columns]);

  // Robust Sheet Date Parser
  const parseSheetDate = useCallback((dateVal: any): Date | null => {
    if (!dateVal) return null;
    const s = String(dateVal).trim();
    if (!s || s === '—' || s === '-' || s === '#N/A') return null;

    const monthMap: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const parts = s.split(/[-/\s]/);
    if (parts.length === 3) {
      const mStr = parts[1].toLowerCase().slice(0, 3);
      if (monthMap[mStr] !== undefined) {
        const day = parseInt(parts[0], 10);
        const year = parseInt(parts[2], 10);
        if (!isNaN(day) && !isNaN(year)) {
          return new Date(year, monthMap[mStr], day);
        }
      }
      if (parts[0].length === 4) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(day)) return new Date(y, m, day);
      }
      if (parts[2].length === 4) {
        const day = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(day)) return new Date(y, m, day);
      }
    }

    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }, []);

  // Distinct Values for Dropdowns
  const uniqueShippers = useMemo(() => {
    if (!shipperColumn) return [];
    const set = new Set<string>();
    rows.forEach((r) => {
      const v = r[shipperColumn.id];
      if (v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s && s !== '—' && s !== '-' && s !== '#N/A') set.add(s);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, shipperColumn]);

  const uniqueDestinations = useMemo(() => {
    if (!destinationColumn) return [];
    const set = new Set<string>();
    rows.forEach((r) => {
      const v = r[destinationColumn.id];
      if (v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s && s !== '—' && s !== '-' && s !== '#N/A') set.add(s);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, destinationColumn]);

  const uniqueReDests = useMemo(() => {
    if (!reDestColumn) return [];
    const set = new Set<string>();
    rows.forEach((r) => {
      const v = r[reDestColumn.id];
      if (v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s && s !== '—' && s !== '-' && s !== '#N/A') set.add(s);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, reDestColumn]);

  const uniqueOrigins = useMemo(() => {
    if (!originColumn) return [];
    const set = new Set<string>();
    rows.forEach((r) => {
      const v = r[originColumn.id];
      if (v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s && s !== '—' && s !== '-' && s !== '#N/A') set.add(s);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, originColumn]);

  const uniqueStatuses = useMemo(() => {
    if (!statusColumn) return [];
    const set = new Set<string>();
    rows.forEach((r) => {
      const v = r[statusColumn.id];
      if (v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s && s !== '—' && s !== '-' && s !== '#N/A') set.add(s);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, statusColumn]);

  const uniqueCustomersCare = useMemo(() => {
    if (!customersCareColumn) return [];
    const set = new Set<string>();
    rows.forEach((r) => {
      const v = r[customersCareColumn.id];
      if (v !== undefined && v !== null) {
        const s = String(v).trim();
        if (s && s !== '—' && s !== '-' && s !== '#N/A') set.add(s);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, customersCareColumn]);

  // Advanced Filter States
  const [selectedShipper, setSelectedShipper] = useState<string>('ALL');
  const [selectedDestination, setSelectedDestination] = useState<string>('ALL');
  const [selectedReDest, setSelectedReDest] = useState<string>('ALL');
  const [selectedOrigin, setSelectedOrigin] = useState<string>('ALL');
  const [selectedStatusVal, setSelectedStatusVal] = useState<string>('ALL');
  const [selectedCustomersCare, setSelectedCustomersCare] = useState<string>('ALL');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState<boolean>(true);

  // Active Advanced Filters Counter
  const activeCustomFilterCount = useMemo(() => {
    let count = 0;
    if (selectedShipper !== 'ALL') count++;
    if (selectedDestination !== 'ALL') count++;
    if (selectedReDest !== 'ALL') count++;
    if (selectedOrigin !== 'ALL') count++;
    if (selectedStatusVal !== 'ALL') count++;
    if (selectedCustomersCare !== 'ALL') count++;
    if (filterStartDate) count++;
    if (filterEndDate) count++;
    return count;
  }, [
    selectedShipper,
    selectedDestination,
    selectedReDest,
    selectedOrigin,
    selectedStatusVal,
    selectedCustomersCare,
    filterStartDate,
    filterEndDate
  ]);

  // Reset Filters Handler
  const handleResetFilters = useCallback(() => {
    setSelectedShipper('ALL');
    setSelectedDestination('ALL');
    setSelectedReDest('ALL');
    setSelectedOrigin('ALL');
    setSelectedStatusVal('ALL');
    setSelectedCustomersCare('ALL');
    setFilterStartDate('');
    setFilterEndDate('');
    notify('✓ បានសម្អាតការចម្រាញ់ទាំងអស់', 'info');
  }, [notify]);

  // Numeric Column Detection & Financial Totals
  const numericColumns = useMemo(() => {
    if (!rows.length || !columns.length) return [];
    return columns.filter((col) => {
      // Exclude status column, teams column, and location column from numeric detection
      if (statusColumn && col.id === statusColumn.id) return false;
      if (teamsColumn && col.id === teamsColumn.id) return false;
      if (locationColumn && col.id === locationColumn.id) return false;

      // Exclude identifier/code/barcode columns from being summed
      const colLabel = (col.label || col.id || '').trim().toLowerCase();
      if (
        colLabel.includes('barcode') ||
        colLabel.includes('tracking') ||
        colLabel.includes('phone') ||
        colLabel.includes('awbn') ||
        colLabel.includes('id') ||
        colLabel.includes('date') ||
        colLabel.includes('code')
      ) {
        return false;
      }

      // Check if majority of values are numbers
      let numCount = 0;
      let totalValid = 0;
      for (const row of rows.slice(0, 50)) {
        const val = row[col.id];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          totalValid++;
          const cleaned = String(val).replace(/[$,៛\s]/g, '');
          if (!isNaN(Number(cleaned)) && cleaned !== '') {
            numCount++;
          }
        }
      }
      return totalValid > 0 && numCount / totalValid >= 0.7;
    });
  }, [rows, columns, statusColumn, teamsColumn, locationColumn]);

  // Calculate Column Totals for Numeric Columns
  const columnTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    numericColumns.forEach((col) => {
      let sum = 0;
      rows.forEach((row) => {
        const val = row[col.id];
        if (val !== undefined && val !== null) {
          const cleaned = String(val).replace(/[$,៛\s]/g, '');
          const n = Number(cleaned);
          if (!isNaN(n)) sum += n;
        }
      });
      totals[col.id] = sum;
    });
    return totals;
  }, [rows, numericColumns]);

  // Search-filtered rows (search query & selected column filter)
  const searchFilteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const query = searchQuery.toLowerCase().trim();

    return rows.filter((row) => {
      if (selectedColumnFilter !== 'ALL') {
        const val = row[selectedColumnFilter];
        return val !== undefined && val !== null && String(val).toLowerCase().includes(query);
      }
      return Object.values(row).some(
        (val) => val !== undefined && val !== null && String(val).toLowerCase().includes(query)
      );
    });
  }, [rows, searchQuery, selectedColumnFilter]);

  // Status counts (total in sheet & matching current search)
  const statusCounts = useMemo(() => {
    let deliveredTotal = 0;
    let nonDeliveredTotal = 0;
    let deliveredFiltered = 0;
    let nonDeliveredFiltered = 0;

    rows.forEach((r) => {
      if (isRowDelivered(r)) deliveredTotal++;
      else nonDeliveredTotal++;
    });

    searchFilteredRows.forEach((r) => {
      if (isRowDelivered(r)) deliveredFiltered++;
      else nonDeliveredFiltered++;
    });

    return {
      deliveredTotal,
      nonDeliveredTotal,
      deliveredFiltered,
      nonDeliveredFiltered
    };
  }, [rows, searchFilteredRows, isRowDelivered]);

  // Teams counts (total in sheet & matching current search)
  const teamCounts = useMemo(() => {
    let ialTotal = 0;
    let delTotal = 0;
    let combinedTotal = 0;

    let ialFiltered = 0;
    let delFiltered = 0;
    let combinedFiltered = 0;

    rows.forEach((r) => {
      const team = getRowTeam(r);
      if (team === 'IAL') {
        ialTotal++;
        combinedTotal++;
      } else if (team === 'DEL') {
        delTotal++;
        combinedTotal++;
      }
    });

    searchFilteredRows.forEach((r) => {
      const team = getRowTeam(r);
      if (team === 'IAL') {
        ialFiltered++;
        combinedFiltered++;
      } else if (team === 'DEL') {
        delFiltered++;
        combinedFiltered++;
      }
    });

    return {
      ialTotal,
      delTotal,
      combinedTotal,
      ialFiltered,
      delFiltered,
      combinedFiltered
    };
  }, [rows, searchFilteredRows, getRowTeam]);

  // Location counts (Out Of Town, City Town, Combined)
  const locationCounts = useMemo(() => {
    let outOfTownTotal = 0;
    let cityTownTotal = 0;
    let combinedTotal = 0;

    let outOfTownFiltered = 0;
    let cityTownFiltered = 0;
    let combinedFiltered = 0;

    const isMatch = (val: string, target: string) => val.trim().toLowerCase() === target.toLowerCase();

    rows.forEach((r) => {
      const loc = getRowLocation(r);
      if (isMatch(loc, 'Out Of Town')) {
        outOfTownTotal++;
        combinedTotal++;
      } else if (isMatch(loc, 'City Town')) {
        cityTownTotal++;
        combinedTotal++;
      }
    });

    searchFilteredRows.forEach((r) => {
      const loc = getRowLocation(r);
      if (isMatch(loc, 'Out Of Town')) {
        outOfTownFiltered++;
        combinedFiltered++;
      } else if (isMatch(loc, 'City Town')) {
        cityTownFiltered++;
        combinedFiltered++;
      }
    });

    return {
      outOfTownTotal,
      cityTownTotal,
      combinedTotal,
      outOfTownFiltered,
      cityTownFiltered,
      combinedFiltered
    };
  }, [rows, searchFilteredRows, getRowLocation]);

  // Final Filtered Rows (applying status filter, teams filter, and location filter if active)
  const filteredRows = useMemo(() => {
    let result = searchFilteredRows;
    if (statusFilter === 'DELIVERED') {
      result = result.filter((r) => isRowDelivered(r));
    } else if (statusFilter === 'NOT_DELIVERED') {
      result = result.filter((r) => !isRowDelivered(r));
    }

    if (teamsFilter === 'IAL_OR_DEL') {
      result = result.filter((r) => {
        const team = getRowTeam(r);
        return team === 'IAL' || team === 'DEL';
      });
    }

    if (locationFilter === 'LOCATION_VALID') {
      result = result.filter((r) => {
        const loc = getRowLocation(r).trim().toLowerCase();
        return loc === 'out of town' || loc === 'city town';
      });
    }

    // 1. Shipper Filter
    if (selectedShipper !== 'ALL' && shipperColumn) {
      result = result.filter((r) => String(r[shipperColumn.id] || '').trim() === selectedShipper);
    }

    // 2. Destination Filter
    if (selectedDestination !== 'ALL' && destinationColumn) {
      result = result.filter((r) => String(r[destinationColumn.id] || '').trim() === selectedDestination);
    }

    // 3. Re-Dest Filter
    if (selectedReDest !== 'ALL' && reDestColumn) {
      result = result.filter((r) => String(r[reDestColumn.id] || '').trim() === selectedReDest);
    }

    // 4. Origin Filter
    if (selectedOrigin !== 'ALL' && originColumn) {
      result = result.filter((r) => String(r[originColumn.id] || '').trim() === selectedOrigin);
    }

    // 5. Status Value Filter
    if (selectedStatusVal !== 'ALL' && statusColumn) {
      result = result.filter((r) => String(r[statusColumn.id] || '').trim() === selectedStatusVal);
    }

    // 6. Customers Care Filter
    if (selectedCustomersCare !== 'ALL' && customersCareColumn) {
      result = result.filter((r) => String(r[customersCareColumn.id] || '').trim() === selectedCustomersCare);
    }

    // 7. Date Range Filter
    if ((filterStartDate || filterEndDate) && dateColumn) {
      const startObj = filterStartDate ? new Date(filterStartDate + 'T00:00:00') : null;
      const endObj = filterEndDate ? new Date(filterEndDate + 'T23:59:59') : null;

      result = result.filter((r) => {
        const d = parseSheetDate(r[dateColumn.id]);
        if (!d) return false;
        if (startObj && d < startObj) return false;
        if (endObj && d > endObj) return false;
        return true;
      });
    }

    return result;
  }, [
    searchFilteredRows,
    statusFilter,
    teamsFilter,
    locationFilter,
    isRowDelivered,
    getRowTeam,
    getRowLocation,
    selectedShipper,
    selectedDestination,
    selectedReDest,
    selectedOrigin,
    selectedStatusVal,
    selectedCustomersCare,
    filterStartDate,
    filterEndDate,
    shipperColumn,
    destinationColumn,
    reDestColumn,
    originColumn,
    statusColumn,
    customersCareColumn,
    dateColumn,
    parseSheetDate
  ]);

  // Sorting Rows
  const sortedRows = useMemo(() => {
    if (!sortColumn) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      const valA = a[sortColumn];
      const valB = b[sortColumn];

      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      // Check if numeric comparison
      const numA = Number(String(valA).replace(/[$,៛\s]/g, ''));
      const numB = Number(String(valB).replace(/[$,៛\s]/g, ''));

      if (!isNaN(numA) && !isNaN(numB)) {
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      }

      // String comparison
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortDirection === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredRows, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    if (pageSize >= sortedRows.length) return sortedRows;
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, currentPage, pageSize]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    selectedColumnFilter,
    statusFilter,
    teamsFilter,
    locationFilter,
    selectedShipper,
    selectedDestination,
    selectedReDest,
    selectedOrigin,
    selectedStatusVal,
    selectedCustomersCare,
    filterStartDate,
    filterEndDate,
    pageSize
  ]);

  // Handle Sort Click
  const handleSort = (columnId: string) => {
    if (sortColumn === columnId) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumn(columnId);
      setSortDirection('asc');
    }
  };

  // Copy Cell Value
  const handleCopyCell = (cellId: string, value: any) => {
    if (value === undefined || value === null) return;
    navigator.clipboard.writeText(String(value));
    setCopiedCellId(cellId);
    setTimeout(() => setCopiedCellId(null), 1500);
  };

  // Helper to extract a column value from row by matching label or id
  const getFieldValue = useCallback(
    (row: SheetRowData, possibleNames: string[]): string => {
      // 1. Exact match on label or id
      for (const name of possibleNames) {
        const col = columns.find((c) => {
          const lbl = (c.label || '').trim().toLowerCase();
          const id = (c.id || '').trim().toLowerCase();
          const target = name.trim().toLowerCase();
          return lbl === target || id === target;
        });
        if (col) {
          const val = row[col.id];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            return String(val).trim();
          }
        }
      }

      // 2. Partial match
      for (const name of possibleNames) {
        const col = columns.find((c) => {
          const lbl = (c.label || '').trim().toLowerCase();
          const id = (c.id || '').trim().toLowerCase();
          const target = name.trim().toLowerCase();
          return lbl.includes(target) || id.includes(target);
        });
        if (col) {
          const val = row[col.id];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            return String(val).trim();
          }
        }
      }

      // 3. Fallback to direct keys on row
      for (const name of possibleNames) {
        const target = name.trim().toLowerCase();
        for (const key of Object.keys(row)) {
          if (key.trim().toLowerCase() === target) {
            const val = row[key];
            if (val !== undefined && val !== null && String(val).trim() !== '') {
              return String(val).trim();
            }
          }
        }
      }

      return '';
    },
    [columns]
  );

  // Helper to extract the 6 target fields (BARCODE, DATE, SHIPPER, DESTINATION, STATUS, DESCRIPTION)
  const getRowPackageDetails = useCallback(
    (row: SheetRowData) => {
      const barcode = getFieldValue(row, ['barcode', 'bar code', 'code', 'awbn', 'tracking']);
      const date = getFieldValue(row, ['date', 'កាលបរិច្ឆេទ', 'ថ្ងៃខែ']);
      const shipper = getFieldValue(row, ['shipper', 'អ្នកផ្ញើ']);
      const destination = getFieldValue(row, ['destination', 'dest', 'ទិសដៅ']);
      const status = getFieldValue(row, ['status', 'ស្ថានភាព']);
      const description = getFieldValue(row, ['description', 'desc', 'បរិយាយ', 'ទំនិញ']);

      return {
        barcode: barcode || '—',
        date: date || '—',
        shipper: shipper || '—',
        destination: destination || '—',
        status: status || '—',
        description: description || '—'
      };
    },
    [getFieldValue]
  );

  // Copy structured package details to clipboard with rich formatting
  const handleCopyBarcodePackage = useCallback(
    (row: SheetRowData, rowKey: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const pkg = getRowPackageDetails(row);

      const textToCopy = [
        `Tracking : ${pkg.barcode}`,
        `Date : ${pkg.date}`,
        `-------------------------------`,
        `-Shipper : ${pkg.shipper}`,
        `-Dest: ${pkg.destination}`,
        `-Status: ${pkg.status}`,
        `---------------------------------`,
        `-Desc: ${pkg.description}`
      ].join('\n');

      navigator.clipboard.writeText(textToCopy);
      setCopiedPackageRowId(rowKey);
      setTimeout(() => setCopiedPackageRowId(null), 1800);
      notify(`✓ បានចម្លងព័ត៌មានកញ្ចប់ (${pkg.barcode}) ទៅ Clipboard រួចរាល់!`, 'success');
    },
    [getRowPackageDetails, notify]
  );

  // Copy ONLY barcode value to clipboard
  const handleCopyBarcodeOnly = useCallback(
    (barcode: string, cellId: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (!barcode || barcode === '—') return;
      navigator.clipboard.writeText(barcode);
      setCopiedCellId(cellId);
      setTimeout(() => setCopiedCellId(null), 1500);
      notify(`✓ បានចម្លងតែលេខ Barcode (${barcode}) រួចរាល់!`, 'success');
    },
    [notify]
  );

  // CSV Export
  const handleExportCSV = () => {
    if (!columns.length || !sortedRows.length) {
      notify('មិនមានទិន្នន័យសម្រាប់ទាញយកឡើយ', 'info');
      return;
    }

    try {
      const headerRow = columns.map((c) => `"${(c.label || c.id).replace(/"/g, '""')}"`).join(',');
      const bodyRows = sortedRows.map((row) => {
        return columns
          .map((c) => {
            const val = row[c.id];
            const str = val !== undefined && val !== null ? String(val) : '';
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(',');
      });

      const csvContent = '\uFEFF' + [headerRow, ...bodyRows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Data_Report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      notify('✓ បានទាញយកឯកសារ CSV ជោគជ័យ!', 'success');
    } catch (e: any) {
      notify('កំហុសក្នុងការទាញយក CSV', 'error');
    }
  };

  return (
    <div
      className={`w-full space-y-3.5 pb-28 lg:pb-16 animate-in fade-in duration-200 transition-all ${
        isFullScreen ? 'fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 p-2 sm:p-4 overflow-y-auto w-screen h-screen' : ''
      }`}
    >
      {/* Floating Exit Button in Fullscreen Mode */}
      {isFullScreen && (
        <div className="fixed top-3 right-4 z-50 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
          <button
            type="button"
            onClick={() => setIsFullScreen(false)}
            className="px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold shadow-xl border border-slate-700/80 flex items-center gap-1.5 transition active:scale-95 cursor-pointer backdrop-blur-md"
            title="ចេញពី Full Screen (ឬចុច Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
            <span>ចេញពី Full Page (Esc)</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📊 1. HEADER & ACTION CONTROLS */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 bg-white dark:bg-slate-900 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold shrink-0">
            <BarChart3 className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight truncate">
                Data Report (របាយការណ៍ទិន្នន័យ)
              </h2>
              <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Google Sheets Live
              </span>
            </div>
          </div>
        </div>

        {/* Right: Quick Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0 flex-wrap">
          {/* 🚚 Distribution Alert Form Button */}
          <button
            id="btn-distribution-alert"
            type="button"
            onClick={() => handleOpenDistModal('')}
            className="h-8 px-2.5 sm:px-3 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0 active:scale-[0.98]"
            title="Alert form សម្រាប់បញ្ចូលរបាយការណ៍ចែកចាយ (Barcode, Name, Date)"
          >
            <Truck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">របាយការណ៍ចែកចាយ</span>
            {distReports.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/25 text-white font-mono font-bold">
                {distReports.length}
              </span>
            )}
          </button>

          {/* Edit Google Sheets Link Button */}
          <button
            id="btn-edit-sheet-url"

            type="button"
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className={`h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs shrink-0 ${
              isConfigOpen
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
            }`}
            title="កំណត់ ឬផ្លាស់ប្តូរ Link Google Sheets"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="hidden sm:inline">Link Sheets</span>
          </button>

          {/* Open Google Sheet External */}
          {sheetUrl && (
            <a
              href={directSheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 px-2.5 rounded-lg border border-emerald-300/80 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs shrink-0"
              title="បើកមើលលើ Google Sheets ផ្ទាល់"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden md:inline">បើក Sheets</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>
          )}

          {/* Auto-Sync Dropdown Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsAutoSyncMenuOpen(!isAutoSyncMenuOpen)}
              className={`h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs shrink-0 ${
                isAutoSyncEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
              title="កំណត់ Auto-Sync ស្វ័យប្រវត្តិ"
            >
              <Zap className={`w-3.5 h-3.5 ${isAutoSyncEnabled ? 'text-amber-500' : 'text-slate-400'}`} />
              <span className="hidden sm:inline font-mono text-[11px]">
                {isSyncingInBackground ? 'Syncing...' : isAutoSyncEnabled ? `${countdown}s` : 'Auto-Sync Off'}
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
                  onClick={() => {
                    const next = !isAutoSyncEnabled;
                    setIsAutoSyncEnabled(next);
                    localStorage.setItem(STORAGE_KEY_AUTO_SYNC, String(next));
                    setIsAutoSyncMenuOpen(false);
                    notify(next ? 'បានបើកដំណើរការ Auto-Sync!' : 'បានបិទ Auto-Sync', 'info');
                  }}
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
                        onClick={() => {
                          setSyncInterval(sec);
                          setCountdown(sec);
                          localStorage.setItem(STORAGE_KEY_SYNC_INTERVAL, String(sec));
                          setIsAutoSyncMenuOpen(false);
                          notify(`បានកំណត់ Auto-Sync រៀងរាល់ ${sec} វិនាទី!`, 'success');
                        }}
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

          {/* Refresh Button */}
          <button
            id="btn-refresh-data-report"
            type="button"
            disabled={isLoading || !sheetUrl.trim()}
            onClick={() => loadData(false)}
            className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0 disabled:opacity-50 active:scale-[0.98]"
            title="ទាញយកទិន្នន័យឡើងវិញពី Google Sheets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isLoading ? 'កំពុងទាញយក...' : 'Refresh'}</span>
          </button>

          {/* CSV Export */}
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={!rows.length}
            className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 transition shadow-2xs disabled:opacity-50 cursor-pointer shrink-0"
            title="ទាញយកជាឯកសារ Excel/CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          {/* Full Screen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 transition shadow-2xs cursor-pointer shrink-0"
            title={isFullScreen ? 'ចេញពី Full Page' : 'ពេញទំព័រ (Full Page)'}
          >
            {isFullScreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden xl:inline">បង្រួម</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden xl:inline">ពេញទំព័រ</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ⚙️ 2. GOOGLE SHEETS LINK CONFIGURATION DRAWER */}
      {/* ========================================================================= */}
      {isConfigOpen && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3.5 sm:p-4 border border-blue-200 dark:border-blue-900/60 shadow-xs space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <Database className="w-4 h-4 text-blue-600" />
              <span>កំណត់ Link Google Sheets សម្រាប់ទាញយកទិន្នន័យ (Data Report Link)</span>
            </div>
            <button
              type="button"
              onClick={() => setShowHelpGuide(!showHelpGuide)}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>របៀប Share Google Sheets?</span>
            </button>
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
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-normal">
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
                  onClick={handleSaveConfig}
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
            onClick={() => loadData(false)}
            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer shrink-0"
          >
            ព្យាយាមម្តងទៀត
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📈 3. SUMMARY KPI CARDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-2.5">
        {/* Total Rows */}
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border transition shadow-2xs flex items-center justify-between cursor-pointer ${
            statusFilter === 'ALL'
              ? 'border-blue-400 dark:border-blue-600 ring-2 ring-blue-500/20'
              : 'border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
          title="ចុចដើម្បីបង្ហាញទិន្នន័យទាំងអស់"
        >
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">ជួរដេកសរុប (Total Rows)</div>
            <div className="text-xl font-black text-slate-900 dark:text-white leading-none mt-1 truncate">
              {rows.length.toLocaleString()}
            </div>
            <div className="text-[10.5px] text-blue-600 dark:text-blue-400 font-semibold mt-0.5 truncate">
              ● {filteredRows.length.toLocaleString()} ត្រូវនឹងការស្វែងរក
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 ml-2">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        {/* Status DELIVERED Card */}
        <div
          onClick={() => setStatusFilter((prev) => (prev === 'DELIVERED' ? 'ALL' : 'DELIVERED'))}
          className={`px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border transition shadow-2xs flex items-center justify-between cursor-pointer ${
            statusFilter === 'DELIVERED'
              ? 'border-emerald-500 dark:border-emerald-500 ring-2 ring-emerald-500/25 bg-emerald-50/25 dark:bg-emerald-950/25'
              : 'border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-800'
          }`}
          title="ចុចដើម្បីចម្រាញ់ទិន្នន័យ Status = DELIVERED"
        >
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 truncate flex items-center gap-1">
              <span>ជួរឈរសរុប Status ស្មើ DELIVERED</span>
            </div>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 leading-none mt-1 truncate">
              {statusCounts.deliveredTotal.toLocaleString()}
            </div>
            <div className="text-[10.5px] text-emerald-700/80 dark:text-emerald-400/80 font-medium mt-0.5 truncate">
              ● {statusCounts.deliveredFiltered.toLocaleString()} ត្រូវនឹងការស្វែងរក
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 ml-2">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        {/* Status NOT DELIVERED Card */}
        <div
          onClick={() => setStatusFilter((prev) => (prev === 'NOT_DELIVERED' ? 'ALL' : 'NOT_DELIVERED'))}
          className={`px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border transition shadow-2xs flex items-center justify-between cursor-pointer ${
            statusFilter === 'NOT_DELIVERED'
              ? 'border-rose-500 dark:border-rose-500 ring-2 ring-rose-500/25 bg-rose-50/25 dark:bg-rose-950/25'
              : 'border-slate-200/90 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-800'
          }`}
          title="ចុចដើម្បីចម្រាញ់ទិន្នន័យ Status ខុសពី DELIVERED"
        >
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 truncate flex items-center gap-1">
              <span>ជួរឈរសរុប Status ខុស DELIVERED</span>
            </div>
            <div className="text-xl font-black text-rose-600 dark:text-rose-400 leading-none mt-1 truncate">
              {statusCounts.nonDeliveredTotal.toLocaleString()}
            </div>
            <div className="text-[10.5px] text-rose-700/80 dark:text-rose-400/80 font-medium mt-0.5 truncate">
              ● {statusCounts.nonDeliveredFiltered.toLocaleString()} ត្រូវនឹងការស្វែងរក
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 ml-2">
            <AlertCircle className="w-4 h-4" />
          </div>
        </div>

        {/* Teams IAL or DEL Card */}
        <div
          onClick={() => setTeamsFilter((prev) => (prev === 'IAL_OR_DEL' ? 'ALL' : 'IAL_OR_DEL'))}
          className={`px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border transition shadow-2xs flex items-center justify-between cursor-pointer ${
            teamsFilter === 'IAL_OR_DEL'
              ? 'border-cyan-500 dark:border-cyan-500 ring-2 ring-cyan-500/25 bg-cyan-50/25 dark:bg-cyan-950/25'
              : 'border-slate-200/90 dark:border-slate-800 hover:border-cyan-300 dark:hover:border-cyan-800'
          }`}
          title="ចុចដើម្បីចម្រាញ់ទិន្នន័យ Teams = IAL ឬ DEL"
        >
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 truncate flex items-center gap-1">
              <span>សរុប (Columns) Teams ស្មើ IAL រឺ DEL</span>
            </div>
            <div className="text-xl font-black text-cyan-600 dark:text-cyan-400 leading-none mt-1 truncate">
              {teamCounts.combinedTotal.toLocaleString()}
            </div>
            <div className="text-[10.5px] text-cyan-700/80 dark:text-cyan-400/80 font-medium mt-0.5 truncate">
              ● IAL: {teamCounts.ialTotal.toLocaleString()} | DEL: {teamCounts.delTotal.toLocaleString()}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-900/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0 ml-2">
            <Users className="w-4 h-4" />
          </div>
        </div>

        {/* Location Out Of Town or City Town Card */}
        <div
          onClick={() => setLocationFilter((prev) => (prev === 'LOCATION_VALID' ? 'ALL' : 'LOCATION_VALID'))}
          className={`px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border transition shadow-2xs flex items-center justify-between cursor-pointer ${
            locationFilter === 'LOCATION_VALID'
              ? 'border-purple-500 dark:border-purple-500 ring-2 ring-purple-500/25 bg-purple-50/25 dark:bg-purple-950/25'
              : 'border-slate-200/90 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-800'
          }`}
          title="ចុចដើម្បីចម្រាញ់ទិន្នន័យ Location = Out Of Town ឬ City Town"
        >
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-purple-600 dark:text-purple-400 truncate flex items-center gap-1">
              <span>សរុប (Columns) Location ស្មើ Out Of Town រឺ City Town</span>
            </div>
            <div className="text-xl font-black text-purple-700 dark:text-purple-300 leading-none mt-1 truncate">
              {locationCounts.combinedTotal.toLocaleString()}
            </div>
            <div className="text-[10.5px] text-purple-700/80 dark:text-purple-400/80 font-medium mt-0.5 truncate">
              ● Out Of Town: {locationCounts.outOfTownTotal.toLocaleString()} | City Town: {locationCounts.cityTownTotal.toLocaleString()}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-900/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 ml-2">
            <MapPin className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🔍 4. SEARCH, FILTER, AND VIEW TOGGLE BAR */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-center justify-between bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
        {/* Search Input & Active Filter Pill */}
        <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ស្វែងរកក្នុងទិន្នន័យ (Search all fields)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-7 h-9 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Active Status Filter Pill */}
          {statusFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer shrink-0 shadow-2xs ${
                statusFilter === 'DELIVERED'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-700 hover:bg-rose-100'
              }`}
              title="ចុចដើម្បីលុបការចម្រាញ់ Status (បង្ហាញទាំងអស់)"
            >
              <span>{statusFilter === 'DELIVERED' ? 'Status: DELIVERED' : 'Status: ≠ DELIVERED'}</span>
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Active Teams Filter Pill */}
          {teamsFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setTeamsFilter('ALL')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer shrink-0 shadow-2xs bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700 hover:bg-cyan-100"
              title="ចុចដើម្បីលុបការចម្រាញ់ Teams (បង្ហាញទាំងអស់)"
            >
              <span>Teams: IAL/DEL</span>
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Active Location Filter Pill */}
          {locationFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setLocationFilter('ALL')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer shrink-0 shadow-2xs bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-700 hover:bg-purple-100"
              title="ចុចដើម្បីលុបការចម្រាញ់ Location (បង្ហាញទាំងអស់)"
            >
              <span>Location: Out Of Town/City Town</span>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Controls & View Toggle */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {/* Toggle Advanced Filters Button */}
          <button
            type="button"
            onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
            className={`h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              isFilterPanelOpen || activeCustomFilterCount > 0
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700 shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100'
            }`}
            title="បើក/បិទ ផ្ទាំងចម្រាញ់ទិន្នន័យ (Shipper, Destination, Re-Dest, Origin, Status, Customers Care, Date)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ចម្រាញ់</span>
            <span>Filters</span>
            {activeCustomFilterCount > 0 && (
              <span className="min-w-4.5 h-4.5 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                {activeCustomFilterCount}
              </span>
            )}
          </button>

          {/* Target Column Filter */}
          {columns.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="w-3.5 h-3.5 text-slate-400 hidden md:inline" />
              <select
                value={selectedColumnFilter}
                onChange={(e) => setSelectedColumnFilter(e.target.value)}
                className="h-8 px-2.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="ALL">គ្រប់ជួរឈរ (All Columns)</option>
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label || c.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Rows Per Page */}
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span className="hidden md:inline text-[11px]">បង្ហាញ:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-8 px-2 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={1000}>ទាំងអស់</option>
            </select>
          </div>

          {/* Table vs Cards Mode Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
              }`}
              title="Table View"
            >
              <Table2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">តារាង</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
              }`}
              title="Cards View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">កាត</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🎯 4.1 ADVANCED COLUMN FILTERS PANEL */}
      {/* ========================================================================= */}
      {isFilterPanelOpen && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xs p-3 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                ចម្រាញ់ទិន្នន័យតាមជួរឈរ (Filters by Columns)
              </h3>
              {activeCustomFilterCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  បានជ្រើស {activeCustomFilterCount}
                </span>
              )}
            </div>

            {activeCustomFilterCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400 flex items-center gap-1 transition cursor-pointer hover:underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>សម្អាតការចម្រាញ់ទាំងអស់ (Reset Filters)</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {/* 1. Shipper Searchable Filter */}
            <SearchableFilterDropdown
              label="Shipper"
              allLabel="គ្រប់ Shipper (All)"
              value={selectedShipper}
              onChange={setSelectedShipper}
              options={uniqueShippers}
            />

            {/* 2. Destination Searchable Filter */}
            <SearchableFilterDropdown
              label="Destination"
              allLabel="គ្រប់ Destination (All)"
              value={selectedDestination}
              onChange={setSelectedDestination}
              options={uniqueDestinations}
            />

            {/* 3. Re-Dest Searchable Filter */}
            <SearchableFilterDropdown
              label="Re-Dest"
              allLabel="គ្រប់ Re-Dest (All)"
              value={selectedReDest}
              onChange={setSelectedReDest}
              options={uniqueReDests}
            />

            {/* 4. Origin Searchable Filter */}
            <SearchableFilterDropdown
              label="Origin"
              allLabel="គ្រប់ Origin (All)"
              value={selectedOrigin}
              onChange={setSelectedOrigin}
              options={uniqueOrigins}
            />

            {/* 5. Status Searchable Filter */}
            <SearchableFilterDropdown
              label="Status"
              allLabel="គ្រប់ Status (All)"
              value={selectedStatusVal}
              onChange={setSelectedStatusVal}
              options={uniqueStatuses}
            />

            {/* 6. Customers Care Searchable Filter */}
            <SearchableFilterDropdown
              label="Customers Care"
              allLabel="គ្រប់ Customers Care (All)"
              value={selectedCustomersCare}
              onChange={setSelectedCustomersCare}
              options={uniqueCustomersCare}
            />

            {/* 7. Date Range: Start Date & End Date */}
            <div className="col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-1 space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>កាលបរិច្ឆេទ (Date)</span>
                {(filterStartDate || filterEndDate) && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className={`w-1/2 h-9 px-1.5 rounded-lg text-xs border focus:outline-none cursor-pointer ${
                    filterStartDate
                      ? 'bg-blue-50/70 border-blue-400 text-blue-700 font-semibold'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                  title="ចាប់ពីថ្ងៃ (Start Date)"
                />
                <span className="text-xs text-slate-400">-</span>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className={`w-1/2 h-9 px-1.5 rounded-lg text-xs border focus:outline-none cursor-pointer ${
                    filterEndDate
                      ? 'bg-blue-50/70 border-blue-400 text-blue-700 font-semibold'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                  title="ដល់ថ្ងៃ (End Date)"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📋 5. MAIN DATA TABLE / CARD VIEW */}
      {/* ========================================================================= */}
      {rows.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-xs">
          <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
            {!sheetUrl ? 'មិនទាន់មាន Link Google Sheets នៅឡើយទេ' : 'មិនមានទិន្នន័យក្នុង Google Sheets នេះទេ'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-4">
            {!sheetUrl
              ? 'សូមចុចប៊ូតុង "Link Sheets" ខាងលើ ដើម្បីដាក់ Link Google Sheets សម្រាប់ទាញយកទិន្នន័យ។'
              : 'សូមពិនិត្យមើលសិទ្ធិ Share (Anyone with link can view) ឬចុចប៊ូតុង Refresh ដើម្បីព្យាយាមម្តងទៀត។'}
          </p>
          <button
            type="button"
            onClick={() => setIsConfigOpen(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm cursor-pointer"
          >
            កំណត់ Link Google Sheets
          </button>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div 
            ref={tableContainerRef}
            onScroll={handleTableScroll}
            className="overflow-x-auto custom-scrollbar max-h-[70vh]"
          >
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-950/90 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800">
                <tr className="text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                  {/* Sticky Row Index Header (#) */}
                  <th className="sticky top-0 left-0 z-30 bg-slate-50 dark:bg-slate-950 py-2.5 px-3 w-12 min-w-[48px] max-w-[48px] text-center text-slate-400 border-r border-slate-200/80 dark:border-slate-800">
                    #
                  </th>
                  {columns.map((col) => {
                    const isSorted = sortColumn === col.id;
                    const isBarcodeCol = (col.label || col.id || '').trim().toUpperCase() === 'BARCODE';

                    return (
                      <th
                        key={col.id}
                        onClick={() => handleSort(col.id)}
                        className={`py-2.5 px-3 cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-900/60 select-none transition-colors whitespace-nowrap ${
                          isBarcodeCol
                            ? 'sticky top-0 left-[48px] z-30 bg-slate-50 dark:bg-slate-950 min-w-[170px] border-r border-slate-200/90 dark:border-slate-800 shadow-[4px_0_10px_-3px_rgba(0,0,0,0.08)]'
                            : ''
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{col.label || col.id}</span>
                          <span className="text-slate-400">
                            {isSorted ? (
                              sortDirection === 'asc' ? (
                                <ArrowUp className="w-3.5 h-3.5 text-blue-600 font-bold" />
                              ) : (
                                <ArrowDown className="w-3.5 h-3.5 text-blue-600 font-bold" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-40" />
                            )}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="py-12 text-center text-slate-400">
                      <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="font-semibold text-xs">មិនមានទិន្នន័យដែលត្រូវនឹងពាក្យស្វែងរកឡើយ</p>
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row, idx) => {
                    const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                    const rowKey = row._id || `row_${idx}`;
                    const isPackageCopied = copiedPackageRowId === rowKey;
                    const isDelivered = isRowDelivered(row);

                    return (
                      <tr
                        key={row._id || idx}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-850/50 transition-colors group ${
                          isPackageCopied ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''
                        }`}
                      >
                        {/* Sticky Row Index (#) */}
                        <td className={`py-2 px-3 w-12 min-w-[48px] max-w-[48px] text-center font-mono text-xs font-medium sticky left-0 z-10 border-r border-slate-100 dark:border-slate-800 ${
                          isPackageCopied
                            ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : 'bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-850 text-slate-400'
                        }`}>
                          {rowNumber}
                        </td>

                        {/* Columns */}
                        {columns.map((col) => {
                          const val = row[col.id];
                          const cellId = `${row._id || idx}_${col.id}`;
                          const isCopied = copiedCellId === cellId;
                          const strVal = val !== undefined && val !== null ? String(val) : '';
                          const isBarcodeCol = (col.label || col.id || '').trim().toUpperCase() === 'BARCODE';

                          // Format numbers if pure numeric
                          const isNumeric = col.type === 'number' || (!isNaN(Number(strVal)) && strVal.trim() !== '' && !strVal.startsWith('0') && strVal.length < 15);

                          // Specialized rendering for BARCODE column (Sticky freeze column on horizontal scroll):
                          // 1. Click on BARCODE text: Copy full package details
                          // 2. Click on Copy icon: Copy ONLY the BARCODE
                          if (isBarcodeCol) {
                            return (
                              <td
                                key={col.id}
                                className={`py-2 px-3 transition-all select-none relative sticky left-[48px] z-10 min-w-[170px] border-r border-slate-200/80 dark:border-slate-800 shadow-[4px_0_10px_-3px_rgba(0,0,0,0.08)] ${
                                  isPackageCopied
                                    ? 'bg-emerald-50 dark:bg-emerald-950'
                                    : isCopied
                                    ? 'bg-blue-50 dark:bg-blue-950'
                                    : 'bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-850'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  {isPackageCopied ? (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold font-mono bg-emerald-600 text-white shadow-2xs animate-in zoom-in-95 duration-150">
                                      <Check className="w-3.5 h-3.5" />
                                      <span>{strVal || '—'}</span>
                                      <span className="text-[11px] opacity-90 font-normal">Copied!</span>
                                    </span>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      {/* 1. Click directly on BARCODE -> Copy full package details */}
                                      <span
                                        onClick={() => handleCopyBarcodePackage(row, rowKey)}
                                        title="ចុចលើ BARCODE ដើម្បីចម្លងព័ត៌មានកញ្ចប់ទាំងអស់ (Tracking, Date, Shipper, Dest, Status, Desc)"
                                        className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer"
                                      >
                                        {strVal || '—'}
                                      </span>

                                      {/* 2. Click on Copy icon -> Copy ONLY the BARCODE */}
                                      <button
                                        type="button"
                                        onClick={(e) => handleCopyBarcodeOnly(strVal, cellId, e)}
                                        title="ចុចដើម្បីចម្លងតែលេខ BARCODE ប៉ុណ្ណោះ"
                                        className={`p-1 rounded transition cursor-pointer flex items-center justify-center ${
                                          isCopied
                                            ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60'
                                            : 'text-blue-500 hover:text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60'
                                        }`}
                                      >
                                        {isCopied ? (
                                          <Check className="w-3.5 h-3.5 text-emerald-600 animate-in zoom-in-75 duration-100" />
                                        ) : (
                                          <Copy className="w-3.5 h-3.5 text-blue-500 hover:text-blue-600 dark:text-blue-400" />
                                        )}
                                      </button>

                                      {/* 3. Distribution Alert: Clean status pill when recorded, subtle on hover when not */}
                                      {(() => {
                                        const cleanCode = (strVal || '').trim().toUpperCase();
                                        if (!cleanCode || cleanCode === '#N/A' || cleanCode === '—') return null;
                                        const distItem = distReportsByBarcode.get(cleanCode);
                                        
                                        if (distItem) {
                                          return (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenDistModal(cleanCode);
                                              }}
                                              title={`🚚 បានកត់ត្រាចែកចាយ៖ ${distItem.name || ''} (${distItem.date})\nចុចដើម្បីពិនិត្យ ឬកែប្រែ`}
                                              className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 transition cursor-pointer shadow-2xs shrink-0 hover:scale-110 active:scale-95"
                                            >
                                              <Check className="w-3 h-3 stroke-[2.5]" />
                                            </button>
                                          );
                                        }

                                        // 🚫 If row status is DELIVERED, do not allow adding distribution report!
                                        if (isDelivered) {
                                          return null;
                                        }

                                        return (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenDistModal(cleanCode);
                                            }}
                                            title="កត់ត្រារបាយការណ៍ចែកចាយ (Barcode, Name, Date)"
                                            className="opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 flex items-center gap-0.5 cursor-pointer shrink-0"
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

                          return (
                            <td
                              key={col.id}
                              onClick={() => handleCopyCell(cellId, val)}
                              title="ចុចដើម្បីចម្លង (Copy)"
                              className={`py-2 px-3 transition-colors cursor-pointer relative text-xs ${
                                isNumeric ? 'font-mono text-slate-800 dark:text-slate-200' : 'text-slate-700 dark:text-slate-300'
                              } ${isCopied ? 'bg-emerald-50 dark:bg-emerald-950/60' : ''}`}
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="truncate max-w-xs">{strVal || '—'}</span>
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
      ) : (
        /* CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {paginatedRows.length === 0 ? (
            <div className="col-span-full bg-white dark:bg-slate-900 rounded-2xl p-8 text-center text-slate-400 border border-slate-200 dark:border-slate-800">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="font-semibold text-xs">មិនមានទិន្នន័យដែលត្រូវនឹងពាក្យស្វែងរកឡើយ</p>
            </div>
          ) : (
            paginatedRows.map((row, idx) => {
              const rowNumber = (currentPage - 1) * pageSize + idx + 1;
              const rowKey = row._id || `row_${idx}`;
              const isPackageCopied = copiedPackageRowId === rowKey;
              const pkg = getRowPackageDetails(row);

              return (
                <div
                  key={row._id || idx}
                  className="bg-white dark:bg-slate-900 rounded-xl p-3.5 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-2 hover:border-blue-400 dark:hover:border-blue-600 transition"
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400">
                        #{rowNumber}
                      </span>
                      {pkg.barcode !== '—' && (
                        <div className="flex items-center gap-1.5">
                          {/* 1. Click on Barcode -> Package clipboard */}
                          <span
                            onClick={() => handleCopyBarcodePackage(row, rowKey)}
                            title="ចុចលើ BARCODE ដើម្បីចម្លងព័ត៌មានកញ្ចប់ទាំងអស់"
                            className={`font-mono text-xs font-bold underline cursor-pointer transition ${
                              isPackageCopied
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-blue-600 dark:text-blue-400 hover:text-blue-700'
                            }`}
                          >
                            {isPackageCopied ? `✓ ${pkg.barcode} Copied!` : pkg.barcode}
                          </span>

                          {/* 2. Click on Copy icon -> Barcode only */}
                          <button
                            type="button"
                            onClick={(e) => handleCopyBarcodeOnly(pkg.barcode, `${rowKey}_card_barcode`, e)}
                            title="ចុចដើម្បីចម្លងតែលេខ BARCODE ប៉ុណ្ណោះ"
                            className="p-1 text-blue-500 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {/* 3. Distribution alert pill on card if recorded */}
                          {(() => {
                            const cleanCode = (pkg.barcode || '').trim().toUpperCase();
                            const distItem = distReportsByBarcode.get(cleanCode);
                            if (distItem) {
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDistModal(cleanCode);
                                  }}
                                  title={`🚚 បានកត់ត្រាចែកចាយ៖ ${distItem.name || ''} (${distItem.date})\nចុចដើម្បីពិនិត្យ ឬកែប្រែ`}
                                  className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 transition cursor-pointer shadow-2xs shrink-0 hover:scale-110 active:scale-95"
                                >
                                  <Check className="w-3 h-3 stroke-[2.5]" />
                                </button>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {columns.slice(0, 8).map((col) => (
                      <div key={col.id} className="min-w-0">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold truncate">
                          {col.label || col.id}
                        </div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200 truncate mt-0.5">
                          {row[col.id] !== undefined && row[col.id] !== null ? String(row[col.id]) : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📄 6. FIXED MENU BOTTOM (FLOATING STICKY BOTTOM BAR WITH SUMMARY & PAGINATION) */}
      {/* ========================================================================= */}
      {sortedRows.length > 0 && (
        <div className={`sticky ${isFullScreen ? 'bottom-2 sm:bottom-3' : 'bottom-2 sm:bottom-3'} z-20 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-2 sm:p-2.5 transition-all mt-2.5`}>
          
          {/* Synced Horizontal Scrollbar with Quick Nav Buttons */}
          {hasHorizontalOverflow && viewMode === 'table' && (
            <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={scrollTableLeft}
                className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
                title="Scroll ទៅឆ្វេង (Scroll Left)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <div
                ref={footerScrollRef}
                onScroll={handleFooterScroll}
                className="flex-1 overflow-x-auto overflow-y-hidden h-2.5 sm:h-3 custom-scrollbar bg-slate-100/90 dark:bg-slate-800/70 rounded-full border border-slate-200/70 dark:border-slate-700/70 cursor-ew-resize hover:bg-slate-200/70 dark:hover:bg-slate-700/60 transition"
                title="អូស Scroll ឆ្វេង-ស្តាំ ដើម្បីរំកិលតារាង (Drag to scroll table)"
              >
                <div style={{ width: `${tableScrollWidth}px`, height: '1px' }} />
              </div>

              <button
                type="button"
                onClick={scrollTableRight}
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
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
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
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                title="ទំព័របន្ទាប់"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-mono font-bold text-[11px] border border-blue-200/50 dark:border-blue-800/50">
              {sortedRows.length} ជួរ
            </div>
          </div>

          {/* TABLET & DESKTOP VIEW (>= sm) */}
          <div className="hidden sm:flex flex-col lg:flex-row items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start w-full lg:w-auto">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200/60 dark:border-slate-800">
                <span className="font-mono text-blue-600 dark:text-blue-400 font-black">Σ</span>
                <span>សរុប:</span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {sortedRows.length.toLocaleString('en-US')}
                </span>
                <span className="text-[10px] text-slate-400 font-normal">ជួរ</span>
                {sortedRows.length !== rows.length && (
                  <span className="text-[9.5px] text-amber-600 dark:text-amber-400 font-normal">
                    (ពី {rows.length.toLocaleString('en-US')})
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
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                >
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
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="hidden sm:inline-block px-2 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    ដំបូង
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                        onClick={() => setCurrentPage(pageNum)}
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
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="p-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                    title="ទំព័របន្ទាប់"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
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
      )}

      {/* ========================================================================= */}
      {/* 🚚 DISTRIBUTION REPORT ALERT FORM MODAL */}

      {/* ========================================================================= */}
      <DistributionReportModal
        isOpen={isDistModalOpen}
        onClose={() => {
          setIsDistModalOpen(false);
          setDistPrefilledBarcode('');
        }}
        reports={distReports}
        onSaveReport={handleSaveDistReport}
        onDeleteReport={handleDeleteDistReport}
        currentUser={currentUser}
        permissions={permissions}
        currentUserName={currentUser?.name || ''}
        prefilledBarcode={distPrefilledBarcode}
        dataReportRows={rows}
        onNotify={notify}
      />
    </div>
  );
};

