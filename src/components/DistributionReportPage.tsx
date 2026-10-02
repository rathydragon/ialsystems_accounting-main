import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Truck,
  Search,
  Plus,
  Trash2,
  Edit2,
  Download,
  Calendar,
  User,
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
  FileSpreadsheet
} from 'lucide-react';
import { DistributionReportItem, AuthUser, UserPermission } from '../types';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import {
  canOperateDistributionActions,
  canCreateDistributionReport,
  canEditDistributionReport,
  canDeleteDistributionReport,
  getInitialDistributionReports,
  saveDistributionReport,
  deleteDistributionReport,
  subscribeToDistributionReports
} from '../services/distributionReportService';
import { getCachedDataReport } from '../services/dataReportService';

// Format ISO date string into readable YYYY-MM-DD HH:mm
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

// Code-split BarcodeScannerModal
const BarcodeScannerModal = React.lazy(() =>
  import('./BarcodeScannerModal').then((m) => ({ default: m.BarcodeScannerModal }))
);

interface DistributionReportPageProps {
  currentUser?: AuthUser | null;
  permissions?: UserPermission[];
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateToDataReport?: () => void;
}

export const DistributionReportPage: React.FC<DistributionReportPageProps> = ({
  currentUser,
  permissions,
  onShowToast
}) => {
  // 1. Data State
  const [reports, setReports] = useState<DistributionReportItem[]>(() => getInitialDistributionReports());
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Cached Google Sheet Data Report rows for instant barcode info lookup & DELIVERED status check
  const [cachedSheetRows] = useState(() => {
    try {
      return getCachedDataReport().rows || [];
    } catch {
      return [];
    }
  });

  // Real-time Firestore subscription
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeToDistributionReports((items) => {
      setReports(items);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Granular action permissions (Create, Edit, Delete)
  const canCreate = useMemo(() => {
    return canCreateDistributionReport(currentUser, permissions);
  }, [currentUser, permissions]);

  const canEdit = useMemo(() => {
    return canEditDistributionReport(currentUser, permissions);
  }, [currentUser, permissions]);

  const canDelete = useMemo(() => {
    return canDeleteDistributionReport(currentUser, permissions);
  }, [currentUser, permissions]);

  const canOperateActions = useMemo(() => {
    return canOperateDistributionActions(currentUser, permissions);
  }, [currentUser, permissions]);

  // 2. Form State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [barcode, setBarcode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  // 3. Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'THIS_MONTH'>('ALL');
  const [operatorFilter, setOperatorFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'barcode' | 'name'>('newest');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Toast / Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<DistributionReportItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const notify = useCallback(
    (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
      if (onShowToast) {
        onShowToast(msg, type);
      } else {
        alert(msg);
      }
    },
    [onShowToast]
  );

  // Lookup barcode details in cached Data Report rows
  const matchedDataReportRow = useMemo(() => {
    if (!barcode.trim() || !cachedSheetRows.length) return null;
    const clean = sanitizeTrackingCode(barcode).toUpperCase();
    return cachedSheetRows.find((row) => {
      return Object.values(row).some((val) => {
        if (!val) return false;
        return String(val).trim().toUpperCase() === clean;
      });
    }) || null;
  }, [barcode, cachedSheetRows]);

  // Extract display info from matched row
  const matchedInfo = useMemo(() => {
    if (!matchedDataReportRow) return null;
    const extract = (keys: string[]) => {
      for (const k of Object.keys(matchedDataReportRow)) {
        if (keys.some((cand) => k.toLowerCase().includes(cand))) {
          const val = matchedDataReportRow[k];
          if (val) return String(val).trim();
        }
      }
      return '';
    };

    return {
      shipper: extract(['shipper', 'អ្នកផ្ញើ']),
      consignee: extract(['consignee', 'អ្នកទទួល']),
      destination: extract(['destination', 'dest', 'ទិសដៅ']),
      status: extract(['status', 'ស្ថានភាព']),
      description: extract(['description', 'desc', 'ទំនិញ'])
    };
  }, [matchedDataReportRow]);

  // Check if matched row has status === 'DELIVERED'
  const isMatchedRowDelivered = useMemo(() => {
    if (!matchedDataReportRow) return false;
    return Object.values(matchedDataReportRow).some(
      (v) => String(v || '').trim().toUpperCase() === 'DELIVERED'
    );
  }, [matchedDataReportRow]);

  // Duplicate Barcode check
  const duplicateReport = useMemo(() => {
    if (!barcode.trim()) return null;
    const clean = sanitizeTrackingCode(barcode).toUpperCase();

    if (editingId) {
      const currentItem = reports.find((r) => r.id === editingId);
      const originalBarcode = currentItem ? sanitizeTrackingCode(currentItem.barcode).toUpperCase() : '';
      if (clean === originalBarcode) {
        return null;
      }
      return reports.find((r) => r.id !== editingId && sanitizeTrackingCode(r.barcode).toUpperCase() === clean) || null;
    }

    return reports.find((r) => sanitizeTrackingCode(r.barcode).toUpperCase() === clean) || null;
  }, [barcode, reports, editingId]);

  // Handlers for Form
  const handleOpenNewForm = () => {
    setEditingId(null);
    setBarcode('');
    setName('');
    setDate(new Date().toISOString().slice(0, 10));
    setFormError(null);
    setIsFormOpen(true);
    setTimeout(() => {
      formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      barcodeInputRef.current?.focus();
    }, 150);
  };

  const handleEdit = (item: DistributionReportItem) => {
    if (!canEdit) {
      notify('⚠️ សិទ្ធិត្រូវបានកំណត់៖ គណនីរបស់អ្នកគ្មានសិទ្ធិកែប្រែរបាយការណ៍ឡើយ!', 'error');
      return;
    }
    setEditingId(item.id);
    setBarcode(item.barcode);
    setName(item.name || '');
    setDate(item.date);
    setFormError(null);
    setIsFormOpen(true);
    setTimeout(() => {
      formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      barcodeInputRef.current?.focus();
    }, 150);
  };

  const handleResetForm = () => {
    setEditingId(null);
    setBarcode('');
    setName('');
    setFormError(null);
    setIsFormOpen(false);
  };

  const handleSubmit = async () => {
    const cleanBarcode = sanitizeTrackingCode(barcode).toUpperCase();
    if (!cleanBarcode) {
      setFormError('សូមបញ្ចូល ឬ Scan លេខបាកូដ (Barcode)!');
      barcodeInputRef.current?.focus();
      return;
    }

    if (editingId && !canEdit) {
      setFormError('⚠️ សិទ្ធិត្រូវបានកំណត់៖ គណនីរបស់អ្នកគ្មានសិទ្ធិកែប្រែរបាយការណ៍ឡើយ!');
      return;
    }

    if (!editingId && !canCreate) {
      setFormError('⚠️ សិទ្ធិត្រូវបានកំណត់៖ គណនីរបស់អ្នកគ្មានសិទ្ធិបញ្ចូលរបាយការណ៍ថ្មីឡើយ!');
      return;
    }

    if (isMatchedRowDelivered && !editingId) {
      setFormError(
        `⚠️ កញ្ចប់លេខ «${cleanBarcode}» នេះមានស្ថានភាព «DELIVERED» (បានប្រគល់រួចរាល់) ក្នុងប្រព័ន្ធ Data Report — មិនអនុញ្ញាតឱ្យបញ្ចូលរបាយការណ៍ចែកចាយម្ដងទៀតឡើយ!`
      );
      barcodeInputRef.current?.focus();
      return;
    }

    if (editingId) {
      const currentItem = reports.find((r) => r.id === editingId);
      const originalBarcode = currentItem ? sanitizeTrackingCode(currentItem.barcode).toUpperCase() : '';
      if (cleanBarcode !== originalBarcode) {
        const existingDuplicate = reports.find(
          (r) => r.id !== editingId && sanitizeTrackingCode(r.barcode).toUpperCase() === cleanBarcode
        );
        if (existingDuplicate) {
          setFormError(
            `⚠️ លេខ Barcode «${cleanBarcode}» នេះធ្លាប់បានកត់ត្រារួចហើយ ដោយ «${existingDuplicate.name}» (${existingDuplicate.date})! មិនអនុញ្ញាតឱ្យបញ្ចូលជាន់គ្នាឡើយ។`
          );
          barcodeInputRef.current?.focus();
          return;
        }
      }
    } else {
      const existingDuplicate = reports.find(
        (r) => sanitizeTrackingCode(r.barcode).toUpperCase() === cleanBarcode
      );
      if (existingDuplicate) {
        setFormError(
          `⚠️ លេខ Barcode «${cleanBarcode}» នេះធ្លាប់បានកត់ត្រារួចហើយ ដោយ «${existingDuplicate.name}» (${existingDuplicate.date})! មិនអនុញ្ញាតឱ្យបញ្ចូលជាន់គ្នាឡើយ។`
        );
        barcodeInputRef.current?.focus();
        return;
      }
    }

    if (!name.trim()) {
      setFormError('សូមបញ្ចូលឈ្មោះអ្នកដឹក ឬអ្នកទទួល (Name)!');
      return;
    }
    if (!date) {
      setFormError('សូមជ្រើសរើសកាលបរិច្ឆេទ (Date)!');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const saved = await saveDistributionReport({
        id: editingId || undefined,
        barcode: cleanBarcode,
        name: name.trim(),
        date,
        remarks: '',
        createdBy: currentUser?.name || currentUser?.email || 'User',
        operatorEmail: currentUser?.email || ''
      });

      setReports((prev) => {
        const idx = prev.findIndex((p) => p.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [saved, ...prev];
      });

      notify(
        editingId ? '✓ បានកែប្រែរបាយការណ៍ចែកចាយជោគជ័យ!' : '✓ បានកត់ត្រារបាយការណ៍ចែកចាយជោគជ័យ!',
        'success'
      );

      handleResetForm();
    } catch (e: any) {
      setFormError('មានបញ្ហាក្នុងការរក្សាទុក៖ ' + (e?.message || e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (item: DistributionReportItem) => {
    if (!canDelete) {
      notify('⚠️ សិទ្ធិត្រូវបានកំណត់៖ គណនីរបស់អ្នកគ្មានសិទ្ធិលុបរបាយការណ៍ឡើយ!', 'error');
      return;
    }
    setItemToDelete(item);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    if (!canDelete) {
      notify('⚠️ សិទ្ធិត្រូវបានកំណត់៖ គណនីរបស់អ្នកគ្មានសិទ្ធិលុបរបាយការណ៍ឡើយ!', 'error');
      return;
    }
    setIsDeleting(true);
    try {
      await deleteDistributionReport(itemToDelete.id);
      setReports((prev) => prev.filter((r) => r.id !== itemToDelete.id));
      notify(`✓ បានលុបរបាយការណ៍ Barcode «${itemToDelete.barcode}» ជោគជ័យ!`, 'info');
      if (editingId === itemToDelete.id) {
        handleResetForm();
      }
      setItemToDelete(null);
    } catch (err: any) {
      notify('កំហុសពេលលុប៖ ' + (err?.message || err), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyBarcode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
    notify(`✓ បានចម្លង ${code}`, 'success');
  };

  // Distinct Operators for Filter Dropdown
  const uniqueOperators = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => {
      const email = r.operatorEmail || (r.createdBy?.includes('@') ? r.createdBy : null);
      if (email) set.add(email);
    });
    return Array.from(set);
  }, [reports]);

  // Filtered & Sorted Reports
  const filteredReports = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const thisMonthPrefix = todayStr.slice(0, 7);

    let list = reports.filter((item) => {
      // 1. Date Filter
      if (dateFilter === 'TODAY' && item.date !== todayStr) return false;
      if (dateFilter === 'YESTERDAY' && item.date !== yesterdayStr) return false;
      if (dateFilter === 'THIS_MONTH' && !item.date?.startsWith(thisMonthPrefix)) return false;

      // 2. Operator Filter
      if (operatorFilter !== 'ALL') {
        const itemEmail = item.operatorEmail || (item.createdBy?.includes('@') ? item.createdBy : '');
        if (itemEmail !== operatorFilter) return false;
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          (item.barcode || '').toLowerCase().includes(q) ||
          (item.name || '').toLowerCase().includes(q) ||
          (item.date || '').toLowerCase().includes(q) ||
          (item.operatorEmail || item.createdBy || '').toLowerCase().includes(q) ||
          (item.createdAt || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });

    // Sorting
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
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      return 0;
    });

    return list;
  }, [reports, searchQuery, dateFilter, operatorFilter, sortBy]);

  // Statistics
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = useMemo(() => {
    return reports.filter((r) => r.date === todayStr).length;
  }, [reports, todayStr]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredReports.length / pageSize) || 1;
  const paginatedReports = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredReports.slice(start, start + pageSize);
  }, [filteredReports, currentPage, pageSize]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFilter, operatorFilter, sortBy, pageSize]);

  // Export CSV
  const handleExportCSV = () => {
    if (!filteredReports.length) {
      notify('មិនមានទិន្នន័យសម្រាប់ទាញយកឡើយ', 'info');
      return;
    }
    try {
      const header = ['#', 'Barcode', 'Name', 'Date', 'Operator Email', 'Created At'];
      const rowsData = filteredReports.map((r, idx) => [
        idx + 1,
        `"${(r.barcode || '').replace(/"/g, '""')}"`,
        `"${(r.name || '').replace(/"/g, '""')}"`,
        `"${(r.date || '').replace(/"/g, '""')}"`,
        `"${(r.operatorEmail || r.createdBy || '').replace(/"/g, '""')}"`,
        `"${(formatCreatedAt(r.createdAt) || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = '\uFEFF' + [header.join(','), ...rowsData.map((row) => row.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Distribution_Reports_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      notify('✓ បានទាញយក CSV របាយការណ៍ចែកចាយជោគជ័យ!', 'success');
    } catch {
      notify('កំហុសក្នុងការទាញយក CSV', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-3 sm:p-6 space-y-6">
      {/* ========================================================================= */}
      {/* 🏷️ TOP HEADER BANNER */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/25 shrink-0">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                របាយការណ៍ចែកចាយ (Distribution Alert)
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                <Sparkles className="w-3 h-3 text-amber-500 animate-pulse" />
                Live Sync
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              កត់ត្រា ស្វែងរក និងគ្រប់គ្រងរបាយការណ៍ចែកចាយកញ្ចប់ទំនិញតាម Barcode ពេលវេលាជាក់ស្ដែង
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredReports.length === 0}
            className="h-9 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
            title="ទាញយកទិន្នន័យជាឯកសារ Excel/CSV"
          >
            <Download className="w-4 h-4 text-emerald-500" />
            <span>ទាញយក CSV</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (isFormOpen) {
                handleResetForm();
              } else {
                handleOpenNewForm();
              }
            }}
            className="h-9 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-md shadow-amber-500/25 active:scale-98"
          >
            {isFormOpen ? (
              <>
                <X className="w-4 h-4" />
                <span>បិទ Form</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>+ បញ្ចូលរបាយការណ៍ថ្មី</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📊 SUMMARY STATS CARDS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Reports */}
        <div className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              របាយការណ៍សរុប
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5 font-mono">
              {reports.length}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Today's Reports */}
        <div className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              ថ្ងៃនេះ ({todayStr})
            </div>
            <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-0.5 font-mono">
              {todayCount}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Permissions Status */}
        <div className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              សិទ្ធិប្រតិបត្តិការ
            </div>
            <div className="text-xs font-bold mt-1.5 flex items-center gap-1.5">
              <span
                className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                  canOperateActions
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                }`}
              >
                {canOperateActions ? '✓ Admin, Acc & Cs Teams(Opt)' : '🔒 មើលបានតែប៉ុណ្ណោះ'}
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Operators Count */}
        <div className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              ប្រតិបត្តិករសកម្ម
            </div>
            <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-0.5 font-mono">
              {uniqueOperators.length}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <User className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📝 COLLAPSIBLE ADD / EDIT FORM SECTION */}
      {/* ========================================================================= */}
      {isFormOpen && (
        <div
          ref={formCardRef}
          className="bg-white dark:bg-[#0d1629] border-2 border-amber-500/40 dark:border-amber-500/30 rounded-2xl p-4 sm:p-6 shadow-xl animate-in fade-in slide-in-from-top-4 duration-200"
        >
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                {editingId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {editingId ? 'កែប្រែរបាយការណ៍ចែកចាយ' : 'បញ្ចូលរបាយការណ៍ចែកចាយថ្មី'}
              </h3>
            </div>
            <button
              type="button"
              onClick={handleResetForm}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {formError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Field 1: Barcode */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Barcode className="w-3.5 h-3.5 text-amber-500" />
                  <span>BARCODE (លេខកញ្ចប់ / AWBN)</span>
                  <span className="text-red-500">*</span>
                </span>
                {matchedDataReportRow && (
                  <span className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    រកឃើញក្នុង Data
                  </span>
                )}
              </label>

              <div className="relative flex items-center gap-1.5">
                <div className="relative flex-1">
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    placeholder="e.g. E12812211249 ឬ Scan..."
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    className={`w-full px-3 py-2 rounded-xl border font-mono text-xs focus:outline-none focus:ring-2 uppercase transition ${
                      duplicateReport || (isMatchedRowDelivered && !editingId)
                        ? 'border-red-500 bg-red-50/40 dark:bg-red-950/20 text-red-900 dark:text-red-200 focus:ring-red-500'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-amber-500'
                    }`}
                  />
                  {barcode && (
                    <button
                      type="button"
                      onClick={() => setBarcode('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 text-xs font-bold transition shrink-0 cursor-pointer"
                  title="Scan Barcode តាមកាមេរ៉ា"
                >
                  <Camera className="w-4 h-4 text-amber-500" />
                  <span>Scan</span>
                </button>
              </div>

              {/* DELIVERED Status Warning */}
              {isMatchedRowDelivered && !editingId && (
                <div className="mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900/60 text-[11px] flex items-center gap-1.5 text-red-700 dark:text-red-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>
                    ⚠️ កញ្ចប់នេះមានស្ថានភាព <strong>DELIVERED</strong> រួចរាល់ក្នុងប្រព័ន្ធ!
                  </span>
                </div>
              )}

              {/* Duplicate Warning */}
              {duplicateReport && (
                <div className="mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900/60 text-[11px] flex items-center justify-between gap-1.5 text-red-700 dark:text-red-300">
                  <span className="truncate">
                    ⚠️ Barcode នេះធ្លាប់កត់ត្រារួចហើយ៖ <strong>{duplicateReport.name}</strong>
                  </span>
                  {canOperateActions && (
                    <button
                      type="button"
                      onClick={() => handleEdit(duplicateReport)}
                      className="px-2 py-0.5 rounded bg-red-100 hover:bg-red-200 text-red-800 text-[10.5px] font-bold shrink-0 cursor-pointer"
                    >
                      កែប្រែចាស់
                    </button>
                  )}
                </div>
              )}

              {/* Matched row details preview */}
              {matchedInfo && (
                <div className="mt-2 p-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-[11px] space-y-0.5">
                  <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                    <span>ព័ត៌មានកញ្ចប់៖</span>
                    {matchedInfo.status && (
                      <span className="px-1.5 py-0.2 rounded-full text-[9.5px] bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-mono">
                        {matchedInfo.status}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300 text-[10.5px]">
                    {matchedInfo.consignee && <div>អ្នកទទួល: <strong>{matchedInfo.consignee}</strong></div>}
                    {matchedInfo.destination && <div>ទិសដៅ: {matchedInfo.destination}</div>}
                  </div>
                </div>
              )}
            </div>

            {/* Field 2: Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-amber-500" />
                <span>NAME (ឈ្មោះអ្នកចែកចាយ / អ្នកទទួល)</span>
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="បញ្ចូលឈ្មោះអ្នកដឹក ឬអ្នកទទួល..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
              />
              {matchedInfo?.consignee && !name && (
                <button
                  type="button"
                  onClick={() => setName(matchedInfo.consignee)}
                  className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  + ដាក់ឈ្មោះអ្នកទទួល: {matchedInfo.consignee}
                </button>
              )}
            </div>

            {/* Field 3: Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-amber-500" />
                  <span>DATE (កាលបរិច្ឆេទ)</span>
                  <span className="text-red-500">*</span>
                </span>
                <button
                  type="button"
                  onClick={() => setDate(new Date().toISOString().slice(0, 10))}
                  className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  ថ្ងៃនេះ
                </button>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleResetForm}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
            >
              បោះបង់ (Cancel)
            </button>
            <button
              type="button"
              disabled={isSubmitting || !!duplicateReport || (isMatchedRowDelivered && !editingId)}
              onClick={() => handleSubmit()}
              className={`px-5 py-2 rounded-xl text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm ${
                duplicateReport || (isMatchedRowDelivered && !editingId)
                  ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 cursor-pointer active:scale-98 shadow-amber-500/25'
              }`}
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : isMatchedRowDelivered && !editingId ? (
                <Lock className="w-4 h-4" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>
                {isMatchedRowDelivered && !editingId
                  ? 'មិនអនុញ្ញាត (DELIVERED រួចហើយ)'
                  : editingId
                  ? 'រក្សាទុកការកែប្រែ'
                  : 'រក្សាទុករបាយការណ៍'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🔍 SEARCH, FILTERS & TABLE CONTROLS */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ស្វែងរកតាម Barcode, ឈ្មោះ (Name), កាលបរិច្ឆេទ, ឬ Email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Date Filters */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'ALL', label: 'ទាំងអស់' },
              { id: 'TODAY', label: 'ថ្ងៃនេះ' },
              { id: 'YESTERDAY', label: 'ម្សិលមិញ' },
              { id: 'THIS_MONTH', label: 'ខែនេះ' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDateFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  dateFilter === tab.id
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Operator Filter Dropdown */}
          {uniqueOperators.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 whitespace-nowrap hidden sm:inline">អ្នកធ្វើ:</span>
              <select
                value={operatorFilter}
                onChange={(e) => setOperatorFilter(e.target.value)}
                className="h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
              >
                <option value="ALL">គ្រប់អ្នកធ្វើ (All Operators)</option>
                {uniqueOperators.map((email) => (
                  <option key={email} value={email}>
                    {email}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
          >
            <option value="newest">ថ្មីទៅចាស់ (Newest)</option>
            <option value="oldest">ចាស់ទៅថ្មី (Oldest)</option>
            <option value="barcode">Barcode (A-Z)</option>
            <option value="name">Name (A-Z)</option>
          </select>
        </div>

        {/* Results Info & Active Filters bar */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
          <div className="flex items-center gap-2">
            <span>រកឃើញ៖ <strong className="text-slate-900 dark:text-white font-mono">{filteredReports.length}</strong> របាយការណ៍</span>
            {(searchQuery || dateFilter !== 'ALL' || operatorFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDateFilter('ALL');
                  setOperatorFilter('ALL');
                }}
                className="text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer font-semibold"
              >
                <X className="w-3 h-3" />
                សម្អាត Filter
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span>បង្ហាញក្នុងមួយទំព័រ:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📋 TABLE OF DISTRIBUTION REPORTS */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-3.5 w-12 text-center whitespace-nowrap">#</th>
                <th className="py-3 px-3.5 min-w-[170px] whitespace-nowrap">BARCODE (លេខកញ្ចប់)</th>
                <th className="py-3 px-3.5 min-w-[160px]">NAME (ឈ្មោះអ្នកចែកចាយ/ទទួល)</th>
                <th className="py-3 px-3.5 min-w-[130px] whitespace-nowrap">DATE (កាលបរិច្ឆេទ)</th>
                <th className="py-3 px-3.5 min-w-[180px] whitespace-nowrap">EMAIL (អ្នកធ្វើប្រតិបត្តិការ)</th>
                <th className="py-3 px-3.5 min-w-[150px] whitespace-nowrap">CREATED AT</th>
                <th className="py-3 px-3.5 w-24 text-center whitespace-nowrap">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-[#0d1629]">
              {paginatedReports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400 dark:text-slate-500">
                    <Truck className="w-10 h-10 mx-auto mb-2 opacity-40 text-amber-500" />
                    <p className="font-bold text-sm text-slate-600 dark:text-slate-300">
                      មិនមានទិន្នន័យរបាយការណ៍ចែកចាយឡើយ
                    </p>
                    <p className="text-xs mt-1 text-slate-400">
                      {searchQuery || dateFilter !== 'ALL'
                        ? 'សូមសាកល្បងផ្លាស់ប្ដូរពាក្យស្វែងរក ឬសម្អាត Filter'
                        : 'ចុចប៊ូតុង «+ បញ្ចូលរបាយការណ៍ថ្មី» ខាងលើដើម្បីកត់ត្រាទិន្នន័យដំបូង'}
                    </p>
                    {!searchQuery && dateFilter === 'ALL' && (
                      <button
                        type="button"
                        onClick={handleOpenNewForm}
                        className="mt-4 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Plus className="w-4 h-4" />
                        <span>បញ្ចូលរបាយការណ៍ដំបូង</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedReports.map((item, index) => {
                  const isCopied = copiedId === item.id;
                  const emailDisplay = item.operatorEmail || (item.createdBy?.includes('@') ? item.createdBy : (item.createdBy || ''));
                  const globalIndex = (currentPage - 1) * pageSize + index + 1;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition-colors group"
                    >
                      <td className="py-3 px-3.5 text-center text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {globalIndex}
                      </td>

                      {/* Barcode Column */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-amber-600 dark:text-amber-400 tracking-wide">
                            {item.barcode}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyBarcode(item.barcode, item.id)}
                            className="p-1 rounded text-slate-400 hover:text-amber-600 transition cursor-pointer"
                            title="ចម្លង Barcode"
                          >
                            {isCopied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Name Column */}
                      <td className="py-3 px-3.5 font-semibold text-slate-900 dark:text-slate-100">
                        {item.name}
                      </td>

                      {/* Date Column */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-xs whitespace-nowrap bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{item.date}</span>
                        </span>
                      </td>

                      {/* Operator Email Column */}
                      <td className="py-3 px-3.5">
                        {emailDisplay ? (
                          <div
                            className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-mono text-xs max-w-[220px] truncate"
                            title={emailDisplay}
                          >
                            <Mail className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="truncate">{emailDisplay}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">—</span>
                        )}
                      </td>

                      {/* Created At Column */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        {item.createdAt ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60 whitespace-nowrap">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{formatCreatedAt(item.createdAt)}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">—</span>
                        )}
                      </td>

                      {/* Actions Column */}
                      <td className="py-3 px-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            className={`p-1.5 rounded-lg transition ${
                              canEdit
                                ? 'text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer active:scale-95'
                                : 'text-slate-300 dark:text-slate-600 cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                            title={
                              canEdit
                                ? 'កែប្រែទិន្នន័យ (Edit)'
                                : 'គណនីគ្មានសិទ្ធិកែប្រែ (No edit permission)'
                            }
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(item)}
                            className={`p-1.5 rounded-lg transition ${
                              canDelete
                                ? 'text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 cursor-pointer active:scale-95'
                                : 'text-slate-300 dark:text-slate-600 cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                            title={
                              canDelete
                                ? 'លុបរបាយការណ៍ (Delete)'
                                : 'គណនីគ្មានសិទ្ធិលុប (No delete permission)'
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ========================================================================= */}
        {/* 🦶 TABLE FOOTER & PAGINATION */}
        {/* ========================================================================= */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-xs text-slate-500">
          <div>
            <span>បង្ហាញទិន្នន័យ </span>
            <strong className="text-slate-900 dark:text-white font-mono">
              {filteredReports.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </strong>
            <span> ដល់ </span>
            <strong className="text-slate-900 dark:text-white font-mono">
              {Math.min(currentPage * pageSize, filteredReports.length)}
            </strong>
            <span> នៃសរុប </span>
            <strong className="text-slate-900 dark:text-white font-mono">
              {filteredReports.length}
            </strong>
            <span> របាយការណ៍</span>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>មុន</span>
              </button>

              <span className="px-3 py-1 font-mono font-bold text-slate-700 dark:text-slate-300">
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <span>បន្ទាប់</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Barcode Camera Scanner Modal */}
      {isScannerOpen && (
        <React.Suspense fallback={null}>
          <BarcodeScannerModal
            isOpen={isScannerOpen}
            onClose={() => setIsScannerOpen(false)}
            onScanSuccess={(decoded) => {
              const clean = sanitizeTrackingCode(decoded).toUpperCase();
              setBarcode(clean);
              setIsScannerOpen(false);
              notify(`✓ បាន Scan Barcode: ${clean}`, 'success');
            }}
            autoCloseOnScan={true}
          />
        </React.Suspense>
      )}

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  លុបរបាយការណ៍ចែកចាយ?
                </h4>
                <p className="text-xs text-slate-500">
                  តើអ្នកប្រាកដជាចង់លុបទិន្នន័យរបាយការណ៍នេះមែនទេ?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1 font-mono">
              <div>
                <span className="text-slate-400">Barcode: </span>
                <strong className="text-amber-600 dark:text-amber-400">{itemToDelete.barcode}</strong>
              </div>
              <div>
                <span className="text-slate-400">Name: </span>
                <strong className="text-slate-800 dark:text-slate-200">{itemToDelete.name}</strong>
              </div>
              <div>
                <span className="text-slate-400">Date: </span>
                <span className="text-slate-600 dark:text-slate-300">{itemToDelete.date}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setItemToDelete(null)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
              >
                បោះបង់
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{isDeleting ? 'កំពុងលុប...' : 'លុបទិន្នន័យ'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
