import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Database,
  Truck,
  Package,
  Users,
  Search,
  RefreshCw,
  Table as TableIcon,
  Download,
  Filter,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Check,
  Eye,
  EyeOff,
  SlidersHorizontal,
  ArrowUpDown,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Server,
  Zap,
  Clock,
  Calendar,
  X,
  LayoutList,
  FileSpreadsheet
} from 'lucide-react';
import { AuthUser } from '../types';
import { PodSheetSyncModal } from './PodSheetSyncModal';

interface IaleTrackingPageProps {
  currentUser?: AuthUser | null;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const IaleTrackingPage: React.FC<IaleTrackingPageProps> = ({
  currentUser,
  onShowToast
}) => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'shipments' | 'explorer'>('shipments');

  // Space-saving options & Mobile view mode
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const [isCompactDensity, setIsCompactDensity] = useState(true);
  const [hideNullColumns, setHideNullColumns] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Modern Mobile View Mode: 'cards' or 'table' (defaults to cards on mobile/tablets)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => {
    try {
      const saved = localStorage.getItem('iale_view_mode');
      if (saved === 'cards' || saved === 'table') return saved;
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        return 'cards';
      }
    } catch {
      // ignore
    }
    return typeof window !== 'undefined' && window.innerWidth < 768 ? 'cards' : 'cards';
  });

  // Mobile Filter Drawer State
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Stats state
  const [stats, setStats] = useState<any>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(true);

  // Shipments state
  const [shipments, setShipments] = useState<any[]>([]);
  const [shipmentTotal, setShipmentTotal] = useState(0);
  const [shipmentPage, setShipmentPage] = useState(1);
  const [shipmentLimit, setShipmentLimit] = useState(50);
  const [shipmentSearch, setShipmentSearch] = useState('');
  const [shipmentStatus, setShipmentStatus] = useState('Delivered');
  const [shipmentIssueBy, setShipmentIssueBy] = useState('ALL');
  const [shipmentStartDate, setShipmentStartDate] = useState('');
  const [shipmentEndDate, setShipmentEndDate] = useState('');
  const [issueByOptions, setIssueByOptions] = useState<{ issue_by: string; count: number }[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isShipmentLoading, setIsShipmentLoading] = useState(false);
  const [isPodSyncModalOpen, setIsPodSyncModalOpen] = useState(false);

  // POD Google Sheets Incremental Auto-Sync state
  const [isPodAutoSync, setIsPodAutoSync] = useState(() => {
    try {
      return localStorage.getItem('ial_pod_auto_sync') === 'true';
    } catch {
      return false;
    }
  });
  const [lastSyncedPodId, setLastSyncedPodId] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('ial_pod_last_synced_id');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  const isPodAutoSyncRef = useRef(isPodAutoSync);
  isPodAutoSyncRef.current = isPodAutoSync;

  const lastSyncedPodIdRef = useRef(lastSyncedPodId);
  lastSyncedPodIdRef.current = lastSyncedPodId;

  // Table Explorer state
  const [selectedTable, setSelectedTable] = useState('shipment_detail');
  const [explorerData, setExplorerData] = useState<{ columns: any[]; records: any[]; total: number } | null>(null);
  const [explorerPage, setExplorerPage] = useState(1);
  const [explorerLimit, setExplorerLimit] = useState(50);
  const [explorerClientFilter, setExplorerClientFilter] = useState('');
  const [isExplorerLoading, setIsExplorerLoading] = useState(false);
  const [pageJumpInput, setPageJumpInput] = useState('');

  // Auto-Refresh / Auto-Sync state (persisted in localStorage across page refresh)
  const [isAutoSync, setIsAutoSync] = useState(() => {
    try {
      return localStorage.getItem('iale_auto_sync') === 'true';
    } catch {
      return false;
    }
  });
  const [syncInterval, setSyncInterval] = useState(() => {
    try {
      const saved = localStorage.getItem('iale_sync_interval');
      return saved ? Number(saved) : 10;
    } catch {
      return 10;
    }
  });
  const [countdown, setCountdown] = useState(10);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date | null>(new Date());

  // Refs to allow interval timer to access latest state without re-creating timer on every change
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const shipmentPageRef = useRef(shipmentPage);
  shipmentPageRef.current = shipmentPage;

  const shipmentSearchRef = useRef(shipmentSearch);
  shipmentSearchRef.current = shipmentSearch;

  const shipmentStatusRef = useRef(shipmentStatus);
  shipmentStatusRef.current = shipmentStatus;

  const shipmentIssueByRef = useRef(shipmentIssueBy);
  shipmentIssueByRef.current = shipmentIssueBy;

  const shipmentStartDateRef = useRef(shipmentStartDate);
  shipmentStartDateRef.current = shipmentStartDate;

  const shipmentEndDateRef = useRef(shipmentEndDate);
  shipmentEndDateRef.current = shipmentEndDate;

  const selectedTableRef = useRef(selectedTable);
  selectedTableRef.current = selectedTable;

  const explorerPageRef = useRef(explorerPage);
  explorerPageRef.current = explorerPage;

  const shipmentLimitRef = useRef(shipmentLimit);
  shipmentLimitRef.current = shipmentLimit;

  const explorerLimitRef = useRef(explorerLimit);
  explorerLimitRef.current = explorerLimit;

  // Decoupled, asynchronous-safe toast helper to prevent cross-component setState-in-render issues
  const onShowToastRef = useRef(onShowToast);
  useEffect(() => {
    onShowToastRef.current = onShowToast;
  }, [onShowToast]);

  const safeToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setTimeout(() => {
      onShowToastRef.current?.(message, type);
    }, 0);
  }, []);

  // Copy helper
  const copyToClipboard = (text: string, label = 'ទិន្នន័យ') => {
    if (!text || text === '-' || text === 'null') return;
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    safeToast(`បានចម្លង ${label}: ${text}`, 'success');
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Helper to extract date only (strip time)
  const formatDateOnly = (val: any) => {
    if (!val || val === '-' || val === 'null' || val === 'undefined') return '-';
    const str = String(val).trim();
    const datePart = str.split(/[ T]/)[0];
    return datePart || '-';
  };

  // Helper to format Date & DateTime values for Explorer & tables (e.g. created_at, updated_at, synced_at)
  const formatDateTimeValue = (val: any, colName = '', colType = ''): string => {
    if (val === null || val === undefined || val === '') return '-';
    const str = String(val).trim();
    if (str === '-' || str === 'null' || str === 'undefined') return '-';

    const colLower = (colName || '').toLowerCase();
    const typeLower = (colType || '').toLowerCase();

    const isDateCol =
      colLower.endsWith('_at') ||
      colLower.endsWith('_date') ||
      colLower.startsWith('date_') ||
      colLower === 'date' ||
      colLower === 'datetime' ||
      colLower === 'timestamp' ||
      typeLower.includes('timestamp') ||
      typeLower.includes('datetime') ||
      typeLower.includes('date');

    // If already pure date (e.g. 2026-10-09 or 09-10-2026)
    if (/^\d{4}-\d{2}-\d{2}$/.test(str) || /^\d{2}-\d{2}-\d{4}$/.test(str)) {
      return str;
    }

    // If already clean standard MySQL datetime (YYYY-MM-DD HH:mm:ss) without timezone/milliseconds
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
      return str;
    }

    // Check if string matches ISO timestamp or has T / Z / offset
    const isIsoDateTime = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/.test(str);

    if (!isDateCol && !isIsoDateTime) {
      return str;
    }

    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      }
    } catch {
      // fallback
    }

    return str;
  };

  // 1. Fetch Stats
  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setIsStatsLoading(true);
    try {
      const res = await fetch('/api/remote-mysql?action=stats');
      const data = await res.json();
      if (data.ok) {
        setStats(data);
      } else {
        if (!silent) safeToast(data.message || 'មិនអាចទាញយកស្ថិតិ Database បានទេ', 'error');
      }
    } catch (err: any) {
      if (!silent) safeToast(`កំហុសតភ្ជាប់: ${err.message}`, 'error');
    } finally {
      if (!silent) setIsStatsLoading(false);
    }
  }, [safeToast]);

  // 3. Fetch Shipments (Stable Callback)
  const fetchShipments = useCallback(async (
    page?: number,
    search?: string,
    status?: string,
    issueBy?: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
    silent = false
  ) => {
    const sPage = page !== undefined ? page : (shipmentPageRef.current || 1);
    const sSearch = search !== undefined ? search : shipmentSearchRef.current;
    const sStatus = status !== undefined ? status : shipmentStatusRef.current;
    const sIssueBy = issueBy !== undefined ? issueBy : shipmentIssueByRef.current;
    const sStartDate = startDate !== undefined ? startDate : shipmentStartDateRef.current;
    const sEndDate = endDate !== undefined ? endDate : shipmentEndDateRef.current;
    const sLimit = limit !== undefined ? limit : (shipmentLimitRef.current || 50);

    if (!silent) setIsShipmentLoading(true);
    try {
      const trimmedSearch = typeof sSearch === 'string' ? sSearch.trim() : '';
      const params = new URLSearchParams({
        action: 'shipments',
        page: sPage.toString(),
        limit: sLimit.toString(),
        search: trimmedSearch,
        status: sStatus || 'Delivered',
        issueBy: sIssueBy === 'ALL' ? '' : (sIssueBy || ''),
        startDate: sStartDate || '',
        endDate: sEndDate || ''
      });
      const res = await fetch(`/api/remote-mysql?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setShipments(data.records || []);
        setShipmentTotal(data.total || 0);
        setShipmentPage(data.page || 1);
      } else {
        if (!silent) safeToast(data.message || 'មិនអាចទាញយកទិន្នន័យបានទេ', 'error');
      }
    } catch (err: any) {
      if (!silent) safeToast(`កំហុសទាញ Shipments: ${err.message}`, 'error');
    } finally {
      if (!silent) setIsShipmentLoading(false);
    }
  }, [safeToast]);

  const explorerClientFilterRef = useRef(explorerClientFilter);
  explorerClientFilterRef.current = explorerClientFilter;

  // 4. Fetch Table Data for Explorer (with Server-side Search & Sorting)
  const fetchTableData = useCallback(async (
    table: string,
    page = 1,
    limit = explorerLimit,
    search: string | boolean = explorerClientFilterRef.current,
    silent = false
  ) => {
    // If 4th argument is boolean, treat it as `silent` and use current filter ref for search
    const actualSearch = typeof search === 'string' ? search : explorerClientFilterRef.current;
    const actualSilent = typeof search === 'boolean' ? search : silent;

    if (!actualSilent) setIsExplorerLoading(true);
    try {
      const offset = (page - 1) * limit;
      const params = new URLSearchParams({
        action: 'table_data',
        table,
        limit: limit.toString(),
        offset: offset.toString()
      });
      const trimmedSearch = typeof actualSearch === 'string' ? actualSearch.trim() : '';
      if (trimmedSearch) {
        params.append('search', trimmedSearch);
      }
      const res = await fetch(`/api/remote-mysql?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setExplorerData({
          columns: data.columns || [],
          records: data.records || [],
          total: data.total || 0
        });
        setExplorerPage(page);
        setPageJumpInput(page.toString());
      } else {
        if (!actualSilent) safeToast(data.message || 'មិនអាចទាញទិន្នន័យតារាងបានទេ', 'error');
      }
    } catch (err: any) {
      if (!actualSilent) safeToast(`កំហុស Explorer: ${err.message}`, 'error');
    } finally {
      if (!actualSilent) setIsExplorerLoading(false);
    }
  }, [explorerLimit, safeToast]);

  // Export current records to CSV with UTF-8 BOM
  const handleExportCsv = (dataList: any[], filename: string) => {
    if (!dataList || dataList.length === 0) {
      safeToast('គ្មានទិន្នន័យសម្រាប់ទាញយកជា CSV ទេ', 'info');
      return;
    }
    const headers = Object.keys(dataList[0]);
    const csvRows = [
      headers.join(','),
      ...dataList.map(row =>
        headers
          .map(header => {
            const raw = row[header];
            if (raw === null || raw === undefined) return '""';
            const val = formatDateTimeValue(raw, header);
            return `"${String(val).replace(/"/g, '""')}"`;
          })
          .join(',')
      )
    ];

    const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    safeToast('បានទាញយកឯកសារ CSV ជោគជ័យ!', 'success');
  };

  // 3.1 Fetch Issue By List
  const fetchIssueByList = useCallback(async () => {
    try {
      const res = await fetch('/api/remote-mysql?action=issue_by_list');
      const data = await res.json();
      if (data.ok && Array.isArray(data.list)) {
        setIssueByOptions(data.list);
      }
    } catch {
      // silent fallback
    }
  }, []);

  // 3.2 Export Shipments according to active filters
  const handleExportFilteredShipments = async () => {
    if (isExporting) return;
    setIsExporting(true);
    safeToast(`កំពុងទាញយកទិន្នន័យ Export តាម Filter (${shipmentTotal.toLocaleString()} កញ្ចប់)...`, 'info');
    try {
      const params = new URLSearchParams({
        action: 'export_shipments',
        search: shipmentSearch.trim(),
        status: shipmentStatus === 'ALL' ? '' : (shipmentStatus || 'Delivered'),
        issueBy: shipmentIssueBy === 'ALL' ? '' : (shipmentIssueBy || ''),
        startDate: shipmentStartDate || '',
        endDate: shipmentEndDate || '',
        limit: '50000'
      });
      const res = await fetch(`/api/remote-mysql?${params.toString()}`);
      const data = await res.json();
      if (!data.ok || !data.records || data.records.length === 0) {
        safeToast('គ្មានទិន្នន័យត្រូវតាម Filter សម្រាប់ Export ទេ', 'info');
        return;
      }

      const formatted = data.records.map((s: any) => ({
        'ID': `#${s.id}`,
        'Tracking Number': s.tracking_number || '',
        'អ្នកទទួលចុះឈ្មោះ': s.sign_by || '',
        'ថ្ងៃប្រគល់': formatDateOnly(s.delivery_on),
        'ចេញដោយ (Issue)': s.issue_by || '',
        'Status': s.status || ''
      }));

      let tag = shipmentStatus || 'Delivered';
      if (shipmentIssueBy && shipmentIssueBy !== 'ALL') tag += `_${shipmentIssueBy}`;
      if (shipmentStartDate || shipmentEndDate) {
        tag += `_${shipmentStartDate || 'start'}_to_${shipmentEndDate || 'end'}`;
      }

      handleExportCsv(formatted, `IALE_Shipments_${tag}`);
      safeToast(`✓ បាន Export ទិន្នន័យជោគជ័យ (${formatted.length.toLocaleString()} កញ្ចប់)`, 'success');
    } catch (err: any) {
      safeToast(`កំហុសពេល Export: ${err.message}`, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Stable references for timer execution
  const fetchShipmentsRef = useRef(fetchShipments);
  fetchShipmentsRef.current = fetchShipments;

  const fetchStatsRef = useRef(fetchStats);
  fetchStatsRef.current = fetchStats;

  const fetchTableDataRef = useRef(fetchTableData);
  fetchTableDataRef.current = fetchTableData;

  // Initial Load (Runs strictly ONCE on mount)
  useEffect(() => {
    fetchStats();
    fetchShipments(1, '', 'Delivered', 'ALL', '', '');
    fetchIssueByList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Background Silent Auto-Sync of NEW Delivered Shipments to Google Sheets
  const isSyncingPodRef = useRef(false);

  const pushNewDeliveredToSheets = useCallback(async () => {
    if (isSyncingPodRef.current || !isPodAutoSyncRef.current) return;
    const currentLastId = lastSyncedPodIdRef.current;
    if (currentLastId === undefined || currentLastId === null || currentLastId <= 0) return;

    try {
      isSyncingPodRef.current = true;
      const webUrl = localStorage.getItem('ial_pod_backup_webapp_url') || '';
      const res = await fetch('/api/remote-mysql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auto_sync_new_pod',
          sinceId: currentLastId,
          webAppUrl: webUrl.trim(),
          spreadsheetId: '1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ',
          sheetName: 'ialsystems_backup_pod'
        })
      });

      const data = await res.json();
      if (data.ok && data.synced_count > 0) {
        const newMax = data.new_max_id;
        setLastSyncedPodId(newMax);
        lastSyncedPodIdRef.current = newMax;
        try {
          localStorage.setItem('ial_pod_last_synced_id', String(newMax));
        } catch {}
        safeToast(`✓ ⚡ Auto-Sync Sheets: បានបន្ថែម ${data.synced_count} កញ្ចប់ Delivered ថ្មី!`, 'success');
      }
    } catch {
      // background silent
    } finally {
      isSyncingPodRef.current = false;
    }
  }, [safeToast]);

  const pushNewDeliveredToSheetsRef = useRef(pushNewDeliveredToSheets);
  pushNewDeliveredToSheetsRef.current = pushNewDeliveredToSheets;

  // Toggle Auto-Sync Sheets
  const togglePodAutoSync = () => {
    const next = !isPodAutoSync;
    setIsPodAutoSync(next);
    isPodAutoSyncRef.current = next;
    try {
      localStorage.setItem('ial_pod_auto_sync', String(next));
    } catch {}

    if (next) {
      safeToast('✓ បានបើក Auto-Sync ទៅ Google Sheets (តែទិន្នន័យ Delivered ថ្មី)', 'success');
      // If we don't have a starting ID yet, initialize with current max delivered ID
      if (!lastSyncedPodIdRef.current || lastSyncedPodIdRef.current === 0) {
        fetch('/api/remote-mysql?action=pod_sync_stats')
          .then(r => r.json())
          .then(d => {
            if (d.ok && d.max_delivered_id) {
              setLastSyncedPodId(d.max_delivered_id);
              lastSyncedPodIdRef.current = d.max_delivered_id;
              try {
                localStorage.setItem('ial_pod_last_synced_id', String(d.max_delivered_id));
              } catch {}
            }
          })
          .catch(() => {});
      }
      // Trigger immediate check
      setTimeout(() => {
        pushNewDeliveredToSheetsRef.current();
      }, 500);
    } else {
      safeToast('បានបិទ Auto-Sync ទៅ Google Sheets', 'info');
    }
  };

  // Toggle Auto-Refresh
  const toggleAutoSync = () => {
    const next = !isAutoSync;
    setIsAutoSync(next);
    setCountdown(syncInterval);
    try {
      localStorage.setItem('iale_auto_sync', String(next));
    } catch (e) {
      // ignore
    }
    if (next) {
      safeToast(`បានបើក Auto-Sync (${syncInterval} វិនាទីម្តង)`, 'info');
    } else {
      safeToast('បានបិទ Auto-Sync', 'info');
    }
  };

  // Auto-Sync Timer Effect (Runs continuously on background tick without re-triggering on filter clicks)
  useEffect(() => {
    const shouldRun = isAutoSync || isPodAutoSync;
    if (!shouldRun) {
      setCountdown(syncInterval);
      return;
    }

    setCountdown(syncInterval);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Trigger silent background sync of table data if enabled
          if (isAutoSync) {
            fetchStatsRef.current(true);
            if (activeTabRef.current === 'shipments') {
              fetchShipmentsRef.current(
                shipmentPageRef.current,
                shipmentSearchRef.current,
                shipmentStatusRef.current,
                shipmentIssueByRef.current,
                shipmentStartDateRef.current,
                shipmentEndDateRef.current,
                shipmentLimitRef.current,
                true
              );
            } else if (activeTabRef.current === 'explorer') {
              fetchTableDataRef.current(selectedTableRef.current, explorerPageRef.current, explorerLimitRef.current, explorerClientFilterRef.current, true);
            }
          }

          // Trigger background auto-sync of NEW Delivered items to Google Sheets if enabled
          if (isPodAutoSyncRef.current) {
            pushNewDeliveredToSheetsRef.current();
          }

          setLastSyncedTime(new Date());
          return syncInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoSync, isPodAutoSync, syncInterval]);

  // Switch tabs loader
  const handleTabChange = (tab: 'shipments' | 'explorer') => {
    setActiveTab(tab);
    if (tab === 'shipments' && shipments.length === 0) {
      fetchShipments(1, '', 'Delivered', 'ALL', '', '');
    } else if (tab === 'explorer' && !explorerData) {
      fetchTableData(selectedTable, 1);
    }
  };

  // Filter Explorer columns if user chooses to hide null columns
  const activeExplorerColumns = useMemo(() => {
    if (!explorerData?.columns || !explorerData.records) return [];
    if (!hideNullColumns) return explorerData.columns;

    return explorerData.columns.filter(col => {
      // Check if at least one record has a non-null, non-empty value
      return explorerData.records.some(r => r[col.name] !== null && r[col.name] !== undefined && String(r[col.name]).trim() !== '');
    });
  }, [explorerData, hideNullColumns]);

  // Real-time server-side search across entire table when typing in explorer
  useEffect(() => {
    if (activeTab !== 'explorer') return;
    const timer = setTimeout(() => {
      fetchTableData(selectedTable, 1, explorerLimit, explorerClientFilter, true);
    }, 300);
    return () => clearTimeout(timer);
  }, [explorerClientFilter, selectedTable, explorerLimit, activeTab, fetchTableData]);

  // Server-filtered explorer records
  const filteredExplorerRecords = useMemo(() => {
    return explorerData?.records || [];
  }, [explorerData]);

  // Total pages
  const totalShipmentPages = Math.ceil(shipmentTotal / shipmentLimit) || 1;
  const totalExplorerPages = Math.ceil((explorerData?.total || 0) / explorerLimit) || 1;

  // Handle direct page jump in explorer
  const handleJumpToPage = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(pageJumpInput, 10);
    if (!isNaN(p) && p >= 1 && p <= totalExplorerPages) {
      fetchTableData(selectedTable, p);
    } else {
      safeToast(`សូមបញ្ចូលទំព័រចន្លោះពី 1 ដល់ ${totalExplorerPages}`, 'info');
    }
  };

  // Active advanced filters count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (shipmentIssueBy !== 'ALL') count++;
    if (shipmentStartDate || shipmentEndDate) count++;
    if (shipmentLimit !== 50) count++;
    return count;
  }, [shipmentIssueBy, shipmentStartDate, shipmentEndDate, shipmentLimit]);

  return (
    <div className="space-y-2.5">
      {/* 1. Ultra Modern Compact Top Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl px-3 py-2 text-white shadow-md">
        <div className="flex items-center justify-between gap-2">
          {/* Brand & Connection Status */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 shadow-inner">
              <Database className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-xs sm:text-sm tracking-tight text-white truncate">
                  IALE Tracking
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
                {stats?.durationMs && (
                  <span className="text-[10px] sm:text-[11px] font-mono text-emerald-400/90 flex items-center gap-0.5 shrink-0" title="Latency">
                    <Zap className="w-2.5 h-2.5 text-amber-400" />
                    {stats.durationMs}ms
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 font-mono hidden sm:flex items-center gap-1.5">
                <span>srv1366.hstgr.io</span>
                <span>•</span>
                <span className="text-slate-300">u112951411_iale_api</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics & Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Shipment Count Pill */}
            <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-xl bg-slate-800/90 border border-slate-700/60 text-xs">
              <Truck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px] text-slate-400 hidden sm:inline">Shipments:</span>
              <span className="font-bold text-emerald-300 font-mono text-[11px] sm:text-xs">
                {stats?.tableCounts?.shipment_detail ? Number(stats.tableCounts.shipment_detail).toLocaleString() : '99,602'}
              </span>
            </div>

            {/* Desktop Metrics */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800/90 border border-slate-700/60 text-xs">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] text-slate-400">Users:</span>
              <span className="font-bold text-amber-300 font-mono">
                {stats?.tableCounts?.users ? Number(stats.tableCounts.users).toLocaleString() : '92'}
              </span>
            </div>

            {/* Desktop Auto-Sync Widget */}
            <div className="hidden md:flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/70 rounded-xl p-1 text-xs">
              <button
                type="button"
                onClick={toggleAutoSync}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg font-medium text-[11px] transition-all cursor-pointer ${
                  isAutoSync
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
                }`}
                title={isAutoSync ? 'ចុចដើម្បីបិទ Auto-Sync' : 'ចុចដើម្បីបើក Auto-Sync'}
              >
                <span className={`w-2 h-2 rounded-full transition-all ${isAutoSync ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span className="font-semibold select-none">Sync</span>
                {isAutoSync && (
                  <span className="font-mono text-[10px] text-emerald-300 font-bold bg-emerald-950/80 px-1 rounded border border-emerald-500/30">
                    {countdown}s
                  </span>
                )}
              </button>

              <div className="flex items-center bg-slate-900/80 rounded-lg border border-slate-700/80 p-0.5 text-[10px] font-mono">
                {[10, 30, 60].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => {
                      setSyncInterval(sec);
                      setCountdown(sec);
                      try {
                        localStorage.setItem('iale_sync_interval', String(sec));
                      } catch (e) {}
                      if (isAutoSync) {
                        safeToast(`បានកំណត់ Auto-Sync មក ${sec} វិនាទីម្តង`, 'info');
                      }
                    }}
                    className={`px-1.5 py-0.5 rounded transition font-medium cursor-pointer ${
                      syncInterval === sec
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Refresh Live Button */}
            <button
              onClick={() => {
                fetchStats();
                if (activeTab === 'shipments') fetchShipments(shipmentPage, shipmentSearch, shipmentStatus);
                if (activeTab === 'explorer') fetchTableData(selectedTable, explorerPage);
                setLastSyncedTime(new Date());
                safeToast('បានធ្វើបច្ចុប្បន្នភាពទិន្នន័យ Live!', 'info');
              }}
              className="p-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-500/40 transition active:scale-95 cursor-pointer"
              title="Refresh Live Data ភ្លាមៗ"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isStatsLoading || isShipmentLoading || isExplorerLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* Expand / Collapse Header Button */}
            <button
              onClick={() => setIsHeaderExpanded(!isHeaderExpanded)}
              className={`p-1.5 rounded-xl border transition cursor-pointer ${
                isHeaderExpanded
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border-slate-700'
              }`}
              title={isHeaderExpanded ? 'បង្រួមព័ត៌មានលម្អិត' : 'ពង្រីកមើលព័ត៌មានលម្អិត និង Auto-Sync'}
            >
              {isHeaderExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Collapsible Mobile Auto-Sync & Server Details */}
        {isHeaderExpanded && (
          <div className="pt-2.5 mt-2.5 border-t border-slate-800/80 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
            {/* Mobile Auto-Sync Controls */}
            <div className="flex md:hidden items-center justify-between gap-2 p-2 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-semibold text-slate-200">Auto-Sync Live:</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleAutoSync}
                  className={`px-2 py-1 rounded-lg font-semibold text-[11px] transition cursor-pointer ${
                    isAutoSync
                      ? 'bg-emerald-500 text-white shadow-xs'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {isAutoSync ? `បើក (${countdown}s)` : 'បិទ'}
                </button>
                <div className="flex items-center bg-slate-900 rounded-lg p-0.5 text-[10px] font-mono border border-slate-700">
                  {[10, 30, 60].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        setSyncInterval(sec);
                        setCountdown(sec);
                        try { localStorage.setItem('iale_sync_interval', String(sec)); } catch(e){}
                      }}
                      className={`px-1.5 py-0.5 rounded transition ${syncInterval === sec ? 'bg-blue-600 text-white font-bold' : 'text-slate-400'}`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-2.5">
                <div className="text-[11px] text-emerald-300 flex items-center justify-between">
                  <span>Shipments</span>
                  <Truck className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-sm sm:text-base font-bold text-emerald-300 font-mono mt-0.5">
                  {stats?.tableCounts?.shipment_detail ? Number(stats.tableCounts.shipment_detail).toLocaleString() : '99,602'}
                </div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-2.5">
                <div className="text-[11px] text-amber-300 flex items-center justify-between">
                  <span>គណនី Users</span>
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-sm sm:text-base font-bold text-amber-300 font-mono mt-0.5">
                  {stats?.tableCounts?.users ? Number(stats.tableCounts.users).toLocaleString() : '92'}
                </div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-2.5 col-span-2 sm:col-span-1">
                <div className="text-[11px] text-purple-300 flex items-center justify-between">
                  <span>Database Tables</span>
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div className="text-sm sm:text-base font-bold text-purple-300 font-mono mt-0.5">
                  {stats?.totalTables || '20'} Tables
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Sleek Unified Tab Bar & View Switcher */}
      <div className="flex items-center justify-between gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 shadow-xs">
        {/* Navigation Tabs (Smooth Horizontal Scroll) */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
          <button
            onClick={() => handleTabChange('shipments')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 cursor-pointer ${
              activeTab === 'shipments'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>ការដឹកជញ្ជូន</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${activeTab === 'shipments' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
              {shipmentTotal > 0 ? (shipmentTotal > 9999 ? `${(shipmentTotal / 1000).toFixed(1)}k` : shipmentTotal.toLocaleString()) : '99.6k'}
            </span>
          </button>

          <button
            onClick={() => handleTabChange('explorer')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 cursor-pointer ${
              activeTab === 'explorer'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>មើលគ្រប់តារាង</span>
          </button>
        </div>

        {/* View Mode Switcher (Cards vs Table) */}
        <div className="flex items-center gap-1 shrink-0">
          {activeTab === 'shipments' && (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
              <button
                type="button"
                onClick={() => {
                  setViewMode('cards');
                  try { localStorage.setItem('iale_view_mode', 'cards'); } catch(e){}
                }}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
                title="ទម្រង់កាត (Cards View - ទំនើប និងងាយស្រួលលើទូរស័ព្ទ)"
              >
                <LayoutList className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('table');
                  try { localStorage.setItem('iale_view_mode', 'table'); } catch(e){}
                }}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
                title="ទម្រង់តារាង (Table View)"
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {viewMode === 'table' && activeTab === 'shipments' && (
            <button
              onClick={() => setIsCompactDensity(!isCompactDensity)}
              className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-medium border transition cursor-pointer ${
                isCompactDensity
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
              title="ប្ដូរចន្លោះជួរដេក (Density)"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>{isCompactDensity ? 'បង្រួម' : 'ធម្មតា'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. TAB CONTENT: SHIPMENTS (99k+) */}
      {activeTab === 'shipments' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-3 space-y-3">
          {/* Controls Bar: Top Search & Actions Row */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              {/* Primary Search Input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="ស្វែងរក Tracking / ឈ្មោះ..."
                  value={shipmentSearch}
                  onChange={(e) => setShipmentSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate)}
                  className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:text-white placeholder:text-slate-400 transition"
                />
                {shipmentSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setShipmentSearch('');
                      fetchShipments(1, '', shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Advanced Filter Trigger Button */}
              <button
                type="button"
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition shrink-0 cursor-pointer active:scale-95 ${
                  isFilterOpen || activeFilterCount > 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-750'
                }`}
                title="បើក/បិទ តម្រងកម្រិតខ្ពស់ (Issue By, Dates)"
              >
                <Filter className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">តម្រង</span>
                {activeFilterCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Export Button */}
              <button
                type="button"
                onClick={handleExportFilteredShipments}
                disabled={isExporting || isShipmentLoading}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 shrink-0"
                title={`ទាញយកទិន្នន័យ CSV (${shipmentTotal.toLocaleString()} កញ្ចប់)`}
              >
                {isExporting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span className="hidden md:inline">Export</span>
              </button>

              {/* Sync to Google Sheets Buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsPodSyncModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-750 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 border border-emerald-400/30"
                  title="បើកផ្ទាំងគ្រប់គ្រង Sync ទិន្នន័យ Delivered ទៅ Google Sheets"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-100" />
                  <span className="hidden sm:inline">Sync Sheets</span>
                </button>

                {/* Auto-Sync ថ្មីៗ Quick Toggle Button */}
                <button
                  type="button"
                  onClick={togglePodAutoSync}
                  className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer border shadow-xs active:scale-95 ${
                    isPodAutoSync
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                  title={isPodAutoSync ? 'Auto-Sync Sheets ថ្មីៗកំពុងដំណើរការ (ចុចដើម្បីបិទ)' : 'ចុចដើម្បីបើក Auto-Sync ទៅកាន់ Google Sheets (តែទិន្នន័យ Delivered ថ្មី)'}
                >
                  <Zap className={`w-3.5 h-3.5 ${isPodAutoSync ? 'text-amber-500 fill-amber-500' : 'text-slate-400'}`} />
                  <span className="hidden lg:inline text-[11px]">Auto-Sync ថ្មីៗ:</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${isPodAutoSync ? 'bg-emerald-600 text-white animate-pulse' : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                    {isPodAutoSync ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>
            </div>

            {/* Quick Status Chips (Horizontal Scrollable) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {[
                { id: 'Delivered', label: 'Delivered (បានប្រគល់)', icon: Check },
                { id: 'ALL', label: 'ទាំងអស់ (All)' },
                { id: 'Pickup', label: 'Pickup' },
                { id: 'In Transit', label: 'In Transit' },
                { id: 'Up Left Phnom Penh', label: 'Up Left PP' },
                { id: 'Arrived Hub', label: 'Arrived Hub' },
              ].map((st) => {
                const isSelected = shipmentStatus === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setShipmentStatus(st.id);
                      fetchShipments(1, shipmentSearch, st.id, shipmentIssueBy, shipmentStartDate, shipmentEndDate);
                    }}
                    className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-xs shadow-emerald-600/30 ring-2 ring-emerald-500/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60'
                    }`}
                  >
                    {st.icon && <st.icon className="w-3 h-3" />}
                    <span>{st.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Collapsible Advanced Filters Drawer */}
            {isFilterOpen && (
              <div className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/60 pb-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-500" />
                    តម្រងបន្ថែម (Advanced Filters)
                  </span>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setShipmentSearch('');
                        setShipmentStatus('Delivered');
                        setShipmentIssueBy('ALL');
                        setShipmentStartDate('');
                        setShipmentEndDate('');
                        fetchShipments(1, '', 'Delivered', 'ALL', '', '');
                      }}
                      className="text-[11px] text-red-500 hover:underline font-semibold cursor-pointer"
                    >
                      កំណត់ឡើងវិញ (Reset All)
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {/* Issue By */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      ចេញទំនិញដោយ (Issue By)
                    </label>
                    <select
                      value={shipmentIssueBy}
                      onChange={(e) => {
                        const ib = e.target.value;
                        setShipmentIssueBy(ib);
                        fetchShipments(1, shipmentSearch, shipmentStatus, ib, shipmentStartDate, shipmentEndDate);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white font-medium cursor-pointer"
                    >
                      <option value="ALL">ទាំងអស់ (All Issues)</option>
                      {issueByOptions.map((opt) => (
                        <option key={opt.issue_by} value={opt.issue_by}>
                          {opt.issue_by} ({Number(opt.count).toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date Range */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      កាលបរិច្ឆេទប្រគល់ (Delivery Date)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={shipmentStartDate}
                        onChange={(e) => {
                          const sd = e.target.value;
                          setShipmentStartDate(sd);
                          fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, sd, shipmentEndDate);
                        }}
                        className="flex-1 px-2 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white cursor-pointer"
                      />
                      <span className="text-slate-400 text-xs">ដល់</span>
                      <input
                        type="date"
                        value={shipmentEndDate}
                        onChange={(e) => {
                          const ed = e.target.value;
                          setShipmentEndDate(ed);
                          fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, ed);
                        }}
                        className="flex-1 px-2 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Limit per page */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      ចំនួនក្នុងមួយទំព័រ
                    </label>
                    <select
                      value={shipmentLimit}
                      onChange={(e) => {
                        const lim = Number(e.target.value);
                        setShipmentLimit(lim);
                        fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate, lim);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white font-medium cursor-pointer"
                    >
                      <option value={25}>25 កញ្ចប់ / ទំព័រ</option>
                      <option value={50}>50 កញ្ចប់ / ទំព័រ</option>
                      <option value={100}>100 កញ្ចប់ / ទំព័រ</option>
                      <option value={200}>200 កញ្ចប់ / ទំព័រ</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen(false)}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    បិទផ្ទាំងតម្រង
                  </button>
                </div>
              </div>
            )}

            {/* Active Filters Summary Pills */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-slate-700 dark:text-slate-300">លទ្ធផល:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {shipmentTotal.toLocaleString()} កញ្ចប់
                </span>
                {shipmentIssueBy !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10.5px] font-semibold border border-blue-200 dark:border-blue-800">
                    ចេញ: {shipmentIssueBy}
                    <button
                      type="button"
                      onClick={() => {
                        setShipmentIssueBy('ALL');
                        fetchShipments(1, shipmentSearch, shipmentStatus, 'ALL', shipmentStartDate, shipmentEndDate);
                      }}
                      className="hover:text-red-500 p-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
                {(shipmentStartDate || shipmentEndDate) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[10.5px] font-semibold border border-amber-200 dark:border-amber-800">
                    {shipmentStartDate || '...'} ដល់ {shipmentEndDate || '...'}
                    <button
                      type="button"
                      onClick={() => {
                        setShipmentStartDate('');
                        setShipmentEndDate('');
                        fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, '', '');
                      }}
                      className="hover:text-red-500 p-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 4. SHIPMENTS DATA PRESENTATION: CARDS VIEW VS TABLE VIEW */}
          {viewMode === 'cards' ? (
            /* Modern Mobile-First Cards View */
            <div className="space-y-2.5 min-h-[300px]">
              {isShipmentLoading ? (
                <div className="py-20 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-500 mb-2" />
                  <span className="text-xs">កំពុងទាញយកទិន្នន័យ Shipments...</span>
                </div>
              ) : shipments.length === 0 ? (
                <div className="py-14 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                  <Package className="w-8 h-8 mx-auto text-slate-400 mb-2 opacity-50" />
                  <p className="text-xs font-semibold">គ្មានទិន្នន័យ Shipments ត្រូវនឹងលក្ខខណ្ឌនេះទេ</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {shipments.map((s) => {
                    const isDelivered = s.status === 'Delivered';
                    const isCopied = copiedText === s.tracking_number;
                    return (
                      <div
                        key={s.id}
                        className="bg-white dark:bg-slate-850 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3 shadow-xs hover:shadow-md hover:border-emerald-500/40 dark:hover:border-emerald-500/30 transition-all group"
                      >
                        {/* Header: Tracking Number + Status Badge */}
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800/80">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(s.tracking_number, 'Tracking')}
                            className="flex items-center gap-1.5 font-mono font-bold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 transition group/btn text-left truncate cursor-pointer active:scale-95"
                            title="ចុចដើម្បីចម្លង Tracking Number"
                          >
                            <span className="tracking-wide select-all">{s.tracking_number}</span>
                            {isCopied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-slate-400 group-hover/btn:text-emerald-500 transition shrink-0" />
                            )}
                          </button>

                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight shrink-0 ${
                              isDelivered
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            }`}
                          >
                            {s.status || 'In Transit'}
                          </span>
                        </div>

                        {/* Body: Recipient & Meta info */}
                        <div className="pt-2 space-y-1.5 text-xs">
                          {/* Recipient Name / Phone */}
                          <div className="flex items-center justify-between text-slate-800 dark:text-slate-200">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-semibold truncate" title={s.sign_by}>
                                {s.sign_by || 'មិនបញ្ជាក់ឈ្មោះ'}
                              </span>
                            </div>
                            <span className="font-mono text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                              #{s.id}
                            </span>
                          </div>

                          {/* Date & Issue By */}
                          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-amber-500/80 shrink-0" />
                              <span>{formatDateOnly(s.delivery_on)}</span>
                            </div>
                            {s.issue_by && (
                              <div className="flex items-center gap-1 font-mono text-[10px] bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
                                <Truck className="w-3 h-3 text-blue-500 shrink-0" />
                                <span className="truncate max-w-[120px]" title={s.issue_by}>{s.issue_by}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* High Density Table View */
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 max-h-[calc(100vh-270px)] min-h-[300px] custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800/95 backdrop-blur-sm text-slate-700 dark:text-slate-200 font-semibold z-10 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className={`px-2.5 ${isCompactDensity ? 'py-1.5' : 'py-2.5'} sticky left-0 bg-slate-100 dark:bg-slate-800 z-20`}>ID</th>
                    <th className={`px-2.5 ${isCompactDensity ? 'py-1.5' : 'py-2.5'}`}>Tracking Number</th>
                    <th className={`px-2.5 ${isCompactDensity ? 'py-1.5' : 'py-2.5'}`}>អ្នកទទួលចុះឈ្មោះ</th>
                    <th className={`px-2.5 ${isCompactDensity ? 'py-1.5' : 'py-2.5'}`}>ថ្ងៃប្រគល់</th>
                    <th className={`px-2.5 ${isCompactDensity ? 'py-1.5' : 'py-2.5'}`}>ចេញដោយ (Issue)</th>
                    <th className={`px-2.5 ${isCompactDensity ? 'py-1.5' : 'py-2.5'}`}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                  {isShipmentLoading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-emerald-500 mb-1.5" />
                        <span className="text-xs">កំពុងទាញយកទិន្នន័យ Shipments...</span>
                      </td>
                    </tr>
                  ) : shipments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400 text-xs">
                        គ្មានទិន្នន័យ Shipments ត្រូវនឹងលក្ខខណ្ឌនេះទេ
                      </td>
                    </tr>
                  ) : (
                    shipments.map((s) => (
                      <tr key={s.id} className="hover:bg-emerald-50/40 dark:hover:bg-slate-800/40 transition">
                        <td className={`px-2.5 ${isCompactDensity ? 'py-1.5' : 'py-2'} font-mono text-slate-500 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-100 dark:border-slate-800/60 text-[11px]`}>
                          #{s.id}
                        </td>
                        <td className={`px-2.5 ${isCompactDensity ? 'py-1.5' : 'py-2'} font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap`}>
                          <button
                            onClick={() => copyToClipboard(s.tracking_number, 'Tracking')}
                            className="hover:underline flex items-center gap-1 group cursor-pointer"
                            title="ចុចដើម្បីចម្លង Tracking Number"
                          >
                            <span>{s.tracking_number}</span>
                            <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition text-slate-400" />
                          </button>
                        </td>
                        <td className={`px-2.5 ${isCompactDensity ? 'py-1.5' : 'py-2'} max-w-[180px] truncate font-medium text-slate-800 dark:text-slate-200`}>
                          {s.sign_by || '-'}
                        </td>
                        <td 
                          className={`px-2.5 ${isCompactDensity ? 'py-1.5' : 'py-2'} whitespace-nowrap text-slate-500 dark:text-slate-400 text-[11px]`}
                          title={s.delivery_on ? `ពេលវេលាពេញលេញ: ${s.delivery_on}` : ''}
                        >
                          {formatDateOnly(s.delivery_on)}
                        </td>
                        <td className={`px-2.5 ${isCompactDensity ? 'py-1.5' : 'py-2'} font-mono text-[11px] text-slate-600 dark:text-slate-300`}>
                          {s.issue_by || '-'}
                        </td>
                        <td className={`px-2.5 ${isCompactDensity ? 'py-1.5' : 'py-2'}`}>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.status === 'Delivered'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}>
                            {s.status || 'In Transit'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Compact Thumb-Friendly Pagination */}
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="text-[11px] truncate">
              ទំព័រ <strong className="font-mono text-slate-800 dark:text-slate-200">{shipmentPage}</strong> / {totalShipmentPages.toLocaleString()}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                disabled={shipmentPage <= 1 || isShipmentLoading}
                onClick={() => fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                title="ទំព័រដំបូង"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={shipmentPage <= 1 || isShipmentLoading}
                onClick={() => fetchShipments(shipmentPage - 1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                title="ទំព័រមុន"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 font-mono">
                {shipmentPage}
              </span>

              <button
                disabled={shipmentPage >= totalShipmentPages || isShipmentLoading}
                onClick={() => fetchShipments(shipmentPage + 1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                title="ទំព័របន្ទាប់"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={shipmentPage >= totalShipmentPages || isShipmentLoading}
                onClick={() => fetchShipments(totalShipmentPages, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                title="ទំព័រចុងក្រោយ"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB CONTENT: TABLE EXPLORER */}
      {activeTab === 'explorer' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-3 space-y-2.5">
          {/* Top Controls Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left: Table selector & quick filter */}
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[280px]">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">តារាង:</span>
                <select
                  value={selectedTable}
                  onChange={(e) => {
                    setSelectedTable(e.target.value);
                    fetchTableData(e.target.value, 1);
                  }}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-white font-bold cursor-pointer"
                >
                  {(stats?.tables || [
                    'booking', 'shipment_detail', 'bill', 'bill_detail', 'manifest', 
                    'manifest_detail', 'users', 'location', 'status', 'province'
                  ]).map((t: string) => (
                    <option key={t} value={t}>
                      {t} {stats?.tableCounts?.[t] ? `(${Number(stats.tableCounts[t]).toLocaleString()})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Global Server Search across whole table */}
              <div className="relative min-w-[150px] max-w-xs flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="ស្វែងរកក្នុងតារាង..."
                  value={explorerClientFilter}
                  onChange={(e) => setExplorerClientFilter(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-white"
                />
              </div>

              {/* Hide Null Columns Toggle */}
              <button
                onClick={() => setHideNullColumns(!hideNullColumns)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                  hideNullColumns
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
                title="លាក់ Columns ណាដែលគ្មានទិន្នន័យ (null ទាំងអស់) ក្នុងទំព័រនេះ ដើម្បីចំណេញទទឹង"
              >
                {hideNullColumns ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{hideNullColumns ? 'បានលាក់ Column ទទេ' : 'លាក់ Column ទទេ'}</span>
              </button>
            </div>

            {/* Right: Page limits & Export */}
            <div className="flex items-center gap-1.5">
              <select
                value={explorerLimit}
                onChange={(e) => {
                  const lim = Number(e.target.value);
                  setExplorerLimit(lim);
                  fetchTableData(selectedTable, 1, lim);
                }}
                className="px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                <option value={25}>25 / ទំព័រ</option>
                <option value={50}>50 / ទំព័រ</option>
                <option value={100}>100 / ទំព័រ</option>
              </select>

              {explorerData && (
                <button
                  onClick={() => handleExportCsv(explorerData.records, `Table_${selectedTable}`)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>
              )}
            </div>
          </div>

          {/* Table Container */}
          {isExplorerLoading ? (
            <div className="py-16 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
              <span className="text-xs">កំពុងទាញទិន្នន័យតារាង {selectedTable}...</span>
            </div>
          ) : explorerData ? (
            <div className="space-y-1.5">
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 max-h-[calc(100vh-270px)] min-h-[320px] custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800/95 backdrop-blur-sm shadow-sm z-20 border-b border-slate-200 dark:border-slate-700">
                    <tr className="text-slate-700 dark:text-slate-200 font-semibold">
                      {activeExplorerColumns.map((col, idx) => (
                        <th
                          key={col.name}
                          className={`px-2.5 ${isCompactDensity ? 'py-1.5' : 'py-2'} whitespace-nowrap ${
                            idx === 0 ? 'sticky left-0 bg-slate-100 dark:bg-slate-800 z-30 border-r border-slate-200 dark:border-slate-700' : ''
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <span>{col.name}</span>
                            <span className="text-[9px] font-mono text-slate-400 font-normal">
                              ({col.type?.split('(')[0]})
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                    {filteredExplorerRecords.length === 0 ? (
                      <tr>
                        <td colSpan={activeExplorerColumns.length || 1} className="py-10 text-center text-slate-400">
                          {explorerClientFilter ? 'មិនមានទិន្នន័យត្រូវនឹងពាក្យរុករកនេះទេ' : 'គ្មានទិន្នន័យក្នុងតារាងនេះទេ'}
                        </td>
                      </tr>
                    ) : (
                      filteredExplorerRecords.map((r, rowIdx) => (
                        <tr key={rowIdx} className="hover:bg-indigo-50/30 dark:hover:bg-slate-800/40 transition">
                          {activeExplorerColumns.map((col, colIdx) => {
                            const val = r[col.name];
                            const isNull = val === null || val === undefined || val === '';
                            const isFirstCol = colIdx === 0;
                            const rawStr = isNull ? '' : String(val);
                            const displayVal = isNull ? '-' : formatDateTimeValue(val, col.name, col.type);
                            const isFormatted = !isNull && displayVal !== rawStr;

                            return (
                              <td
                                key={col.name}
                                className={`px-2.5 ${isCompactDensity ? 'py-1.5' : 'py-2'} whitespace-nowrap max-w-[240px] truncate text-slate-700 dark:text-slate-300 ${
                                  isFirstCol ? 'sticky left-0 bg-white dark:bg-slate-900 z-10 font-bold text-indigo-600 dark:text-indigo-400 border-r border-slate-100 dark:border-slate-800' : ''
                                }`}
                                title={isNull ? '' : (isFormatted ? `${displayVal} (តម្លៃដើម: ${rawStr})` : rawStr)}
                              >
                                {isNull ? (
                                  <span className="text-slate-300 dark:text-slate-600 font-sans">-</span>
                                ) : (
                                  <span
                                    onClick={() => copyToClipboard(displayVal, col.name)}
                                    className="cursor-pointer hover:underline"
                                    title={isFormatted ? `ចុចដើម្បីចម្លង (តម្លៃដើម: ${rawStr})` : 'ចុចដើម្បីចម្លង'}
                                  >
                                    {displayVal}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Compact Explorer Pagination */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1">
                <div className="text-[11px] flex items-center gap-2">
                  <span>
                    តារាង <strong>{selectedTable}</strong>: សរុប <strong>{explorerData.total.toLocaleString()}</strong> ជួរដេក
                  </span>
                  {activeExplorerColumns.length < explorerData.columns.length && (
                    <span className="text-[10px] text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
                      (បានលាក់ {explorerData.columns.length - activeExplorerColumns.length} columns ទទេ)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    disabled={explorerPage <= 1 || isExplorerLoading}
                    onClick={() => fetchTableData(selectedTable, 1)}
                    className="p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                    title="ទំព័រដំបូង"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={explorerPage <= 1 || isExplorerLoading}
                    onClick={() => fetchTableData(selectedTable, explorerPage - 1)}
                    className="p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                    title="ទំព័រមុន"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  {/* Direct Jump to page input */}
                  <form onSubmit={handleJumpToPage} className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={totalExplorerPages}
                      value={pageJumpInput}
                      onChange={(e) => setPageJumpInput(e.target.value)}
                      onBlur={() => {
                        const p = parseInt(pageJumpInput, 10);
                        if (!isNaN(p) && p !== explorerPage && p >= 1 && p <= totalExplorerPages) {
                          fetchTableData(selectedTable, p);
                        }
                      }}
                      className="w-12 text-center py-0.5 px-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-mono font-bold text-slate-800 dark:text-slate-200 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-[11px] font-mono text-slate-500">
                      / {totalExplorerPages.toLocaleString()}
                    </span>
                  </form>

                  <button
                    disabled={explorerPage >= totalExplorerPages || isExplorerLoading}
                    onClick={() => fetchTableData(selectedTable, explorerPage + 1)}
                    className="p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                    title="ទំព័របន្ទាប់"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={explorerPage >= totalExplorerPages || isExplorerLoading}
                    onClick={() => fetchTableData(selectedTable, totalExplorerPages)}
                    className="p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                    title="ទំព័រចុងក្រោយ"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Google Sheets POD Sync Modal */}
      <PodSheetSyncModal
        isOpen={isPodSyncModalOpen}
        onClose={() => setIsPodSyncModalOpen(false)}
        onShowToast={safeToast}
        isPodAutoSync={isPodAutoSync}
        onTogglePodAutoSync={(active) => {
          setIsPodAutoSync(active);
          isPodAutoSyncRef.current = active;
        }}
        lastSyncedPodId={lastSyncedPodId}
        onUpdateLastSyncedPodId={(id) => {
          setLastSyncedPodId(id);
          lastSyncedPodIdRef.current = id;
        }}
      />
    </div>
  );
};

export default IaleTrackingPage;

