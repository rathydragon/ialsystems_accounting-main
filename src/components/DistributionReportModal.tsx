import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Truck,
  X,
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
  Clock
} from 'lucide-react';
import { DistributionReportItem, AuthUser, UserPermission } from '../types';
import { SheetRowData } from '../utils/googleSheetFetcher';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import { canOperateDistributionActions } from '../services/distributionReportService';

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

// Code-split BarcodeScannerModal with React.lazy
const BarcodeScannerModal = React.lazy(() =>
  import('./BarcodeScannerModal').then((m) => ({ default: m.BarcodeScannerModal }))
);

interface DistributionReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reports: DistributionReportItem[];
  onSaveReport: (report: Omit<DistributionReportItem, 'id' | 'createdAt'> & { id?: string }) => Promise<void>;
  onDeleteReport: (id: string) => Promise<void>;
  currentUser?: AuthUser | null;
  permissions?: UserPermission[];
  currentUserName?: string;
  prefilledBarcode?: string;
  dataReportRows?: SheetRowData[];
  onNotify?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const DistributionReportModal: React.FC<DistributionReportModalProps> = ({
  isOpen,
  onClose,
  reports,
  onSaveReport,
  onDeleteReport,
  currentUser,
  permissions,
  prefilledBarcode = '',
  dataReportRows = [],
  onNotify
}) => {
  const [activeTab, setActiveTab] = useState<'FORM' | 'LIST'>('FORM');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Permission check: Only Cs Teams(Opt) and Admin can edit or delete
  const canOperateActions = useMemo(() => {
    return canOperateDistributionActions(currentUser, permissions);
  }, [currentUser, permissions]);

  // In-modal confirmation for deleting a record
  const [itemToDelete, setItemToDelete] = useState<DistributionReportItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Form Fields (Only Barcode, Name, Date)
  const [barcode, setBarcode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Search in List View
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Scanner modal
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // When modal opens or prefilledBarcode changes
  useEffect(() => {
    if (isOpen) {
      if (prefilledBarcode) {
        setBarcode(prefilledBarcode);
        setActiveTab('FORM');
      }
      setTimeout(() => barcodeInputRef.current?.focus(), 150);
    }
  }, [isOpen, prefilledBarcode]);

  // Lookup barcode details in currently loaded Data Report rows
  const matchedDataReportRow = useMemo(() => {
    if (!barcode.trim() || !dataReportRows.length) return null;
    const clean = sanitizeTrackingCode(barcode).toUpperCase();
    return dataReportRows.find((row) => {
      return Object.values(row).some((val) => {
        if (!val) return false;
        return String(val).trim().toUpperCase() === clean;
      });
    }) || null;
  }, [barcode, dataReportRows]);

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

  // Check if current barcode is already recorded in another entry (duplicate prevention)
  const duplicateReport = useMemo(() => {
    if (!barcode.trim()) return null;
    const clean = sanitizeTrackingCode(barcode).toUpperCase();
    
    // When editing an existing item
    if (editingId) {
      const currentItem = reports.find((r) => r.id === editingId);
      const originalBarcode = currentItem ? sanitizeTrackingCode(currentItem.barcode).toUpperCase() : '';
      // If barcode hasn't been changed from original, don't flag as duplicate (allows editing name/date)
      if (clean === originalBarcode) {
        return null;
      }
      return reports.find((r) => r.id !== editingId && sanitizeTrackingCode(r.barcode).toUpperCase() === clean) || null;
    }

    return reports.find((r) => sanitizeTrackingCode(r.barcode).toUpperCase() === clean) || null;
  }, [barcode, reports, editingId]);

  const handleEdit = (item: DistributionReportItem) => {
    if (!canOperateActions) {
      onNotify?.(
        '⚠️ សិទ្ធិត្រូវបានកំណត់៖ មានតែក្រុម Cs Teams(Opt) និង Admin ប៉ុណ្ណោះដែលមានសិទ្ធិកែប្រែរបាយការណ៍!',
        'error'
      );
      return;
    }
    setEditingId(item.id);
    setBarcode(item.barcode);
    setName(item.name || '');
    setDate(item.date);
    setActiveTab('FORM');
    setFormError(null);
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
  };

  const handleResetForm = () => {
    setEditingId(null);
    setBarcode('');
    setName('');
    setFormError(null);
    setDate(new Date().toISOString().slice(0, 10));
  };

  const handleSubmit = async () => {
    const cleanBarcode = sanitizeTrackingCode(barcode).toUpperCase();
    if (!cleanBarcode) {
      setFormError('សូមបញ្ចូល ឬ Scan លេខបាកូដ (Barcode)!');
      barcodeInputRef.current?.focus();
      return;
    }

    // Permission check for editing
    if (editingId && !canOperateActions) {
      setFormError('⚠️ សិទ្ធិត្រូវបានកំណត់៖ មានតែក្រុម Cs Teams(Opt) និង Admin ប៉ុណ្ណោះដែលមានសិទ្ធិកែប្រែរបាយការណ៍!');
      return;
    }

    // Duplicate barcode check
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
      await onSaveReport({
        id: editingId || undefined,
        barcode: cleanBarcode,
        name: name.trim(),
        date,
        remarks: '',
        operatorEmail: currentUser?.email || ''
      });

      onNotify?.(
        editingId ? '✓ បានកែប្រែរបាយការណ៍ចែកចាយជោគជ័យ!' : '✓ បានកត់ត្រារបាយការណ៍ចែកចាយជោគជ័យ!',
        'success'
      );

      handleResetForm();
      setActiveTab('LIST');
    } catch (e: any) {
      setFormError('មានបញ្ហាក្នុងការរក្សាទុក៖ ' + (e?.message || e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (item: DistributionReportItem) => {
    if (!canOperateActions) {
      onNotify?.(
        '⚠️ សិទ្ធិត្រូវបានកំណត់៖ មានតែក្រុម Cs Teams(Opt) និង Admin ប៉ុណ្ណោះដែលមានសិទ្ធិលុបរបាយការណ៍!',
        'error'
      );
      return;
    }
    setItemToDelete(item);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      await onDeleteReport(itemToDelete.id);
      onNotify?.(`✓ បានលុបរបាយការណ៍ Barcode «${itemToDelete.barcode}» ជោគជ័យ!`, 'info');
      if (editingId === itemToDelete.id) {
        handleResetForm();
      }
      setItemToDelete(null);
    } catch (err: any) {
      onNotify?.('កំហុសពេលលុប៖ ' + (err?.message || err), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyBarcode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
    onNotify?.(`✓ បានចម្លង ${code}`, 'success');
  };

  // Filtered reports for table list
  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        (item.barcode || '').toLowerCase().includes(q) ||
        (item.name || '').toLowerCase().includes(q) ||
        (item.date || '').toLowerCase().includes(q) ||
        (item.operatorEmail || item.createdBy || '').toLowerCase().includes(q) ||
        (item.createdAt || '').toLowerCase().includes(q)
      );
    });
  }, [reports, searchQuery]);

  // Export CSV of distribution reports
  const handleExportCSV = () => {
    if (!reports.length) {
      onNotify?.('មិនមានទិន្នន័យសម្រាប់ទាញយកឡើយ', 'info');
      return;
    }
    try {
      const header = ['#', 'Barcode', 'Name', 'Date', 'Operator Email', 'Created At'];
      const rows = reports.map((r, idx) => [
        idx + 1,
        `"${(r.barcode || '').replace(/"/g, '""')}"`,
        `"${(r.name || '').replace(/"/g, '""')}"`,
        `"${(r.date || '').replace(/"/g, '""')}"`,
        `"${(r.operatorEmail || r.createdBy || '').replace(/"/g, '""')}"`,
        `"${(formatCreatedAt(r.createdAt) || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = '\uFEFF' + [header.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Distribution_Reports_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      onNotify?.('✓ បានទាញយក CSV របាយការណ៍ចែកចាយជោគជ័យ!', 'success');
    } catch {
      onNotify?.('កំហុសក្នុងការទាញយក CSV', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className={`w-full ${activeTab === 'LIST' ? 'max-w-4xl' : 'max-w-lg'} max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden transition-all duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================================= */}
        {/* 🏷️ MODAL HEADER (Compact) */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-sm shadow-amber-500/20 shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                  របាយការណ៍ចែកចាយ (Distribution Alert)
                </h3>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                  <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                  Live Sync
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                កត់ត្រា និងគ្រប់គ្រងរបាយការណ៍ចែកចាយកញ្ចប់ទំនិញ (Barcode, Name, Date)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="បិទ (Close)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* 📑 TABS: FORM vs LIST (Compact) */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between px-4 pt-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('FORM')}
              className={`pb-1.5 px-2.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'FORM'
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{editingId ? 'កែប្រែរបាយការណ៍' : 'បញ្ចូលរបាយការណ៍ថ្មី'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('LIST')}
              className={`pb-1.5 px-2.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'LIST'
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>បញ្ជីរបាយការណ៍</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                {reports.length}
              </span>
            </button>
          </div>

          {activeTab === 'LIST' && reports.length > 0 && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="mb-1.5 h-6.5 px-2 rounded-md bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer shadow-2xs"
            >
              <Download className="w-3 h-3" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 📦 BODY CONTENT (Compact) */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3">
          {/* TAB 1: FORM INPUT */}
          {activeTab === 'FORM' && (
            <div className="w-full space-y-3">
              {formError && (
                <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-center gap-1.5 animate-in fade-in">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Barcode Field */}
              <div>
                <label className="block text-[11.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Barcode className="w-3.5 h-3.5 text-amber-500" />
                    <span>BARCODE (លេខបាកូដ / AWBN)</span>
                    <span className="text-red-500">*</span>
                  </span>
                  {matchedDataReportRow && (
                    <span className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      រកឃើញក្នុង Data Report
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
                      className={`w-full px-3 py-1.5 rounded-lg border font-mono text-xs focus:outline-none focus:ring-2 transition uppercase ${
                        duplicateReport
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
                    className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 flex items-center gap-1 text-[11px] font-bold transition shrink-0 cursor-pointer"
                    title="Scan Barcode តាមកាមេរ៉ា"
                  >
                    <Camera className="w-3.5 h-3.5 text-amber-500" />
                    <span>Camera</span>
                  </button>
                </div>

                {/* Duplicate Barcode Warning Banner */}
                {duplicateReport && (
                  <div className="mt-1.5 p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900/60 text-[11px] flex items-center justify-between gap-1.5 text-red-700 dark:text-red-300 animate-in fade-in">
                    <div className="flex items-center gap-1 min-w-0">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span className="truncate">
                        ⚠️ Barcode នេះធ្លាប់បានកត់ត្រារួចហើយ៖ <strong>{duplicateReport.name}</strong> ({duplicateReport.date})
                      </span>
                    </div>
                    {canOperateActions ? (
                      <button
                        type="button"
                        onClick={() => handleEdit(duplicateReport)}
                        className="px-2 py-0.5 rounded-md bg-red-100 hover:bg-red-200 dark:bg-red-900/60 dark:hover:bg-red-800 text-red-800 dark:text-red-200 text-[10.5px] font-bold shrink-0 transition cursor-pointer"
                      >
                        កែប្រែទិន្នន័យចាស់
                      </button>
                    ) : (
                      <span className="text-[10px] text-red-500 font-semibold px-1.5 py-0.5 rounded bg-red-100/50 shrink-0">
                        🔒 កែប្រែបានតែ Cs Teams(Opt) / Admin
                      </span>
                    )}
                  </div>
                )}

                {/* Instant preview of matched package details from Data Report */}
                {matchedInfo && (
                  <div className="mt-1.5 p-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-[11px] space-y-0.5">
                    <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                      <span>ព័ត៌មានកញ្ចប់ក្នុងប្រព័ន្ធ៖</span>
                      {matchedInfo.status && (
                        <span className="px-1.5 py-0.2 rounded-full text-[9.5px] bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-mono">
                          {matchedInfo.status}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-slate-600 dark:text-slate-300 text-[10.5px]">
                      {matchedInfo.shipper && (
                        <div>
                          <span className="font-semibold text-slate-500">Shipper:</span> {matchedInfo.shipper}
                        </div>
                      )}
                      {matchedInfo.consignee && (
                        <div>
                          <span className="font-semibold text-slate-500">Consignee:</span> {matchedInfo.consignee}
                        </div>
                      )}
                      {matchedInfo.destination && (
                        <div>
                          <span className="font-semibold text-slate-500">Dest:</span> {matchedInfo.destination}
                        </div>
                      )}
                      {matchedInfo.description && (
                        <div>
                          <span className="font-semibold text-slate-500">Desc:</span> {matchedInfo.description}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Name & 3. Date Fields (2 Columns) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-amber-500" />
                    <span>NAME (ឈ្មោះអ្នកចែកចាយ / អ្នកទទួល)</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="បញ្ចូលឈ្មោះអ្នកដឹក ឬអ្នកទទួល..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                  />
                  {matchedInfo?.consignee && !name && (
                    <button
                      type="button"
                      onClick={() => setName(matchedInfo.consignee)}
                      className="mt-0.5 text-[10.5px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      + ដាក់ឈ្មោះអ្នកទទួល: {matchedInfo.consignee}
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-[11.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-amber-500" />
                      <span>DATE (កាលបរិច្ឆេទ)</span>
                      <span className="text-red-500">*</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setDate(new Date().toISOString().slice(0, 10))}
                      className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                    >
                      ថ្ងៃនេះ
                    </button>
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
                  />
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                {duplicateReport ? (
                  <div className="text-[11px] text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>មិនអាចរក្សាទុកបានទេ ដោយសារ Barcode នេះមានរួចហើយ</span>
                  </div>
                ) : (
                  <div />
                )}
                <button
                  type="button"
                  disabled={isSubmitting || !!duplicateReport}
                  onClick={() => handleSubmit()}
                  className={`w-full sm:w-auto px-4 py-1.5 rounded-lg text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm ${
                    duplicateReport
                      ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60 shadow-none'
                      : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 cursor-pointer shadow-amber-500/20 active:scale-98'
                  }`}
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>{editingId ? 'កែប្រែទិន្នន័យ' : 'រក្សាទុក (Save)'}</span>
                </button>
              </div>

            </div>
          )}

          {/* TAB 2: LIST VIEW OF DISTRIBUTION REPORTS */}
          {activeTab === 'LIST' && (
            <div className="space-y-3">
              {/* Search Bar & Controls */}
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ស្វែងរកតាម Barcode, Name, Date, Email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleResetForm();
                      setActiveTab('FORM');
                    }}
                    className="h-9 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>បញ្ចូលថ្មី</span>
                  </button>
                </div>
              </div>

              {/* Permission Status Indicator */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className={`w-3.5 h-3.5 ${canOperateActions ? 'text-emerald-500' : 'text-amber-500'}`} />
                  <span>សិទ្ធិប្រតិបត្តិការ (Edit / Delete)៖</span>
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                    canOperateActions
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                  }`}>
                    {canOperateActions ? '✓ Cs Teams(Opt) & Admin (មានសិទ្ធិ)' : '🔒 មើលបានតែប៉ុណ្ណោះ (View Only)'}
                  </span>
                </div>
                {!canOperateActions && (
                  <span className="text-[10.5px] text-amber-600 dark:text-amber-400 font-medium">
                    * គណនីរបស់អ្នកពុំមានសិទ្ធិកែប្រែ ឬលុបទិន្នន័យឡើយ
                  </span>
                )}
              </div>

              {/* Table with columns: Barcode, Name, Date, Operator Email, Created At, Actions */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto max-h-[55vh]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 font-bold sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[10.5px]">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center whitespace-nowrap">#</th>
                        <th className="py-2.5 px-3 min-w-[150px] whitespace-nowrap">Barcode</th>
                        <th className="py-2.5 px-3 min-w-[130px]">Name</th>
                        <th className="py-2.5 px-3 min-w-[120px] whitespace-nowrap">Date</th>
                        <th className="py-2.5 px-3 min-w-[160px] whitespace-nowrap">Email (អ្នកធ្វើ)</th>
                        <th className="py-2.5 px-3 min-w-[135px] whitespace-nowrap">Created At</th>
                        <th className="py-2.5 px-3 w-20 text-center whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {filteredReports.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-slate-500">
                            <Truck className="w-8 h-8 mx-auto mb-2 opacity-40 text-amber-500" />
                            <p className="font-semibold">មិនមានរបាយការណ៍ចែកចាយឡើយ</p>
                            <p className="text-[11px] mt-0.5">ចុច «បញ្ចូលរបាយការណ៍ថ្មី» ដើម្បីកត់ត្រា</p>
                          </td>
                        </tr>
                      ) : (
                        filteredReports.map((item, index) => {
                          const isCopied = copiedId === item.id;
                          const emailDisplay = item.operatorEmail || (item.createdBy?.includes('@') ? item.createdBy : (item.createdBy || ''));

                          return (
                            <tr
                              key={item.id}
                              className="hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition-colors group"
                            >
                              <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px] whitespace-nowrap">
                                {index + 1}
                              </td>

                              {/* Barcode Column */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
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
                              <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                                {item.name}
                              </td>

                              {/* Date Column */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] whitespace-nowrap bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                  <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="whitespace-nowrap">{item.date}</span>
                                </span>
                              </td>

                              {/* Operator Email Column */}
                              <td className="py-2.5 px-3">
                                {emailDisplay ? (
                                  <div
                                    className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-mono text-[11px] max-w-[180px] truncate"
                                    title={emailDisplay}
                                  >
                                    <Mail className="w-3 h-3 text-amber-500 shrink-0" />
                                    <span className="truncate">{emailDisplay}</span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 font-mono text-[11px]">—</span>
                                )}
                              </td>

                              {/* Created At Column */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                {item.createdAt ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10.5px] bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60 whitespace-nowrap">
                                    <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                    <span className="whitespace-nowrap">{formatCreatedAt(item.createdAt)}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-mono text-[11px]">—</span>
                                )}
                              </td>

                              {/* Actions Column */}
                              <td className="py-2.5 px-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(item)}
                                    className={`p-1.5 rounded-lg transition ${
                                      canOperateActions
                                        ? 'text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer active:scale-95'
                                        : 'text-slate-300 dark:text-slate-600 cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                    title={
                                      canOperateActions
                                        ? 'កែប្រែទិន្នន័យ (Edit)'
                                        : 'គ្មានសិទ្ធិកែប្រែ (អនុញ្ញាតតែ Cs Teams(Opt) និង Admin)'
                                    }
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteClick(item)}
                                    className={`p-1.5 rounded-lg transition ${
                                      canOperateActions
                                        ? 'text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 cursor-pointer active:scale-95'
                                        : 'text-slate-300 dark:text-slate-600 cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                    title={
                                      canOperateActions
                                        ? 'លុបរបាយការណ៍ (Delete)'
                                        : 'គ្មានសិទ្ធិលុប (អនុញ្ញាតតែ Cs Teams(Opt) និង Admin)'
                                    }
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
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
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 🦶 MODAL FOOTER (Compact) */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-[11px] text-slate-500">
          <div>
            <span>របាយការណ៍សរុប៖ </span>
            <span className="font-bold text-slate-900 dark:text-white font-mono">{reports.length}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-semibold transition cursor-pointer"
          >
            បិទ (Close)
          </button>
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
              onNotify?.(`✓ បាន Scan Barcode: ${clean}`, 'success');
            }}
            autoCloseOnScan={true}
          />
        </React.Suspense>
      )}

      {/* 🗑️ IN-MODAL DELETE CONFIRMATION DIALOG */}
      {itemToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-100">
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  បញ្ជាក់ការលុបរបាយការណ៍ចែកចាយ
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  តើអ្នកពិតជាចង់លុបទិន្នន័យចែកចាយនេះចេញពីប្រព័ន្ធមែនទេ?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Barcode:</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  {itemToDelete.barcode}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Name:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {itemToDelete.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Date:</span>
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  {itemToDelete.date}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 shrink-0">Email អ្នកធ្វើ៖</span>
                <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[220px]" title={itemToDelete.operatorEmail || itemToDelete.createdBy || '—'}>
                  {itemToDelete.operatorEmail || itemToDelete.createdBy || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Created At:</span>
                <span className="font-mono text-slate-600 dark:text-slate-400 text-[11px]">
                  {formatCreatedAt(itemToDelete.createdAt)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                បោះបង់ (Cancel)
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-red-600/20"
              >
                {isDeleting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{isDeleting ? 'កំពុងលុប...' : 'លុបទិន្នន័យ (Delete)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
