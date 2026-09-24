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
  LayoutGrid
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

interface DataBMPageProps {
  currentUser: AuthUser | null;
  settings: AppSettings;
  onUpdateSettings?: (newSettings: Partial<AppSettings>) => void;
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

const STORAGE_KEY_BM_URL = 'accounting_data_bm_sheet_url';
const STORAGE_KEY_BM_SHEET_NAME = 'accounting_data_bm_sheet_name';
const STORAGE_KEY_BM_CACHED_DATA = 'accounting_data_bm_cached_rows';
const STORAGE_KEY_BM_CACHED_COLS = 'accounting_data_bm_cached_cols';
const STORAGE_KEY_BM_LAST_SYNC = 'accounting_data_bm_last_sync';
const STORAGE_KEY_BM_AUTO_SYNC = 'accounting_data_bm_auto_sync_enabled';
const STORAGE_KEY_BM_SYNC_INTERVAL = 'accounting_data_bm_sync_interval';

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
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => typeof window !== 'undefined' && window.innerWidth < 640 ? 'cards' : 'table');
  const [selectedDetailRow, setSelectedDetailRow] = useState<SheetRowData | null>(null);

  // 4. Column Filters State (Delivery Date Start & End, HANDLE BY, DEST)
  const [deliveryStartDate, setDeliveryStartDate] = useState<string>('');
  const [deliveryEndDate, setDeliveryEndDate] = useState<string>('');
  const [selectedHandleBy, setSelectedHandleBy] = useState<string>('');
  const [selectedDest, setSelectedDest] = useState<string>('');

  // 5. Real-Time Auto Sync & Change Watcher State
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_BM_AUTO_SYNC);
    return saved !== null ? saved === 'true' : true; // Default ON
  });
  const [syncInterval, setSyncInterval] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_BM_SYNC_INTERVAL);
    return saved ? Number(saved) : 10; // Default 10 seconds
  });
  const [countdown, setCountdown] = useState<number>(syncInterval);
  const [isSyncingInBackground, setIsSyncingInBackground] = useState<boolean>(false);
  const [isAutoSyncMenuOpen, setIsAutoSyncMenuOpen] = useState<boolean>(false);

  const isFetchingRef = useRef<boolean>(false);
  const rowsRef = useRef<SheetRowData[]>(rows);
  const lastFingerprintRef = useRef<string>(JSON.stringify(rows));
  const autoSyncMenuRef = useRef<HTMLDivElement>(null);

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

  // Real-time Firestore synchronization across Vercel & devices
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
        const prevCount = rowsRef.current.length;
        const newCount = result.rows.length;
        const diff = newCount - prevCount;
        let changeText = '';
        if (diff > 0) {
          changeText = `+${diff} ជួរថ្មីត្រូវបានបន្ថែមក្នុង Google Sheet`;
        } else if (diff < 0) {
          changeText = `${Math.abs(diff)} ជួរត្រូវបានលុបចេញ`;
        } else {
          changeText = 'ទិន្នន័យក្នុង Google Sheet ត្រូវបានកែប្រែថ្មី';
        }

        setColumns(result.columns);
        setRows(result.rows);
        rowsRef.current = result.rows;
        lastFingerprintRef.current = newFingerprint;
        setFetchMethodUsed(result.fetchedVia);
        setLastSynced(nowStr);

        // Update rows and columns quietly without any alert popups
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
      localStorage.setItem(STORAGE_KEY_BM_CACHED_DATA, JSON.stringify(result.rows));
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

  // Watch action on window focus / tab visibility change
  // When user edits Google Sheet in another tab and returns to this app, update instantly!
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
      fetch(`${settings.webAppUrl.trim()}?action=get_settings&t=${Date.now()}`)
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

    // 1. Sync to Firebase Firestore (real-time cloud database across all devices)
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
    if (!destCol) return [];
    const set = new Set<string>();
    rows.forEach(r => {
      const val = r[destCol.id];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        set.add(String(val).trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, destCol]);

  const hasActiveFilters = Boolean(
    deliveryStartDate || 
    deliveryEndDate || 
    selectedHandleBy || 
    selectedDest || 
    searchTerm.trim()
  );

  const handleClearAllFilters = () => {
    setDeliveryStartDate('');
    setDeliveryEndDate('');
    setSelectedHandleBy('');
    setSelectedDest('');
    setSearchTerm('');
    setCurrentPage(1);
  };

  // Filtered and Sorted Rows (Auto updates summaries and table dynamically)
  const filteredAndSortedRows = useMemo(() => {
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
    if (destCol && selectedDest) {
      result = result.filter(row => String(row[destCol.id] || '').trim().toLowerCase() === selectedDest.trim().toLowerCase());
    }

    // 5. Sort
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
    rows, 
    searchTerm, 
    deliveryStartDate, 
    deliveryEndDate, 
    selectedHandleBy, 
    selectedDest, 
    deliveryDateCol, 
    handleByCol, 
    destCol, 
    sortColumn, 
    sortDirection,
    toIsoDateString
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
    navigator.clipboard.writeText(String(text));
    setCopiedCellId(id);
    setTimeout(() => setCopiedCellId(null), 1500);
  };

  // Copy Entire Row
  const handleCopyRow = (row: SheetRowData, rowId: string) => {
    const line = columns.map(c => row[c.id] || '').join('\t');
    navigator.clipboard.writeText(line);
    setCopiedRowId(rowId);
    setTimeout(() => setCopiedRowId(null), 1500);
  };

  // Export to CSV
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
    link.setAttribute('download', `Data_BM_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
    <div className={`space-y-2.5 sm:space-y-3.5 pb-28 lg:pb-12 ${isFullScreen ? 'fixed inset-0 z-50 bg-white dark:bg-slate-950 p-3 sm:p-4 overflow-y-auto' : ''}`}>
      
      {/* 1. Sleek Modern Header Card */}
      <div className="bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden transition-all">
        <div className="absolute top-0 right-0 w-64 h-32 bg-gradient-to-bl from-blue-500/10 via-indigo-500/5 to-transparent rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col gap-2.5 relative z-10">
          {/* Main Top Row */}
          <div className="flex items-center justify-between gap-2.5">
            {/* Left: Branding & Status */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20 shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-white" />
              </div>
              
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                    Data BM
                  </h1>

                  {/* Status Badges */}
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] sm:text-[10.5px] font-semibold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{fetchMethodUsed ? `Live (${fetchMethodUsed})` : 'Live'}</span>
                  </span>

                  <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                    <Globe className="w-2.5 h-2.5" />
                    <span>Vercel Ready</span>
                  </span>
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-md hidden sm:block">
                  ទិន្នន័យពី Google Sheets នៃ Link ថ្មីដាច់ដោយឡែក ដំណើរការលើគ្រប់ Device
                </div>
              </div>
            </div>

            {/* Right: Primary Mobile Actions (Refresh & Auto-Sync) */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Real-Time Auto-Sync & Change Watcher Control */}
              <div className="relative" ref={autoSyncMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsAutoSyncMenuOpen(!isAutoSyncMenuOpen)}
                  className={`px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1 sm:gap-1.5 cursor-pointer ${
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

              {/* Refresh Button */}
              <button
                type="button"
                onClick={() => fetchGoogleSheetData()}
                disabled={isLoading || !sheetUrl.trim()}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20 flex items-center gap-1 sm:gap-1.5 transition disabled:opacity-50 cursor-pointer active:scale-95"
                title="ទាញយកទិន្នន័យឡើងវិញពី Google Sheets"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'ទាញយក...' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Secondary Sub-Toolbar: Secondary Tools & Mobile View Mode Toggle */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1.5 flex-wrap">
            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
              {/* Admin Config Button */}
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(!isConfigOpen)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
                    isConfigOpen 
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700 shadow-2xs' 
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title="កំណត់ Link Google Sheets (Admin Only)"
                >
                  <Settings className={`w-3 h-3 ${isConfigOpen ? 'text-blue-600 rotate-45 transition-transform' : 'text-slate-500'}`} />
                  <span className="text-[11px]">{isConfigOpen ? 'លាក់' : 'Link'}</span>
                  <span className="text-[8.5px] px-1 py-0.2 rounded font-mono font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                    Admin
                  </span>
                </button>
              ) : (
                <div 
                  className="px-2 py-1 rounded-lg text-[10.5px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 flex items-center gap-1"
                  title="កំណត់ដោយ Admin ប៉ុណ្ណោះ"
                >
                  <Lock className="w-3 h-3 text-slate-400" />
                  <span>Admin</span>
                </div>
              )}

              {/* External Google Sheet Link */}
              {googleSheetWebUrl && (
                <a
                  href={googleSheetWebUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 sm:px-2 py-1 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1 transition"
                  title="បើកមើល Google Sheet ផ្ទាល់លើ Browser"
                >
                  <ExternalLink className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[11px] hidden sm:inline">Sheet</span>
                </a>
              )}

              {/* Export CSV */}
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={rows.length === 0}
                className="p-1 sm:px-2 py-1 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1 transition disabled:opacity-40 cursor-pointer"
                title="ទាញយកជា CSV / Excel"
              >
                <Download className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                <span className="text-[11px] hidden sm:inline">CSV</span>
              </button>

              {/* Fullscreen Button */}
              {isFullScreen ? (
                <button
                  type="button"
                  onClick={() => setIsFullScreen(false)}
                  className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  title="ចេញពី Full Screen"
                >
                  <Minimize2 className="w-3 h-3" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsFullScreen(true)}
                  className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hidden md:block cursor-pointer"
                  title="ពេញអេក្រង់ (Full Screen)"
                >
                  <Maximize2 className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* View Mode Toggle (Table View vs Card View) */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-850 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
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
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
                title="បង្ហាញជាកាត (Card View - ស្រស់ស្អាតលើទូរស័ព្ទ)"
              >
                <LayoutGrid className="w-3 h-3" />
                <span>កាត</span>
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

      {/* 3. Compact Search & Column Filters Toolbar (Delivery Date, HANDLE BY, DEST) */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl p-2.5 sm:p-3 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-2.5">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
          {/* Left: Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ស្វែងរកក្នុងតារាង (Search anything)..."
              className="w-full pl-8 pr-8 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
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
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Right: Specific Column Filters (Delivery Date, HANDLE BY, DEST) */}
          <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto">
            {/* Filter 1: Delivery Date (Start Date & End Date) */}
            {deliveryDateCol && (
              <div className="w-full sm:w-auto bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl p-2 sm:px-2.5 sm:py-1 shadow-2xs">
                <div className="flex items-center justify-between sm:justify-start gap-1.5 mb-1.5 sm:mb-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    <Calendar className={`w-3.5 h-3.5 shrink-0 ${deliveryStartDate || deliveryEndDate ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                    <span>Delivery Date:</span>
                  </div>
                  {(deliveryStartDate || deliveryEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeliveryStartDate('');
                        setDeliveryEndDate('');
                        setCurrentPage(1);
                      }}
                      className="text-[10.5px] text-rose-500 hover:text-rose-600 font-semibold flex items-center gap-0.5 sm:hidden"
                    >
                      <X className="w-3 h-3" />
                      <span>សម្អាត</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Start Date */}
                  <input
                    type="date"
                    value={deliveryStartDate}
                    onChange={(e) => {
                      setDeliveryStartDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className={`flex-1 sm:w-32 px-2 py-1 rounded-lg text-xs transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans ${
                      deliveryStartDate
                        ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold border border-blue-300 dark:border-blue-700'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700'
                    }`}
                    title="Start Date (ចាប់ពីថ្ងៃ)"
                  />

                  <span className="text-slate-400 text-xs font-bold px-0.5">→</span>

                  {/* End Date */}
                  <input
                    type="date"
                    value={deliveryEndDate}
                    onChange={(e) => {
                      setDeliveryEndDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className={`flex-1 sm:w-32 px-2 py-1 rounded-lg text-xs transition cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans ${
                      deliveryEndDate
                        ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold border border-blue-300 dark:border-blue-700'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700'
                    }`}
                    title="End Date (ដល់ថ្ងៃ)"
                  />

                  {(deliveryStartDate || deliveryEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeliveryStartDate('');
                        setDeliveryEndDate('');
                        setCurrentPage(1);
                      }}
                      className="hidden sm:flex p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-rose-500 transition cursor-pointer"
                      title="លុប Date Range"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Filters 2 & 3: HANDLE BY and DEST in responsive grid */}
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
              {/* Filter 2: HANDLE BY */}
              {handleByCol && (
                <div className="relative flex items-center min-w-0 sm:min-w-[145px]">
                  <UserCheck className={`w-3.5 h-3.5 absolute left-2.5 pointer-events-none z-10 ${selectedHandleBy ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400'}`} />
                  <select
                    value={selectedHandleBy}
                    onChange={(e) => {
                      setSelectedHandleBy(e.target.value);
                      setCurrentPage(1);
                    }}
                    className={`w-full pl-8 pr-6 py-1.5 rounded-xl text-xs appearance-none transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 truncate ${
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
                  <span className="absolute right-2 text-slate-400 pointer-events-none text-[9px]">▼</span>
                </div>
              )}

              {/* Filter 3: DEST */}
              {destCol && (
                <div className="relative flex items-center min-w-0 sm:min-w-[130px]">
                  <MapPin className={`w-3.5 h-3.5 absolute left-2.5 pointer-events-none z-10 ${selectedDest ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
                  <select
                    value={selectedDest}
                    onChange={(e) => {
                      setSelectedDest(e.target.value);
                      setCurrentPage(1);
                    }}
                    className={`w-full pl-8 pr-6 py-1.5 rounded-xl text-xs appearance-none transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 truncate ${
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
                  <span className="absolute right-2 text-slate-400 pointer-events-none text-[9px]">▼</span>
                </div>
              )}
            </div>

            {/* Reset / Clear Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="w-full sm:w-auto px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/80 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                title="សម្អាត Filter និងពាក្យស្វែងរកទាំងអស់"
              >
                <RotateCcw className="w-3 h-3" />
                <span>សម្អាត Filter</span>
              </button>
            )}
          </div>
        </div>

        {/* Lower Row: Page Size & Results Counter */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/80 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-medium">បង្ហាញ:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value={25}>25 ជួរ</option>
              <option value={50}>50 ជួរ</option>
              <option value={100}>100 ជួរ</option>
              <option value={200}>200 ជួរ</option>
              <option value={999999}>ទាំងអស់</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
            {hasActiveFilters && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-[10.5px] font-bold border border-blue-200/60 dark:border-blue-800/60">
                <Filter className="w-3 h-3" /> Filter សកម្ម
              </span>
            )}
            <span>
              {filteredAndSortedRows.length === 0 ? '0' : ((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredAndSortedRows.length)} នៃ {filteredAndSortedRows.length.toLocaleString('en-US')} ជួរ
            </span>
          </div>
        </div>
      </div>

      {/* 4. KPI Metrics Banner (Fits 100% of any Mobile Phone screen!) */}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {/* Metric 1: Total Rows */}
          <div className="bg-white/95 dark:bg-[#0f172a]/95 rounded-xl p-2.5 sm:p-3 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 dark:text-slate-400 flex items-center gap-1 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
              <span className="truncate">ទិន្នន័យសរុប</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-sm sm:text-lg font-black font-mono text-slate-900 dark:text-white truncate">
                {filteredAndSortedRows.length.toLocaleString('en-US')}
              </span>
              <span className="text-[9.5px] sm:text-[11px] text-slate-400 shrink-0">ជួរ</span>
            </div>
          </div>

          {/* Metric 2: Total USD */}
          <div className="bg-gradient-to-br from-blue-50/90 to-indigo-50/60 dark:from-blue-950/40 dark:to-indigo-950/30 rounded-xl p-2.5 sm:p-3 border border-blue-200/60 dark:border-blue-800/60 shadow-2xs flex flex-col justify-between">
            <div className="text-[10px] sm:text-[11px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 truncate">
              <DollarSign className="w-3 h-3 text-blue-500 shrink-0" />
              <span className="truncate">សរុប USD</span>
            </div>
            <div className="mt-1 text-xs sm:text-base font-black font-mono text-blue-700 dark:text-blue-300 truncate">
              ${numericStats.usdStat ? numericStats.usdStat.stat.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
            </div>
          </div>

          {/* Metric 3: Total KHM */}
          <div className="bg-gradient-to-br from-emerald-50/90 to-teal-50/60 dark:from-emerald-950/40 dark:to-teal-950/30 rounded-xl p-2.5 sm:p-3 border border-emerald-200/60 dark:border-emerald-800/60 shadow-2xs flex flex-col justify-between">
            <div className="text-[10px] sm:text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 truncate">
              <Coins className="w-3 h-3 text-emerald-500 shrink-0" />
              <span className="truncate">សរុប KHM</span>
            </div>
            <div className="mt-1 text-xs sm:text-base font-black font-mono text-emerald-700 dark:text-emerald-300 truncate">
              {numericStats.khmStat ? Math.round(numericStats.khmStat.stat.total).toLocaleString('en-US') : '0'} ៛
            </div>
          </div>
        </div>
      )}

      {/* 4. Dynamic Data Table */}
      <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
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
          <div className="p-3 sm:p-4 space-y-2.5 max-h-[700px] overflow-y-auto">
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

                  return (
                    <div
                      key={row._id}
                      className="bg-slate-50/80 dark:bg-slate-900/90 rounded-2xl p-3 sm:p-3.5 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700/80 transition space-y-2.5"
                    >
                      {/* Top Row: #Index, AWBN (with 1-tap copy), Delivery Date */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-slate-700">
                            {pageStartIndex + idx + 1}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleCopyCell(awbnVal, `card_awbn_${row._id}`)}
                            className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-lg border border-blue-200/60 dark:border-blue-800/60 flex items-center gap-1 active:scale-95 transition cursor-pointer truncate"
                            title="ចុចដើម្បីចម្លង AWBN"
                          >
                            <span className="truncate">{awbnVal || 'គ្មាន AWB'}</span>
                            <Copy className="w-3 h-3 text-blue-400 shrink-0" />
                          </button>
                        </div>

                        {deliveryVal && (
                          <span className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-850 px-2 py-0.5 rounded-lg flex items-center gap-1 shrink-0 border border-slate-200/60 dark:border-slate-800">
                            <Calendar className="w-3 h-3 text-blue-500" />
                            <span>{deliveryVal}</span>
                          </span>
                        )}
                      </div>

                      {/* Middle Grid: Handle By & Dest */}
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

                      {/* Customer / Receiver if present */}
                      {receiverVal && (
                        <div className="text-xs text-slate-600 dark:text-slate-400 truncate bg-white dark:bg-slate-850/50 px-2.5 py-1 rounded-lg border border-slate-100 dark:border-slate-800/60">
                          <span className="text-[10px] text-slate-400 font-medium mr-1.5">អ្នកទទួល:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{receiverVal}</span>
                        </div>
                      )}

                      {/* Bottom Row: Currency Amounts & Detail Trigger */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800/80 gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          {usdVal && (
                            <span className="font-mono font-bold text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-lg border border-blue-200/60 dark:border-blue-800/60">
                              ${String(usdVal).replace('$', '')}
                            </span>
                          )}
                          {khmVal && (
                            <span className="font-mono font-bold text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-200/60 dark:border-emerald-800/60">
                              {String(khmVal).replace('៛', '')} ៛
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedDetailRow({ ...row, __rowNumber: pageStartIndex + idx + 1 })}
                          className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition cursor-pointer shrink-0"
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
          /* ========================================================================= */
          /* TABLE VIEW: Responsive Table with Sticky Columns & Swipe Hint            */
          /* ========================================================================= */
          <>
            <div className="sm:hidden flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-850 text-[10.5px] text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
              <span>← អូសតារាងទៅឆ្វេង-ស្តាំ ដើម្បីមើលបន្ថែម →</span>
              <span className="font-mono font-bold">{paginatedRows.length} ជួរ</span>
            </div>

            <div className="overflow-x-auto max-h-[650px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 select-none">
                <tr>
                  {/* Row index # */}
                  <th className="py-3 px-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-12 text-center">
                    #
                  </th>

                  {/* Actions column (Copy row) */}
                  <th className="py-3 px-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-10 text-center">
                    
                  </th>

                  {/* Dynamic Columns */}
                  {columns.map((col) => {
                    const isSorted = sortColumn === col.id;
                    return (
                      <th
                        key={col.id}
                        onClick={() => handleSortToggle(col.id)}
                        className="py-3 px-3.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{col.label}</span>
                          <ArrowUpDown className={`w-3 h-3 ${isSorted ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 opacity-60'}`} />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 2} className="py-8 text-center text-slate-400">
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
                        className="hover:bg-blue-50/40 dark:hover:bg-slate-850/50 transition-colors group"
                      >
                        {/* Index */}
                        <td className="py-2.5 px-3.5 text-center text-slate-400 font-mono text-[11px]">
                          {globalIdx}
                        </td>

                        {/* Copy row action */}
                        <td className="py-2.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleCopyRow(row, row._id)}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition opacity-0 group-hover:opacity-100 cursor-pointer"
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
                          const isNumber = col.type === 'number';

                          return (
                            <td 
                              key={col.id}
                              onClick={() => handleCopyCell(val, cellId)}
                              className={`py-2.5 px-3.5 text-slate-800 dark:text-slate-200 whitespace-nowrap cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-950/40 transition relative group/cell ${
                                isNumber ? 'font-mono text-right' : ''
                              }`}
                              title="ចុចដើម្បីចម្លង (Click to Copy)"
                            >
                              <span>{val !== undefined && val !== null ? String(val) : ''}</span>
                              {isCopied && (
                                <span className="absolute right-1 top-1 bg-emerald-600 text-white text-[9px] px-1 py-0.5 rounded shadow">
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
        <div className="sticky bottom-20 lg:bottom-3 z-30 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)] p-2 sm:p-3 transition-all">
          
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

      {/* 6. Detail Modal / Drawer (when tapping "លម្អិត" on mobile card) */}
      {selectedDetailRow && (() => {
        const rowNum = selectedDetailRow.__rowNumber || 1;
        const awbnVal = awbnCol ? selectedDetailRow[awbnCol.id] : selectedDetailRow['col_1'];
        const deliveryVal = deliveryDateCol ? selectedDetailRow[deliveryDateCol.id] : null;
        const usdVal = usdCol ? selectedDetailRow[usdCol.id] : null;
        const khmVal = khmCol ? selectedDetailRow[khmCol.id] : null;
        
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="w-full max-w-sm sm:max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
              
              {/* 1. Modal Header */}
              <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-850/90">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white font-mono text-[11px] font-bold shadow-2xs">
                    #{rowNum}
                  </span>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    ពត៌មានលម្អិត
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDetailRow(null)}
                  className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 2. Modal Body: Clean Standard List */}
              <div className="p-3 overflow-y-auto">
                <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
                  {columns.map(col => {
                    const val = selectedDetailRow[col.id];
                    if (val === undefined || val === null || val === '') return null;
                    const valStr = String(val).trim();
                    const isCopied = copiedCellId === `${rowNum}_${col.id}`;
                    const labelLower = col.label.toLowerCase();
                    const isUsd = labelLower.includes('usd') || labelLower.includes('$');
                    const isKhm = labelLower.includes('khm') || labelLower.includes('khr') || labelLower.includes('riel') || labelLower.includes('៛');
                    const isAwbn = labelLower.includes('awb');

                    return (
                      <div
                        key={col.id}
                        onClick={() => handleCopyCell(val, `${rowNum}_${col.id}`)}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-blue-50/40 dark:hover:bg-slate-850/60 transition cursor-pointer group"
                        title="ចុចដើម្បីចម្លង (Click to Copy)"
                      >
                        {/* Left: Column Label */}
                        <span className="text-[11.5px] font-medium text-slate-400 dark:text-slate-400 shrink-0 min-w-[90px] max-w-[120px]">
                          {col.label}
                        </span>

                        {/* Right: Value + Copy Icon */}
                        <div className="flex items-center justify-end gap-2 min-w-0 flex-1 text-right">
                          <span className={`text-xs font-bold break-words ${
                            isUsd 
                              ? 'text-blue-600 dark:text-blue-400 font-mono text-sm'
                              : isKhm 
                              ? 'text-emerald-600 dark:text-emerald-400 font-mono text-sm'
                              : isAwbn
                              ? 'text-slate-900 dark:text-white font-mono'
                              : 'text-slate-800 dark:text-slate-100'
                          }`}>
                            {valStr}
                            {isUsd && !valStr.includes('$') ? ' $' : ''}
                            {isKhm && !valStr.includes('៛') ? ' ៛' : ''}
                          </span>

                          <span className="shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-blue-600 transition">
                            {isCopied ? (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-1 py-0.5 rounded">
                                Copied!
                              </span>
                            ) : (
                              <Copy className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100" />
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Modal Footer */}
              <div className="px-4 py-2.5 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/80 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  ចុចលើជួរណាមួយដើម្បី Copy
                </span>
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
