import React, { useState } from 'react';
import {
  X,
  Package,
  Calendar,
  Clock,
  Phone,
  Truck,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  History,
  ArrowRight,
  ShieldCheck,
  Layers,
  Sparkles,
  Building2,
  Tag,
  CreditCard,
  UserCheck,
  FileSpreadsheet
} from 'lucide-react';
import { WarehouseScanItem, DistributionReportItem } from '../types';
import { SheetRowData, SheetColumnDef } from '../utils/googleSheetFetcher';

export interface PackageTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  barcode: string | null;
  rowData: SheetRowData | null;
  scans: WarehouseScanItem[];
  distReport?: DistributionReportItem;
  onOpenDistModal?: (barcode: string) => void;
  columns?: SheetColumnDef[];
}

export const PackageTimelineModal: React.FC<PackageTimelineModalProps> = ({
  isOpen,
  onClose,
  barcode,
  rowData,
  scans,
  distReport,
  onOpenDistModal,
  columns
}) => {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  if (!isOpen || !barcode) return null;

  const handleCopy = (text: string, label: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 1500);
  };

  // Helper to extract fields from rowData using columns metadata if available
  const getField = (candidates: string[]): string => {
    if (!rowData) return '';

    // 1. Try finding matching column definition first (since rowData keys are col_0, col_1 etc)
    if (columns && columns.length > 0) {
      for (const cand of candidates) {
        const target = cand.trim().toLowerCase();
        // Exact match on label or id
        const exactCol = columns.find((c) => {
          const lbl = (c.label || '').trim().toLowerCase();
          const id = (c.id || '').trim().toLowerCase();
          return lbl === target || id === target;
        });
        if (exactCol && rowData[exactCol.id] !== undefined && rowData[exactCol.id] !== null) {
          const val = String(rowData[exactCol.id]).trim();
          if (val && val !== '—') return val;
        }

        // Partial match on column label
        const partialCol = columns.find((c) => {
          const lbl = (c.label || '').trim().toLowerCase();
          return lbl.includes(target) || target.includes(lbl);
        });
        if (partialCol && rowData[partialCol.id] !== undefined && rowData[partialCol.id] !== null) {
          const val = String(rowData[partialCol.id]).trim();
          if (val && val !== '—') return val;
        }
      }
    }

    // 2. Direct key match on rowData (fallback)
    for (const cand of candidates) {
      const target = cand.trim().toLowerCase();
      for (const [key, val] of Object.entries(rowData)) {
        const cleanKey = key.trim().toLowerCase();
        if ((cleanKey === target || cleanKey.includes(target)) && val !== undefined && val !== null) {
          const str = String(val).trim();
          if (str && str !== '—') return str;
        }
      }
    }

    return '';
  };

  const shipper = getField(['SHIPPER', 'SENDER', 'អ្នកផ្ញើ']);
  const rawConsignee = getField(['CONSIGNEE', 'RECEIVER', 'CUSTOMER', 'អ្នកទទួល']);
  const destination = getField(['RE-DEST', 'DESTINATION', 'DEST', 'ទិសដៅ', 'ខេត្ត']);
  const payment = getField(['PAYMENT', 'PAY', 'ការទូទាត់']);
  const usdAmount = getField(['USD', 'TOTAL USD']);
  const khmAmount = getField(['KHM', 'KHR', 'TOTAL KHR']);
  const sheetDate = getField(['DATE', 'កាលបរិច្ឆេទ', 'ថ្ងៃខែ']);
  const status = getField(['STATUS', 'ស្ថានភាព']);
  const description = getField(['DESCRIPTION', 'DESC', 'បរិយាយ', 'ទំនិញ']);
  const teams = getField(['TEAMS', 'TEAM', 'ក្រុម']);
  const origin = getField(['ORIGIN', 'ប្រភព']);

  // Extract phone number from consignee string if present (e.g. "ឱសថស្ថាន ផ្កាយព្រឹក៖0882234411")
  const parseConsignee = (raw: string) => {
    if (!raw) return { name: '—', phone: '' };
    const phoneMatch = raw.match(/(0\d{8,9}|\+?855\d{8,9})/);
    if (phoneMatch) {
      const phone = phoneMatch[0];
      const name = raw.replace(phone, '').replace(/[៖:\-\/]/g, ' ').trim();
      return { name: name || raw, phone };
    }
    return { name: raw, phone: '' };
  };

  const consigneeInfo = parseConsignee(rawConsignee);

  // Status badge styling and label resolution
  const getStatusBadgeConfig = (statusStr: string) => {
    const raw = (statusStr || '').trim();
    const upper = raw.toUpperCase();
    if (!raw) {
      return {
        badgeBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
        dotClass: 'bg-slate-400',
        heroBg: 'from-slate-50 to-slate-100/60 dark:from-slate-900 dark:to-slate-950 border-slate-200 dark:border-slate-800',
        labelKh: 'មិនមានបញ្ជាក់ស្ថានភាពក្នុង Sheet',
        isDelivered: false,
        isUpleft: false,
        raw: '—'
      };
    }
    if (upper === 'DELIVERED') {
      return {
        badgeBg: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-500/30',
        dotClass: 'bg-emerald-500 animate-pulse',
        heroBg: 'from-emerald-500/10 via-emerald-50/40 to-white dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-950 border-emerald-500/20',
        labelKh: 'កញ្ចប់ទំនិញបានចែកចាយជោគជ័យ (Delivered Successfully)',
        isDelivered: true,
        isUpleft: false,
        raw
      };
    }
    if (upper === 'UPLEFT') {
      return {
        badgeBg: 'bg-rose-500/10 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-500/30',
        dotClass: 'bg-rose-500',
        heroBg: 'from-rose-500/10 via-rose-50/40 to-white dark:from-rose-950/30 dark:via-slate-900 dark:to-slate-950 border-rose-500/20',
        labelKh: 'កញ្ចប់ទំនិញនៅសល់ / មិនទាន់ចែកចាយចប់ / ត្រឡប់មកវិញ (Upleft)',
        isDelivered: false,
        isUpleft: true,
        raw
      };
    }
    if (upper.includes('HOLD') || upper.includes('DELAY') || upper.includes('PENDING')) {
      return {
        badgeBg: 'bg-amber-500/10 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-500/30',
        dotClass: 'bg-amber-500',
        heroBg: 'from-amber-500/10 via-amber-50/40 to-white dark:from-amber-950/30 dark:via-slate-900 dark:to-slate-950 border-amber-500/20',
        labelKh: 'កញ្ចប់កំពុងរង់ចាំ / នៅសល់ (Pending/Hold)',
        isDelivered: false,
        isUpleft: false,
        raw
      };
    }
    return {
      badgeBg: 'bg-blue-500/10 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-500/30',
      dotClass: 'bg-blue-500',
      heroBg: 'from-blue-500/10 via-blue-50/40 to-white dark:from-blue-950/30 dark:via-slate-900 dark:to-slate-950 border-blue-500/20',
      labelKh: `ស្ថានភាព៖ ${raw}`,
      isDelivered: false,
      isUpleft: false,
      raw
    };
  };

  const statusCfg = getStatusBadgeConfig(status);

  // Categorize warehouse scans (latest of each type + all history arrays)
  const allScanIns = scans.filter((s) => s.scanType === 'SCAN_IN');
  const allOutOfDelivery = scans.filter((s) => s.scanType === 'OUT_OF_DELIVERY');
  const allHolds = scans.filter((s) => s.scanType === 'HOLD_REMAINING');
  const allScanOuts = scans.filter((s) => s.scanType === 'SCAN_OUT');

  const scanIn = allScanIns.slice(-1)[0];
  const outOfDelivery = allOutOfDelivery.slice(-1)[0];
  const holdRemaining = allHolds.slice(-1)[0];
  const scanOut = allScanOuts.slice(-1)[0];

  const hasAnyScan = scans.length > 0 || !!distReport;

  // Format date time helper
  const formatDateTime = (dateStr?: string, createdAtStr?: string) => {
    if (!dateStr && !createdAtStr) return '—';
    if (createdAtStr) {
      try {
        const d = new Date(createdAtStr);
        if (!isNaN(d.getTime())) {
          return d.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      } catch (_) {}
    }
    return dateStr || '—';
  };

  // Determine Stepper completion levels
  const isStage1Complete = true; // Registered in sheet
  const isStage2Complete = !!scanIn;
  const isStage3Complete = !!outOfDelivery;
  const isStage4Complete = statusCfg.isDelivered || !!distReport;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl sm:max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================================= */}
        {/* 1. MODERN MODAL HEADER */}
        {/* ========================================================================= */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/25 ring-2 ring-blue-500/20">
              <History className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  ដំណើរការកញ្ចប់ទំនិញ
                </h2>
                {/* Clickable Barcode Copy Pill */}
                <button
                  type="button"
                  onClick={(e) => handleCopy(barcode, 'barcode', e)}
                  title="ចុចដើម្បីចម្លង Barcode"
                  className="group inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:hover:bg-blue-900 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 transition cursor-pointer"
                >
                  <span>{barcode}</span>
                  {copiedText === 'barcode' ? (
                    <Check className="w-3 h-3 text-emerald-600 animate-in zoom-in-75 duration-100" />
                  ) : (
                    <Copy className="w-3 h-3 text-blue-400 group-hover:text-blue-600 transition" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Package Lifecycle Tracking & Real-Time Warehouse Timeline
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="បិទ (Close)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* 2. BODY CONTENT */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-6 space-y-5">
          {/* ======================================================================= */}
          {/* A. UNIFIED MODERN HERO CARD (STATUS + ROUTE + ESSENTIALS) */}
          {/* ======================================================================= */}
          <div
            className={`rounded-2xl border bg-gradient-to-b ${statusCfg.heroBg} p-4 sm:p-5 shadow-xs space-y-4`}
          >
            {/* Top row: Status Badge & Date */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs sm:text-sm font-black tracking-wide border shadow-2xs ${statusCfg.badgeBg}`}
                >
                  <span className={`w-2 h-2 rounded-full ${statusCfg.dotClass}`} />
                  <span>{status || 'PENDING'}</span>
                </span>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {statusCfg.labelKh}
                </span>
              </div>

              {sheetDate && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 font-mono">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{sheetDate}</span>
                </div>
              )}
            </div>

            {/* Route & Cargo Line */}
            <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-blue-500" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10.5px] uppercase font-bold text-slate-400 block tracking-wider">
                    ទិសដៅចែកចាយ (Destination)
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                      {destination || 'មិនបានបញ្ជាក់'}
                    </span>
                    {(teams || origin) && (
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-2 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800">
                        {teams || ''} {origin ? `(${origin})` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Payment / Amount */}
              {(payment || usdAmount || khmAmount) && (
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60 text-xs">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-500" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">ការទូទាត់:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {payment || 'AC'} {usdAmount ? `$${usdAmount}` : ''} {khmAmount ? `${khmAmount}៛` : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Shipper & Consignee 2-Column Bento */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Shipper */}
              <div className="p-3 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800/60 space-y-1">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-blue-500" />
                  <span>អ្នកផ្ញើ (Shipper)</span>
                </span>
                <p className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-[13px] leading-snug">
                  {shipper || '—'}
                </p>
                {description && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 pt-0.5 truncate">
                    <Tag className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>ទំនិញ៖ {description}</span>
                  </p>
                )}
              </div>

              {/* Consignee */}
              <div className="p-3 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800/60 space-y-1">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <UserCheck className="w-3 h-3 text-emerald-500" />
                  <span>អ្នកទទួល (Consignee)</span>
                </span>
                <p className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-[13px] leading-snug">
                  {consigneeInfo.name || '—'}
                </p>
                {consigneeInfo.phone && (
                  <button
                    type="button"
                    onClick={(e) => handleCopy(consigneeInfo.phone, 'phone', e)}
                    title="ចុចដើម្បីចម្លងលេខទូរស័ព្ទ"
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 text-[11px] font-mono font-bold transition cursor-pointer"
                  >
                    <Phone className="w-3 h-3 text-emerald-600" />
                    <span>{consigneeInfo.phone}</span>
                    {copiedText === 'phone' ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-2.5 h-2.5 opacity-60" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ======================================================================= */}
          {/* B. VISUAL STEPPER (PROGRESS AT A GLANCE) */}
          {/* ======================================================================= */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span>វដ្ដដំណើរការកញ្ចប់ (Visual Progress Stepper)</span>
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                ស្កេនឃ្លាំង៖ {scans.length} ដង
              </span>
            </div>

            {/* Stepper bar */}
            <div className="grid grid-cols-4 gap-2 relative">
              {/* Step 1: Sheet Registered */}
              <div className="text-center space-y-1">
                <div
                  className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ${
                    isStage1Complete
                      ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-950'
                      : 'bg-slate-200 text-slate-500 dark:bg-slate-800'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <span className="block text-[10.5px] sm:text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">
                  1. កត់ត្រា Sheet
                </span>
                <span className="block text-[9.5px] text-emerald-600 font-bold">✓ រួចរាល់</span>
              </div>

              {/* Step 2: Warehouse In */}
              <div className="text-center space-y-1">
                <div
                  className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ${
                    isStage2Complete
                      ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-950'
                      : 'bg-slate-200 text-slate-500 dark:bg-slate-800'
                  }`}
                >
                  <Package className="w-4 h-4" />
                </div>
                <span className="block text-[10.5px] sm:text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">
                  2. ចូលឃ្លាំង
                </span>
                <span
                  className={`block text-[9.5px] font-bold ${
                    isStage2Complete ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  {isStage2Complete ? '✓ បានស្កេន' : 'មិនទាន់ស្កេន'}
                </span>
              </div>

              {/* Step 3: Out for Delivery */}
              <div className="text-center space-y-1">
                <div
                  className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ${
                    isStage3Complete
                      ? 'bg-purple-600 text-white ring-4 ring-purple-100 dark:ring-purple-950'
                      : 'bg-slate-200 text-slate-500 dark:bg-slate-800'
                  }`}
                >
                  <Truck className="w-4 h-4" />
                </div>
                <span className="block text-[10.5px] sm:text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">
                  3. កំពុងដឹក
                </span>
                <span
                  className={`block text-[9.5px] font-bold ${
                    isStage3Complete ? 'text-purple-600' : 'text-slate-400'
                  }`}
                >
                  {isStage3Complete
                    ? allOutOfDelivery.length > 1
                      ? `✓ ដឹក ${allOutOfDelivery.length} លើក`
                      : '✓ Rider'
                    : 'មិនទាន់ស្កេន'}
                </span>
              </div>

              {/* Step 4: Final Delivered */}
              <div className="text-center space-y-1">
                <div
                  className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ${
                    isStage4Complete
                      ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 dark:ring-emerald-950'
                      : 'bg-slate-200 text-slate-500 dark:bg-slate-800'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span className="block text-[10.5px] sm:text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">
                  4. ចែកចាយចប់
                </span>
                <span
                  className={`block text-[9.5px] font-bold ${
                    isStage4Complete ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  {statusCfg.isDelivered ? '✓ DELIVERED' : distReport ? '✓ បានកត់ត្រា' : 'រង់ចាំ'}
                </span>
              </div>
            </div>
          </div>

          {/* ======================================================================= */}
          {/* C. DETAILED LIFECYCLE STAGES OR ZERO-SCAN GRACEFUL CARD */}
          {/* ======================================================================= */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-blue-500" />
                <span>កំណត់ត្រាដំណាក់កាលស្កេនលម្អិត (Warehouse Stages Detail)</span>
              </h3>
            </div>

            {/* If NO warehouse scans exist yet, present a clean, elegant status-linked card */}
            {!hasAnyScan ? (
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      statusCfg.isDelivered
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    {statusCfg.isDelivered ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <AlertCircle className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      {statusCfg.isDelivered
                        ? 'កញ្ចប់ទំនិញត្រូវបានបញ្ជាក់ថា DELIVERED រួចរាល់ក្នុង Google Sheets'
                        : 'កញ្ចប់ទំនិញនេះមិនទាន់មានប្រវត្តិស្កេនក្នុងប្រព័ន្ធឃ្លាំង'}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {statusCfg.isDelivered
                        ? `ទិន្នន័យជាក់ស្ដែងបង្ហាញស្ថានភាព «DELIVERED» ដោយជោគជ័យ។ កញ្ចប់នេះត្រូវបានដំណើរការដឹកជញ្ជូនរួចរាល់ ដូច្នេះមិនមានប្រតិបត្តិការស្កេនឃ្លាំងបន្ថែមទៀតឡើយ។`
                        : `កញ្ចប់ទំនិញនេះត្រូវបាននាំចូលពីបញ្ជីទិន្នន័យ Google Sheets ប៉ុន្តែមិនទាន់បានឆ្លងកាត់ការស្កេន (Scan In, Out, ឬ Rider) ក្នុងប្រព័ន្ធ Warehouse Management នៅឡើយទេ។`}
                    </p>
                  </div>
                </div>

                {onOpenDistModal && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenDistModal(barcode);
                      }}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>+ កត់ត្រារបាយការណ៍ចែកចាយ</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* If scans exist, render sleek timeline feed */
              <div className="relative pl-6 space-y-3.5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                {/* 1. SCAN IN */}
                <div className="relative">
                  <div
                    className={`absolute -left-6 top-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-xs ${
                      scanIn
                        ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-950'
                        : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
                    }`}
                  >
                    {scanIn ? '✓' : '1'}
                  </div>
                  <div
                    className={`rounded-xl p-3 border transition ${
                      scanIn
                        ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60'
                        : 'bg-slate-50/50 dark:bg-slate-900/30 border-dashed border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>📥 ស្កេនចូលឃ្លាំង (Scan In)</span>
                        {scanIn && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            បានចូលឃ្លាំង
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {scanIn ? formatDateTime(scanIn.date, scanIn.createdAt) : 'គ្មាន'}
                      </span>
                    </div>

                    {scanIn && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 text-xs text-slate-600 dark:text-slate-400 pt-1.5 border-t border-blue-100/80 dark:border-blue-900/40">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">ទីតាំងធ្នើរ (Shelf):</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {scanIn.shelfLocation || scanIn.location || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">ឡាន / អ្នកដឹក:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {scanIn.truckNo || scanIn.driverName || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">អ្នកស្កេន:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                            {scanIn.createdBy || scanIn.operatorEmail || '—'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. OUT OF DELIVERY (WITH ATTEMPT COUNTER) */}
                <div className="relative">
                  <div
                    className={`absolute -left-6 top-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-xs ${
                      outOfDelivery
                        ? 'bg-purple-600 text-white ring-4 ring-purple-100 dark:ring-purple-950'
                        : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
                    }`}
                  >
                    {outOfDelivery ? '✓' : '2'}
                  </div>
                  <div
                    className={`rounded-xl p-3 border transition ${
                      outOfDelivery
                        ? 'bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900/60'
                        : 'bg-slate-50/50 dark:bg-slate-900/30 border-dashed border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                        <span>🛵 ចេញចែកចាយតាម Rider (Out for Delivery)</span>
                        {outOfDelivery && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                            {allOutOfDelivery.length > 1
                              ? `ចេញដឹក ${allOutOfDelivery.length} លើក (Attempts)`
                              : 'With Rider'}
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {outOfDelivery ? formatDateTime(outOfDelivery.date, outOfDelivery.createdAt) : 'គ្មាន'}
                      </span>
                    </div>

                    {allOutOfDelivery.length > 1 ? (
                      /* Multiple delivery attempts breakdown */
                      <div className="space-y-2 mt-2 pt-2 border-t border-purple-100/80 dark:border-purple-900/40">
                        <span className="text-[10.5px] font-bold text-purple-900 dark:text-purple-200 block">
                          ប្រវត្តិចេញដឹកតាម Rider ជាក់ស្ដែង ({allOutOfDelivery.length} លើក)៖
                        </span>
                        <div className="space-y-1.5">
                          {allOutOfDelivery.map((item, idx) => (
                            <div
                              key={item.id || idx}
                              className="p-2 rounded-lg bg-white/90 dark:bg-purple-950/40 border border-purple-200/80 dark:border-purple-900/60 text-xs"
                            >
                              <div className="flex items-center justify-between gap-1 flex-wrap">
                                <span className="font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                                  <span className="w-4 h-4 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200 text-[10px] flex items-center justify-center font-mono">
                                    {idx + 1}
                                  </span>
                                  <span>លើកទី {idx + 1}៖ {item.riderName || 'Rider'}</span>
                                  {item.riderPhone && (
                                    <span className="font-mono text-slate-500 font-normal">({item.riderPhone})</span>
                                  )}
                                </span>
                                <span className="text-[10.5px] font-mono text-slate-400">
                                  {formatDateTime(item.date, item.createdAt)}
                                </span>
                              </div>
                              {(item.deliveryZone || item.remarks) && (
                                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 pl-5">
                                  {item.deliveryZone && <span className="font-medium">តំបន់៖ {item.deliveryZone} </span>}
                                  {item.remarks && <span className="italic text-slate-500">({item.remarks})</span>}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : outOfDelivery ? (
                      /* Single delivery attempt */
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 text-xs text-slate-600 dark:text-slate-400 pt-1.5 border-t border-purple-100/80 dark:border-purple-900/40">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">ឈ្មោះ Rider:</span>
                          <span className="font-bold text-purple-700 dark:text-purple-300">
                            {outOfDelivery.riderName || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">លេខទូរស័ព្ទ Rider:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {outOfDelivery.riderPhone || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">តំបន់ (Zone):</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {outOfDelivery.deliveryZone || '—'}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* 3. HOLD REMAINING (IF ANY - INTERMEDIATE RETURNS TO WAREHOUSE) */}
                {allHolds.length > 0 && (
                  <div className="relative">
                    <div className="absolute -left-6 top-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-xs bg-amber-600 text-white ring-4 ring-amber-100 dark:ring-amber-950">
                      !
                    </div>
                    <div className="rounded-xl p-3 border bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-900/60 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                          <span>⏳ ស្កេននៅសល់ឃ្លាំង / ជំពាក់ (Hold Remaining)</span>
                          {allHolds.length > 1 && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                              {allHolds.length} ដង
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {formatDateTime(holdRemaining?.date, holdRemaining?.createdAt)}
                        </span>
                      </div>

                      {allHolds.map((h, hIdx) => (
                        <div
                          key={h.id || hIdx}
                          className="p-2 rounded-lg bg-white/80 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/60 text-xs"
                        >
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <span className="text-[10.5px] font-bold text-amber-900 dark:text-amber-200">
                              {allHolds.length > 1 ? `នៅសល់លើកទី ${hIdx + 1}៖ ` : 'មូលហេតុនៅសល់៖ '}
                              <span className="text-amber-800 dark:text-amber-300 font-semibold">
                                {h.holdReason || h.remarks || 'មិនបានបញ្ជាក់'}
                              </span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {formatDateTime(h.date, h.createdAt)}
                            </span>
                          </div>
                          {h.shelfLocation && (
                            <span className="text-[10.5px] text-slate-500 block mt-0.5">
                              ធ្នើរទុក៖ {h.shelfLocation}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. SCAN OUT (IF ANY) */}
                {scanOut && (
                  <div className="relative">
                    <div className="absolute -left-6 top-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-xs bg-slate-700 text-white ring-4 ring-slate-100 dark:ring-slate-800">
                      ✓
                    </div>
                    <div className="rounded-xl p-3 border bg-slate-100/70 dark:bg-slate-800/60 border-slate-300 dark:border-slate-700">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>📤 ស្កេនចេញពីឃ្លាំង (Scan Out)</span>
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {formatDateTime(scanOut.date, scanOut.createdAt)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-600 dark:text-slate-400">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">មូលហេតុ:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {scanOut.outReason || 'Transfer / Delivery'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">ឡាន / អ្នកទទួល:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {scanOut.truckNo || scanOut.driverName || '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. DISTRIBUTION REPORT */}
                <div className="relative">
                  <div
                    className={`absolute -left-6 top-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-xs ${
                      distReport
                        ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 dark:ring-emerald-950'
                        : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
                    }`}
                  >
                    {distReport ? '✓' : '5'}
                  </div>
                  <div
                    className={`rounded-xl p-3 border transition ${
                      distReport
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                        : 'bg-slate-50/50 dark:bg-slate-900/30 border-dashed border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>🚚 របាយការណ៍ចែកចាយ (Distribution Report)</span>
                        {distReport && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            បានកត់ត្រា
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {distReport ? distReport.date : 'គ្មាន'}
                      </span>
                    </div>

                    {distReport ? (
                      <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-600 dark:text-slate-400 pt-1.5 border-t border-emerald-100 dark:border-emerald-900/40">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">អ្នកចែកចាយ:</span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-300">
                            {distReport.name}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">កាលបរិច្ឆេទ:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {distReport.date}
                          </span>
                        </div>
                      </div>
                    ) : (
                      onOpenDistModal && (
                        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                          <span className="text-[11px] text-slate-400 italic">មិនទាន់បានកត់ត្រា</span>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenDistModal(barcode);
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 transition cursor-pointer"
                          >
                            + កត់ត្រាចែកចាយ
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ======================================================================= */}
          {/* D. ACTIVITY LOGS (IF MULTIPLE SCANS EXIST) */}
          {/* ======================================================================= */}
          {scans.length > 0 && (
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>កំណត់ត្រាស្កេនតាមលំដាប់លំដោយ (Activity Log: {scans.length})</span>
              </h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                {scans.map((s, i) => (
                  <div
                    key={s.id || i}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 text-xs flex items-center justify-between gap-2 shadow-2xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                          s.scanType === 'SCAN_IN'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            : s.scanType === 'OUT_OF_DELIVERY'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                            : s.scanType === 'HOLD_REMAINING'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {s.scanType}
                      </span>
                      <span className="text-slate-700 dark:text-slate-300 truncate">
                        {s.scanType === 'OUT_OF_DELIVERY'
                          ? `Rider: ${s.riderName || '—'} (${s.riderPhone || ''})`
                          : s.scanType === 'HOLD_REMAINING'
                          ? `Hold: ${s.holdReason || s.remarks || '—'}`
                          : s.scanType === 'SCAN_IN'
                          ? `Shelf: ${s.shelfLocation || s.location || '—'}`
                          : `Reason: ${s.outReason || '—'}`}
                      </span>
                    </div>
                    <span className="text-[10.5px] font-mono text-slate-400 shrink-0">
                      {formatDateTime(s.date, s.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 3. MODAL FOOTER */}
        {/* ========================================================================= */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/80 flex items-center justify-between gap-3">
          {onOpenDistModal ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDistModal(barcode);
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/20 transition cursor-pointer flex items-center gap-1.5"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>កត់ត្រារបាយការណ៍ចែកចាយ</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer"
          >
            បិទ (Close)
          </button>
        </div>
      </div>
    </div>
  );
};
