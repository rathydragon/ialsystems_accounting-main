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
  FileSpreadsheet,
  User,
  MapPin
} from 'lucide-react';
import { AuthUser } from '../types';
import { PodSheetSyncModal } from './PodSheetSyncModal';
import { formatCsv, downloadCsv } from '../utils/csvHelper';
import {
  gridWrap,
  gridTable,
  gridTh,
  gridTd,
  gridRow,
  gridType,
  GridHeadGutter,
  GridRowGutter,
  GridSelectionBar,
} from './ui/DataGrid';
import { copyText } from '../utils/clipboard';
import { CountdownText, useCountdownStore } from './SyncCountdown';


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
  const isCompactDensity = true;
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

  const [podCountdown, setPodCountdown] = useState(10);
  const [isSyncingPod, setIsSyncingPod] = useState(false);

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
  const countdownStore = useCountdownStore(10);
  const setCountdown = countdownStore.set;
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
    copyText(text);
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
      const res = await fetch(`/api/remote-mysql?action=stats&_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' }
      });
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
        endDate: sEndDate || '',
        _t: Date.now().toString()
      });
      const res = await fetch(`/api/remote-mysql?${params.toString()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' }
      });
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
        offset: offset.toString(),
        _t: Date.now().toString()
      });
      const trimmedSearch = typeof actualSearch === 'string' ? actualSearch.trim() : '';
      if (trimmedSearch) {
        params.append('search', trimmedSearch);
      }
      const res = await fetch(`/api/remote-mysql?${params.toString()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' }
      });
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
    const rows = dataList.map(row =>
      headers.map(header => {
        const raw = row[header];
        if (raw === null || raw === undefined) return '';
        return formatDateTimeValue(raw, header);
      })
    );

    const csvContent = formatCsv(headers, rows);
    downloadCsv(`${filename}_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
    safeToast('បានទាញយកឯកសារ CSV ជោគជ័យ!', 'success');
  };

  // 3.1 Fetch Issue By List
  const fetchIssueByList = useCallback(async () => {
    try {
      const res = await fetch(`/api/remote-mysql?action=issue_by_list&_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' }
      });
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
        limit: '50000',
        _t: Date.now().toString()
      });
      const res = await fetch(`/api/remote-mysql?${params.toString()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' }
      });
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

    try {
      isSyncingPodRef.current = true;
      setIsSyncingPod(true);
      let currentLastId = lastSyncedPodIdRef.current;

      // បើសិនជាពុំទាន់មាន starting ID ទេ ត្រូវទាញយក Sheet Max ID ពិតប្រាកដពី Google Sheet ជាមុនសិន
      if (!currentLastId || currentLastId <= 0) {
        try {
          const idRes = await fetch(`/api/remote-mysql?action=get_sheet_max_id&_t=${Date.now()}`, {
            cache: 'no-store'
          });
          const idData = await idRes.json();
          if (idData.ok && idData.sheet_max_id > 0) {
            currentLastId = idData.sheet_max_id;
            setLastSyncedPodId(currentLastId);
            lastSyncedPodIdRef.current = currentLastId;
            try {
              localStorage.setItem('ial_pod_last_synced_id', String(currentLastId));
            } catch {}
          }
        } catch {}
      }

      if (!currentLastId || currentLastId <= 0) return;

      let webUrl = localStorage.getItem('ial_pod_backup_webapp_url') || '';
      if (!webUrl || webUrl.includes('AKfycbxv_dl8TK8UtwQGMsfVMWwxbUQgKE87GvEbTwdXqphvhqa3ZpYZdkRULqErB4BkxvXB') || webUrl.includes('AKfycbz94heSc-q_UmlkOA2EcOY_7PgvdSiPgNHe0TS1EA25P7Z9AwevE5GqszwhIfMY5tBG')) {
        webUrl = 'https://script.google.com/macros/s/AKfycbw1Xl1-ds50TWAw4BOPr4nWbD1VDFQazWxdER1JnJlqUHcspn-Op9wHa8e1h8BmioV9/exec';
        try { localStorage.setItem('ial_pod_backup_webapp_url', webUrl); } catch {}
      }
      const res = await fetch(`/api/remote-mysql?_t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
        cache: 'no-store',
        body: JSON.stringify({
          action: 'auto_sync_new_pod',
          sinceId: currentLastId,
          limit: 200,
          chunkSize: 100,
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
        safeToast(`✓ ⚡ Auto-Sync Sheets: បានបន្ថែម ${data.synced_count} កញ្ចប់ Delivered ថ្មី! (#${newMax})`, 'success');
      }
    } catch {
      // background silent
    } finally {
      isSyncingPodRef.current = false;
      setIsSyncingPod(false);
    }
  }, [safeToast]);

  const pushNewDeliveredToSheetsRef = useRef(pushNewDeliveredToSheets);
  pushNewDeliveredToSheetsRef.current = pushNewDeliveredToSheets;

  // Check and sync Server Background Sync state on mount and every 10 seconds
  useEffect(() => {
    let isMounted = true;
    const fetchServerSyncState = async () => {
      try {
        const res = await fetch(`/api/pod-sync-status?_t=${Date.now()}`, { cache: 'no-store' });
        const data = await res.json();
        if (isMounted && data.ok && data.state) {
          // Serverless (Vercel) state resets per instance, so keep the local toggle there
          if (!data.serverless) {
            setIsPodAutoSync(Boolean(data.state.enabled));
            isPodAutoSyncRef.current = Boolean(data.state.enabled);
          }
          if (data.state.lastSyncedId > 0) {
            setLastSyncedPodId(data.state.lastSyncedId);
            lastSyncedPodIdRef.current = data.state.lastSyncedId;
          }
          setIsSyncingPod(Boolean(data.state.isSyncing));
        }
      } catch {}
    };

    fetchServerSyncState();
    const interval = setInterval(fetchServerSyncState, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Toggle Server Background Auto-Sync Sheets (Runs 24/7 on Server)
  const togglePodAutoSync = async () => {
    const next = !isPodAutoSync;
    setIsPodAutoSync(next);
    isPodAutoSyncRef.current = next;
    setPodCountdown(15);
    try {
      localStorage.setItem('ial_pod_auto_sync', String(next));
    } catch {}

    try {
      const res = await fetch('/api/pod-sync-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', enabled: next })
      });
      const data = await res.json();
      if (data.ok && data.state) {
        if (data.state.lastSyncedId > 0) {
          setLastSyncedPodId(data.state.lastSyncedId);
        }
      }
    } catch {}

    if (next) {
      safeToast('✓ បានបើក Server Background Sync (ដំណើរការ 24/7 លើ Server ទោះបិទ Browser ឬប្ដូរ Page ក៏នៅតែ Sync)', 'success');
      // Trigger an immediate sync run on server
      fetch('/api/pod-sync-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger_now' })
      }).catch(() => {});
    } else {
      safeToast('បានបិទ Server Background Sync ទៅកាន់ Google Sheets', 'info');
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

  // Auto-Sync Timer Effect for MySQL Database (Table Data / Stats)
  useEffect(() => {
    if (!isAutoSync) {
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

          setLastSyncedTime(new Date());
          return syncInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoSync, syncInterval]);

  // Dedicated 10s Auto-Sync Timer for Auto-Sync ថ្មីៗ (Push new Delivered items to Google Sheets every 10s)
  useEffect(() => {
    if (!isPodAutoSync) {
      setPodCountdown(10);
      return;
    }

    setPodCountdown(10);

    const timer = setInterval(() => {
      setPodCountdown((prev) => {
        if (prev <= 1) {
          if (isPodAutoSyncRef.current) {
            pushNewDeliveredToSheetsRef.current();
          }
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPodAutoSync]);

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

  // Real-time debounced search for Shipments tab (380ms debounce)
  const isInitialShipmentMountRef = useRef(true);
  useEffect(() => {
    if (activeTab !== 'shipments') return;
    if (isInitialShipmentMountRef.current) {
      isInitialShipmentMountRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate, shipmentLimit, true);
    }, 380);
    return () => clearTimeout(timer);
  }, [shipmentSearch]);

  // Server-filtered explorer records
  const filteredExplorerRecords = useMemo(() => {
    return explorerData?.records || [];
  }, [explorerData]);

  // Row selection (cleared whenever the visible page of data changes)
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<Set<any>>(new Set());
  const [selectedExplorerRows, setSelectedExplorerRows] = useState<Set<number>>(new Set());
  useEffect(() => setSelectedShipmentIds(new Set()), [shipments]);
  useEffect(() => setSelectedExplorerRows(new Set()), [filteredExplorerRecords]);

  const toggleInSet = <T,>(set: Set<T>, key: T) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const selectedShipments = useMemo(
    () => shipments.filter((s) => selectedShipmentIds.has(s.id)),
    [shipments, selectedShipmentIds]
  );
  const selectedExplorerRecords = useMemo(
    () => filteredExplorerRecords.filter((_: any, i: number) => selectedExplorerRows.has(i)),
    [filteredExplorerRecords, selectedExplorerRows]
  );

  const copyRowsAsTsv = (rows: any[]) => {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join('\t'),
      ...rows.map((row) => headers.map((h) => (row[h] === null || row[h] === undefined ? '' : String(row[h]))).join('\t')),
    ];
    copyText(lines.join('\n'));
    safeToast(`បានចម្លង ${rows.length.toLocaleString()} ជួរ`, 'success');
  };

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
    <div className="page-fill space-y-2.5">
      {/* 1. Clean Header Card */}
      {(() => {
        const fmtCount = (v?: number | string) =>
          v ? Number(v).toLocaleString() : (isStatsLoading ? '...' : '-');
        const headerStats = [
          { label: 'Shipments', value: fmtCount(stats?.tableCounts?.shipment_detail), icon: Truck, tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' },
          { label: 'Users', value: fmtCount(stats?.tableCounts?.users), icon: Users, tone: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10' },
          { label: 'Tables', value: stats?.totalTables ? String(stats.totalTables) : (isStatsLoading ? '...' : '-'), icon: Layers, tone: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10' },
        ];
        const pickInterval = (sec: number) => {
          setSyncInterval(sec);
          setCountdown(sec);
          try {
            localStorage.setItem('iale_sync_interval', String(sec));
          } catch (e) {}
          if (isAutoSync) {
            safeToast(`បានកំណត់ Auto-Sync មក ${sec} វិនាទីម្តង`, 'info');
          }
        };
        const syncControl = (
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={toggleAutoSync}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                isAutoSync
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
              title={isAutoSync ? 'ចុចដើម្បីបិទ Auto-Sync' : 'ចុចដើម្បីបើក Auto-Sync'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isAutoSync ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className="select-none">Auto-Sync</span>
              {isAutoSync && (
                <span className="font-mono text-[10px] tabular-nums text-emerald-600 dark:text-emerald-400 w-6 text-right">
                  <CountdownText store={countdownStore} suffix="s" />
                </span>
              )}
            </button>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
            {[10, 30, 60].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => pickInterval(sec)}
                className={`px-1.5 py-1 rounded-md text-[10px] font-mono font-medium transition cursor-pointer ${
                  syncInterval === sec
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>
        );

        return (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
            <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5">
              {/* Brand & Connection (host + latency on hover) */}
              <div
                className="flex items-center gap-2 min-w-0 shrink-0"
                title={`srv1366.hstgr.io / u112951411_iale_api${stats?.durationMs ? ` • ${stats.durationMs}ms` : ''}`}
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Database className="w-3.5 h-3.5" />
                </div>
                <span className="hidden sm:inline font-black text-sm tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                  IALE Tracking
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              </div>

              {/* Tabs (segmented) */}
              <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-700/60 shrink-0">
                <button
                  onClick={() => handleTabChange('shipments')}
                  className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-semibold transition shrink-0 cursor-pointer whitespace-nowrap ${
                    activeTab === 'shipments'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">ការដឹកជញ្ជូន</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${activeTab === 'shipments' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                    {shipmentTotal > 0 ? (shipmentTotal > 9999 ? `${(shipmentTotal / 1000).toFixed(1)}k` : shipmentTotal.toLocaleString()) : '99.6k'}
                  </span>
                </button>

                <button
                  onClick={() => handleTabChange('explorer')}
                  className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-semibold transition shrink-0 cursor-pointer whitespace-nowrap ${
                    activeTab === 'explorer'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">គ្រប់តារាង</span>
                </button>
              </div>

              {/* Desktop Stats (compact chips) */}
              <div className="hidden xl:flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
                {headerStats.map(({ label, value, icon: Icon, tone }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 h-7 pl-1 pr-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 whitespace-nowrap shrink-0"
                    title={label}
                  >
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center ${tone}`}>
                      <Icon className="w-3 h-3" />
                    </span>
                    <b className="text-xs font-bold font-mono tabular-nums text-slate-800 dark:text-slate-100">{value}</b>
                  </span>
                ))}
              </div>

              {/* Controls */}
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                {activeTab === 'shipments' && (
                  <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                    <button
                      type="button"
                      onClick={() => {
                        setViewMode('cards');
                        try { localStorage.setItem('iale_view_mode', 'cards'); } catch(e){}
                      }}
                      className={`p-1.5 rounded-md transition cursor-pointer ${
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
                      className={`p-1.5 rounded-md transition cursor-pointer ${
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

                <div className="hidden md:block">{syncControl}</div>

                <button
                  onClick={() => {
                    fetchStats();
                    if (activeTab === 'shipments') fetchShipments(shipmentPage, shipmentSearch, shipmentStatus);
                    if (activeTab === 'explorer') fetchTableData(selectedTable, explorerPage);
                    if (isPodAutoSyncRef.current) pushNewDeliveredToSheetsRef.current();
                    setLastSyncedTime(new Date());
                    safeToast('បានធ្វើបច្ចុប្បន្នភាពទិន្នន័យ Live!', 'info');
                  }}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-blue-600 transition active:scale-95 cursor-pointer"
                  title="Refresh Live Data ភ្លាមៗ"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isStatsLoading || isShipmentLoading || isExplorerLoading ? 'animate-spin' : ''}`} />
                </button>

                <button
                  onClick={() => setIsHeaderExpanded(!isHeaderExpanded)}
                  className={`xl:hidden p-2 rounded-lg border transition cursor-pointer ${
                    isHeaderExpanded
                      ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  title={isHeaderExpanded ? 'បង្រួមព័ត៌មានលម្អិត' : 'ពង្រីកមើលព័ត៌មានលម្អិត និង Auto-Sync'}
                >
                  {isHeaderExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Collapsible details (below lg) */}
            {isHeaderExpanded && (
              <div className="xl:hidden border-t border-slate-100 dark:border-slate-800 px-3 py-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="md:hidden flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <Clock className="w-3.5 h-3.5 text-emerald-500" />
                    Live Sync
                  </div>
                  {syncControl}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {headerStats.map(({ label, value, icon: Icon, tone }) => (
                    <div key={label} className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="leading-tight min-w-0">
                        <div className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">{label}</div>
                        <div className="text-xs font-bold font-mono tabular-nums text-slate-800 dark:text-slate-100 truncate">{value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 3. TAB CONTENT: SHIPMENTS (99k+) */}
      {activeTab === 'shipments' && (
        <div className="page-fill-body bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-2 sm:p-2.5 space-y-2">
          {/* Controls Bar: Top Search & Actions Row */}
          <div className="space-y-1.5">
            <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-1.5">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar 2xl:flex-1 min-w-0">
              {/* Primary Search Input with dynamic feedback */}
              <div className="relative flex-1 min-w-[160px] sm:min-w-[220px] shrink-0 sm:shrink">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="ស្វែងរក Tracking / ឈ្មោះ... (វាយភ្លាម រកឃើញភ្លាម)"
                  value={shipmentSearch}
                  onChange={(e) => setShipmentSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate)}
                  className="w-full h-8 pl-9 pr-14 text-xs bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:text-white placeholder:text-slate-400 transition"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {isShipmentLoading ? (
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-500 animate-spin mr-1" />
                  ) : shipmentSearch ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShipmentSearch('');
                        fetchShipments(1, '', shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate);
                      }}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                      title="លុបអក្សរស្វែងរក"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Direct Search Action Button */}
              <button
                type="button"
                onClick={() => fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate)}
                disabled={isShipmentLoading}
                className="flex items-center gap-1.5 h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 shrink-0"
                title="ស្វែងរកភ្លាមៗ"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ស្វែងរក</span>
              </button>

              {/* Advanced Filter Trigger Button */}
              <button
                type="button"
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold border transition shrink-0 cursor-pointer active:scale-95 ${
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
                className="flex items-center gap-1.5 h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 shrink-0"
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
                  className="flex items-center gap-1.5 h-8 px-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-750 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 border border-emerald-400/30"
                  title="បើកផ្ទាំងគ្រប់គ្រង Sync ទិន្នន័យ Delivered ទៅ Google Sheets"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-100" />
                  <span className="hidden sm:inline">Sheets</span>
                </button>

                {/* Server Background Auto-Sync Quick Toggle Button */}
                <button
                  type="button"
                  onClick={togglePodAutoSync}
                  className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-bold transition cursor-pointer border shadow-xs active:scale-95 ${
                    isPodAutoSync
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                  title={
                    isPodAutoSync
                      ? '⚡ Server Background Sync កំពុងដំណើរការ ២៤/៧ លើ Server (ចុចដើម្បីបិទ)'
                      : 'ចុចដើម្បីបើក Server Background Sync ទៅកាន់ Google Sheets (ដំណើរការ ២៤/៧ ទោះបិទ Browser ក៏នៅតែ Sync)'
                  }
                >
                  <Zap className={`w-3.5 h-3.5 ${isPodAutoSync ? 'text-amber-500 fill-amber-500' : 'text-slate-400'}`} />
                  <span className="hidden 2xl:inline text-[11px]">Server Sync:</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider font-mono flex items-center gap-1 min-w-[32px] justify-center ${
                      isPodAutoSync
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {isPodAutoSync ? (
                      isSyncingPod ? (
                        <span className="flex items-center gap-1 text-[9px]">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                          <span>Sync</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-200 animate-pulse" />
                          <span>24/7</span>
                        </span>
                      )
                    ) : (
                      'OFF'
                    )}
                  </span>
                </button>
              </div>
            </div>

            {/* Quick Status Chips (Horizontal Scrollable) + result count */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar 2xl:shrink-0">
              {[
                { id: 'Delivered', label: 'Delivered', icon: Check },
                { id: 'ALL', label: 'ទាំងអស់' },
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
                    className={`flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-xs shadow-emerald-600/30'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700/60'
                    }`}
                  >
                    {st.icon && <st.icon className="w-3 h-3" />}
                    <span>{st.label}</span>
                  </button>
                );
              })}
              <span
                className="ml-1 text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap shrink-0"
                title="លទ្ធផល"
              >
                {shipmentTotal.toLocaleString()} កញ្ចប់
              </span>
            </div>
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

            {/* Active Filters Summary Pills (only when extra filters are on) */}
            {(shipmentIssueBy !== 'ALL' || shipmentStartDate || shipmentEndDate) && (
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-slate-700 dark:text-slate-300">តម្រង:</span>
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
            )}
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
                        className="bg-white dark:bg-[#0c1424] border border-slate-200/90 dark:border-slate-800/80 rounded-2xl p-3 shadow-2xs hover:shadow-md hover:border-emerald-500/50 dark:hover:border-emerald-500/40 transition-all flex flex-col justify-between space-y-2 group"
                      >
                        {/* Header: Tracking Number + Status Badge */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono font-black text-[13.5px] text-slate-900 dark:text-white tracking-tight truncate select-all">
                              {s.tracking_number}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(s.tracking_number, 'Tracking')}
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer shrink-0 transition"
                              title="ចុចដើម្បីចម្លង Tracking Number"
                            >
                              {isCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[2.5]" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold border shrink-0 ${
                              isDelivered
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/50'
                                : 'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isDelivered ? 'bg-emerald-500' : 'bg-amber-500'} shrink-0`} />
                            <span>{s.status || 'In Transit'}</span>
                          </span>
                        </div>

                        {/* Body: Recipient & Meta info */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 text-xs">
                          {/* Recipient Name / Phone */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-5 h-5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-200/50 dark:border-emerald-800/40">
                                <User className="w-3 h-3" />
                              </span>
                              <span className="font-bold text-[12.5px] text-slate-800 dark:text-slate-200 truncate" title={s.sign_by}>
                                {s.sign_by || 'មិនបញ្ជាក់ឈ្មោះ'}
                              </span>
                            </div>
                            <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md border border-slate-200/70 dark:border-slate-700/60 shrink-0">
                              #{s.id}
                            </span>
                          </div>

                          {/* Destination / Shipper (if available) */}
                          {(s.destination || s.shipper) && (
                            <div className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400 truncate">
                              {s.destination && (
                                <span className="inline-flex items-center gap-1 truncate font-medium">
                                  <MapPin className="w-3 h-3 text-cyan-600 shrink-0" />
                                  <span className="truncate">{s.destination}</span>
                                </span>
                              )}
                              {s.shipper && !s.destination && (
                                <span className="truncate italic">ផ្ញើដោយ: {s.shipper}</span>
                              )}
                            </div>
                          )}

                          {/* Date & Issue By */}
                          <div className="flex items-center justify-between gap-1.5 pt-0.5 text-[10.5px]">
                            <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium">
                              <Calendar className="w-3 h-3 text-amber-500/90 shrink-0" />
                              <span>{formatDateOnly(s.delivery_on)}</span>
                            </div>
                            {s.issue_by && (
                              <div
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-mono text-[10px] font-semibold border border-blue-200/60 dark:border-blue-800/50 truncate max-w-[125px]"
                                title={`ចេញដោយ: ${s.issue_by}`}
                              >
                                <Truck className="w-3 h-3 text-blue-500 shrink-0" />
                                <span className="truncate">{s.issue_by}</span>
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
            <div className="page-fill-body space-y-1.5">
            {selectedShipments.length > 0 && (
              <GridSelectionBar
                count={selectedShipments.length}
                onCopy={() => copyRowsAsTsv(selectedShipments)}
                onExport={() => handleExportCsv(selectedShipments, 'iale_shipments_selected')}
                onClear={() => setSelectedShipmentIds(new Set())}
              />
            )}
            <div className={`page-fill-scroll ${gridWrap} max-h-[calc(100vh-270px)] min-h-[300px]`}>
              <table className={gridTable}>
                <thead>
                  <tr>
                    <GridHeadGutter
                      compact={isCompactDensity}
                      checked={shipments.length > 0 && selectedShipmentIds.size === shipments.length}
                      indeterminate={selectedShipmentIds.size > 0 && selectedShipmentIds.size < shipments.length}
                      onToggleAll={() =>
                        setSelectedShipmentIds(
                          selectedShipmentIds.size === shipments.length ? new Set() : new Set(shipments.map((s) => s.id))
                        )
                      }
                    />
                    {[
                      { label: 'id', type: 'int8' },
                      { label: 'tracking_number', type: 'text' },
                      { label: 'អ្នកទទួលចុះឈ្មោះ', type: 'text' },
                      { label: 'ថ្ងៃប្រគល់', type: 'date' },
                      { label: 'ចេញដោយ (Issue)', type: 'text' },
                      { label: 'status', type: 'text' },
                    ].map((col) => (
                      <th key={col.label} className={gridTh(isCompactDensity)}>
                        <span className="font-medium">{col.label}</span>
                        <span className={gridType}>{col.type}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isShipmentLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-emerald-500 mb-1.5" />
                        <span className="text-xs">កំពុងទាញយកទិន្នន័យ Shipments...</span>
                      </td>
                    </tr>
                  ) : shipments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400 text-xs">
                        គ្មានទិន្នន័យ Shipments ត្រូវនឹងលក្ខខណ្ឌនេះទេ
                      </td>
                    </tr>
                  ) : (
                    shipments.map((s, rowIdx) => {
                      const isSelected = selectedShipmentIds.has(s.id);
                      return (
                      <tr
                        key={s.id}
                        className={`${gridRow} ${isSelected ? 'bg-emerald-50/70 dark:bg-emerald-500/10' : ''}`}
                      >
                        <GridRowGutter
                          compact={isCompactDensity}
                          selected={isSelected}
                          rowNumber={(shipmentPage - 1) * shipmentLimit + rowIdx + 1}
                          onToggle={() => setSelectedShipmentIds(toggleInSet(selectedShipmentIds, s.id))}
                        />
                        <td className={`${gridTd(isCompactDensity)} font-mono tabular-nums text-slate-500 dark:text-slate-400`}>
                          {s.id}
                        </td>
                        <td className={`${gridTd(isCompactDensity)} font-mono text-slate-900 dark:text-slate-100`}>
                          <button
                            onClick={() => copyToClipboard(s.tracking_number, 'Tracking')}
                            className="flex items-center gap-1.5 group/copy cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400"
                            title="ចុចដើម្បីចម្លង Tracking Number"
                          >
                            <span>{s.tracking_number}</span>
                            <Copy className="w-3 h-3 opacity-0 group-hover/copy:opacity-100 transition text-slate-400" />
                          </button>
                        </td>
                        <td className={`${gridTd(isCompactDensity)} max-w-[220px] truncate text-slate-800 dark:text-slate-200`}>
                          {s.sign_by || <span className="text-slate-400 dark:text-slate-500 italic">NULL</span>}
                        </td>
                        <td
                          className={`${gridTd(isCompactDensity)} font-mono tabular-nums text-slate-600 dark:text-slate-300`}
                          title={s.delivery_on ? `ពេលវេលាពេញលេញ: ${s.delivery_on}` : ''}
                        >
                          {formatDateOnly(s.delivery_on)}
                        </td>
                        <td className={`${gridTd(isCompactDensity)} font-mono text-slate-600 dark:text-slate-300`}>
                          {s.issue_by || <span className="text-slate-400 dark:text-slate-500 italic">NULL</span>}
                        </td>
                        <td className={gridTd(isCompactDensity)}>
                          <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[11px] font-medium ${
                            s.status === 'Delivered'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30'
                              : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'Delivered' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            {s.status || 'In Transit'}
                          </span>
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
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
        <div className="page-fill-body bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-3 space-y-2.5">
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
            <div className="page-fill-body space-y-1.5">
              {selectedExplorerRecords.length > 0 && (
                <GridSelectionBar
                  count={selectedExplorerRecords.length}
                  onCopy={() => copyRowsAsTsv(selectedExplorerRecords)}
                  onExport={() => handleExportCsv(selectedExplorerRecords, `iale_${selectedTable}_selected`)}
                  onClear={() => setSelectedExplorerRows(new Set())}
                />
              )}
              <div className={`page-fill-scroll ${gridWrap} max-h-[calc(100vh-270px)] min-h-[320px]`}>
                <table className={gridTable}>
                  <thead>
                    <tr>
                      <GridHeadGutter
                        compact={isCompactDensity}
                        checked={filteredExplorerRecords.length > 0 && selectedExplorerRows.size === filteredExplorerRecords.length}
                        indeterminate={selectedExplorerRows.size > 0 && selectedExplorerRows.size < filteredExplorerRecords.length}
                        onToggleAll={() =>
                          setSelectedExplorerRows(
                            selectedExplorerRows.size === filteredExplorerRecords.length
                              ? new Set()
                              : new Set(filteredExplorerRecords.map((_: any, i: number) => i))
                          )
                        }
                      />
                      {activeExplorerColumns.map((col) => (
                        <th
                          key={col.name}
                          className={gridTh(isCompactDensity)}
                        >
                          <span className="font-medium">{col.name}</span>
                          <span className={gridType}>{col.type?.split('(')[0]}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {filteredExplorerRecords.length === 0 ? (
                      <tr>
                        <td colSpan={activeExplorerColumns.length + 1} className="py-10 text-center text-slate-400 font-sans text-xs">
                          {explorerClientFilter ? 'មិនមានទិន្នន័យត្រូវនឹងពាក្យរុករកនេះទេ' : 'គ្មានទិន្នន័យក្នុងតារាងនេះទេ'}
                        </td>
                      </tr>
                    ) : (
                      filteredExplorerRecords.map((r, rowIdx) => {
                        const isSelected = selectedExplorerRows.has(rowIdx);
                        return (
                        <tr
                          key={rowIdx}
                          className={`${gridRow} ${isSelected ? 'bg-emerald-50/70 dark:bg-emerald-500/10' : ''}`}
                        >
                          <GridRowGutter
                            compact={isCompactDensity}
                            selected={isSelected}
                            rowNumber={(explorerPage - 1) * explorerLimit + rowIdx + 1}
                            onToggle={() => setSelectedExplorerRows(toggleInSet(selectedExplorerRows, rowIdx))}
                          />
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
                                className={`${gridTd(isCompactDensity)} max-w-[260px] truncate ${
                                  isFirstCol
                                    ? 'tabular-nums text-slate-500 dark:text-slate-400'
                                    : 'text-slate-700 dark:text-slate-200'
                                }`}
                                title={isNull ? '' : (isFormatted ? `${displayVal} (តម្លៃដើម: ${rawStr})` : rawStr)}
                              >
                                {isNull ? (
                                  <span className="text-slate-400 dark:text-slate-500 italic">NULL</span>
                                ) : (
                                  <span
                                    onClick={() => copyToClipboard(displayVal, col.name)}
                                    className="cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400"
                                    title={isFormatted ? `ចុចដើម្បីចម្លង (តម្លៃដើម: ${rawStr})` : 'ចុចដើម្បីចម្លង'}
                                  >
                                    {displayVal}
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
        podCountdown={podCountdown}
        onTogglePodAutoSync={(active) => {
          setIsPodAutoSync(active);
          isPodAutoSyncRef.current = active;
          setPodCountdown(10);
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

