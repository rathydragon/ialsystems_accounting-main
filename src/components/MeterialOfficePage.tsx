import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Boxes,
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
  RotateCcw,
  SlidersHorizontal,
  Package,
  Layers,
  HelpCircle,
  Save,
  Filter,
  Calendar,
  Hash,
  DollarSign
} from 'lucide-react';
import { AuthUser, AppSettings, UserPermission } from '../types';
import { SheetColumnDef, SheetRowData, parseGoogleSheetInput } from '../utils/googleSheetFetcher';
import {
  getInitialMeterialOfficeConfig,
  saveMeterialOfficeConfig,
  subscribeToMeterialOfficeConfig,
  getCachedMeterialOffice,
  fetchLiveMeterialOffice
} from '../services/meterialOfficeService';

interface MeterialOfficePageProps {
  currentUser: AuthUser | null;
  permissions?: UserPermission[];
  settings?: AppSettings;
  onUpdateSettings?: (newSettings: Partial<AppSettings>) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const STORAGE_KEY_AUTO_SYNC = 'accounting_meterial_office_auto_sync_enabled';
const STORAGE_KEY_SYNC_INTERVAL = 'accounting_meterial_office_sync_interval';

// Searchable Dropdown for Column Filters
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

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 max-w-[90vw] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
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

