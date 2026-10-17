import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Minimize2, FileSpreadsheet } from 'lucide-react';
import {
  AuthUser,
  AppSettings,
  DistributionReportItem,
  UserPermission,
  WarehouseScanItem
} from '../types';
import { SheetColumnDef, SheetRowData, parseGoogleSheetInput } from '../utils/googleSheetFetcher';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
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
import {
  getInitialWarehouseScans,
  subscribeToWarehouseScans
} from '../services/warehouseScanService';
import { DistributionReportModal } from './DistributionReportModal';
import { PackageTimelineModal } from './PackageTimelineModal';
import { formatCsv, downloadCsv } from '../utils/csvHelper';


// Subcomponents
import {
  StatusFilterOption,
  TeamsFilterOption,
  LocationFilterOption,
  TableDensity,
  ViewMode,
  BarcodeWarehouseSummary,
  PackageDetails
} from './dataReport/types';
import { DataReportHeader } from './dataReport/DataReportHeader';
import { DataReportKpiBar } from './dataReport/DataReportKpiBar';
import { DataReportFilterBar } from './dataReport/DataReportFilterBar';
import { DataReportTable } from './dataReport/DataReportTable';
import { DataReportCardView } from './dataReport/DataReportCardView';
import { DataReportBottomBar } from './dataReport/DataReportBottomBar';

// Lazy-loaded Barcode Scanner Modal
const BarcodeScannerModal = React.lazy(() =>
  import('./BarcodeScannerModal').then((m) => ({ default: m.BarcodeScannerModal }))
);

