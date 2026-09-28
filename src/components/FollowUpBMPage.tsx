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
  ClipboardCheck
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
  subscribeToFollowUpBMConfig 
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
    return (settings.followupBmSheetUrl && settings.followupBmSheetUrl.trim()) 
      || localStorage.getItem(STORAGE_KEY_FOLLOWUP_URL) 
      || (import.meta as any).env?.VITE_FOLLOWUP_BM_SHEET_URL 
      || '';
  }, [settings.followupBmSheetUrl]);

  const initialSheetName = useMemo(() => {
    return (settings.followupBmSheetName && settings.followupBmSheetName.trim()) 
      || localStorage.getItem(STORAGE_KEY_FOLLOWUP_SHEET_NAME) 
      || (import.meta as any).env?.VITE_FOLLOWUP_BM_SHEET_NAME 
      || '';
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

  // On mobile screens (< 640px), always enforce table view and hide cards
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 640) {
        setViewMode('table');
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Real-time Firestore synchronization
  useEffect(() => {
    const unsubscribe = subscribeToFollowUpBMConfig((remoteConfig) => {
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

    if (onUpdateSettings) {
      onUpdateSettings({
        followupBmSheetUrl: trimmedUrl,
        followupBmSheetName: trimmedName
      });
    }

    await saveFollowUpBMConfig({
      sheetUrl: trimmedUrl,
      sheetName: trimmedName,
      updatedBy: currentUser?.email || 'admin'
    });

    notify('បានរក្សាទុក Link Google Sheets សម្រាប់ FollowUp BM ជោគជ័យ!', 'success');
  };

  // Identify special filter columns dynamically
  const deliveryDateCol = useMemo(() => {
    return columns.find(c => {
      const l = c.label.toLowerCase().trim();
      return (l.includes('delivery') && l.includes('date')) || l.includes('delivery') || l.includes('date');
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

  // Standardize dates to YYYY-MM-DD
  const toIsoDateString = useCallback((raw: any): string | null => {
    if (!raw) return null;
    const str = String(raw).trim();
    if (!str) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    const dmy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (dmy) {
      let year = Number(dmy[3]);
      if (year < 100) year += 2000;
      const month = String(dmy[2]).padStart(2, '0');
      const day = String(dmy[1]).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return null;
  }, []);

  const hasActiveFilters = Boolean(
    searchTerm.trim() || 
    deliveryStartDate || 
    deliveryEndDate || 
    selectedHandleBy || 
    selectedDest
  );

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setDeliveryStartDate('');
    setDeliveryEndDate('');
    setSelectedHandleBy('');
    setSelectedDest('');
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
    <div className={`space-y-2.5 sm:space-y-3.5 pb-28 lg:pb-12 transition-all ${
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
      
      {/* 1. Sleek Modern Header Card */}
      <div className="bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden transition-all">
        <div className="absolute top-0 right-0 w-64 h-32 bg-gradient-to-bl from-purple-500/10 via-violet-500/5 to-transparent rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col gap-2.5 relative z-10">
          {/* Main Top Row */}
          <div className="flex items-center justify-between gap-2.5">
            {/* Left: Branding & Status */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-violet-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-purple-500/20 shrink-0">
                <ClipboardCheck className="w-5 h-5 text-white" />
              </div>
              
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                    FollowUp BM
                  </h1>

                  {/* Status Badges */}
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] sm:text-[10.5px] font-semibold bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                    <span>{fetchMethodUsed ? `Live (${fetchMethodUsed})` : 'Live'}</span>
                  </span>

                  <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                    <Globe className="w-2.5 h-2.5" />
                    <span>Vercel Ready</span>
                  </span>
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-md hidden sm:block">
                  ទិន្នន័យពី Google Sheets សម្រាប់ FollowUp BM ដំណើរការលើគ្រប់ Device
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
                className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs shadow-purple-500/20 flex items-center gap-1 sm:gap-1.5 transition disabled:opacity-50 cursor-pointer active:scale-95"
                title="ទាញយកទិន្នន័យឡើងវិញពី Google Sheets"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'ទាញយក...' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Secondary Sub-Toolbar: Secondary Tools & Controls */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1.5 flex-wrap">
            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
              {/* Admin Config Button */}
              {isAdmin ? (
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
                <Download className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                <span className="text-[11px] hidden sm:inline">CSV</span>
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
                title={scrollMode === 'AUTO_FIT' ? 'កម្ពស់ Auto-Fit ពេញទំព័រ (ចុចដើម្បីប្តូរមក Scroll ក្នុងប្រអប់ជាប់ក្បាល)' : 'Scroll ក្នុងប្រអប់ជាប់ក្បាល (ចុចដើម្បី Auto-Fit កម្ពស់ពេញទំព័រ)'}
              >
                {scrollMode === 'AUTO_FIT' ? (
                  <>
                    <Maximize2 className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                    <span className="text-[11px] font-bold hidden sm:inline">Auto Fit</span>
                  </>
                ) : (
                  <>
                    <Minimize2 className="w-3 h-3 text-slate-500" />
                    <span className="text-[11px] hidden sm:inline">ជាប់ក្បាល</span>
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
                    <span className="text-[11px] font-bold hidden sm:inline">បង្រួម</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3 h-3 text-slate-500" />
                    <span className="text-[11px] hidden sm:inline">ពេញទំព័រ</span>
                  </>
                )}
              </button>
            </div>

            {/* View Mode Toggle (Table View vs Card View) - Hidden on Mobile (< sm) */}
            <div className="hidden sm:flex items-center bg-slate-100 dark:bg-slate-850 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-800">
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
      <div className="bg-white/95 dark:bg-[#0f172a]/95 rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-2">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ស្វែងរកគ្រប់យ៉ាង (Search anything)..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Dynamic Column Filters (Delivery Date, HANDLE BY, DEST) */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
            {/* Filter 1: Delivery Date Range */}
            {deliveryDateCol && (
              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-750 text-xs">
                <Calendar className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                <span className="text-[10px] text-slate-400 font-semibold hidden md:inline">Date:</span>
                <input
                  type="date"
                  value={deliveryStartDate}
                  onChange={(e) => {
                    setDeliveryStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer p-0 w-24 sm:w-28 text-[11px]"
                  title="ចាប់ពីថ្ងៃ"
                />
                <span className="text-slate-400 text-xs">→</span>
                <input
                  type="date"
                  value={deliveryEndDate}
                  onChange={(e) => {
                    setDeliveryEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer p-0 w-24 sm:w-28 text-[11px]"
                  title="ដល់ថ្ងៃ"
                />
              </div>
            )}

            {/* Filter 2: HANDLE BY */}
            {handleByCol && (
              <div className="relative flex items-center min-w-0 sm:min-w-[130px]">
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
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 text-[10.5px] font-bold border border-purple-200/60 dark:border-purple-800/60">
                <Filter className="w-3 h-3" /> Filter សកម្ម
              </span>
            )}
            <span>
              {filteredAndSortedRows.length === 0 ? '0' : ((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, filteredAndSortedRows.length)} នៃ {filteredAndSortedRows.length.toLocaleString('en-US')} ជួរ
            </span>
          </div>
        </div>
      </div>

      {/* 4. KPI Metrics Banner */}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {/* Metric 1: Total Rows */}
          <div className="bg-white/95 dark:bg-[#0f172a]/95 rounded-xl p-2.5 sm:p-3 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 dark:text-slate-400 flex items-center gap-1 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0"></span>
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
          <div className="bg-gradient-to-br from-purple-50/90 to-indigo-50/60 dark:from-purple-950/40 dark:to-indigo-950/30 rounded-xl p-2.5 sm:p-3 border border-purple-200/60 dark:border-purple-800/60 shadow-2xs flex flex-col justify-between">
            <div className="text-[10px] sm:text-[11px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1 truncate">
              <DollarSign className="w-3 h-3 text-purple-500 shrink-0" />
              <span className="truncate">សរុប USD</span>
            </div>
            <div className="mt-1 text-xs sm:text-base font-black font-mono text-purple-700 dark:text-purple-300 truncate">
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
                            onClick={() => handleCopyCell(awbnVal, `card_awbn_${row._id}`)}
                            className="font-mono font-bold text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-lg border border-purple-200/60 dark:border-purple-800/60 flex items-center gap-1 active:scale-95 transition cursor-pointer truncate"
                            title="ចុចដើម្បីចម្លង AWBN"
                          >
                            <span className="truncate">{awbnVal || 'គ្មាន AWB'}</span>
                            <Copy className="w-3 h-3 text-purple-400 shrink-0" />
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
            <div className="sm:hidden flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-850 text-[10.5px] text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
              <span>← អូសតារាងទៅឆ្វេង-ស្តាំ ដើម្បីមើលបន្ថែម →</span>
              <span className="font-mono font-bold">{paginatedRows.length} ជួរ</span>
            </div>

            <div className={`overflow-x-auto ${
              scrollMode === 'CONTAINER' 
                ? 'overflow-y-auto max-h-[calc(100vh-320px)] min-h-[350px] custom-scrollbar' 
                : 'h-auto overflow-y-visible'
            } relative`}>
              <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 select-none">
                <tr>
                  <th className="py-3 px-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-12 text-center">
                    #
                  </th>

                  <th className="py-3 px-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-10 text-center">
                    
                  </th>

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
                        className="hover:bg-purple-50/40 dark:hover:bg-slate-850/50 transition-colors group"
                      >
                        <td className="py-2.5 px-3.5 text-center text-slate-400 font-mono text-[11px]">
                          {globalIdx}
                        </td>

                        <td className="py-2.5 px-2 text-center">
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

                        {columns.map((col) => {
                          const val = row[col.id];
                          const cellId = `${row._id}_${col.id}`;
                          const isCopied = copiedCellId === cellId;
                          const isNumber = col.type === 'number';

                          return (
                            <td 
                              key={col.id}
                              onClick={() => handleCopyCell(val, cellId)}
                              className={`py-2.5 px-3.5 text-slate-800 dark:text-slate-200 whitespace-nowrap cursor-pointer hover:bg-purple-100/50 dark:hover:bg-purple-950/40 transition relative group/cell ${
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

      {/* 6. Fixed Menu Bottom (Floating Sticky Bottom Bar with Summary & Pagination) */}
      {rows.length > 0 && (
        <div className={`sticky ${isFullScreen ? 'bottom-2 sm:bottom-3' : 'bottom-20 lg:bottom-3'} z-30 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)] p-2 sm:p-3 transition-all`}>
          
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

              {numericStats.usdStat && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-50/80 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 text-xs font-bold border border-purple-200/60 dark:border-purple-800/60">
                  <DollarSign className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span className="text-[11px] text-purple-600/80 dark:text-purple-400/80 font-medium">USD:</span>
                  <span className="font-mono font-black">
                    ${numericStats.usdStat.stat.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {numericStats.khmStat && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200/60 dark:border-emerald-800/60">
                  <Coins className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 font-medium">KHM:</span>
                  <span className="font-mono font-black">
                    {Math.round(numericStats.khmStat.stat.total).toLocaleString('en-US')} ៛
                  </span>
                </div>
              )}
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

      {/* Row Detail Modal */}
      {selectedDetailRow && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm sm:max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/80">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 font-bold font-mono text-xs flex items-center justify-center">
                  #{selectedDetailRow.__rowNumber}
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    ព័ត៌មានលម្អិតជួរទិន្នន័យ FollowUp BM
                  </h4>
                  <div className="text-[10.5px] text-slate-400">
                    {awbnCol && selectedDetailRow[awbnCol.id] ? String(selectedDetailRow[awbnCol.id]) : 'គ្មាន AWBN'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailRow(null)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 sm:p-4 overflow-y-auto space-y-2 text-xs divide-y divide-slate-100 dark:divide-slate-800">
              {columns.map((col) => {
                const val = selectedDetailRow[col.id];
                const cellId = `modal_${selectedDetailRow._id}_${col.id}`;
                const isCopied = copiedCellId === cellId;

                return (
                  <div key={col.id} className="pt-2 first:pt-0 flex items-start justify-between gap-3">
                    <span className="text-[11px] font-semibold text-slate-400 shrink-0 max-w-[140px] truncate">
                      {col.label}:
                    </span>
                    <div 
                      onClick={() => handleCopyCell(val, cellId)}
                      className="font-medium text-slate-800 dark:text-slate-200 text-right break-all cursor-pointer hover:text-purple-600 dark:hover:text-purple-400 transition flex items-center gap-1 group/modalcell"
                      title="ចុចដើម្បីចម្លង"
                    >
                      <span>{val !== undefined && val !== null && String(val).trim() !== '' ? String(val) : '-'}</span>
                      <Copy className="w-3 h-3 text-slate-300 opacity-0 group-hover/modalcell:opacity-100 shrink-0" />
                      {isCopied && (
                        <span className="text-[9px] text-emerald-500 font-bold">Copied!</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleCopyRow(selectedDetailRow, 'modal_row')}
                className="px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60 font-semibold text-xs flex items-center gap-1.5 hover:bg-purple-100 transition cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>ចម្លងទាំងមូល</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedDetailRow(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-600 transition cursor-pointer"
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
