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
  ClipboardCheck,
  User,
  Truck,
  MoreHorizontal,
  ChevronDown,
  ChevronUp
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
  getInitialFollowUpBMConfig, 
  saveFollowUpBMConfig, 
  subscribeToFollowUpBMConfig,
  DEFAULT_FOLLOWUP_BM_SHEET_URL,
  DEFAULT_FOLLOWUP_BM_SHEET_NAME
} from '../services/followUpBMService';

interface FollowUpBMPageProps {
  currentUser: AuthUser | null;
  settings: AppSettings;
  onUpdateSettings?: (newSettings: Partial<AppSettings>) => void;
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

const STORAGE_KEY_FOLLOWUP_URL = 'accounting_followup_bm_sheet_url';
const STORAGE_KEY_FOLLOWUP_SHEET_NAME = 'accounting_followup_bm_sheet_name';
const STORAGE_KEY_FOLLOWUP_CACHED_DATA = 'accounting_followup_bm_cached_rows';
const STORAGE_KEY_FOLLOWUP_CACHED_COLS = 'accounting_followup_bm_cached_cols';
const STORAGE_KEY_FOLLOWUP_LAST_SYNC = 'accounting_followup_bm_last_sync';
const STORAGE_KEY_FOLLOWUP_AUTO_SYNC = 'accounting_followup_bm_auto_sync_enabled';
const STORAGE_KEY_FOLLOWUP_SYNC_INTERVAL = 'accounting_followup_bm_sync_interval';

export const FollowUpBMPage: React.FC<FollowUpBMPageProps> = ({
  currentUser,
  settings,
  onUpdateSettings,
  onShowToast
}) => {
  // Check if current user has Admin privileges
  const isAdmin = useMemo(() => {
    return currentUser?.role === 'ADMIN' || (currentUser?.email ? isMasterAdmin(currentUser.email) : false);
  }, [currentUser]);

  // 1. Initial Config
  const initialUrl = useMemo(() => {
    let url = (settings.followupBmSheetUrl && settings.followupBmSheetUrl.trim()) 
      || localStorage.getItem(STORAGE_KEY_FOLLOWUP_URL) 
      || (import.meta as any).env?.VITE_FOLLOWUP_BM_SHEET_URL 
      || DEFAULT_FOLLOWUP_BM_SHEET_URL;

    if (url && url.includes('1C-CYb14ZM146RiD87yjS_rxGmWk1hib4jkoTDT6O-I8')) {
      url = url.replace('1C-CYb14ZM146RiD87yjS_rxGmWk1hib4jkoTDT6O-I8', '1C-CYb14ZM146RiD87yjS_rxGmWk1hiB4jkoTDT6O-I8');
      try {
        localStorage.setItem(STORAGE_KEY_FOLLOWUP_URL, url);
      } catch (e) {}
    }
    return url;
  }, [settings.followupBmSheetUrl]);

  const initialSheetName = useMemo(() => {
    return (settings.followupBmSheetName && settings.followupBmSheetName.trim()) 
      || localStorage.getItem(STORAGE_KEY_FOLLOWUP_SHEET_NAME) 
      || (import.meta as any).env?.VITE_FOLLOWUP_BM_SHEET_NAME 
      || DEFAULT_FOLLOWUP_BM_SHEET_NAME;
  }, [settings.followupBmSheetName]);

  const [sheetUrl, setSheetUrl] = useState<string>(initialUrl);
  const [tempSheetUrl, setTempSheetUrl] = useState<string>(initialUrl);

  const [sheetName, setSheetName] = useState<string>(initialSheetName);
  const [tempSheetName, setTempSheetName] = useState<string>(initialSheetName);

  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [showHelpGuide, setShowHelpGuide] = useState<boolean>(false);
  const [fetchMethodUsed, setFetchMethodUsed] = useState<string | null>(null);

  // 2. Data State
  const [columns, setColumns] = useState<SheetColumnDef[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_FOLLOWUP_CACHED_COLS);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });

  const [rows, setRows] = useState<SheetRowData[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_FOLLOWUP_CACHED_DATA);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });

  const [lastSynced, setLastSynced] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_FOLLOWUP_LAST_SYNC) || '';
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
    const saved = localStorage.getItem('accounting_followup_bm_scroll_mode');
    return (saved === 'CONTAINER' || saved === 'AUTO_FIT') ? (saved as 'AUTO_FIT' | 'CONTAINER') : 'AUTO_FIT';
  });
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [selectedDetailRow, setSelectedDetailRow] = useState<SheetRowData | null>(null);

  // 4. Column Filters State
  const [deliveryStartDate, setDeliveryStartDate] = useState<string>('');
  const [deliveryEndDate, setDeliveryEndDate] = useState<string>('');
  const [selectedHandleBy, setSelectedHandleBy] = useState<string>('');
  const [selectedDest, setSelectedDest] = useState<string>('');
  const [selectedDelivered, setSelectedDelivered] = useState<string>('');
  const [selectedVerify, setSelectedVerify] = useState<string>('');
  const [isGotCodTodayOnly, setIsGotCodTodayOnly] = useState<boolean>(false);
  const [isBuymedTodayOnly, setIsBuymedTodayOnly] = useState<boolean>(false);
  const [isPendingEmptyOnly, setIsPendingEmptyOnly] = useState<boolean>(false);
  const [isDeliveryOverdue10DaysOnly, setIsDeliveryOverdue10DaysOnly] = useState<boolean>(false);

  // 4.1 Mobile & Modern KPI Controls State
  const [kpiCurrency, setKpiCurrency] = useState<'ALL' | 'USD' | 'KHM'>('ALL');
  const [isKpiCollapsed, setIsKpiCollapsed] = useState<boolean>(false);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState<boolean>(false);
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState<boolean>(false);
  const mobileActionsRef = useRef<HTMLDivElement>(null);

  // 5. Real-Time Auto Sync & Change Watcher State
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_FOLLOWUP_AUTO_SYNC);
    return saved !== null ? saved === 'true' : true;
  });
  const [syncInterval, setSyncInterval] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_FOLLOWUP_SYNC_INTERVAL);
    return saved ? Number(saved) : 10;
  });
  const [countdown, setCountdown] = useState<number>(syncInterval);
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

  useEffect(() => {
    rowsRef.current = rows;
    if (!lastFingerprintRef.current || lastFingerprintRef.current === '[]') {
      lastFingerprintRef.current = JSON.stringify(rows);
    }
  }, [rows]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (autoSyncMenuRef.current && !autoSyncMenuRef.current.contains(e.target as Node)) {
        setIsAutoSyncMenuOpen(false);
      }
      if (mobileActionsRef.current && !mobileActionsRef.current.contains(e.target as Node)) {
        setIsMobileActionsOpen(false);
      }
    };
    if (isAutoSyncMenuOpen || isMobileActionsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAutoSyncMenuOpen, isMobileActionsOpen]);

  const notify = useCallback((msg: string, type: 'success' | 'error' | 'info') => {
    if (onShowToast) {
      onShowToast(msg, type);
    }
  }, [onShowToast]);

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

  const parsedSheet = useMemo(() => {
    return parseGoogleSheetInput(sheetUrl);
  }, [sheetUrl]);

  const spreadsheetId = parsedSheet.spreadsheetId;

  const googleSheetWebUrl = useMemo(() => {
    if (!spreadsheetId) return '';
    let url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    if (parsedSheet.gid) {
      url += `#gid=${parsedSheet.gid}`;
    }
    return url;
  }, [spreadsheetId, parsedSheet.gid]);

  // Fetch Data using Universal Multi-Tier Fetcher
  const fetchGoogleSheetData = useCallback(async (
    targetUrl = sheetUrl, 
    targetSheetName = sheetName, 
    isSilent = false
  ) => {
    const trimmedUrl = targetUrl.trim();
    if (!trimmedUrl) {
      if (!isSilent) {
        setErrorMessage('សូមបញ្ចូល Google Spreadsheet URL ឬ ID សម្រាប់ FollowUp BM!');
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
      const isChanged = newFingerprint !== lastFingerprintRef.current;

      setColumns(result.columns);
      setRows(result.rows);
      setFetchMethodUsed((result as any).fetchMethod || 'Direct');
      setIsRestrictedWarning(false);
      setErrorMessage(null);

      const nowTime = new Date().toISOString();
      setLastSynced(nowTime);

      localStorage.setItem(STORAGE_KEY_FOLLOWUP_CACHED_COLS, JSON.stringify(result.columns));
      localStorage.setItem(STORAGE_KEY_FOLLOWUP_CACHED_DATA, JSON.stringify(result.rows));
      localStorage.setItem(STORAGE_KEY_FOLLOWUP_LAST_SYNC, nowTime);

      lastFingerprintRef.current = newFingerprint;

      if (!isSilent) {
        notify(`បានទាញយកទិន្នន័យ FollowUp BM ជោគជ័យ! (${result.rows.length} ជួរ)`, 'success');
      } else if (isChanged && rowsRef.current.length > 0) {
        notify(`Google Sheets បានធ្វើបច្ចុប្បន្នភាព! (${result.rows.length} ជួរ)`, 'info');
      }
    } catch (err: any) {
      console.error('FollowUp_BM fetch error:', err);
      if (!isSilent) {
        const msg = err?.message || 'មានបញ្ហាក្នុងការភ្ជាប់ទៅ Google Sheets';
        setErrorMessage(msg);
        notify(msg, 'error');
      }
    } finally {
      isFetchingRef.current = false;
      if (!isSilent) {
        setIsLoading(false);
      } else {
        setIsSyncingInBackground(false);
      }
    }
  }, [sheetUrl, sheetName, notify]);

  // Real-time Supabase synchronization
  useEffect(() => {
    const unsubscribe = subscribeToFollowUpBMConfig((remoteConfig) => {
      if (remoteConfig.sheetUrl && remoteConfig.sheetUrl !== sheetUrl) {
        setSheetUrl(remoteConfig.sheetUrl);
        setTempSheetUrl(remoteConfig.sheetUrl);
        if (remoteConfig.sheetName !== undefined) {
          setSheetName(remoteConfig.sheetName);
          setTempSheetName(remoteConfig.sheetName);
        }
        fetchGoogleSheetData(remoteConfig.sheetUrl, remoteConfig.sheetName || '');
      }
    });
    return () => unsubscribe();
  }, [sheetUrl, fetchGoogleSheetData]);

  // Real-Time Background Watcher Timer
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

  // Watch action on window focus / tab visibility change
  useEffect(() => {
    if (!isAutoSyncEnabled || !sheetUrl.trim()) return;

    const handleFocus = () => {
      fetchGoogleSheetData(sheetUrl, sheetName, true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchGoogleSheetData(sheetUrl, sheetName, true);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAutoSyncEnabled, sheetUrl, sheetName, fetchGoogleSheetData]);

  // Auto-sync when settings are received
  useEffect(() => {
    if (settings.followupBmSheetUrl && settings.followupBmSheetUrl.trim()) {
      const u = settings.followupBmSheetUrl.trim();
      const n = (settings.followupBmSheetName && settings.followupBmSheetName.trim()) || '';
      if (u !== sheetUrl) {
        setSheetUrl(u);
        setTempSheetUrl(u);
        setSheetName(n);
        setTempSheetName(n);
        localStorage.setItem(STORAGE_KEY_FOLLOWUP_URL, u);
        if (n) localStorage.setItem(STORAGE_KEY_FOLLOWUP_SHEET_NAME, n);
        setIsConfigOpen(false);
        if (rows.length === 0) {
          fetchGoogleSheetData(u, n);
        }
      }
    }
  }, [settings.followupBmSheetUrl, settings.followupBmSheetName]);

  // Auto fetch on first mount if URL is available
  useEffect(() => {
    if (sheetUrl.trim() && rows.length === 0) {
      fetchGoogleSheetData(sheetUrl, sheetName);
    }
  }, [sheetUrl, sheetName, rows.length, fetchGoogleSheetData]);

  // Active query to central Google Sheets "Settings" tab on load if sheetUrl is not yet set
  useEffect(() => {
    if (!sheetUrl.trim() && settings.webAppUrl?.trim()) {
      fetch(`${settings.webAppUrl.trim()}?action=get_settings&t=${Date.now()}`)
        .then(r => r.json())
        .then(res => {
          if (res?.data?.followupBmSheetUrl && res.data.followupBmSheetUrl.trim()) {
            const u = res.data.followupBmSheetUrl.trim();
            const n = res.data.followupBmSheetName ? res.data.followupBmSheetName.trim() : '';
            setSheetUrl(u);
            setTempSheetUrl(u);
            setSheetName(n);
            setTempSheetName(n);
            localStorage.setItem(STORAGE_KEY_FOLLOWUP_URL, u);
            if (n) localStorage.setItem(STORAGE_KEY_FOLLOWUP_SHEET_NAME, n);
            setIsConfigOpen(false);
            fetchGoogleSheetData(u, n);
          }
        })
        .catch(() => {});
    }
  }, [sheetUrl, settings.webAppUrl, fetchGoogleSheetData]);

  // Handle Save Configuration
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

    localStorage.setItem(STORAGE_KEY_FOLLOWUP_URL, trimmedUrl);
    if (trimmedName) {
      localStorage.setItem(STORAGE_KEY_FOLLOWUP_SHEET_NAME, trimmedName);
    } else {
      localStorage.removeItem(STORAGE_KEY_FOLLOWUP_SHEET_NAME);
    }

    setIsConfigOpen(false);
    fetchGoogleSheetData(trimmedUrl, trimmedName);

    // 1. Sync to global AppSettings (updates App.tsx state & local storage)
    if (onUpdateSettings) {
      onUpdateSettings({
        followupBmSheetUrl: trimmedUrl,
        followupBmSheetName: trimmedName
      });
    }

    // 2. Sync to Supabase Cloud Database
    await saveFollowUpBMConfig({
      sheetUrl: trimmedUrl,
      sheetName: trimmedName,
      updatedBy: currentUser?.email || 'admin'
    });

    // 3. Sync to central Google Sheets "Settings" tab (via Web App API)
    if (settings.webAppUrl?.trim()) {
      const targetUrl = settings.webAppUrl.trim();
      const payload = {
        action: 'save_settings',
        settings: {
          followupBmSheetUrl: trimmedUrl,
          followupBmSheetName: trimmedName
        },
        user: currentUser?.email
      };

      try {
        fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
          mode: 'no-cors'
        }).catch(() => {});
      } catch (e) {}
    }

    notify('បានរក្សាទុក Link Google Sheets សម្រាប់ FollowUp BM ជោគជ័យ!', 'success');
  };

  // Identify special filter columns dynamically
  const deliveryDateCol = useMemo(() => {
    return columns.find(c => {
      const l = (c.id + ' ' + c.label).toLowerCase().trim();
      return (l.includes('delivery') && l.includes('date')) || l.includes('delivery date');
    }) || columns.find(c => {
      const l = (c.id + ' ' + c.label).toLowerCase().trim();
      return l.includes('delivery');
    }) || columns.find(c => {
      const l = (c.id + ' ' + c.label).toLowerCase().trim();
      return l.includes('date') && !l.includes('cod');
    });
  }, [columns]);

  const handleByCol = useMemo(() => {
    return columns.find(c => {
      const l = c.label.toLowerCase().trim();
      return l.includes('handle') || l.includes('handler') || l.includes('rider');
    });
  }, [columns]);

  const destCol = useMemo(() => {
    return columns.find(c => {
      const l = c.label.toLowerCase().trim();
      return l.includes('dest');
    });
  }, [columns]);

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

  const verifyCol = useMemo(() => {
    return columns.find(c => {
      const l = (c.id + ' ' + c.label).toLowerCase().trim();
      return l === 'verify' || l.includes('verify') || l.includes('verification') || l.includes('ផ្ទៀងផ្ទាត់');
    });
  }, [columns]);

  const deliveredCol = useMemo(() => {
    return columns.find(c => {
      const l = c.label.toLowerCase().trim();
      return l === 'delivered' || (l.includes('deliver') && !l.includes('date'));
    });
  }, [columns]);

  const gotCodDateCol = useMemo(() => {
    // 1. First priority: column that contains both "cod" and "date" (e.g. "GOT COD(DATE)", "COD DATE", "GOT COD DATE")
    const withCodAndDate = columns.find(c => {
      const l = (c.id + ' ' + c.label).toLowerCase().trim();
      const norm = l.replace(/[\s\-_()]/g, '');
      const hasCod = norm.includes('cod');
      const hasDate = norm.includes('date') || l.includes('កាលបរិច្ឆេទ') || l.includes('ថ្ងៃ');
      return hasCod && hasDate;
    });
    if (withCodAndDate) return withCodAndDate;

    // 2. Second priority: column whose normalized label is 'gotcoddate'
    const exactGotCodDate = columns.find(c => {
      const norm = c.label.toLowerCase().trim().replace(/[\s\-_()]/g, '');
      return norm === 'gotcoddate';
    });
    if (exactGotCodDate) return exactGotCodDate;

    // 3. Fallback: column containing 'gotcod'
    return columns.find(c => {
      const l = (c.id + ' ' + c.label).toLowerCase().trim();
      const norm = l.replace(/[\s\-_()]/g, '');
      return norm.includes('gotcod');
    });
  }, [columns]);

  // Column detection for BUYMED(date) = TODAY
  const buymedDateCol = useMemo(() => {
    // 1. Column that contains both "buymed" and "date" (e.g. "BUYMED(date)", "BUYMED(DATE)", "BUYMED DATE")
    const withBuymedAndDate = columns.find(c => {
      const l = (c.id + ' ' + c.label).toLowerCase().trim();
      const norm = l.replace(/[\s\-_()]/g, '');
      const hasBuymed = norm.includes('buymed');
      const hasDate = norm.includes('date') || l.includes('កាលបរិច្ឆេទ') || l.includes('ថ្ងៃ');
      return hasBuymed && hasDate;
    });
    if (withBuymedAndDate) return withBuymedAndDate;

    // 2. Normalized label equals 'buymeddate'
    const exactBuymedDate = columns.find(c => {
      const norm = c.label.toLowerCase().trim().replace(/[\s\-_()]/g, '');
      return norm === 'buymeddate';
    });
    if (exactBuymedDate) return exactBuymedDate;

    // 3. Fallback: column containing 'buymed'
    return columns.find(c => {
      const l = (c.id + ' ' + c.label).toLowerCase().trim();
      const norm = l.replace(/[\s\-_()]/g, '');
      return norm.includes('buymed');
    });
  }, [columns]);

  // Specific Columns for Pending/Empty condition: GOT COD, RETURN, BUYMED, CLEAR
  const gotCodCol = useMemo(() => {
    return columns.find(c => {
      const l = (c.id + ' ' + c.label).toLowerCase().trim();
      const norm = l.replace(/[\s\-_()]/g, '');
      return (norm === 'gotcod' || norm.includes('gotcod')) && !norm.includes('date');
    });
  }, [columns]);

  const returnCol = useMemo(() => {
    return columns.find(c => {
      const l = (c.id + ' ' + c.label).toLowerCase().trim();
      const norm = l.replace(/[\s\-_()]/g, '');
      return norm === 'return' || norm.includes('return') || l.includes('ត្រឡប់');
    });
  }, [columns]);

  const buymedCol = useMemo(() => {
    return columns.find(c => {
      const l = (c.id + ' ' + c.label).toLowerCase().trim();
      const norm = l.replace(/[\s\-_()]/g, '');
      return (norm === 'buymed' || norm.includes('buymed')) && !norm.includes('date');
    }) || columns.find(c => {
      const l = (c.id + ' ' + c.label).toLowerCase().trim();
      const norm = l.replace(/[\s\-_()]/g, '');
      return norm === 'buymed' || norm.includes('buymed');
    });
  }, [columns]);

  const clearCol = useMemo(() => {
    return columns.find(c => {
      const l = (c.id + ' ' + c.label).toLowerCase().trim();
      const norm = l.replace(/[\s\-_()]/g, '');
      return norm === 'clear' || norm.includes('clear') || l.includes('សំអាត');
    });
  }, [columns]);

  // Determine responsive visibility class for each column:
  // - Mobile (< 768px): Show only AWBN, DELIVERY DATE, HANDLE BY
  // - iPad (768px - 1279px): Show only AWBN, DELIVERY DATE, USD, KHM, VERIFY, GOT COD, HANDLE BY
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
    const isHandleBy = (handleByCol && handleByCol.id === id) || l.includes('handle') || l.includes('handler') || l.includes('rider');
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

    // 6. VERIFY -> Show on iPad and Desktop, hidden on Mobile
    const isVerify = (verifyCol && verifyCol.id === id) || l.includes('verify') || l.includes('verification');
    if (isVerify) {
      return 'hidden md:table-cell';
    }

    // 7. GOT COD(DATE) & BUYMED(DATE) -> Show on iPad and Desktop, hidden on Mobile
    const isGotCod = (gotCodDateCol && gotCodDateCol.id === id) || l.includes('got cod') || l.includes('gotcod');
    const isBuymedDate = (buymedDateCol && buymedDateCol.id === id) || l.includes('buymed');
    if (isGotCod || isBuymedDate) {
      return 'hidden md:table-cell';
    }

    // 8. All other columns (RECEIVER NAME, RECEIVER ADDRESS, TRANSFER TO, DEST, etc.)
    // Show ONLY on Desktop (>= 1280px), hidden on Mobile & iPad
    return 'hidden xl:table-cell';
  }, [awbnCol, deliveryDateCol, handleByCol, usdCol, khmCol, verifyCol, gotCodDateCol, buymedDateCol]);

  // Unique options for Dropdown filters
  const handleByOptions = useMemo(() => {
    if (!handleByCol) return [];
    const set = new Set<string>();
    rows.forEach(r => {
      const val = r[handleByCol.id];
      if (val !== undefined && val !== null && String(val).trim()) {
        set.add(String(val).trim());
      }
    });
    return Array.from(set).sort();
  }, [rows, handleByCol]);

  const destOptions = useMemo(() => {
    if (!destCol) return [];
    const set = new Set<string>();
    rows.forEach(r => {
      const val = r[destCol.id];
      if (val !== undefined && val !== null && String(val).trim()) {
        set.add(String(val).trim());
      }
    });
    return Array.from(set).sort();
  }, [rows, destCol]);

  const deliveredOptions = useMemo(() => {
    if (!deliveredCol) return [];
    const set = new Set<string>();
    rows.forEach(r => {
      const val = r[deliveredCol.id];
      if (val !== undefined && val !== null && String(val).trim()) {
        set.add(String(val).trim());
      }
    });
    return Array.from(set).sort();
  }, [rows, deliveredCol]);

  // Helper to determine if a cell is empty or false
  const isCellEmpty = useCallback((val: any): boolean => {
    if (val === undefined || val === null) return true;
    const s = String(val).trim().toLowerCase();
    return s === '' || s === '-' || s === 'false';
  }, []);

  // Standardize dates to YYYY-MM-DD
  const toIsoDateString = useCallback((raw: any): string | null => {
    if (!raw) return null;
    const str = String(raw).trim();
    if (!str) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    // 1. Format: YYYY-MM-DD or YYYY/MM/DD
    const ymd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (ymd) {
      const year = Number(ymd[1]);
      const month = String(ymd[2]).padStart(2, '0');
      const day = String(ymd[3]).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // 2. Format: DD-Mon-YYYY or DD Mon YYYY (e.g. 30-Sep-2026, 30-Sep-26, 30/Sep/2026)
    const monthsMap: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const dMonY = str.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})$/);
    if (dMonY) {
      const day = String(dMonY[1]).padStart(2, '0');
      const mKey = dMonY[2].slice(0, 3).toLowerCase();
      const month = monthsMap[mKey];
      let year = Number(dMonY[3]);
      if (year < 100) year += 2000;
      if (month) return `${year}-${month}-${day}`;
    }

    // 3. Format: Mon-DD-YYYY or Mon DD, YYYY (e.g. Sep 30, 2026)
    const monDY = str.match(/^([A-Za-z]{3,})[-/\s](\d{1,2})[,-\s]+(\d{2,4})$/);
    if (monDY) {
      const mKey = monDY[1].slice(0, 3).toLowerCase();
      const month = monthsMap[mKey];
      const day = String(monDY[2]).padStart(2, '0');
      let year = Number(monDY[3]);
      if (year < 100) year += 2000;
      if (month) return `${year}-${month}-${day}`;
    }

    // 4. Format: DD-MM-YYYY or DD/MM/YYYY
    const dmy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (dmy) {
      let year = Number(dmy[3]);
      if (year < 100) year += 2000;
      const month = String(dmy[2]).padStart(2, '0');
      const day = String(dmy[1]).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // 5. Fallback Date parsing
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    return null;
  }, []);

  // Calculate calendar days elapsed from delivery date to today
  const getDeliveryDaysElapsed = useCallback((rawDate: any): number | null => {
    if (!rawDate) return null;
    const iso = toIsoDateString(rawDate);
    if (!iso) return null;
    const parts = iso.split('-').map(Number);
    if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return null;

    const deliveryMidnight = new Date(parts[0], parts[1] - 1, parts[2]).setHours(0, 0, 0, 0);
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).setHours(0, 0, 0, 0);

    const diffMs = todayMidnight - deliveryMidnight;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }, [toIsoDateString]);

  // Today ISO date (YYYY-MM-DD)
  const todayIso = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const hasActiveFilters = Boolean(
    searchTerm.trim() || 
    deliveryStartDate || 
    deliveryEndDate || 
    selectedHandleBy || 
    selectedDest || 
    selectedDelivered || 
    selectedVerify || 
    isGotCodTodayOnly || 
    isBuymedTodayOnly || 
    isPendingEmptyOnly || 
    isDeliveryOverdue10DaysOnly
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim()) count++;
    if (deliveryStartDate || deliveryEndDate) count++;
    if (selectedHandleBy) count++;
    if (selectedDest) count++;
    if (selectedDelivered) count++;
    if (selectedVerify) count++;
    if (isGotCodTodayOnly) count++;
    if (isBuymedTodayOnly) count++;
    if (isPendingEmptyOnly) count++;
    if (isDeliveryOverdue10DaysOnly) count++;
    return count;
  }, [
    searchTerm,
    deliveryStartDate,
    deliveryEndDate,
    selectedHandleBy,
    selectedDest,
    selectedDelivered,
    selectedVerify,
    isGotCodTodayOnly,
    isBuymedTodayOnly,
    isPendingEmptyOnly,
    isDeliveryOverdue10DaysOnly,
  ]);

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setDeliveryStartDate('');
    setDeliveryEndDate('');
    setSelectedHandleBy('');
    setSelectedDest('');
    setSelectedDelivered('');
    setSelectedVerify('');
    setIsGotCodTodayOnly(false);
    setIsBuymedTodayOnly(false);
    setIsPendingEmptyOnly(false);
    setIsDeliveryOverdue10DaysOnly(false);
    setCurrentPage(1);
    notify('បានសម្អាត Filter ទាំងអស់', 'info');
  };

  // Filtered & Sorted Rows
  const filteredAndSortedRows = useMemo(() => {
    let result = [...rows];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(row => {
        return Object.entries(row).some(([k, v]) => {
          if (k.startsWith('_')) return false;
          if (v === undefined || v === null) return false;
          return String(v).toLowerCase().includes(q);
        });
      });
    }

    if (deliveryDateCol && (deliveryStartDate || deliveryEndDate)) {
      result = result.filter(row => {
        const rawDate = row[deliveryDateCol.id];
        const rowIso = toIsoDateString(rawDate);
        if (!rowIso) return false;

        if (deliveryStartDate && rowIso < deliveryStartDate) return false;
        if (deliveryEndDate && rowIso > deliveryEndDate) return false;
        return true;
      });
    }

    if (handleByCol && selectedHandleBy) {
      result = result.filter(row => {
        const val = row[handleByCol.id];
        return val !== undefined && val !== null && String(val).trim() === selectedHandleBy;
      });
    }

    if (destCol && selectedDest) {
      result = result.filter(row => {
        const val = row[destCol.id];
        return val !== undefined && val !== null && String(val).trim() === selectedDest;
      });
    }

    if (deliveredCol && selectedDelivered) {
      result = result.filter(row => {
        const val = row[deliveredCol.id];
        const str = (val !== undefined && val !== null ? String(val) : '').trim();
        const strLower = str.toLowerCase();
        if (selectedDelivered === '__DELIVERED__') {
          return strLower === 'delivered';
        }
        if (selectedDelivered === '__NOT_DELIVERED__') {
          return strLower !== 'delivered' || str === '';
        }
        return strLower === selectedDelivered.toLowerCase();
      });
    }

    if (verifyCol && selectedVerify) {
      result = result.filter(row => {
        const val = row[verifyCol.id];
        const str = (val !== undefined && val !== null ? String(val) : '').trim().toLowerCase();
        if (selectedVerify === '__NOT_PAID__') {
          return str !== 'paid';
        }
        if (selectedVerify === '__PAID__') {
          return str === 'paid';
        }
        return str === selectedVerify.toLowerCase();
      });
    }

    if (gotCodDateCol && isGotCodTodayOnly) {
      result = result.filter(row => {
        const val = row[gotCodDateCol.id];
        const dateIso = toIsoDateString(val);
        return dateIso === todayIso;
      });
    }

    if (buymedDateCol && isBuymedTodayOnly) {
      result = result.filter(row => {
        const val = row[buymedDateCol.id];
        const dateIso = toIsoDateString(val);
        return dateIso === todayIso;
      });
    }

    if (isPendingEmptyOnly) {
      result = result.filter(row => {
        const isGotCodEmpty = !gotCodCol || isCellEmpty(row[gotCodCol.id]);
        const isReturnEmpty = !returnCol || isCellEmpty(row[returnCol.id]);
        const isBuymedEmpty = !buymedCol || isCellEmpty(row[buymedCol.id]);
        const isClearEmpty = !clearCol || isCellEmpty(row[clearCol.id]);
        return isGotCodEmpty && isReturnEmpty && isBuymedEmpty && isClearEmpty;
      });
    }

    if (deliveryDateCol && isDeliveryOverdue10DaysOnly) {
      result = result.filter(row => {
        // Verify != 'paid'
        const rawVerify = verifyCol ? row[verifyCol.id] : '';
        const verifyStr = (rawVerify !== undefined && rawVerify !== null ? String(rawVerify) : '').trim().toLowerCase();
        if (verifyStr === 'paid') return false;

        // Delivery Date >= 10 days
        const rawDate = row[deliveryDateCol.id];
        const days = getDeliveryDaysElapsed(rawDate);
        return days !== null && days >= 10;
      });
    }

    if (sortColumn) {
      result.sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;

        const aNum = Number(String(aVal).replace(/,/g, '').replace(/\$/g, '').replace(/៛/g, '').trim());
        const bNum = Number(String(bVal).replace(/,/g, '').replace(/\$/g, '').replace(/៛/g, '').trim());
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortDirection === 'ASC' ? aNum - bNum : bNum - aNum;
        }

        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        return sortDirection === 'ASC' 
          ? aStr.localeCompare(bStr) 
          : bStr.localeCompare(aStr);
      });
    }

    return result;
  }, [
    rows, 
    searchTerm, 
    deliveryStartDate, 
    deliveryEndDate, 
    selectedHandleBy, 
    selectedDest, 
    selectedDelivered,
    selectedVerify,
    isGotCodTodayOnly,
    isBuymedTodayOnly,
    isPendingEmptyOnly,
    isDeliveryOverdue10DaysOnly,
    deliveryDateCol, 
    handleByCol, 
    destCol, 
    deliveredCol,
    verifyCol,
    gotCodDateCol,
    buymedDateCol,
    todayIso,
    sortColumn, 
    sortDirection,
    toIsoDateString,
    getDeliveryDaysElapsed
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

  const handleCopyCell = (text: any, id: string) => {
    if (text === undefined || text === null) return;
    navigator.clipboard.writeText(String(text));
    setCopiedCellId(id);
    setTimeout(() => setCopiedCellId(null), 1500);
  };

  const handleCopyRow = (row: SheetRowData, rowId: string) => {
    const line = columns.map(c => row[c.id] || '').join('\t');
    navigator.clipboard.writeText(line);
    setCopiedRowId(rowId);
    setTimeout(() => setCopiedRowId(null), 1500);
  };

  const handleExportCSV = () => {
    if (filteredAndSortedRows.length === 0) {
      notify('ពុំមានទិន្នន័យសម្រាប់ទាញយកឡើយ', 'info');
      return;
    }

    const headerLine = columns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',');
    const dataLines = filteredAndSortedRows.map(row => {
      return columns.map(c => {
        const val = row[c.id];
        const str = val !== undefined && val !== null ? String(val) : '';
        return `"${str.replace(/"/g, '""')}"`;
      }).join(',');
    });

    const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `FollowUp_BM_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notify('បានទាញយកឯកសារ CSV ជោគជ័យ!', 'success');
  };

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

  // Unpaid / VERIFY != 'Paid' Summary Stats
  const unpaidStats = useMemo(() => {
    let usdTotal = 0;
    let usdCount = 0;
    let khmTotal = 0;
    let khmCount = 0;
    let unpaidRowsCount = 0;

    if (!verifyCol) {
      return {
        usdTotal: 0,
        usdCount: 0,
        khmTotal: 0,
        khmCount: 0,
        unpaidRowsCount: 0,
        hasVerifyCol: false,
      };
    }

    filteredAndSortedRows.forEach(row => {
      const rawVerify = row[verifyCol.id];
      const verifyStr = (rawVerify !== undefined && rawVerify !== null ? String(rawVerify) : '').trim().toLowerCase();
      
      // ខុសពី Paid (all values not equal to 'paid')
      if (verifyStr !== 'paid') {
        unpaidRowsCount++;

        if (usdCol) {
          const rawUsd = row[usdCol.id];
          if (rawUsd !== undefined && rawUsd !== null && String(rawUsd).trim() !== '') {
            const num = Number(String(rawUsd).replace(/,/g, '').replace(/\$/g, '').trim());
            if (!isNaN(num)) {
              usdTotal += num;
              usdCount++;
            }
          }
        }

        if (khmCol) {
          const rawKhm = row[khmCol.id];
          if (rawKhm !== undefined && rawKhm !== null && String(rawKhm).trim() !== '') {
            const num = Number(String(rawKhm).replace(/,/g, '').replace(/៛/g, '').replace(/\$/g, '').trim());
            if (!isNaN(num)) {
              khmTotal += num;
              khmCount++;
            }
          }
        }
      }
    });

    return {
      usdTotal,
      usdCount,
      khmTotal,
      khmCount,
      unpaidRowsCount,
      hasVerifyCol: true,
    };
  }, [filteredAndSortedRows, verifyCol, usdCol, khmCol]);

  // GOT COD(DATE) = TODAY Summary Stats
  const gotCodTodayStats = useMemo(() => {
    let usdTotal = 0;
    let usdCount = 0;
    let khmTotal = 0;
    let khmCount = 0;
    let todayRowsCount = 0;

    if (!gotCodDateCol) {
      return {
        usdTotal: 0,
        usdCount: 0,
        khmTotal: 0,
        khmCount: 0,
        todayRowsCount: 0,
        hasGotCodDateCol: false,
      };
    }

    filteredAndSortedRows.forEach(row => {
      const rawDate = row[gotCodDateCol.id];
      const dateIso = toIsoDateString(rawDate);

      // GOT COD(DATE) = TODAY
      if (dateIso && dateIso === todayIso) {
        todayRowsCount++;

        if (usdCol) {
          const rawUsd = row[usdCol.id];
          if (rawUsd !== undefined && rawUsd !== null && String(rawUsd).trim() !== '') {
            const num = Number(String(rawUsd).replace(/,/g, '').replace(/\$/g, '').trim());
            if (!isNaN(num)) {
              usdTotal += num;
              usdCount++;
            }
          }
        }

        if (khmCol) {
          const rawKhm = row[khmCol.id];
          if (rawKhm !== undefined && rawKhm !== null && String(rawKhm).trim() !== '') {
            const num = Number(String(rawKhm).replace(/,/g, '').replace(/៛/g, '').replace(/\$/g, '').trim());
            if (!isNaN(num)) {
              khmTotal += num;
              khmCount++;
            }
          }
        }
      }
    });

    return {
      usdTotal,
      usdCount,
      khmTotal,
      khmCount,
      todayRowsCount,
      hasGotCodDateCol: true,
    };
  }, [filteredAndSortedRows, gotCodDateCol, todayIso, usdCol, khmCol, toIsoDateString]);

  // BUYMED(DATE) = TODAY Summary Stats
  const buymedTodayStats = useMemo(() => {
    let usdTotal = 0;
    let usdCount = 0;
    let khmTotal = 0;
    let khmCount = 0;
    let todayRowsCount = 0;

    if (!buymedDateCol) {
      return {
        usdTotal: 0,
        usdCount: 0,
        khmTotal: 0,
        khmCount: 0,
        todayRowsCount: 0,
        hasBuymedDateCol: false,
      };
    }

    filteredAndSortedRows.forEach(row => {
      const rawDate = row[buymedDateCol.id];
      const dateIso = toIsoDateString(rawDate);

      // BUYMED(DATE) = TODAY
      if (dateIso && dateIso === todayIso) {
        todayRowsCount++;

        if (usdCol) {
          const rawUsd = row[usdCol.id];
          if (rawUsd !== undefined && rawUsd !== null && String(rawUsd).trim() !== '') {
            const num = Number(String(rawUsd).replace(/,/g, '').replace(/\$/g, '').trim());
            if (!isNaN(num)) {
              usdTotal += num;
              usdCount++;
            }
          }
        }

        if (khmCol) {
          const rawKhm = row[khmCol.id];
          if (rawKhm !== undefined && rawKhm !== null && String(rawKhm).trim() !== '') {
            const num = Number(String(rawKhm).replace(/,/g, '').replace(/៛/g, '').replace(/\$/g, '').trim());
            if (!isNaN(num)) {
              khmTotal += num;
              khmCount++;
            }
          }
        }
      }
    });

    return {
      usdTotal,
      usdCount,
      khmTotal,
      khmCount,
      todayRowsCount,
      hasBuymedDateCol: true,
    };
  }, [filteredAndSortedRows, buymedDateCol, todayIso, usdCol, khmCol, toIsoDateString]);

  // Summary Stats for: GOT COD = empty AND RETURN = empty AND BUYMED = empty AND CLEAR = empty
  const pendingEmptyStats = useMemo(() => {
    let usdTotal = 0;
    let usdCount = 0;
    let khmTotal = 0;
    let khmCount = 0;
    let pendingRowsCount = 0;

    const hasAnyTargetCol = Boolean(gotCodCol || returnCol || buymedCol || clearCol);
    if (!hasAnyTargetCol) {
      return {
        usdTotal: 0,
        usdCount: 0,
        khmTotal: 0,
        khmCount: 0,
        pendingRowsCount: 0,
        hasColumns: false,
      };
    }

    filteredAndSortedRows.forEach(row => {
      const isGotCodEmpty = !gotCodCol || isCellEmpty(row[gotCodCol.id]);
      const isReturnEmpty = !returnCol || isCellEmpty(row[returnCol.id]);
      const isBuymedEmpty = !buymedCol || isCellEmpty(row[buymedCol.id]);
      const isClearEmpty = !clearCol || isCellEmpty(row[clearCol.id]);

      if (isGotCodEmpty && isReturnEmpty && isBuymedEmpty && isClearEmpty) {
        pendingRowsCount++;

        if (usdCol) {
          const rawUsd = row[usdCol.id];
          if (rawUsd !== undefined && rawUsd !== null && String(rawUsd).trim() !== '') {
            const num = Number(String(rawUsd).replace(/,/g, '').replace(/\$/g, '').trim());
            if (!isNaN(num)) {
              usdTotal += num;
              usdCount++;
            }
          }
        }

        if (khmCol) {
          const rawKhm = row[khmCol.id];
          if (rawKhm !== undefined && rawKhm !== null && String(rawKhm).trim() !== '') {
            const num = Number(String(rawKhm).replace(/,/g, '').replace(/៛/g, '').replace(/\$/g, '').trim());
            if (!isNaN(num)) {
              khmTotal += num;
              khmCount++;
            }
          }
        }
      }
    });

    return {
      usdTotal,
      usdCount,
      khmTotal,
      khmCount,
      pendingRowsCount,
      hasColumns: true,
    };
  }, [filteredAndSortedRows, gotCodCol, returnCol, buymedCol, clearCol, usdCol, khmCol, isCellEmpty]);

  // Summary Stats for: DELIVERY DATE >= 10 days AND VERIFY != 'Paid'
  const deliveryOverdue10DaysStats = useMemo(() => {
    let usdTotal = 0;
    let usdCount = 0;
    let khmTotal = 0;
    let khmCount = 0;
    let overdueRowsCount = 0;

    if (!deliveryDateCol) {
      return {
        usdTotal: 0,
        usdCount: 0,
        khmTotal: 0,
        khmCount: 0,
        overdueRowsCount: 0,
        hasDeliveryDateCol: false,
      };
    }

    filteredAndSortedRows.forEach(row => {
      // 1. Verify != 'paid' (all values not equal to 'paid')
      const rawVerify = verifyCol ? row[verifyCol.id] : '';
      const verifyStr = (rawVerify !== undefined && rawVerify !== null ? String(rawVerify) : '').trim().toLowerCase();
      if (verifyStr === 'paid') return;

      // 2. Delivery Date >= 10 days
      const rawDate = row[deliveryDateCol.id];
      const days = getDeliveryDaysElapsed(rawDate);
      if (days === null || days < 10) return;

      overdueRowsCount++;

      if (usdCol) {
        const rawUsd = row[usdCol.id];
        if (rawUsd !== undefined && rawUsd !== null && String(rawUsd).trim() !== '') {
          const num = Number(String(rawUsd).replace(/,/g, '').replace(/\$/g, '').trim());
          if (!isNaN(num)) {
            usdTotal += num;
            usdCount++;
          }
        }
      }

      if (khmCol) {
        const rawKhm = row[khmCol.id];
        if (rawKhm !== undefined && rawKhm !== null && String(rawKhm).trim() !== '') {
          const num = Number(String(rawKhm).replace(/,/g, '').replace(/៛/g, '').replace(/\$/g, '').trim());
          if (!isNaN(num)) {
            khmTotal += num;
            khmCount++;
          }
        }
      }
    });

    return {
      usdTotal,
      usdCount,
      khmTotal,
      khmCount,
      overdueRowsCount,
      hasDeliveryDateCol: true,
    };
  }, [filteredAndSortedRows, deliveryDateCol, verifyCol, usdCol, khmCol, getDeliveryDaysElapsed]);

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
    <div className={`space-y-2.5 sm:space-y-3.5 pb-24 lg:pb-10 transition-all ${
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
        <div className="absolute top-0 right-0 w-64 h-32 bg-gradient-to-bl from-purple-500/10 via-violet-500/5 to-transparent rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 relative z-10">
          {/* Left: Branding & Status */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 via-violet-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-sm shadow-purple-500/20 shrink-0">
              <ClipboardCheck className="w-4 h-4 text-white" />
            </div>
            
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight">
                FollowUp BM
              </h1>

              {/* Status Badge */}
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                <span>{fetchMethodUsed ? `Live (${fetchMethodUsed})` : 'Live'}</span>
              </span>
            </div>
          </div>

          {/* Right: Tools & Action Buttons Toolbar */}
          <div className="flex items-center gap-1.5 flex-wrap sm:justify-end">
            {/* Real-Time Auto-Sync & Change Watcher Control */}
            <div className="relative" ref={autoSyncMenuRef}>
              <button
                type="button"
                onClick={() => setIsAutoSyncMenuOpen(!isAutoSyncMenuOpen)}
                className={`px-2 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
                  isAutoSyncEnabled
                    ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800 shadow-2xs hover:bg-purple-100 dark:hover:bg-purple-900/60'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                }`}
                title="កំណត់ Auto-Sync & Real-Time Watcher"
              >
                {isAutoSyncEnabled ? (
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75 ${isSyncingInBackground ? 'duration-500' : ''}`} />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
                  </span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                )}
                
                <span className="flex items-center gap-1 font-mono text-[11px]">
                  {isSyncingInBackground ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin text-purple-600" />
                      <span className="hidden sm:inline">Syncing...</span>
                    </>
                  ) : isAutoSyncEnabled ? (
                    <>
                      <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                      <span>{countdown}s</span>
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
                        localStorage.setItem(STORAGE_KEY_FOLLOWUP_AUTO_SYNC, String(next));
                        notify(next ? 'បានបើក Auto-Sync & Change Watcher!' : 'បានបិទ Auto-Sync', 'info');
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between font-semibold cursor-pointer"
                    >
                      <span>ស្ថានភាព Watcher</span>
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
                              localStorage.setItem(STORAGE_KEY_FOLLOWUP_SYNC_INTERVAL, String(sec));
                              setIsAutoSyncMenuOpen(false);
                              notify(`បានកំណត់ Auto-Sync រៀងរាល់ ${sec} វិនាទី!`, 'success');
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition ${
                              syncInterval === sec 
                                ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 font-bold' 
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <span>រៀងរាល់ {sec} វិនាទី {sec === 5 ? '(លឿនបំផុត)' : sec === 10 ? '(ណែនាំ)' : ''}</span>
                            {syncInterval === sec && <Check className="w-3.5 h-3.5 text-purple-600" />}
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

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => fetchGoogleSheetData()}
              disabled={isLoading || !sheetUrl.trim()}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs shadow-purple-500/20 flex items-center gap-1 transition disabled:opacity-50 cursor-pointer active:scale-95"
              title="ទាញយកទិន្នន័យឡើងវិញពី Google Sheets"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? '...' : 'Refresh'}</span>
            </button>

            {/* Desktop Quick Actions (Admin Link, Sheet, CSV, Auto Fit, Fullscreen) */}
            <div className="hidden sm:flex items-center gap-1">
              {/* Admin Config Button */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(!isConfigOpen)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
                    isConfigOpen 
                      ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700 shadow-2xs' 
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title="កំណត់ Link Google Sheets (Admin Only)"
                >
                  <Settings className={`w-3 h-3 ${isConfigOpen ? 'text-purple-600 rotate-45 transition-transform' : 'text-slate-500'}`} />
                  <span className="text-[11px]">{isConfigOpen ? 'លាក់' : 'Link'}</span>
                </button>
              )}

              {/* External Google Sheet Link */}
              {googleSheetWebUrl && (
                <a
                  href={googleSheetWebUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1 transition"
                  title="បើកមើល Google Sheet ផ្ទាល់លើ Browser"
                >
                  <ExternalLink className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[11px]">Sheet</span>
                </a>
              )}

              {/* Export CSV */}
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={rows.length === 0}
                className="px-2 py-1 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1 transition disabled:opacity-40 cursor-pointer"
                title="ទាញយកជា CSV / Excel"
              >
                <Download className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                <span className="text-[11px]">CSV</span>
              </button>

              {/* Height Auto Fit Mode Toggle Button */}
              <button
                type="button"
                onClick={() => {
                  const next = scrollMode === 'AUTO_FIT' ? 'CONTAINER' : 'AUTO_FIT';
                  setScrollMode(next);
                  localStorage.setItem('accounting_followup_bm_scroll_mode', next);
                  notify(next === 'AUTO_FIT' ? 'បានបើកកម្ពស់ Auto-Fit (ពេញទំព័រ)' : 'បានបើកជាប់ក្បាល (Scroll ក្នុងប្រអប់)', 'info');
                }}
                className={`p-1 sm:px-2 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
                  scrollMode === 'AUTO_FIT'
                    ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700 shadow-2xs'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={scrollMode === 'AUTO_FIT' ? 'កម្ពស់ Auto-Fit ពេញទំព័រ' : 'Scroll ក្នុងប្រអប់ជាប់ក្បាល'}
              >
                {scrollMode === 'AUTO_FIT' ? (
                  <>
                    <Maximize2 className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                    <span className="text-[11px] font-bold hidden xl:inline">Auto Fit</span>
                  </>
                ) : (
                  <>
                    <Minimize2 className="w-3 h-3 text-slate-500" />
                    <span className="text-[11px] hidden xl:inline">ជាប់ក្បាល</span>
                  </>
                )}
              </button>

              {/* Fullscreen / Full Page View Mode Toggle */}
              <button
                type="button"
                onClick={() => {
                  const next = !isFullScreen;
                  setIsFullScreen(next);
                  notify(next ? 'បានបើកពេញអេក្រង់ (Full Screen Mode)' : 'បានចេញពីពេញអេក្រង់', 'info');
                }}
                className={`p-1 sm:px-2 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
                  isFullScreen
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700 shadow-2xs'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={isFullScreen ? 'ចេញពី Full Screen' : 'ពេញអេក្រង់ (Full Screen Mode)'}
              >
                {isFullScreen ? (
                  <>
                    <Minimize2 className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-[11px] font-bold hidden xl:inline">បង្រួម</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3 h-3 text-slate-500" />
                    <span className="text-[11px] hidden xl:inline">ពេញទំព័រ</span>
                  </>
                )}
              </button>
            </div>

            {/* Mobile More Actions Menu (•••) */}
            <div className="relative sm:hidden" ref={mobileActionsRef}>
              <button
                type="button"
                onClick={() => setIsMobileActionsOpen(!isMobileActionsOpen)}
                className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition cursor-pointer"
                title="សកម្មភាពបន្ថែម"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {isMobileActionsOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-1.5 z-50 text-xs space-y-1 animate-in fade-in zoom-in-95">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsConfigOpen(!isConfigOpen);
                        setIsMobileActionsOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-purple-600" />
                      <span>{isConfigOpen ? 'លាក់ Link Settings' : 'កំណត់ Link Sheet'}</span>
                    </button>
                  )}
                  {googleSheetWebUrl && (
                    <a
                      href={googleSheetWebUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsMobileActionsOpen(false)}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                      <span>បើកមើល Google Sheet</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      handleExportCSV();
                      setIsMobileActionsOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-purple-600" />
                    <span>ទាញយកជា CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isFullScreen;
                      setIsFullScreen(next);
                      setIsMobileActionsOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-medium cursor-pointer"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{isFullScreen ? 'ចេញពី Fullscreen' : 'ពេញអេក្រង់'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* View Mode Toggle (Table View vs Card View) */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-850 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-800 ml-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
                title="បង្ហាញជាតារាង (Table View)"
              >
                <Table2 className="w-3 h-3" />
                <span>តារាង</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
                title="បង្ហាញជាកាត (Card View)"
              >
                <LayoutGrid className="w-3 h-3" />
                <span>កាត</span>
              </button>
            </div>
          </div>
        </div>

        {/* Admin Configuration Drawer */}
        {isConfigOpen && isAdmin && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="bg-purple-50/50 dark:bg-purple-950/20 rounded-xl p-3 border border-purple-100 dark:border-purple-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900 dark:text-purple-200">
                  <LinkIcon className="w-3.5 h-3.5 text-purple-600" />
                  <span>កំណត់ Google Spreadsheet Link សម្រាប់ FollowUp BM</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHelpGuide(!showHelpGuide)}
                  className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="w-3 h-3" />
                  <span>របៀប Share?</span>
                </button>
              </div>

              {showHelpGuide && (
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 text-[11.5px] text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-amber-800 dark:text-amber-300">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>ការណែនាំ Share Google Sheet៖</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-0.5 pl-1 text-[11px]">
                    <li>បើក Google Spreadsheet របស់អ្នក</li>
                    <li>ចុចប៊ូតុង <strong>Share</strong> (ជ្រុងខាងស្តាំលើ)</li>
                    <li>នៅត្រង់ General Access ប្តូរទៅជា <strong>«Anyone with the link»</strong> (Viewer)</li>
                    <li>Copy link រួចបិទភ្ជាប់ក្នុងប្រអប់ខាងក្រោម</li>
                  </ol>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Google Spreadsheet URL ឬ ID:
                  </label>
                  <input
                    type="text"
                    value={tempSheetUrl}
                    onChange={(e) => setTempSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    ឈ្មោះ Sheet / Tab (ស្រេចចិត្ត):
                  </label>
                  <input
                    type="text"
                    value={tempSheetName}
                    onChange={(e) => setTempSheetName(e.target.value)}
                    placeholder="ឧ. Sheet1 ឬទុកទទេ"
                    className="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10.5px] text-slate-400">
                  {lastSynced ? `បាន Sync ចុងក្រោយ៖ ${formatTimeDisplay(lastSynced)}` : 'មិនទាន់បាន Sync'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTempSheetUrl(sheetUrl);
                      setTempSheetName(sheetName);
                      setIsConfigOpen(false);
                    }}
                    className="px-3 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    បោះបង់
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition cursor-pointer flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>រក្សាទុក & ភ្ជាប់ Link</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Error / Restricted Warning Banner */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center justify-between text-xs text-rose-800 dark:text-rose-300 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          {isRestrictedWarning && (
            <button
              type="button"
              onClick={() => {
                setIsConfigOpen(true);
                setShowHelpGuide(true);
              }}
              className="px-2 py-0.5 rounded bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-200 text-[10.5px] font-bold hover:bg-rose-300"
            >
              របៀបកែ
            </button>
          )}
        </div>
      )}

      {/* 3. Search Bar & Dropdown Filters Bar */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl px-2.5 py-2 sm:px-3 sm:py-2.5 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-2">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ស្វែងរកគ្រប់យ៉ាង (Search anything)..."
              className="w-full h-8 sm:h-8.5 pl-8 pr-7 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 focus:outline-none focus:ring-1 focus:ring-purple-500 text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                title="លុបពាក្យស្វែងរក"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Mobile Filter Toggle Button (with active badge) */}
          <button
            type="button"
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            className={`lg:hidden h-8 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 border ${
              isFiltersExpanded || (activeFilterCount > (searchTerm.trim() ? 1 : 0))
                ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 shadow-xs'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}
            title="បើក/បិទ Filters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFilterCount > (searchTerm.trim() ? 1 : 0) && (
              <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[9.5px] font-black flex items-center justify-center">
                {activeFilterCount - (searchTerm.trim() ? 1 : 0)}
              </span>
            )}
          </button>

          {/* Quick Clear Button on desktop if active */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearAllFilters}
              className="hidden lg:flex h-8 sm:h-8.5 px-2 rounded-lg text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/80 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition items-center justify-center gap-1 cursor-pointer shadow-2xs shrink-0"
              title="សម្អាត Filter និងពាក្យស្វែងរកទាំងអស់"
            >
              <RotateCcw className="w-3 h-3" />
              <span>សម្អាត</span>
            </button>
          )}
        </div>

        {/* Dynamic Column Filters Panel (Always visible on lg:, expandable on mobile) */}
        <div className={`pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex-wrap items-center gap-1.5 ${
          isFiltersExpanded ? 'flex' : 'hidden lg:flex'
        }`}>
          {/* Filter 1: Delivery Date Range Inline */}
          {deliveryDateCol && (
            <div className="flex items-center gap-1 h-8 sm:h-8.5 px-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-lg text-xs shadow-2xs flex-1 sm:flex-none">
              <Calendar className={`w-3.5 h-3.5 shrink-0 ${deliveryStartDate || deliveryEndDate ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`} />
              <input
                type="date"
                value={deliveryStartDate}
                onChange={(e) => {
                  setDeliveryStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className={`bg-transparent text-xs w-28 sm:w-30 focus:outline-none cursor-pointer font-sans ${
                  deliveryStartDate ? 'text-purple-600 dark:text-purple-400 font-bold' : 'text-slate-600 dark:text-slate-400'
                }`}
                title="ចាប់ពីថ្ងៃ"
              />
              <span className="text-slate-400 text-xs font-bold px-0.5">→</span>
              <input
                type="date"
                value={deliveryEndDate}
                onChange={(e) => {
                  setDeliveryEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className={`bg-transparent text-xs w-28 sm:w-30 focus:outline-none cursor-pointer font-sans ${
                  deliveryEndDate ? 'text-purple-600 dark:text-purple-400 font-bold' : 'text-slate-600 dark:text-slate-400'
                }`}
                title="ដល់ថ្ងៃ"
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
            <div className="relative flex items-center min-w-[125px] sm:min-w-[140px] flex-1 sm:flex-none">
              <UserCheck className={`w-3.5 h-3.5 absolute left-2.5 pointer-events-none z-10 ${selectedHandleBy ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`} />
              <select
                value={selectedHandleBy}
                onChange={(e) => {
                  setSelectedHandleBy(e.target.value);
                  setCurrentPage(1);
                }}
                className={`w-full h-8 sm:h-8.5 pl-8 pr-6 rounded-lg text-xs appearance-none transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-500 truncate ${
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

          {/* Filter 3: DEST */}
          {destCol && (
            <div className="relative flex items-center min-w-[110px] sm:min-w-[125px] flex-1 sm:flex-none">
              <MapPin className={`w-3.5 h-3.5 absolute left-2.5 pointer-events-none z-10 ${selectedDest ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
              <select
                value={selectedDest}
                onChange={(e) => {
                  setSelectedDest(e.target.value);
                  setCurrentPage(1);
                }}
                className={`w-full h-8 sm:h-8.5 pl-8 pr-6 rounded-lg text-xs appearance-none transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500 truncate ${
                  selectedDest
                    ? 'bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-bold shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 font-medium'
                }`}
                title="Filter តាម DEST"
              >
                <option value="">DEST (ទាំងអស់)</option>
                {destOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <span className="absolute right-2 text-slate-400 pointer-events-none text-[8.5px]">▼</span>
            </div>
          )}

          {/* Filter 4: DELIVERED */}
          {deliveredCol && (
            <div className="relative flex items-center min-w-[125px] sm:min-w-[140px] flex-1 sm:flex-none">
              <Truck className={`w-3.5 h-3.5 absolute left-2.5 pointer-events-none z-10 ${selectedDelivered ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
              <select
                value={selectedDelivered}
                onChange={(e) => {
                  setSelectedDelivered(e.target.value);
                  setCurrentPage(1);
                }}
                className={`w-full h-8 sm:h-8.5 pl-8 pr-6 rounded-lg text-xs appearance-none transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 truncate ${
                  selectedDelivered
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-bold shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 font-medium'
                }`}
                title="Filter តាម DELIVERED"
              >
                <option value="">DELIVERED (ទាំងអស់)</option>
                <option value="__DELIVERED__">✓ Delivered</option>
                <option value="__NOT_DELIVERED__">⚠️ មិនទាន់ Delivered (≠ Delivered)</option>
                {deliveredOptions.filter(opt => opt.toLowerCase() !== 'delivered').map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <span className="absolute right-2 text-slate-400 pointer-events-none text-[8.5px]">▼</span>
            </div>
          )}

          {/* Filter 4: VERIFY */}
          {verifyCol && (
            <div className="relative flex items-center min-w-[115px] sm:min-w-[130px] flex-1 sm:flex-none">
              <ShieldCheck className={`w-3.5 h-3.5 absolute left-2.5 pointer-events-none z-10 ${selectedVerify ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`} />
              <select
                value={selectedVerify}
                onChange={(e) => {
                  setSelectedVerify(e.target.value);
                  setCurrentPage(1);
                }}
                className={`w-full h-8 sm:h-8.5 pl-8 pr-6 rounded-lg text-xs appearance-none transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-500 truncate ${
                  selectedVerify
                    ? 'bg-purple-50 dark:bg-purple-950/60 border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 font-bold shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 font-medium'
                }`}
                title="Filter តាម VERIFY"
              >
                <option value="">VERIFY (ទាំងអស់)</option>
                <option value="__NOT_PAID__">⚠️ ខុសពី Paid (≠ Paid)</option>
                <option value="__PAID__">✓ Paid</option>
              </select>
              <span className="absolute right-2 text-slate-400 pointer-events-none text-[8.5px]">▼</span>
            </div>
          )}

          {/* Mobile Clear Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearAllFilters}
              className="lg:hidden h-8 px-2.5 rounded-lg text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/80 hover:bg-rose-100 transition flex items-center gap-1 cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>សម្អាត Filters</span>
            </button>
          )}
        </div>

      </div>

      {/* 4. KPI Metrics Banner (Ultra Modern Dual-Currency Horizon Carousel / Grid) */}
      {rows.length > 0 && (gotCodTodayStats.hasGotCodDateCol || buymedTodayStats.hasBuymedDateCol || unpaidStats.hasVerifyCol || deliveryOverdue10DaysStats.hasDeliveryDateCol || pendingEmptyStats.hasColumns) && (
        <div className="bg-slate-50/70 dark:bg-slate-900/40 rounded-2xl p-2 sm:p-2.5 border border-slate-200/70 dark:border-slate-800/70 space-y-2">
          {/* Header Row: Title, Toggle Collapse & Currency Switcher */}
          <div className="flex items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={() => setIsKpiCollapsed(!isKpiCollapsed)}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-purple-600 dark:hover:text-purple-400 transition cursor-pointer select-none"
            >
              <div className="w-5 h-5 rounded-md bg-purple-100 dark:bg-purple-900/60 flex items-center justify-center text-purple-600 dark:text-purple-300">
                <Coins className="w-3 h-3" />
              </div>
              <span>សង្ខេបចំណូល (KPI Metrics)</span>
              {isKpiCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {/* Currency Selector (ALL Dual, USD $, KHM ៛) */}
            <div className="flex items-center bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs">
              <button
                type="button"
                onClick={() => setKpiCurrency('ALL')}
                className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold transition cursor-pointer ${
                  kpiCurrency === 'ALL'
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                title="បង្ហាញទាំង USD និង KHM រួមគ្នា"
              >
                ទាំងអស់
              </button>
              <button
                type="button"
                onClick={() => setKpiCurrency('USD')}
                className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold transition cursor-pointer ${
                  kpiCurrency === 'USD'
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                title="បង្ហាញតែ USD ($)"
              >
                USD ($)
              </button>
              <button
                type="button"
                onClick={() => setKpiCurrency('KHM')}
                className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold transition cursor-pointer ${
                  kpiCurrency === 'KHM'
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                title="បង្ហាញតែ KHM (៛)"
              >
                KHM (៛)
              </button>
            </div>
          </div>

          {/* Cards List: Swipeable Horizontal Carousel on Mobile, 5 Columns on Desktop */}
          {!isKpiCollapsed && (
            <div className="flex md:grid overflow-x-auto md:overflow-visible gap-2 pb-1 snap-x no-scrollbar md:grid-cols-5 animate-in fade-in duration-150">
              {/* Metric 1: GOT COD TODAY */}
              {gotCodTodayStats.hasGotCodDateCol && (
                <div 
                  onClick={() => {
                    setIsGotCodTodayOnly(prev => !prev);
                    setCurrentPage(1);
                  }}
                  className={`w-[66vw] sm:w-[220px] md:w-auto shrink-0 snap-start bg-gradient-to-br from-sky-50 to-blue-50/80 dark:from-sky-950/40 dark:to-blue-950/30 rounded-xl p-2.5 border transition cursor-pointer shadow-2xs flex flex-col justify-between hover:scale-[1.01] active:scale-[0.99] ${
                    isGotCodTodayOnly
                      ? 'border-sky-500 dark:border-sky-400 ring-2 ring-sky-400/50 shadow-md'
                      : 'border-sky-200/90 dark:border-sky-800/60 hover:border-sky-400'
                  }`}
                  title="ចុចដើម្បី Filter មើលតែជួរ GOT COD(DATE) = ថ្ងៃនេះ"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-[11px] font-bold text-sky-800 dark:text-sky-300 flex items-center gap-1 truncate">
                      <DollarSign className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                      <span className="truncate">COD ថ្ងៃនេះ</span>
                    </div>
                    <span className="text-[8.5px] px-1.5 py-0.5 rounded-full font-bold bg-sky-100 dark:bg-sky-900/70 text-sky-800 dark:text-sky-200 border border-sky-300/60 dark:border-sky-700/60 shrink-0">
                      TODAY
                    </span>
                  </div>

                  {/* Primary & Secondary Values */}
                  <div className="mt-1.5">
                    {kpiCurrency === 'ALL' ? (
                      <>
                        <div className="text-sm sm:text-base font-black font-mono text-sky-800 dark:text-sky-200 truncate">
                          ${gotCodTodayStats.usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-sky-700/80 dark:text-sky-300/80 font-mono truncate flex items-center justify-between mt-0.5">
                          <span>{Math.round(gotCodTodayStats.khmTotal).toLocaleString('en-US')} ៛</span>
                          <span className="text-[9px] opacity-80">({gotCodTodayStats.todayRowsCount} ជួរ)</span>
                        </div>
                      </>
                    ) : kpiCurrency === 'USD' ? (
                      <>
                        <div className="text-sm sm:text-base font-black font-mono text-sky-800 dark:text-sky-200 truncate">
                          ${gotCodTodayStats.usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-sky-700/80 dark:text-sky-300/80 font-mono mt-0.5">
                          ({gotCodTodayStats.todayRowsCount} ជួរ)
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm sm:text-base font-black font-mono text-sky-800 dark:text-sky-200 truncate">
                          {Math.round(gotCodTodayStats.khmTotal).toLocaleString('en-US')} ៛
                        </div>
                        <div className="text-[10px] text-sky-700/80 dark:text-sky-300/80 font-mono mt-0.5">
                          ({gotCodTodayStats.todayRowsCount} ជួរ)
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Metric 2: BUYMED TODAY */}
              {buymedTodayStats.hasBuymedDateCol && (
                <div 
                  onClick={() => {
                    setIsBuymedTodayOnly(prev => !prev);
                    setCurrentPage(1);
                  }}
                  className={`w-[66vw] sm:w-[220px] md:w-auto shrink-0 snap-start bg-gradient-to-br from-indigo-50 to-violet-50/80 dark:from-indigo-950/40 dark:to-violet-950/30 rounded-xl p-2.5 border transition cursor-pointer shadow-2xs flex flex-col justify-between hover:scale-[1.01] active:scale-[0.99] ${
                    isBuymedTodayOnly
                      ? 'border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-400/50 shadow-md'
                      : 'border-indigo-200/90 dark:border-indigo-800/60 hover:border-indigo-400'
                  }`}
                  title="ចុចដើម្បី Filter មើលតែជួរ BUYMED(date) = ថ្ងៃនេះ"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1 truncate">
                      <DollarSign className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span className="truncate">BUYMED ថ្ងៃនេះ</span>
                    </div>
                    <span className="text-[8.5px] px-1.5 py-0.5 rounded-full font-bold bg-indigo-100 dark:bg-indigo-900/70 text-indigo-800 dark:text-indigo-200 border border-indigo-300/60 dark:border-indigo-700/60 shrink-0">
                      TODAY
                    </span>
                  </div>

                  {/* Primary & Secondary Values */}
                  <div className="mt-1.5">
                    {kpiCurrency === 'ALL' ? (
                      <>
                        <div className="text-sm sm:text-base font-black font-mono text-indigo-800 dark:text-indigo-200 truncate">
                          ${buymedTodayStats.usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-indigo-700/80 dark:text-indigo-300/80 font-mono truncate flex items-center justify-between mt-0.5">
                          <span>{Math.round(buymedTodayStats.khmTotal).toLocaleString('en-US')} ៛</span>
                          <span className="text-[9px] opacity-80">({buymedTodayStats.todayRowsCount} ជួរ)</span>
                        </div>
                      </>
                    ) : kpiCurrency === 'USD' ? (
                      <>
                        <div className="text-sm sm:text-base font-black font-mono text-indigo-800 dark:text-indigo-200 truncate">
                          ${buymedTodayStats.usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-indigo-700/80 dark:text-indigo-300/80 font-mono mt-0.5">
                          ({buymedTodayStats.todayRowsCount} ជួរ)
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm sm:text-base font-black font-mono text-indigo-800 dark:text-indigo-200 truncate">
                          {Math.round(buymedTodayStats.khmTotal).toLocaleString('en-US')} ៛
                        </div>
                        <div className="text-[10px] text-indigo-700/80 dark:text-indigo-300/80 font-mono mt-0.5">
                          ({buymedTodayStats.todayRowsCount} ជួរ)
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Metric 3: VERIFY != Paid */}
              {unpaidStats.hasVerifyCol && (
                <div 
                  onClick={() => {
                    setSelectedVerify(prev => prev === '__NOT_PAID__' ? '' : '__NOT_PAID__');
                    setCurrentPage(1);
                  }}
                  className={`w-[66vw] sm:w-[220px] md:w-auto shrink-0 snap-start bg-gradient-to-br from-amber-50 to-orange-50/80 dark:from-amber-950/40 dark:to-orange-950/30 rounded-xl p-2.5 border transition cursor-pointer shadow-2xs flex flex-col justify-between hover:scale-[1.01] active:scale-[0.99] ${
                    selectedVerify === '__NOT_PAID__'
                      ? 'border-amber-500 dark:border-amber-400 ring-2 ring-amber-400/50 shadow-md'
                      : 'border-amber-200/90 dark:border-amber-800/60 hover:border-amber-400'
                  }`}
                  title="ចុចដើម្បី Filter មើលតែជួរ VERIFY ≠ Paid"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1 truncate">
                      <DollarSign className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span className="truncate">មិនទាន់ Paid</span>
                    </div>
                    <span className="text-[8.5px] px-1.5 py-0.5 rounded-full font-bold bg-amber-100 dark:bg-amber-900/70 text-amber-800 dark:text-amber-200 border border-amber-300/60 dark:border-amber-700/60 shrink-0">
                      ≠ Paid
                    </span>
                  </div>

                  {/* Primary & Secondary Values */}
                  <div className="mt-1.5">
                    {kpiCurrency === 'ALL' ? (
                      <>
                        <div className="text-sm sm:text-base font-black font-mono text-amber-800 dark:text-amber-200 truncate">
                          ${unpaidStats.usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-amber-700/80 dark:text-amber-300/80 font-mono truncate flex items-center justify-between mt-0.5">
                          <span>{Math.round(unpaidStats.khmTotal).toLocaleString('en-US')} ៛</span>
                          <span className="text-[9px] opacity-80">({unpaidStats.unpaidRowsCount} ជួរ)</span>
                        </div>
                      </>
                    ) : kpiCurrency === 'USD' ? (
                      <>
                        <div className="text-sm sm:text-base font-black font-mono text-amber-800 dark:text-amber-200 truncate">
                          ${unpaidStats.usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-amber-700/80 dark:text-amber-300/80 font-mono mt-0.5">
                          ({unpaidStats.unpaidRowsCount} ជួរ)
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm sm:text-base font-black font-mono text-amber-800 dark:text-amber-200 truncate">
                          {Math.round(unpaidStats.khmTotal).toLocaleString('en-US')} ៛
                        </div>
                        <div className="text-[10px] text-amber-700/80 dark:text-amber-300/80 font-mono mt-0.5">
                          ({unpaidStats.unpaidRowsCount} ជួរ)
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Metric 4: DELIVERY DATE >= 10 days & VERIFY != Paid */}
              {deliveryOverdue10DaysStats.hasDeliveryDateCol && (
                <div 
                  onClick={() => {
                    setIsDeliveryOverdue10DaysOnly(prev => !prev);
                    setCurrentPage(1);
                  }}
                  className={`w-[66vw] sm:w-[220px] md:w-auto shrink-0 snap-start bg-gradient-to-br from-rose-50 to-red-50/80 dark:from-rose-950/40 dark:to-red-950/30 rounded-xl p-2.5 border transition cursor-pointer shadow-2xs flex flex-col justify-between hover:scale-[1.01] active:scale-[0.99] ${
                    isDeliveryOverdue10DaysOnly
                      ? 'border-rose-500 dark:border-rose-400 ring-2 ring-rose-400/50 shadow-md'
                      : 'border-rose-200/90 dark:border-rose-800/60 hover:border-rose-400'
                  }`}
                  title="ចុចដើម្បី Filter មើលតែជួរ DELIVERY DATE ចាប់ពី 10 ថ្ងៃឡើងទៅ និង VERIFY ≠ Paid"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-[11px] font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1 truncate">
                      <DollarSign className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span className="truncate">Delivery ≥ 10 ថ្ងៃ</span>
                    </div>
                    <span className="text-[8.5px] px-1.5 py-0.5 rounded-full font-bold bg-rose-100 dark:bg-rose-900/70 text-rose-800 dark:text-rose-200 border border-rose-300/60 dark:border-rose-700/60 shrink-0">
                      ≥ 10 ថ្ងៃ
                    </span>
                  </div>

                  {/* Primary & Secondary Values */}
                  <div className="mt-1.5">
                    {kpiCurrency === 'ALL' ? (
                      <>
                        <div className="text-sm sm:text-base font-black font-mono text-rose-800 dark:text-rose-200 truncate">
                          ${deliveryOverdue10DaysStats.usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-rose-700/80 dark:text-rose-300/80 font-mono truncate flex items-center justify-between mt-0.5">
                          <span>{Math.round(deliveryOverdue10DaysStats.khmTotal).toLocaleString('en-US')} ៛</span>
                          <span className="text-[9px] opacity-80">({deliveryOverdue10DaysStats.overdueRowsCount} ជួរ)</span>
                        </div>
                      </>
                    ) : kpiCurrency === 'USD' ? (
                      <>
                        <div className="text-sm sm:text-base font-black font-mono text-rose-800 dark:text-rose-200 truncate">
                          ${deliveryOverdue10DaysStats.usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-rose-700/80 dark:text-rose-300/80 font-mono mt-0.5">
                          ({deliveryOverdue10DaysStats.overdueRowsCount} ជួរ)
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm sm:text-base font-black font-mono text-rose-800 dark:text-rose-200 truncate">
                          {Math.round(deliveryOverdue10DaysStats.khmTotal).toLocaleString('en-US')} ៛
                        </div>
                        <div className="text-[10px] text-rose-700/80 dark:text-rose-300/80 font-mono mt-0.5">
                          ({deliveryOverdue10DaysStats.overdueRowsCount} ជួរ)
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Metric 5: Pending (GOT COD, RETURN, BUYMED, CLEAR = empty) */}
              {pendingEmptyStats.hasColumns && (
                <div 
                  onClick={() => {
                    setIsPendingEmptyOnly(prev => !prev);
                    setCurrentPage(1);
                  }}
                  className={`w-[66vw] sm:w-[220px] md:w-auto shrink-0 snap-start bg-gradient-to-br from-emerald-50 to-teal-50/80 dark:from-emerald-950/40 dark:to-teal-950/30 rounded-xl p-2.5 border transition cursor-pointer shadow-2xs flex flex-col justify-between hover:scale-[1.01] active:scale-[0.99] ${
                    isPendingEmptyOnly
                      ? 'border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-400/50 shadow-md'
                      : 'border-emerald-200/90 dark:border-emerald-800/60 hover:border-emerald-400'
                  }`}
                  title="ចុចដើម្បី Filter មើលតែជួរ GOT COD, RETURN, BUYMED, CLEAR = ទទេ"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1 truncate">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="truncate">Pending / ទទេ</span>
                    </div>
                    <span className="text-[8.5px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-100 dark:bg-emerald-900/70 text-emerald-800 dark:text-emerald-200 border border-emerald-300/60 dark:border-emerald-700/60 shrink-0">
                      EMPTY
                    </span>
                  </div>

                  {/* Primary & Secondary Values */}
                  <div className="mt-1.5">
                    {kpiCurrency === 'ALL' ? (
                      <>
                        <div className="text-sm sm:text-base font-black font-mono text-emerald-800 dark:text-emerald-200 truncate">
                          ${pendingEmptyStats.usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 font-mono truncate flex items-center justify-between mt-0.5">
                          <span>{Math.round(pendingEmptyStats.khmTotal).toLocaleString('en-US')} ៛</span>
                          <span className="text-[9px] opacity-80">({pendingEmptyStats.pendingRowsCount} ជួរ)</span>
                        </div>
                      </>
                    ) : kpiCurrency === 'USD' ? (
                      <>
                        <div className="text-sm sm:text-base font-black font-mono text-emerald-800 dark:text-emerald-200 truncate">
                          ${pendingEmptyStats.usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 font-mono mt-0.5">
                          ({pendingEmptyStats.pendingRowsCount} ជួរ)
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm sm:text-base font-black font-mono text-emerald-800 dark:text-emerald-200 truncate">
                          {Math.round(pendingEmptyStats.khmTotal).toLocaleString('en-US')} ៛
                        </div>
                        <div className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 font-mono mt-0.5">
                          ({pendingEmptyStats.pendingRowsCount} ជួរ)
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 5. Dynamic Data Table */}
      <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <RefreshCw className="w-8 h-8 text-purple-600 animate-spin mb-3" />
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              កំពុងទាញយកទិន្នន័យពី Google Sheets សម្រាប់ FollowUp BM...
            </p>
            <p className="text-xs text-slate-400 mt-1">
              ប្រព័ន្ធកំពុងដំណើរការតារាង និងសម្របសម្រួលទិន្នន័យ
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 sm:p-16 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center mb-3">
              <ClipboardCheck className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">
              {sheetUrl.trim() ? 'ពុំមានទិន្នន័យនៅក្នុង Google Sheet នេះឡើយ' : 'មិនទាន់បានភ្ជាប់ Google Sheet សម្រាប់ FollowUp BM ឡើយ'}
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
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm flex items-center gap-1.5 transition cursor-pointer"
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
          /* CARDS VIEW (Desktop only) */
          <div className={`p-3 sm:p-4 space-y-2.5 ${
            scrollMode === 'CONTAINER' 
              ? 'max-h-[calc(100vh-300px)] overflow-y-auto custom-scrollbar' 
              : 'h-auto overflow-y-visible'
          }`}>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pb-1 border-b border-slate-100 dark:border-slate-800/80">
              <span className="font-medium text-[11px]">
                បង្ហាញជាកាត (Card View) • ចុច "លម្អិត" ដើម្បីមើលគ្រប់ជួរឈរ
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
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 sm:gap-3">
                {paginatedRows.map((row, idx) => {
                  const pageStartIndex = (currentPage - 1) * pageSize;
                  const awbnVal = awbnCol ? row[awbnCol.id] : row['col_1'];
                  const deliveryVal = deliveryDateCol ? row[deliveryDateCol.id] : null;
                  const handleByVal = handleByCol ? row[handleByCol.id] : null;
                  const destVal = destCol ? row[destCol.id] : null;
                  const receiverVal = receiverCol ? row[receiverCol.id] : null;
                  const usdVal = usdCol ? row[usdCol.id] : null;
                  const khmVal = khmCol ? row[khmCol.id] : null;
                  const verifyVal = verifyCol ? row[verifyCol.id] : null;

                  return (
                    <div
                      key={row._id}
                      className="bg-slate-50/80 dark:bg-slate-900/90 rounded-2xl p-3 sm:p-3.5 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-purple-300 dark:hover:border-purple-700/80 transition space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700">
                            {pageStartIndex + idx + 1}
                          </span>

                          <button
                            type="button"
                            onClick={() => setSelectedDetailRow({ ...row, __rowNumber: pageStartIndex + idx + 1 })}
                            className="font-mono font-bold text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 px-2 py-0.5 rounded-lg border border-purple-200/60 dark:border-purple-800/60 flex items-center gap-1 active:scale-95 transition cursor-pointer truncate"
                            title="ចុចដើម្បីមើលព័ត៌មានលម្អិតទាំងអស់ (Click to view details)"
                          >
                            <span className="truncate">{awbnVal || 'គ្មាន AWB'}</span>
                            <Eye className="w-3 h-3 text-purple-500 shrink-0" />
                          </button>
                        </div>

                        {deliveryVal && (
                          <span className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-850 px-2 py-0.5 rounded-lg flex items-center gap-1 shrink-0 border border-slate-200/60 dark:border-slate-800">
                            <Calendar className="w-3 h-3 text-purple-500" />
                            <span>{deliveryVal}</span>
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white dark:bg-slate-850 p-2 rounded-xl border border-slate-100 dark:border-slate-800 min-w-0">
                          <div className="text-[9.5px] font-bold text-slate-400 flex items-center gap-1 mb-0.5">
                            <UserCheck className="w-3 h-3 text-purple-500 shrink-0" />
                            <span>HANDLE BY</span>
                          </div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {handleByVal || '-'}
                          </div>
                        </div>

                        <div className="bg-white dark:bg-slate-850 p-2 rounded-xl border border-slate-100 dark:border-slate-800 min-w-0">
                          <div className="text-[9.5px] font-bold text-slate-400 flex items-center gap-1 mb-0.5">
                            <MapPin className="w-3 h-3 text-amber-500 shrink-0" />
                            <span>DEST</span>
                          </div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {destVal || '-'}
                          </div>
                        </div>
                      </div>

                      {receiverVal && (
                        <div className="text-xs text-slate-600 dark:text-slate-400 truncate bg-white dark:bg-slate-850/50 px-2.5 py-1 rounded-lg border border-slate-100 dark:border-slate-800/60">
                          <span className="text-[10px] text-slate-400 font-medium mr-1.5">អ្នកទទួល:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{receiverVal}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800/80 gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          {usdVal && (
                            <span className="font-mono font-bold text-xs text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-lg border border-purple-200/60 dark:border-purple-800/60">
                              ${String(usdVal).replace('$', '')}
                            </span>
                          )}
                          {khmVal && (
                            <span className="font-mono font-bold text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-200/60 dark:border-emerald-800/60">
                              {String(khmVal).replace('៛', '')} ៛
                            </span>
                          )}
                          {verifyVal !== undefined && verifyVal !== null && String(verifyVal).trim() !== '' && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                              String(verifyVal).trim().toLowerCase() === 'paid'
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60'
                                : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/60'
                            }`}>
                              {String(verifyVal)}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedDetailRow({ ...row, __rowNumber: pageStartIndex + idx + 1 })}
                          className="text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition cursor-pointer shrink-0"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>លម្អិត</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* TABLE VIEW */
          <>
            {/* Mobile / Tablet Quick Hint Banner */}
            <div className="xl:hidden flex items-center justify-between px-3 py-1.5 bg-purple-50/70 dark:bg-slate-850 text-[10.5px] text-purple-700 dark:text-purple-300 border-b border-slate-200/80 dark:border-slate-800">
              <span className="flex items-center gap-1.5 font-medium">
                <Eye className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                <span>ចុចលើលេខ AWBN ដើម្បីមើលពត៌មានលម្អិតទាំងអស់</span>
              </span>
              <span className="font-mono font-bold text-slate-500 dark:text-slate-400 shrink-0">{paginatedRows.length} ជួរ</span>
            </div>

            <div 
              ref={tableContainerRef}
              onScroll={handleTableScroll}
              className={`overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${
                scrollMode === 'CONTAINER' 
                  ? 'overflow-y-auto max-h-[calc(100vh-320px)] min-h-[350px] custom-scrollbar' 
                  : 'h-auto overflow-y-visible'
              } relative`}
            >
              <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 select-none">
                <tr>
                  {/* Row index # - Shown on Desktop only (hidden on mobile and ipad) */}
                  <th className="py-3 px-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-12 text-center hidden xl:table-cell">
                    #
                  </th>

                  {/* Actions column (Copy row) - Shown on Desktop only */}
                  <th className="py-3 px-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-10 text-center hidden xl:table-cell">
                    
                  </th>

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
                          <ArrowUpDown className={`w-3 h-3 ${isSorted ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 opacity-60'}`} />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
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

                    return (
                      <tr 
                        key={row._id}
                        className="hover:bg-purple-50/40 dark:hover:bg-slate-850/50 transition-colors group"
                      >
                        {/* Index - Desktop only */}
                        <td className="py-2.5 px-3.5 text-center text-slate-400 font-mono text-[11px] hidden xl:table-cell">
                          {globalIdx}
                        </td>

                        {/* Copy row action - Desktop only */}
                        <td className="py-2.5 px-2 text-center hidden xl:table-cell">
                          <button
                            type="button"
                            onClick={() => handleCopyRow(row, row._id)}
                            className="p-1 rounded text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-slate-800 transition opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="ចម្លងជួរនេះ (Copy Row)"
                          >
                            {isRowCopied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>

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
                                className={`py-2.5 px-3 sm:px-3.5 whitespace-nowrap cursor-pointer hover:bg-purple-50/70 dark:hover:bg-purple-950/50 transition relative group/cell ${visibilityClass}`}
                                title="ចុចលើលេខ AWBN ដើម្បីមើលពត៌មានលម្អិតទាំងអស់ (Click to view full details)"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-xs text-purple-600 dark:text-purple-400 group-hover/cell:underline flex items-center gap-1">
                                    <span>{val !== undefined && val !== null ? String(val) : ''}</span>
                                    <Eye className="w-3.5 h-3.5 text-purple-500 opacity-60 group-hover/cell:opacity-100 transition shrink-0" />
                                  </span>

                                  {/* Quick Copy button */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyCell(val, cellId);
                                    }}
                                    className="p-1 rounded text-slate-300 dark:text-slate-600 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
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

                          const isVerify = (verifyCol && verifyCol.id === col.id) || l.includes('verify') || l.includes('verification');
                          if (isVerify) {
                            const valStr = (val !== undefined && val !== null ? String(val) : '').trim();
                            const isPaid = valStr.toLowerCase() === 'paid';

                            return (
                              <td 
                                key={col.id}
                                onClick={() => handleCopyCell(val, cellId)}
                                className={`py-2.5 px-3.5 whitespace-nowrap cursor-pointer hover:bg-purple-100/50 dark:hover:bg-purple-950/40 transition relative group/cell ${visibilityClass}`}
                                title="ចុចដើម្បីចម្លង (Click to Copy)"
                              >
                                {valStr ? (
                                  isPaid ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/70">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                      <span>{valStr}</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/70">
                                      <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                                      <span>{valStr}</span>
                                    </span>
                                  )
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                    <span>(ទទេ)</span>
                                  </span>
                                )}
                                {isCopied && (
                                  <span className="absolute right-1 top-1 bg-emerald-600 text-white text-[9px] px-1 py-0.5 rounded shadow z-10">
                                    Copied!
                                  </span>
                                )}
                              </td>
                            );
                          }

                          const isGotCodDate = (gotCodDateCol && gotCodDateCol.id === col.id) || 
                            (l.replace(/[\s\-_()]/g, '').includes('cod') && l.replace(/[\s\-_()]/g, '').includes('date'));
                          if (isGotCodDate) {
                            const valStr = (val !== undefined && val !== null ? String(val) : '').trim();
                            const isToday = valStr ? toIsoDateString(valStr) === todayIso : false;

                            return (
                              <td 
                                key={col.id}
                                onClick={() => handleCopyCell(val, cellId)}
                                className={`py-2.5 px-3.5 whitespace-nowrap cursor-pointer hover:bg-purple-100/50 dark:hover:bg-purple-950/40 transition relative group/cell ${visibilityClass}`}
                                title="ចុចដើម្បីចម្លង (Click to Copy)"
                              >
                                {valStr ? (
                                  isToday ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200/70 dark:border-sky-800/70">
                                      <Sparkles className="w-3 h-3 text-sky-500 shrink-0" />
                                      <span>{valStr}</span>
                                      <span className="text-[8.5px] px-1 py-0.2 rounded font-bold bg-sky-200 dark:bg-sky-800 text-sky-900 dark:text-sky-100">
                                        TODAY
                                      </span>
                                    </span>
                                  ) : (
                                    <span>{valStr}</span>
                                  )
                                ) : (
                                  <span className="text-slate-300 dark:text-slate-600">-</span>
                                )}
                                {isCopied && (
                                  <span className="absolute right-1 top-1 bg-emerald-600 text-white text-[9px] px-1 py-0.5 rounded shadow z-10">
                                    Copied!
                                  </span>
                                )}
                              </td>
                            );
                          }

                          return (
                            <td 
                              key={col.id}
                              onClick={() => handleCopyCell(val, cellId)}
                              className={`py-2.5 px-3.5 text-slate-800 dark:text-slate-200 whitespace-nowrap cursor-pointer hover:bg-purple-100/50 dark:hover:bg-purple-950/40 transition relative group/cell ${
                                isNumber ? 'font-mono text-right' : ''
                              } ${visibilityClass}`}
                              title="ចុចដើម្បីចម្លង (Click to Copy)"
                            >
                              <span>{val !== undefined && val !== null ? String(val) : ''}</span>
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

      {/* 6. Fixed Menu Bottom (Floating Sticky Bottom Bar with Summary & Pagination) */}
      {rows.length > 0 && (
        <div className={`sticky ${isFullScreen ? 'bottom-2 sm:bottom-3' : 'bottom-2 sm:bottom-3'} z-20 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-2 sm:p-2.5 transition-all mt-2.5`}>
          
          {/* Synced Horizontal Scrollbar with Quick Nav Buttons */}
          {hasHorizontalOverflow && (
            <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={scrollTableLeft}
                className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
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
                className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
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
              <option value={25}>25 ជួរ</option>
              <option value={50}>50 ជួរ</option>
              <option value={100}>100 ជួរ</option>
              <option value={200}>200 ជួរ</option>
              <option value={999999}>ទាំងអស់</option>
            </select>

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
                ទំព័រ <strong className="text-purple-600 dark:text-purple-400 font-bold">{currentPage}</strong> / {totalPages || 1}
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

            <div className="px-2 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-mono font-bold text-[11px] border border-purple-200/50 dark:border-purple-800/50">
              {filteredAndSortedRows.length} ជួរ
            </div>
          </div>

          {/* TABLET & DESKTOP VIEW (>= sm) */}
          <div className="hidden sm:flex flex-col lg:flex-row items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start w-full lg:w-auto">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200/60 dark:border-slate-800">
                <span className="font-mono text-purple-600 dark:text-purple-400 font-black">Σ</span>
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
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
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
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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

      {/* Row Detail Modal - Modern, Compact & Structured */}
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
        const colGotCod = gotCodCol || findCol(l => (l.includes('got') && l.includes('cod')) || l === 'got cod');
        const colClear = findCol(l => l === 'clear' || l.includes('clear'));
        const colReturn = returnCol || findCol(l => l === 'return' || l.includes('return') || l.includes('rtn'));

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

        const isCopied = (id: string) => copiedCellId === `modal_${id}`;
        const copyVal = (val: string, id: string) => {
          if (!val || val === '-') return;
          handleCopyCell(val, `modal_${id}`);
        };

        return (
          <div 
            onClick={() => setSelectedDetailRow(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-150"
          >
            <div 
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl sm:max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
            >
              {/* 1. Modal Header */}
              <div className="px-4 sm:px-5 py-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-purple-50/70 via-white to-slate-50/70 dark:from-slate-850 dark:via-slate-900 dark:to-slate-850">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-2.5 py-0.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-mono text-xs font-black shadow-xs shrink-0">
                    #{rowNum}
                  </span>
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
                      ព័ត៌មានលម្អិតកញ្ចប់
                    </h3>
                    {awbnVal && (
                      <button
                        type="button"
                        onClick={() => copyVal(awbnVal, 'awbn_header')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60 font-mono text-xs font-bold transition cursor-pointer"
                        title="ចុចដើម្បីចម្លង AWBN"
                      >
                        <span>{awbnVal}</span>
                        {isCopied('awbn_header') ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 opacity-60" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDetailRow(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                  title="បិទ (ESC)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 2. Modal Body: Modern, Compact & Structured */}
              <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3">
                
                {/* A. Financial Summary Cards (USD & KHM COD) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* USD Card */}
                  <div 
                    onClick={() => copyVal(usdVal, 'usd')}
                    className="p-3 rounded-xl bg-gradient-to-br from-purple-50/90 to-indigo-50/60 dark:from-purple-950/40 dark:to-indigo-950/20 border border-purple-200/80 dark:border-purple-800/50 flex items-center justify-between cursor-pointer hover:border-purple-400 dark:hover:border-purple-600 transition group shadow-2xs"
                    title="ចុចដើម្បីចម្លងទឹកប្រាក់ USD"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-purple-600/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                        <DollarSign className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold text-purple-700/80 dark:text-purple-300/80 uppercase tracking-wider block">
                          ទឹកប្រាក់ USD (COD)
                        </span>
                        <span className="text-base sm:text-lg font-black font-mono text-purple-700 dark:text-purple-300">
                          {usdVal ? (usdVal.includes('$') ? usdVal : `$ ${usdVal}`) : '$ 0.00'}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-purple-500">
                      {isCopied('usd') ? (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                          Copied!
                        </span>
                      ) : (
                        <Copy className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition" />
                      )}
                    </div>
                  </div>

                  {/* KHM Card */}
                  <div 
                    onClick={() => copyVal(khmVal, 'khm')}
                    className="p-3 rounded-xl bg-gradient-to-br from-emerald-50/90 to-teal-50/60 dark:from-emerald-950/40 dark:to-teal-950/20 border border-emerald-200/80 dark:border-emerald-800/50 flex items-center justify-between cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-600 transition group shadow-2xs"
                    title="ចុចដើម្បីចម្លងទឹកប្រាក់ KHM"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-emerald-600/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Coins className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold text-emerald-700/80 dark:text-emerald-300/80 uppercase tracking-wider block">
                          ទឹកប្រាក់ KHM (COD)
                        </span>
                        <span className="text-base sm:text-lg font-black font-mono text-emerald-700 dark:text-emerald-300">
                          {khmVal ? (khmVal.includes('៛') ? khmVal : `${khmVal} ៛`) : '0 ៛'}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-emerald-500">
                      {isCopied('khm') ? (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                          Copied!
                        </span>
                      ) : (
                        <Copy className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition" />
                      )}
                    </div>
                  </div>
                </div>

                {/* B. Core 2-Column Info Cards (Receiver & Handling) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Left: Receiver & Location Info */}
                  <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-850/60 border border-slate-200/70 dark:border-slate-800/70 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 border-b border-slate-200/60 dark:border-slate-800 pb-1.5">
                      <User className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      <span>ព័ត៌មានអ្នកទទួល</span>
                    </div>

                    {/* Receiver Name */}
                    <div 
                      onClick={() => copyVal(receiverVal, 'receiver')}
                      className="group cursor-pointer hover:bg-white dark:hover:bg-slate-800/80 p-1.5 rounded-lg transition"
                      title="ចុចដើម្បីចម្លងឈ្មោះអ្នកទទួល"
                    >
                      <div className="text-[10.5px] font-medium text-slate-400 dark:text-slate-400 flex items-center justify-between">
                        <span>អ្នកទទួល (Receiver)</span>
                        {isCopied('receiver') ? (
                          <span className="text-[9.5px] text-emerald-600 font-bold">Copied!</span>
                        ) : (
                          <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 transition" />
                        )}
                      </div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white break-words mt-0.5">
                        {receiverVal || '-'}
                      </div>
                    </div>

                    {/* Receiver Address */}
                    <div 
                      onClick={() => copyVal(addressVal, 'address')}
                      className="group cursor-pointer hover:bg-white dark:hover:bg-slate-800/80 p-1.5 rounded-lg transition"
                      title="ចុចដើម្បីចម្លងអាសយដ្ឋាន"
                    >
                      <div className="text-[10.5px] font-medium text-slate-400 dark:text-slate-400 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-rose-500 inline" />
                          <span>អាសយដ្ឋាន (Address)</span>
                        </span>
                        {isCopied('address') ? (
                          <span className="text-[9.5px] text-emerald-600 font-bold">Copied!</span>
                        ) : (
                          <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 transition" />
                        )}
                      </div>
                      <div className="text-xs font-medium text-slate-800 dark:text-slate-200 break-words mt-0.5">
                        {addressVal || '-'}
                      </div>
                    </div>

                    {/* Destination (DEST) */}
                    <div 
                      onClick={() => copyVal(destVal, 'dest')}
                      className="group cursor-pointer hover:bg-white dark:hover:bg-slate-800/80 p-1.5 rounded-lg transition"
                      title="ចុចដើម្បីចម្លងគោលដៅ"
                    >
                      <div className="text-[10.5px] font-medium text-slate-400 dark:text-slate-400 flex items-center justify-between">
                        <span>គោលដៅ (DEST)</span>
                        {isCopied('dest') ? (
                          <span className="text-[9.5px] text-emerald-600 font-bold">Copied!</span>
                        ) : (
                          <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 transition" />
                        )}
                      </div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5">
                        {destVal || '-'}
                      </div>
                    </div>
                  </div>

                  {/* Right: Delivery & Handling Info */}
                  <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-850/60 border border-slate-200/70 dark:border-slate-800/70 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 border-b border-slate-200/60 dark:border-slate-800 pb-1.5">
                      <Truck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      <span>ការចាត់ចែងដឹកជញ្ជូន</span>
                    </div>

                    {/* Handle By */}
                    <div 
                      onClick={() => copyVal(handleByVal, 'handleBy')}
                      className="group cursor-pointer hover:bg-white dark:hover:bg-slate-800/80 p-1.5 rounded-lg transition"
                      title="ចុចដើម្បីចម្លង HANDLE BY"
                    >
                      <div className="text-[10.5px] font-medium text-slate-400 dark:text-slate-400 flex items-center justify-between">
                        <span>HANDLE BY</span>
                        {isCopied('handleBy') ? (
                          <span className="text-[9.5px] text-emerald-600 font-bold">Copied!</span>
                        ) : (
                          <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 transition" />
                        )}
                      </div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white break-words mt-0.5">
                        {handleByVal || '-'}
                      </div>
                    </div>

                    {/* Transfer To */}
                    <div 
                      onClick={() => copyVal(transferToVal, 'transferTo')}
                      className="group cursor-pointer hover:bg-white dark:hover:bg-slate-800/80 p-1.5 rounded-lg transition"
                      title="ចុចដើម្បីចម្លង TRANSFER TO"
                    >
                      <div className="text-[10.5px] font-medium text-slate-400 dark:text-slate-400 flex items-center justify-between">
                        <span>TRANSFER TO</span>
                        {isCopied('transferTo') ? (
                          <span className="text-[9.5px] text-emerald-600 font-bold">Copied!</span>
                        ) : (
                          <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 transition" />
                        )}
                      </div>
                      <div className="text-xs font-medium text-slate-800 dark:text-slate-200 break-words mt-0.5">
                        {transferToVal || '-'}
                      </div>
                    </div>

                    {/* Delivery Date */}
                    <div 
                      onClick={() => copyVal(deliveryDateVal, 'deliveryDate')}
                      className="group cursor-pointer hover:bg-white dark:hover:bg-slate-800/80 p-1.5 rounded-lg transition"
                      title="ចុចដើម្បីចម្លងកាលបរិច្ឆេទដឹក"
                    >
                      <div className="text-[10.5px] font-medium text-slate-400 dark:text-slate-400 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-purple-600 dark:text-purple-400 inline" />
                          <span>កាលបរិច្ឆេទដឹក (Date)</span>
                        </span>
                        {isCopied('deliveryDate') ? (
                          <span className="text-[9.5px] text-emerald-600 font-bold">Copied!</span>
                        ) : (
                          <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 transition" />
                        )}
                      </div>
                      <div className="text-xs font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                        {deliveryDateVal || '-'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* C. Specs & Remarks Strip (4 Columns) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50/70 dark:bg-slate-850/50 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
                  {/* Cust ID */}
                  <div 
                    onClick={() => copyVal(custIdVal, 'custId')}
                    className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer group"
                    title="ចុចដើម្បីចម្លង Customer ID"
                  >
                    <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase flex items-center justify-between">
                      <span>Customer ID</span>
                      {isCopied('custId') && <span className="text-[9px] text-emerald-600 font-bold">Copied</span>}
                    </div>
                    <div className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 truncate mt-0.5">
                      {custIdVal || '-'}
                    </div>
                  </div>

                  {/* Unit */}
                  <div 
                    onClick={() => copyVal(unitVal, 'unit')}
                    className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer group"
                    title="ចុចដើម្បីចម្លង Unit"
                  >
                    <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase flex items-center justify-between">
                      <span>Unit</span>
                      {isCopied('unit') && <span className="text-[9px] text-emerald-600 font-bold">Copied</span>}
                    </div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {unitVal || '-'}
                    </div>
                  </div>

                  {/* KG */}
                  <div 
                    onClick={() => copyVal(kgVal, 'kg')}
                    className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer group"
                    title="ចុចដើម្បីចម្លង KG"
                  >
                    <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase flex items-center justify-between">
                      <span>ទម្ងន់ (KG)</span>
                      {isCopied('kg') && <span className="text-[9px] text-emerald-600 font-bold">Copied</span>}
                    </div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {kgVal ? `${kgVal} kg` : '-'}
                    </div>
                  </div>

                  {/* Remarks */}
                  <div 
                    onClick={() => copyVal(remarksVal, 'remarks')}
                    className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer group"
                    title="ចុចដើម្បីចម្លងចំណាំ"
                  >
                    <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase flex items-center justify-between">
                      <span>ចំណាំ (Remarks)</span>
                      {isCopied('remarks') && <span className="text-[9px] text-emerald-600 font-bold">Copied</span>}
                    </div>
                    <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 truncate mt-0.5">
                      {remarksVal || '-'}
                    </div>
                  </div>
                </div>

                {/* D. Status Badges Strip (Check, GOT COD, CLEAR, RETURN) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
                  {/* Check Status */}
                  <div 
                    onClick={() => copyVal(checkVal, 'check')}
                    className={`px-2.5 py-1.5 rounded-lg border text-center cursor-pointer transition flex items-center justify-center gap-1.5 ${
                      checkVal && (checkVal.toUpperCase() === 'TRUE' || checkVal === '1')
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 font-bold'
                        : 'bg-slate-50 dark:bg-slate-850/50 border-slate-200/60 dark:border-slate-800/60 text-slate-500 dark:text-slate-400'
                    }`}
                    title="ចុចដើម្បីចម្លង Check Status"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[11px] truncate">Check: {checkVal || '-'}</span>
                  </div>

                  {/* GOT COD Status */}
                  <div 
                    onClick={() => copyVal(gotCodVal, 'gotCod')}
                    className={`px-2.5 py-1.5 rounded-lg border text-center cursor-pointer transition flex items-center justify-center gap-1.5 ${
                      gotCodVal && gotCodVal !== '-'
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 font-bold'
                        : 'bg-slate-50 dark:bg-slate-850/50 border-slate-200/60 dark:border-slate-800/60 text-slate-500 dark:text-slate-400'
                    }`}
                    title="ចុចដើម្បីចម្លង GOT COD"
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[11px] truncate">GOT COD: {gotCodVal || '-'}</span>
                  </div>

                  {/* CLEAR Status */}
                  <div 
                    onClick={() => copyVal(clearVal, 'clear')}
                    className={`px-2.5 py-1.5 rounded-lg border text-center cursor-pointer transition flex items-center justify-center gap-1.5 ${
                      clearVal && clearVal !== '-'
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 font-bold'
                        : 'bg-slate-50 dark:bg-slate-850/50 border-slate-200/60 dark:border-slate-800/60 text-slate-500 dark:text-slate-400'
                    }`}
                    title="ចុចដើម្បីចម្លង CLEAR"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[11px] truncate">CLEAR: {clearVal || '-'}</span>
                  </div>

                  {/* RETURN Status */}
                  <div 
                    onClick={() => copyVal(returnVal, 'return')}
                    className={`px-2.5 py-1.5 rounded-lg border text-center cursor-pointer transition flex items-center justify-center gap-1.5 ${
                      returnVal && returnVal !== '-'
                        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 font-bold'
                        : 'bg-slate-50 dark:bg-slate-850/50 border-slate-200/60 dark:border-slate-800/60 text-slate-500 dark:text-slate-400'
                    }`}
                    title="ចុចដើម្បីចម្លង RETURN"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[11px] truncate">RETURN: {returnVal || '-'}</span>
                  </div>
                </div>

                {/* E. Dynamic Remaining Columns (if sheet has extra custom columns) */}
                {otherCols.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5">
                      ជួរទិន្នន័យបន្ថែម ({otherCols.length})
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {otherCols.map(col => {
                        const val = selectedDetailRow[col.id];
                        const valStr = (val !== undefined && val !== null) ? String(val).trim() : '';
                        const cellId = `modal_extra_${col.id}`;
                        const isCopiedCell = copiedCellId === cellId;

                        return (
                          <div
                            key={col.id}
                            onClick={() => handleCopyCell(valStr || val, cellId)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between gap-2 hover:bg-purple-50/50 dark:hover:bg-purple-950/30 transition cursor-pointer group"
                            title="ចុចដើម្បីចម្លង"
                          >
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[120px]">
                              {col.label}:
                            </span>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                {valStr || '-'}
                              </span>
                              {isCopiedCell ? (
                                <span className="text-[9px] font-bold text-emerald-600">Copied</span>
                              ) : (
                                <Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 transition shrink-0" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>

              {/* 3. Modal Footer */}
              <div className="px-4 sm:px-5 py-2.5 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/80 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleCopyRow(selectedDetailRow, 'modal_row')}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200/70 dark:border-purple-800/60 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="ចម្លងទិន្នន័យជួរនេះទាំងអស់"
                >
                  {copiedRowId === 'modal_row' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-700 dark:text-emerald-300 font-bold">បានចម្លងទាំងអស់!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>ចម្លងទាំងអស់</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedDetailRow(null)}
                  className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 font-bold text-xs text-slate-700 dark:text-slate-200 transition cursor-pointer"
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