interface DataReportPageProps {
  currentUser: AuthUser | null;
  permissions?: UserPermission[];
  settings?: AppSettings;
  onUpdateSettings?: (newSettings: Partial<AppSettings>) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const STORAGE_KEY_AUTO_SYNC = 'accounting_data_report_auto_sync_enabled';
const STORAGE_KEY_SYNC_INTERVAL = 'accounting_data_report_sync_interval';
const STORAGE_KEY_TABLE_DENSITY = 'accounting_data_report_density';
const STORAGE_KEY_HIDDEN_COLUMNS = 'accounting_data_report_hidden_columns';
const STORAGE_KEY_KPI_COLLAPSED = 'accounting_data_report_kpi_collapsed';
const STORAGE_KEY_HIDE_EMPTY_CARD_FIELDS = 'accounting_data_report_hide_empty_card_fields';

export const DataReportPage: React.FC<DataReportPageProps> = ({
  currentUser,
  permissions,
  settings,
  onUpdateSettings,
  onShowToast
}) => {
  // 1. Sheet Config State
  const initialConfig = useMemo(() => getInitialDataReportConfig(), []);
  const [sheetUrl, setSheetUrl] = useState<string>(() => {
    return settings?.dataReportSheetUrl && settings.dataReportSheetUrl.trim()
      ? settings.dataReportSheetUrl.trim()
      : initialConfig.sheetUrl;
  });
  const [sheetName, setSheetName] = useState<string>(() => {
    return settings?.dataReportSheetName && settings.dataReportSheetName.trim()
      ? settings.dataReportSheetName.trim()
      : initialConfig.sheetName || '';
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
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [selectedColumnFilter, setSelectedColumnFilter] = useState<string>('ALL');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [copiedCellId, setCopiedCellId] = useState<string | null>(null);
  const [copiedPackageRowId, setCopiedPackageRowId] = useState<string | null>(null);

  // Search Debouncing for high performance
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 220);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // 3.1 Density & Column Visibility State
  const [tableDensity, setTableDensity] = useState<TableDensity>(() => {
    return (localStorage.getItem(STORAGE_KEY_TABLE_DENSITY) as TableDensity) || 'compact';
  });
  const [isKpiCollapsed, setIsKpiCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY_KPI_COLLAPSED) === 'true';
  });
  const [hideEmptyCardFields] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_HIDE_EMPTY_CARD_FIELDS);
    return saved !== null ? saved === 'true' : true;
  });
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());

  const toggleCardExpansion = useCallback((cardId: string) => {
    setExpandedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const [hiddenColumnIds, setHiddenColumnIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HIDDEN_COLUMNS);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState<boolean>(false);
  const columnDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close column dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(e.target as Node)) {
        setIsColumnDropdownOpen(false);
      }
    };
    if (isColumnDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isColumnDropdownOpen]);

  // Detect empty columns across rows
  const emptyColumnIds = useMemo(() => {
    if (!rows.length || !columns.length) return new Set<string>();
    const empty = new Set<string>();
    for (const col of columns) {
      const key = (col.label || col.id || '').trim().toUpperCase();
      if (key === 'BARCODE' || key === '#' || key.includes('STATUS')) continue;
      const hasValue = rows.some((r) => {
        const v = r[col.id];
        if (v === undefined || v === null) return false;
        const s = String(v).trim();
        return s !== '' && s !== '—' && s !== '-' && s !== 'N/A' && s !== '#N/A';
      });
      if (!hasValue) {
        empty.add(col.id);
      }
    }
    return empty;
  }, [rows, columns]);

  const handleSetTableDensity = (d: TableDensity) => {
    setTableDensity(d);
    localStorage.setItem(STORAGE_KEY_TABLE_DENSITY, d);
  };

  const toggleColumnVisibility = (colId: string) => {
    setHiddenColumnIds((prev) => {
      const next = prev.includes(colId) ? prev.filter((id) => id !== colId) : [...prev, colId];
      localStorage.setItem(STORAGE_KEY_HIDDEN_COLUMNS, JSON.stringify(next));
      return next;
    });
  };

  const handleHideEmptyColumns = () => {
    const next = Array.from(new Set([...hiddenColumnIds, ...Array.from(emptyColumnIds)]));
    setHiddenColumnIds(next);
    localStorage.setItem(STORAGE_KEY_HIDDEN_COLUMNS, JSON.stringify(next));
  };

  const handleShowAllColumns = () => {
    setHiddenColumnIds([]);
    localStorage.removeItem(STORAGE_KEY_HIDDEN_COLUMNS);
  };

  const visibleColumns = useMemo(() => {
    return columns.filter((col) => !hiddenColumnIds.includes(col.id));
  }, [columns, hiddenColumnIds]);

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

  // 5. Distribution Reports State
  const [isDistModalOpen, setIsDistModalOpen] = useState<boolean>(false);
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState<boolean>(false);
  const [distReports, setDistReports] = useState<DistributionReportItem[]>(() =>
    getInitialDistributionReports()
  );
  const [distPrefilledBarcode, setDistPrefilledBarcode] = useState<string>('');

  useEffect(() => {
    const unsubscribe = subscribeToDistributionReports((items) => {
      setDistReports(items);
    });
    return () => unsubscribe();
  }, []);

  const distReportsByBarcode = useMemo(() => {
    const map = new Map<string, DistributionReportItem>();
    for (const r of distReports) {
      if (r.barcode) {
        map.set(r.barcode.toUpperCase().trim(), r);
      }
    }
    return map;
  }, [distReports]);

  // 6. Warehouse Scans State & Tracking Timeline
  const [warehouseScans, setWarehouseScans] = useState<WarehouseScanItem[]>(() =>
    getInitialWarehouseScans()
  );
  const [selectedTimelineBarcode, setSelectedTimelineBarcode] = useState<string | null>(null);
  const [selectedTimelineRow, setSelectedTimelineRow] = useState<SheetRowData | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToWarehouseScans((items) => {
      setWarehouseScans(items);
    });
    return () => unsubscribe();
  }, []);

  const warehouseScansByBarcode = useMemo(() => {
    const map = new Map<string, WarehouseScanItem[]>();
    for (const scan of warehouseScans) {
      if (scan.barcode) {
        const clean = scan.barcode.toUpperCase().trim();
        const existing = map.get(clean) || [];
        existing.push(scan);
        map.set(clean, existing);
      }
    }
    for (const [, list] of map.entries()) {
      list.sort((a, b) => {
        const dateDiff = (a.date || '').localeCompare(b.date || '');
        if (dateDiff !== 0) return dateDiff;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
    }
    return map;
  }, [warehouseScans]);

  const getBarcodeWarehouseSummary = useCallback(
    (barcode: string): BarcodeWarehouseSummary | null => {
      const clean = (barcode || '').toUpperCase().trim();
      const scans = warehouseScansByBarcode.get(clean) || [];
      const dist = distReportsByBarcode.get(clean);

      const scanIn = scans.filter((s) => s.scanType === 'SCAN_IN').slice(-1)[0];
      const outOfDelivery = scans.filter((s) => s.scanType === 'OUT_OF_DELIVERY').slice(-1)[0];
      const holdRemaining = scans.filter((s) => s.scanType === 'HOLD_REMAINING').slice(-1)[0];
      const scanOut = scans.filter((s) => s.scanType === 'SCAN_OUT').slice(-1)[0];

      return {
        totalScans: scans.length,
        scans,
        scanIn,
        outOfDelivery,
        holdRemaining,
        scanOut,
        dist,
        hasHistory: scans.length > 0 || !!dist
      };
    },
    [warehouseScansByBarcode, distReportsByBarcode]
  );

  const handleSelectTimeline = useCallback((code: string, row: SheetRowData) => {
    setSelectedTimelineBarcode(code);
    setSelectedTimelineRow(row);
  }, []);

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
      tableContainerRef.current.scrollBy({ left: -250, behavior: 'smooth' });
    }
  };

  const scrollTableRight = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({ left: 250, behavior: 'smooth' });
    }
  };

  const notify = useCallback(
    (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
      if (onShowToast) {
        onShowToast(msg, type);
      }
    },
    [onShowToast]
  );

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

  const rowsRef = useRef<SheetRowData[]>([]);
  rowsRef.current = rows;
  const lastFingerprintRef = useRef<string>('');

  const loadData = useCallback(
    async (isBackground = false, forceRefresh = false) => {
      if (!sheetUrl.trim()) return;

      if (isBackground) {
        setIsSyncingInBackground(true);
      } else {
        setIsLoading(true);
        setFetchError(null);
      }

      try {
        const result = await fetchLiveDataReport(sheetUrl, sheetName, { forceRefresh });
        if (result.success) {
          const firstRow = result.rows[0];
          const lastRow = result.rows[result.rows.length - 1];
          const midRow = result.rows[Math.floor(result.rows.length / 2)];
          const newFingerprint = `${result.rows.length}_${result.columns.length}_${firstRow?._id || firstRow?.col_0 || ''}_${midRow?._id || midRow?.col_0 || ''}_${lastRow?._id || lastRow?.col_0 || ''}`;
          
          // Ultra-fast comparison without freezing main UI thread
          const isChanged = !lastFingerprintRef.current || 
            lastFingerprintRef.current !== newFingerprint || 
            rowsRef.current.length !== result.rows.length;

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
            notify(`✓ បានទាញយកទិន្នន័យ Data Report ជោគជ័យ (${result.rows.length} ជួរដេក)`, 'success');
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

  useEffect(() => {
    if (sheetUrl.trim()) {
      loadData(false);
    }
  }, [sheetUrl, sheetName]);

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

    loadData(false);

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

  const parsedSheet = useMemo(() => parseGoogleSheetInput(sheetUrl), [sheetUrl]);
  const directSheetUrl = useMemo(() => {
    if (parsedSheet.spreadsheetId) {
      return `https://docs.google.com/spreadsheets/d/${parsedSheet.spreadsheetId}/edit${
        parsedSheet.gid ? `#gid=${parsedSheet.gid}` : ''
      }`;
    }
    return sheetUrl;
  }, [parsedSheet, sheetUrl]);

  // Status Column Detection
  const statusColumn = useMemo(() => {
    if (!columns.length) return null;
    const direct = columns.find((c) => {
      const lbl = (c.label || '').trim().toLowerCase();
      const id = (c.id || '').trim().toLowerCase();
      return lbl === 'status' || lbl === 'ស្ថានភាព' || id === 'status';
    });
    if (direct) return direct;

    const partial = columns.find((c) => {
      const lbl = (c.label || '').trim().toLowerCase();
      const id = (c.id || '').trim().toLowerCase();
      return lbl.includes('status') || id.includes('status');
    });
    if (partial) return partial;

    for (const col of columns) {
      const match = rows.slice(0, 50).some((r) => {
        const val = String(r[col.id] || '').trim().toUpperCase();
        return val === 'DELIVERED';
      });
      if (match) return col;
    }
    return null;
  }, [columns, rows]);

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

  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>('ALL');

  // Teams Column Detection
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

  const [teamsFilter, setTeamsFilter] = useState<TeamsFilterOption>('ALL');

  // Location Column Detection
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

  const [locationFilter, setLocationFilter] = useState<LocationFilterOption>('ALL');

  // Column references for dedicated column filters
  const shipperColumn = useMemo(() => {
    if (!columns.length) return null;
    return (
      columns.find(
        (c) =>
          (c.label || '').trim().toUpperCase() === 'SHIPPER' || c.id.toUpperCase() === 'SHIPPER'
      ) || columns.find((c) => (c.label || '').trim().toUpperCase().includes('SHIPPER'))
    );
  }, [columns]);

  const destinationColumn = useMemo(() => {
    if (!columns.length) return null;
    return (
      columns.find(
        (c) =>
          (c.label || '').trim().toUpperCase() === 'DESTINATION' ||
          c.id.toUpperCase() === 'DESTINATION'
      ) || columns.find((c) => (c.label || '').trim().toUpperCase().includes('DESTINATION'))
    );
  }, [columns]);

  const reDestColumn = useMemo(() => {
    if (!columns.length) return null;
    return (
      columns.find((c) => {
        const l = (c.label || '').trim().toUpperCase();
        return l === 'RE-DEST' || l === 'RE DEST' || l === 'REDEST';
      }) || columns.find((c) => (c.label || '').trim().toUpperCase().includes('RE-DEST'))
    );
  }, [columns]);

  const originColumn = useMemo(() => {
    if (!columns.length) return null;
    return (
      columns.find(
        (c) => (c.label || '').trim().toUpperCase() === 'ORIGIN' || c.id.toUpperCase() === 'ORIGIN'
      ) || columns.find((c) => (c.label || '').trim().toUpperCase().includes('ORIGIN'))
    );
  }, [columns]);

  const customersCareColumn = useMemo(() => {
    if (!columns.length) return null;
    return (
      columns.find((c) => {
        const l = (c.label || '').trim().toUpperCase();
        return l === 'CUSTOMERS CARE' || l === 'CUSTOMER CARE' || l === 'CS';
      }) || columns.find((c) => (c.label || '').trim().toUpperCase().includes('CARE'))
    );
  }, [columns]);

  const dateColumn = useMemo(() => {
    if (!columns.length) return null;
    return (
      columns.find(
        (c) => (c.label || '').trim().toUpperCase() === 'DATE' || c.id.toUpperCase() === 'DATE'
      ) || columns.find((c) => (c.label || '').trim().toUpperCase().includes('DATE'))
    );
  }, [columns]);

  const parseSheetDate = useCallback((dateVal: any): Date | null => {
    if (!dateVal) return null;
    const s = String(dateVal).trim();
    if (!s || s === '—' || s === '-' || s === '#N/A') return null;

    const monthMap: Record<string, number> = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11
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

  // Advanced Filter States (Multi-select arrays)
  const [selectedShipper, setSelectedShipper] = useState<string[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<string[]>([]);
  const [selectedReDest, setSelectedReDest] = useState<string[]>([]);
  const [selectedOrigin, setSelectedOrigin] = useState<string[]>([]);
  const [selectedStatusVal, setSelectedStatusVal] = useState<string[]>([]);
  const [selectedCustomersCare, setSelectedCustomersCare] = useState<string[]>([]);
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState<boolean>(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedShipper.length > 0) count++;
    if (selectedDestination.length > 0) count++;
    if (selectedReDest.length > 0) count++;
    if (selectedOrigin.length > 0) count++;
    if (selectedStatusVal.length > 0) count++;
    if (selectedCustomersCare.length > 0) count++;
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

  const handleResetFilters = useCallback(() => {
    setSelectedShipper([]);
    setSelectedDestination([]);
    setSelectedReDest([]);
    setSelectedOrigin([]);
    setSelectedStatusVal([]);
    setSelectedCustomersCare([]);
    setFilterStartDate('');
    setFilterEndDate('');
    notify('✓ បានសម្អាតការចម្រាញ់ទាំងអស់', 'info');
  }, [notify]);

  // Search-filtered rows (using debounced query for 60fps responsiveness)
  const searchFilteredRows = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return rows;
    const query = debouncedSearchQuery.toLowerCase().trim();

    return rows.filter((row) => {
      if (selectedColumnFilter !== 'ALL') {
        const val = row[selectedColumnFilter];
        return val !== undefined && val !== null && String(val).toLowerCase().includes(query);
      }
      return Object.values(row).some(
        (val) => val !== undefined && val !== null && String(val).toLowerCase().includes(query)
      );
    });
  }, [rows, debouncedSearchQuery, selectedColumnFilter]);

  // Status counts
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

  // Teams counts
  const teamCounts = useMemo(() => {
    let ialTotal = 0;
    let delTotal = 0;
    let ialFiltered = 0;
    let delFiltered = 0;

    rows.forEach((r) => {
      const team = getRowTeam(r);
      if (team === 'IAL') ialTotal++;
      else if (team === 'DEL') delTotal++;
    });

    searchFilteredRows.forEach((r) => {
      const team = getRowTeam(r);
      if (team === 'IAL') ialFiltered++;
      else if (team === 'DEL') delFiltered++;
    });

    return {
      ialTotal,
      delTotal,
      ialFiltered,
      delFiltered
    };
  }, [rows, searchFilteredRows, getRowTeam]);

  // Location counts
  const locationCounts = useMemo(() => {
    let outOfTownTotal = 0;
    let cityTownTotal = 0;
    let outOfTownFiltered = 0;
    let cityTownFiltered = 0;

    const isMatch = (val: string, target: string) =>
      val.trim().toLowerCase() === target.toLowerCase();

    rows.forEach((r) => {
      const loc = getRowLocation(r);
      if (isMatch(loc, 'Out Of Town')) outOfTownTotal++;
      else if (isMatch(loc, 'City Town')) cityTownTotal++;
    });

    searchFilteredRows.forEach((r) => {
      const loc = getRowLocation(r);
      if (isMatch(loc, 'Out Of Town')) outOfTownFiltered++;
      else if (isMatch(loc, 'City Town')) cityTownFiltered++;
    });

    return {
      outOfTownTotal,
      cityTownTotal,
      outOfTownFiltered,
      cityTownFiltered
    };
  }, [rows, searchFilteredRows, getRowLocation]);

  // Final Filtered Rows
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

    if (selectedShipper.length > 0 && shipperColumn) {
      const set = new Set(selectedShipper);
      result = result.filter((r) => set.has(String(r[shipperColumn.id] || '').trim()));
    }

    if (selectedDestination.length > 0 && destinationColumn) {
      const set = new Set(selectedDestination);
      result = result.filter((r) => set.has(String(r[destinationColumn.id] || '').trim()));
    }

    if (selectedReDest.length > 0 && reDestColumn) {
      const set = new Set(selectedReDest);
      result = result.filter((r) => set.has(String(r[reDestColumn.id] || '').trim()));
    }

    if (selectedOrigin.length > 0 && originColumn) {
      const set = new Set(selectedOrigin);
      result = result.filter((r) => set.has(String(r[originColumn.id] || '').trim()));
    }

    if (selectedStatusVal.length > 0 && statusColumn) {
      const set = new Set(selectedStatusVal);
      result = result.filter((r) => set.has(String(r[statusColumn.id] || '').trim()));
    }

    if (selectedCustomersCare.length > 0 && customersCareColumn) {
      const set = new Set(selectedCustomersCare);
      result = result.filter((r) => set.has(String(r[customersCareColumn.id] || '').trim()));
    }

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

  // Sorting
  const sortedRows = useMemo(() => {
    if (!sortColumn) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      const valA = a[sortColumn];
      const valB = b[sortColumn];

      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      const numA = Number(String(valA).replace(/[$,៛\s]/g, ''));
      const numB = Number(String(valB).replace(/[$,៛\s]/g, ''));

      if (!isNaN(numA) && !isNaN(numB)) {
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      }

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

  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearchQuery,
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

  const handleCopyCell = (cellId: string, value: any) => {
    if (value === undefined || value === null) return;
    navigator.clipboard.writeText(String(value));
    setCopiedCellId(cellId);
    setTimeout(() => setCopiedCellId(null), 1500);
  };

  const getFieldValue = useCallback(
    (row: SheetRowData, possibleNames: string[]): string => {
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

  const getRowPackageDetails = useCallback(
    (row: SheetRowData): PackageDetails => {
      const barcode = getFieldValue(row, ['barcode', 'bar code', 'code', 'awbn', 'tracking']);
      const date = getFieldValue(row, ['date', 'កាលបរិច្ឆេទ', 'ថ្ងៃខែ']);
      const shipper = getFieldValue(row, ['shipper', 'អ្នកផ្ញើ']);
      const consignee = getFieldValue(row, [
        'consignee',
        'អ្នកទទួល',
        'customer',
        'client',
        'receiver',
        'name'
      ]);
      const phone = getFieldValue(row, ['phone', 'tel', 'contact', 'លេខទូរស័ព្ទ']);
      const destination = getFieldValue(row, ['destination', 'dest', 'ទិសដៅ']);
      const reDest = getFieldValue(row, ['re-dest', 'redest', 're dest', 'ទិសដៅបន្ទាប់']);
      const origin = getFieldValue(row, ['origin', 'ប្រភព']);
      const payment = getFieldValue(row, ['payment', 'pay', 'term', 'ការទូទាត់']);
      const handleBy = getFieldValue(row, [
        'handle by',
        'handled by',
        'handleby',
        'handle',
        'handler',
        'អ្នកកាន់',
        'operator',
        'cs'
      ]);
      const status = getFieldValue(row, ['status', 'ស្ថានភាព']);
      const description = getFieldValue(row, ['description', 'desc', 'បរិយាយ', 'ទំនិញ']);
      const teams = getRowTeam(row);
      const location = getRowLocation(row);

      return {
        barcode: barcode || '—',
        date: date || '',
        shipper: shipper || '',
        consignee: consignee || '',
        phone: phone || '',
        destination: destination || '',
        reDest: reDest || '',
        origin: origin || '',
        payment: payment || '',
        handleBy: handleBy || '',
        status: status || '',
        description: description || '',
        teams: teams || '',
        location: location || ''
      };
    },
    [getFieldValue, getRowTeam, getRowLocation]
  );

  const handleCopyBarcodePackage = useCallback(
    (row: SheetRowData, rowKey: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const pkg = getRowPackageDetails(row);

      const lines = [
        `Tracking : ${pkg.barcode}`,
        pkg.date ? `Date : ${pkg.date}` : '',
        `-------------------------------`,
        pkg.shipper ? `-Shipper : ${pkg.shipper}` : '',
        pkg.consignee ? `-Consignee : ${pkg.consignee}` : '',
        pkg.phone ? `-Phone : ${pkg.phone}` : '',
        pkg.destination ? `-Dest: ${pkg.destination}` : '',
        pkg.handleBy ? `-Handle By: ${pkg.handleBy}` : '',
        pkg.payment ? `-Payment: ${pkg.payment}` : '',
        pkg.status ? `-Status: ${pkg.status}` : '',
        pkg.description ? `---------------------------------\n-Desc: ${pkg.description}` : ''
      ].filter(Boolean);

      navigator.clipboard.writeText(lines.join('\n'));
      setCopiedPackageRowId(rowKey);
      setTimeout(() => setCopiedPackageRowId(null), 1800);
      notify(`✓ បានចម្លងព័ត៌មានកញ្ចប់ (${pkg.barcode}) ទៅ Clipboard រួចរាល់!`, 'success');
    },
    [getRowPackageDetails, notify]
  );

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

  const handleExportCSV = () => {
    if (!columns.length || !sortedRows.length) {
      notify('មិនមានទិន្នន័យសម្រាប់ទាញយកឡើយ', 'info');
      return;
    }

    try {
      const headers = columns.map((c) => c.label || c.id);
      const rows = sortedRows.map((row) => columns.map((c) => row[c.id]));

      const csvContent = formatCsv(headers, rows);
      downloadCsv(`Data_Report_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
      notify('✓ បានទាញយកឯកសារ CSV ជោគជ័យ!', 'success');
    } catch (e: any) {
      notify('កំហុសក្នុងការទាញយក CSV', 'error');
    }
  };

  return (
    <div
      className={`w-full space-y-2 sm:space-y-2.5 pb-28 lg:pb-16 animate-in fade-in duration-200 transition-all ${
        isFullScreen
          ? 'fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 p-2 sm:p-3 overflow-y-auto w-screen h-screen'
          : ''
      }`}
    >
      {/* Floating Exit Button in Fullscreen Mode */}
      {isFullScreen && (
        <div className="fixed top-2.5 right-3.5 z-50 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
          <button
            type="button"
            onClick={() => setIsFullScreen(false)}
            className="px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold shadow-xl border border-slate-700/80 flex items-center gap-1.5 transition active:scale-95 cursor-pointer backdrop-blur-md"
            title="ចេញពី Full Screen (Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
            <span>ចេញពី Full Page (Esc)</span>
          </button>
        </div>
      )}

      {/* 1. HEADER & ACTIONS & CONFIG DRAWER */}
      <DataReportHeader
        distReportsCount={distReports.length}
        onOpenDistModal={() => handleOpenDistModal('')}
        isConfigOpen={isConfigOpen}
        onToggleConfig={() => setIsConfigOpen(!isConfigOpen)}
        sheetUrl={sheetUrl}
        directSheetUrl={directSheetUrl}
        parsedSheet={parsedSheet}
        isAutoSyncEnabled={isAutoSyncEnabled}
        isSyncingInBackground={isSyncingInBackground}
        countdown={countdown}
        syncInterval={syncInterval}
        isAutoSyncMenuOpen={isAutoSyncMenuOpen}
        onToggleAutoSyncMenu={() => setIsAutoSyncMenuOpen(!isAutoSyncMenuOpen)}
        onToggleAutoSyncEnabled={(enabled) => {
          setIsAutoSyncEnabled(enabled);
          localStorage.setItem(STORAGE_KEY_AUTO_SYNC, String(enabled));
          setIsAutoSyncMenuOpen(false);
          notify(enabled ? 'បានបើកដំណើរការ Auto-Sync!' : 'បានបិទ Auto-Sync', 'info');
        }}
        onChangeSyncInterval={(sec) => {
          setSyncInterval(sec);
          setCountdown(sec);
          localStorage.setItem(STORAGE_KEY_SYNC_INTERVAL, String(sec));
          setIsAutoSyncMenuOpen(false);
          notify(`បានកំណត់ Auto-Sync រៀងរាល់ ${sec} វិនាទី!`, 'success');
        }}
        isLoading={isLoading}
        onRefresh={() => loadData(false)}
        onExportCSV={handleExportCSV}
        isFullScreen={isFullScreen}
        onToggleFullScreen={() => setIsFullScreen(!isFullScreen)}
        tempSheetUrl={tempSheetUrl}
        setTempSheetUrl={setTempSheetUrl}
        tempSheetName={tempSheetName}
        setTempSheetName={setTempSheetName}
        showHelpGuide={showHelpGuide}
        setShowHelpGuide={setShowHelpGuide}
        onSaveConfig={handleSaveConfig}
        fetchError={fetchError}
        hasRows={rows.length > 0}
        lastSyncedTime={lastSyncedTime}
      />

      {/* 2. SUMMARY METRICS / KPI STRIP */}
      <DataReportKpiBar
        totalRowsCount={rows.length}
        filteredRowsCount={filteredRows.length}
        deliveredTotal={statusCounts.deliveredTotal}
        deliveredFiltered={statusCounts.deliveredFiltered}
        nonDeliveredTotal={statusCounts.nonDeliveredTotal}
        nonDeliveredFiltered={statusCounts.nonDeliveredFiltered}
        ialTotal={teamCounts.ialTotal}
        ialFiltered={teamCounts.ialFiltered}
        delTotal={teamCounts.delTotal}
        delFiltered={teamCounts.delFiltered}
        outOfTownTotal={locationCounts.outOfTownTotal}
        outOfTownFiltered={locationCounts.outOfTownFiltered}
        cityTownTotal={locationCounts.cityTownTotal}
        cityTownFiltered={locationCounts.cityTownFiltered}
        statusFilter={statusFilter}
        onSetStatusFilter={setStatusFilter}
        teamsFilter={teamsFilter}
        onSetTeamsFilter={setTeamsFilter}
        locationFilter={locationFilter}
        onSetLocationFilter={setLocationFilter}
        isKpiCollapsed={isKpiCollapsed}
        onToggleKpiCollapsed={() => {
          const next = !isKpiCollapsed;
          setIsKpiCollapsed(next);
          localStorage.setItem(STORAGE_KEY_KPI_COLLAPSED, String(next));
        }}
      />

      {/* 3. SEARCH & ADVANCED COLUMN FILTERS BAR */}
      <DataReportFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenBarcodeScanner={() => setIsBarcodeScannerOpen(true)}
        columns={columns}
        selectedColumnFilter={selectedColumnFilter}
        onSelectColumnFilter={setSelectedColumnFilter}
        isFilterPanelOpen={isFilterPanelOpen}
        onToggleFilterPanel={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
        activeFilterCount={activeFilterCount}
        onResetFilters={handleResetFilters}
        uniqueShippers={uniqueShippers}
        selectedShipper={selectedShipper}
        onShipperChange={setSelectedShipper}
        uniqueDestinations={uniqueDestinations}
        selectedDestination={selectedDestination}
        onDestinationChange={setSelectedDestination}
        uniqueReDests={uniqueReDests}
        selectedReDest={selectedReDest}
        onReDestChange={setSelectedReDest}
        uniqueOrigins={uniqueOrigins}
        selectedOrigin={selectedOrigin}
        onOriginChange={setSelectedOrigin}
        uniqueStatuses={uniqueStatuses}
        selectedStatusVal={selectedStatusVal}
        onStatusValChange={setSelectedStatusVal}
        uniqueCustomersCare={uniqueCustomersCare}
        selectedCustomersCare={selectedCustomersCare}
        onCustomersCareChange={setSelectedCustomersCare}
        filterStartDate={filterStartDate}
        onStartDateChange={(val) => setFilterStartDate(val[0] || '')}
        filterEndDate={filterEndDate}
        onEndDateChange={(val) => setFilterEndDate(val[0] || '')}
        tableDensity={tableDensity}
        onSetTableDensity={handleSetTableDensity}
        viewMode={viewMode}
        onSetViewMode={setViewMode}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumnVisibility={toggleColumnVisibility}
        onHideEmptyColumns={handleHideEmptyColumns}
        onShowAllColumns={handleShowAllColumns}
        isColumnDropdownOpen={isColumnDropdownOpen}
        setIsColumnDropdownOpen={setIsColumnDropdownOpen}
        columnDropdownRef={columnDropdownRef}
        emptyColumnIds={emptyColumnIds}
      />

      {/* 4. MAIN DATA VIEW (TABLE / CARDS / EMPTY) */}
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
        <DataReportTable
          visibleColumns={visibleColumns}
          paginatedRows={paginatedRows}
          currentPage={currentPage}
          pageSize={pageSize}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
          tableDensity={tableDensity}
          tableContainerRef={tableContainerRef}
          onTableScroll={handleTableScroll}
          copiedCellId={copiedCellId}
          copiedPackageRowId={copiedPackageRowId}
          onCopyCell={handleCopyCell}
          onCopyBarcodeOnly={handleCopyBarcodeOnly}
          onCopyBarcodePackage={handleCopyBarcodePackage}
          onSelectTimeline={handleSelectTimeline}
          onOpenDistModal={handleOpenDistModal}
          getBarcodeWarehouseSummary={getBarcodeWarehouseSummary}
          distReportsByBarcode={distReportsByBarcode}
          isRowDelivered={isRowDelivered}
        />
      ) : (
        <DataReportCardView
          paginatedRows={paginatedRows}
          currentPage={currentPage}
          pageSize={pageSize}
          visibleColumns={visibleColumns}
          copiedCellId={copiedCellId}
          copiedPackageRowId={copiedPackageRowId}
          onCopyBarcodeOnly={handleCopyBarcodeOnly}
          onCopyBarcodePackage={handleCopyBarcodePackage}
          onSelectTimeline={handleSelectTimeline}
          onOpenDistModal={handleOpenDistModal}
          getBarcodeWarehouseSummary={getBarcodeWarehouseSummary}
          distReportsByBarcode={distReportsByBarcode}
          isRowDelivered={isRowDelivered}
          getRowPackageDetails={getRowPackageDetails}
          hideEmptyCardFields={hideEmptyCardFields}
          expandedCardIds={expandedCardIds}
          onToggleCardExpansion={toggleCardExpansion}
        />
      )}

      {/* 5. FIXED BOTTOM BAR (STICKY WITH SYNCHRONIZED SCROLL & PAGINATION) */}
      {sortedRows.length > 0 && (
        <DataReportBottomBar
          isFullScreen={isFullScreen}
          viewMode={viewMode}
          hasHorizontalOverflow={hasHorizontalOverflow}
          footerScrollRef={footerScrollRef}
          onFooterScroll={handleFooterScroll}
          tableScrollWidth={tableScrollWidth}
          onScrollTableLeft={scrollTableLeft}
          onScrollTableRight={scrollTableRight}
          pageSize={pageSize}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setCurrentPage(1);
          }}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          sortedRowsLength={sortedRows.length}
          totalRowsLength={rows.length}
          teamCounts={teamCounts}
          locationCounts={locationCounts}
        />
      )}

      {/* 🚚 DISTRIBUTION REPORT ALERT FORM MODAL */}
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

      {/* 📦 PACKAGE LIFECYCLE & WAREHOUSE SCANS TIMELINE MODAL */}
      <PackageTimelineModal
        isOpen={!!selectedTimelineBarcode}
        onClose={() => {
          setSelectedTimelineBarcode(null);
          setSelectedTimelineRow(null);
        }}
        barcode={selectedTimelineBarcode}
        rowData={selectedTimelineRow}
        scans={
          selectedTimelineBarcode
            ? warehouseScansByBarcode.get(selectedTimelineBarcode) || []
            : []
        }
        distReport={
          selectedTimelineBarcode
            ? distReportsByBarcode.get(selectedTimelineBarcode)
            : undefined
        }
        onOpenDistModal={handleOpenDistModal}
        columns={columns}
      />

      {/* 📷 LIVE CAMERA BARCODE & QR CODE SCANNER MODAL */}
      {isBarcodeScannerOpen && (
        <React.Suspense fallback={null}>
          <BarcodeScannerModal
            isOpen={isBarcodeScannerOpen}
            onClose={() => setIsBarcodeScannerOpen(false)}
            onScanSuccess={(decoded) => {
              const clean = sanitizeTrackingCode(decoded).trim().toUpperCase();
              setSearchQuery(clean);
              setIsBarcodeScannerOpen(false);
              notify(`✓ បានស្កេនចាប់យកលេខកូដ៖ ${clean}`, 'success');
            }}
            autoCloseOnScan={true}
          />
        </React.Suspense>
      )}
    </div>
  );
};
