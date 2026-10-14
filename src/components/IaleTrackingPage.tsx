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
  Terminal,
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
  X
} from 'lucide-react';
import { AuthUser } from '../types';

interface IaleTrackingPageProps {
  currentUser?: AuthUser | null;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const IaleTrackingPage: React.FC<IaleTrackingPageProps> = ({
  currentUser,
  onShowToast
}) => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'shipments' | 'explorer' | 'terminal'>('shipments');

  // Space-saving options
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const [isCompactDensity, setIsCompactDensity] = useState(true);
  const [hideNullColumns, setHideNullColumns] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

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

  // Table Explorer state
  const [selectedTable, setSelectedTable] = useState('shipment_detail');
  const [explorerData, setExplorerData] = useState<{ columns: any[]; records: any[]; total: number } | null>(null);
  const [explorerPage, setExplorerPage] = useState(1);
  const [explorerLimit, setExplorerLimit] = useState(50);
  const [explorerClientFilter, setExplorerClientFilter] = useState('');
  const [isExplorerLoading, setIsExplorerLoading] = useState(false);
  const [pageJumpInput, setPageJumpInput] = useState('');

  // Custom SQL Terminal state
  const [customSql, setCustomSql] = useState('SELECT id, tracking_number, status, delivery_on, sign_by FROM shipment_detail ORDER BY id DESC LIMIT 20;');
  const [sqlResult, setSqlResult] = useState<any[] | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [isSqlLoading, setIsSqlLoading] = useState(false);

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

