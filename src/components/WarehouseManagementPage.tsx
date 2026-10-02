import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  Truck,
  Search,
  Plus,
  Trash2,
  Edit2,
  Download,
  Calendar,
  Barcode,
  CheckCircle2,
  AlertCircle,
  Copy,
  Camera,
  RefreshCw,
  Sparkles,
  ClipboardList,
  Check,
  ShieldCheck,
  Lock,
  AlertTriangle,
  Mail,
  Clock,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  FileSpreadsheet,
  Maximize2,
  Minimize2,
  Database,
  MapPin,
  DollarSign,
  Volume2,
  VolumeX,
  Code2,
  ExternalLink
} from 'lucide-react';
import { WarehouseScanItem, WarehouseScanType, AuthUser, UserPermission, AppSettings } from '../types';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import {
  canOperateWarehouse,
  canCreateWarehouseScan,
  canEditWarehouseScan,
  canDeleteWarehouseScan,
  getInitialWarehouseScans,
  saveWarehouseScan,
  deleteWarehouseScan,
  subscribeToWarehouseScans,
  syncLocalWarehouseScansToFirestore,
  syncAllWarehouseScansToGoogleSheets,
  lookupTrackingFromDataReport
} from '../services/warehouseScanService';
import { CodeViewerModal, CODE_GS_CONTENT } from './CodeViewerModal';

// Audio feedback for barcode scanning
function playScanBeep() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, audioCtx.currentTime); // C6 tone
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (_) {}
}

