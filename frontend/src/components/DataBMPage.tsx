import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { 
  Database, 
  Search, 
  RefreshCw, 
  ExternalLink, 
  Download, 
  FileSpreadsheet, 
  Layers, 
  CheckCircle2, 
  AlertCircle, 
  Table2, 
  Copy, 
  Check, 
  Maximize2, 
  Minimize2, 
  ChevronLeft, 
  ChevronRight, 
  Settings, 
  Link as LinkIcon, 
  ArrowUpDown, 
  HelpCircle,
  X,
  SlidersHorizontal,
  FileText,
  Calendar,
  DollarSign,
  Hash,
  ShieldCheck,
  Globe,
  Lock,
  Coins,
  Clock,
  Filter,
  Sparkles,
  Zap,
  Activity,
  Eye,
  UserCheck,
  MapPin,
  RotateCcw,
  LayoutGrid,
  User,
  Truck,
  Banknote,
  CheckCheck,
  Undo2,
  ShoppingBag,
} from 'lucide-react';
import { AuthUser, AppSettings } from '../types';
import { isMasterAdmin } from '../services/userPermissionService';
import { 
  fetchGoogleSheetDataUniversal, 
  parseGoogleSheetInput, 
  SheetColumnDef, 
  SheetRowData 
} from '../utils/googleSheetFetcher';
import { 
  getInitialDataBMConfig, 
  saveDataBMConfig, 
  subscribeToDataBMConfig 
} from '../services/dataBMService';
import { formatCsv, downloadCsv } from '../utils/csvHelper';
import { GridHeadGutter, GridRowGutter, GridSelectionBar, useGridSelection, copyRowsAsTsv, exportRowsAsCsv } from './ui/DataGrid';
import PackageDetailModal from './ui/PackageDetailModal';
import { saveDisposableCache } from '../utils/safeStorage';
import { copyText } from '../utils/clipboard';
import { CountdownText, useCountdownStore } from './SyncCountdown';


