import React, { useEffect, useState } from 'react';
import {
  X,
  Package,
  Calendar,
  Phone,
  Truck,
  MapPin,
  CheckCircle2,
  Copy,
  Check,
  History,
  Building2,
  Tag,
  CreditCard,
  UserCheck,
  FileSpreadsheet,
  PackageCheck,
  Bike,
  Hourglass,
  ArrowUpFromLine,
  Warehouse,
  ClipboardCheck,
  ScanLine,
  Undo2,
  PackagePlus
} from 'lucide-react';
import { WarehouseScanItem, DistributionReportItem } from '../types';
import { SheetRowData, SheetColumnDef } from '../utils/googleSheetFetcher';
import { copyText } from '../utils/clipboard';

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

type Tone = 'blue' | 'violet' | 'amber' | 'slate' | 'teal' | 'emerald' | 'rose';

const TONE_ICON: Record<Tone, string> = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/70 dark:text-blue-300',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/70 dark:text-violet-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/70 dark:text-amber-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  teal: 'bg-teal-50 text-teal-600 dark:bg-teal-950/70 dark:text-teal-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-300',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/70 dark:text-rose-300'
};

const TONE_CHIP: Record<Tone, string> = {
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  teal: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
};

interface TimelineEvent {
  key: string;
  tone: Tone;
  icon: React.ElementType;
  title: string;
  badge?: string;
  time: string;
  fields?: [string, React.ReactNode][];
  extra?: React.ReactNode;
}

