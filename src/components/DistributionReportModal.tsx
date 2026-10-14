import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Truck,
  X,
  Calendar,
  User,
  Barcode,
  CheckCircle2,
  AlertCircle,
  Camera,
  RefreshCw,
  Sparkles,
  Lock,
  AlertTriangle,
  Maximize2,
  ShieldCheck,
  ShieldAlert,
  Volume2
} from 'lucide-react';
import { DistributionReportItem, AuthUser, UserPermission } from '../types';
import { SheetRowData } from '../utils/googleSheetFetcher';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import { 
  canOperateDistributionActions,
  canCreateDistributionReport,
  canEditDistributionReport
} from '../services/distributionReportService';
import {
  playScanSound,
  playWarningSound,
  playDuplicateAlarmSound
} from '../utils/scannerSound';
import { ScannerSoundSettingsPopover } from './ScannerSoundSettingsPopover';
import {
  subscribeToWarehouseRealtimeStatus,
  getWarehouseRealtimeStatus
} from '../services/warehouseScanService';

// Code-split BarcodeScannerModal with React.lazy
const BarcodeScannerModal = React.lazy(() =>
  import('./BarcodeScannerModal').then((m) => ({ default: m.BarcodeScannerModal }))
);

interface DistributionReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reports: DistributionReportItem[];
  onSaveReport: (report: Omit<DistributionReportItem, 'id' | 'createdAt'> & { id?: string }) => Promise<void>;
  onDeleteReport?: (id: string) => Promise<void>;
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
  currentUser,
  permissions,
  prefilledBarcode = '',
  dataReportRows = [],
  onNotify
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);

  // Live Connection Status
  const [realtimeStatus, setRealtimeStatus] = useState<'CONNECTED' | 'CONNECTING' | 'DISCONNECTED'>(() => {
    return getWarehouseRealtimeStatus() === 'CONNECTED' ? 'CONNECTED' : 'CONNECTING';
  });

  useEffect(() => {
    const unsub = subscribeToWarehouseRealtimeStatus((status) => {
      if (status === 'CONNECTED') setRealtimeStatus('CONNECTED');
      else if (status === 'CONNECTING') setRealtimeStatus('CONNECTING');
      else setRealtimeStatus('DISCONNECTED');
    });
    return () => unsub();
  }, []);

  // Strict Duplicate Guard (Locks submission and alarms if barcode was already scanned)
  const [strictDuplicateGuard, setStrictDuplicateGuard] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('accounting_strict_duplicate_guard');
      return saved !== 'false';
    } catch {
      return true;
    }
  });

  const toggleDuplicateGuard = () => {
    const nextVal = !strictDuplicateGuard;
    setStrictDuplicateGuard(nextVal);
    try {
      localStorage.setItem('accounting_strict_duplicate_guard', String(nextVal));
    } catch {}
  };

  // Granular action permissions (Create, Edit)
  const canCreate = useMemo(() => {
    return canCreateDistributionReport(currentUser, permissions);
  }, [currentUser, permissions]);

  const canEdit = useMemo(() => {
    return canEditDistributionReport(currentUser, permissions);
  }, [currentUser, permissions]);

  const canOperateActions = useMemo(() => {
    return canOperateDistributionActions(currentUser, permissions);
  }, [currentUser, permissions]);

  // Form Fields (Barcode, Name, Date)
  const [barcode, setBarcode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Scanner modal
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const lastPlayedDuplicateBarcodeRef = useRef<string>('');

  // When modal opens or prefilledBarcode changes
  useEffect(() => {
    if (isOpen) {
      if (prefilledBarcode) {
        setBarcode(prefilledBarcode);
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

  // Check if matched row in Data Report has status === 'DELIVERED'
  const isMatchedRowDelivered = useMemo(() => {
    if (!matchedDataReportRow) return false;
    return Object.values(matchedDataReportRow).some(
      (v) => String(v || '').trim().toUpperCase() === 'DELIVERED'
    );
  }, [matchedDataReportRow]);

  // Check if current barcode is already recorded in another entry (duplicate prevention)
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

  // Audio Feedback: Alarm Beep when duplicate barcode collision is detected
  useEffect(() => {
    if (duplicateReport && duplicateReport.barcode !== lastPlayedDuplicateBarcodeRef.current) {
      lastPlayedDuplicateBarcodeRef.current = duplicateReport.barcode;
      playDuplicateAlarmSound(undefined, 'ស្ទួន! កញ្ចប់នេះបានកត់ត្រារួចហើយ');
    } else if (!duplicateReport) {
      lastPlayedDuplicateBarcodeRef.current = '';
    }
  }, [duplicateReport]);

  const handleResetForm = () => {
    setEditingId(null);
    setBarcode('');
    setName('');
    setFormError(null);
    lastPlayedDuplicateBarcodeRef.current = '';
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
      setFormError('⚠️ សិទ្ធិត្រូវបានកំណត់៖ មានតែក្រុម Admin, Accountant និង Cs Teams(Opt) ប៉ុណ្ណោះដែលមានសិទ្ធិកែប្រែរបាយការណ៍!');
      return;
    }

    // Check if package has status DELIVERED
    if (isMatchedRowDelivered && !editingId) {
      playWarningSound();
      setFormError(
        `⚠️ កញ្ចប់លេខ «${cleanBarcode}» នេះមានស្ថានភាព «DELIVERED» (បានប្រគល់រួចរាល់) ក្នុងប្រព័ន្ធ Data Report — មិនអនុញ្ញាតឱ្យបញ្ចូលរបាយការណ៍ចែកចាយម្ដងទៀតឡើយ!`
      );
      barcodeInputRef.current?.focus();
      return;
    }

    // Strict Duplicate Guard: Prevent saving if barcode was already recorded
    if (duplicateReport && !editingId && strictDuplicateGuard) {
      playDuplicateAlarmSound(undefined, 'ស្ទួន! កញ្ចប់នេះបានកត់ត្រារួចហើយ');
      setFormError(
        `⚠️ កញ្ចប់លេខ «${cleanBarcode}» នេះត្រូវបានកត់ត្រារួចហើយនៅ ${duplicateReport.date} ដោយ «${duplicateReport.createdBy || duplicateReport.operatorEmail || duplicateReport.name}» — Duplicate Guard បានចាក់សោរការពារការស្កេនជាន់គ្នា!`
      );
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

      playScanSound();

      onNotify?.(
        editingId ? '✓ បានកែប្រែរបាយការណ៍ចែកចាយជោគជ័យ!' : '✓ បានកត់ត្រារបាយការណ៍ចែកចាយជោគជ័យ!',
        'success'
      );

      handleResetForm();
      onClose();
    } catch (e: any) {
      playWarningSound();
      setFormError('មានបញ្ហាក្នុងការរក្សាទុក៖ ' + (e?.message || e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenFullPage = () => {
    onClose();
    window.location.hash = '#distribution_report';
  };

  if (!isOpen) return null;

  const isDuplicateBlocked = Boolean(duplicateReport && !editingId && strictDuplicateGuard);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden transition-all duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================================= */}
        {/* 🏷️ MODAL HEADER */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-sm shadow-amber-500/20 shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight truncate">
                  {editingId ? 'កែប្រែរបាយការណ៍ចែកចាយ' : 'បញ្ចូលរបាយការណ៍ចែកចាយថ្មី'}
                </h3>
                
                {/* 🟢 Live Sync Database Status Badge */}
                {realtimeStatus === 'CONNECTED' ? (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shrink-0"
                    title="ភ្ជាប់ជាមួយ Database រួចរាល់ (Connected) — Sync ភ្លាមៗរាល់ពេលរក្សាទុក"
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                    </span>
                    Live Sync
                  </span>
                ) : realtimeStatus === 'CONNECTING' ? (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0"
                    title="កំពុងភ្ជាប់ទៅកាន់ Database..."
                  >
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500 animate-pulse"></span>
                    កំពុងភ្ជាប់...
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 shrink-0"
                    title="ដំណើរការលើ Local Storage"
                  >
                    <span className="inline-flex rounded-full h-1.5 w-1.5 bg-slate-400"></span>
                    Local
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                កត់ត្រារបាយការណ៍ចែកចាយកញ្ចប់ទំនិញ (Barcode, Name, Date)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <ScannerSoundSettingsPopover size="sm" />

            <button
              type="button"
              onClick={handleOpenFullPage}
              className="h-7 px-2.5 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer border border-amber-200 dark:border-amber-800/60 shrink-0 whitespace-nowrap active:scale-95"
              title="បើកមើលបញ្ជីរបាយការណ៍ពេញលេញ (Full Page)"
            >
              <Maximize2 className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">ទំព័រពេញ</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
              title="បិទ (Close)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 📦 BODY FORM CONTENT */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {formError && (
            <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-center gap-1.5 animate-in fade-in">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
              <span>{formError}</span>
            </div>
          )}

          {/* 1. Barcode Field */}
          <div>
            <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
              <label className="text-[11.5px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Barcode className="w-3.5 h-3.5 text-amber-500" />
                <span>BARCODE (លេខបាកូដ / AWBN)</span>
                <span className="text-red-500">*</span>
              </label>

              <div className="flex items-center gap-2">
                {/* 🛡️ Duplicate Guard Mode Toggle */}
                <button
                  type="button"
                  onClick={toggleDuplicateGuard}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer active:scale-95 border ${
                    strictDuplicateGuard
                      ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                  }`}
                  title={strictDuplicateGuard ? 'Duplicate Guard កំពុងចាក់សោរមិនឱ្យស្កេនស្ទួន — ចុចដើម្បីបិទ' : 'Duplicate Guard កំពុងបិទ — ចុចដើម្បីចាក់សោរការពារស្ទួន'}
                >
                  {strictDuplicateGuard ? (
                    <ShieldCheck className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                  ) : (
                    <ShieldAlert className="w-3 h-3 text-slate-400" />
                  )}
                  <span>Guard: {strictDuplicateGuard ? 'ចាក់សោរស្ទួន' : 'សេរី'}</span>
                </button>

                {matchedDataReportRow && (
                  <span className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    ក្នុង Data Report
                  </span>
                )}
              </div>
            </div>

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
                    isDuplicateBlocked || (isMatchedRowDelivered && !editingId)
                      ? 'border-red-500 bg-red-50/40 dark:bg-red-950/20 text-red-900 dark:text-red-200 focus:ring-red-500'
                      : duplicateReport
                      ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 focus:ring-amber-500'
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

            {/* DELIVERED Status Warning Banner */}
            {isMatchedRowDelivered && !editingId && (
              <div className="mt-1.5 p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900/60 text-[11px] flex items-center gap-1.5 text-red-700 dark:text-red-300 animate-in fade-in">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span>
                  ⚠️ ស្ថានភាព <strong>DELIVERED</strong>៖ កញ្ចប់លេខនេះមានស្ថានភាព DELIVERED រួចរាល់ហើយក្នុងប្រព័ន្ធ — មិនអនុញ្ញាតឱ្យបញ្ចូលរបាយការណ៍ចែកចាយម្ដងទៀតឡើយ!
                </span>
              </div>
            )}

            {/* 🚨 Duplicate Barcode Collision Banner */}
            {duplicateReport && (
              <div
                className={`mt-1.5 p-2.5 rounded-xl border text-[11px] flex items-start justify-between gap-2 animate-in fade-in ${
                  strictDuplicateGuard && !editingId
                    ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-900/60 text-amber-800 dark:text-amber-200'
                }`}
              >
                <div className="flex items-start gap-1.5 min-w-0">
                  {strictDuplicateGuard && !editingId ? (
                    <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <div className="font-bold">
                      {strictDuplicateGuard && !editingId ? (
                        <span>⚠️ រកឃើញកញ្ចប់ស្ទួន (Duplicate Guard ចាក់សោរការពារ)</span>
                      ) : (
                        <span>⚠️ Barcode នេះធ្លាប់បានកត់ត្រារួចហើយ</span>
                      )}
                    </div>
                    <div className="text-[10.5px] opacity-90">
                      កញ្ចប់លេខ <strong>{duplicateReport.barcode}</strong> បានកត់ត្រានៅ <strong>{duplicateReport.date}</strong> ជូន <strong>{duplicateReport.name}</strong>
                      {duplicateReport.createdBy && (
                        <span> ដោយ <em>{duplicateReport.createdBy}</em></span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-center">
                  {canOperateActions && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(duplicateReport.id);
                        setBarcode(duplicateReport.barcode);
                        setName(duplicateReport.name);
                        setDate(duplicateReport.date);
                      }}
                      className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10.5px] transition cursor-pointer"
                      title="កែប្រែទិន្នន័យចាស់ដែលបានកត់ត្រាពីមុន"
                    >
                      កែប្រែចាស់
                    </button>
                  )}

                  {strictDuplicateGuard && !editingId && (
                    <button
                      type="button"
                      onClick={toggleDuplicateGuard}
                      className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-[10px] transition cursor-pointer"
                      title="ដោះសោរបណ្ដោះអាសន្នដើម្បីអនុញ្ញាតឱ្យបញ្ចូលស្ទួន"
                    >
                      ដោះសោរ
                    </button>
                  )}
                </div>
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
        </div>

        {/* ========================================================================= */}
        {/* 🦶 MODAL FOOTER */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
          <button
            type="button"
            onClick={handleOpenFullPage}
            className="text-[11.5px] text-amber-600 dark:text-amber-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>មើលបញ្ជីរបាយការណ៍ទាំងអស់ ({reports.length})</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-semibold transition cursor-pointer"
            >
              បិទ (Close)
            </button>

            <button
              type="button"
              disabled={isSubmitting || (isMatchedRowDelivered && !editingId) || isDuplicateBlocked}
              onClick={() => handleSubmit()}
              className={`px-4 py-1.5 rounded-lg text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm ${
                (isMatchedRowDelivered && !editingId) || isDuplicateBlocked
                  ? 'bg-red-400 dark:bg-red-950/80 cursor-not-allowed opacity-80 shadow-none'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 cursor-pointer shadow-amber-500/20 active:scale-98'
              }`}
            >
              {isSubmitting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : isMatchedRowDelivered && !editingId ? (
                <Lock className="w-3.5 h-3.5" />
              ) : isDuplicateBlocked ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>
                {isMatchedRowDelivered && !editingId
                  ? 'មិនអនុញ្ញាត'
                  : isDuplicateBlocked
                  ? 'ចាក់សោរ (ស្ទួន)'
                  : editingId
                  ? 'កែប្រែ'
                  : 'រក្សាទុក (Save)'}
              </span>
            </button>
          </div>
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
              const isDup = reports.some((r) => sanitizeTrackingCode(r.barcode).toUpperCase() === clean);
              if (isDup) {
                playDuplicateAlarmSound(undefined, 'ស្ទួន! កញ្ចប់នេះបានកត់ត្រារួចហើយ');
                onNotify?.(`⚠️ Barcode «${clean}» ធ្លាប់បានកត់ត្រារួចហើយ!`, 'error');
              } else {
                playScanSound();
                onNotify?.(`✓ បាន Scan Barcode: ${clean}`, 'success');
              }
            }}
            autoCloseOnScan={true}
          />
        </React.Suspense>
      )}
    </div>
  );
};