interface DataBMPageProps {
  currentUser: AuthUser | null;
  settings: AppSettings;
  onUpdateSettings?: (newSettings: Partial<AppSettings>) => void;
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

// Sentinel option value for "verify is blank"
const VERIFY_EMPTY = '__VERIFY_EMPTY__';
const HAS_VALUE = '__HAS_VALUE__';
// Today filter key for the combined BUYMED + CLEAR + RETURN card
const TODAY_COMBINED = '__TODAY_COMBINED__';
// Status filter key for the "remaining" card (BUYMED, CLEAR and RETURN all empty)
const STATUS_REMAINING = '__STATUS_REMAINING__';

const STORAGE_KEY_BM_URL = 'accounting_data_bm_sheet_url';
const STORAGE_KEY_BM_SHEET_NAME = 'accounting_data_bm_sheet_name';
const STORAGE_KEY_BM_CACHED_DATA = 'accounting_data_bm_cached_rows';
const STORAGE_KEY_BM_CACHED_COLS = 'accounting_data_bm_cached_cols';
const STORAGE_KEY_BM_LAST_SYNC = 'accounting_data_bm_last_sync';
const STORAGE_KEY_BM_AUTO_SYNC = 'accounting_data_bm_auto_sync_enabled';
const STORAGE_KEY_BM_SYNC_INTERVAL = 'accounting_data_bm_sync_interval';


// Colors + icons for the summary cards (total, > 10 days, GOT COD, CLEAR, RETURN, BUYMED, VERIFY)
type StatCardTheme = { icon: React.ElementType; text: string; value: string; chip: string; active: string };
const STATUS_CARD_THEME: Record<string, StatCardTheme> = {
  remaining: {
    icon: Hash,
    text: 'text-amber-600 dark:text-amber-400',
    value: 'text-amber-700 dark:text-amber-300',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
    active: '!bg-amber-50 dark:!bg-amber-950/50 !border-amber-400 ring-2 ring-amber-400/40',
  },
  combined: {
    icon: Layers,
    text: 'text-slate-800 dark:text-slate-100',
    value: 'text-slate-900 dark:text-white',
    chip: 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900',
    active: '!bg-slate-100 dark:!bg-slate-800 !border-slate-500 ring-2 ring-slate-400/40',
  },
  delivery: {
    icon: Truck,
    text: 'text-indigo-600 dark:text-indigo-400',
    value: 'text-indigo-700 dark:text-indigo-300',
    chip: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300',
    active: '!bg-indigo-50 dark:!bg-indigo-950/50 !border-indigo-400 ring-2 ring-indigo-400/40',
  },
  total: {
    icon: DollarSign,
    text: 'text-blue-600 dark:text-blue-400',
    value: 'text-blue-700 dark:text-blue-300',
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300',
    active: '',
  },
  overdue: {
    icon: Clock,
    text: 'text-rose-600 dark:text-rose-400',
    value: 'text-rose-700 dark:text-rose-300',
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300',
    active: '!bg-rose-50 dark:!bg-rose-950/50 !border-rose-400 ring-2 ring-rose-400/40',
  },
  gotcod: {
    icon: Banknote,
    text: 'text-teal-600 dark:text-teal-400',
    value: 'text-teal-700 dark:text-teal-300',
    chip: 'bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300',
    active: '!bg-teal-50 dark:!bg-teal-950/50 !border-teal-400 ring-2 ring-teal-400/40',
  },
  clear: {
    icon: CheckCheck,
    text: 'text-sky-600 dark:text-sky-400',
    value: 'text-sky-700 dark:text-sky-300',
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300',
    active: '!bg-sky-50 dark:!bg-sky-950/50 !border-sky-400 ring-2 ring-sky-400/40',
  },
  return: {
    icon: Undo2,
    text: 'text-orange-600 dark:text-orange-400',
    value: 'text-orange-700 dark:text-orange-300',
    chip: 'bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300',
    active: '!bg-orange-50 dark:!bg-orange-950/50 !border-orange-400 ring-2 ring-orange-400/40',
  },
  buymed: {
    icon: ShoppingBag,
    text: 'text-violet-600 dark:text-violet-400',
    value: 'text-violet-700 dark:text-violet-300',
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300',
    active: '!bg-violet-50 dark:!bg-violet-950/50 !border-violet-400 ring-2 ring-violet-400/40',
  },
  verify: {
    icon: ShieldCheck,
    text: 'text-emerald-600 dark:text-emerald-400',
    value: 'text-emerald-700 dark:text-emerald-300',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300',
    active: '!bg-emerald-50 dark:!bg-emerald-950/50 !border-emerald-400 ring-2 ring-emerald-400/40',
  },
};

export const DataBMPage: React.FC<DataBMPageProps> = ({
  currentUser,
  settings,
  onUpdateSettings,
  onShowToast
}) => {
  // Check if current user has Admin privileges (Admin Role or Master Admin)
  const isAdmin = useMemo(() => {
    return currentUser?.role === 'ADMIN' || (currentUser?.email ? isMasterAdmin(currentUser.email) : false);
  }, [currentUser]);

  const DEFAULT_BM_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1C-CYb14ZM146RiD87yjS_rxGmWk1hiB4jkoTDT6O-I8/edit#gid=764804833';
  const DEFAULT_BM_SHEET_NAME = 'Sort_pending';

  // 1. Initial Config (from AppSettings -> LocalStorage -> Env -> Permanent Default)
  const initialUrl = useMemo(() => {
    return (settings.dataBmSheetUrl && settings.dataBmSheetUrl.trim()) 
      || localStorage.getItem(STORAGE_KEY_BM_URL) 
      || (import.meta as any).env?.VITE_DATA_BM_SHEET_URL 
      || DEFAULT_BM_SHEET_URL;
  }, [settings.dataBmSheetUrl]);

  const initialSheetName = useMemo(() => {
    return (settings.dataBmSheetName && settings.dataBmSheetName.trim()) 
      || localStorage.getItem(STORAGE_KEY_BM_SHEET_NAME) 
      || (import.meta as any).env?.VITE_DATA_BM_SHEET_NAME 
      || DEFAULT_BM_SHEET_NAME;
  }, [settings.dataBmSheetName]);

  const [sheetUrl, setSheetUrl] = useState<string>(initialUrl);
  const [tempSheetUrl, setTempSheetUrl] = useState<string>(initialUrl);

  const [sheetName, setSheetName] = useState<string>(initialSheetName);
  const [tempSheetName, setTempSheetName] = useState<string>(initialSheetName);

  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [showHelpGuide, setShowHelpGuide] = useState<boolean>(false);
  const [fetchMethodUsed, setFetchMethodUsed] = useState<string | null>(null);

  // 2. Data State
  const [columns, setColumns] = useState<SheetColumnDef[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_BM_CACHED_COLS);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });

  const [rows, setRows] = useState<SheetRowData[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_BM_CACHED_DATA);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });

  const [lastSynced, setLastSynced] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_BM_LAST_SYNC) || '';
  });

  // 3. UI State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRestrictedWarning, setIsRestrictedWarning] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('ASC');
  const [copiedCellId, setCopiedCellId] = useState<string | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [scrollMode, setScrollMode] = useState<'AUTO_FIT' | 'CONTAINER'>(() => {
    const saved = localStorage.getItem('accounting_data_bm_scroll_mode');
    return (saved === 'CONTAINER' || saved === 'AUTO_FIT') ? (saved as 'AUTO_FIT' | 'CONTAINER') : 'AUTO_FIT'; // Default to AUTO_FIT (Height Auto Fit & Full Page)
  });
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [selectedDetailRow, setSelectedDetailRow] = useState<SheetRowData | null>(null);

  // 4. Column Filters State (Delivery Date Start & End, HANDLE BY, DEST, Overdue > 10 Days)
  const [deliveryStartDate, setDeliveryStartDate] = useState<string>('');
  const [deliveryEndDate, setDeliveryEndDate] = useState<string>('');
  const [selectedHandleBy, setSelectedHandleBy] = useState<string>('');
  const [selectedDest, setSelectedDest] = useState<string>('');
  const [selectedVerify, setSelectedVerify] = useState<string>(''); // '' = all, VERIFY_EMPTY = blank only
  // Dropdown filters for GOT COD / BUYMED / CLEAR / RETURN, keyed by column id ('' = all, VERIFY_EMPTY = blank, HAS_VALUE = not blank)
  const [statusSelects, setStatusSelects] = useState<Record<string, string>>({});
  const [isOverdue10Only, setIsOverdue10Only] = useState<boolean>(false);
  // Status card filter: column id of GOT COD / CLEAR / RETURN / BUYMED / verify (rows with a value)
  const [statusFilterColId, setStatusFilterColId] = useState<string | null>(null);
  // Today card filter: column id whose date equals today (Delivery Date / GOT COD / CLEAR / RETURN / BUYMED)
  const [todayFilterColId, setTodayFilterColId] = useState<string | null>(null);

  // 5. Real-Time Auto Sync & Change Watcher State
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_BM_AUTO_SYNC);
    return saved !== null ? saved === 'true' : true; // Default ON
  });
  const [syncInterval, setSyncInterval] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_BM_SYNC_INTERVAL);
    return saved ? Number(saved) : 10; // Default 10 seconds
  });
  const countdownStore = useCountdownStore(syncInterval);
  const setCountdown = countdownStore.set;
  const [isSyncingInBackground, setIsSyncingInBackground] = useState<boolean>(false);
  const [isAutoSyncMenuOpen, setIsAutoSyncMenuOpen] = useState<boolean>(false);

  const isFetchingRef = useRef<boolean>(false);
  const rowsRef = useRef<SheetRowData[]>(rows);
  const lastFingerprintRef = useRef<string>(JSON.stringify(rows));
  const autoSyncMenuRef = useRef<HTMLDivElement>(null);

  // Synced Horizontal Scrollbar Refs & State
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

  // Sync rowsRef and fingerprint with rows state
  useEffect(() => {
    rowsRef.current = rows;
    if (!lastFingerprintRef.current || lastFingerprintRef.current === '[]') {
      lastFingerprintRef.current = JSON.stringify(rows);
    }
  }, [rows]);

  // Click outside to close auto-sync menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (autoSyncMenuRef.current && !autoSyncMenuRef.current.contains(e.target as Node)) {
        setIsAutoSyncMenuOpen(false);
      }
    };
    if (isAutoSyncMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAutoSyncMenuOpen]);

  const notify = useCallback((msg: string, type: 'success' | 'error' | 'info') => {
    if (onShowToast) {
      onShowToast(msg, type);
    }
  }, [onShowToast]);

  // Escape key listener for fullscreen mode and detail modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedDetailRow) {
          setSelectedDetailRow(null);
        } else if (isFullScreen) {
          setIsFullScreen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen, selectedDetailRow]);

  // Phones open in card view (the table needs sideways scrolling there); the toggle can still switch to the table
  useEffect(() => {
    if (window.innerWidth < 640) setViewMode('cards');
  }, []);

  // Real-time Cloud Database synchronization across devices
  useEffect(() => {
    const unsubscribe = subscribeToDataBMConfig((remoteConfig) => {
      if (remoteConfig.sheetUrl && remoteConfig.sheetUrl !== sheetUrl) {
        setSheetUrl(remoteConfig.sheetUrl);
        setTempSheetUrl(remoteConfig.sheetUrl);
        if (remoteConfig.sheetName !== undefined) {
          setSheetName(remoteConfig.sheetName);
          setTempSheetName(remoteConfig.sheetName);
        }
      }
    });
    return () => unsubscribe();
  }, [sheetUrl]);

  // Parsed Sheet Info (handles ID, GID, Pub URLs)
  const parsedSheet = useMemo(() => {
    return parseGoogleSheetInput(sheetUrl);
  }, [sheetUrl]);

  const spreadsheetId = parsedSheet.spreadsheetId;

  // Google Sheets Direct Web URL
  const googleSheetWebUrl = useMemo(() => {
    if (!spreadsheetId) return '';
    let url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    if (parsedSheet.gid) {
      url += `#gid=${parsedSheet.gid}`;
    }
    return url;
  }, [spreadsheetId, parsedSheet.gid]);

  // Fetch Data using Universal Multi-Tier Fetcher (supports Silent Auto-Sync & Real-Time Change Watching)
  const fetchGoogleSheetData = useCallback(async (
    targetUrl = sheetUrl, 
    targetSheetName = sheetName, 
    isSilent = false
  ) => {
    const trimmedUrl = targetUrl.trim();
    if (!trimmedUrl) {
      if (!isSilent) {
        setErrorMessage('សូមបញ្ចូល Google Spreadsheet URL ឬ ID!');
        notify('សូមបញ្ចូល Google Spreadsheet URL ឬ ID!', 'error');
      }
      return;
    }

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (!isSilent) {
      setIsLoading(true);
      setErrorMessage(null);
      setIsRestrictedWarning(false);
    } else {
      setIsSyncingInBackground(true);
    }

    try {
      const result = await fetchGoogleSheetDataUniversal(trimmedUrl, targetSheetName);

      if (!result.success) {
        if (!isSilent) {
          if (result.isRestricted) {
            setIsRestrictedWarning(true);
            setErrorMessage(result.error || 'Google Sheet នេះស្ថិតក្នុងស្ថានភាព "មានកំណត់ (Restricted)"។ សូម Share ជា "Anyone with the link can view"');
            notify('Google Sheet ស្ថិតក្នុងស្ថានភាព Restricted! សូម Share ជា "Anyone with the link can view"', 'error');
          } else {
            setErrorMessage(result.error || 'ពុំអាចទាញយកទិន្នន័យពី Google Sheets បានទេ');
            notify(result.error || 'ពុំអាចទាញយកទិន្នន័យពី Google Sheets បានទេ', 'error');
          }
        }
        return;
      }

      const newFingerprint = JSON.stringify(result.rows);
      const oldFingerprint = lastFingerprintRef.current;
      const hasChanged = Boolean(oldFingerprint && oldFingerprint !== '[]' && newFingerprint !== oldFingerprint);
      const nowStr = new Date().toLocaleString('km-KH');

      if (hasChanged) {
        // Watch Action on Change: real-time change detected!
        const prevScrollTop = tableContainerRef.current?.scrollTop;
        const prevScrollLeft = tableContainerRef.current?.scrollLeft;

        setColumns(result.columns);
        setRows(result.rows);
        rowsRef.current = result.rows;
        lastFingerprintRef.current = newFingerprint;
        setFetchMethodUsed(result.fetchedVia);
        setLastSynced(nowStr);

        if (prevScrollTop !== undefined || prevScrollLeft !== undefined) {
          requestAnimationFrame(() => {
            if (tableContainerRef.current) {
              if (prevScrollTop !== undefined) tableContainerRef.current.scrollTop = prevScrollTop;
              if (prevScrollLeft !== undefined) tableContainerRef.current.scrollLeft = prevScrollLeft;
            }
          });
        }
      } else if (!isSilent) {
        // Manual refresh or initial load
        setColumns(result.columns);
        setRows(result.rows);
        rowsRef.current = result.rows;
        lastFingerprintRef.current = newFingerprint;
        setFetchMethodUsed(result.fetchedVia);
        setLastSynced(nowStr);
        notify(`ទាញយកទិន្នន័យជោគជ័យ! (${result.rows.length.toLocaleString('en-US')} ជួរ - ${result.fetchedVia})`, 'success');
      } else {
        // Silent background check without data change -> quietly update timestamp
        setLastSynced(nowStr);
        setFetchMethodUsed(result.fetchedVia);
      }

      // Cache locally
      localStorage.setItem(STORAGE_KEY_BM_CACHED_COLS, JSON.stringify(result.columns));
      saveDisposableCache(STORAGE_KEY_BM_CACHED_DATA, JSON.stringify(result.rows));
      localStorage.setItem(STORAGE_KEY_BM_LAST_SYNC, nowStr);

    } catch (err: any) {
      if (!isSilent) {
        console.error('Data_BM fetch error:', err);
        const msg = err.message || 'មិនអាចទាញយកទិន្នន័យពី Google Sheets បានទេ';
        setErrorMessage(msg);
        notify(msg, 'error');
      }
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
      setIsSyncingInBackground(false);
    }
  }, [sheetUrl, sheetName, notify]);

  // Real-Time Background Polling Loop (Watch Action on Change)
  useEffect(() => {
    if (!isAutoSyncEnabled || !sheetUrl.trim()) return;

    setCountdown(syncInterval);

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchGoogleSheetData(sheetUrl, sheetName, true);
          return syncInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoSyncEnabled, syncInterval, sheetUrl, sheetName, fetchGoogleSheetData]);

  // Watch action on window focus / tab visibility change (throttled to at least 25 seconds)
  useEffect(() => {
    if (!isAutoSyncEnabled || !sheetUrl.trim()) return;

    let lastFocusFetchTime = 0;
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusFetchTime > 25000) {
        lastFocusFetchTime = now;
        fetchGoogleSheetData(sheetUrl, sheetName, true);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastFocusFetchTime > 25000) {
          lastFocusFetchTime = now;
          fetchGoogleSheetData(sheetUrl, sheetName, true);
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAutoSyncEnabled, sheetUrl, sheetName, fetchGoogleSheetData]);

  // Auto-sync when settings are received from central Google Sheets or App.tsx
  useEffect(() => {
    if (settings.dataBmSheetUrl && settings.dataBmSheetUrl.trim()) {
      const u = settings.dataBmSheetUrl.trim();
      const n = (settings.dataBmSheetName && settings.dataBmSheetName.trim()) || '';
      if (u !== sheetUrl) {
        setSheetUrl(u);
        setTempSheetUrl(u);
        setSheetName(n);
        setTempSheetName(n);
        localStorage.setItem(STORAGE_KEY_BM_URL, u);
        if (n) localStorage.setItem(STORAGE_KEY_BM_SHEET_NAME, n);
        setIsConfigOpen(false);
        if (rows.length === 0) {
          fetchGoogleSheetData(u, n);
        }
      }
    }
  }, [settings.dataBmSheetUrl, settings.dataBmSheetName]);

  // Active query to central Google Sheets "Settings" tab on load if sheetUrl is not yet set
  useEffect(() => {
    if (!sheetUrl.trim() && settings.webAppUrl?.trim()) {
      const targetUrl = settings.webAppUrl.trim().includes('script.google.com')
        ? `/api/sheet-proxy?url=${encodeURIComponent(`${settings.webAppUrl.trim()}?action=get_settings&t=${Date.now()}`)}`
        : `${settings.webAppUrl.trim()}?action=get_settings&t=${Date.now()}`;
      fetch(targetUrl)
        .then(r => r.json())
        .then(res => {
          if (res?.data?.dataBmSheetUrl && res.data.dataBmSheetUrl.trim()) {
            const u = res.data.dataBmSheetUrl.trim();
            const n = res.data.dataBmSheetName ? res.data.dataBmSheetName.trim() : '';
            setSheetUrl(u);
            setTempSheetUrl(u);
            setSheetName(n);
            setTempSheetName(n);
            localStorage.setItem(STORAGE_KEY_BM_URL, u);
            if (n) localStorage.setItem(STORAGE_KEY_BM_SHEET_NAME, n);
            setIsConfigOpen(false);
            fetchGoogleSheetData(u, n);
          }
        })
        .catch(() => {});
    }
  }, [sheetUrl, settings.webAppUrl, fetchGoogleSheetData]);

  // Auto fetch on first mount if URL is already available but no cached rows
  useEffect(() => {
    if (sheetUrl.trim() && rows.length === 0) {
      fetchGoogleSheetData(sheetUrl, sheetName);
    }
  }, [sheetUrl, sheetName, rows.length, fetchGoogleSheetData]);

  // Handle Save Configuration (Strictly restricted to Admin - Persists permanently across all browsers)
  const handleSaveConfig = async () => {
    if (!isAdmin) {
      notify('⚠️ ទាមទារសិទ្ធិ Admin ដើម្បីកែប្រែ ឬកំណត់ Link Google Sheets នេះ!', 'error');
      return;
    }

    const trimmedUrl = tempSheetUrl.trim();
    const trimmedName = tempSheetName.trim();

    if (!trimmedUrl) {
      notify('សូមបញ្ចូល Link Google Sheets!', 'error');
      return;
    }

    setSheetUrl(trimmedUrl);
    setSheetName(trimmedName);

    localStorage.setItem(STORAGE_KEY_BM_URL, trimmedUrl);
    localStorage.setItem(STORAGE_KEY_BM_SHEET_NAME, trimmedName);

    // 1. Sync to Cloud Database (real-time database across all devices)
    await saveDataBMConfig({
      sheetUrl: trimmedUrl,
      sheetName: trimmedName,
      updatedBy: currentUser?.email || 'admin'
    });

    // 2. Sync to global AppSettings (updates App.tsx state & local storage)
    if (onUpdateSettings) {
      onUpdateSettings({
        dataBmSheetUrl: trimmedUrl,
        dataBmSheetName: trimmedName
      });
    }

    // 3. Sync to central Google Sheets "Settings" tab (via Web App API)
    if (settings.webAppUrl?.trim()) {
      const targetUrl = settings.webAppUrl.trim();
      const payload = {
        action: 'save_settings',
        settings: {
          dataBmSheetUrl: trimmedUrl,
          dataBmSheetName: trimmedName
        },
        user: currentUser?.email
      };

      try {
        await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
          mode: 'no-cors'
        });
        // Backup GET request
        fetch(`${targetUrl}?action=save_settings&settings=${encodeURIComponent(JSON.stringify(payload.settings))}&t=${Date.now()}`).catch(() => {});
      } catch (err) {
        console.warn('Could not sync Data BM setting to Google Sheets:', err);
      }
    }

    setIsConfigOpen(false);
    notify('បានរក្សាទុក និង Sync ការកំណត់ទៅគ្រប់ Browser ជោគជ័យ!', 'success');

    // Automatically trigger fetch
    fetchGoogleSheetData(trimmedUrl, trimmedName);
  };

  // Identify special filter columns dynamically (Delivery Date, HANDLE BY, DEST)
  const deliveryDateCol = useMemo(() => {
    return columns.find(c => {
      const l = c.label.toLowerCase().trim();
      return (l.includes('delivery') && l.includes('date')) || l.includes('delivery') || l.includes('date');
    });
  }, [columns]);

  const handleByCol = useMemo(() => {
    return columns.find(c => {
      const l = c.label.toLowerCase().trim();
      return l.includes('handle') || l.includes('handler');
    });
  }, [columns]);

  const destCol = useMemo(() => {
    return columns.find(c => {
      const l = c.label.toLowerCase().trim();
      return l.includes('dest');
    });
  }, [columns]);

  // RE-DEST column (used by the destination filter dropdown); falls back to DEST
  const reDestCol = useMemo(() => {
    const norm = (v: string) => v.toLowerCase().replace(/[s_-]/g, '');
    return columns.find(c => norm(c.label) === 'redest')
      || columns.find(c => norm(c.label).includes('redest'))
      || destCol;
  }, [columns, destCol]);

  const awbnCol = useMemo(() => {
    return columns.find(c => {
      const l = c.label.toLowerCase().trim();
      return l.includes('awb') || l.includes('tracking') || l.includes('code');
    }) || columns[1] || columns[0];
  }, [columns]);

  const receiverCol = useMemo(() => {
    return columns.find(c => {
      const l = c.label.toLowerCase().trim();
      return l.includes('rec') || l.includes('cust') || l.includes('client') || l.includes('name');
    });
  }, [columns]);

  const usdCol = useMemo(() => {
    return columns.find(c => {
      const l = (c.id + ' ' + c.label).toLowerCase();
      return l.includes('usd') || l.includes('$');
    });
  }, [columns]);

  const khmCol = useMemo(() => {
    return columns.find(c => {
      const l = (c.id + ' ' + c.label).toLowerCase();
      return l.includes('khm') || l.includes('khr') || l.includes('riel') || l.includes('៛');
    });
  }, [columns]);

  // "verify" column: rows already verified (e.g. "Paid") are excluded from the > 10 days totals
  const verifyCol = useMemo(() => {
    return columns.find(c => c.label.toLowerCase().trim() === 'verify')
      || columns.find(c => c.label.toLowerCase().includes('verify'));
  }, [columns]);

  // Status columns shown as cards (GOT COD, CLEAR, RETURN, BUYMED, verify)
  const statusCols = useMemo(() => {
    const norm = (v: string) => v.toLowerCase().replace(/[^a-z]/g, '');
    const find = (key: string) => columns.find(c => norm(c.label).startsWith(key));
    return [
      { key: 'gotcod', label: 'GOT COD', col: find('gotcod') },
      { key: 'buymed', label: 'BUYMED', col: find('buymed') },
      { key: 'clear', label: 'CLEAR', col: find('clear') },
      { key: 'return', label: 'RETURN', col: find('return') },
      { key: 'verify', label: 'VERIFY', col: verifyCol },
    ].filter((s): s is { key: string; label: string; col: SheetColumnDef } => Boolean(s.col));
  }, [columns, verifyCol]);

  // Determine responsive visibility class for each column:
  // - Mobile (< 768px): Show only AWBN, DELIVERY DATE, HANDLE BY
  // - iPad (768px - 1279px): Show only AWBN, DELIVERY DATE, USD, KHM, HANDLE BY
  // - Desktop (>= 1280px): Show all columns
  const getColumnVisibilityClass = useCallback((col: SheetColumnDef) => {
    const l = col.label.toLowerCase().trim();
    const id = col.id;

    // 1. AWBN -> Show on Mobile, iPad, Desktop
    const isAwbn = (awbnCol && awbnCol.id === id) || l.includes('awb') || l.includes('tracking');
    if (isAwbn) {
      return '';
    }

    // 2. Delivery Date -> Show on Mobile, iPad, Desktop
    const isDelivery = (deliveryDateCol && deliveryDateCol.id === id) || (l.includes('delivery') && l.includes('date')) || l.includes('delivery');
    if (isDelivery) {
      return '';
    }

    // 3. Handle By -> Show on Mobile, iPad, Desktop
    const isHandleBy = (handleByCol && handleByCol.id === id) || l.includes('handle') || l.includes('handler');
    if (isHandleBy) {
      return '';
    }

    // 4. USD -> Show on iPad and Desktop, hidden on Mobile
    const isUsd = (usdCol && usdCol.id === id) || l.includes('usd') || l.includes('$');
    if (isUsd) {
      return 'hidden md:table-cell';
    }

    // 5. KHM -> Show on iPad and Desktop, hidden on Mobile
    const isKhm = (khmCol && khmCol.id === id) || l.includes('khm') || l.includes('khr') || l.includes('riel') || l.includes('៛');
    if (isKhm) {
      return 'hidden md:table-cell';
    }

    // 6. All other columns (RECEIVER NAME, RECEIVER ADDRESS, TRANSFER TO, DEST, etc.)
    // Show ONLY on Desktop (>= 1280px), hidden on Mobile & iPad
    return 'hidden xl:table-cell';
  }, [awbnCol, deliveryDateCol, handleByCol, usdCol, khmCol]);

  // Robust helper to normalize any date format ('22-Sep-2026', '2026-09-22', '22/09/2026', etc.) to 'YYYY-MM-DD'
  const toIsoDateString = useCallback((raw: any): string | null => {
    if (!raw) return null;
    const str = String(raw).trim();
    if (!str) return null;

    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const parts = str.split(/[-/.\s]+/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const y = parts[0];
        const m = parts[1].padStart(2, '0');
        const d = parts[2].padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      if (parts[2].length === 4) {
        const y = parts[2];
        const mIdx = monthNames.indexOf(parts[1].toLowerCase().slice(0, 3));
        if (mIdx !== -1) {
          const m = String(mIdx + 1).padStart(2, '0');
          const d = parts[0].padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
        const p0 = parseInt(parts[0], 10);
        const p1 = parseInt(parts[1], 10);
        if (!isNaN(p0) && !isNaN(p1)) {
          const m = String(p1).padStart(2, '0');
          const d = String(p0).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
      }
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return null;
  }, []);

  // Check difference in days from today (positive = past date/days ago, negative = future date)
  const getDaysDiffFromToday = useCallback((rawDate: any): number | null => {
    const iso = toIsoDateString(rawDate);
    if (!iso) return null;
    const parts = iso.split('-');
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const delivery = new Date(y, m, d);
    if (isNaN(delivery.getTime())) return null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffMs = today.getTime() - delivery.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }, [toIsoDateString]);

  // Unique options for HANDLE BY
  const handleByOptions = useMemo(() => {
    if (!handleByCol) return [];
    const set = new Set<string>();
    rows.forEach(r => {
      const val = r[handleByCol.id];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        set.add(String(val).trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, handleByCol]);

  // Unique options for DEST
  const destOptions = useMemo(() => {
    if (!reDestCol) return [];
    const set = new Set<string>();
    rows.forEach(r => {
      const val = r[reDestCol.id];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        set.add(String(val).trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, reDestCol]);

  // Unique options for verify (plus a "blank" option)
  const verifyOptions = useMemo(() => {
    if (!verifyCol) return [];
    const set = new Set<string>();
    rows.forEach(r => {
      const val = String(r[verifyCol.id] ?? '').trim();
      if (val !== '') set.add(val);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, verifyCol]);

  // Dropdown filter columns + their unique values (GOT COD, BUYMED, CLEAR, RETURN)
  const statusSelectCols = useMemo(() => {
    return statusCols
      .filter(st => st.key !== 'verify')
      .map(st => {
        const set = new Set<string>();
        rows.forEach(r => {
          const v = String(r[st.col.id] ?? '').trim();
          if (v !== '') set.add(v);
        });
        return { ...st, options: Array.from(set).sort((a, b) => a.localeCompare(b)) };
      });
  }, [statusCols, rows]);

  const hasActiveFilters = Boolean(
    Object.values(statusSelects).some(Boolean) ||
    deliveryStartDate || 
    deliveryEndDate || 
    selectedHandleBy || 
    selectedDest || 
    selectedVerify || 
    searchTerm.trim() ||
    isOverdue10Only ||
    statusFilterColId ||
    todayFilterColId
  );

  const handleClearAllFilters = () => {
    setDeliveryStartDate('');
    setDeliveryEndDate('');
    setSelectedHandleBy('');
    setSelectedDest('');
    setSelectedVerify('');
    setStatusSelects({});
    setSearchTerm('');
    setIsOverdue10Only(false);
    setStatusFilterColId(null);
    setTodayFilterColId(null);
    setCurrentPage(1);
  };

  // Base Filtered Rows (Search, Delivery Date Range, HANDLE BY, DEST)
  const baseFilteredRows = useMemo(() => {
    let result = [...rows];

    // 1. Search filter across all columns
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(row => {
        return Object.entries(row).some(([key, val]) => {
          if (key.startsWith('_')) return false;
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(term);
        });
      });
    }

    // 2. Delivery Date Range filter (Start Date & End Date)
    if (deliveryDateCol && (deliveryStartDate || deliveryEndDate)) {
      result = result.filter(row => {
        const rowIso = toIsoDateString(row[deliveryDateCol.id]);
        if (!rowIso) return false;
        if (deliveryStartDate && rowIso < deliveryStartDate) return false;
        if (deliveryEndDate && rowIso > deliveryEndDate) return false;
        return true;
      });
    }

    // 3. HANDLE BY filter
    if (handleByCol && selectedHandleBy) {
      result = result.filter(row => String(row[handleByCol.id] || '').trim().toLowerCase() === selectedHandleBy.trim().toLowerCase());
    }

    // 4. DEST filter
    if (reDestCol && selectedDest) {
      result = result.filter(row => String(row[reDestCol.id] || '').trim().toLowerCase() === selectedDest.trim().toLowerCase());
    }

    // 5. verify filter
    if (verifyCol && selectedVerify) {
      result = result.filter(row => {
        const v = String(row[verifyCol.id] ?? '').trim();
        return selectedVerify === VERIFY_EMPTY ? v === '' : v.toLowerCase() === selectedVerify.trim().toLowerCase();
      });
    }

    // 6. GOT COD / BUYMED / CLEAR / RETURN dropdown filters
    Object.entries(statusSelects).forEach(([colId, sel]) => {
      if (!sel) return;
      result = result.filter(row => {
        const v = String(row[colId] ?? '').trim();
        if (sel === VERIFY_EMPTY) return v === '';
        if (sel === HAS_VALUE) return v !== '';
        return v.toLowerCase() === String(sel).trim().toLowerCase();
      });
    });

    return result;
  }, [
    statusSelects,
    rows,
    searchTerm, 
    deliveryStartDate, 
    deliveryEndDate, 
    selectedHandleBy, 
    selectedDest, 
    selectedVerify, 
    verifyCol, 
    deliveryDateCol, 
    handleByCol, 
    reDestCol, 
    toIsoDateString
  ]);

  // Statistics for Delivery Date > 10 days
  const overdue10Stats = useMemo(() => {
    if (!deliveryDateCol) {
      return { count: 0, totalUSD: 0, totalKHM: 0, hasDeliveryDateCol: false };
    }

    let count = 0;
    let totalUSD = 0;
    let totalKHM = 0;

    baseFilteredRows.forEach(row => {
      const diff = getDaysDiffFromToday(row[deliveryDateCol.id]);
      const isVerified = verifyCol ? String(row[verifyCol.id] ?? '').trim() !== '' : false;
      if (diff !== null && diff > 10 && !isVerified) {
        count++;

        if (usdCol) {
          const uVal = row[usdCol.id];
          if (uVal !== undefined && uVal !== null && String(uVal).trim() !== '') {
            const num = Number(String(uVal).replace(/,/g, '').replace(/\$/g, '').trim());
            if (!isNaN(num)) totalUSD += num;
          }
        }

        if (khmCol) {
          const kVal = row[khmCol.id];
          if (kVal !== undefined && kVal !== null && String(kVal).trim() !== '') {
            const num = Number(String(kVal).replace(/,/g, '').replace(/[៛,\s]/g, '').trim());
            if (!isNaN(num)) totalKHM += num;
          }
        }
      }
    });

    return {
      count,
      totalUSD,
      totalKHM,
      hasDeliveryDateCol: true
    };
  }, [deliveryDateCol, usdCol, khmCol, verifyCol, baseFilteredRows, getDaysDiffFromToday]);

  // Counts + USD/KHM totals of rows that have a value in each status column
  const statusStats = useMemo(() => {
    const toNum = (v: any) => {
      const n = Number(String(v ?? '').replace(/[,$៛\s]/g, ''));
      return isNaN(n) ? 0 : n;
    };
    return statusCols.map(s => {
      let count = 0;
      let totalUSD = 0;
      let totalKHM = 0;
      baseFilteredRows.forEach(row => {
        if (String(row[s.col.id] ?? '').trim() === '') return;
        count++;
        if (usdCol) totalUSD += toNum(row[usdCol.id]);
        if (khmCol) totalKHM += toNum(row[khmCol.id]);
      });
      return { ...s, count, totalUSD, totalKHM };
    });
  }, [statusCols, baseFilteredRows, usdCol, khmCol]);

  // "Remaining" = total minus rows that have BUYMED, CLEAR or RETURN (rows where all three are empty)
  const remainingColIds = useMemo(
    () => statusCols.filter(st => ['buymed', 'clear', 'return'].includes(st.key)).map(st => st.col.id),
    [statusCols]
  );
  const isRemainingRow = useCallback(
    (row: any) => remainingColIds.every(id => String(row[id] ?? '').trim() === ''),
    [remainingColIds]
  );
  const remainingStats = useMemo(() => {
    const toNum = (v: any) => {
      const n = Number(String(v ?? '').replace(/[,$៛\s]/g, ''));
      return isNaN(n) ? 0 : n;
    };
    let count = 0;
    let totalUSD = 0;
    let totalKHM = 0;
    baseFilteredRows.forEach(row => {
      if (!isRemainingRow(row)) return;
      count++;
      if (usdCol) totalUSD += toNum(row[usdCol.id]);
      if (khmCol) totalKHM += toNum(row[khmCol.id]);
    });
    return { count, totalUSD, totalKHM };
  }, [baseFilteredRows, isRemainingRow, usdCol, khmCol]);

  // Today's date as YYYY-MM-DD (local time)
  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Summary of rows whose date column is today
  const todayStats = useMemo(() => {
    const toNum = (v: any) => {
      const n = Number(String(v ?? '').replace(/[,$៛\s]/g, ''));
      return isNaN(n) ? 0 : n;
    };
    // Use the "(date)" columns (e.g. "BUYMED(date)"), not the plain status columns (e.g. "BUYMED" = "USD")
    const norm = (v: string) => v.toLowerCase().replace(/[^a-z]/g, '');
    const findDateCol = (key: string) =>
      columns.find(c => norm(c.label).startsWith(key) && norm(c.label).includes('date'));
    const cols = [
      ...(deliveryDateCol ? [{ key: 'delivery', label: 'DELIVERY', col: deliveryDateCol }] : []),
      ...[
        { key: 'gotcod', label: 'GOT COD' },
        { key: 'buymed', label: 'BUYMED' },
        { key: 'clear', label: 'CLEAR' },
        { key: 'return', label: 'RETURN' },
      ].map(x => ({ ...x, col: findDateCol(x.key) }))
        .filter((x): x is { key: string; label: string; col: SheetColumnDef } => Boolean(x.col)),
    ];
    return cols.map(st => {
      let count = 0;
      let totalUSD = 0;
      let totalKHM = 0;
      baseFilteredRows.forEach(row => {
        if (toIsoDateString(row[st.col.id]) !== todayIso) return;
        count++;
        if (usdCol) totalUSD += toNum(row[usdCol.id]);
        if (khmCol) totalKHM += toNum(row[khmCol.id]);
      });
      return { ...st, count, totalUSD, totalKHM };
    });
  }, [columns, deliveryDateCol, baseFilteredRows, usdCol, khmCol, toIsoDateString, todayIso]);

  // Combined today total: rows where BUYMED, CLEAR or RETURN date is today (each row counted once)
  const todayCombinedColIds = useMemo(
    () => todayStats.filter(st => ['buymed', 'clear', 'return'].includes(st.key)).map(st => st.col.id),
    [todayStats]
  );
  const isTodayCombinedRow = useCallback(
    (row: any) => todayCombinedColIds.some(id => toIsoDateString(row[id]) === todayIso),
    [todayCombinedColIds, toIsoDateString, todayIso]
  );
  const todayCombinedStats = useMemo(() => {
    const toNum = (v: any) => {
      const n = Number(String(v ?? '').replace(/[,$៛\s]/g, ''));
      return isNaN(n) ? 0 : n;
    };
    let count = 0;
    let totalUSD = 0;
    let totalKHM = 0;
    if (todayCombinedColIds.length > 0) {
      baseFilteredRows.forEach(row => {
        if (!isTodayCombinedRow(row)) return;
        count++;
        if (usdCol) totalUSD += toNum(row[usdCol.id]);
        if (khmCol) totalKHM += toNum(row[khmCol.id]);
      });
    }
    return { count, totalUSD, totalKHM };
  }, [todayCombinedColIds, baseFilteredRows, isTodayCombinedRow, usdCol, khmCol]);

  // Filtered and Sorted Rows (Auto updates summaries and table dynamically)
  const filteredAndSortedRows = useMemo(() => {
    let result = [...baseFilteredRows];

    // Filter for Delivery Date > 10 days if toggled via card
    if (isOverdue10Only && deliveryDateCol) {
      result = result.filter(row => {
        const diff = getDaysDiffFromToday(row[deliveryDateCol.id]);
        const isVerified = verifyCol ? String(row[verifyCol.id] ?? '').trim() !== '' : false;
        return diff !== null && diff > 10 && !isVerified;
      });
    }

    // Status card filter: keep rows that have a value in the chosen column
    if (statusFilterColId) {
      result = result.filter(row =>
        statusFilterColId === STATUS_REMAINING
          ? isRemainingRow(row)
          : String(row[statusFilterColId] ?? '').trim() !== ''
      );
    }

    // Today card filter: keep rows whose date in the chosen column is today
    if (todayFilterColId) {
      result = result.filter(row =>
        todayFilterColId === TODAY_COMBINED
          ? isTodayCombinedRow(row)
          : toIsoDateString(row[todayFilterColId]) === todayIso
      );
    }

    // Sort
    if (sortColumn) {
      result.sort((a, b) => {
        const valA = a[sortColumn];
        const valB = b[sortColumn];

        if (valA === valB) return 0;
        if (valA === undefined || valA === null || valA === '') return 1;
        if (valB === undefined || valB === null || valB === '') return -1;

        const numA = Number(String(valA).replace(/,/g, '').replace(/\$/g, '').trim());
        const numB = Number(String(valB).replace(/,/g, '').replace(/\$/g, '').trim());

        if (!isNaN(numA) && !isNaN(numB)) {
          return sortDirection === 'ASC' ? numA - numB : numB - numA;
        }

        const comp = String(valA).localeCompare(String(valB));
        return sortDirection === 'ASC' ? comp : -comp;
      });
    }

    return result;
  }, [
    baseFilteredRows,
    isOverdue10Only,
    statusFilterColId,
    isRemainingRow,
    todayFilterColId,
    isTodayCombinedRow,
    todayIso,
    toIsoDateString,
    deliveryDateCol,
    verifyCol,
    getDaysDiffFromToday,
    sortColumn,
    sortDirection
  ]);

  // Pagination
  const totalPages = useMemo(() => {
    if (pageSize >= filteredAndSortedRows.length || pageSize <= 0) return 1;
    return Math.ceil(filteredAndSortedRows.length / pageSize);
  }, [filteredAndSortedRows.length, pageSize]);

  const paginatedRows = useMemo(() => {
    if (pageSize >= filteredAndSortedRows.length || pageSize <= 0) {
      return filteredAndSortedRows;
    }
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedRows.slice(start, start + pageSize);
  }, [filteredAndSortedRows, currentPage, pageSize]);

  const bmSelection = useGridSelection(paginatedRows, (r: any) => r._id as string);
  const selectedBmMatrix = (): [string[], any[][]] => [
    columns.map((c: any) => c.label),
    bmSelection.selectedRows.map((r: any) => columns.map((c: any) => r[c.id])),
  ];

  // Numeric Columns Summary Stats
  const columnSummaries = useMemo(() => {
    const stats: Record<string, { total: number; count: number; avg: number }> = {};
    columns.forEach(col => {
      if (col.type === 'number') {
        let sum = 0;
        let count = 0;
        filteredAndSortedRows.forEach(row => {
          const val = row[col.id];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            const num = Number(String(val).replace(/,/g, '').replace(/\$/g, '').trim());
            if (!isNaN(num)) {
              sum += num;
              count++;
            }
          }
        });
        if (count > 0) {
          stats[col.id] = {
            total: sum,
            count,
            avg: sum / count
          };
        }
      }
    });
    return stats;
  }, [columns, filteredAndSortedRows]);

  // Handle Sort Toggle
  const handleSortToggle = (colId: string) => {
    if (sortColumn === colId) {
      if (sortDirection === 'ASC') {
        setSortDirection('DESC');
      } else {
        setSortColumn(null);
        setSortDirection('ASC');
      }
    } else {
      setSortColumn(colId);
      setSortDirection('ASC');
    }
  };

  // Copy Cell Content
  const handleCopyCell = (text: any, id: string) => {
    if (text === undefined || text === null) return;
    copyText(String(text));
    setCopiedCellId(id);
    setTimeout(() => setCopiedCellId(null), 1500);
  };

  // Copy Entire Row
  const handleCopyRow = (row: SheetRowData, rowId: string) => {
    const line = columns.map(c => row[c.id] || '').join('\t');
    copyText(line);
    setCopiedRowId(rowId);
    setTimeout(() => setCopiedRowId(null), 1500);
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredAndSortedRows.length === 0) {
      notify('ពុំមានទិន្នន័យសម្រាប់ទាញយកឡើយ', 'info');
      return;
    }

    const headers = columns.map(c => c.label);
    const rows = filteredAndSortedRows.map(row => columns.map(c => row[c.id]));

    const csvContent = formatCsv(headers, rows);
    downloadCsv(`Data_BM_Export_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
    notify('បានទាញយកឯកសារ CSV ជោគជ័យ!', 'success');
  };

  // Helper to extract or group currency & numeric metrics
  const numericStats = useMemo(() => {
    let usdStat: { col: SheetColumnDef; stat: { total: number; count: number; avg: number } } | null = null;
    let khmStat: { col: SheetColumnDef; stat: { total: number; count: number; avg: number } } | null = null;
    const otherStats: Array<{ col: SheetColumnDef; stat: { total: number; count: number; avg: number } }> = [];

    columns.forEach(col => {
      const stat = columnSummaries[col.id];
      if (!stat) return;
      const idUpper = (col.id + ' ' + col.label).toUpperCase();
      if (!usdStat && (idUpper.includes('USD') || idUpper.includes('$'))) {
        usdStat = { col, stat };
      } else if (!khmStat && (idUpper.includes('KHM') || idUpper.includes('KHR') || idUpper.includes('RIEL') || idUpper.includes('៛'))) {
        khmStat = { col, stat };
      } else {
        otherStats.push({ col, stat });
      }
    });

    return { usdStat, khmStat, otherStats };
  }, [columns, columnSummaries]);

  const formatTimeDisplay = (timeStr: string | null) => {
    if (!timeStr) return 'មិនទាន់ Sync';
    try {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      }
    } catch (e) {}
    return timeStr;
  };

  return (
    <div className={`page-fill space-y-2.5 sm:space-y-3.5 pb-24 lg:pb-0 transition-all ${
      isFullScreen 
        ? 'fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 p-2 sm:p-4 overflow-y-auto w-screen h-screen' 
        : ''
    }`}>
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
      
      {/* 1. Sleek Compact Header Card */}
      <div className="bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden transition-all">
        <div className="absolute top-0 right-0 w-64 h-32 bg-gradient-to-bl from-blue-500/10 via-indigo-500/5 to-transparent rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-wrap items-center justify-between gap-2 relative z-10">
          {/* Left: Branding & Status */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 text-white flex items-center justify-center font-bold shadow-sm shadow-blue-500/20 shrink-0">
              <FileSpreadsheet className="w-4 h-4 text-white" />
            </div>
            
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight">
                Pending BM
              </h1>

              {/* Status Badge */}
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{fetchMethodUsed ? `Live (${fetchMethodUsed})` : 'Live'}</span>
              </span>
            </div>
          </div>

          {/* Right: Tools & Action Buttons Toolbar */}
          <div className="flex items-center gap-1.5 ml-auto">
            {/* Auto-Sync Dropdown Trigger */}
            <div className="relative" ref={autoSyncMenuRef}>
              <button
                type="button"
                onClick={() => setIsAutoSyncMenuOpen(!isAutoSyncMenuOpen)}
                className={`h-8 sm:h-auto px-2 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
                  isAutoSyncEnabled
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 shadow-2xs hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                }`}
                title="កំណត់ Auto-Sync & Real-Time Watcher"
              >
                {isAutoSyncEnabled ? (
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${isSyncingInBackground ? 'duration-500' : ''}`} />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                )}
                
                <span className="flex items-center gap-1 font-mono text-[11px]">
                  {isSyncingInBackground ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />
                      <span className="hidden sm:inline">Syncing...</span>
                    </>
                  ) : isAutoSyncEnabled ? (
                    <>
                      <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                      <span><CountdownText store={countdownStore} suffix="s" /></span>
                    </>
                  ) : (
                    <span>Off</span>
                  )}
                </span>
              </button>

              {/* Dropdown Menu for Auto-Sync Intervals */}
              {isAutoSyncMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-2.5 z-50 text-xs animate-in fade-in zoom-in-95">
                  <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 text-xs">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      <span>Google Sheet Watcher</span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setIsAutoSyncMenuOpen(false)}
                      className="text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        const next = !isAutoSyncEnabled;
                        setIsAutoSyncEnabled(next);
                        localStorage.setItem(STORAGE_KEY_BM_AUTO_SYNC, String(next));
                        setIsAutoSyncMenuOpen(false);
                        notify(next ? 'បានបើកដំណើរការ Real-Time Auto Sync!' : 'បានបិទ Auto Sync', 'info');
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl flex items-center justify-between font-medium cursor-pointer transition ${
                        isAutoSyncEnabled ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span>ស្ថានភាព (Status)</span>
                      <span className="font-bold text-[10px] px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border shadow-2xs">
                        {isAutoSyncEnabled ? 'បើក (ON)' : 'បិទ (OFF)'}
                      </span>
                    </button>

                    {isAutoSyncEnabled && (
                      <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800">
                        <div className="text-[10px] text-slate-400 px-2 py-1 uppercase tracking-wider font-semibold">
                          រយៈពេលពិនិត្យ (Interval):
                        </div>
                        {[5, 10, 15, 30, 60].map(sec => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => {
                              setSyncInterval(sec);
                              setCountdown(sec);
                              localStorage.setItem(STORAGE_KEY_BM_SYNC_INTERVAL, String(sec));
                              setIsAutoSyncMenuOpen(false);
                              notify(`បានកំណត់ Auto-Sync រៀងរាល់ ${sec} វិនាទី!`, 'success');
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition ${
                              syncInterval === sec 
                                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold' 
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <span>រៀងរាល់ {sec} វិនាទី {sec === 5 ? '(លឿនបំផុត)' : sec === 10 ? '(ណែនាំ)' : ''}</span>
                            {syncInterval === sec && <Check className="w-3.5 h-3.5 text-blue-600" />}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="pt-1.5 px-2 text-[10.5px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
                      <span>✓ ពិនិត្យស្វ័យប្រវត្តិនៅពេល Switch ត្រឡប់មកផ្ទាំងនេះវិញ</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions (CSV) */}
            <div className="flex items-center gap-1">
              {/* Export CSV */}
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={rows.length === 0}
                className="h-8 sm:h-auto px-2 py-1 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1 transition disabled:opacity-40 cursor-pointer"
                title="ទាញយកជា CSV / Excel"
              >
                <Download className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                <span className="text-[11px] hidden sm:inline">CSV</span>
              </button>
            </div>

            {/* View Mode Toggle (Table View vs Card View) */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-850 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-800 ml-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`h-7 sm:h-auto px-2 py-0.5 rounded-md text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
                title="បង្ហាញជាតារាង (Table View)"
              >
                <Table2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                <span className="hidden sm:inline">តារាង</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`h-7 sm:h-auto px-2 py-0.5 rounded-md text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
                title="បង្ហាញជាកាត (Card View)"
              >
                <LayoutGrid className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                <span className="hidden sm:inline">កាត</span>
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible Admin Config Drawer */}
        {isAdmin && isConfigOpen && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 animate-in fade-in duration-200">
            <div className="bg-slate-50 dark:bg-[#0a0f1d] rounded-xl p-3 sm:p-4 border border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <LinkIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    ការកំណត់ Link Google Sheets (Admin)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHelpGuide(!showHelpGuide)}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                >
                  <HelpCircle className="w-3 h-3" />
                  <span>របៀប Share Google Sheet?</span>
                </button>
              </div>

              {/* Help Guide Box */}
              {showHelpGuide && (
                <div className="mb-3 p-3 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl text-xs text-blue-950 dark:text-blue-200 space-y-1 animate-in fade-in">
                  <div className="font-bold flex items-center gap-1.5 text-blue-900 dark:text-blue-300 text-[11.5px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>ការណែនាំ Share សិទ្ធិ Google Sheet ឲ្យដំណើរការលើគ្រប់កន្លែង (និង Vercel):</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 pl-1 text-[11px] text-slate-700 dark:text-slate-300">
                    <li>បើក Google Sheet &gt; ចុច <strong>Share</strong> &gt; ប្តូរ General access ទៅជា <strong>"Anyone with the link"</strong> &gt; <strong>Viewer</strong></li>
                    <li>ចុច <strong>Copy link</strong> រួចបិទភ្ជាប់ក្នុងប្រអប់ខាងក្រោម</li>
                  </ol>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-end">
                <div className="lg:col-span-8 space-y-1">
                  <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Google Spreadsheet URL ឬ ID *</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={tempSheetUrl}
                      onChange={(e) => setTempSheetUrl(e.target.value)}
                      placeholder="ឧ. https://docs.google.com/spreadsheets/d/.../edit#gid=0"
                      className="w-full pl-8 pr-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 font-mono"
                    />
                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div className="lg:col-span-2 space-y-1">
                  <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Sheet Name (បើមាន)
                  </label>
                  <input
                    type="text"
                    value={tempSheetName}
                    onChange={(e) => setTempSheetName(e.target.value)}
                    placeholder="ឧ. Sort_pending"
                    className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div className="lg:col-span-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    disabled={isLoading || !tempSheetUrl.trim()}
                    className="w-full py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>រក្សាទុក & Sync</span>
                  </button>
                </div>
              </div>

              {tempSheetUrl.trim() && (
                <div className="mt-2 flex items-center gap-3 text-[10.5px] text-slate-500 dark:text-slate-400 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold">ID:</span>
                    <code className="bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.2 rounded font-mono text-[10px]">
                      {parseGoogleSheetInput(tempSheetUrl).spreadsheetId || 'មិនទាន់ត្រឹមត្រូវ'}
                    </code>
                  </div>
                  {parseGoogleSheetInput(tempSheetUrl).gid && (
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">GID:</span>
                      <code className="bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-1 py-0.2 rounded font-mono text-[10px]">
                        {parseGoogleSheetInput(tempSheetUrl).gid}
                      </code>
                    </div>
                  )}
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    ✓ Sync គ្រប់ Device & Vercel
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error / Warning Alert */}
        {errorMessage && (
          <div className={`mt-3 p-3 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in ${
            isRestrictedWarning 
              ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 text-amber-900 dark:text-amber-200' 
              : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300'
          }`}>
            <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${isRestrictedWarning ? 'text-amber-600' : 'text-rose-600'}`} />
            <div className="flex-1 space-y-1 min-w-0">
              <div className="font-bold text-xs">
                {isRestrictedWarning ? 'Google Sheet ស្ថិតក្នុងស្ថានភាព Restricted!' : 'បញ្ហាក្នុងការទាញយក:'}
              </div>
              <p className="text-[11px]">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setIsRestrictedWarning(false);
              }}
              className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 2. Compact Search & Column Filters Toolbar (Delivery Date, HANDLE BY, DEST) */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl px-2.5 py-2 sm:px-3 sm:py-2 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-1.5">
        <div className="flex flex-col sm:grid sm:grid-cols-12 lg:flex lg:flex-row items-stretch lg:items-center justify-between gap-1.5 sm:gap-2">
          {/* Left: Search Input */}
          <div className={`relative flex-1 min-w-[180px] ${deliveryDateCol ? 'sm:col-span-6' : 'sm:col-span-12'}`}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ស្វែងរកក្នុងតារាង (Search anything)..."
              className="w-full h-9 sm:h-8.5 pl-8 pr-7 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                title="លុបពាក្យស្វែងរក"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Right: Specific Column Filters (Delivery Date, HANDLE BY, DEST) */}
          <div className="flex items-center gap-1.5 flex-wrap w-full sm:contents lg:flex lg:w-auto">
            {/* Filter 1: Delivery Date (Start Date & End Date Inline) */}
            {deliveryDateCol && (
              <div className="w-full sm:col-span-6 lg:w-auto flex items-center gap-1 h-9 sm:h-8.5 px-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-lg text-xs shadow-2xs">
                <Calendar className={`w-3.5 h-3.5 shrink-0 ${deliveryStartDate || deliveryEndDate ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                <input
                  type="date"
                  value={deliveryStartDate}
                  onChange={(e) => {
                    setDeliveryStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={`bg-transparent text-xs flex-1 min-w-0 lg:flex-none lg:w-30 focus:outline-none cursor-pointer font-sans ${
                    deliveryStartDate ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400'
                  }`}
                  title="Delivery Start Date"
                />
                <span className="text-slate-400 text-xs font-bold px-0.5">→</span>
                <input
                  type="date"
                  value={deliveryEndDate}
                  onChange={(e) => {
                    setDeliveryEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={`bg-transparent text-xs flex-1 min-w-0 lg:flex-none lg:w-30 focus:outline-none cursor-pointer font-sans ${
                    deliveryEndDate ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400'
                  }`}
                  title="Delivery End Date"
                />
                {(deliveryStartDate || deliveryEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryStartDate('');
                      setDeliveryEndDate('');
                      setCurrentPage(1);
                    }}
                    className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-rose-500 transition cursor-pointer"
                    title="លុប Date Range"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* Filter 2: HANDLE BY */}
            {handleByCol && (
              <div className="relative flex items-center min-w-[125px] sm:min-w-[140px] flex-1 sm:col-span-4 lg:flex-none">
                <UserCheck className={`w-3.5 h-3.5 absolute left-2.5 pointer-events-none z-10 ${selectedHandleBy ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`} />
                <select
                  value={selectedHandleBy}
                  onChange={(e) => {
                    setSelectedHandleBy(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={`w-full h-9 sm:h-8.5 pl-8 pr-6 rounded-lg text-xs appearance-none transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-500 truncate ${
                    selectedHandleBy
                      ? 'bg-purple-50 dark:bg-purple-950/60 border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 font-bold shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 font-medium'
                  }`}
                  title="Filter តាម HANDLE BY"
                >
                  <option value="">HANDLE BY (ទាំងអស់)</option>
                  {handleByOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <span className="absolute right-2 text-slate-400 pointer-events-none text-[8.5px]">▼</span>
              </div>
            )}

            {/* Filter 3: RE-DEST */}
            {reDestCol && (
              <div className="relative flex items-center min-w-[110px] sm:min-w-[125px] flex-1 sm:col-span-4 lg:flex-none">
                <MapPin className={`w-3.5 h-3.5 absolute left-2.5 pointer-events-none z-10 ${selectedDest ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
                <select
                  value={selectedDest}
                  onChange={(e) => {
                    setSelectedDest(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={`w-full h-9 sm:h-8.5 pl-8 pr-6 rounded-lg text-xs appearance-none transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500 truncate ${
                    selectedDest
                      ? 'bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-bold shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 font-medium'
                  }`}
                  title="Filter តាម RE-DEST"
                >
                  <option value="">RE-DEST (ទាំងអស់)</option>
                  {destOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <span className="absolute right-2 text-slate-400 pointer-events-none text-[8.5px]">▼</span>
              </div>
            )}

            {/* Filter 4: verify */}
            {verifyCol && (
              <div className="relative flex items-center min-w-[110px] sm:min-w-[125px] flex-1 sm:col-span-4 lg:flex-none">
                <ShieldCheck className={`w-3.5 h-3.5 absolute left-2.5 pointer-events-none z-10 ${selectedVerify ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                <select
                  value={selectedVerify}
                  onChange={(e) => {
                    setSelectedVerify(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={`w-full h-9 sm:h-8.5 pl-8 pr-6 rounded-lg text-xs appearance-none transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 truncate ${
                    selectedVerify
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-bold shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 font-medium'
                  }`}
                  title="Filter តាម verify"
                >
                  <option value="">VERIFY (ទាំងអស់)</option>
                  <option value={VERIFY_EMPTY}>(ទទេ)</option>
                  {verifyOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <span className="absolute right-2 text-slate-400 pointer-events-none text-[8.5px]">▼</span>
              </div>
            )}

            {/* Filters 5-8: GOT COD / BUYMED / CLEAR / RETURN */}
            {statusSelectCols.map(st => {
              const sel = statusSelects[st.col.id] || '';
              const theme = STATUS_CARD_THEME[st.key];
              const Icon = theme.icon;
              return (
                <div key={st.key} className="relative flex items-center min-w-[110px] sm:min-w-0 lg:min-w-[115px] flex-1 sm:col-span-3 lg:flex-none">
                  <Icon className={`w-3.5 h-3.5 absolute left-2.5 pointer-events-none z-10 ${sel ? theme.text : 'text-slate-400'}`} />
                  <select
                    value={sel}
                    onChange={(e) => {
                      const value = e.target.value;
                      setStatusSelects(prev => ({ ...prev, [st.col.id]: value }));
                      setCurrentPage(1);
                    }}
                    className={`w-full h-9 sm:h-8.5 pl-8 pr-6 rounded-lg text-xs appearance-none transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 truncate border ${
                      sel
                        ? `${theme.chip} border-current/30 font-bold shadow-xs`
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 font-medium'
                    }`}
                    title={`Filter តាម ${st.label}`}
                  >
                    <option value="">{st.label} (ទាំងអស់)</option>
                    <option value={HAS_VALUE}>(មានទិន្នន័យ)</option>
                    <option value={VERIFY_EMPTY}>(ទទេ)</option>
                    {st.options.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <span className="absolute right-2 text-slate-400 pointer-events-none text-[8.5px]">▼</span>
                </div>
              );
            })}

            {/* Reset / Clear Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="h-8 sm:h-8.5 px-2 rounded-lg text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/80 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition flex sm:hidden lg:flex items-center justify-center gap-1 cursor-pointer shadow-2xs shrink-0"
                title="សម្អាត Filter និងពាក្យស្វែងរកទាំងអស់"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">សម្អាត</span>
              </button>
            )}
          </div>
        </div>

        {/* Lower Sub-Row: Page Size, Quick Page Switcher & Results Counter */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/80 text-xs gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-medium">បង្ហាញ:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-1.5 py-0.5 rounded-md text-xs font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value={25}>25 ជួរ</option>
              <option value={50}>50 ជួរ</option>
              <option value={100}>100 ជួរ</option>
              <option value={200}>200 ជួរ</option>
              <option value={999999}>ទាំងអស់</option>
            </select>
          </div>

          {/* Quick Page Switcher */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-5 h-5 flex items-center justify-center rounded text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
                title="ទំព័រមុន"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="text-[11px] font-medium px-1 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                ទំព័រ <strong className="text-blue-600 dark:text-blue-400 font-bold">{currentPage}</strong> / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="w-5 h-5 flex items-center justify-center rounded text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
                title="ទំព័របន្ទាប់"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-[10px] font-bold border border-blue-200/60 dark:border-blue-800/60 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/60 transition"
                title="ចុចដើម្បីសម្អាត Filter ទាំងអស់"
              >
                <Filter className="w-2.5 h-2.5" /> Filter <X className="w-2.5 h-2.5" />
              </button>
            )}
            {isOverdue10Only && (
              <span 
                onClick={() => {
                  setIsOverdue10Only(false);
                  setCurrentPage(1);
                }}
                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 text-[10px] font-bold border border-rose-200/60 dark:border-rose-800/60 cursor-pointer hover:bg-rose-100 transition"
                title="ចុចដើម្បីដោះ Filter លើស 10 ថ្ងៃ"
              >
                &gt; 10 ថ្ងៃ <X className="w-2.5 h-2.5" />
              </span>
            )}
            <span className="font-mono text-[11px]">
              {filteredAndSortedRows.length === 0 ? '0' : ((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredAndSortedRows.length)} នៃ {filteredAndSortedRows.length.toLocaleString('en-US')} ជួរ
            </span>
          </div>
        </div>
      </div>

      {/* 3. Compact Summary Cards: Total, > 10 days, GOT COD, CLEAR, RETURN, BUYMED, VERIFY */}
      {rows.length > 0 && (() => {
        const fmtUsd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fmtKhm = (n: number) => Math.round(n).toLocaleString('en-US');
        const totalUsd = numericStats.usdStat ? numericStats.usdStat.stat.total : 0;
        const totalKhm = numericStats.khmStat ? numericStats.khmStat.stat.total : 0;

        const cards: Array<{
          key: string; label: string; count: number; usd: number; khm: number;
          active?: boolean; dim?: boolean; onClick?: () => void; title: string; span: string;
        }> = [
          {
            key: 'total', label: 'សរុប', count: filteredAndSortedRows.length, usd: totalUsd, khm: totalKhm,
            title: `សរុប ${filteredAndSortedRows.length} ជួរ`, span: 'col-span-1',
          },
          ...(overdue10Stats.hasDeliveryDateCol ? [{
            key: 'overdue', label: '> 10 ថ្ងៃ', count: overdue10Stats.count, usd: overdue10Stats.totalUSD, khm: overdue10Stats.totalKHM,
            active: isOverdue10Only,
            onClick: () => { setIsOverdue10Only(prev => !prev); setCurrentPage(1); },
            title: `ចុចដើម្បី Filter មើលតែទិន្នន័យលើសពី 10 ថ្ងៃ (${overdue10Stats.count} ជួរ)`,
            span: 'col-span-1',
          }] : []),
          ...statusStats.map((st, i) => ({
            key: st.key, label: st.label, count: st.count, usd: st.totalUSD, khm: st.totalKHM,
            active: statusFilterColId === st.col.id,
            onClick: () => { setStatusFilterColId(prev => (prev === st.col.id ? null : st.col.id)); setCurrentPage(1); },
            title: `ចុចដើម្បីមើលតែជួរដែលមាន ${st.label} (${st.count} ជួរ)`,
            span: 'col-span-1',
          })),
          ...(remainingColIds.length > 0 ? [{
            key: 'remaining', label: 'នៅសល់', count: remainingStats.count, usd: remainingStats.totalUSD, khm: remainingStats.totalKHM,
            active: statusFilterColId === STATUS_REMAINING,
            onClick: () => { setStatusFilterColId(prev => (prev === STATUS_REMAINING ? null : STATUS_REMAINING)); setCurrentPage(1); },
            title: `នៅសល់ = សរុប ដក (BUYMED + CLEAR + RETURN) • ${remainingStats.count} ជួរ`,
            span: 'col-span-1',
          }] : []),
        ];
        // Show "remaining" right after the total card
        const remainingIdx = cards.findIndex(c => c.key === 'remaining');
        if (remainingIdx > 1) cards.splice(1, 0, ...cards.splice(remainingIdx, 1));
        // Odd number of cards on phones: let the last one fill the row
        if (cards.length % 2 === 1) cards[cards.length - 1].span = 'col-span-2 sm:col-span-1';

        const renderCard = (c: typeof cards[number]) => {
          const theme = STATUS_CARD_THEME[c.key];
          const Icon = theme.icon;
          const Tag = (c.onClick ? 'button' : 'div') as React.ElementType;
          return (
            <Tag
              key={c.key}
              {...(c.onClick ? { type: 'button', onClick: c.onClick } : {})}
              title={`${c.title} • $${fmtUsd(c.usd)} • ${fmtKhm(c.khm)} ៛`}
              className={`${c.span} xl:flex-1 min-w-0 text-left rounded-xl px-2.5 py-1.5 bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 shadow-2xs transition select-none ${
                c.onClick ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-700' : ''
              } ${c.active ? theme.active : ''} ${c.dim ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${theme.chip}`}>
                    <Icon className="w-3 h-3" />
                  </span>
                  <span className={`text-[10.5px] font-bold uppercase tracking-wide truncate ${theme.text}`}>{c.label}</span>
                </div>
                <span className={`px-1.5 rounded-full text-[10px] leading-4 font-mono font-bold shrink-0 ${theme.chip}`}>
                  {c.count.toLocaleString('en-US')}
                </span>
              </div>
              <div className={`mt-1 text-[13px] xl:text-sm leading-tight font-black font-mono truncate ${theme.value}`}>
                ${fmtUsd(c.usd)}
              </div>
              <div className="text-[10.5px] leading-tight font-mono text-slate-500 dark:text-slate-400 truncate">
                {fmtKhm(c.khm)} ៛
              </div>
            </Tag>
          );
        };

        const todayItems = [
          ...todayStats.map(st => ({ key: st.key, label: st.label, filterId: st.col.id, count: st.count, usd: st.totalUSD, khm: st.totalKHM })),
          ...(todayCombinedColIds.length > 1 ? [{
            key: 'combined', label: 'BUYMED+CLEAR+RETURN', filterId: TODAY_COMBINED,
            count: todayCombinedStats.count, usd: todayCombinedStats.totalUSD, khm: todayCombinedStats.totalKHM,
          }] : []),
        ];
        const todayCards: typeof cards = todayItems.map((it, i) => ({
          key: it.key, label: it.label, count: it.count, usd: it.usd, khm: it.khm,
          active: todayFilterColId === it.filterId,
          dim: it.count === 0 && todayFilterColId !== it.filterId,
          onClick: () => { setTodayFilterColId(prev => (prev === it.filterId ? null : it.filterId)); setCurrentPage(1); },
          title: it.key === 'combined'
            ? `សរុបបញ្ចូលគ្នា BUYMED + CLEAR + RETURN ថ្ងៃនេះ (${it.count} ជួរ, មិនរាប់ជួរស្ទួន)`
            : `ចុចដើម្បីមើលតែជួរដែល ${it.label} ជាថ្ងៃនេះ (${it.count} ជួរ)`,
          span: `${i === todayItems.length - 1 && todayItems.length % 2 === 1 ? 'col-span-2' : 'col-span-1'} sm:col-span-1`,
        }));
        const todayLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

        return (
          <div className="space-y-1.5 sm:space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:flex gap-1.5 sm:gap-2">
              {cards.map(renderCard)}
            </div>

            {todayCards.length > 0 && (
              <div className="flex flex-col xl:flex-row gap-1.5 sm:gap-2">
                {/* Today label */}
                <div className="flex xl:flex-col items-center xl:justify-center gap-1.5 xl:gap-0.5 px-1 xl:px-3 xl:min-w-[92px] xl:rounded-xl xl:bg-slate-900 xl:dark:bg-slate-800 text-slate-700 dark:text-slate-300 xl:text-white">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-bold">ថ្ងៃនេះ</span>
                  <span className="text-[10px] font-mono opacity-80">{todayLabel}</span>
                </div>
                <div className={`grid grid-cols-2 ${todayCards.length === 6 ? 'sm:grid-cols-3' : todayCards.length === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} xl:flex xl:flex-1 gap-1.5 sm:gap-2`}>
                  {todayCards.map(renderCard)}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 4. Dynamic Data Table */}
      <div className="page-fill-body bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mb-3" />
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              កំពុងទាញយកទិន្នន័យពី Google Sheets (Universal Multi-Tier Fetcher)...
            </p>
            <p className="text-xs text-slate-400 mt-1">
              ប្រព័ន្ធកំពុងដំណើរការតារាង និងសម្របសម្រួលទិន្នន័យសម្រាប់ Vercel
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 sm:p-16 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center mb-3">
              <FileSpreadsheet className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
              {sheetUrl.trim() ? 'ពុំមានទិន្នន័យនៅក្នុង Google Sheet នេះឡើយ' : 'មិនទាន់បានភ្ជាប់ Google Sheet សម្រាប់ Data BM ឡើយ'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mb-4">
              {sheetUrl.trim() 
                ? 'សូមពិនិត្យមើលសិទ្ធិ Share នៃ Sheet របស់អ្នក ឬចុច Refresh ម្តងទៀត'
                : 'សូមចុចប៊ូតុង "កំណត់ Link Sheet" ខាងលើដើម្បីបិទភ្ជាប់ Google Spreadsheet URL ឬ ID របស់អ្នក'}
            </p>
            {!sheetUrl.trim() && (
              isAdmin ? (
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(true)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 transition cursor-pointer"
                >
                  <LinkIcon className="w-4 h-4" />
                  <span>ភ្ជាប់ Google Sheet ឥឡូវនេះ (Admin)</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2 rounded-xl border border-amber-200/60 dark:border-amber-800/60">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>សូមទាក់ទង Admin ដើម្បីកំណត់ Link Google Sheet សម្រាប់ទំព័រនេះ</span>
                </div>
              )
            )}
          </div>
        ) : viewMode === 'cards' ? (
          /* ========================================================================= */
          /* CARDS VIEW: Mobile-Optimized Delivery Package Cards                       */
          /* ========================================================================= */
          <div className={`p-3 sm:p-4 space-y-2.5 ${
            scrollMode === 'CONTAINER' 
              ? 'max-h-[calc(100vh-300px)] overflow-y-auto custom-scrollbar' 
              : 'h-auto overflow-y-visible'
          }`}>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pb-1 border-b border-slate-100 dark:border-slate-800/80">
              <span className="font-medium text-[11px]">
                បង្ហាញជាកាត (Card View) • ចុចលើកាត ដើម្បីមើលគ្រប់ជួរឈរ
              </span>
              <span className="font-mono font-bold text-[11px]">
                {paginatedRows.length} នៃ {filteredAndSortedRows.length} ជួរ
              </span>
            </div>

            {paginatedRows.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                ពុំមានទិន្នន័យត្រូវគ្នានឹង Filter ឬពាក្យស្វែងរកឡើយ
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2">
                {paginatedRows.map((row, idx) => {
                  const pageStartIndex = (currentPage - 1) * pageSize;
                  const awbnVal = awbnCol ? row[awbnCol.id] : row['col_1'];
                  const deliveryVal = deliveryDateCol ? row[deliveryDateCol.id] : null;
                  const handleByVal = handleByCol ? row[handleByCol.id] : null;
                  const destVal = destCol ? row[destCol.id] : null;
                  const receiverVal = receiverCol ? row[receiverCol.id] : null;
                  const usdVal = usdCol ? row[usdCol.id] : null;
                  const khmVal = khmCol ? row[khmCol.id] : null;

                  const daysDiff = deliveryDateCol && deliveryVal ? getDaysDiffFromToday(deliveryVal) : null;
                  const isOverdue = daysDiff !== null && (daysDiff as number) > 10;
                  const openDetail = () => setSelectedDetailRow({ ...row, __rowNumber: pageStartIndex + idx + 1 });

                  // Compact 3-line card: tap anywhere to open full details
                  return (
                    <div
                      key={row._id}
                      onClick={openDetail}
                      className="group cursor-pointer bg-white dark:bg-slate-900/90 rounded-xl px-2.5 py-1.5 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700/80 active:scale-[0.99] transition space-y-0.5"
                      title="ចុចដើម្បីមើលព័ត៌មានលម្អិតទាំងអស់"
                    >
                      {/* Line 1: #, AWBN, delivery date */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">{pageStartIndex + idx + 1}</span>
                          <span className="font-mono font-bold text-[13px] text-blue-600 dark:text-blue-400 truncate">
                            {awbnVal || 'គ្មាន AWB'}
                          </span>
                        </div>
                        {deliveryVal && (
                          <span className={`text-[10.5px] font-semibold px-1.5 py-px rounded-md flex items-center gap-1 shrink-0 ${
                            isOverdue
                              ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}>
                            <Calendar className="w-3 h-3" />
                            <span>{deliveryVal}</span>
                            {isOverdue && (
                              <span className="text-[9px] bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200 font-bold px-1 rounded">
                                &gt;10d
                              </span>
                            )}
                          </span>
                        )}
                      </div>

                      {/* Line 2: receiver + COD amounts */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate min-w-0">
                          {receiverVal || <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {usdVal && (
                            <span className="font-mono font-bold text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-px rounded-md">
                              ${String(usdVal).replace('$', '')}
                            </span>
                          )}
                          {khmVal && (
                            <span className="font-mono font-bold text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-px rounded-md">
                              {String(khmVal).replace('៛', '')} ៛
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Line 3: handle by · dest */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 min-w-0">
                        {handleByVal && (
                          <span className="flex items-center gap-1 min-w-0">
                            <UserCheck className="w-3 h-3 text-purple-500 shrink-0" />
                            <span className="truncate font-medium">{handleByVal}</span>
                          </span>
                        )}
                        {destVal && (
                          <span className="flex items-center gap-1 min-w-0">
                            <MapPin className="w-3 h-3 text-amber-500 shrink-0" />
                            <span className="truncate font-medium">{destVal}</span>
                          </span>
                        )}
                        <ChevronRight className="w-3.5 h-3.5 ml-auto shrink-0 text-slate-300 group-hover:text-blue-500 transition" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ========================================================================= */
          /* TABLE VIEW: Responsive Table with Sticky Columns & Swipe Hint            */
          /* ========================================================================= */
          <>
            {bmSelection.count > 0 && (
              <div className="hidden xl:block px-3 py-1.5">
                <GridSelectionBar
                  count={bmSelection.count}
                  onCopy={() => copyRowsAsTsv(...selectedBmMatrix())}
                  onExport={() => exportRowsAsCsv('data_bm_selected', ...selectedBmMatrix())}
                  onClear={bmSelection.clear}
                />
              </div>
            )}

            {/* Mobile / Tablet Quick Hint Banner */}
            <div className="xl:hidden flex items-center justify-between px-3 py-1.5 bg-blue-50/70 dark:bg-slate-850 text-[10.5px] text-blue-700 dark:text-blue-300 border-b border-slate-200/80 dark:border-slate-800">
              <span className="flex items-center gap-1.5 font-medium">
                <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>ចុចលើលេខ AWBN ដើម្បីមើលពត៌មានលម្អិតទាំងអស់</span>
              </span>
              <span className="font-mono font-bold text-slate-500 dark:text-slate-400 shrink-0">{paginatedRows.length} ជួរ</span>
            </div>

            <div 
              ref={tableContainerRef}
              onScroll={handleTableScroll}
              className={`overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${
                scrollMode === 'CONTAINER' 
                  ? 'page-fill-scroll overflow-y-auto max-h-[calc(100vh-320px)] min-h-[350px] custom-scrollbar' 
                  : 'h-auto overflow-y-visible'
              } relative`}
            >
              <table className="sb-grid w-full text-left">
              <thead className="select-none">
                <tr>
                  {/* Select all + row index # - Shown on Desktop only (hidden on mobile and ipad) */}
                  <GridHeadGutter
                    className="hidden xl:table-cell"
                    checked={bmSelection.allChecked}
                    indeterminate={bmSelection.someChecked}
                    onToggleAll={bmSelection.toggleAll}
                  />


                  {/* Dynamic Columns */}
                  {columns.map((col) => {
                    const isSorted = sortColumn === col.id;
                    const l = col.label.toLowerCase().trim();
                    const isUsd = (usdCol && usdCol.id === col.id) || l.includes('usd') || l.includes('$');
                    const isKhm = (khmCol && khmCol.id === col.id) || l.includes('khm') || l.includes('khr') || l.includes('riel') || l.includes('៛');
                    const isNumber = col.type === 'number' || isUsd || isKhm;
                    const visibilityClass = getColumnVisibilityClass(col);

                    return (
                      <th
                        key={col.id}
                        onClick={() => handleSortToggle(col.id)}
                        className={`py-3 px-3.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition whitespace-nowrap ${visibilityClass}`}
                      >
                        <div className={`flex items-center gap-1.5 ${isNumber ? 'justify-end' : ''}`}>
                          <span>{col.label}</span>
                          <ArrowUpDown className={`w-3 h-3 ${isSorted ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 opacity-60'}`} />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={100} className="py-8 text-center text-slate-400">
                      ពុំមានទិន្នន័យត្រូវគ្នានឹងពាក្យស្វែងរក "{searchTerm}" ឡើយ
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row, rowIdx) => {
                    const globalIdx = ((currentPage - 1) * pageSize) + rowIdx + 1;
                    const isRowCopied = copiedRowId === row._id;
                    const isSelected = bmSelection.isSelected(row._id);

                    return (
                      <tr 
                        key={row._id}
                        className={`group ${isSelected ? 'sb-selected' : ''}`}
                      >
                        {/* Checkbox + index - Desktop only */}
                        <GridRowGutter
                          className="hidden xl:table-cell"
                          selected={isSelected}
                          rowNumber={globalIdx}
                          onToggle={() => bmSelection.toggle(row._id)}
                        />

                        {/* Cell Values */}
                        {columns.map((col) => {
                          const val = row[col.id];
                          const cellId = `${row._id}_${col.id}`;
                          const isCopied = copiedCellId === cellId;
                          const l = col.label.toLowerCase().trim();
                          const isUsd = (usdCol && usdCol.id === col.id) || l.includes('usd') || l.includes('$');
                          const isKhm = (khmCol && khmCol.id === col.id) || l.includes('khm') || l.includes('khr') || l.includes('riel') || l.includes('៛');
                          const isNumber = col.type === 'number' || isUsd || isKhm;
                          const visibilityClass = getColumnVisibilityClass(col);
                          const isAwbn = (awbnCol && awbnCol.id === col.id) || l.includes('awb') || l.includes('tracking');

                          if (isAwbn) {
                            return (
                              <td 
                                key={col.id}
                                onClick={() => setSelectedDetailRow({ ...row, __rowNumber: globalIdx })}
                                className={`py-2.5 px-3 sm:px-3.5 whitespace-nowrap cursor-pointer hover:bg-blue-50/70 dark:hover:bg-blue-950/50 transition relative group/cell ${visibilityClass}`}
                                title="ចុចលើលេខ AWBN ដើម្បីមើលពត៌មានលម្អិតទាំងអស់ (Click to view full details)"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400 group-hover/cell:underline flex items-center gap-1">
                                    <span>{val !== undefined && val !== null ? String(val) : ''}</span>
                                    <Eye className="w-3.5 h-3.5 text-blue-500 opacity-60 group-hover/cell:opacity-100 transition shrink-0" />
                                  </span>

                                  {/* Quick Copy button */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyCell(val, cellId);
                                    }}
                                    className="p-1 rounded text-slate-300 dark:text-slate-600 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
                                    title="ចម្លងលេខ AWBN"
                                  >
                                    {isCopied ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                                {isCopied && (
                                  <span className="absolute right-1 top-1 bg-emerald-600 text-white text-[9px] px-1 py-0.5 rounded shadow z-10">
                                    Copied!
                                  </span>
                                )}
                              </td>
                            );
                          }

                          const isDeliveryCol = (deliveryDateCol && deliveryDateCol.id === col.id) || (l.includes('delivery') && l.includes('date'));
                          const diffFromToday = isDeliveryCol ? getDaysDiffFromToday(val) : null;
                          const isOverdue = diffFromToday !== null && diffFromToday > 10;

                          return (
                            <td 
                              key={col.id}
                              onClick={() => handleCopyCell(val, cellId)}
                              className={`py-2.5 px-3.5 text-slate-800 dark:text-slate-200 whitespace-nowrap cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-950/40 transition relative group/cell ${
                                isNumber ? 'font-mono text-right' : ''
                              } ${visibilityClass}`}
                              title="ចុចដើម្បីចម្លង (Click to Copy)"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <span>{val !== undefined && val !== null ? String(val) : ''}</span>
                                {isOverdue && (
                                  <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-sans">
                                    &gt;10d
                                  </span>
                                )}
                              </span>
                              {isCopied && (
                                <span className="absolute right-1 top-1 bg-emerald-600 text-white text-[9px] px-1 py-0.5 rounded shadow z-10">
                                  Copied!
                                </span>
                              )}
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
        </>
      )}

      </div>

      {/* 5. Fixed Menu Bottom (Floating Sticky Bottom Bar with Summary & Pagination) */}
      {rows.length > 0 && (
        <div className={`sticky ${isFullScreen ? 'bottom-2 sm:bottom-3' : 'bottom-2 sm:bottom-3'} z-20 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-2 sm:p-2.5 transition-all mt-2.5`}>
          
          {/* Synced Horizontal Scrollbar with Quick Nav Buttons */}
          {hasHorizontalOverflow && (
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
          
          {/* MOBILE VIEW (< sm): Ultra-compact, clean 1-row pagination bar that never overlaps MobileBottomNav */}
          <div className="flex sm:hidden items-center justify-between gap-2 text-xs">
            {/* Left: Page size */}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value={25}>25 ជួរ</option>
              <option value={50}>50 ជួរ</option>
              <option value={100}>100 ជួរ</option>
              <option value={200}>200 ជួរ</option>
              <option value={999999}>ទាំងអស់</option>
            </select>

            {/* Center: Prev / Current / Next */}
            <div className="flex items-center gap-1.5 font-medium">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
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
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                title="ទំព័របន្ទាប់"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Right: Total count badge */}
            <div className="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-mono font-bold text-[11px] border border-blue-200/50 dark:border-blue-800/50">
              {filteredAndSortedRows.length} ជួរ
            </div>
          </div>

          {/* TABLET & DESKTOP VIEW (>= sm): Full spacious pagination bar with badges and page numbers */}
          <div className="hidden sm:flex flex-col lg:flex-row items-center justify-between gap-2.5">
            {/* Left: Summary Metrics Badges */}
            <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start w-full lg:w-auto">
              {/* Row count */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200/60 dark:border-slate-800">
                <span className="font-mono text-blue-600 dark:text-blue-400 font-black">Σ</span>
                <span>សរុប:</span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {filteredAndSortedRows.length.toLocaleString('en-US')}
                </span>
                <span className="text-[10px] text-slate-400 font-normal">ជួរ</span>
                {hasActiveFilters && (
                  <span className="text-[9.5px] text-amber-600 dark:text-amber-400 font-normal">
                    (ពី {rows.length})
                  </span>
                )}
              </div>

              {/* USD Total */}
              {numericStats.usdStat && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-bold border border-blue-200/60 dark:border-blue-800/60">
                  <DollarSign className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="text-[11px] text-blue-600/80 dark:text-blue-400/80 font-medium">USD:</span>
                  <span className="font-mono font-black">
                    ${numericStats.usdStat.stat.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[9.5px] text-blue-500/70 font-normal hidden xl:inline">
                    (មធ្យម ${numericStats.usdStat.stat.avg.toFixed(2)})
                  </span>
                </div>
              )}

              {/* KHM Total */}
              {numericStats.khmStat && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200/60 dark:border-emerald-800/60">
                  <Coins className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 font-medium">KHM:</span>
                  <span className="font-mono font-black">
                    {Math.round(numericStats.khmStat.stat.total).toLocaleString('en-US')} ៛
                  </span>
                  <span className="text-[9.5px] text-emerald-500/70 font-normal hidden xl:inline">
                    (មធ្យម {Math.round(numericStats.khmStat.stat.avg).toLocaleString('en-US')} ៛)
                  </span>
                </div>
              )}

              {/* Overdue > 10 Days Badge */}
              {overdue10Stats.count > 0 && (
                <div 
                  onClick={() => {
                    setIsOverdue10Only(prev => !prev);
                    setCurrentPage(1);
                  }}
                  title={`ចុចដើម្បី Filter មើលទិន្នន័យលើសពី 10 ថ្ងៃ (${overdue10Stats.count} ជួរ)`}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border cursor-pointer transition select-none ${
                    isOverdue10Only
                      ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 border-rose-400 dark:border-rose-600 ring-1 ring-rose-400 shadow-2xs'
                      : 'bg-rose-50/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200/60 dark:border-rose-800/60 hover:border-rose-300'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span className="text-[11px] text-rose-600/80 dark:text-rose-400/80 font-medium">&gt; 10 ថ្ងៃ:</span>
                  <span className="font-mono font-black">{overdue10Stats.count} ជួរ</span>
                </div>
              )}
            </div>

            {/* Right: Page Size & Pagination Navigation */}
            <div className="flex items-center gap-2.5 flex-wrap justify-center sm:justify-end w-full lg:w-auto text-xs">
              {/* Page size dropdown */}
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
                  <option value={25}>25 ជួរ</option>
                  <option value={50}>50 ជួរ</option>
                  <option value={100}>100 ជួរ</option>
                  <option value={200}>200 ជួរ</option>
                  <option value={999999}>ទាំងអស់</option>
                </select>
              </div>

              {/* Page counter & Navigation buttons */}
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
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                    title="ទំព័រមុន"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  {/* Page numbers */}
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
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
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

      {/* 6. Detail Modal / Drawer - Modern, Compact & Structured */}
      {selectedDetailRow && (() => {
        const rowNum = selectedDetailRow.__rowNumber || 1;
        
        // Helper to find column by predicate
        const findCol = (predicate: (label: string, id: string) => boolean) => 
          columns.find(c => {
            const l = c.label.toLowerCase().trim();
            const id = c.id.toLowerCase().trim();
            return predicate(l, id);
          });

        const colAwbn = awbnCol || findCol(l => l.includes('awb') || l.includes('tracking') || l.includes('code'));
        const colUsd = usdCol || findCol((l, id) => l.includes('usd') || l.includes('$') || id.includes('usd'));
        const colKhm = khmCol || findCol((l, id) => l.includes('khm') || l.includes('khr') || l.includes('riel') || l.includes('៛') || id.includes('khm'));
        const colReceiver = receiverCol || findCol(l => (l.includes('rec') || l.includes('cust') || l.includes('client')) && l.includes('name') || l.includes('receiver') || l.includes('ឈ្មោះ'));
        const colAddress = findCol(l => l.includes('address') || l.includes('addr') || l.includes('ទីតាំង') || l.includes('អាសយដ្ឋាន'));
        const colDest = destCol || findCol(l => l.includes('dest') || l.includes('ទិសដៅ') || l.includes('គោលដៅ'));
        const colHandleBy = handleByCol || findCol(l => l.includes('handle') || l.includes('rider'));
        const colTransferTo = findCol(l => l.includes('transfer'));
        const colDeliveryDate = deliveryDateCol || findCol(l => (l.includes('delivery') && l.includes('date')) || l.includes('delivery') || l.includes('date') || l.includes('ថ្ងៃ'));
        const colCustId = findCol(l => (l.includes('cust') && (l.includes('id') || l.includes('code'))) || l === 'customer id' || l === 'cust id');
        const colUnit = findCol(l => l === 'unit' || l.includes('unit') || l.includes('ចំនួន'));
        const colKg = findCol(l => l === 'kg' || l.includes('weight') || l.includes('ទម្ងន់'));
        const colRemarks = findCol(l => l.includes('remark') || l.includes('note') || l.includes('ចំណាំ'));
        const colCheck = findCol(l => l === 'check' || l.includes('check'));
        const colGotCod = findCol(l => (l.includes('got') && l.includes('cod')) || l === 'got cod');
        const colClear = findCol(l => l === 'clear' || l.includes('clear'));
        const colReturn = findCol(l => l === 'return' || l.includes('return') || l.includes('rtn'));

        const getVal = (col?: SheetColumnDef) => {
          if (!col) return '';
          const v = selectedDetailRow[col.id];
          return (v !== undefined && v !== null) ? String(v).trim() : '';
        };

        const awbnVal = getVal(colAwbn) || (selectedDetailRow['col_1'] ? String(selectedDetailRow['col_1']).trim() : '');
        const usdVal = getVal(colUsd);
        const khmVal = getVal(colKhm);
        const receiverVal = getVal(colReceiver);
        const addressVal = getVal(colAddress);
        const destVal = getVal(colDest);
        const handleByVal = getVal(colHandleBy);
        const transferToVal = getVal(colTransferTo);
        const deliveryDateVal = getVal(colDeliveryDate);
        const custIdVal = getVal(colCustId);
        const unitVal = getVal(colUnit);
        const kgVal = getVal(colKg);
        const remarksVal = getVal(colRemarks);
        const checkVal = getVal(colCheck);
        const gotCodVal = getVal(colGotCod);
        const clearVal = getVal(colClear);
        const returnVal = getVal(colReturn);

        // Find any other columns not mapped into dedicated cards
        const mappedColIds = new Set([
          colAwbn?.id, colUsd?.id, colKhm?.id, colReceiver?.id,
          colAddress?.id, colDest?.id, colHandleBy?.id, colTransferTo?.id,
          colDeliveryDate?.id, colCustId?.id, colUnit?.id, colKg?.id,
          colRemarks?.id, colCheck?.id, colGotCod?.id, colClear?.id, colReturn?.id
        ].filter(Boolean) as string[]);

        const otherCols = columns.filter(c => !mappedColIds.has(c.id));

        return (
          <PackageDetailModal
            accent="blue"
            rowNum={rowNum}
            values={{
              awbn: awbnVal, usd: usdVal, khm: khmVal, receiver: receiverVal, address: addressVal,
              dest: destVal, handleBy: handleByVal, transferTo: transferToVal, deliveryDate: deliveryDateVal,
              custId: custIdVal, unit: unitVal, kg: kgVal, remarks: remarksVal, check: checkVal,
              gotCod: gotCodVal, clear: clearVal, return: returnVal,
            }}
            extraFields={otherCols.map(col => {
              const val = selectedDetailRow[col.id];
              return { id: col.id, label: col.label, value: (val !== undefined && val !== null) ? String(val).trim() : '' };
            })}
            copiedCellId={copiedCellId}
            rowCopied={copiedRowId === 'modal_row'}
            onCopyCell={handleCopyCell}
            onCopyRow={() => handleCopyRow(selectedDetailRow, 'modal_row')}
            onClose={() => setSelectedDetailRow(null)}
          />
        );
      })()}

    </div>
  );
};