          <div className="max-h-56 overflow-y-auto custom-scrollbar p-1 text-xs">
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

export const MeterialOfficePage: React.FC<MeterialOfficePageProps> = ({
  currentUser,
  permissions,
  settings,
  onUpdateSettings,
  onShowToast
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';

  // 1. Sheet Config State
  const initialConfig = useMemo(() => getInitialMeterialOfficeConfig(), []);
  const [sheetUrl, setSheetUrl] = useState<string>(() => {
    return (settings?.meterialOfficeSheetUrl && settings.meterialOfficeSheetUrl.trim())
      ? settings.meterialOfficeSheetUrl.trim()
      : initialConfig.sheetUrl;
  });
  const [sheetName, setSheetName] = useState<string>(() => {
    return (settings?.meterialOfficeSheetName && settings.meterialOfficeSheetName.trim())
      ? settings.meterialOfficeSheetName.trim()
      : (initialConfig.sheetName || '');
  });

  const [tempSheetUrl, setTempSheetUrl] = useState<string>(sheetUrl);
  const [tempSheetName, setTempSheetName] = useState<string>(sheetName);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(!sheetUrl);
  const [showHelpGuide, setShowHelpGuide] = useState<boolean>(false);

  // 2. Data State
  const cached = useMemo(() => getCachedMeterialOffice(), []);
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
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [copiedCellId, setCopiedCellId] = useState<string | null>(null);

  // Full Screen Handler with Native Browser Fullscreen API Support
  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement && !isFullScreen) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      setIsFullScreen(true);
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullScreen(false);
    }
  }, [isFullScreen]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullScreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

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

  // Synced Horizontal Scrollbar
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
      tableContainerRef.current.scrollBy({ left: -320, behavior: 'smooth' });
    }
  };

  const scrollTableRight = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({ left: 320, behavior: 'smooth' });
    }
  };

  // Toast helper
  const notify = useCallback(
    (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
      if (onShowToast) {
        onShowToast(msg, type);
      }
    },
    [onShowToast]
  );

  // Subscribe to real-time configuration from Firestore
  useEffect(() => {
    const unsubscribe = subscribeToMeterialOfficeConfig((config) => {
      if (config.sheetUrl && config.sheetUrl !== sheetUrl) {
        setSheetUrl(config.sheetUrl);
        setTempSheetUrl(config.sheetUrl);
      }
      if (config.sheetName !== undefined && config.sheetName !== sheetName) {
        setSheetName(config.sheetName || '');
        setTempSheetName(config.sheetName || '');
      }
    });
    return () => unsubscribe();
  }, [sheetUrl, sheetName]);

  // Load Data function
  const loadData = useCallback(
    async (isBackground = false) => {
      if (!sheetUrl.trim()) return;

      if (isBackground) {
        setIsSyncingInBackground(true);
      } else {
        setIsLoading(true);
      }
      setFetchError(null);

      try {
        const result = await fetchLiveMeterialOffice(sheetUrl, sheetName);
        if (result.success) {
          setColumns(result.columns);
          setRows(result.rows);
          setLastSyncedTime(new Date().toLocaleTimeString('km-KH'));
          if (!isBackground) {
            notify(`✓ បានទាញយកទិន្នន័យ Meterial_Office ជោគជ័យ (${result.rows.length} ជួរដេក)`, 'success');
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
    },
    [sheetUrl, sheetName, notify]
  );

  // Initial Fetch on mount or URL changes
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

    await saveMeterialOfficeConfig({
      sheetUrl: trimmedUrl,
      sheetName: trimmedName,
      updatedBy: currentUser?.name || currentUser?.email || 'admin'
    });

    if (onUpdateSettings) {
      onUpdateSettings({
        meterialOfficeSheetUrl: trimmedUrl,
        meterialOfficeSheetName: trimmedName
      });
    }

    notify('✓ បានរក្សាទុក Link Google Sheets ថ្មីសម្រាប់ Meterial_Office!', 'success');
  };

  // Direct Google Sheets Link
  const parsedSheet = useMemo(() => parseGoogleSheetInput(sheetUrl), [sheetUrl]);
  const directSheetUrl = useMemo(() => {
    if (parsedSheet.spreadsheetId) {
      return `https://docs.google.com/spreadsheets/d/${parsedSheet.spreadsheetId}/edit${parsedSheet.gid ? `#gid=${parsedSheet.gid}` : ''}`;
    }
    return sheetUrl;
  }, [parsedSheet, sheetUrl]);

  // Auto detect columns for filter dropdowns (columns with 2 to 40 distinct non-empty values)
  const filterableColumns = useMemo(() => {
    if (!columns.length || !rows.length) return [];
    const validCols: { col: SheetColumnDef; distinctValues: string[] }[] = [];

    for (const col of columns) {
      const distinctSet = new Set<string>();
      for (const row of rows) {
        const val = String(row[col.id] ?? '').trim();
        if (val) distinctSet.add(val);
        if (distinctSet.size > 50) break;
      }
      if (distinctSet.size >= 2 && distinctSet.size <= 45) {
        validCols.push({
          col,
          distinctValues: Array.from(distinctSet).sort((a, b) => a.localeCompare(b))
        });
      }
    }
    return validCols;
  }, [columns, rows]);

  // Filter & Search Logic
  const filteredRows = useMemo(() => {
    let result = rows;

    // 1. Column-specific filters
    Object.entries(columnFilters).forEach(([colId, filterVal]) => {
      if (filterVal && filterVal !== 'ALL') {
        result = result.filter((row) => String(row[colId] ?? '').trim() === filterVal);
      }
    });

    // 2. Global search across all columns
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((row) => {
        return Object.values(row).some((val) => {
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(q);
        });
      });
    }

    // 3. Sorting
    if (sortColumn) {
      result = [...result].sort((a, b) => {
        const valA = a[sortColumn];
        const valB = b[sortColumn];

        if (valA === valB) return 0;
        if (valA === null || valA === undefined || valA === '') return 1;
        if (valB === null || valB === undefined || valB === '') return -1;

        const numA = Number(valA);
        const numB = Number(valB);

        if (!isNaN(numA) && !isNaN(numB)) {
          return sortDirection === 'asc' ? numA - numB : numB - numA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        return sortDirection === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });
    }

    return result;
  }, [rows, columnFilters, searchQuery, sortColumn, sortDirection]);

  // Numeric column aggregations for KPI summary cards
  const numericSummaries = useMemo(() => {
    if (!columns.length || !filteredRows.length) return [];
    const summaries: { col: SheetColumnDef; sum: number; avg: number }[] = [];

    for (const col of columns) {
      if (col.type === 'number') {
        let sum = 0;
        let count = 0;
        for (const row of filteredRows) {
          const val = Number(row[col.id]);
          if (!isNaN(val)) {
            sum += val;
            count++;
          }
        }
        if (count > 0 && sum > 0) {
          summaries.push({
            col,
            sum,
            avg: Math.round((sum / count) * 100) / 100
          });
        }
      }
    }
    return summaries.slice(0, 3);
  }, [columns, filteredRows]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    if (pageSize >= 9999) return filteredRows;
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Reset to page 1 on search or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, columnFilters, pageSize]);

  // Sort handler
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

  // Copy cell text helper
  const handleCopyCell = (text: string, cellKey: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedCellId(cellKey);
    setTimeout(() => setCopiedCellId(null), 1500);
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (!filteredRows.length || !columns.length) {
      notify('មិនមានទិន្នន័យដើម្បី Export ឡើយ', 'error');
      return;
    }

    const headers = columns.map((c) => `"${(c.label || c.id).replace(/"/g, '""')}"`).join(',');
    const body = filteredRows
      .map((row) =>
        columns
          .map((col) => {
            const val = row[col.id] ?? '';
            return `"${String(val).replace(/"/g, '""')}"`;
          })
          .join(',')
      )
      .join('\n');

    const csvContent = '\uFEFF' + headers + '\n' + body;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Meterial_Office_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify('✓ បានទាញយក File CSV ជោគជ័យ', 'success');
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setColumnFilters({});
    setSortColumn(null);
    setSortDirection('asc');
    setCurrentPage(1);
    notify('បានកំណត់ការចម្រាញ់ឡើងវិញ', 'info');
  };

  const hasActiveFilters = Boolean(
    searchQuery.trim() || Object.values(columnFilters).some((v) => v && v !== 'ALL') || sortColumn
  );

  return (
    <div
      className={`w-full min-h-full space-y-3.5 sm:space-y-4 pb-24 lg:pb-12 transition-all duration-200 ${
        isFullScreen
          ? 'fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 p-2.5 sm:p-5 overflow-y-auto w-screen h-screen'
          : 'w-full'
      }`}
    >
      {/* Floating Exit Button in Fullscreen Mode */}
      {isFullScreen && (
        <div className="fixed top-3 right-4 z-50 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
          <button
            type="button"
            onClick={toggleFullScreen}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold shadow-xl border border-slate-700/80 flex items-center gap-1.5 transition active:scale-95 cursor-pointer backdrop-blur-md"
            title="ចេញពី Full Screen (ឬចុច Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
            <span>ចេញពី Full Screen (Esc)</span>
          </button>
        </div>
      )}

      {/* 1. Header Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Title & Stats */}
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white tracking-tight">
                  Meterial_Office
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-100 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800">
                  Google Sheets Report
                </span>
                {isSyncingInBackground && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-md animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Auto-syncing...
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                ទាញយក និងពិនិត្យរបាយការណ៍សម្ភារៈការិយាល័យពី Google Sheets (Live Data)
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Sync / Refresh */}
            <button
              type="button"
              onClick={() => loadData(false)}
              disabled={isLoading || !sheetUrl.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition disabled:opacity-50 cursor-pointer active:scale-95"
              title="ទាញទិន្នន័យថ្មីពី Google Sheets"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'កំពុងទាញ...' : 'ទាញទិន្នន័យ (Sync)'}</span>
            </button>

            {/* Auto-Sync Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsAutoSyncMenuOpen(!isAutoSyncMenuOpen)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  isAutoSyncEnabled
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
                title="កំណត់ Auto Sync"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {isAutoSyncEnabled ? `Auto (${countdown}s)` : 'Auto: បិទ'}
                </span>
                <ChevronDown className="w-3 h-3" />
              </button>

              {isAutoSyncMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl z-50 p-1.5 text-xs space-y-0.5">
                  <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Auto-Sync
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAutoSyncEnabled(false);
                      localStorage.setItem(STORAGE_KEY_AUTO_SYNC, 'false');
                      setIsAutoSyncMenuOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition cursor-pointer ${
                      !isAutoSyncEnabled ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span>បិទ (Off)</span>
                    {!isAutoSyncEnabled && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </button>
                  {[15, 30, 60, 300].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        setIsAutoSyncEnabled(true);
                        setSyncInterval(sec);
                        setCountdown(sec);
                        localStorage.setItem(STORAGE_KEY_AUTO_SYNC, 'true');
                        localStorage.setItem(STORAGE_KEY_SYNC_INTERVAL, String(sec));
                        setIsAutoSyncMenuOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition cursor-pointer ${
                        isAutoSyncEnabled && syncInterval === sec
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 font-bold'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span>រៀងរាល់ {sec >= 60 ? `${sec / 60} នាទី` : `${sec} វិនាទី`}</span>
                      {isAutoSyncEnabled && syncInterval === sec && (
                        <Check className="w-3.5 h-3.5 text-blue-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Direct Google Sheets Link */}
            {sheetUrl && (
              <a
                href={directSheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition cursor-pointer"
                title="បើកមើលក្នុង Google Sheets ដើម"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">បើក Sheets</span>
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>
            )}

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={!filteredRows.length}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-40 cursor-pointer"
              title="Export File CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Table View"
              >
                <Table2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Cards View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            {/* Config / Settings Modal Button */}
            <button
              type="button"
              onClick={() => {
                setTempSheetUrl(sheetUrl);
                setTempSheetName(sheetName);
                setIsConfigOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
              title="កំណត់ Link Google Sheets"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden md:inline">កំណត់ Link</span>
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={toggleFullScreen}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                isFullScreen
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800 font-bold'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title={isFullScreen ? 'ចេញពីពេញអេក្រង់ (Esc)' : 'ពេញអេក្រង់ (Full Screen)'}
            >
              {isFullScreen ? (
                <>
                  <Minimize2 className="w-4 h-4 text-amber-500" />
                  <span className="hidden sm:inline font-bold">បង្រួម</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4 text-slate-500" />
                  <span className="hidden sm:inline">ពេញអេក្រង់</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Google Sheets Link Config Modal / Slide-over */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    កំណត់ Google Sheets Link សម្រាប់ Meterial_Office
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    បញ្ចូល Link Google Sheets ដើម្បីទាញយកទិន្នន័យសម្ភារៈការិយាល័យ
                  </p>
                </div>
              </div>
              {sheetUrl && (
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Link Google Sheets (Spreadsheet URL) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={tempSheetUrl}
                    onChange={(e) => setTempSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1xxx.../edit#gid=0"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                  />
                  {tempSheetUrl && (
                    <button
                      type="button"
                      onClick={() => setTempSheetUrl('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  គាំទ្រគ្រប់ទម្រង់ Link (Google Sheet URL, Publish to Web CSV, ឬ Apps Script URL)
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  ឈ្មោះសន្លឹកកិច្ចការ (Sheet Tab Name) - <span className="font-normal text-slate-400">មិនបាច់ដាក់ក៏បាន (Optional)</span>
                </label>
                <input
                  type="text"
                  value={tempSheetName}
                  onChange={(e) => setTempSheetName(e.target.value)}
                  placeholder="ឧ. Meterial_Office ឬ Sheet1 (ទុកទទេដើម្បីទាញយក Tab ដំបូង)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                />
              </div>

              {/* Instructions Guide Toggle */}
              <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5">
                <button
                  type="button"
                  onClick={() => setShowHelpGuide(!showHelpGuide)}
                  className="flex items-center justify-between w-full text-slate-700 dark:text-slate-300 font-bold cursor-pointer text-xs"
                >
                  <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                    <HelpCircle className="w-4 h-4" />
                    របៀប Share Google Sheets ដើម្បីឱ្យទាញបាន 100%
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showHelpGuide ? 'rotate-180' : ''}`} />
                </button>

                {showHelpGuide && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-[11.5px] text-slate-600 dark:text-slate-400">
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-blue-600">1.</span>
                      <span>បើក Google Sheets របស់អ្នក រួចចុចប៊ូតុង <strong>Share</strong> (នៅខាងស្តាំលើ)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-blue-600">2.</span>
                      <span>នៅត្រង់ <em>General access</em> សូមប្តូរទៅជា <strong>Anyone with the link</strong> (អ្នកណាមានតំណក៏អាចមើលបាន) និងជ្រើស <strong>Viewer</strong></span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-blue-600">3.</span>
                      <span>ចុច <strong>Copy link</strong> រួចយកមក Paste ដាក់ក្នុងប្រអប់ខាងលើ ហើយចុច <strong>រក្សាទុក & ទាញទិន្នន័យ</strong></span>
                    </div>
                    <div className="flex items-start gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>ការរក្សាទុកនេះនឹង Sync ទៅ Firebase ដោយស្វ័យប្រវត្ត ដូច្នេះគ្រប់អ្នកប្រើប្រាស់ផ្សេងទៀតនៅលើ Vercel នឹងឃើញ Link នេះភ្លាមៗ!</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
              {sheetUrl && (
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  បោះបង់
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={!tempSheetUrl.trim()}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>រក្សាទុក & ទាញទិន្នន័យ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. KPI Summary & Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Total Records */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">ចំនួនជួរដេកសរុប</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">
            {rows.length.toLocaleString('en-US')}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {hasActiveFilters ? `ចម្រាញ់នៅសល់ ${filteredRows.length.toLocaleString('en-US')}` : 'ទិន្នន័យពី Sheets'}
          </div>
        </div>

        {/* Columns Count */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">ចំនួនជួរឈរ (Columns)</span>
            <Hash className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">
            {columns.length}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            បានរកឃើញដោយស្វ័យប្រវត្ត
          </div>
        </div>

        {/* Dynamic Numeric Metric Cards */}
        {numericSummaries.map(({ col, sum, avg }) => (
          <div
            key={col.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs"
          >
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-medium truncate" title={col.label || col.id}>
                {col.label || col.id}
              </span>
              <DollarSign className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white truncate">
              {sum.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              មធ្យមភាគ៖ {avg.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </div>
          </div>
        ))}

        {/* Last Synced */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">ម៉ោង Sync ចុងក្រោយ</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-base sm:text-lg font-black text-slate-800 dark:text-white truncate">
            {lastSyncedTime || (rows.length ? 'ទើបតែ Sync' : 'មិនទាន់ Sync')}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {parsedSheet.spreadsheetId ? `ID: ...${parsedSheet.spreadsheetId.slice(-6)}` : 'Google Sheets'}
          </div>
        </div>
      </div>

      {/* 4. Filter & Search Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Global Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ស្វែងរកក្នុង Meterial_Office (ឈ្មោះ, លេខកូដ, ប្រភេទ, ចំនួន, ...)"
              className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 transition cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>កំណត់ឡើងវិញ ({filteredRows.length}/{rows.length})</span>
            </button>
          )}
        </div>

        {/* Dynamic Categorical Column Filter Dropdowns */}
        {filterableColumns.length > 0 && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {filterableColumns.map(({ col, distinctValues }) => {
              const currentVal = columnFilters[col.id] || 'ALL';
              return (
                <SearchableFilterDropdown
                  key={col.id}
                  label={col.label || col.id}
                  value={currentVal}
                  options={distinctValues}
                  onChange={(val) => {
                    setColumnFilters((prev) => {
                      const next = { ...prev };
                      if (val === 'ALL') {
                        delete next[col.id];
                      } else {
                        next[col.id] = val;
                      }
                      return next;
                    });
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Error Banner if fetch failed */}
      {fetchError && (
        <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <h4 className="font-bold text-rose-800 dark:text-rose-300">
              មានបញ្ហាក្នុងការទាញទិន្នន័យពី Google Sheets
            </h4>
            <p className="text-rose-700 dark:text-rose-400 mt-0.5">
              {fetchError}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadData(false)}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] cursor-pointer"
              >
                ព្យាយាមម្តងទៀត
              </button>
              <button
                type="button"
                onClick={() => setIsConfigOpen(true)}
                className="px-3 py-1 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-lg font-bold text-[11px] cursor-pointer"
              >
                កែប្រែ Link ឡើងវិញ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Empty State / No Sheet Configured */}
      {!sheetUrl.trim() && (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4 my-8">
          <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-sm">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">
              មិនទាន់មាន Link Google Sheets សម្រាប់ Meterial_Office នៅឡើយទេ
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              សូមបញ្ចូល Link Google Sheets ដើម្បីទាញយកទិន្នន័យសម្ភារៈការិយាល័យមកបង្ហាញក្នុងប្រព័ន្ធនេះ។
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsConfigOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 cursor-pointer"
          >
            + បញ្ចូល Link Google Sheets
          </button>
        </div>
      )}

      {/* 7. Main Data Table or Cards View */}
      {sheetUrl.trim() && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden flex flex-col">
          {/* Top Info Bar of the Table */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <span>
                បង្ហាញ {filteredRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} ដល់{' '}
                {Math.min(currentPage * pageSize, filteredRows.length)} នៃ {filteredRows.length} ជួរដេក
              </span>
              {hasActiveFilters && (
                <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md">
                  (ចម្រាញ់ពីសរុប {rows.length})
                </span>
              )}
            </div>

            {/* Quick Scroll arrows for wide tables */}
            {hasHorizontalOverflow && viewMode === 'table' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={scrollTableLeft}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                  title="រំកិលទៅឆ្វេង"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={scrollTableRight}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                  title="រំកិលទៅស្តាំ"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Table Container */}
          {viewMode === 'table' ? (
            <div
              ref={tableContainerRef}
              onScroll={handleTableScroll}
              className={`overflow-x-auto overflow-y-auto custom-scrollbar relative ${
                isFullScreen ? 'max-h-[calc(100vh-210px)]' : 'max-h-[75vh]'
              }`}
            >
              <table className="w-full text-left border-collapse text-xs">
                {/* Sticky Header */}
                <thead className="bg-slate-100/90 dark:bg-slate-850/90 backdrop-blur-xs text-slate-700 dark:text-slate-200 sticky top-0 z-20 shadow-xs select-none">
                  <tr>
                    <th className="py-3 px-3 w-12 text-center font-bold border-b border-slate-200 dark:border-slate-800">
                      #
                    </th>
                    {columns.map((col) => {
                      const isSorted = sortColumn === col.id;
                      return (
                        <th
                          key={col.id}
                          onClick={() => handleSort(col.id)}
                          className="py-3 px-3.5 font-bold border-b border-slate-200 dark:border-slate-800 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition cursor-pointer whitespace-nowrap"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>{col.label || col.id}</span>
                            <span className="text-slate-400">
                              {isSorted ? (
                                sortDirection === 'asc' ? (
                                  <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                ) : (
                                  <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                )
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-40 hover:opacity-100" />
                              )}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={columns.length + 1}
                        className="py-12 text-center text-slate-400 text-xs"
                      >
                        {isLoading ? (
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                            <span>កំពុងទាញទិន្នន័យ...</span>
                          </div>
                        ) : (
                          'មិនមានទិន្នន័យស្របតាមលក្ខខណ្ឌចម្រាញ់ឡើយ'
                        )}
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, index) => {
                      const rowNum = (currentPage - 1) * pageSize + index + 1;
                      return (
                        <tr
                          key={row._id || index}
                          className="hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors group"
                        >
                          {/* Row Number */}
                          <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                            {rowNum}
                          </td>

                          {/* Data Columns */}
                          {columns.map((col) => {
                            const rawVal = row[col.id];
                            const strVal = rawVal !== null && rawVal !== undefined ? String(rawVal) : '';
                            const cellKey = `${row._id || index}_${col.id}`;
                            const isCopied = copiedCellId === cellKey;

                            return (
                              <td
                                key={col.id}
                                className="py-2.5 px-3.5 text-slate-700 dark:text-slate-200 whitespace-nowrap group/cell relative"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate max-w-xs">{strVal || '-'}</span>
                                  {strVal && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopyCell(strVal, cellKey)}
                                      className="opacity-0 group-hover/cell:opacity-100 transition p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                      title="Copy"
                                    >
                                      {isCopied ? (
                                        <Check className="w-3 h-3 text-emerald-500" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                  )}
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
          ) : (
            /* Cards View for mobile or alternative display */
            <div className={`p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5 overflow-y-auto custom-scrollbar ${
              isFullScreen ? 'max-h-[calc(100vh-210px)]' : 'max-h-[75vh]'
            }`}>
              {paginatedRows.length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-400 text-xs">
                  មិនមានទិន្នន័យស្របតាមលក្ខខណ្ឌចម្រាញ់ឡើយ
                </div>
              ) : (
                paginatedRows.map((row, index) => {
                  const rowNum = (currentPage - 1) * pageSize + index + 1;
                  return (
                    <div
                      key={row._id || index}
                      className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2 hover:border-blue-400 transition"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800 pb-2">
                        <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                          #{rowNum}
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        {columns.slice(0, 10).map((col) => {
                          const val = row[col.id];
                          return (
                            <div key={col.id} className="flex items-start justify-between gap-2">
                              <span className="text-slate-400 text-[11px] truncate">{col.label || col.id}:</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate text-right">
                                {val !== null && val !== undefined ? String(val) : '-'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Synced Bottom Horizontal Scrollbar */}
          {hasHorizontalOverflow && viewMode === 'table' && (
            <div
              ref={footerScrollRef}
              onScroll={handleFooterScroll}
              className="overflow-x-auto bg-slate-50 dark:bg-slate-950/90 border-t border-slate-200 dark:border-slate-800 py-1.5 px-3 custom-scrollbar"
              style={{ minHeight: '18px' }}
            >
              <div style={{ width: `${tableScrollWidth}px`, height: '1px' }} />
            </div>
          )}

          {/* Pagination Footer */}
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3 bg-white dark:bg-slate-900">
            {/* Page Size Selector */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>បង្ហាញ៖</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-white font-semibold cursor-pointer"
              >
                <option value={15}>15 ជួរ</option>
                <option value={25}>25 ជួរ</option>
                <option value={50}>50 ជួរ</option>
                <option value={100}>100 ជួរ</option>
                <option value={250}>250 ជួរ</option>
                <option value={10000}>ទាំងអស់ (All)</option>
              </select>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                title="ទំព័រមុន"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 px-2">
                ទំព័រ {currentPage} នៃ {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                title="ទំព័របន្ទាប់"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