  // 3. Fetch Shipments
  const fetchShipments = useCallback(async (
    page = 1,
    search = shipmentSearch,
    status = shipmentStatus,
    issueBy = shipmentIssueBy,
    startDate = shipmentStartDate,
    endDate = shipmentEndDate,
    limit = shipmentLimit,
    silent = false
  ) => {
    if (!silent) setIsShipmentLoading(true);
    try {
      const trimmedSearch = typeof search === 'string' ? search.trim() : '';
      const params = new URLSearchParams({
        action: 'shipments',
        page: page.toString(),
        limit: limit.toString(),
        search: trimmedSearch,
        status: status === 'ALL' ? '' : (status || 'Delivered'),
        issueBy: issueBy === 'ALL' ? '' : (issueBy || ''),
        startDate: startDate || '',
        endDate: endDate || ''
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
  }, [shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate, shipmentLimit, safeToast]);

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

  // 5. Execute Custom SQL
  const handleExecuteSql = async () => {
    if (!customSql.trim()) return;
    setIsSqlLoading(true);
    setSqlError(null);
    try {
      const res = await fetch('/api/remote-mysql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: customSql.trim() })
      });
      const data = await res.json();
      if (data.ok) {
        setSqlResult(data.data || []);
        safeToast(`ដំណើរការ SQL ជោគជ័យ! (${(data.data || []).length} ជួរដេក)`, 'success');
      } else {
        setSqlError(data.message);
        safeToast(data.message, 'error');
      }
    } catch (e: any) {
      setSqlError(e.message);
      safeToast(e.message, 'error');
    } finally {
      setIsSqlLoading(false);
    }
  };

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

  // Initial Load
  useEffect(() => {
    fetchStats();
    fetchShipments(1, '', 'Delivered', 'ALL', '', '');
    fetchIssueByList();
  }, [fetchStats, fetchShipments, fetchIssueByList]);

  // Toggle Auto-Sync
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

  // Auto-Sync Timer Effect
  useEffect(() => {
    if (!isAutoSync) {
      setCountdown(syncInterval);
      return;
    }

    setCountdown(syncInterval);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Trigger silent background sync (no disruptive spinners)
          fetchStats(true);
          if (activeTabRef.current === 'shipments') {
            fetchShipments(
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
            fetchTableData(selectedTableRef.current, explorerPageRef.current, explorerLimitRef.current, explorerClientFilterRef.current, true);
          }
          setLastSyncedTime(new Date());
          return syncInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoSync, syncInterval, fetchStats, fetchShipments, fetchTableData]);

  // Switch tabs loader
  const handleTabChange = (tab: 'shipments' | 'explorer' | 'terminal') => {
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

  return (
    <div className="space-y-2.5">
      {/* 1. Ultra Space-Saving Compact Top Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Brand & Connection Status */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                  IALE Tracking System
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
                {stats?.durationMs && (
                  <span className="text-[11px] font-mono text-emerald-400/90 flex items-center gap-0.5" title="Latency">
                    <Zap className="w-3 h-3 text-amber-400" />
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

          {/* Quick Metrics (Pills / Compact Badges) */}
          <div className="flex items-center gap-1.5 flex-wrap">

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700/60 text-xs">
              <Truck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] text-slate-400">Shipments:</span>
              <span className="font-bold text-emerald-300 font-mono">
                {stats?.tableCounts?.shipment_detail ? Number(stats.tableCounts.shipment_detail).toLocaleString() : '99,602'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700/60 text-xs hidden md:flex">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] text-slate-400">Users:</span>
              <span className="font-bold text-amber-300 font-mono">
                {stats?.tableCounts?.users ? Number(stats.tableCounts.users).toLocaleString() : '92'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700/60 text-xs hidden lg:flex">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[11px] text-slate-400">Tables:</span>
              <span className="font-bold text-purple-300 font-mono">
                {stats?.totalTables || '20'}
              </span>
            </div>

            {/* Auto-Sync Switch & Interval Selection */}
            <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/70 rounded-lg p-1 text-xs">
              {/* Toggle Switch */}
              <button
                type="button"
                onClick={toggleAutoSync}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md font-medium text-[11px] transition-all cursor-pointer ${
                  isAutoSync
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/60'
                }`}
                title={isAutoSync ? 'ចុចដើម្បីបិទ Auto-Sync' : 'ចុចដើម្បីបើក Auto-Sync (10s / 30s / 60s)'}
              >
                <span className={`w-2 h-2 rounded-full transition-all ${isAutoSync ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span className="font-semibold select-none">Auto-Sync</span>
                {isAutoSync && (
                  <span className="font-mono text-[10px] text-emerald-300 font-bold bg-emerald-950/80 px-1 rounded border border-emerald-500/30">
                    {countdown}s
                  </span>
                )}
              </button>

              {/* Interval Buttons */}
              <div className="flex items-center bg-slate-900/80 rounded border border-slate-700/80 p-0.5 text-[10px] font-mono">
                {[10, 30, 60].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => {
                      setSyncInterval(sec);
                      setCountdown(sec);
                      try {
                        localStorage.setItem('iale_sync_interval', String(sec));
                      } catch (e) {
                        // ignore
                      }
                      if (isAutoSync) {
                        safeToast(`បានកំណត់ Auto-Sync មក ${sec} វិនាទីម្តង`, 'info');
                      }
                    }}
                    className={`px-1.5 py-0.5 rounded transition font-medium cursor-pointer ${
                      syncInterval === sec
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                    title={`កំណត់ធ្វើបច្ចុប្បន្នភាពរៀងរាល់ ${sec} វិនាទី`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            {/* Last Synced Indicator */}
            {lastSyncedTime && (
              <span className="text-[10px] text-slate-400 font-mono hidden xl:flex items-center gap-1 px-1.5 py-1 rounded bg-slate-800/60 border border-slate-700/40" title="ម៉ោង Sync ចុងក្រោយ">
                <Clock className="w-3 h-3 text-slate-400" />
                {lastSyncedTime.toLocaleTimeString()}
              </span>
            )}

            {/* Refresh Live Button */}
            <button
              onClick={() => {
                fetchStats();
                if (activeTab === 'shipments') fetchShipments(shipmentPage, shipmentSearch, shipmentStatus);
                if (activeTab === 'explorer') fetchTableData(selectedTable, explorerPage);
                setLastSyncedTime(new Date());
                safeToast('បានធ្វើបច្ចុប្បន្នភាពទិន្នន័យ Live!', 'info');
              }}
              className="p-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-500/40 transition active:scale-95 cursor-pointer"
              title="Refresh Live Data ភ្លាមៗ"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isStatsLoading || isShipmentLoading || isExplorerLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* Expand / Collapse stats button */}
            <button
              onClick={() => setIsHeaderExpanded(!isHeaderExpanded)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
              title={isHeaderExpanded ? 'បង្រួមព័ត៌មានលម្អិត' : 'ពង្រីកមើលព័ត៌មានលម្អិត'}
            >
              {isHeaderExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Collapsible detailed cards for extra clarity when requested */}
        {isHeaderExpanded && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2.5 mt-2.5 border-t border-slate-800 animate-in fade-in slide-in-from-top-1 duration-200">

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-2.5">
              <div className="text-[11px] text-emerald-300 flex items-center justify-between">
                <span>ការដឹកជញ្ជូន (Shipments)</span>
                <Truck className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-base font-bold text-emerald-300 font-mono mt-0.5">
                {stats?.tableCounts?.shipment_detail ? Number(stats.tableCounts.shipment_detail).toLocaleString() : '99,602'}
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-2.5">
              <div className="text-[11px] text-amber-300 flex items-center justify-between">
                <span>គណនីបុគ្គលិក (Users)</span>
                <Users className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-base font-bold text-amber-300 font-mono mt-0.5">
                {stats?.tableCounts?.users ? Number(stats.tableCounts.users).toLocaleString() : '92'}
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-2.5">
              <div className="text-[11px] text-purple-300 flex items-center justify-between">
                <span>Database Tables</span>
                <Layers className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="text-base font-bold text-purple-300 font-mono mt-0.5">
                {stats?.totalTables || '20'} Tables
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Sleek Unified Tab Bar & View Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">

          <button
            onClick={() => handleTabChange('shipments')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
              activeTab === 'shipments'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>ការដឹកជញ្ជូន (Shipments)</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${activeTab === 'shipments' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
              {shipmentTotal > 0 ? shipmentTotal.toLocaleString() : '99.6k'}
            </span>
          </button>

          <button
            onClick={() => handleTabChange('explorer')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
              activeTab === 'explorer'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>មើលគ្រប់តារាង (Explorer)</span>
          </button>

          <button
            onClick={() => handleTabChange('terminal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
              activeTab === 'terminal'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>SQL Runner</span>
          </button>
        </div>

        {/* View density / layout switches */}
        <div className="flex items-center gap-1.5 ml-auto text-xs">
          <button
            onClick={() => setIsCompactDensity(!isCompactDensity)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition ${
              isCompactDensity
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}
            title="ប្ដូរចន្លោះជួរដេក (Density)"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>{isCompactDensity ? 'ចន្លោះបង្រួម' : 'ចន្លោះធម្មតា'}</span>
          </button>
        </div>
      </div>



      {/* 4. TAB CONTENT: SHIPMENTS (99k+) */}
      {activeTab === 'shipments' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-3 space-y-2.5">
          {/* Controls Bar */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[320px]">
                {/* 1. Search Tracking / Contact */}
                <div className="relative min-w-[180px] max-w-xs flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ស្វែងរក Tracking / ឈ្មោះ..."
                    value={shipmentSearch}
                    onChange={(e) => setShipmentSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate)}
                    className="w-full pl-8 pr-7 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white"
                  />
                  {shipmentSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setShipmentSearch('');
                        fetchShipments(1, '', shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* 2. Status: Default Delivered */}
                <div className="relative">
                  <select
                    value={shipmentStatus}
                    onChange={(e) => {
                      const st = e.target.value;
                      setShipmentStatus(st);
                      fetchShipments(1, shipmentSearch, st, shipmentIssueBy, shipmentStartDate, shipmentEndDate);
                    }}
                    className="px-2.5 py-1 text-xs bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold cursor-pointer"
                    title="Status Filter (Delivered ជា Default)"
                  >
                    <option value="Delivered">Status: Delivered (បានប្រគល់)</option>
                    <option value="ALL">Status ទាំងអស់ (All)</option>
                    <option value="Pickup">Pickup</option>
                    <option value="In Transit">In Transit</option>
                    <option value="Up Left Phnom Penh">Up Left Phnom Penh</option>
                    <option value="Arrived Hub">Arrived Hub</option>
                  </select>
                </div>

                {/* 3. Issue By (ចេញដោយ) */}
                <div className="relative">
                  <select
                    value={shipmentIssueBy}
                    onChange={(e) => {
                      const ib = e.target.value;
                      setShipmentIssueBy(ib);
                      fetchShipments(1, shipmentSearch, shipmentStatus, ib, shipmentStartDate, shipmentEndDate);
                    }}
                    className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:text-white font-medium max-w-[200px] truncate cursor-pointer"
                    title="Filter តាមអ្នកចេញទំនិញ (ចេញដោយ / Issue)"
                  >
                    <option value="ALL">ចេញដោយ (Issue): ទាំងអស់</option>
                    {issueByOptions.map((opt) => (
                      <option key={opt.issue_by} value={opt.issue_by}>
                        {opt.issue_by} ({Number(opt.count).toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Delivery Date Range (ថ្ងៃប្រគល់) */}
                <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 text-xs text-slate-600 dark:text-slate-300">
                  <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hidden sm:inline">ថ្ងៃប្រគល់:</span>
                  <input
                    type="date"
                    value={shipmentStartDate}
                    onChange={(e) => {
                      const sd = e.target.value;
                      setShipmentStartDate(sd);
                      fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, sd, shipmentEndDate);
                    }}
                    className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none py-0.5 cursor-pointer"
                    title="ចាប់ពីថ្ងៃប្រគល់ (Start Date)"
                  />
                  <span className="text-slate-400 text-[10px]">ដល់</span>
                  <input
                    type="date"
                    value={shipmentEndDate}
                    onChange={(e) => {
                      const ed = e.target.value;
                      setShipmentEndDate(ed);
                      fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, ed);
                    }}
                    className="bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none py-0.5 cursor-pointer"
                    title="ដល់ថ្ងៃប្រគល់ (End Date)"
                  />
                  {(shipmentStartDate || shipmentEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setShipmentStartDate('');
                        setShipmentEndDate('');
                        fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, '', '');
                      }}
                      className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-red-500 transition ml-0.5 cursor-pointer"
                      title="លុបចោលតម្រងកាលបរិច្ឆេទ"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Search Button */}
                <button
                  type="button"
                  onClick={() => fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate)}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition active:scale-95 shadow-xs cursor-pointer flex items-center gap-1"
                >
                  <Filter className="w-3 h-3" />
                  <span>ស្វែងរក</span>
                </button>

                {/* Reset Filters button if any active */}
                {(shipmentSearch || shipmentIssueBy !== 'ALL' || shipmentStartDate || shipmentEndDate || shipmentStatus !== 'Delivered') && (
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
                    className="px-2 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    title="កំណត់ Filter ឡើងវិញទៅដើម"
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* Right side controls: limit & Export */}
              <div className="flex items-center gap-1.5 ml-auto">
                <select
                  value={shipmentLimit}
                  onChange={(e) => {
                    const lim = Number(e.target.value);
                    setShipmentLimit(lim);
                    fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate, lim);
                  }}
                  className="px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  <option value={25}>25 / ទំព័រ</option>
                  <option value={50}>50 / ទំព័រ</option>
                  <option value={100}>100 / ទំព័រ</option>
                  <option value={200}>200 / ទំព័រ</option>
                </select>

                <button
                  type="button"
                  onClick={handleExportFilteredShipments}
                  disabled={isExporting || isShipmentLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
                  title={`ទាញយកទិន្នន័យ CSV តាម Filter បច្ចុប្បន្ន (${shipmentTotal.toLocaleString()} កញ្ចប់)`}
                >
                  {isExporting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>{isExporting ? 'កំពុង Export...' : 'Export'}</span>
                </button>
              </div>
            </div>

            {/* Active filter summary pill */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-slate-700 dark:text-slate-300">លទ្ធផល:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {shipmentTotal.toLocaleString()} កញ្ចប់
                </span>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[10.5px] font-semibold border border-emerald-200 dark:border-emerald-900">
                  Status: {shipmentStatus === 'ALL' ? 'ទាំងអស់' : shipmentStatus}
                </span>
                {shipmentIssueBy !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-[10.5px] font-semibold border border-blue-200 dark:border-blue-900">
                    ចេញដោយ: {shipmentIssueBy}
                  </span>
                )}
                {(shipmentStartDate || shipmentEndDate) && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-[10.5px] font-semibold border border-amber-200 dark:border-amber-900">
                    ថ្ងៃប្រគល់: {shipmentStartDate || 'ដំបូង'} ដល់ {shipmentEndDate || 'បច្ចុប្បន្ន'}
                  </span>
                )}
                {shipmentSearch && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10.5px] font-medium">
                    ស្វែងរក: "{shipmentSearch}"
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 max-h-[calc(100vh-270px)] min-h-[300px]">
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
                          className="hover:underline flex items-center gap-1 group"
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

          {/* Compact Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1">
            <div className="text-[11px]">
              បង្ហាញ {shipments.length} នៃសរុប <strong>{shipmentTotal.toLocaleString()}</strong> កញ្ចប់
            </div>
            <div className="flex items-center gap-1.5">
              <button
                disabled={shipmentPage <= 1 || isShipmentLoading}
                onClick={() => fetchShipments(1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate)}
                className="p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                title="ទំព័រដំបូង"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={shipmentPage <= 1 || isShipmentLoading}
                onClick={() => fetchShipments(shipmentPage - 1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate)}
                className="p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                title="ទំព័រមុន"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 font-mono">
                {shipmentPage} / {totalShipmentPages}
              </span>

              <button
                disabled={shipmentPage >= totalShipmentPages || isShipmentLoading}
                onClick={() => fetchShipments(shipmentPage + 1, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate)}
                className="p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                title="ទំព័របន្ទាប់"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={shipmentPage >= totalShipmentPages || isShipmentLoading}
                onClick={() => fetchShipments(totalShipmentPages, shipmentSearch, shipmentStatus, shipmentIssueBy, shipmentStartDate, shipmentEndDate)}
                className="p-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                title="ទំព័រចុងក្រោយ"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB CONTENT: TABLE EXPLORER (The view in User's screenshot) */}
      {activeTab === 'explorer' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-3 space-y-2.5">
          {/* Top Controls Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left: Table selector & quick filter */}
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[300px]">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">តារាង:</span>
                <select
                  value={selectedTable}
                  onChange={(e) => {
                    setSelectedTable(e.target.value);
                    fetchTableData(e.target.value, 1);
                  }}
                  className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-white font-bold"
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
              <div className="relative min-w-[170px] max-w-xs">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="ស្វែងរកក្នុងតារាងទាំងមូល..."
                  value={explorerClientFilter}
                  onChange={(e) => setExplorerClientFilter(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-white"
                />
              </div>

              {/* Hide Null Columns Toggle */}
              <button
                onClick={() => setHideNullColumns(!hideNullColumns)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition ${
                  hideNullColumns
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
                title="លាក់ Columns ណាដែលគ្មានទិន្នន័យ (null ទាំងអស់) ក្នុងទំព័រនេះ ដើម្បីចំណេញទទឹង"
              >
                {hideNullColumns ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{hideNullColumns ? 'បានលាក់ Column ទទេ' : 'លាក់ Column ទទេ'}</span>
              </button>
            </div>

            {/* Right: Page limits & Export */}
            <div className="flex items-center gap-2">
              <select
                value={explorerLimit}
                onChange={(e) => {
                  const lim = Number(e.target.value);
                  setExplorerLimit(lim);
                  fetchTableData(selectedTable, 1, lim);
                }}
                className="px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300"
              >
                <option value={25}>25 / ទំព័រ</option>
                <option value={50}>50 / ទំព័រ</option>
                <option value={100}>100 / ទំព័រ</option>
              </select>

              {explorerData && (
                <button
                  onClick={() => handleExportCsv(explorerData.records, `Table_${selectedTable}`)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium transition"
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
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 max-h-[calc(100vh-270px)] min-h-[320px]">
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

      {/* 6. TAB CONTENT: SQL RUNNER */}
      {activeTab === 'terminal' && (
        <div className="bg-slate-900 text-slate-100 border border-slate-800 rounded-xl shadow-md p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs font-bold text-white font-mono">SQL Query Runner (MariaDB 11.8)</h2>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Database: u112951411_iale_api</span>
          </div>

          <div className="space-y-1.5">
            <textarea
              rows={2}
              value={customSql}
              onChange={(e) => setCustomSql(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleExecuteSql();
                }
              }}
              placeholder="វាយបញ្ចូលសំណួរ SQL (ចុច Ctrl + Enter ដើម្បីដំណើរការ)..."
              className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-emerald-400 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-400 flex-wrap">
                <span>គំរូ SQL:</span>
                <button
                  onClick={() => setCustomSql('SELECT id, tracking_number, status, delivery_on FROM shipment_detail ORDER BY id DESC LIMIT 20;')}
                  className="text-blue-400 hover:underline bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px]"
                >
                  Shipments ចុងក្រោយ
                </button>
                <button
                  onClick={() => setCustomSql('SELECT id, booking_date, pickup_address, booking_contact, booking_status FROM booking ORDER BY id DESC LIMIT 20;')}
                  className="text-blue-400 hover:underline bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px]"
                >
                  Bookings ចុងក្រោយ
                </button>
                <button
                  onClick={() => setCustomSql('SELECT id, first_name, last_name, phone, role FROM users LIMIT 20;')}
                  className="text-blue-400 hover:underline bg-slate-800/80 px-1.5 py-0.5 rounded text-[10px]"
                >
                  Users 20
                </button>
              </div>

              <button
                onClick={handleExecuteSql}
                disabled={isSqlLoading}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs transition flex items-center gap-1.5"
                title="Ctrl + Enter"
              >
                {isSqlLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <PlayIcon className="w-3 h-3" />}
                <span>Run SQL (Ctrl+Enter)</span>
              </button>
            </div>
          </div>

          {sqlError && (
            <div className="p-2 bg-rose-950/50 border border-rose-800 rounded-lg text-rose-300 text-xs font-mono">
              ❌ Error: {sqlError}
            </div>
          )}

          {sqlResult && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs text-emerald-400 font-mono">
                <span>✓ ទទួលបាន {sqlResult.length} កំណត់ត្រា (Rows)</span>
                {sqlResult.length > 0 && (
                  <button
                    onClick={() => handleExportCsv(sqlResult, 'SQL_Result')}
                    className="text-[10px] text-slate-300 hover:text-white bg-slate-800 px-2 py-0.5 rounded transition flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    <span>Export CSV</span>
                  </button>
                )}
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-800 max-h-[300px]">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead className="bg-slate-950 text-slate-400 sticky top-0">
                    <tr>
                      {sqlResult.length > 0 && Object.keys(sqlResult[0]).map((k) => (
                        <th key={k} className="p-1.5 border-b border-slate-800 text-[11px] whitespace-nowrap">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-[11px]">
                    {sqlResult.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-800/40">
                        {Object.entries(r).map(([k, v]: [string, any], vi) => {
                          const isNull = v === null || v === undefined || v === '';
                          const formatted = isNull ? '-' : formatDateTimeValue(v, k);
                          return (
                            <td key={vi} className="p-1.5 text-slate-300 whitespace-nowrap max-w-[200px] truncate" title={isNull ? '' : String(v)}>
                              {isNull ? <span className="text-slate-600">-</span> : formatted}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function PlayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

export default IaleTrackingPage;

