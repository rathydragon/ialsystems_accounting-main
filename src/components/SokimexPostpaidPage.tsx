import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { 
  Fuel, 
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
  Globe, 
  Lock, 
  Coins, 
  Clock, 
  Filter, 
  Sparkles, 
  Zap, 
  LayoutGrid, 
  CreditCard,
  RotateCcw
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
  getInitialSokimexConfig, 
  saveSokimexConfig, 
  subscribeToSokimexConfig,
  LOCAL_STORAGE_KEY_SOKIMEX_URL,
  LOCAL_STORAGE_KEY_SOKIMEX_SHEET_NAME,
  LOCAL_STORAGE_KEY_SOKIMEX_CACHED_ROWS,
  LOCAL_STORAGE_KEY_SOKIMEX_CACHED_COLS,
  LOCAL_STORAGE_KEY_SOKIMEX_LAST_SYNC
} from '../services/sokimexPostpaidService';

interface SokimexPostpaidPageProps {
  currentUser: AuthUser | null;
  settings: AppSettings;
  onUpdateSettings?: (newSettings: Partial<AppSettings>) => void;
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

const STORAGE_KEY_AUTO_SYNC = 'accounting_sokimex_auto_sync_enabled';
const STORAGE_KEY_SYNC_INTERVAL = 'accounting_sokimex_sync_interval';

export const SokimexPostpaidPage: React.FC<SokimexPostpaidPageProps> = ({
  currentUser,
  settings,
  onUpdateSettings,
  onShowToast
}) => {
  // Check if current user has Admin privileges
  const isAdmin = useMemo(() => {
    return currentUser?.role === 'ADMIN' || (currentUser?.email ? isMasterAdmin(currentUser.email) : false);
  }, [currentUser]);

  // 1. Initial Config from AppSettings / LocalStorage / Env
  const initialUrl = useMemo(() => {
    return (settings.sokimexSheetUrl && settings.sokimexSheetUrl.trim())
      || localStorage.getItem(LOCAL_STORAGE_KEY_SOKIMEX_URL)
      || (import.meta as any).env?.VITE_SOKIMEX_SHEET_URL
      || '';
  }, [settings.sokimexSheetUrl]);

  const initialSheetName = useMemo(() => {
    return (settings.sokimexSheetName && settings.sokimexSheetName.trim())
      || localStorage.getItem(LOCAL_STORAGE_KEY_SOKIMEX_SHEET_NAME)
      || (import.meta as any).env?.VITE_SOKIMEX_SHEET_NAME
      || '';
  }, [settings.sokimexSheetName]);

  const [sheetUrl, setSheetUrl] = useState<string>(initialUrl);
  const [tempSheetUrl, setTempSheetUrl] = useState<string>(initialUrl);

  const [sheetName, setSheetName] = useState<string>(initialSheetName);
  const [tempSheetName, setTempSheetName] = useState<string>(initialSheetName);

  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [showHelpGuide, setShowHelpGuide] = useState<boolean>(false);
  const [fetchMethodUsed, setFetchMethodUsed] = useState<string | null>(null);

  // 2. Data State
  const [columns, setColumns] = useState<SheetColumnDef[]>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY_SOKIMEX_CACHED_COLS);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });

  const [rows, setRows] = useState<SheetRowData[]>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY_SOKIMEX_CACHED_ROWS);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });

  const [lastSynced, setLastSynced] = useState<string>(() => {
    return localStorage.getItem(LOCAL_STORAGE_KEY_SOKIMEX_LAST_SYNC) || '';
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
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => typeof window !== 'undefined' && window.innerWidth < 640 ? 'cards' : 'table');
  const [selectedDetailRow, setSelectedDetailRow] = useState<SheetRowData | null>(null);
  const [hiddenColumnIds, setHiddenColumnIds] = useState<string[]>([]);
  const [showColumnFilterMenu, setShowColumnFilterMenu] = useState<boolean>(false);

  // Filter States: Card Holder Name & Bus. Date Range
  const [selectedCardHolder, setSelectedCardHolder] = useState<string>('');
  const [busDateStart, setBusDateStart] = useState<string>('');
  const [busDateEnd, setBusDateEnd] = useState<string>('');

  // 4. Auto-Sync State
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_AUTO_SYNC);
    return saved !== null ? saved === 'true' : true;
  });
  const [syncInterval, setSyncInterval] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SYNC_INTERVAL);
    return saved ? parseInt(saved, 10) : 60;
  });
  const [countdown, setCountdown] = useState<number>(syncInterval);
  const [isSyncingInBackground, setIsSyncingInBackground] = useState<boolean>(false);
  const [isAutoSyncMenuOpen, setIsAutoSyncMenuOpen] = useState<boolean>(false);

  // 5. Test link state inside config modal
  const [isTestingLink, setIsTestingLink] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; rowsCount?: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef<boolean>(false);
  const autoSyncMenuRef = useRef<HTMLDivElement>(null);
  const lastFingerprintRef = useRef<string>('');
  const rowsRef = useRef<SheetRowData[]>(rows);

  useEffect(() => {
    rowsRef.current = rows;
    if (rows.length > 0 && !lastFingerprintRef.current) {
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

  // Native Fullscreen Controller
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

  const notify = useCallback((msg: string, type: 'success' | 'error' | 'info') => {
    if (onShowToast) {
      onShowToast(msg, type);
    }
  }, [onShowToast]);

  // Real-time Firestore synchronization for Sokimex config across all devices
  useEffect(() => {
    const unsubscribe = subscribeToSokimexConfig((remoteConfig) => {
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

  // Parsed Sheet Info
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

  // Fetch Data using Universal Multi-Tier Fetcher
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
            setErrorMessage(result.error || 'Google Sheet នេះស្ថិតក្នុងស្ថានភាព "Restricted"។ សូម Share ជា "Anyone with the link can view"');
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
      const nowStr = new Date().toISOString();

      if (isSilent && hasChanged) {
        setColumns(result.columns);
        setRows(result.rows);
        rowsRef.current = result.rows;
        lastFingerprintRef.current = newFingerprint;
        setFetchMethodUsed(result.fetchedVia);
        setLastSynced(nowStr);
      } else if (!isSilent) {
        setColumns(result.columns);
        setRows(result.rows);
        rowsRef.current = result.rows;
        lastFingerprintRef.current = newFingerprint;
        setFetchMethodUsed(result.fetchedVia);
        setLastSynced(nowStr);
        notify(`ទាញយកទិន្នន័យជោគជ័យ! (${result.rows.length.toLocaleString('en-US')} ជួរ - ${result.fetchedVia})`, 'success');
      } else {
        setLastSynced(nowStr);
        setFetchMethodUsed(result.fetchedVia);
      }

      // Cache locally
      localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_CACHED_COLS, JSON.stringify(result.columns));
      localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_CACHED_ROWS, JSON.stringify(result.rows));
      localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_LAST_SYNC, nowStr);

    } catch (err: any) {
      if (!isSilent) {
        console.error('Sokimex Postpaid fetch error:', err);
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

  // Auto-sync polling loop
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

  // Window focus auto-sync
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

  // Sync settings when props change
  useEffect(() => {
    if (settings.sokimexSheetUrl && settings.sokimexSheetUrl.trim()) {
      const u = settings.sokimexSheetUrl.trim();
      const n = (settings.sokimexSheetName && settings.sokimexSheetName.trim()) || '';
      if (u !== sheetUrl) {
        setSheetUrl(u);
        setTempSheetUrl(u);
        setSheetName(n);
        setTempSheetName(n);
        localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_URL, u);
        if (n) localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_SHEET_NAME, n);
        setIsConfigOpen(false);
        if (rows.length === 0) {
          fetchGoogleSheetData(u, n);
        }
      }
    }
  }, [settings.sokimexSheetUrl, settings.sokimexSheetName]);

  // Active query to central Google Sheets "Settings" tab on load if sheetUrl is not yet set
  useEffect(() => {
    if (!sheetUrl.trim() && settings.webAppUrl?.trim()) {
      fetch(`${settings.webAppUrl.trim()}?action=get_settings&t=${Date.now()}`)
        .then(r => r.json())
        .then(res => {
          if (res?.data?.sokimexSheetUrl && res.data.sokimexSheetUrl.trim()) {
            const u = res.data.sokimexSheetUrl.trim();
            const n = res.data.sokimexSheetName ? res.data.sokimexSheetName.trim() : '';
            setSheetUrl(u);
            setTempSheetUrl(u);
            setSheetName(n);
            setTempSheetName(n);
            localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_URL, u);
            if (n) localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_SHEET_NAME, n);
            setIsConfigOpen(false);
            fetchGoogleSheetData(u, n);
          }
        })
        .catch(() => {});
    }
  }, [sheetUrl, settings.webAppUrl, fetchGoogleSheetData]);

  // Auto fetch on first mount if URL is available but rows are empty
  useEffect(() => {
    if (sheetUrl.trim() && rows.length === 0) {
      fetchGoogleSheetData(sheetUrl, sheetName);
    }
  }, [sheetUrl, sheetName, rows.length, fetchGoogleSheetData]);

  // Test link in modal
  const handleTestLink = async () => {
    const trimmed = tempSheetUrl.trim();
    if (!trimmed) {
      setTestResult({ success: false, message: 'សូមបញ្ចូល Google Sheets URL ឬ Spreadsheet ID' });
      return;
    }
    setIsTestingLink(true);
    setTestResult(null);
    try {
      const res = await fetchGoogleSheetDataUniversal(trimmed, tempSheetName.trim());
      if (res.success) {
        setTestResult({
          success: true,
          message: `ភ្ជាប់ជោគជ័យ! រកឃើញទិន្នន័យ ${res.rows.length.toLocaleString()} ជួរ និង ${res.columns.length} ជួរឈរ (${res.fetchedVia})`,
          rowsCount: res.rows.length
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'មិនអាចទាញទិន្នន័យបានទេ។ សូមពិនិត្យ Permission Share (Anyone with link can view)'
        });
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || 'កំហុសបច្ចេកទេសក្នុងការតភ្ជាប់' });
    } finally {
      setIsTestingLink(false);
    }
  };

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

    localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_URL, trimmedUrl);
    localStorage.setItem(LOCAL_STORAGE_KEY_SOKIMEX_SHEET_NAME, trimmedName);

    // 1. Sync to Firebase Firestore
    await saveSokimexConfig({
      sheetUrl: trimmedUrl,
      sheetName: trimmedName,
      updatedBy: currentUser?.email || 'admin'
    });

    // 2. Sync to global AppSettings
    if (onUpdateSettings) {
      onUpdateSettings({
        sokimexSheetUrl: trimmedUrl,
        sokimexSheetName: trimmedName
      });
    }

    // 3. Sync to central Google Sheets "Settings" tab (via Web App API)
    if (settings.webAppUrl?.trim()) {
      const targetUrl = settings.webAppUrl.trim();
      const payload = {
        action: 'save_settings',
        settings: {
          sokimexSheetUrl: trimmedUrl,
          sokimexSheetName: trimmedName
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
        console.warn('Could not sync Sokimex setting to Google Sheets Settings tab:', err);
      }
    }

    setIsConfigOpen(false);
    notify('បានរក្សាទុក និង Sync ការកំណត់ SOKIMEX ទៅក្នុង table Settings ជោគជ័យ!', 'success');

    // Automatically trigger fetch
    fetchGoogleSheetData(trimmedUrl, trimmedName);
  };

  // Auto-Sync preferences change
  const handleToggleAutoSync = (enabled: boolean) => {
    setIsAutoSyncEnabled(enabled);
    localStorage.setItem(STORAGE_KEY_AUTO_SYNC, String(enabled));
    if (enabled) {
      setCountdown(syncInterval);
      notify(`បានបើក Auto-Sync (${syncInterval}s)`, 'info');
    } else {
      notify('បានបិទ Auto-Sync', 'info');
    }
    setIsAutoSyncMenuOpen(false);
  };

  const handleChangeSyncInterval = (seconds: number) => {
    setSyncInterval(seconds);
    setCountdown(seconds);
    localStorage.setItem(STORAGE_KEY_SYNC_INTERVAL, String(seconds));
    setIsAutoSyncEnabled(true);
    localStorage.setItem(STORAGE_KEY_AUTO_SYNC, 'true');
    notify(`បានកំណត់ Auto-Sync រៀងរាល់ ${seconds} វិនាទី`, 'info');
    setIsAutoSyncMenuOpen(false);
  };

  // Visible columns
  const visibleColumns = useMemo(() => {
    return columns.filter(col => !hiddenColumnIds.includes(col.id));
  }, [columns, hiddenColumnIds]);

  // Toggle column visibility
  const toggleColumnVisibility = (colId: string) => {
    setHiddenColumnIds(prev => 
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
    );
  };

  // Dynamic column detectors for Sokimex Postpaid
  const busDateCol = useMemo(() => {
    return columns.find(c => {
      const l = c.label.toLowerCase().trim();
      return l === 'bus. date' || l === 'bus date' || (l.includes('bus') && l.includes('date'));
    }) || columns.find(c => c.label.toLowerCase().includes('date'));
  }, [columns]);

  const cardHolderCol = useMemo(() => {
    return columns.find(c => {
      const l = c.label.toLowerCase().trim();
      return l === 'card holder name' || (l.includes('card') && l.includes('holder'));
    }) || columns.find(c => c.label.toLowerCase().includes('holder'));
  }, [columns]);

  const quantityCol = useMemo(() => {
    return columns.find(c => {
      const l = c.label.toLowerCase().trim();
      return l === 'quantity' || l === 'qty' || l.includes('quantity');
    });
  }, [columns]);

  const priceCol = useMemo(() => {
    return columns.find(c => {
      const l = c.label.toLowerCase().trim();
      return l === 'price' || l.includes('price');
    });
  }, [columns]);

  const netAmountCol = useMemo(() => {
    return columns.find(c => {
      const l = c.label.toLowerCase().trim();
      return l === 'net amount' || (l.includes('net') && l.includes('amount'));
    }) || columns.find(c => c.label.toLowerCase().includes('amount'));
  }, [columns]);

  // Unique list of Card Holders
  const uniqueCardHolders = useMemo(() => {
    if (!cardHolderCol) return [];
    const counts: Record<string, number> = {};
    rows.forEach(r => {
      const val = r[cardHolderCol.id];
      if (val !== undefined && val !== null) {
        const s = String(val).trim();
        if (s) {
          counts[s] = (counts[s] || 0) + 1;
        }
      }
    });
    return Object.keys(counts).sort().map(name => ({
      name,
      count: counts[name]
    }));
  }, [rows, cardHolderCol]);

  // Safe Date normalizer
  const normalizeDateStr = (raw: any): string => {
    if (!raw) return '';
    const str = String(raw).trim();
    // Match YYYY/MM/DD or YYYY-MM-DD
    const matchYmd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (matchYmd) {
      const y = matchYmd[1];
      const m = matchYmd[2].padStart(2, '0');
      const d = matchYmd[3].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    // Match DD/MM/YYYY
    const matchDmy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (matchDmy) {
      const d = matchDmy[1].padStart(2, '0');
      const m = matchDmy[2].padStart(2, '0');
      const y = matchDmy[3];
      return `${y}-${m}-${d}`;
    }
    return str.slice(0, 10).replace(/\//g, '-');
  };

  // Search and Advanced Filters (Card Holder Name & Bus. Date Range)
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      // 1. Card Holder Name filter
      if (selectedCardHolder && cardHolderCol) {
        const rowHolder = String(row[cardHolderCol.id] || '').trim();
        if (rowHolder !== selectedCardHolder) {
          return false;
        }
      }

      // 2. Bus. Date Range filter
      if ((busDateStart || busDateEnd) && busDateCol) {
        const cellDateVal = row[busDateCol.id];
        const normDate = normalizeDateStr(cellDateVal);
        if (normDate) {
          if (busDateStart && normDate < busDateStart) {
            return false;
          }
          if (busDateEnd && normDate > busDateEnd) {
            return false;
          }
        }
      }

      // 3. Search Term filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesSearch = Object.entries(row).some(([key, val]) => {
          if (key.startsWith('_')) return false;
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(term);
        });
        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [rows, selectedCardHolder, cardHolderCol, busDateStart, busDateEnd, busDateCol, searchTerm]);

  // Summary Totals: Quantity, Price, Net Amount
  const summaryTotals = useMemo(() => {
    let totalQty = 0;
    let totalPrice = 0;
    let totalNet = 0;
    let countPrice = 0;

    filteredRows.forEach(row => {
      if (quantityCol) {
        const qVal = row[quantityCol.id];
        if (qVal !== undefined && qVal !== null) {
          const qNum = Number(String(qVal).replace(/[^0-9.-]+/g, ''));
          if (!isNaN(qNum)) totalQty += qNum;
        }
      }

      if (priceCol) {
        const pVal = row[priceCol.id];
        if (pVal !== undefined && pVal !== null) {
          const pNum = Number(String(pVal).replace(/[^0-9.-]+/g, ''));
          if (!isNaN(pNum)) {
            totalPrice += pNum;
            countPrice++;
          }
        }
      }

      if (netAmountCol) {
        const nVal = row[netAmountCol.id];
        if (nVal !== undefined && nVal !== null) {
          const nNum = Number(String(nVal).replace(/[^0-9.-]+/g, ''));
          if (!isNaN(nNum)) totalNet += nNum;
        }
      }
    });

    const avgPrice = countPrice > 0 ? totalPrice / countPrice : 0;

    return {
      totalQty,
      totalPrice,
      avgPrice,
      totalNet
    };
  }, [filteredRows, quantityCol, priceCol, netAmountCol]);

  const hasActiveFilters = Boolean(
    selectedCardHolder || busDateStart || busDateEnd || searchTerm.trim()
  );

  const handleClearAllFilters = () => {
    setSelectedCardHolder('');
    setBusDateStart('');
    setBusDateEnd('');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const handleSetThisMonth = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    setBusDateStart(`${y}-${m}-01`);
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    setBusDateEnd(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
    setCurrentPage(1);
  };

  const handleSetLastMonth = () => {
    const now = new Date();
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = prevMonthDate.getFullYear();
    const m = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
    setBusDateStart(`${y}-${m}-01`);
    const lastDay = new Date(y, prevMonthDate.getMonth() + 1, 0).getDate();
    setBusDateEnd(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
    setCurrentPage(1);
  };

  const handleSetLast7Days = () => {
    const now = new Date();
    const past = new Date();
    past.setDate(past.getDate() - 7);
    setBusDateStart(past.toISOString().slice(0, 10));
    setBusDateEnd(now.toISOString().slice(0, 10));
    setCurrentPage(1);
  };

  // Sorting
  const sortedRows = useMemo(() => {
    if (!sortColumn) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null || aVal === '') return 1;
      if (bVal === undefined || bVal === null || bVal === '') return -1;

      const aNum = Number(String(aVal).replace(/[^0-9.-]+/g, ''));
      const bNum = Number(String(bVal).replace(/[^0-9.-]+/g, ''));
      const isBothNumbers = !isNaN(aNum) && !isNaN(bNum) && String(aVal).trim() !== '' && String(bVal).trim() !== '';

      if (isBothNumbers) {
        return sortDirection === 'ASC' ? aNum - bNum : bNum - aNum;
      }

      const strA = String(aVal).toLowerCase();
      const strB = String(bVal).toLowerCase();
      return sortDirection === 'ASC' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredRows, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, currentPage, pageSize]);

  // Handle Sort Click
  const handleSort = (colId: string) => {
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

  // Copy Cell
  const handleCopyCell = (text: any, id: string) => {
    const str = String(text ?? '');
    navigator.clipboard.writeText(str);
    setCopiedCellId(id);
    notify(`បានចម្លង: ${str.slice(0, 30)}${str.length > 30 ? '...' : ''}`, 'info');
    setTimeout(() => setCopiedCellId(null), 1800);
  };

  // Copy Row
  const handleCopyRow = (row: SheetRowData) => {
    const dataOnly = Object.entries(row)
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    navigator.clipboard.writeText(dataOnly);
    setCopiedRowId(row._id);
    notify('បានចម្លងទិន្នន័យជួរនេះជោគជ័យ!', 'success');
    setTimeout(() => setCopiedRowId(null), 2000);
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (rows.length === 0) {
      notify('ពុំមានទិន្នន័យសម្រាប់ទាញយកទេ', 'error');
      return;
    }

    const headers = visibleColumns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',');
    const csvLines = rows.map(r => {
      return visibleColumns.map(c => {
        const val = r[c.id];
        if (val === undefined || val === null) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',');
    });

    const csvContent = '\uFEFF' + [headers, ...csvLines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Sokimex_Postpaid_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify('បានទាញយកឯកសារ CSV ជោគជ័យ!', 'success');
  };

  // Auto-calculated numeric statistics (Amount / Liters / Total if any column detected)
  const stats = useMemo(() => {
    let detectedAmount = 0;
    let detectedAmountLabel = '';
    let foundNumericCol = false;

    // Look for common Sokimex / Fuel / Postpaid columns
    const numericCandidate = columns.find(c => {
      const l = c.label.toLowerCase();
      return l.includes('amount') || l.includes('total') || l.includes('usd') || l.includes('khr') || l.includes('riel') || l.includes('price') || l.includes('ទឹកប្រាក់') || l.includes('លីត្រ') || l.includes('liter');
    });

    if (numericCandidate) {
      foundNumericCol = true;
      detectedAmountLabel = numericCandidate.label;
      detectedAmount = rows.reduce((acc, row) => {
        const val = row[numericCandidate.id];
        if (!val) return acc;
        const num = Number(String(val).replace(/[^0-9.-]+/g, ''));
        return acc + (isNaN(num) ? 0 : num);
      }, 0);
    }

    return {
      hasNumericStats: foundNumericCol,
      numericLabel: detectedAmountLabel,
      numericTotal: detectedAmount
    };
  }, [columns, rows]);

  return (
    <div 
      ref={containerRef}
      className={`w-full transition-all ${
        isFullScreen 
          ? 'fixed inset-0 z-50 overflow-y-auto p-2 sm:p-4 bg-slate-50 dark:bg-[#070d19] w-screen h-screen' 
          : 'space-y-2 sm:space-y-2.5 pb-10'
      }`}
    >
      <div className="w-full space-y-2 sm:space-y-2.5">
        
        {/* ================= COMPACT HEADER SECTION ================= */}
        <div className="bg-white dark:bg-[#0c162c] rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-800/90 shadow-2xs px-3 sm:px-4 py-2 sm:py-2.5 transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            
            {/* Left: Branding & Status */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-gradient-to-br from-amber-500 via-orange-600 to-red-600 text-white flex items-center justify-center shadow-xs shrink-0 ring-1 ring-orange-500/20">
                <Fuel className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h1 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5">
                    <span>SOKIMEX POSTPAID</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 border border-orange-500/30">
                      Sokimex
                    </span>
                  </h1>

                  {/* Sync status indicator */}
                  {sheetUrl.trim() ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Connected</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      <AlertCircle className="w-3 h-3 text-amber-500" />
                      <span>មិនទាន់ភ្ជាប់</span>
                    </span>
                  )}

                  {sheetName && (
                    <span className="hidden md:inline-flex items-center text-[10.5px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded font-mono">
                      Tab: {sheetName}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Actions (Compact Pills) */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
              
              {/* External Link to Google Sheets */}
              {googleSheetWebUrl && (
                <a
                  href={googleSheetWebUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 h-7 sm:h-8 px-2 sm:px-2.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors border border-slate-200/80 dark:border-slate-700/80 shadow-2xs"
                  title="បើកមើល Google Sheets ផ្ទាល់"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="hidden sm:inline">Sheets</span>
                </a>
              )}

              {/* Auto-Sync Dropdown */}
              <div className="relative" ref={autoSyncMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsAutoSyncMenuOpen(!isAutoSyncMenuOpen)}
                  className={`inline-flex items-center gap-1 h-7 sm:h-8 px-2 sm:px-2.5 text-xs font-semibold rounded-lg transition-all border shadow-2xs ${
                    isAutoSyncEnabled
                      ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                      : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                  }`}
                  title="កំណត់ Auto-Sync"
                >
                  <Zap className={`w-3.5 h-3.5 ${isAutoSyncEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                  <span className="hidden sm:inline">Auto:</span>
                  <span>{isAutoSyncEnabled ? `${countdown}s` : 'Off'}</span>
                  {isSyncingInBackground && (
                    <RefreshCw className="w-3 h-3 animate-spin text-blue-500 ml-0.5" />
                  )}
                </button>

                {isAutoSyncMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-44 bg-white dark:bg-[#0f1d38] rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 z-50 text-xs">
                    <div className="px-3 py-1 font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase tracking-wider">
                      Auto-Sync ស្វ័យប្រវត្តិ
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleAutoSync(false)}
                      className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        !isAutoSyncEnabled ? 'text-blue-600 font-bold dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span>បិទ (Off)</span>
                      {!isAutoSyncEnabled && <Check className="w-3.5 h-3.5" />}
                    </button>
                    {[30, 60, 300, 900].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => handleChangeSyncInterval(sec)}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 ${
                          isAutoSyncEnabled && syncInterval === sec
                            ? 'text-blue-600 font-bold dark:text-blue-400'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span>{sec < 60 ? `${sec} វិនាទី` : `${sec / 60} នាទី`}</span>
                        {isAutoSyncEnabled && syncInterval === sec && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sync Now Button */}
              <button
                type="button"
                onClick={() => fetchGoogleSheetData(sheetUrl, sheetName, false)}
                disabled={isLoading || !sheetUrl.trim()}
                className="inline-flex items-center gap-1.5 h-7 sm:h-8 px-2.5 sm:px-3 text-xs font-bold rounded-lg bg-orange-600 hover:bg-orange-700 active:scale-95 text-white transition-all shadow-xs disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                title="ទាញយកទិន្នន័យថ្មីចុងក្រោយ"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'កំពុងទាញ...' : 'Sync'}</span>
              </button>

              {/* Configure / Connect Link Button */}
              <button
                type="button"
                onClick={() => {
                  setTempSheetUrl(sheetUrl);
                  setTempSheetName(sheetName);
                  setTestResult(null);
                  setIsConfigOpen(true);
                }}
                className="inline-flex items-center gap-1 h-7 sm:h-8 px-2 sm:px-2.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors border border-slate-200/80 dark:border-slate-700/80 shadow-2xs cursor-pointer"
                title="កំណត់ Link Google Sheets"
              >
                <Settings className="w-3.5 h-3.5 text-orange-500" />
                <span className="hidden sm:inline">ភ្ជាប់ Link</span>
              </button>

              {/* Fullscreen Toggle */}
              <button
                type="button"
                onClick={toggleFullScreen}
                className={`inline-flex items-center gap-1 h-7 sm:h-8 px-2 sm:px-2.5 text-xs font-semibold rounded-lg transition-all border shadow-2xs cursor-pointer ${
                  isFullScreen 
                    ? 'bg-orange-600 hover:bg-orange-700 text-white border-orange-700 shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-slate-700/80'
                }`}
                title={isFullScreen ? 'បង្រួមធម្មតា (Exit Fullscreen)' : 'មើលពេញអេក្រង់ (Fullscreen)'}
              >
                {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5 text-orange-500" />}
                <span className="hidden md:inline font-bold">{isFullScreen ? 'បង្រួម' : 'ពេញអេក្រង់'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ================= RESTRICTED OR EMPTY BANNER ================= */}
        {/* ================= RESTRICTED OR EMPTY BANNER ================= */}
        {!sheetUrl.trim() && (
          <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 dark:from-orange-950/30 dark:via-amber-950/20 dark:to-orange-950/30 border-2 border-dashed border-orange-300 dark:border-orange-800/80 rounded-xl sm:rounded-2xl p-4 sm:p-5 text-center space-y-2.5">
            <div className="w-10 h-10 mx-auto rounded-xl bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 flex items-center justify-center">
              <LinkIcon className="w-5 h-5" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                សូមភ្ជាប់ Link Google Sheet សម្រាប់ SOKIMEX POSTPAID
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                បញ្ចូល Link Google Sheet របស់ Sokimex Postpaid ដើម្បីទាញទិន្នន័យដោយស្វ័យប្រវត្តិ។
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setTempSheetUrl('');
                setTempSheetName('');
                setTestResult(null);
                setIsConfigOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/25 transition-all cursor-pointer"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>ភ្ជាប់ Link Google Sheet</span>
            </button>
          </div>
        )}

        {isRestrictedWarning && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs text-red-800 dark:text-red-200 space-y-0.5">
              <p className="font-bold">⚠️ Google Sheet នេះត្រូវបានកំណត់ជា Private ឬ Restricted!</p>
              <p>សូមបើក Google Sheets នោះ ហើយចុច <strong>Share ➔ General access ➔ ជ្រើសរើស "Anyone with the link" (Viewer)</strong> រួចចុច Sync ម្តងទៀត។</p>
            </div>
          </div>
        )}

        {/* ================= COMPACT STATS RIBBON ================= */}
        {sheetUrl.trim() && (
          <div className="bg-white dark:bg-[#0c162c] rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-800/90 shadow-2xs p-2 sm:p-2.5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
              
              {/* 1. Filtered / Total Rows */}
              <div className="bg-slate-50/80 dark:bg-[#080f1e]/80 rounded-lg sm:rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 border border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                <div className="min-w-0">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    ជួរទិន្នន័យ (Rows)
                  </span>
                  <div className="text-sm sm:text-base lg:text-lg font-black text-slate-900 dark:text-white tracking-tight leading-tight truncate">
                    {filteredRows.length.toLocaleString('en-US')}
                    {filteredRows.length !== rows.length && (
                      <span className="text-[10px] text-slate-400 font-normal ml-1">/ {rows.length.toLocaleString('en-US')}</span>
                    )}
                  </div>
                </div>
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 flex items-center justify-center shrink-0">
                  <Hash className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* 2. Total Quantity */}
              <div className="bg-amber-500/5 dark:bg-amber-950/20 rounded-lg sm:rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 border border-amber-200/50 dark:border-amber-900/40 flex items-center justify-between">
                <div className="min-w-0">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-amber-700/80 dark:text-amber-400/80 uppercase tracking-wider block truncate">
                    QUANTITY សរុប
                  </span>
                  <div className="text-sm sm:text-base lg:text-lg font-black text-amber-600 dark:text-amber-400 tracking-tight leading-tight truncate">
                    {summaryTotals.totalQty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Fuel className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* 3. Total Price & Avg Price */}
              <div className="bg-blue-500/5 dark:bg-blue-950/20 rounded-lg sm:rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 border border-blue-200/50 dark:border-blue-900/40 flex items-center justify-between">
                <div className="min-w-0">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-blue-700/80 dark:text-blue-400/80 uppercase tracking-wider block truncate">
                    PRICE សរុប
                  </span>
                  <div className="text-sm sm:text-base lg:text-lg font-black text-blue-600 dark:text-blue-400 tracking-tight leading-tight truncate">
                    ${summaryTotals.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-[9.5px] text-slate-400 font-normal ml-1 hidden sm:inline">(Avg: ${summaryTotals.avgPrice.toFixed(2)})</span>
                  </div>
                </div>
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <DollarSign className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* 4. Total Net Amount */}
              <div className="bg-emerald-500/10 dark:bg-emerald-950/30 rounded-lg sm:rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 border border-emerald-300/50 dark:border-emerald-800/60 flex items-center justify-between">
                <div className="min-w-0">
                  <span className="text-[10px] sm:text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block truncate">
                    NET AMOUNT សរុប
                  </span>
                  <div className="text-sm sm:text-base lg:text-lg font-black text-emerald-600 dark:text-emerald-400 tracking-tight leading-tight truncate">
                    ${summaryTotals.totalNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Coins className="w-3.5 h-3.5" />
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ================= COMPACT UNIFIED FILTER BAR ================= */}
        {sheetUrl.trim() && (
          <div className="bg-white dark:bg-[#0c162c] rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-800/90 p-2 sm:p-2.5 shadow-2xs space-y-2">
            
            {/* Top Toolbar: Search + Tools */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              
              {/* Search Box */}
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="ស្វែងរកគ្រប់ជួរ (ឈ្មោះ, កាត, ថ្ងៃ, ចំនួន, តម្លៃ...)"
                  className="w-full h-8 pl-8 pr-7 text-xs bg-slate-50 dark:bg-[#080f1e] border border-slate-200 dark:border-slate-700/80 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 transition-all"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* View & Tool Actions */}
              <div className="flex items-center gap-1.5 shrink-0 justify-end">
                
                {/* Column Visibility Filter */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowColumnFilterMenu(!showColumnFilterMenu)}
                    className="inline-flex items-center gap-1 h-8 px-2 sm:px-2.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors border border-slate-200 dark:border-slate-700"
                    title="ជ្រើសរើសជួរឈរដើម្បីបង្ហាញ"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>ជួរឈរ ({visibleColumns.length})</span>
                  </button>

                  {showColumnFilterMenu && (
                    <div className="absolute right-0 mt-1.5 w-52 max-h-64 overflow-y-auto bg-white dark:bg-[#0f1d38] rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-2 z-50 text-xs space-y-1">
                      <div className="px-2 py-1 font-bold text-slate-400 text-[10px] uppercase border-b border-slate-100 dark:border-slate-800">
                        ជ្រើសរើសជួរឈរ
                      </div>
                      {columns.map(col => {
                        const isVisible = !hiddenColumnIds.includes(col.id);
                        return (
                          <label
                            key={col.id}
                            className="flex items-center gap-2 px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => toggleColumnVisibility(col.id)}
                              className="rounded text-orange-600 focus:ring-orange-500"
                            />
                            <span className="truncate text-slate-700 dark:text-slate-200">{col.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* View Switch: Table vs Cards */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`p-1 rounded-md transition-colors ${
                      viewMode === 'table'
                        ? 'bg-white dark:bg-[#0c162c] text-orange-600 dark:text-orange-400 shadow-2xs font-bold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                    title="តារាង (Table View)"
                  >
                    <Table2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    className={`p-1 rounded-md transition-colors ${
                      viewMode === 'cards'
                        ? 'bg-white dark:bg-[#0c162c] text-orange-600 dark:text-orange-400 shadow-2xs font-bold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                    title="កាត (Card View)"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Export CSV Button */}
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={rows.length === 0}
                  className="inline-flex items-center gap-1 h-8 px-2 sm:px-2.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors border border-slate-200 dark:border-slate-700 disabled:opacity-50"
                  title="ទាញយកជា CSV / Excel"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">Export</span>
                </button>
              </div>

            </div>

            {/* Bottom Filter Strip: Card Holder & Date Range & Presets */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 text-xs">
              
              {/* Card Holder Name Dropdown */}
              <div className="flex-1 sm:flex-none min-w-[140px] max-w-full sm:max-w-[200px]">
                <select
                  value={selectedCardHolder}
                  onChange={(e) => {
                    setSelectedCardHolder(e.target.value);
                    setCurrentPage(1);
                  }}
                  className={`w-full h-8 px-2 text-xs bg-slate-50 dark:bg-[#080f1e] border rounded-lg focus:ring-1 focus:ring-orange-500 text-slate-800 dark:text-slate-100 truncate cursor-pointer ${
                    selectedCardHolder ? 'border-orange-400 dark:border-orange-600 bg-orange-50/30' : 'border-slate-200 dark:border-slate-700'
                  }`}
                  title="Filter តាម Card Holder Name"
                >
                  <option value="">👤 Card Holder ទាំងអស់ ({uniqueCardHolders.length})</option>
                  {uniqueCardHolders.map(item => (
                    <option key={item.name} value={item.name}>
                      {item.name} ({item.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Bus Date Range Inline Picker */}
              <div className="inline-flex items-center gap-1 bg-slate-50 dark:bg-[#080f1e] border border-slate-200 dark:border-slate-700 rounded-lg px-2 h-8 text-xs">
                <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <input
                  type="date"
                  value={busDateStart}
                  onChange={(e) => {
                    setBusDateStart(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-transparent border-0 p-0 text-xs text-slate-700 dark:text-slate-200 focus:ring-0 cursor-pointer w-[95px] sm:w-[105px]"
                  title="Bus. Date (ចាប់ពីថ្ងៃ)"
                />
                <span className="text-slate-400 text-xs">➔</span>
                <input
                  type="date"
                  value={busDateEnd}
                  onChange={(e) => {
                    setBusDateEnd(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-transparent border-0 p-0 text-xs text-slate-700 dark:text-slate-200 focus:ring-0 cursor-pointer w-[95px] sm:w-[105px]"
                  title="Bus. Date (ដល់ថ្ងៃ)"
                />
              </div>

              {/* Date Presets */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleSetThisMonth}
                  className="h-7 px-2 text-[10.5px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md transition-colors cursor-pointer"
                >
                  ខែនេះ
                </button>
                <button
                  type="button"
                  onClick={handleSetLastMonth}
                  className="h-7 px-2 text-[10.5px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md transition-colors cursor-pointer"
                >
                  ខែមុន
                </button>
                <button
                  type="button"
                  onClick={handleSetLast7Days}
                  className="h-7 px-2 text-[10.5px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md transition-colors cursor-pointer"
                >
                  ៧ថ្ងៃ
                </button>
              </div>

              {/* Reset Filter Button */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="h-7 px-2 text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 rounded-md flex items-center gap-1 transition-colors cursor-pointer ml-auto"
                  title="សម្អាតការ Filter ទាំងអស់"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}

            </div>

          </div>
        )}

        {/* ================= DATA CONTENT (TABLE / CARDS) ================= */}
        {sheetUrl.trim() && (
          <div className="bg-white dark:bg-[#0c162c] rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-800/90 shadow-2xs overflow-hidden">
            
            {/* Loading State */}
            {isLoading && rows.length === 0 ? (
              <div className="py-20 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-orange-600 animate-spin mx-auto" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  កំពុងទាញយកទិន្នន័យពី Google Sheets...
                </p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="py-20 text-center space-y-3">
                <FileSpreadsheet className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {searchTerm.trim() ? `ពុំមានទិន្នន័យត្រូវនឹង "${searchTerm}" ទេ` : 'ពុំមានទិន្នន័យនៅក្នុង Sheet នេះទេ'}
                </p>
                {searchTerm.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="text-xs text-orange-600 hover:underline font-medium"
                  >
                    សម្អាតការស្វែងរក
                  </button>
                )}
              </div>
            ) : viewMode === 'table' ? (
              
              /* TABLE VIEW */
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 dark:bg-[#080f1e]/90 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 select-none">
                      <th className="py-2 px-2.5 w-10 text-center font-bold text-xs">#</th>
                      {visibleColumns.map((col) => {
                        const isSorted = sortColumn === col.id;
                        return (
                          <th
                            key={col.id}
                            onClick={() => handleSort(col.id)}
                            className="py-2 px-2.5 font-bold hover:bg-slate-200/60 dark:hover:bg-slate-800/60 cursor-pointer transition-colors whitespace-nowrap text-xs"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>{col.label}</span>
                              <ArrowUpDown className={`w-3.5 h-3.5 ${isSorted ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400 opacity-40'}`} />
                            </div>
                          </th>
                        );
                      })}
                      <th className="py-2 px-2.5 w-12 text-center font-bold text-xs">សកម្មភាព</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {paginatedRows.map((row, idx) => {
                      const rowNum = (currentPage - 1) * pageSize + idx + 1;
                      return (
                        <tr
                          key={row._id || idx}
                          onClick={() => setSelectedDetailRow(row)}
                          className="hover:bg-orange-500/5 dark:hover:bg-orange-500/10 transition-colors cursor-pointer group"
                        >
                          <td className="py-1.5 px-2.5 text-center text-slate-400 font-mono text-[10.5px]">
                            {rowNum}
                          </td>
                          {visibleColumns.map((col) => {
                            const val = row[col.id];
                            const cellStr = val !== undefined && val !== null ? String(val) : '';
                            const cellKey = `${row._id}_${col.id}`;
                            const isCopied = copiedCellId === cellKey;

                            return (
                              <td
                                key={col.id}
                                className="py-1.5 px-2.5 whitespace-nowrap text-slate-700 dark:text-slate-200 text-xs"
                                onClick={(e) => {
                                  // Click to copy cell
                                  e.stopPropagation();
                                  handleCopyCell(cellStr, cellKey);
                                }}
                                title="ចុចដើម្បីចម្លង (Click to copy)"
                              >
                                <div className="flex items-center gap-1.5 group/cell">
                                  <span className="truncate max-w-[260px]">{cellStr || '-'}</span>
                                  {cellStr && (
                                    <span className="opacity-0 group-hover/cell:opacity-100 transition-opacity text-slate-400">
                                      {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                    </span>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          <td 
                            className="py-1.5 px-2 text-center"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyRow(row);
                            }}
                          >
                            <button
                              type="button"
                              className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="ចម្លងជួរទាំងមូល"
                            >
                              {copiedRowId === row._id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Table Footer with Summary Columns: Quantity, Price, Net Amount */}
                  {filteredRows.length > 0 && (
                    <tfoot className="bg-slate-100 dark:bg-[#080f1e] text-slate-800 dark:text-slate-100 font-bold border-t-2 border-slate-300 dark:border-slate-700 sticky bottom-0 z-10 shadow-xs">
                      <tr>
                        <td className="py-2 px-2.5 text-center text-slate-400 font-mono text-[10.5px]">Σ</td>
                        {visibleColumns.map((col) => {
                          if (quantityCol && col.id === quantityCol.id) {
                            return (
                              <td key={col.id} className="py-2 px-2.5 whitespace-nowrap text-amber-600 dark:text-amber-400 font-black text-xs">
                                <span className="text-[10px] text-slate-400 font-normal mr-1">សរុប:</span>
                                {summaryTotals.totalQty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            );
                          }
                          if (priceCol && col.id === priceCol.id) {
                            return (
                              <td key={col.id} className="py-2 px-2.5 whitespace-nowrap text-blue-600 dark:text-blue-400 font-black text-xs">
                                <span className="text-[10px] text-slate-400 font-normal mr-1">សរុប:</span>
                                ${summaryTotals.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            );
                          }
                          if (netAmountCol && col.id === netAmountCol.id) {
                            return (
                              <td key={col.id} className="py-2 px-2.5 whitespace-nowrap text-emerald-600 dark:text-emerald-400 font-black text-xs">
                                <span className="text-[10px] text-slate-400 font-normal mr-1">សរុប:</span>
                                ${summaryTotals.totalNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            );
                          }
                          if (col === visibleColumns[0]) {
                            return (
                              <td key={col.id} className="py-2 px-2.5 whitespace-nowrap uppercase tracking-wider text-[10.5px] text-slate-500 dark:text-slate-400">
                                សរុប ({filteredRows.length.toLocaleString('en-US')} ជួរ)
                              </td>
                            );
                          }
                          return <td key={col.id} className="py-2 px-2.5 text-slate-400">-</td>;
                        })}
                        <td className="py-2 px-2.5 text-center">-</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

            ) : (

              /* CARD VIEW */
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {paginatedRows.map((row, idx) => {
                  const rowNum = (currentPage - 1) * pageSize + idx + 1;
                  return (
                    <div
                      key={row._id || idx}
                      onClick={() => setSelectedDetailRow(row)}
                      className="p-4 rounded-xl border border-slate-200/90 dark:border-slate-800/90 bg-slate-50/50 dark:bg-[#080f1e]/50 hover:border-orange-500/50 hover:shadow-md transition-all cursor-pointer space-y-2.5"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800/80 pb-2">
                        <span className="text-xs font-bold text-orange-600 dark:text-orange-400 font-mono">
                          #{rowNum}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyRow(row);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          title="ចម្លងជួរទាំងមូល"
                        >
                          {copiedRowId === row._id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        {visibleColumns.slice(0, 6).map((col) => {
                          const val = row[col.id];
                          return (
                            <div key={col.id} className="flex items-start justify-between gap-2">
                              <span className="text-slate-400 truncate max-w-[120px]">{col.label}:</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-100 text-right truncate">
                                {val !== undefined && val !== null ? String(val) : '-'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-4 py-3 bg-slate-50 dark:bg-[#080f1e] border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="text-slate-500 dark:text-slate-400">
                  បង្ហាញ <strong>{(currentPage - 1) * pageSize + 1}</strong> ដល់ <strong>{Math.min(currentPage * pageSize, sortedRows.length)}</strong> នៃ <strong>{sortedRows.length}</strong> ជួរ
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-2 py-1 rounded-lg bg-white dark:bg-[#0c162c] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    <option value={25}>25 / ទំព័រ</option>
                    <option value={50}>50 / ទំព័រ</option>
                    <option value={100}>100 / ទំព័រ</option>
                    <option value={200}>200 / ទំព័រ</option>
                  </select>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-2 font-medium">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ================= COMPACT FOOTER MENU SUMMARY BAR ================= */}
        {sheetUrl.trim() && filteredRows.length > 0 && (
          <div className="bg-slate-900/95 text-white rounded-xl sm:rounded-2xl p-2 sm:p-2.5 shadow-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 sticky bottom-2 z-20 backdrop-blur-md">
            
            {/* Left: Summary Title & Row Count */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold shrink-0">
                <Coins className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-white">Footer Summary (សរុប)</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                  {filteredRows.length.toLocaleString('en-US')} / {rows.length.toLocaleString('en-US')} ជួរ
                </span>
                {hasActiveFilters && (
                  <span className="text-[9.5px] text-orange-400 font-semibold">(Filtered)</span>
                )}
              </div>
            </div>

            {/* Right: Quantity, Price, Net Amount Metrics */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full md:w-auto">
              
              {/* Quantity Metric */}
              <div className="flex-1 md:flex-none bg-slate-800/90 px-2.5 py-1 rounded-lg border border-slate-700/80 flex items-center gap-1.5">
                <Fuel className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[9px] text-slate-400 uppercase block font-semibold leading-none">Quantity</span>
                  <span className="font-black text-amber-300 text-xs sm:text-sm leading-tight">
                    {summaryTotals.totalQty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Price Metric */}
              <div className="flex-1 md:flex-none bg-slate-800/90 px-2.5 py-1 rounded-lg border border-slate-700/80 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[9px] text-slate-400 uppercase block font-semibold leading-none">Price</span>
                  <div className="font-black text-blue-300 text-xs sm:text-sm leading-tight flex items-baseline gap-1">
                    <span>${summaryTotals.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="text-[9px] text-slate-400 font-normal hidden sm:inline">(Avg: ${summaryTotals.avgPrice.toFixed(2)})</span>
                  </div>
                </div>
              </div>

              {/* Net Amount Metric */}
              <div className="flex-1 md:flex-none bg-emerald-500/20 px-3 py-1 rounded-lg border border-emerald-500/40 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[9px] text-emerald-200 uppercase block font-semibold leading-none">Net Amount</span>
                  <span className="font-black text-emerald-400 text-xs sm:text-sm leading-tight tracking-tight">
                    ${summaryTotals.totalNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

            </div>

          </div>
        )}

      </div>

      {/* ================= CONFIGURATION MODAL ================= */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#0c162c] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 flex items-center justify-center">
                  <Fuel className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    ភ្ជាប់ Google Sheet SOKIMEX POSTPAID
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    បញ្ចូល Link Google Sheets និង Sheet Tab Name
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsConfigOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              
              {/* Google Sheets URL */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Google Sheet URL ឬ Spreadsheet ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={tempSheetUrl}
                  onChange={(e) => setTempSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/1xxx.../edit"
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-[#080f1e] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-orange-500/30 text-slate-800 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  គាំទ្រគ្រប់ទម្រង់៖ Normal URL, Direct ID, ឬ Web Published URL
                </p>
              </div>

              {/* Sheet Tab Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  ឈ្មោះសន្លឹកកិច្ចការ (Sheet / Tab Name) <span className="text-slate-400 font-normal">(ជម្រើស)</span>
                </label>
                <input
                  type="text"
                  value={tempSheetName}
                  onChange={(e) => setTempSheetName(e.target.value)}
                  placeholder="ឧទាហរណ៍៖ Sokimex, Postpaid, Sheet1"
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-[#080f1e] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-orange-500/30 text-slate-800 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  ប្រសិនបើទុកទំនេរ ប្រព័ន្ធនឹងទាញយកទិន្នន័យពីសន្លឹកដំបូងគេ (First Sheet / Tab)
                </p>
              </div>

              {/* Test Result Message */}
              {testResult && (
                <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  testResult.success 
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-800'
                }`}>
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}

              {/* Instructions Reminder */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200/80 dark:border-amber-900/50 text-[11px] text-amber-800 dark:text-amber-200 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <span>📌 ចំណុចសំខាន់៖</span>
                </div>
                <p>ត្រូវប្រាកដថា Google Sheet នោះត្រូវបានកំណត់ Share ជា <strong>"Anyone with the link can view"</strong> ដើម្បីឱ្យប្រព័ន្ធអាចទាញទិន្នន័យបាន។</p>
              </div>

            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 gap-2">
              <button
                type="button"
                onClick={handleTestLink}
                disabled={isTestingLink || !tempSheetUrl.trim()}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
              >
                {isTestingLink ? 'កំពុងតេស្ត...' : 'តេស្តការតភ្ជាប់'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  បោះបង់
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={!tempSheetUrl.trim()}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-orange-600 hover:bg-orange-700 text-white transition-all shadow-md shadow-orange-600/25 disabled:opacity-50 cursor-pointer"
                >
                  រក្សាទុក និង Sync
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ================= HELP GUIDE MODAL ================= */}
      {showHelpGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#0c162c] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-orange-500" />
                <span>របៀបភ្ជាប់ Google Sheets ថ្មី</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowHelpGuide(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 font-bold flex items-center justify-center shrink-0 text-xs">1</span>
                <p>បើកមើល Google Sheet របស់លោកអ្នក រួចចុចប៊ូតុង <strong>Share</strong> នៅខាងលើស្តាំដៃ។</p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 font-bold flex items-center justify-center shrink-0 text-xs">2</span>
                <p>នៅត្រង់ផ្នែក <strong>General access</strong> ផ្លាស់ប្តូរពី <em>Restricted</em> ទៅជា <strong>Anyone with the link (Viewer)</strong>។</p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 font-bold flex items-center justify-center shrink-0 text-xs">3</span>
                <p>ចុច <strong>Copy link</strong> រួចយកមកបិទភ្ជាប់ (Paste) ក្នុងប្រអប់ "ភ្ជាប់ Link ថ្មី" លើទំព័រ SOKIMEX POSTPAID នេះ។</p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 font-bold flex items-center justify-center shrink-0 text-xs">4</span>
                <p>ប្រសិនបើសន្លឹកមានច្រើន Tab សូមវាយបញ្ចូលឈ្មោះ Tab នោះនៅក្នុងប្រអប់ Tab Name (ឬទុកទំនេរដើម្បីយក Tab ទី១)។</p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-right">
              <button
                type="button"
                onClick={() => setShowHelpGuide(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-orange-600 hover:bg-orange-700 text-white transition-all shadow-md shadow-orange-600/25"
              >
                យល់ព្រម
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ================= ROW DETAIL MODAL ================= */}
      {selectedDetailRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#0c162c] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-xl w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-600 flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  ព័ត៌មានលម្អិតជួរទិន្នន័យ
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailRow(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {columns.map(col => {
                const val = selectedDetailRow[col.id];
                const str = val !== undefined && val !== null ? String(val) : '-';
                return (
                  <div key={col.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#080f1e] border border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{col.label}:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white break-all text-right">{str}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyCell(str, `detail_${col.id}`)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                        title="ចម្លង"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleCopyRow(selectedDetailRow)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>ចម្លងទាំងអស់</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedDetailRow(null)}
                className="px-4 py-1.5 text-xs font-bold rounded-xl bg-orange-600 hover:bg-orange-700 text-white transition-all shadow-md shadow-orange-600/25"
              >
                បិទ
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
