import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Boxes,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Sparkles,
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
  DollarSign,
  Eye,
  Link as LinkIcon,
  Smartphone,
  Laptop,
  CheckCheck,
  User,
  Truck,
  Navigation,
  CreditCard,
  Gauge,
  MapPin,
  Activity,
  Fuel,
  StickyNote,
  Tag
} from 'lucide-react';
import { AuthUser, AppSettings, UserPermission } from '../types';
import { GridHeadGutter, GridRowGutter, GridSelectionBar, useGridSelection, copyRowsAsTsv, exportRowsAsCsv } from './ui/DataGrid';
import { SheetColumnDef, SheetRowData, parseGoogleSheetInput } from '../utils/googleSheetFetcher';
import {
  getInitialMeterialOfficeConfig,
  saveMeterialOfficeConfig,
  subscribeToMeterialOfficeConfig,
  getCachedMeterialOffice,
  fetchLiveMeterialOffice
} from '../services/meterialOfficeService';
import { formatCsv, downloadCsv } from '../utils/csvHelper';
import { copyText } from '../utils/clipboard';
import { CountdownText, useCountdownStore } from './SyncCountdown';


interface MeterialOfficePageProps {
  currentUser: AuthUser | null;
  permissions?: UserPermission[];
  settings?: AppSettings;
  onUpdateSettings?: (newSettings: Partial<AppSettings>) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const STORAGE_KEY_AUTO_SYNC = 'accounting_meterial_office_auto_sync_enabled';
const STORAGE_KEY_SYNC_INTERVAL = 'accounting_meterial_office_sync_interval';
const STORAGE_KEY_VIEW_MODE = 'accounting_meterial_office_view_mode';

// Header styling shared by the toolbar controls so every button lines up at the same height
const HEADER_BTN =
  'inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold border transition cursor-pointer active:scale-95 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed';
const HEADER_BTN_NEUTRAL =
  'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 hover:border-slate-300 dark:hover:bg-slate-800';
const KPI_CHIP =
  'inline-flex items-center gap-1 h-7 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 whitespace-nowrap shrink-0';

// Helper to check if a value is a valid URL
const isValidUrl = (val: any): boolean => {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('www.');
};

// Format URL for anchor href
const formatUrlHref = (val: string): string => {
  const trimmed = val.trim();
  if (trimmed.startsWith('www.')) return `https://${trimmed}`;
  return trimmed;
};

// Check if a column represents an identifier (serial, card, phone, ID, code) rather than a summable financial metric
const isLikelyIdentifierCol = (colId: string, colLabel: string): boolean => {
  const combined = `${colId} ${colLabel}`.toLowerCase();
  return /id|serial|gps|phone|tel|code|barcode|card|pin|lat|long|imei|sn\b/i.test(combined);
};

// Searchable Dropdown for Column Filters with Responsive Alignment
interface SearchableFilterDropdownProps {
  label: string;
  allLabel?: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  align?: 'left' | 'right';
}

const SearchableFilterDropdown: React.FC<SearchableFilterDropdownProps> = ({
  label,
  allLabel,
  value,
  onChange,
  options,
  align = 'left'
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
        <span className="flex items-center gap-1.5 truncate">
          <span className="truncate">{label}</span>
          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
            ({options.length})
          </span>
          {isSelected && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 shrink-0 animate-pulse" />
          )}
        </span>
        {isSelected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('ALL');
            }}
            className="text-[11px] text-rose-500 hover:text-rose-700 dark:text-rose-400 font-bold hover:underline cursor-pointer"
            title="លុបការចម្រាញ់"
          >
            លុប
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setQuery('');
        }}
        className={`w-full min-h-[38px] px-3 py-1.5 rounded-xl text-xs border flex items-center justify-between gap-1.5 transition cursor-pointer text-left ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-400 dark:border-blue-600 text-blue-700 dark:text-blue-300 font-bold shadow-2xs'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
        }`}
      >
        <span className="truncate">
          {isSelected ? value : allLabel || `គ្រប់ ${label}`}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-blue-500' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute top-full mt-1.5 w-64 max-w-[85vw] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={`ស្វែងរក ${label}...`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-8 pr-7 h-8 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
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

          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1 text-xs">
            <button
              type="button"
              onClick={() => {
                onChange('ALL');
                setIsOpen(false);
              }}
              className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between text-left transition cursor-pointer mb-0.5 ${
                value === 'ALL'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 font-bold'
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
                    className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between text-left transition cursor-pointer truncate ${
                      isItemActive
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 font-bold'
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
                បង្ហាញ 150 នៃ {filteredOptions.length} (សូមវាយអក្សរដើម្បីស្វែងរក)
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
    return settings?.meterialOfficeSheetUrl && settings.meterialOfficeSheetUrl.trim()
      ? settings.meterialOfficeSheetUrl.trim()
      : initialConfig.sheetUrl;
  });
  const [sheetName, setSheetName] = useState<string>(() => {
    return settings?.meterialOfficeSheetName && settings.meterialOfficeSheetName.trim()
      ? settings.meterialOfficeSheetName.trim()
      : initialConfig.sheetName || '';
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
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_VIEW_MODE);
    if (saved === 'table' || saved === 'cards') return saved;
    // On small mobile screens (< 640px), default to cards view for superior readability
    if (typeof window !== 'undefined' && window.innerWidth < 640) return 'cards';
    return 'table';
  });

  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(false);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [copiedCellId, setCopiedCellId] = useState<string | null>(null);

  // Selected row for Detail Modal (Mobile / Tablet modal viewer)
  const [selectedRowDetail, setSelectedRowDetail] = useState<{
    row: SheetRowData;
    rowNumber: number;
    index: number;
  } | null>(null);

  // Save viewMode preference
  const handleSetViewMode = (mode: 'table' | 'cards') => {
    setViewMode(mode);
    localStorage.setItem(STORAGE_KEY_VIEW_MODE, mode);
  };

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
  const countdownStore = useCountdownStore(syncInterval);
  const setCountdown = countdownStore.set;
  const [isAutoSyncMenuOpen, setIsAutoSyncMenuOpen] = useState<boolean>(false);
  const autoSyncDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (autoSyncDropdownRef.current && !autoSyncDropdownRef.current.contains(e.target as Node)) {
        setIsAutoSyncMenuOpen(false);
      }
    };
    if (isAutoSyncMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isAutoSyncMenuOpen]);

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

  // Subscribe to real-time configuration from database
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

  const rowsRef = useRef<SheetRowData[]>([]);
  rowsRef.current = rows;
  const lastFingerprintRef = useRef<string>('');

  // Load Data function
  const loadData = useCallback(
    async (isBackground = false) => {
      if (!sheetUrl.trim()) return;

      if (isBackground) {
        setIsSyncingInBackground(true);
      } else {
        setIsLoading(true);
        setFetchError(null);
      }

      try {
        const result = await fetchLiveMeterialOffice(sheetUrl, sheetName);
        if (result.success) {
          const firstRow = result.rows[0];
          const lastRow = result.rows[result.rows.length - 1];
          const newFingerprint = `${result.rows.length}_${result.columns.length}_${firstRow?.id || firstRow?.barcode || ''}_${lastRow?.id || lastRow?.barcode || ''}`;
          const isChanged = !lastFingerprintRef.current || lastFingerprintRef.current !== newFingerprint || JSON.stringify(result.rows) !== JSON.stringify(rowsRef.current);

          if (!isBackground || isChanged) {
            const prevScrollTop = tableContainerRef.current?.scrollTop;
            const prevScrollLeft = tableContainerRef.current?.scrollLeft;

            setColumns(result.columns);
            setRows(result.rows);
            rowsRef.current = result.rows;
            lastFingerprintRef.current = newFingerprint;

            if (prevScrollTop !== undefined || prevScrollLeft !== undefined) {
              requestAnimationFrame(() => {
                if (tableContainerRef.current) {
                  if (prevScrollTop !== undefined) tableContainerRef.current.scrollTop = prevScrollTop;
                  if (prevScrollLeft !== undefined) tableContainerRef.current.scrollLeft = prevScrollLeft;
                }
              });
            }
          }

          setLastSyncedTime(new Date().toLocaleTimeString('km-KH'));
          if (!isBackground) {
            notify(`✓ បានទាញយកទិន្នន័យ Meterial_Office ជោគជ័យ (${result.rows.length} ជួរដេក)`, 'success');
          }
        } else {
          const errMsg = result.error || 'មិនអាចទាញយកទិន្នន័យពី Google Sheets បានឡើយ';
          if (!isBackground) {
            setFetchError(errMsg);
            notify(`កំហុស៖ ${errMsg}`, 'error');
          } else {
            console.warn('Auto-sync background check failed:', errMsg);
          }
        }
      } catch (err: any) {
        const errMsg = err?.message || 'Error fetching data';
        if (!isBackground) {
          setFetchError(errMsg);
          notify(`កំហុស៖ ${errMsg}`, 'error');
        } else {
          console.warn('Auto-sync background check error:', errMsg);
        }
      } finally {
        if (!isBackground) {
          setIsLoading(false);
        }
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
        }
        return prev <= 1 ? syncInterval : prev - 1;
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

  // Parsed Google Sheets reference (used for the sync tooltip)
  const parsedSheet = useMemo(() => parseGoogleSheetInput(sheetUrl), [sheetUrl]);

  // Auto detect columns for filter dropdowns (columns with 2 to 45 distinct non-empty values)
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

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    return Object.values(columnFilters).filter((v) => v && v !== 'ALL').length;
  }, [columnFilters]);

  // Numeric column aggregations for KPI summary cards
  // Filter out IDs, Serial numbers, Phone numbers, and GPS values that shouldn't be summed!
  const numericSummaries = useMemo(() => {
    if (!columns.length || !filteredRows.length) return [];
    const summaries: { col: SheetColumnDef; sum: number; avg: number }[] = [];

    for (const col of columns) {
      if (col.type === 'number' && !isLikelyIdentifierCol(col.id, col.label)) {
        let sum = 0;
        let count = 0;
        let hasAbnormallyLargeNumber = false;

        for (const row of filteredRows) {
          const val = Number(row[col.id]);
          if (!isNaN(val)) {
            // Numbers > 10,000,000 without decimal are usually barcodes or serials
            if (val > 10_000_000 && Number.isInteger(val)) {
              hasAbnormallyLargeNumber = true;
            }
            sum += val;
            count++;
          }
        }

        if (count > 0 && sum > 0 && !hasAbnormallyLargeNumber) {
          summaries.push({
            col,
            sum,
            avg: Math.round((sum / count) * 100) / 100
          });
        }
      }
    }
    return summaries.slice(0, 2);
  }, [columns, filteredRows]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    if (pageSize >= 9999) return filteredRows;
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const moSelection = useGridSelection(paginatedRows, (r: any, i: number) => (r._id || `row_${i}`) as string);
  const selectedMoMatrix = (): [string[], any[][]] => [
    columns.map((c: any) => c.label || c.id),
    moSelection.selectedRows.map((r: any) => columns.map((c: any) => r[c.id])),
  ];

  // Table layout: stack two adjacent "short" columns (all values ≤ 14 chars, no links) into one
  // 2-line column to save horizontal space. The first column stays alone (it is pinned).
  const tableColumnGroups = useMemo(() => {
    const SHORT_MAX = 14;
    const isShort = (col: (typeof columns)[number]) =>
      rows.every((r) => {
        const v = r[col.id];
        const s = v !== null && v !== undefined ? String(v).trim() : '';
        return s.length <= SHORT_MAX && !isValidUrl(s);
      });
    const shortFlags = columns.map((c, i) => i > 0 && isShort(c));
    const groups: (typeof columns)[] = [];
    for (let i = 0; i < columns.length; i++) {
      if (shortFlags[i] && shortFlags[i + 1]) {
        groups.push([columns[i], columns[i + 1]]);
        i++;
      } else {
        groups.push([columns[i]]);
      }
    }
    return groups;
  }, [columns, rows]);

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
  const handleCopyCell = (text: string, cellKey: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!text) return;
    copyText(text);
    setCopiedCellId(cellKey);
    setTimeout(() => setCopiedCellId(null), 1500);
  };

  const handleExportCSV = () => {
    if (!filteredRows.length || !columns.length) {
      notify('មិនមានទិន្នន័យដើម្បី Export ឡើយ', 'error');
      return;
    }

    const headers = columns.map((c) => c.label || c.id);
    const rows = filteredRows.map((row) => columns.map((col) => row[col.id] ?? ''));

    const csvContent = formatCsv(headers, rows);
    downloadCsv(`Meterial_Office_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
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
    searchQuery.trim() || activeFiltersCount > 0 || sortColumn
  );

  // Navigate next/prev in Detail Modal
  const handleNavigateDetail = (direction: 'prev' | 'next') => {
    if (!selectedRowDetail) return;
    const newIndex =
      direction === 'prev'
        ? Math.max(0, selectedRowDetail.index - 1)
        : Math.min(filteredRows.length - 1, selectedRowDetail.index + 1);

    setSelectedRowDetail({
      row: filteredRows[newIndex],
      rowNumber: newIndex + 1,
      index: newIndex
    });
  };

  // Detail modal keyboard shortcuts: ← / → switch record, Esc closes
  useEffect(() => {
    if (!selectedRowDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation(); // close only the modal, don't also exit full screen
        setSelectedRowDetail(null);
      } else if (e.key === 'ArrowLeft') handleNavigateDetail('prev');
      else if (e.key === 'ArrowRight') handleNavigateDetail('next');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <div
      className={`page-fill w-full min-h-full space-y-3 sm:space-y-4 pb-28 lg:pb-0 transition-all duration-200 ${
        isFullScreen
          ? 'fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 p-2 sm:p-5 overflow-y-auto w-screen h-screen'
          : 'w-full px-1 sm:px-2'
      }`}
    >
      {/* Floating Exit Button in Fullscreen Mode */}
      {isFullScreen && (
        <div className="fixed top-3 right-4 z-50 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
          <button
            type="button"
            onClick={toggleFullScreen}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900/95 hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold shadow-xl border border-slate-700/80 flex items-center gap-1.5 transition active:scale-95 cursor-pointer backdrop-blur-md"
            title="ចេញពី Full Screen (ឬចុច Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
            <span>ចេញពី Full Screen (Esc)</span>
          </button>
        </div>
      )}

      {/* 2. Google Sheets Link Config Modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    កំណត់ Google Sheets Link
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    បញ្ចូល Link Google Sheets ដើម្បីទាញយកទិន្នន័យ Meterial_Office
                  </p>
                </div>
              </div>
              {sheetUrl && (
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="space-y-3.5 text-xs">
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
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono"
                  />
                  {tempSheetUrl && (
                    <button
                      type="button"
                      onClick={() => setTempSheetUrl('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  គាំទ្រគ្រប់ទម្រង់តំណ (Google Sheet URL, Publish CSV, ឬ Web App)
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  ឈ្មោះសន្លឹកកិច្ចការ (Sheet Tab Name) - <span className="font-normal text-slate-400">មិនបាច់ដាក់ក៏បាន</span>
                </label>
                <input
                  type="text"
                  value={tempSheetName}
                  onChange={(e) => setTempSheetName(e.target.value)}
                  placeholder="ឧ. Meterial_Office ឬ Sheet1 (ទុកទទេដើម្បីទាញយក Tab ដំបូង)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                />
              </div>

              {/* Instructions Guide */}
              <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5">
                <button
                  type="button"
                  onClick={() => setShowHelpGuide(!showHelpGuide)}
                  className="flex items-center justify-between w-full text-slate-700 dark:text-slate-300 font-bold cursor-pointer text-xs"
                >
                  <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                    <HelpCircle className="w-4 h-4" />
                    របៀប Share Google Sheets ដើម្បីទាញបាន 100%
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showHelpGuide ? 'rotate-180' : ''}`} />
                </button>

                {showHelpGuide && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-[11.5px] text-slate-600 dark:text-slate-400">
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-blue-600">1.</span>
                      <span>បើក Google Sheets រួចចុចប៊ូតុង <strong>Share</strong> នៅខាងស្តាំលើ</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-blue-600">2.</span>
                      <span>នៅត្រង់ General access សូមប្តូរជា <strong>Anyone with the link</strong> និងជ្រើស <strong>Viewer</strong></span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-blue-600">3.</span>
                      <span>ចុច <strong>Copy link</strong> រួចយកមក Paste ដាក់ក្នុងប្រអប់ខាងលើ ហើយចុចរក្សាទុក</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
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

      {/* 1. Unified Header: brand + search + filters + actions, KPI strip, active filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl px-2.5 py-1.5 sm:px-3 shadow-2xs dark:shadow-none transition-all space-y-1.5">
        <div className="flex flex-wrap xl:flex-nowrap items-center gap-2">
          {/* Title & Live Status (last sync time on hover) */}
          <div
            className="flex items-center gap-2 min-w-0 shrink-0"
            title={`Live • Google Sheets • Sync ចុងក្រោយ: ${lastSyncedTime || (rows.length ? 'ទើបតែ Sync' : 'មិនទាន់ Sync')}${parsedSheet.spreadsheetId ? ` • Spreadsheet ID: ...${parsedSheet.spreadsheetId.slice(-6)}` : ''}`}
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-sm shadow-blue-500/25 shrink-0">
              <Boxes className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-sm font-black text-slate-900 dark:text-white tracking-tight whitespace-nowrap">
              Meterial_Office
            </h1>
            {isSyncingInBackground ? (
              <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" aria-label="Syncing..." />
            ) : (
              <span className="relative flex w-2 h-2 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
              </span>
            )}
          </div>

          {/* Search & filter toggle (own row on phone/tablet, inline on wide screens) */}
          <div className="order-last xl:order-none w-full xl:w-auto xl:flex-1 flex items-center gap-2 min-w-0">
            {/* Global Search Input */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ស្វែងរក (ឈ្មោះ, លេខកូដ, ប្រភេទ, ចំនួន, ...)"
                className="w-full h-8 pl-9 pr-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* Filter Toggle Button */}
            {filterableColumns.length > 0 && (
              <button
                type="button"
                onClick={() => setIsFilterExpanded(!isFilterExpanded)}
                className={`${HEADER_BTN} ${
                  isFilterExpanded || activeFiltersCount > 0
                    ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                    : HEADER_BTN_NEUTRAL
                }`}
                title="បិទ/បើកបញ្ជីចម្រាញ់"
              >
                <Filter className="w-3.5 h-3.5 text-blue-500" />
                <span className="hidden sm:inline">តម្រង</span>
                {activeFiltersCount > 0 ? (
                  <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold">
                    {activeFiltersCount}
                  </span>
                ) : (
                  <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-semibold">
                    {filterableColumns.length}
                  </span>
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                    isFilterExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>
            )}

            {/* Reset All Filters Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className={`${HEADER_BTN} text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-900 hover:bg-rose-100 dark:hover:bg-rose-900/60`}
                title="កំណត់ការចម្រាញ់ឡើងវិញ"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">កំណត់ឡើងវិញ</span>
              </button>
            )}
          </div>

          {/* KPI chips (own row on phone/tablet, inline on wide screens) */}
          <div className="order-last xl:order-none w-full xl:w-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 xl:max-w-[40%] text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span className={KPI_CHIP}>
              <Layers className="w-3.5 h-3.5 text-blue-500" />
              <span>ជួរដេក</span>
              <b className="font-bold tabular-nums text-slate-900 dark:text-white">{rows.length.toLocaleString('en-US')}</b>
              {hasActiveFilters && (
                <span className="text-blue-600 dark:text-blue-400">→ {filteredRows.length.toLocaleString('en-US')}</span>
              )}
            </span>
            <span className={KPI_CHIP}>
              <Hash className="w-3.5 h-3.5 text-emerald-500" />
              <span>ជួរឈរ</span>
              <b className="font-bold tabular-nums text-slate-900 dark:text-white">{columns.length}</b>
            </span>
            {numericSummaries.map(({ col, sum, avg }) => (
              <span
                key={col.id}
                className={KPI_CHIP}
                title={`${col.label || col.id} — មធ្យមភាគ៖ ${avg.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
              >
                <DollarSign className="w-3.5 h-3.5 text-violet-500" />
                <span>{col.label || col.id}</span>
                <b className="font-bold tabular-nums text-slate-900 dark:text-white">{sum.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <span>មធ្យម <span className="tabular-nums text-slate-700 dark:text-slate-300">{avg.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span></span>
              </span>
            ))}
          </div>

          {/* Action Bar */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 shrink-0">
            {/* Auto-Sync Dropdown */}
            <div className="relative flex items-center shrink-0" ref={autoSyncDropdownRef}>
              <button
                type="button"
                onClick={() => setIsAutoSyncMenuOpen(!isAutoSyncMenuOpen)}
                className={`${HEADER_BTN} ${
                  isAutoSyncEnabled
                    ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                    : HEADER_BTN_NEUTRAL
                }`}
                title="កំណត់ Auto Sync"
              >
                {isLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                )}
                <span className="whitespace-nowrap tabular-nums">
                  {isAutoSyncEnabled ? <CountdownText store={countdownStore} suffix="s" /> : 'Auto: បិទ'}
                </span>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isAutoSyncMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isAutoSyncMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl z-50 p-1.5 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Auto-Sync Interval
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAutoSyncEnabled(false);
                      localStorage.setItem(STORAGE_KEY_AUTO_SYNC, 'false');
                      setIsAutoSyncMenuOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-left transition cursor-pointer ${
                      !isAutoSyncEnabled
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 font-bold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
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
                      className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-left transition cursor-pointer ${
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

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={!filteredRows.length}
              className={`${HEADER_BTN} ${HEADER_BTN_NEUTRAL}`}
              title="Export CSV File"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden md:inline">Export</span>
            </button>

            {/* View Mode Toggle (iOS-style Segmented Control) */}
            <div className="flex items-center gap-0.5 h-8 bg-slate-100/80 dark:bg-slate-800/70 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-700 shrink-0">
              <button
                type="button"
                onClick={() => handleSetViewMode('table')}
                className={`flex items-center gap-1 h-7 px-2 rounded-md text-xs transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Table View (តារាង)"
              >
                <Table2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Table</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetViewMode('cards')}
                className={`flex items-center gap-1 h-7 px-2 rounded-md text-xs transition cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Cards View (កាតចល័ត)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>
          </div>
        </div>

        {/* Active Filter Pills Bar (Direct visibility of what's filtering the data) */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">កំពុងចម្រាញ់៖</span>

            {searchQuery.trim() && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-100/70 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-800 text-[11px]">
                <span>ពាក្យស្វែងរក: "{searchQuery}"</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="hover:text-blue-950 dark:hover:text-white p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {Object.entries(columnFilters).map(([colId, val]) => {
              if (!val || val === 'ALL') return null;
              const colDef = columns.find((c) => c.id === colId);
              const label = colDef?.label || colId;
              return (
                <span
                  key={colId}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold border border-slate-200 dark:border-slate-700 text-[11px]"
                >
                  <span>{label}: <strong>{val}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      setColumnFilters((prev) => {
                        const next = { ...prev };
                        delete next[colId];
                        return next;
                      });
                    }}
                    className="hover:text-rose-600 dark:hover:text-rose-400 p-0.5 cursor-pointer"
                    title={`លុបចម្រាញ់ ${label}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}

            <button
              type="button"
              onClick={handleResetFilters}
              className="text-[11px] text-rose-500 hover:text-rose-700 dark:text-rose-400 font-bold ml-1 hover:underline cursor-pointer"
            >
              លុបទាំងអស់
            </button>
          </div>
        )}

        {/* Collapsible Categorical Filter Dropdown Grid */}
        {isFilterExpanded && filterableColumns.length > 0 && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
              {filterableColumns.map(({ col, distinctValues }, index) => {
                const currentVal = columnFilters[col.id] || 'ALL';
                // Align right on columns at the right edge
                const isRightEdge = (index + 1) % 4 === 0 || (index + 1) % 6 === 0;

                return (
                  <SearchableFilterDropdown
                    key={col.id}
                    label={col.label || col.id}
                    value={currentVal}
                    options={distinctValues}
                    align={isRightEdge ? 'right' : 'left'}
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
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadData(false)}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs"
              >
                ព្យាយាមម្តងទៀត
              </button>
              <button
                type="button"
                onClick={() => setIsConfigOpen(true)}
                className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl font-bold text-xs cursor-pointer"
              >
                កែប្រែ Link ឡើងវិញ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Empty State / No Sheet Configured */}
      {!sheetUrl.trim() && (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto space-y-4 my-8">
          <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto shadow-sm">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white">
              មិនទាន់មាន Link Google Sheets នៅឡើយទេ
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

      {/* 7. Main Data Display: Table or Cards View */}
      {sheetUrl.trim() && (
        <div className="page-fill-body bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-xs overflow-hidden flex flex-col">
          {/* Top Bar of Data Container */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs bg-slate-50/50 dark:bg-slate-950/40">
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

            {/* Quick Horizontal Scroll Controls for Table Mode */}
            {hasHorizontalOverflow && viewMode === 'table' && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400 hidden sm:inline">រំកិលមើល៖</span>
                <button
                  type="button"
                  onClick={scrollTableLeft}
                  className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer shadow-2xs"
                  title="រំកិលទៅឆ្វេង"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={scrollTableRight}
                  className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer shadow-2xs"
                  title="រំកិលទៅស្តាំ"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {viewMode === 'table' && moSelection.count > 0 && (
            <div className="px-3 py-1.5">
              <GridSelectionBar
                count={moSelection.count}
                onCopy={() => copyRowsAsTsv(...selectedMoMatrix())}
                onExport={() => exportRowsAsCsv('material_office_selected', ...selectedMoMatrix())}
                onClear={moSelection.clear}
              />
            </div>
          )}

          {/* Table View (Optimized for PC & iPad, with pinned row numbers & sticky headers) */}
          {viewMode === 'table' ? (
            <div
              ref={tableContainerRef}
              onScroll={handleTableScroll}
              className={`page-fill-scroll overflow-x-auto overflow-y-auto custom-scrollbar relative ${
                isFullScreen ? 'max-h-[calc(100vh-220px)]' : 'max-h-[75vh]'
              }`}
            >
              {/* w-max: columns size to their content (scroll horizontally) instead of squeezing into "2AL-2…" */}
              <table className="sb-grid w-max min-w-full text-left">
                {/* Sticky Header */}
                <thead className="select-none">
                  <tr>
                    <GridHeadGutter
                      checked={moSelection.allChecked}
                      indeterminate={moSelection.someChecked}
                      onToggleAll={moSelection.toggleAll}
                    />
                    {tableColumnGroups.map((group, idx) => {
                      // Stacked header: two short columns, each label sortable on its own line
                      if (group.length === 2) {
                        return (
                          <th
                            key={group.map((c) => c.id).join('|')}
                            className="py-1.5 px-3.5 font-bold border-b border-slate-200 dark:border-slate-800 whitespace-nowrap"
                          >
                            {group.map((c, li) => {
                              const sorted = sortColumn === c.id;
                              return (
                                <div
                                  key={c.id}
                                  onClick={() => handleSort(c.id)}
                                  className={`flex items-center gap-1 cursor-pointer rounded px-1 -mx-1 hover:bg-slate-200/70 dark:hover:bg-slate-800/70 transition ${
                                    li === 1 ? 'text-[10.5px] font-semibold text-slate-500 dark:text-slate-400' : ''
                                  }`}
                                >
                                  <span>{c.label || c.id}</span>
                                  {sorted ? (
                                    sortDirection === 'asc' ? (
                                      <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                    ) : (
                                      <ArrowDown className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                    )
                                  ) : (
                                    <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />
                                  )}
                                </div>
                              );
                            })}
                          </th>
                        );
                      }

                      const col = group[0];
                      const isSorted = sortColumn === col.id;
                      const isFirstCol = idx === 0;

                      return (
                        <th
                          key={col.id}
                          onClick={() => handleSort(col.id)}
                          className={`py-3 px-3.5 font-bold border-b border-slate-200 dark:border-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-800/70 transition cursor-pointer whitespace-nowrap ${
                            isFirstCol
                              ? 'sticky left-12 z-30'
                              : ''
                          }`}
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
                                <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100" />
                              )}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                    <th className="py-3 px-3 text-center font-bold border-b border-slate-200 dark:border-slate-800 w-16">
                      មើល
                    </th>
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody>
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={columns.length + 2}
                        className="py-14 text-center text-slate-400 text-xs"
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
                      const globalIndex = (currentPage - 1) * pageSize + index;

                      return (
                        <tr
                          key={row._id || index}
                          onClick={() =>
                            setSelectedRowDetail({
                              row,
                              rowNumber: rowNum,
                              index: globalIndex
                            })
                          }
                          className={`group cursor-pointer ${moSelection.isSelected(moSelection.keys[index]) ? 'sb-selected' : ''}`}
                        >
                          {/* Checkbox + row number (Pinned sticky left) */}
                          <GridRowGutter
                            selected={moSelection.isSelected(moSelection.keys[index])}
                            rowNumber={rowNum}
                            onToggle={() => moSelection.toggle(moSelection.keys[index])}
                          />

                          {/* Data Columns */}
                          {tableColumnGroups.map((group, idx) => {
                            // Stacked cell: two short values on two lines
                            if (group.length === 2) {
                              return (
                                <td
                                  key={group.map((c) => c.id).join('|')}
                                  className="py-1.5 px-3.5 whitespace-nowrap leading-tight"
                                >
                                  {group.map((c, li) => {
                                    const v = row[c.id];
                                    const s = v !== null && v !== undefined ? String(v).trim() : '';
                                    return (
                                      <div
                                        key={c.id}
                                        title={`${c.label || c.id}: ${s || '-'}`}
                                        className={
                                          li === 0
                                            ? 'text-slate-700 dark:text-slate-200'
                                            : 'text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5'
                                        }
                                      >
                                        {s || '-'}
                                      </div>
                                    );
                                  })}
                                </td>
                              );
                            }

                            const col = group[0];
                            const rawVal = row[col.id];
                            const strVal = rawVal !== null && rawVal !== undefined ? String(rawVal).trim() : '';
                            const cellKey = `${row._id || index}_${col.id}`;
                            const isCopied = copiedCellId === cellKey;
                            const isUrl = isValidUrl(strVal);
                            const isFirstCol = idx === 0;

                            return (
                              <td
                                key={col.id}
                                className={`py-3 px-3.5 text-slate-700 dark:text-slate-200 whitespace-nowrap group/cell relative ${
                                  isFirstCol
                                    ? `sticky left-12 z-10 bg-white dark:bg-[#1c1c1c] group-hover:bg-slate-50 dark:group-hover:bg-[#262626] font-semibold text-slate-900 dark:text-white ${moSelection.isSelected(moSelection.keys[index]) ? '!bg-emerald-50 dark:!bg-[#1f2b24]' : ''}`
                                    : ''
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1.5">
                                  {isUrl ? (
                                    <a
                                      href={formatUrlHref(strVal)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 underline max-w-[220px]"
                                      title={strVal}
                                    >
                                      <LinkIcon className="w-3 h-3 shrink-0" />
                                      <span className="truncate">{strVal}</span>
                                    </a>
                                  ) : (
                                    <span className="block max-w-[280px] truncate" title={strVal.length > 30 ? strVal : undefined}>
                                      {strVal || '-'}
                                    </span>
                                  )}

                                  {strVal && (
                                    <button
                                      type="button"
                                      onClick={(e) => handleCopyCell(strVal, cellKey, e)}
                                      className="opacity-0 group-hover/cell:opacity-100 transition p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                      title="Copy cell text"
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

                          {/* Detail View Icon */}
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRowDetail({
                                  row,
                                  rowNumber: rowNum,
                                  index: globalIndex
                                });
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition cursor-pointer"
                              title="មើលព័ត៌មានលម្អិត"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* Cards View: Highly polished for Mobile and Tablet touch use */
            <div
              className={`page-fill-scroll p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-3.5 overflow-y-auto custom-scrollbar ${
                isFullScreen ? 'max-h-[calc(100vh-220px)]' : 'max-h-[75vh]'
              }`}
            >
              {paginatedRows.length === 0 ? (
                <div className="col-span-full py-14 text-center text-slate-400 text-xs">
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                      <span>កំពុងទាញទិន្នន័យ...</span>
                    </div>
                  ) : (
                    'មិនមានទិន្នន័យស្របតាមលក្ខខណ្ឌចម្រាញ់ឡើយ'
                  )}
                </div>
              ) : (
                paginatedRows.map((row, index) => {
                  const rowNum = (currentPage - 1) * pageSize + index + 1;
                  const globalIndex = (currentPage - 1) * pageSize + index;
                  const firstCol = columns[0];
                  const primaryTitle = firstCol ? String(row[firstCol.id] ?? '').trim() : '';

                  return (
                    <div
                      key={row._id || index}
                      onClick={() =>
                        setSelectedRowDetail({
                          row,
                          rowNumber: rowNum,
                          index: globalIndex
                        })
                      }
                      className="bg-white dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-3 hover:border-blue-400 dark:hover:border-blue-600 shadow-2xs hover:shadow-md transition-all duration-150 cursor-pointer group"
                    >
                      {/* Card Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono font-bold text-xs shrink-0">
                            #{rowNum}
                          </span>
                          {primaryTitle && (
                            <span className="font-bold text-slate-800 dark:text-white text-xs truncate">
                              {primaryTitle}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRowDetail({
                              row,
                              rowNumber: rowNum,
                              index: globalIndex
                            });
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          title="មើលលម្អិត"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Card Fields Preview */}
                      <div className="space-y-1.5 text-xs">
                        {columns.slice(1, 7).map((col) => {
                          const val = row[col.id];
                          const str = val !== null && val !== undefined ? String(val).trim() : '';
                          const isUrl = isValidUrl(str);

                          return (
                            <div key={col.id} className="flex items-start justify-between gap-2">
                              <span className="text-slate-400 text-[11px] truncate shrink-0 max-w-[40%]">
                                {col.label || col.id}:
                              </span>
                              {isUrl ? (
                                <a
                                  href={formatUrlHref(str)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-blue-600 dark:text-blue-400 hover:underline truncate text-right text-[11px] font-semibold"
                                >
                                  បើក Link ↗
                                </a>
                              ) : (
                                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate text-right text-[11.5px]">
                                  {str || '-'}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Card Footer indicator */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{columns.length} ព័ត៌មានលម្អិត</span>
                        <span className="text-blue-500 font-bold group-hover:underline">ចុចមើល ➔</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Synced Bottom Horizontal Scrollbar for Table View */}
          {hasHorizontalOverflow && viewMode === 'table' && (
            <div
              ref={footerScrollRef}
              onScroll={handleFooterScroll}
              className="overflow-x-auto bg-slate-50 dark:bg-slate-950/90 border-t border-slate-200 dark:border-slate-800 py-1.5 px-3 custom-scrollbar"
              style={{ minHeight: '16px' }}
            >
              <div style={{ width: `${tableScrollWidth}px`, height: '1px' }} />
            </div>
          )}

          {/* Pagination Footer (Mobile & Desktop Friendly) */}
          <div className="px-4 py-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3 bg-white dark:bg-slate-900">
            {/* Page Size Selector */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="hidden sm:inline">បង្ហាញ៖</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-white font-semibold cursor-pointer text-xs"
              >
                <option value={15}>15 ជួរ</option>
                <option value={25}>25 ជួរ</option>
                <option value={50}>50 ជួរ</option>
                <option value={100}>100 ជួរ</option>
                <option value={250}>250 ជួរ</option>
                <option value={10000}>ទាំងអស់ (All)</option>
              </select>
            </div>

            {/* Pagination Controls with Touch targets */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 cursor-pointer shadow-2xs"
                title="ទំព័រមុន"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 px-2 select-none">
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 cursor-pointer shadow-2xs"
                title="ទំព័របន្ទាប់"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Record Detail Slide-over Modal (Mobile & iPad friendly full-detail viewer) */}
      {selectedRowDetail && (() => {
        const row = selectedRowDetail.row;
        const valOf = (c?: SheetColumnDef) => (c ? String(row[c.id] ?? '').trim() : '');
        const findCol = (re: RegExp) => columns.find((c) => re.test(c.label || c.id));
        const titleCol = columns[0];
        const titleVal = valOf(titleCol);
        const plateCol = findCol(/model|plate|ផ្លាក/i);
        const statusCol = findCol(/^status$/i);
        const typeCols = columns.filter((c) => /^type$/i.test(c.label || c.id));
        const stationCol = findCol(/station|location|branch/i);
        const plateVal = valOf(plateCol);
        const statusVal = valOf(statusCol);
        const stationVal = valOf(stationCol);
        const typeVals = typeCols.map(valOf).filter((v) => v && v !== '-');
        const numericIds = new Set(numericSummaries.map((n) => n.col.id));
        const highlightCols = columns.filter((c) => numericIds.has(c.id) || /expire|expiry|ផុត/i.test(c.label || c.id));
        const bodyCols = columns.slice(1);
        const filledCount = columns.filter((c) => {
          const v = valOf(c);
          return v && v !== '-';
        }).length;
        const statusTone = /activ|ok|ready|ដំណើរការ/i.test(statusVal)
          ? 'bg-emerald-400'
          : /expir|inactiv|broken|ខូច|ផុត/i.test(statusVal)
          ? 'bg-rose-400'
          : 'bg-amber-300';
        const fieldIcon = (label: string) => {
          const l = label.toLowerCase();
          if (/name|handle|driver|ឈ្មោះ/.test(l)) return User;
          if (/model|plate|truck|vehicle/.test(l)) return Truck;
          if (/link|url/.test(l)) return LinkIcon;
          if (/gps|serial/.test(l)) return Navigation;
          if (/card|\bid\b/.test(l)) return CreditCard;
          if (/date|expire|check/.test(l)) return Calendar;
          if (/limit|amount|price|cost|total/.test(l)) return Gauge;
          if (/station|location|branch/.test(l)) return MapPin;
          if (/status/.test(l)) return Activity;
          if (/detail|fuel|diesel|gas/.test(l)) return Fuel;
          if (/note|remark/.test(l)) return StickyNote;
          if (/type/.test(l)) return Tag;
          return Hash;
        };

        return (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-5 animate-in fade-in duration-150"
          onClick={() => setSelectedRowDetail(null)}
        >
          <div
            className="bg-slate-50 dark:bg-slate-950 rounded-t-3xl sm:rounded-3xl max-w-2xl w-full shadow-2xl shadow-black/30 ring-1 ring-black/5 dark:ring-white/10 max-h-[94vh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Hero header */}
            <div className="relative shrink-0 px-5 pt-4 pb-10 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white overflow-hidden">
              <div className="absolute -top-16 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
              <div className="absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-cyan-300/20 blur-3xl pointer-events-none" />

              <div className="relative flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/15 ring-1 ring-white/20 text-[11px] font-semibold backdrop-blur-sm">
                  <Boxes className="w-3 h-3" />
                  <span className="font-mono">#{selectedRowDetail.rowNumber}</span>
                  <span className="opacity-60">•</span>
                  <span>{filledCount}/{columns.length} មានទិន្នន័យ</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedRowDetail(null)}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/25 ring-1 ring-white/20 transition cursor-pointer"
                  title="បិទ (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="relative mt-3 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-white/70">{titleCol?.label || titleCol?.id}</div>
                  <h3 className="text-xl sm:text-2xl font-black tracking-tight truncate">
                    {titleVal && titleVal !== '-' ? titleVal : 'មិនមានឈ្មោះ'}
                  </h3>
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {statusVal && statusVal !== '-' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white text-slate-800 text-[11px] font-bold shadow-sm">
                        <span className={`w-1.5 h-1.5 rounded-full ${statusTone}`} />
                        {statusVal}
                      </span>
                    )}
                    {typeVals.map((t) => (
                      <span key={t} className="px-2.5 py-0.5 rounded-full bg-white/15 ring-1 ring-white/25 text-[11px] font-semibold">
                        {t}
                      </span>
                    ))}
                    {stationVal && stationVal !== '-' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 ring-1 ring-white/25 text-[11px] font-semibold">
                        <MapPin className="w-3 h-3" />
                        {stationVal}
                      </span>
                    )}
                  </div>
                </div>

                {/* License-plate style badge */}
                {plateVal && plateVal !== '-' && (
                  <div className="hidden sm:block shrink-0 rounded-lg bg-white text-slate-900 ring-2 ring-slate-900/80 shadow-lg overflow-hidden text-center rotate-[-2deg]">
                    <div className="bg-blue-700 text-white text-[8px] font-bold tracking-[0.2em] px-3 py-0.5">CAMBODIA</div>
                    <div className="px-3 py-1 font-mono font-black text-lg tracking-wider">{plateVal}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Highlight tiles overlapping the hero */}
            {highlightCols.length > 0 && (
              <div className="relative -mt-6 px-4 sm:px-5 grid grid-cols-2 sm:grid-cols-3 gap-2 shrink-0">
                {highlightCols.slice(0, 3).map((c) => {
                  const v = valOf(c);
                  const Icon = fieldIcon(c.label || c.id);
                  const empty = !v || v === '-';
                  return (
                    <div key={c.id} className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200/80 dark:ring-slate-800 shadow-md shadow-slate-900/5 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                        <Icon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="truncate">{c.label || c.id}</span>
                      </div>
                      <div className={`mt-0.5 font-black font-mono truncate ${empty ? 'text-slate-300 dark:text-slate-600 text-base' : 'text-slate-900 dark:text-white text-lg'}`}>
                        {empty ? '—' : v}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Field list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-5 py-3">
              <div className="rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200/80 dark:ring-slate-800 overflow-hidden grid grid-cols-1 sm:grid-cols-2">
                {bodyCols.map((col) => {
                  const str = valOf(col);
                  const isUrl = isValidUrl(str);
                  const isEmpty = !str || str === '-';
                  const isWide = isUrl || str.length > 26;
                  const cellKey = `modal_${col.id}`;
                  const isCopied = copiedCellId === cellKey;
                  const Icon = fieldIcon(col.label || col.id);

                  return (
                    <div
                      key={col.id}
                      onClick={!isEmpty && !isUrl ? (e) => handleCopyCell(str, cellKey, e) : undefined}
                      title={!isEmpty && !isUrl ? 'ចុចដើម្បី Copy' : undefined}
                      className={`group/field flex items-center gap-3 px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800/80 sm:odd:border-r ${
                        isWide ? 'sm:col-span-2 sm:border-r-0' : ''
                      } ${!isEmpty && !isUrl ? 'cursor-copy hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30' : ''} transition`}
                    >
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isEmpty
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'
                            : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">{col.label || col.id}</div>
                        {isUrl ? (
                          <a
                            href={formatUrlHref(str)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[13px] text-blue-600 dark:text-blue-400 font-semibold hover:underline break-all"
                          >
                            <span>{str}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                          </a>
                        ) : (
                          <div
                            className={`text-[13px] break-words ${
                              isEmpty ? 'text-slate-300 dark:text-slate-600 italic' : 'font-semibold text-slate-900 dark:text-white'
                            }`}
                          >
                            {isEmpty ? 'គ្មានទិន្នន័យ' : str}
                          </div>
                        )}
                      </div>
                      {!isEmpty && !isUrl && (
                        <span className={`shrink-0 transition ${isCopied ? 'opacity-100' : 'opacity-0 group-hover/field:opacity-100'}`}>
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer navigation */}
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-5 py-3 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleNavigateDetail('prev')}
                  disabled={selectedRowDetail.index <= 0}
                  className="w-8 h-8 rounded-full ring-1 ring-slate-200 dark:ring-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center transition"
                  title="មុន (←)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 text-xs font-mono font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                  {selectedRowDetail.index + 1} / {filteredRows.length}
                </span>
                <button
                  type="button"
                  onClick={() => handleNavigateDetail('next')}
                  disabled={selectedRowDetail.index >= filteredRows.length - 1}
                  className="w-8 h-8 rounded-full ring-1 ring-slate-200 dark:ring-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center transition"
                  title="បន្ទាប់ (→)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="hidden sm:inline text-[10.5px] text-slate-400 ml-1">← → ប្តូរជួរ • Esc បិទ</span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRowDetail(null)}
                className="px-5 py-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/25 cursor-pointer transition active:scale-95"
              >
                បិទ
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};
