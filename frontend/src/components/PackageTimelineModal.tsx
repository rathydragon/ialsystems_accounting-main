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
  Building2,
  Tag,
  CreditCard,
  UserCheck,
  FileSpreadsheet,
  Layers,
  ArrowRight
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen || !barcode) return null;

  const handleCopy = (text: string, key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // Helper to extract fields from rowData using columns metadata if available
  const getField = (candidates: string[]): string => {
    if (!rowData) return '';

    // 1. Try finding matching column definition first
    if (columns && columns.length > 0) {
      for (const cand of candidates) {
        const target = cand.trim().toLowerCase();
        const exactCol = columns.find((c) => {
          const lbl = (c.label || '').trim().toLowerCase();
          const id = (c.id || '').trim().toLowerCase();
          return lbl === target || id === target;
        });
        if (exactCol && rowData[exactCol.id] !== undefined && rowData[exactCol.id] !== null) {
          const val = String(rowData[exactCol.id]).trim();
          if (val && val !== '—') return val;
        }

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

  // Extract phone number from consignee string if present
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
        bannerBg: 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800',
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
        bannerBg: 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60',
        labelKh: 'បានចែកចាយជោគជ័យ (Delivered)',
        isDelivered: true,
        isUpleft: false,
        raw
      };
    }
    if (upper === 'UPLEFT') {
      return {
        badgeBg: 'bg-rose-500/10 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-500/30',
        dotClass: 'bg-rose-500 animate-pulse',
        bannerBg: 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60',
        labelKh: 'កញ្ចប់ទំនិញនៅសល់ / មិនទាន់ចែកចាយចប់ (Upleft)',
        isDelivered: false,
        isUpleft: true,
        raw
      };
    }
    if (upper.includes('HOLD') || upper.includes('DELAY') || upper.includes('PENDING')) {
      return {
        badgeBg: 'bg-amber-500/10 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-500/30',
        dotClass: 'bg-amber-500',
        bannerBg: 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60',
        labelKh: 'កញ្ចប់កំពុងរង់ចាំ / នៅសល់ (Pending/Hold)',
        isDelivered: false,
        isUpleft: false,
        raw
      };
    }
    return {
      badgeBg: 'bg-blue-500/10 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-500/30',
      dotClass: 'bg-blue-500',
      bannerBg: 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60',
      labelKh: `ស្ថានភាព៖ ${raw}`,
      isDelivered: false,
      isUpleft: false,
      raw
    };
  };

  const statusCfg = getStatusBadgeConfig(status);

  // Categorize warehouse scans
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl sm:max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================================= */}
        {/* 1. COMPACT SLEEK HEADER */}
        {/* ========================================================================= */}
        <div className="px-4.5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/20">
              <Package className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
                ដំណើរការកញ្ចប់ទំនិញ
              </h2>
              {/* Barcode Copy Pill */}
              <button
                type="button"
                onClick={(e) => handleCopy(barcode, 'barcode', e)}
                title="ចុចដើម្បីចម្លង Barcode"
                className="group inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-roboto text-[14px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:hover:bg-blue-900 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 transition cursor-pointer"
              >
                <span>{barcode}</span>
                {copiedKey === 'barcode' ? (
                  <Check className="w-3 h-3 text-emerald-600 animate-in zoom-in-75 duration-100" />
                ) : (
                  <Copy className="w-3 h-3 text-blue-400 group-hover:text-blue-600 transition" />
                )}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="បិទ (Close)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* 2. BODY CONTENT (COMPACT & LOGICALLY ORDERED) */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3.5 sm:p-4.5 space-y-3">
          {/* ======================================================================= */}
          {/* A. STATUS & ESSENTIAL SUMMARY STRIP */}
          {/* ======================================================================= */}
          <div
            className={`rounded-xl border p-2.5 sm:p-3 flex items-center justify-between gap-2.5 flex-wrap ${statusCfg.bannerBg}`}
          >
            {/* Status Pill & Khmer Meaning */}
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-2xs ${statusCfg.badgeBg}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dotClass}`} />
                <span>{status || 'PENDING'}</span>
              </span>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                {statusCfg.labelKh}
              </span>
            </div>

            {/* Quick Meta: Date & Payment */}
            <div className="flex items-center gap-2 text-xs flex-wrap ml-auto">
              {(payment || usdAmount || khmAmount) && (
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 font-medium text-slate-700 dark:text-slate-300">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-bold">
                    {payment || 'AC'}
                    {usdAmount ? ` $${usdAmount}` : ''}
                    {khmAmount ? ` ${khmAmount}៛` : ''}
                  </span>
                </div>
              )}
              {sheetDate && (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>{sheetDate}</span>
                </div>
              )}
            </div>
          </div>

          {/* ======================================================================= */}
          {/* B. BENTO GRID: DESTINATION & CONSIGNEE / SHIPPER & GOODS */}
          {/* ======================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            {/* Card 1: 📍 ទិសដៅ & អ្នកទទួល (Destination & Consignee) */}
            <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 flex flex-col justify-between space-y-2">
              {/* Destination */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1">
                  <MapPin className="w-3 h-3 text-blue-500" />
                  <span>ទិសដៅចែកចាយ (Destination)</span>
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {destination || 'មិនបានបញ្ជាក់'}
                  </span>
                  {(teams || origin) && (
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                      {teams || ''} {origin ? `(${origin})` : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Consignee */}
              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-0.5">
                  <UserCheck className="w-3 h-3 text-emerald-500" />
                  <span>អ្នកទទួល (Consignee)</span>
                </span>
                <p className="font-bold text-slate-800 dark:text-slate-200 text-xs leading-snug">
                  {consigneeInfo.name || '—'}
                </p>
                {consigneeInfo.phone && (
                  <button
                    type="button"
                    onClick={(e) => handleCopy(consigneeInfo.phone, 'consignee_phone', e)}
                    title="ចុចដើម្បីចម្លងលេខទូរស័ព្ទ"
                    className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 text-[11px] font-mono font-bold transition cursor-pointer"
                  >
                    <Phone className="w-3 h-3 text-emerald-600" />
                    <span>{consigneeInfo.phone}</span>
                    {copiedKey === 'consignee_phone' ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-2.5 h-2.5 opacity-60" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Card 2: 🏢 អ្នកផ្ញើ & ព័ត៌មានទំនិញ (Shipper & Details) */}
            <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 flex flex-col justify-between space-y-2">
              {/* Shipper */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1">
                  <Building2 className="w-3 h-3 text-indigo-500" />
                  <span>អ្នកផ្ញើ (Shipper)</span>
                </span>
                <p className="font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-[13px] leading-snug">
                  {shipper || '—'}
                </p>
              </div>

              {/* Goods Description */}
              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-0.5">
                  <Tag className="w-3 h-3 text-amber-500" />
                  <span>បរិយាយទំនិញ (Description)</span>
                </span>
                <p className="font-semibold text-slate-700 dark:text-slate-300 text-xs leading-snug truncate">
                  {description || '—'}
                </p>
              </div>
            </div>
          </div>

          {/* ======================================================================= */}
          {/* C. VISUAL STEPPER (COMPACT 4 STAGES) */}
          {/* ======================================================================= */}
          <div className="p-3 rounded-xl bg-slate-50/60 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 text-[11px]">
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                <span>វដ្ដដំណើរការកញ្ចប់ (Progress Stepper)</span>
              </span>
              <span className="text-[10.5px] font-semibold text-slate-500">
                ស្កេនឃ្លាំង៖ {scans.length} ដង
              </span>
            </div>

            {/* Stepper Steps with Connecting Line */}
            <div className="relative grid grid-cols-4 gap-1.5">
              {/* Connecting background line */}
              <div className="absolute top-3.5 left-8 right-8 h-0.5 bg-slate-200 dark:bg-slate-800 z-0" />

              {/* Step 1: Sheet Registered */}
              <div className="relative z-1 text-center space-y-1">
                <div
                  className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center text-xs font-bold transition shadow-2xs ${
                    isStage1Complete
                      ? 'bg-blue-600 text-white ring-2 ring-blue-100 dark:ring-blue-950'
                      : 'bg-slate-200 text-slate-500 dark:bg-slate-800'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                </div>
                <span className="block text-[10.5px] font-bold text-slate-800 dark:text-slate-200 truncate">
                  1. កត់ត្រា Sheet
                </span>
                <span className="block text-[9px] text-emerald-600 font-bold">✓ រួចរាល់</span>
              </div>

              {/* Step 2: Warehouse In */}
              <div className="relative z-1 text-center space-y-1">
                <div
                  className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center text-xs font-bold transition shadow-2xs ${
                    isStage2Complete
                      ? 'bg-blue-600 text-white ring-2 ring-blue-100 dark:ring-blue-950'
                      : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                </div>
                <span className="block text-[10.5px] font-bold text-slate-800 dark:text-slate-200 truncate">
                  2. ចូលឃ្លាំង
                </span>
                <span
                  className={`block text-[9px] font-bold ${
                    isStage2Complete ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  {isStage2Complete ? '✓ ស្កេនរួច' : 'មិនទាន់ស្កេន'}
                </span>
              </div>

              {/* Step 3: Out for Delivery */}
              <div className="relative z-1 text-center space-y-1">
                <div
                  className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center text-xs font-bold transition shadow-2xs ${
                    isStage3Complete
                      ? 'bg-purple-600 text-white ring-2 ring-purple-100 dark:ring-purple-950'
                      : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                </div>
                <span className="block text-[10.5px] font-bold text-slate-800 dark:text-slate-200 truncate">
                  3. កំពុងដឹក
                </span>
                <span
                  className={`block text-[9px] font-bold ${
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
              <div className="relative z-1 text-center space-y-1">
                <div
                  className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center text-xs font-bold transition shadow-2xs ${
                    isStage4Complete
                      ? 'bg-emerald-600 text-white ring-2 ring-emerald-100 dark:ring-emerald-950'
                      : 'bg-slate-200 text-slate-400 dark:bg-slate-800'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <span className="block text-[10.5px] font-bold text-slate-800 dark:text-slate-200 truncate">
                  4. ចែកចាយចប់
                </span>
                <span
                  className={`block text-[9px] font-bold ${
                    isStage4Complete ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  {statusCfg.isDelivered ? '✓ DELIVERED' : distReport ? '✓ បានកត់ត្រា' : 'រង់ចាំ'}
                </span>
              </div>
            </div>
          </div>

          {/* ======================================================================= */}
          {/* D. WAREHOUSE STAGES DETAIL / TIMELINE (SPACE-EFFICIENT & ORDERED) */}
          {/* ======================================================================= */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-blue-500" />
                <span>កំណត់ត្រាដំណាក់កាលស្កេនឃ្លាំង (Warehouse Timeline)</span>
              </h3>
            </div>

            {/* If NO warehouse scans exist yet: Elegant, Space-Saving Banner */}
            {!hasAnyScan ? (
              <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/60 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0 text-xs">
                  <h4 className="font-bold text-amber-900 dark:text-amber-200">
                    កញ្ចប់ទំនិញនេះមិនទាន់មានប្រវត្តិស្កេនក្នុងប្រព័ន្ធឃ្លាំង
                  </h4>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed mt-0.5">
                    ទិន្នន័យត្រូវបាននាំចូលពី Google Sheets ប៉ុន្តែមិនទាន់បានឆ្លងកាត់ការស្កេន (Scan In, Out, ឬ Rider) នៅឡើយទេ។
                  </p>
                </div>
              </div>
            ) : (
              /* If scans exist: Unified Chronological Timeline Feed */
              <div className="relative pl-5 space-y-2.5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                {/* 1. SCAN IN */}
                {scanIn && (
                  <div className="relative">
                    <div className="absolute -left-5 top-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold bg-blue-600 text-white ring-2 ring-blue-100 dark:ring-blue-950">
                      ✓
                    </div>
                    <div className="rounded-xl p-2.5 border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60 text-xs">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>📥 ស្កេនចូលឃ្លាំង (Scan In)</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            ចូលឃ្លាំង
                          </span>
                        </span>
                        <span className="text-[10.5px] text-slate-500 font-mono">
                          {formatDateTime(scanIn.date, scanIn.createdAt)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1.5 pt-1.5 border-t border-blue-100/80 dark:border-blue-900/40 text-[11px]">
                        <div>
                          <span className="text-slate-400 block text-[10px]">ទីតាំងធ្នើរ (Shelf):</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {scanIn.shelfLocation || scanIn.location || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">ឡាន / អ្នកដឹក:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {scanIn.truckNo || scanIn.driverName || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">អ្នកស្កេន:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                            {scanIn.createdBy || scanIn.operatorEmail || '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. OUT OF DELIVERY */}
                {outOfDelivery && (
                  <div className="relative">
                    <div className="absolute -left-5 top-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold bg-purple-600 text-white ring-2 ring-purple-100 dark:ring-purple-950">
                      ✓
                    </div>
                    <div className="rounded-xl p-2.5 border bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900/60 text-xs">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                          <span>🛵 ចេញចែកចាយតាម Rider</span>
                          {allOutOfDelivery.length > 1 ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                              ដឹក {allOutOfDelivery.length} លើក
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                              With Rider
                            </span>
                          )}
                        </span>
                        <span className="text-[10.5px] text-slate-500 font-mono">
                          {formatDateTime(outOfDelivery.date, outOfDelivery.createdAt)}
                        </span>
                      </div>

                      {allOutOfDelivery.length > 1 ? (
                        <div className="space-y-1.5 mt-1.5 pt-1.5 border-t border-purple-100/80 dark:border-purple-900/40">
                          {allOutOfDelivery.map((item, idx) => (
                            <div
                              key={item.id || idx}
                              className="p-1.5 rounded-lg bg-white/90 dark:bg-purple-950/40 border border-purple-200/80 dark:border-purple-900/60 text-[11px] flex items-center justify-between gap-1 flex-wrap"
                            >
                              <span className="font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1">
                                <span className="w-3.5 h-3.5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200 text-[9px] flex items-center justify-center font-mono">
                                  {idx + 1}
                                </span>
                                <span>លើកទី {idx + 1}៖ {item.riderName || 'Rider'}</span>
                                {item.riderPhone && (
                                  <span className="font-mono text-slate-500 font-normal">({item.riderPhone})</span>
                                )}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                {formatDateTime(item.date, item.createdAt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1.5 pt-1.5 border-t border-purple-100/80 dark:border-purple-900/40 text-[11px]">
                          <div>
                            <span className="text-slate-400 block text-[10px]">ឈ្មោះ Rider:</span>
                            <span className="font-bold text-purple-700 dark:text-purple-300">
                              {outOfDelivery.riderName || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">លេខទូរស័ព្ទ:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                              {outOfDelivery.riderPhone || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px]">តំបន់ (Zone):</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {outOfDelivery.deliveryZone || '—'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. HOLD REMAINING */}
                {allHolds.length > 0 && (
                  <div className="relative">
                    <div className="absolute -left-5 top-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold bg-amber-600 text-white ring-2 ring-amber-100 dark:ring-amber-950">
                      !
                    </div>
                    <div className="rounded-xl p-2.5 border bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-900/60 text-xs space-y-1.5">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                          <span>⏳ ស្កេននៅសល់ឃ្លាំង (Hold Remaining)</span>
                          {allHolds.length > 1 && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                              {allHolds.length} ដង
                            </span>
                          )}
                        </span>
                        <span className="text-[10.5px] text-slate-500 font-mono">
                          {formatDateTime(holdRemaining?.date, holdRemaining?.createdAt)}
                        </span>
                      </div>

                      {allHolds.map((h, hIdx) => (
                        <div
                          key={h.id || hIdx}
                          className="p-1.5 rounded-lg bg-white/80 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/60 text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <span className="font-semibold text-amber-900 dark:text-amber-200">
                              {allHolds.length > 1 ? `លើកទី ${hIdx + 1}៖ ` : 'មូលហេតុ៖ '}
                              <span className="text-amber-800 dark:text-amber-300 font-bold">
                                {h.holdReason || h.remarks || 'មិនបានបញ្ជាក់'}
                              </span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {formatDateTime(h.date, h.createdAt)}
                            </span>
                          </div>
                          {h.shelfLocation && (
                            <span className="text-[10px] text-slate-500 block mt-0.5">
                              ធ្នើរទុក៖ {h.shelfLocation}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. SCAN OUT */}
                {scanOut && (
                  <div className="relative">
                    <div className="absolute -left-5 top-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold bg-slate-700 text-white ring-2 ring-slate-100 dark:ring-slate-800">
                      ✓
                    </div>
                    <div className="rounded-xl p-2.5 border bg-slate-100/70 dark:bg-slate-800/60 border-slate-300 dark:border-slate-700 text-xs">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className="font-bold text-slate-900 dark:text-white">
                          📤 ស្កេនចេញពីឃ្លាំង (Scan Out)
                        </span>
                        <span className="text-[10.5px] text-slate-500 font-mono">
                          {formatDateTime(scanOut.date, scanOut.createdAt)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-700 text-[11px]">
                        <div>
                          <span className="text-slate-400 block text-[10px]">មូលហេតុ:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {scanOut.outReason || 'Transfer / Delivery'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">ឡាន / អ្នកទទួល:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {scanOut.truckNo || scanOut.driverName || '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. DISTRIBUTION REPORT */}
                {distReport && (
                  <div className="relative">
                    <div className="absolute -left-5 top-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold bg-emerald-600 text-white ring-2 ring-emerald-100 dark:ring-emerald-950">
                      ✓
                    </div>
                    <div className="rounded-xl p-2.5 border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-xs">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>🚚 របាយការណ៍ចែកចាយ (Distribution Report)</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            បានកត់ត្រា
                          </span>
                        </span>
                        <span className="text-[10.5px] text-slate-500 font-mono">
                          {distReport.date}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-1.5 pt-1.5 border-t border-emerald-100 dark:border-emerald-900/40 text-[11px]">
                        <div>
                          <span className="text-slate-400 block text-[10px]">អ្នកចែកចាយ:</span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-300">
                            {distReport.name}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">កាលបរិច្ឆេទ:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {distReport.date}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. COMPACT FOOTER */}
        {/* ========================================================================= */}
        <div className="px-4.5 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 flex items-center justify-between gap-3">
          {onOpenDistModal ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDistModal(barcode);
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>+ កត់ត្រារបាយការណ៍ចែកចាយ</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer active:scale-95"
          >
            បិទ (Close)
          </button>
        </div>
      </div>
    </div>
  );
};