function formatCreatedAt(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

// Lazy loaded Barcode Scanner Modal
const BarcodeScannerModal = React.lazy(() =>
  import('./BarcodeScannerModal').then((m) => ({ default: m.BarcodeScannerModal }))
);

interface WarehouseManagementPageProps {
  currentUser?: AuthUser | null;
  permissions?: UserPermission[];
  settings?: AppSettings;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateToDataReport?: () => void;
}

export const WarehouseManagementPage: React.FC<WarehouseManagementPageProps> = ({
  currentUser,
  permissions,
  settings,
  onShowToast
}) => {
  // 1. Data State
  const [scans, setScans] = useState<WarehouseScanItem[]>(() => getInitialWarehouseScans());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<WarehouseScanType>('SCAN_IN');

  // Real-time Firestore subscription & auto-sync local items
  useEffect(() => {
    setIsLoading(true);
    syncLocalWarehouseScansToFirestore().catch(() => {});

    const unsubscribe = subscribeToWarehouseScans((items) => {
      setScans(items);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Permissions
  const canCreate = useMemo(() => canCreateWarehouseScan(currentUser, permissions), [currentUser, permissions]);
  const canEdit = useMemo(() => canEditWarehouseScan(currentUser, permissions), [currentUser, permissions]);
  const canDelete = useMemo(() => canDeleteWarehouseScan(currentUser, permissions), [currentUser, permissions]);
  const canOperate = useMemo(() => canOperateWarehouse(currentUser, permissions), [currentUser, permissions]);

  // 2. Scan Form State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [codAmount, setCodAmount] = useState<string>('');
  const [currency, setCurrency] = useState<'USD' | 'KHR'>('USD');
  const [riderName, setRiderName] = useState<string>('');
  const [deliveryZone, setDeliveryZone] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [scanDate, setScanDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [autoMatched, setAutoMatched] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // 3. Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'THIS_MONTH'>('ALL');
  const [operatorFilter, setOperatorFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'barcode'>('newest');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Modal states
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<WarehouseScanItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);
  const [isBackingUpPg, setIsBackingUpPg] = useState<boolean>(false);
  const [showDeployHelpModal, setShowDeployHelpModal] = useState<boolean>(false);
  const [showCodeViewerModal, setShowCodeViewerModal] = useState<boolean>(false);
  const [isCodeGsCopied, setIsCodeGsCopied] = useState<boolean>(false);

  // Full Screen
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const notify = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (onShowToast) {
      onShowToast(msg, type);
    } else {
      alert(msg);
    }
  };

  const handleCopyCodeGs = () => {
    try {
      navigator.clipboard.writeText(CODE_GS_CONTENT);
      setIsCodeGsCopied(true);
      notify('✓ បានចម្លងកូដ Code.gs ទៅ Clipboard រួចរាល់!', 'success');
      setTimeout(() => setIsCodeGsCopied(false), 3000);
    } catch {
      notify('បរាជ័យក្នុងការចម្លង សូមបើកមើលកូដហើយចម្លងដោយដៃ', 'error');
    }
  };

  // Auto-lookup tracking code when barcode changes
  const handleBarcodeChange = (val: string) => {
    setBarcodeInput(val);
    setFormError(null);
    const clean = sanitizeTrackingCode(val).toUpperCase();
    if (clean.length >= 4) {
      const match = lookupTrackingFromDataReport(clean);
      if (match) {
        if (match.destination) setDestination(match.destination);
        if (match.codAmount !== undefined) setCodAmount(String(match.codAmount));
        if (match.currency) setCurrency(match.currency);
        setAutoMatched(true);
      } else {
        setAutoMatched(false);
      }
    } else {
      setAutoMatched(false);
    }
  };

  const resetFormFields = () => {
    setEditingId(null);
    setBarcodeInput('');
    setDestination('');
    setCodAmount('');
    setRiderName('');
    setDeliveryZone('');
    setRemarks('');
    setAutoMatched(false);
    setFormError(null);
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  };

  const handleEditItem = (item: WarehouseScanItem) => {
    setEditingId(item.id);
    setActiveTab(item.scanType);
    setBarcodeInput(item.barcode);
    setDestination(item.destination || '');
    setCodAmount(item.codAmount !== undefined ? String(item.codAmount) : '');
    setCurrency(item.currency || 'USD');
    setRiderName(item.riderName || '');
    setDeliveryZone(item.deliveryZone || '');
    setRemarks(item.remarks || '');
    setScanDate(item.date);
    setIsFormOpen(true);
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 150);
  };

  // Submit scan form
  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBarcode = sanitizeTrackingCode(barcodeInput).toUpperCase();
    if (!cleanBarcode) {
      setFormError('សូមបញ្ចូល ឬស្កេនលេខ Barcode / Tracking!');
      barcodeInputRef.current?.focus();
      return;
    }

    if (!canCreate && !editingId) {
      notify('អ្នកមិនមានសិទ្ធិបញ្ចូលទិន្នន័យស្កេនថ្មីឡើយ', 'error');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const itemPayload: any = {
        id: editingId || undefined,
        scanType: activeTab,
        barcode: cleanBarcode,
        tracking: cleanBarcode,
        date: scanDate,
        operatorEmail: currentUser?.email || '',
        createdBy: currentUser?.name || currentUser?.email || 'User'
      };

      if (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') {
        itemPayload.destination = destination.trim() || undefined;
      } else if (activeTab === 'OUT_OF_DELIVERY') {
        itemPayload.riderName = riderName.trim() || undefined;
        itemPayload.deliveryZone = deliveryZone.trim() || undefined;
        itemPayload.codAmount = codAmount.trim() ? parseFloat(codAmount) : undefined;
        itemPayload.currency = currency;
        itemPayload.remarks = remarks.trim() || undefined;
      }

      const saved = await saveWarehouseScan(itemPayload);

      if (soundEnabled) {
        playScanBeep();
      }

      const typeLabel =
        activeTab === 'SCAN_IN'
          ? 'ចូលឃ្លាំង (ScanIn)'
          : activeTab === 'SCAN_OUT'
          ? 'ចេញពីឃ្លាំង (ScanOut)'
          : 'ចេញចែកចាយ (Out of Delivery)';

      notify(`✓ បានស្កេន ${typeLabel} ជោគជ័យ៖ ${saved.barcode}`, 'success');
      resetFormFields();
    } catch (err: any) {
      setFormError(err?.message || 'កំហុសពេលរក្សាទុកទិន្នន័យ');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Scan item
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      await deleteWarehouseScan(itemToDelete.id, itemToDelete.barcode, itemToDelete.scanType);
      notify(`✓ បានលុបកំណត់ត្រាស្កេន ${itemToDelete.barcode} ជោគជ័យ!`, 'success');
      if (editingId === itemToDelete.id) {
        resetFormFields();
      }
      setItemToDelete(null);
    } catch (err: any) {
      notify('កំហុសពេលលុប៖ ' + (err?.message || err), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Sync to Google Sheets
  const handleSyncGoogleSheets = async () => {
    if (isSyncingSheets) return;
    setIsSyncingSheets(true);
    try {
      const res = await syncAllWarehouseScansToGoogleSheets(scans, settings?.webAppUrl);
      if (res.success) {
        notify(`✓ បានបញ្ជូនទិន្នន័យ (${res.count} មុខទំនិញ) ទៅ Google Sheets (Scan_In, Scan_Out, Out_Of_Delivery) ជោគជ័យ!`, 'success');
      } else {
        if (res.needsNewDeploy || res.error?.includes('Unknown action') || res.error?.includes('sync_warehouse_scans')) {
          setShowDeployHelpModal(true);
        }
        notify(`បរាជ័យក្នុងការបញ្ជូនទៅ Google Sheets៖ ${res.error || 'Unknown error'}`, 'error');
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes('Unknown action') || msg.includes('sync_warehouse_scans')) {
        setShowDeployHelpModal(true);
      }
      notify(`កំហុសក្នុងការបញ្ជូន៖ ${msg}`, 'error');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Backup to PostgreSQL
  const handleBackupPostgres = async () => {
    if (isBackingUpPg) return;
    setIsBackingUpPg(true);
    try {
      const res = await fetch('/api/backup-postgres', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        notify('✓ បាន Backup ចូល PostgreSQL ជោគជ័យ! (រួមទាំង Warehouse Scans)', 'success');
      } else {
        notify(`បរាជ័យក្នុងការ Backup PostgreSQL៖ ${data.message || 'សូមពិនិត្យមើលសេវា PostgreSQL'}`, 'error');
      }
    } catch (e: any) {
      notify(`កំហុសក្នុងការ Backup៖ ${e?.message || 'Server API Error'}`, 'error');
    } finally {
      setIsBackingUpPg(false);
    }
  };

  // Filter & Search
  const filteredScans = useMemo(() => {
    let list = scans.filter((s) => s.scanType === activeTab);

    // Date Filter
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);

    if (dateFilter === 'TODAY') {
      list = list.filter((s) => s.date === today);
    } else if (dateFilter === 'YESTERDAY') {
      list = list.filter((s) => s.date === yesterday);
    } else if (dateFilter === 'THIS_MONTH') {
      list = list.filter((s) => (s.date || '').startsWith(thisMonth));
    }

    // Operator Filter
    if (operatorFilter !== 'ALL') {
      list = list.filter((s) => (s.operatorEmail || s.createdBy || '') === operatorFilter);
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          (s.barcode || '').toLowerCase().includes(q) ||
          (s.customerName || '').toLowerCase().includes(q) ||
          (s.customerPhone || '').toLowerCase().includes(q) ||
          (s.destination || '').toLowerCase().includes(q) ||
          (s.location || '').toLowerCase().includes(q) ||
          (s.riderName || '').toLowerCase().includes(q) ||
          (s.riderPhone || '').toLowerCase().includes(q) ||
          (s.deliveryZone || '').toLowerCase().includes(q) ||
          (s.remarks || '').toLowerCase().includes(q)
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      if (sortBy === 'newest') {
        const dDiff = (b.date || '').localeCompare(a.date || '');
        if (dDiff !== 0) return dDiff;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      }
      if (sortBy === 'oldest') {
        const dDiff = (a.date || '').localeCompare(b.date || '');
        if (dDiff !== 0) return dDiff;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      }
      if (sortBy === 'barcode') {
        return (a.barcode || '').localeCompare(b.barcode || '');
      }
      return 0;
    });

    return list;
  }, [scans, activeTab, dateFilter, operatorFilter, searchQuery, sortBy]);

  // Statistics
  const todayStr = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => {
    const todayItems = scans.filter((s) => s.date === todayStr);
    return {
      totalToday: todayItems.length,
      scanInToday: todayItems.filter((s) => s.scanType === 'SCAN_IN').length,
      scanOutToday: todayItems.filter((s) => s.scanType === 'SCAN_OUT').length,
      outOfDeliveryToday: todayItems.filter((s) => s.scanType === 'OUT_OF_DELIVERY').length,
      totalOverall: scans.length
    };
  }, [scans, todayStr]);

  // Unique operators for filter
  const operators = useMemo(() => {
    const set = new Set<string>();
    scans.forEach((s) => {
      const email = s.operatorEmail || (s.createdBy?.includes('@') ? s.createdBy : '');
      if (email) set.add(email);
    });
    return Array.from(set);
  }, [scans]);

  // Pagination
  const totalPages = Math.ceil(filteredScans.length / pageSize) || 1;
  const paginatedScans = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredScans.slice(start, start + pageSize);
  }, [filteredScans, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, dateFilter, operatorFilter, searchQuery, sortBy, pageSize]);

  // Export CSV
  const handleExportCSV = () => {
    if (!filteredScans.length) {
      notify('មិនមានទិន្នន័យសម្រាប់ទាញយកឡើយ', 'info');
      return;
    }
    try {
      let headers: string[];
      if (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') {
        headers = ['#', 'Barcode', 'Tracking', 'Destination', 'Date', 'Operator', 'Created At'];
      } else {
        headers = ['#', 'Barcode', 'Tracking', 'Rider Name', 'Delivery Zone', 'COD Amount', 'Currency', 'Date', 'Operator', 'Created At', 'Remarks'];
      }

      const rows = filteredScans.map((s, idx) => {
        if (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') {
          return [
            idx + 1,
            `="${s.barcode}"`,
            `="${s.tracking || s.barcode}"`,
            `"${(s.destination || '').replace(/"/g, '""')}"`,
            s.date,
            `"${s.operatorEmail || s.createdBy || ''}"`,
            `"${s.createdAt}"`
          ].join(',');
        } else {
          return [
            idx + 1,
            `="${s.barcode}"`,
            `="${s.tracking || s.barcode}"`,
            `"${(s.riderName || '').replace(/"/g, '""')}"`,
            `"${(s.deliveryZone || '').replace(/"/g, '""')}"`,
            s.codAmount !== undefined ? s.codAmount : '',
            s.currency || 'USD',
            s.date,
            `"${s.operatorEmail || s.createdBy || ''}"`,
            `"${s.createdAt}"`,
            `"${(s.remarks || '').replace(/"/g, '""')}"`
          ].join(',');
        }
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `warehouse_${activeTab.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      notify('✓ បានទាញយក CSV ជោគជ័យ!', 'success');
    } catch (err: any) {
      notify('បរាជ័យក្នុងការទាញយក CSV៖ ' + err?.message, 'error');
    }
  };

  return (
    <div
      ref={containerRef}
      className={`min-h-full space-y-4 pb-12 transition-all duration-200 ${
        isFullScreen
          ? 'fixed inset-0 z-50 bg-slate-50 dark:bg-[#070d18] p-4 sm:p-6 overflow-y-auto'
          : 'p-2 sm:p-4 max-w-[1700px] mx-auto'
      }`}
    >
      {/* ========================================================================= */}
      {/* 🌟 TOP HEADER WITH TABS & ACTION BUTTONS */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-5 shadow-2xs space-y-3.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Title & Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/25 shrink-0">
              <Boxes className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>គ្រប់គ្រងឃ្លាំង (Warehouse Hub)</span>
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 dark:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-700">
                  {scans.length} កំណត់ត្រា
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                ScanIn (ចូលឃ្លាំង) • ScanOut (ចេញពីឃ្លាំង) • Out of Delivery (ចេញចែកចាយតាម Rider)
              </p>
            </div>
          </div>

          {/* Action buttons (FullScreen, Sync Sheets, Code.gs, Backup PG, CSV) */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Sound toggle button */}
            <button
              type="button"
              onClick={() => setSoundEnabled((prev) => !prev)}
              className={`h-9 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs ${
                soundEnabled
                  ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500'
              }`}
              title={soundEnabled ? 'សំឡេង Beep បើក (ចុចដើម្បីបិទ)' : 'សំឡេង Beep បិទ (ចុចដើម្បីបើក)'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-600" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={toggleFullScreen}
              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              {isFullScreen ? (
                <>
                  <Minimize2 className="w-4 h-4 text-amber-500" />
                  <span className="hidden sm:inline font-bold">បង្រួម</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4 text-slate-500" />
                  <span className="hidden sm:inline font-bold">ពេញអេក្រង់</span>
                </>
              )}
            </button>

            {/* Sync Sheets Button */}
            <button
              type="button"
              onClick={handleSyncGoogleSheets}
              disabled={isSyncingSheets}
              className="h-9 px-3 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-2xs"
              title="បញ្ជូនទិន្នន័យទៅ Google Sheets Tabs: Scan_In, Scan_Out, Out_Of_Delivery"
            >
              {isSyncingSheets ? (
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              )}
              <span className="hidden sm:inline">{isSyncingSheets ? 'កំពុងបញ្ជូន...' : 'Sync Sheets'}</span>
            </button>

            {/* Code.gs Button */}
            <button
              type="button"
              onClick={() => setShowDeployHelpModal(true)}
              className="h-9 px-3 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              title="មើលកូដ Code.gs និងការណែនាំ Deploy"
            >
              <Code2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="hidden sm:inline">Code.gs</span>
            </button>

            {/* Backup to PostgreSQL Button */}
            <button
              type="button"
              onClick={handleBackupPostgres}
              disabled={isBackingUpPg}
              className="h-9 px-3 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Backup ទិន្នន័យចូលក្នុង PostgreSQL Database"
            >
              {isBackingUpPg ? (
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
              ) : (
                <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              )}
              <span className="hidden sm:inline">{isBackingUpPg ? 'កំពុង Backup...' : 'Backup PG'}</span>
            </button>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredScans.length === 0}
              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <Download className="w-4 h-4 text-emerald-500" />
              <span className="hidden sm:inline">ទាញយក CSV</span>
            </button>
          </div>
        </div>

        {/* 🌟 3 OPERATIONS TABS */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 pt-2 gap-2 overflow-x-auto">
          {/* Tab 1: ScanIn */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('SCAN_IN');
              resetFormFields();
            }}
            className={`pb-2.5 px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'SCAN_IN'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <ArrowDownToLine className="w-4 h-4" />
            <span>📥 ScanIn (អីវ៉ាន់ចូលឃ្លាំង)</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
              {scans.filter((s) => s.scanType === 'SCAN_IN').length}
            </span>
          </button>

          {/* Tab 2: ScanOut */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('SCAN_OUT');
              resetFormFields();
            }}
            className={`pb-2.5 px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'SCAN_OUT'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <ArrowUpFromLine className="w-4 h-4" />
            <span>📤 ScanOut (អីវ៉ាន់ចេញពីឃ្លាំង)</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
              {scans.filter((s) => s.scanType === 'SCAN_OUT').length}
            </span>
          </button>

          {/* Tab 3: Out of Delivery */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('OUT_OF_DELIVERY');
              resetFormFields();
            }}
            className={`pb-2.5 px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'OUT_OF_DELIVERY'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>🚚 Out of Delivery (ចេញចែកចាយតាម Rider)</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
              {scans.filter((s) => s.scanType === 'OUT_OF_DELIVERY').length}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📊 SUMMARY STATS CARDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Today Overall */}
        <div className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">ស្កេនសរុបថ្ងៃនេះ</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">
              {stats.totalToday}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">ទូទាំងឃ្លាំង (All operations)</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center text-cyan-600">
            <ClipboardList className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: ScanIn Today */}
        <div className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">📥 ScanIn ថ្ងៃនេះ</p>
            <p className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
              {stats.scanInToday}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">អីវ៉ាន់ចូលស្តុកឃ្លាំង</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600">
            <ArrowDownToLine className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: ScanOut Today */}
        <div className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">📤 ScanOut ថ្ងៃនេះ</p>
            <p className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-300 mt-0.5">
              {stats.scanOutToday}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">អីវ៉ាន់ចេញពីឃ្លាំង</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600">
            <ArrowUpFromLine className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Out of Delivery Today */}
        <div className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">🚚 Out of Delivery ថ្ងៃនេះ</p>
            <p className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-300 mt-0.5">
              {stats.outOfDeliveryToday}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">ចេញចែកចាយតាម Rider</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600">
            <Truck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ⚡ SCANNING & ENTRY FORM */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                activeTab === 'SCAN_IN'
                  ? 'bg-emerald-500'
                  : activeTab === 'SCAN_OUT'
                  ? 'bg-amber-500'
                  : 'bg-blue-500'
              }`}
            />
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
              {editingId
                ? 'កែប្រែកំណត់ត្រាស្កេន'
                : activeTab === 'SCAN_IN'
                ? 'ស្កេនអីវ៉ាន់ចូលឃ្លាំង (ScanIn Form)'
                : activeTab === 'SCAN_OUT'
                ? 'ស្កេនអីវ៉ាន់ចេញពីឃ្លាំង (ScanOut Form)'
                : 'ស្កេនចេញចែកចាយតាម Rider (Out of Delivery Form)'}
            </h2>
            {autoMatched && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                <span>រកឃើញទិន្នន័យក្នុង Data Report</span>
              </span>
            )}
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetFormFields}
              className="text-xs text-slate-500 hover:text-red-500 font-semibold cursor-pointer"
            >
              បោះបង់ការកែប្រែ
            </button>
          )}
        </div>

        {formError && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleScanSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Field 1: Barcode / Tracking input */}
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                លេខ Barcode / Tracking Code <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Barcode className="w-4 h-4" />
                </div>
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => handleBarcodeChange(e.target.value)}
                  placeholder="ស្កេន ឬវាយបញ្ចូលលេខ Barcode..."
                  className="w-full h-10 pl-9 pr-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold focus:ring-2 focus:ring-cyan-500 transition uppercase"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-cyan-600 cursor-pointer"
                  title="បើក Camera ស្កេន"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Field 2: Date */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                កាលបរិច្ឆេទ
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <input
                  type="date"
                  value={scanDate}
                  onChange={(e) => setScanDate(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-cyan-500 transition"
                />
              </div>
            </div>

            {/* Field 3 for ScanIn & ScanOut: Destination */}
            {(activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') && (
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ទីតាំង / ខេត្ត-ក្រុង
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="ទីតាំង ឬខេត្ត-ក្រុង"
                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-cyan-500 transition"
                  />
                </div>
              </div>
            )}

            {/* Fields for Out of Delivery */}
            {activeTab === 'OUT_OF_DELIVERY' && (
              <>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ឈ្មោះ Rider / អ្នកដឹកជញ្ជូន
                  </label>
                  <input
                    type="text"
                    value={riderName}
                    onChange={(e) => setRiderName(e.target.value)}
                    placeholder="ឈ្មោះ Rider..."
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    តំបន់ដឹក / Delivery Zone
                  </label>
                  <input
                    type="text"
                    value={deliveryZone}
                    onChange={(e) => setDeliveryZone(e.target.value)}
                    placeholder="ឧ. Zone A, Chamkarmon, Toul Kork..."
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ទឹកប្រាក់ COD (បើមាន)
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      step="any"
                      value={codAmount}
                      onChange={(e) => setCodAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 transition font-mono"
                    />
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as 'USD' | 'KHR')}
                      className="h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                    >
                      <option value="USD">USD</option>
                      <option value="KHR">KHR</option>
                    </select>
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ចំណាំបន្ថែម (Remarks)
                  </label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="ចំណាំ..."
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
              </>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={resetFormFields}
              className="h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
            >
              សំអាត (Clear)
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !barcodeInput.trim()}
              className={`h-9 px-5 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                activeTab === 'SCAN_IN'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/20'
                  : activeTab === 'SCAN_OUT'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 shadow-amber-500/20'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/20'
              }`}
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>{editingId ? 'កែប្រែទិន្នន័យ' : 'បញ្ជូន / ស្កេន (Enter)'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* ========================================================================= */}
      {/* 🔍 SEARCH & FILTERS BAR */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ស្វែងរកតាម Barcode, ឈ្មោះ, ទូរស័ព្ទ, ទីតាំង, Rider..."
            className="w-full h-9 pl-9 pr-8 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-cyan-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setDateFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
              dateFilter === 'ALL'
                ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            ទាំងអស់
          </button>
          <button
            type="button"
            onClick={() => setDateFilter('TODAY')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
              dateFilter === 'TODAY'
                ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            ថ្ងៃនេះ
          </button>
          <button
            type="button"
            onClick={() => setDateFilter('YESTERDAY')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
              dateFilter === 'YESTERDAY'
                ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            ម្សិលមិញ
          </button>
          <button
            type="button"
            onClick={() => setDateFilter('THIS_MONTH')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
              dateFilter === 'THIS_MONTH'
                ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            ខែនេះ
          </button>
        </div>

        {/* Operator Filter */}
        {operators.length > 0 && (
          <select
            value={operatorFilter}
            onChange={(e) => setOperatorFilter(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:ring-2 focus:ring-cyan-500"
          >
            <option value="ALL">អ្នកស្កេនទាំងអស់</option>
            {operators.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        )}

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:ring-2 focus:ring-cyan-500"
        >
          <option value="newest">ថ្មីបំផុតមុន (Newest)</option>
          <option value="oldest">ចាស់បំផុតមុន (Oldest)</option>
          <option value="barcode">តម្រៀបតាម Barcode</option>
        </select>
      </div>

      {/* ========================================================================= */}
      {/* 📋 DATA TABLE */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3 w-12 text-center">#</th>
                <th className="py-3 px-4">Barcode / Tracking</th>
                {(activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') && (
                  <th className="py-3 px-4">ទីតាំង / ខេត្ត-ក្រុង</th>
                )}
                {activeTab === 'OUT_OF_DELIVERY' && (
                  <>
                    <th className="py-3 px-4">Rider / អ្នកដឹក</th>
                    <th className="py-3 px-4">តំបន់ / Route</th>
                    <th className="py-3 px-4 text-right">COD</th>
                  </>
                )}
                <th className="py-3 px-4">កាលបរិច្ឆេទ & ម៉ោង</th>
                <th className="py-3 px-4">អ្នកស្កេន</th>
                {activeTab === 'OUT_OF_DELIVERY' && <th className="py-3 px-4">ចំណាំ</th>}
                <th className="py-3 px-3 w-20 text-center">សកម្មភាព</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-600" />
                    <span>កំពុងទាញយកទិន្នន័យ...</span>
                  </td>
                </tr>
              ) : paginatedScans.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Boxes className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-semibold text-slate-500 dark:text-slate-400">
                      មិនទាន់មានទិន្នន័យស្កេនក្នុងបញ្ជីនេះឡើយ
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      សូមស្កេន ឬវាយបញ្ចូល Barcode ក្នុង Form ខាងលើដើម្បីបន្ថែមទិន្នន័យ
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedScans.map((item, idx) => {
                  const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                    >
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {globalIdx}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{item.barcode}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(item.barcode);
                              setCopiedId(item.id);
                              setTimeout(() => setCopiedId(null), 1500);
                            }}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 cursor-pointer"
                            title="Copy Barcode"
                          >
                            {copiedId === item.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Destination for ScanIn and ScanOut */}
                      {(activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') && (
                        <td className="py-2.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                          {item.destination || '—'}
                        </td>
                      )}

                      {/* Out of Delivery columns */}
                      {activeTab === 'OUT_OF_DELIVERY' && (
                        <>
                          <td className="py-2.5 px-4">
                            <div className="font-bold text-blue-700 dark:text-blue-300">
                              {item.riderName || '—'}
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            {item.deliveryZone ? (
                              <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                                {item.deliveryZone}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                            {item.codAmount !== undefined ? (
                              item.currency === 'KHR' ? (
                                `${item.codAmount.toLocaleString()} ៛`
                              ) : (
                                `$${item.codAmount.toFixed(2)}`
                              )
                            ) : (
                              '—'
                            )}
                          </td>
                        </>
                      )}

                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                        <div>{item.date}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {formatCreatedAt(item.createdAt).slice(11)}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 text-[11px] truncate max-w-[120px]">
                        {item.operatorEmail || item.createdBy || '—'}
                      </td>
                      {activeTab === 'OUT_OF_DELIVERY' && (
                        <td className="py-2.5 px-4 text-slate-500 text-[11px] truncate max-w-[140px]">
                          {item.remarks || '—'}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleEditItem(item)}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-cyan-600 rounded-lg transition cursor-pointer"
                              title="កែប្រែ"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setItemToDelete(item)}
                              className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-500 hover:text-red-600 rounded-lg transition cursor-pointer"
                              title="លុប"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              ទំព័រ {currentPage} នៃ {totalPages} (សរុប {filteredScans.length} ជួរ)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-sm w-full rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                  លុបកំណត់ត្រាស្កេននេះ?
                </h4>
                <p className="text-xs text-slate-500">សកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 font-mono text-xs space-y-1">
              <div>
                <span className="text-slate-400">Barcode: </span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {itemToDelete.barcode}
                </span>
              </div>
              <div>
                <span className="text-slate-400">ប្រភេទ: </span>
                <span className="font-bold text-cyan-600">{itemToDelete.scanType}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setItemToDelete(null)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                បោះបង់
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isDeleting ? 'កំពុងលុប...' : 'លុបទិន្នន័យ'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {isScannerOpen && (
        <React.Suspense fallback={null}>
          <BarcodeScannerModal
            isOpen={isScannerOpen}
            onClose={() => setIsScannerOpen(false)}
            onScanSuccess={(code) => {
              setIsScannerOpen(false);
              handleBarcodeChange(code);
            }}
          />
        </React.Suspense>
      )}

      {/* CodeViewer Modal */}
      <CodeViewerModal
        isOpen={showCodeViewerModal}
        onClose={() => setShowCodeViewerModal(false)}
      />

      {/* Google Apps Script Deploy New Version Guide Modal */}
      {showDeployHelpModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-xl w-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-amber-200/60 dark:border-amber-900/40 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    តម្រូវឱ្យ Deploy Version ថ្មីក្នុង Google Apps Script
                  </h3>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                    ដើម្បីទទួល action: sync_warehouse_scans និង Tabs ថ្មី (Scan_In, Scan_Out, Out_Of_Delivery)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeployHelpModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm">
              <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs leading-relaxed">
                <strong>មូលហេតុ៖</strong> Google Sheets Web App របស់អ្នកកំពុងដំណើរការ Version ចាស់ (មិនទាន់មានមុខងារ sync_warehouse_scans សម្រាប់ Tab ថ្មី Scan_In, Scan_Out, Out_Of_Delivery ឡើយ)។ លោកអ្នកគ្រាន់តែ Copy Code.gs ទៅ Deploy Version ថ្មីតែម្ដងគត់។
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 text-xs sm:text-sm">
                  <span>📌 ជំហានអនុវត្តងាយៗ (៤ ជំហាន)៖</span>
                </h4>

                {/* Step 1 */}
                <div className="flex gap-3 items-start p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    1
                  </span>
                  <div className="flex-1 space-y-2">
                    <p className="font-bold text-slate-800 dark:text-slate-200">
                      ចម្លងកូដ Code.gs ថ្មីចុងក្រោយ
                    </p>
                    <button
                      type="button"
                      onClick={handleCopyCodeGs}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                    >
                      {isCodeGsCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>✓ បានចម្លង Code.gs រួចរាល់!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>ចុចទីនេះដើម្បី Copy Code.gs ភ្លាមៗ</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-3 items-start p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="w-6 h-6 rounded-full bg-slate-400 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-200">
                      បើក Google Sheets
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                      ចូលទៅកាន់ Google Sheets របស់អ្នក &gt; ចុចលើ Menu <strong>Extensions (ផ្នែកបន្ថែម)</strong> &gt; ជ្រើសរើស <strong>Apps Script</strong>។
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-3 items-start p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="w-6 h-6 rounded-full bg-slate-400 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-slate-200">
                      បិទភ្ជាប់ (Paste) កូដថ្មីចូល និង Save
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                      ចុច <strong>Ctrl + A</strong> លើផ្ទាំងកូដចាស់ក្នុង Code.gs រួចចុច <strong>Ctrl + V</strong> (Paste) កូដថ្មីចូល ហើយចុចប៊ូតុង <strong>Save (រូបថាស 💾)</strong>។
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex gap-3 items-start p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                    4
                  </span>
                  <div>
                    <p className="font-bold text-emerald-800 dark:text-emerald-300">
                      Deploy ទៅជា Version ថ្មី (New version - សំខាន់បំផុត ⚠️)
                    </p>
                    <p className="text-slate-600 dark:text-slate-300 text-xs mt-0.5 leading-relaxed">
                      ចុចប៊ូតុង <strong>Deploy (ដាក់ពង្រាយ)</strong> ខាងលើស្ដាំ &gt; ជ្រើស <strong>Manage deployments (គ្រប់គ្រងការដាក់ពង្រាយ)</strong> &gt; ចុចលើ <strong>រូបខ្មៅដៃ (Edit)</strong> &gt; ត្រង់ Version ប្តូរទៅ <strong>New version (កំណែថ្មី)</strong> &gt; ចុច <strong>Deploy (ដាក់ពង្រាយ)</strong>។
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCodeViewerModal(true);
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5 text-indigo-500" />
                <span>បើកផ្ទាំងមើលកូដ (Code Viewer)</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeployHelpModal(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                >
                  បិទ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeployHelpModal(false);
                    handleSyncGoogleSheets();
                  }}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>ខ្ញុំបាន Deploy រួចរាល់ (សាកល្បង Sync)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