const PHONE_RE = /(?:\+?855|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{3,4}/g;

// Split "Name 012 345 678 / 077 888 999" into name + phones so each phone can be copied on its own
const splitNamePhone = (raw: string) => {
  if (!raw) return { name: '', phones: [] as string[] };
  const phones = Array.from(new Set((raw.match(PHONE_RE) || []).map((p) => p.trim())));
  if (!phones.length) return { name: raw, phones };
  const name = raw.replace(PHONE_RE, ' ').replace(/[៖:\-\/,]/g, ' ').replace(/\s+/g, ' ').trim();
  return { name: name || raw, phones };
};

const SectionTitle: React.FC<{ icon: React.ElementType; title: string; right?: React.ReactNode }> = ({
  icon: Icon,
  title,
  right
}) => (
  <div className="flex items-center justify-between gap-2 mb-2">
    <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
      <Icon className="w-3.5 h-3.5 text-slate-400" />
      {title}
    </h3>
    {right}
  </div>
);

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

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !barcode) return null;

  const handleCopy = (text: string, key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    copyText(text);
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

  const consigneeInfo = splitNamePhone(rawConsignee);
  const shipperInfo = splitNamePhone(shipper);

  // Status pill styling and label resolution
  const getStatusConfig = (statusStr: string) => {
    const raw = (statusStr || '').trim();
    const upper = raw.toUpperCase();
    if (!raw) {
      return {
        pill: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        dot: 'bg-slate-400',
        labelKh: 'មិនមានស្ថានភាពក្នុង Sheet',
        isDelivered: false
      };
    }
    if (upper === 'DELIVERED') {
      return {
        pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
        dot: 'bg-emerald-500',
        labelKh: 'បានចែកចាយជោគជ័យ',
        isDelivered: true
      };
    }
    if (upper === 'UPLEFT') {
      return {
        pill: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
        dot: 'bg-rose-500',
        labelKh: 'នៅសល់ / មិនទាន់ចែកចាយចប់',
        isDelivered: false
      };
    }
    if (upper.includes('HOLD') || upper.includes('DELAY') || upper.includes('PENDING')) {
      return {
        pill: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
        dot: 'bg-amber-500',
        labelKh: 'កំពុងរង់ចាំ / នៅសល់',
        isDelivered: false
      };
    }
    return {
      pill: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
      dot: 'bg-blue-500',
      labelKh: '',
      isDelivered: false
    };
  };

  const statusCfg = getStatusConfig(status);

  // Categorize warehouse scans
  const allScanIns = scans.filter((s) => s.scanType === 'SCAN_IN');
  const allOutOfDelivery = scans.filter((s) => s.scanType === 'OUT_OF_DELIVERY');
  const allHolds = scans.filter((s) => s.scanType === 'HOLD_REMAINING');
  const allScanOuts = scans.filter((s) => s.scanType === 'SCAN_OUT');
  const allArrivals = scans.filter((s) => s.scanType === 'ARRIVED_HUB');
  const allReturns = scans.filter((s) => s.scanType === 'RETURN_SHIPMENTS');
  const allPickups = scans.filter((s) => s.scanType === 'CUSTOMER_PICKUP');

  const scanIn = allScanIns.slice(-1)[0];
  const outOfDelivery = allOutOfDelivery.slice(-1)[0];
  const holdRemaining = allHolds.slice(-1)[0];
  const scanOut = allScanOuts.slice(-1)[0];
  const arrived = allArrivals.slice(-1)[0];
  const returned = allReturns.slice(-1)[0];
  const pickup = allPickups.slice(-1)[0];

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

  // Stepper stages
  const steps = [
    { label: 'កត់ត្រា Sheet', sub: 'រួចរាល់', done: true, icon: FileSpreadsheet },
    { label: 'ចូលឃ្លាំង', sub: scanIn ? 'ស្កេនរួច' : 'មិនទាន់ស្កេន', done: !!scanIn, icon: Package },
    {
      label: 'កំពុងដឹក',
      sub: outOfDelivery ? (allOutOfDelivery.length > 1 ? `ដឹក ${allOutOfDelivery.length} លើក` : 'ជាមួយ Rider') : 'មិនទាន់ស្កេន',
      done: !!outOfDelivery,
      icon: Truck
    },
    {
      label: 'ចែកចាយចប់',
      sub: statusCfg.isDelivered ? 'Delivered' : distReport ? 'បានកត់ត្រា' : 'រង់ចាំ',
      done: statusCfg.isDelivered || !!distReport,
      icon: CheckCircle2
    }
  ];
  const currentStep = steps.findIndex((s) => !s.done);

  // Unified chronological feed of warehouse events
  const events: TimelineEvent[] = [];
  if (pickup) {
    events.push({
      key: 'pickup',
      tone: 'teal',
      icon: PackagePlus,
      title: 'ទទួលពីអតិថិជនផ្ទាល់',
      badge: allPickups.length > 1 ? `${allPickups.length} ដង` : 'Customer',
      time: formatDateTime(pickup.date, pickup.createdAt),
      fields: [
        ['អ្នកបើកបរ', pickup.driverName],
        ['លេខឡាន', pickup.truckNo],
        ['ទម្ងន់', pickup.kgs !== undefined && pickup.kgs !== null ? `${pickup.kgs} Kg` : undefined],
        ['ចំនួន', pickup.pcs !== undefined && pickup.pcs !== null ? `${pickup.pcs} Pcs` : undefined],
        ['អ្នកស្កេន', pickup.createdBy || pickup.operatorEmail]
      ]
    });
  }
  if (scanIn) {
    events.push({
      key: 'in',
      tone: 'blue',
      icon: PackageCheck,
      title: 'ស្កេនចូលឃ្លាំង',
      badge: 'Scan In',
      time: formatDateTime(scanIn.date, scanIn.createdAt),
      fields: [
        ['ធ្នើរ', scanIn.shelfLocation || scanIn.location],
        ['ឡាន / អ្នកដឹក', scanIn.truckNo || scanIn.driverName],
        ['អ្នកស្កេន', scanIn.createdBy || scanIn.operatorEmail]
      ]
    });
  }
  if (outOfDelivery) {
    const multi = allOutOfDelivery.length > 1;
    events.push({
      key: 'ofd',
      tone: 'violet',
      icon: Bike,
      title: 'ចេញចែកចាយតាម Rider',
      badge: multi ? `${allOutOfDelivery.length} លើក` : 'With Rider',
      time: formatDateTime(outOfDelivery.date, outOfDelivery.createdAt),
      fields: multi
        ? undefined
        : [
            ['Rider', outOfDelivery.riderName],
            ['ទូរស័ព្ទ', outOfDelivery.riderPhone],
            ['តំបន់', outOfDelivery.deliveryZone]
          ],
      extra: multi ? (
        <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
          {allOutOfDelivery.map((item, idx) => (
            <li key={item.id || idx} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[12px]">
              <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                <span className="text-slate-400 tabular-nums mr-1.5">#{idx + 1}</span>
                <span className="font-medium">{item.riderName || 'Rider'}</span>
                {item.riderPhone && <span className="text-slate-400 ml-1.5 tabular-nums">{item.riderPhone}</span>}
              </span>
              <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">
                {formatDateTime(item.date, item.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : undefined
    });
  }
  if (allHolds.length > 0) {
    events.push({
      key: 'hold',
      tone: 'amber',
      icon: Hourglass,
      title: 'នៅសល់ក្នុងឃ្លាំង',
      badge: allHolds.length > 1 ? `${allHolds.length} ដង` : 'Hold',
      time: formatDateTime(holdRemaining?.date, holdRemaining?.createdAt),
      extra: (
        <ul className="mt-1.5 space-y-1">
          {allHolds.map((h, hIdx) => (
            <li key={h.id || hIdx} className="flex items-start justify-between gap-2 text-[12px]">
              <span className="min-w-0 text-slate-600 dark:text-slate-300">
                {allHolds.length > 1 ? `លើកទី ${hIdx + 1}៖ ` : 'មូលហេតុ៖ '}
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {h.holdReason || h.remarks || 'មិនបានបញ្ជាក់'}
                </span>
                {h.shelfLocation && <span className="text-slate-400"> · ធ្នើរ {h.shelfLocation}</span>}
              </span>
              {allHolds.length > 1 && (
                <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">
                  {formatDateTime(h.date, h.createdAt)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )
    });
  }
  if (scanOut) {
    events.push({
      key: 'out',
      tone: 'slate',
      icon: ArrowUpFromLine,
      title: 'ស្កេនចេញពីឃ្លាំង',
      badge: 'Scan Out',
      time: formatDateTime(scanOut.date, scanOut.createdAt),
      fields: [
        ['មូលហេតុ', scanOut.outReason || 'Transfer / Delivery'],
        ['ឡាន / អ្នកទទួល', scanOut.truckNo || scanOut.driverName]
      ]
    });
  }
  if (arrived) {
    events.push({
      key: 'arrived',
      tone: 'teal',
      icon: Warehouse,
      title: 'ទទួលចូល Hub',
      badge: arrived.arrivalStatus === 'UNEXPECTED' ? 'លើស/ខុសបញ្ជី' : 'Arrived',
      time: formatDateTime(arrived.date, arrived.createdAt),
      fields: [
        [
          'Hub / ទទួលពី',
          <>
            {arrived.destination || '—'}
            {arrived.sourceOperationCode && (
              <span className="ml-1 font-mono text-[11px] text-slate-400">{arrived.sourceOperationCode}</span>
            )}
          </>
        ],
        ['អ្នកទទួល', arrived.createdBy || arrived.operatorEmail]
      ]
    });
  }
  if (returned) {
    events.push({
      key: 'return',
      tone: 'rose',
      icon: Undo2,
      title: 'បង្វិលត្រឡប់ទៅម្ចាស់',
      badge: allReturns.length > 1 ? `${allReturns.length} ដង` : 'Return',
      time: formatDateTime(returned.date, returned.createdAt),
      fields: [
        ['មូលហេតុ', returned.holdReason || 'មិនបានបញ្ជាក់'],
        ['ចំណាំ', returned.remarks],
        ['អ្នកស្កេន', returned.createdBy || returned.operatorEmail]
      ]
    });
  }
  if (distReport) {
    events.push({
      key: 'dist',
      tone: 'emerald',
      icon: ClipboardCheck,
      title: 'របាយការណ៍ចែកចាយ',
      badge: 'បានកត់ត្រា',
      time: distReport.date,
      fields: [['អ្នកចែកចាយ', distReport.name]]
    });
  }

  const paymentLabel = [payment || (usdAmount || khmAmount ? 'AC' : ''), usdAmount && `$${usdAmount}`, khmAmount && `${khmAmount}៛`]
    .filter(Boolean)
    .join(' · ');

  const fieldLabel = 'flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400';
  const fieldValue = 'mt-0.5 text-[13px] font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words';

  const renderPhoneChip = (phone: string, copyKey: string) => (
    <button
      type="button"
      onClick={(e) => handleCopy(phone, copyKey, e)}
      title="ចុចដើម្បីចម្លងលេខទូរស័ព្ទ"
      className="group inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white tabular-nums transition cursor-pointer"
    >
      <Phone className="w-3 h-3 text-slate-400" />
      {phone}
      {copiedKey === copyKey ? (
        <Check className="w-3 h-3 text-emerald-600" />
      ) : (
        <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
      )}
    </button>
  );

  const renderNamePhone = (info: { name: string; phones: string[] }, copyKey: string) => (
    <>
      <span className="block whitespace-normal break-words">{info.name || '—'}</span>
      {info.phones.length > 0 && (
        <span className="flex flex-wrap gap-x-3 gap-y-0.5">
          {info.phones.map((p, i) => (
            <React.Fragment key={p}>{renderPhoneChip(p, `${copyKey}_${i}`)}</React.Fragment>
          ))}
        </span>
      )}
    </>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/50 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl ring-1 ring-slate-900/5 dark:ring-white/10 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: title, barcode, status line */}
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
              <Package className="w-4 h-4 text-slate-400 shrink-0" />
              <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white leading-tight">
                ដំណើរការកញ្ចប់ទំនិញ
              </h2>
              <button
                type="button"
                onClick={(e) => handleCopy(barcode, 'barcode', e)}
                title="ចុចដើម្បីចម្លង Barcode"
                className="group inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-[12.5px] font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition cursor-pointer"
              >
                {barcode}
                {copiedKey === 'barcode' ? (
                  <Check className="w-3 h-3 text-emerald-600" />
                ) : (
                  <Copy className="w-3 h-3 opacity-50 group-hover:opacity-100 transition" />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 -mr-1 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
              title="បិទ (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-2 flex items-center gap-x-2 gap-y-1 flex-wrap text-[12px]">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold ${statusCfg.pill}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
              {status || 'PENDING'}
            </span>
            {statusCfg.labelKh && <span className="text-slate-500 dark:text-slate-400">{statusCfg.labelKh}</span>}
            <span className="flex-1" />
            {paymentLabel && (
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-medium">{paymentLabel}</span>
              </span>
            )}
            {sheetDate && (
              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 tabular-nums">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {sheetDate}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3.5">
          {/* Package details */}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 px-3 py-2.5">
            <div className="min-w-0">
              <dt className={fieldLabel}>
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                ទិសដៅ
              </dt>
              <dd className={`${fieldValue} flex items-center gap-2 flex-wrap`}>
                {destination || 'មិនបានបញ្ជាក់'}
                {(teams || origin) && (
                  <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {[teams, origin && `(${origin})`].filter(Boolean).join(' ')}
                  </span>
                )}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className={fieldLabel}>
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                អ្នកផ្ញើ
              </dt>
              <dd className={fieldValue}>{renderNamePhone(shipperInfo, 'shipper_phone')}</dd>
            </div>
            <div className="min-w-0">
              <dt className={fieldLabel}>
                <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                អ្នកទទួល
              </dt>
              <dd className={fieldValue}>{renderNamePhone(consigneeInfo, 'consignee_phone')}</dd>
            </div>
            {description && (
              <div className="min-w-0 col-span-2 sm:col-span-3 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                <dt className={fieldLabel}>
                  <Tag className="w-3.5 h-3.5 text-slate-400" />
                  បរិយាយទំនិញ
                </dt>
                <dd className={fieldValue}>{description}</dd>
              </div>
            )}
          </dl>

          {/* Progress stepper */}
          <section>
            <SectionTitle
              icon={ScanLine}
              title="វដ្ដដំណើរការ"
              right={
                <span className="text-[11.5px] text-slate-400 tabular-nums">ស្កេនឃ្លាំង {scans.length} ដង</span>
              }
            />
            <ol className="flex items-start">
              {steps.map((step, i) => {
                const Icon = step.icon;
                const isCurrent = i === currentStep;
                return (
                  <li key={step.label} className="relative flex-1 flex flex-col items-center text-center">
                    {i > 0 && (
                      <span
                        aria-hidden
                        className={`absolute top-3 right-1/2 w-full h-0.5 -translate-y-1/2 ${
                          step.done ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'
                        }`}
                      />
                    )}
                    <span
                      className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-white dark:ring-slate-900 ${
                        step.done
                          ? 'bg-emerald-500 text-white'
                          : isCurrent
                          ? 'bg-white dark:bg-slate-900 text-emerald-600 border-2 border-emerald-500'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                      }`}
                    >
                      {step.done ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Icon className="w-3 h-3" />}
                    </span>
                    <span
                      className={`mt-1 text-[12px] font-semibold leading-tight ${
                        step.done || isCurrent ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {step.label}
                    </span>
                    <span
                      className={`text-[11px] ${step.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}
                    >
                      {step.sub}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Warehouse timeline */}
          <section>
            <SectionTitle icon={History} title="ប្រវត្តិស្កេនឃ្លាំង" />
            {events.length === 0 ? (
              <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 px-3 py-2.5">
                <ScanLine className="w-4 h-4 text-slate-400 shrink-0" />
                <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-snug">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">មិនទាន់មានប្រវត្តិស្កេន</span>
                  {' — '}មិនទាន់ឆ្លងកាត់ Scan In, Scan Out ឬ Rider នៅឡើយទេ។
                </p>
              </div>
            ) : (
              <ol className="relative space-y-3 before:absolute before:left-[13px] before:top-3.5 before:bottom-3.5 before:w-px before:bg-slate-200 dark:before:bg-slate-800">
                {events.map((ev) => {
                  const Icon = ev.icon;
                  return (
                    <li key={ev.key} className="relative flex gap-2.5">
                      <span
                        className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ring-4 ring-white dark:ring-slate-900 ${TONE_ICON[ev.tone]}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-900 dark:text-white">
                            {ev.title}
                            {ev.badge && (
                              <span className={`px-1.5 py-px rounded-md text-[10.5px] font-medium ${TONE_CHIP[ev.tone]}`}>
                                {ev.badge}
                              </span>
                            )}
                          </p>
                          <time className="text-[11.5px] text-slate-400 tabular-nums">{ev.time}</time>
                        </div>
                        {ev.fields && (
                          <dl className="mt-1.5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                            {ev.fields.map(([label, value]) => (
                              <div key={label} className="min-w-0">
                                <dt className="text-[11px] text-slate-400">{label}</dt>
                                <dd className="text-[12.5px] font-medium text-slate-700 dark:text-slate-200 truncate">
                                  {value || '—'}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {ev.extra}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 h-8 rounded-lg text-[12.5px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            បិទ
          </button>
          {onOpenDistModal && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDistModal(barcode);
              }}
              className="px-3 h-8 rounded-lg text-[12.5px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition cursor-pointer flex items-center gap-1.5 active:scale-[0.98]"
            >
              <Truck className="w-3.5 h-3.5" />
              កត់ត្រារបាយការណ៍ចែកចាយ
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
