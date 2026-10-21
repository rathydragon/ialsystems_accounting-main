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
  Unlock,
  AlertTriangle,
  Mail,
  Clock,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  FileSpreadsheet,
  Database,
  MapPin,
  DollarSign,
  Volume2,
  VolumeX,
  Code2,
  ExternalLink,
  User,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  PackageCheck,
  PackageOpen,
  Archive,
  Tag,
  Printer,
  Package,
  Layers,
  FileText,
  RotateCcw,
  Building2,
  Navigation,
  CheckSquare,
  Zap,
  Scale,
  FolderTree,
  ArrowRightLeft,
  Undo2
} from 'lucide-react';
import { WarehouseScanItem, WarehouseScanType, ArrivalStatus, AuthUser, UserPermission, AppSettings, Payer } from '../types';
import { GridHeadGutter, GridRowGutter, GridObjectSelectionBar, useGridSelection } from './ui/DataGrid';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import { formatCsv, downloadCsv } from '../utils/csvHelper';
import { exportWarehouseOperationsToExcel } from '../utils/warehouseExcelExport';
import {
  canOperateWarehouse,
  canCreateWarehouseScan,
  canEditWarehouseScan,
  canDeleteWarehouseScan,
  getInitialWarehouseScans,
  saveWarehouseScan,
  saveWarehouseScanBatch,
  deleteWarehouseScan,
  deleteWarehouseScanBatch,
  clearAllWarehouseScans,
  subscribeToWarehouseScans,
  subscribeToWarehouseRealtimeStatus,
  getWarehouseRealtimeStatus,
  WarehouseRealtimeStatus,
  fetchWarehouseScans,
  fetchWarehouseScansFromMaster,
  lookupTrackingFromDataReport,
  getDataReportDestination,
  getNextOperationCode,
  getOperatorTag,
  MatchedDataReportInfo
} from '../services/warehouseScanService';
import { CodeViewerModal, CODE_GS_CONTENT } from './CodeViewerModal';
import { BatchManifestModal, ManifestItem } from './BatchManifestModal';
import { canUserAccessPage, canUserViewAllData, getUserAllowedLocations, isLocationMatch } from '../services/userPermissionService';
import {
  getCachedModelNoList,
  getOrFetchModelNoList,
  getCachedNameHandleList,
  getOrFetchNameHandleList,
  getCachedDriverTruckMap,
  lookupTrucksByDriver
} from '../services/meterialOfficeService';
import {
  getDataReportDestinations,
  fetchLiveDataReport,
  getInitialDataReportConfig
} from '../services/dataReportService';
import { ScannerSoundSettingsPopover } from './ScannerSoundSettingsPopover';
// import { WarehouseToolsDropdown } from './WarehouseToolsDropdown';
import {
  playScanSound,
  playWarningSound,
  playDuplicateAlarmSound,
  getScannerSoundConfig
} from '../utils/scannerSound';

// Audio feedback for barcode scanning
function playScanBeep() {
  playScanSound();
}

// Warning beep for duplicate or error
function playWarningBeep() {
  playWarningSound();
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

// 🏭 Station Mode types & metadata for locking warehouse devices/tabs
export type StationLockMode = 'ALL' | 'SCAN_IN' | 'SCAN_OUT' | 'OUT_OF_DELIVERY' | 'HOLD_REMAINING' | 'ARRIVED_HUB' | 'RETURN_SHIPMENTS';

/** Tabs that record a reason (holdReason) instead of a destination: Hold and Return */
export const isReasonScanType = (t?: WarehouseScanType | string): boolean =>
  t === 'HOLD_REMAINING' || t === 'RETURN_SHIPMENTS';

/** Tabs that capture an Origin (ប្រភព) next to Destination */
export const hasOriginField = (t?: WarehouseScanType | string): boolean =>
  t === 'SCAN_IN' || t === 'SCAN_OUT' || t === 'ARRIVED_HUB';

/** Driver choice for drivers who are not in any list (outside / one-off drivers) */
export const DRIVER_OTHER_OPTION = 'Other (ផ្សេងៗ)';

/** Tabs whose form/columns use Destination + Driver + Truck No (ScanIn, ScanOut, Arrived Hub) */
export const isTruckScanType = (t?: WarehouseScanType | string): boolean =>
  t === 'SCAN_IN' || t === 'SCAN_OUT' || t === 'ARRIVED_HUB';

export const STATION_INFO: Record<StationLockMode, { label: string; short: string; badge: string; color: string; desc: string }> = {
  ALL: {
    label: 'គ្រប់មុខងារទាំងអស់ (All Stations - ដោះសោ)',
    short: 'គ្រប់មុខងារ (All)',
    badge: 'សេរី',
    color: 'slate',
    desc: 'អាចប្តូរ Tab និងដំណើរការមុខងារទាំង ៥ បានសេរី'
  },
  SCAN_IN: {
    label: 'Station 1: ScanIn (ចូលឃ្លាំងតែមួយគត់)',
    short: 'ScanIn ចូលឃ្លាំង',
    badge: 'Station 1',
    color: 'emerald',
    desc: 'សម្រាប់កុំព្យូទ័រ/ទូរស័ព្ទទទួលទំនិញចូលឃ្លាំងពីឡានធំ'
  },
  SCAN_OUT: {
    label: 'Station 2: ScanOut (ចេញពីឃ្លាំងតែមួយគត់)',
    short: 'ScanOut ចេញពីឃ្លាំង',
    badge: 'Station 2',
    color: 'amber',
    desc: 'សម្រាប់កុំព្យូទ័រ/ទូរស័ព្ទផ្ទេរទំនិញចេញទៅតាមបណ្តាខេត្ត'
  },
  OUT_OF_DELIVERY: {
    label: 'Station 3: Rider Dispatch (ចេញចែកតាម Rider តែមួយគត់)',
    short: 'Rider Dispatch',
    badge: 'Station 3',
    color: 'blue',
    desc: 'សម្រាប់កុំព្យូទ័រ/ទូរស័ព្ទប្រគល់ទំនិញឱ្យ Rider ដឹកជញ្ជូន'
  },
  HOLD_REMAINING: {
    label: 'Station 4: Hold (នៅសល់ក្នុងឃ្លាំងតែមួយគត់)',
    short: 'Hold នៅសល់',
    badge: 'Station 4',
    color: 'purple',
    desc: 'សម្រាប់កុំព្យូទ័រ/ទូរស័ព្ទចាត់ចែងទំនិញនៅសល់ ឬមានបញ្ហា'
  },
  ARRIVED_HUB: {
    label: 'Station 5: Arrived Hub (ទទួលចូលឃ្លាំងតែមួយគត់)',
    short: 'Arrived Hub',
    badge: 'Station 5',
    color: 'teal',
    desc: 'សម្រាប់ Hub ទទួល និងផ្ទៀងផ្ទាត់ទំនិញពីប្រតិបត្តិការ ScanOut'
  },
  RETURN_SHIPMENTS: {
    label: 'Station 6: Return (បង្វិលត្រឡប់តែមួយគត់)',
    short: 'Return បង្វិលត្រឡប់',
    badge: 'Station 6',
    color: 'rose',
    desc: 'សម្រាប់កុំព្យូទ័រ/ទូរស័ព្ទស្កេនទំនិញបង្វិលត្រឡប់ទៅម្ចាស់វិញ'
  }
};

// Cache for computing day-batch sequential orders to avoid O(N^2) re-filtering & sorting
const dayBatchesCache = new Map<string, string[]>();

/**
 * Get or compute a unique, readable operation code for any warehouse scan item
 * Standard Format: OP-{TYPE}-{YYMMDD}-{OPERATOR_TAG}-{SERIAL} (e.g. OP-IN-261013-SOKHA-001)
 */
export function getOperationCode(item: WarehouseScanItem, allScans?: WarehouseScanItem[]): string {
  if (item.operationCode && item.operationCode.trim()) {
    return item.operationCode.trim();
  }
  if (item.batchId && item.batchId.trim()) {
    return item.batchId.trim();
  }

  // Deterministic fallback based on scanType, date, operator and batch grouping key
  const d = item.createdAt ? new Date(item.createdAt) : new Date(item.date || Date.now());
  const yymmdd = (item.date || d.toISOString().slice(0, 10)).replace(/-/g, '').slice(2);
  const prefix =
    item.scanType === 'SCAN_IN' ? 'IN'
    : item.scanType === 'SCAN_OUT' ? 'OUT'
    : item.scanType === 'OUT_OF_DELIVERY' ? 'DLV'
    : item.scanType === 'ARRIVED_HUB' ? 'ARR'
    : item.scanType === 'RETURN_SHIPMENTS' ? 'RTN'
    : 'HLD';
  const opTag = getOperatorTag(item.operatorEmail || item.createdBy);
  const opPrefix = opTag ? `OP-${prefix}-${yymmdd}-${opTag}-` : `OP-${prefix}-${yymmdd}-`;

  // Group items belonging to the same operation batch (same scanType, same date, same minute & driver/rider/truck)
  const timeMinute = item.createdAt ? item.createdAt.slice(11, 16) : '00:00';
  let entityKey = '';
  if (item.scanType === 'OUT_OF_DELIVERY') {
    entityKey = (item.riderName || '').trim();
  } else if (isTruckScanType(item.scanType)) {
    entityKey = `${item.driverName || ''}_${item.truckNo || ''}_${item.destination || ''}`;
  } else if (item.scanType === 'HOLD_REMAINING') {
    entityKey = `${item.shelfLocation || ''}_${item.holdReason || ''}`;
  } else if (item.scanType === 'RETURN_SHIPMENTS') {
    entityKey = item.holdReason || '';
  }

  // If allScans is available, compute the 3-digit serial order for this day and scanType
  if (allScans && allScans.length > 0) {
    const dayItemDate = item.date || d.toISOString().slice(0, 10);
    const cacheKey = `${allScans.length}_${item.scanType}_${dayItemDate}_${opTag}`;
    let batchList = dayBatchesCache.get(cacheKey);

    if (!batchList) {
      const dayBatches = new Set<string>();
      const sortedSameDay = allScans
        .filter((s) => s.scanType === item.scanType && (s.date === dayItemDate || (s.createdAt && s.createdAt.slice(0, 10) === dayItemDate)))
        .sort((a, b) => (a.createdAt || a.date || '').localeCompare(b.createdAt || b.date || ''));

      for (const s of sortedSameDay) {
        if (s.operationCode && s.operationCode.startsWith(opPrefix)) {
          dayBatches.add(s.operationCode);
        } else if (s.operationCode && s.operationCode.startsWith(`OP-${prefix}-${yymmdd}-`)) {
          dayBatches.add(s.operationCode);
        } else {
          const sTime = s.createdAt ? s.createdAt.slice(11, 16) : '00:00';
          let sEntity = '';
          if (s.scanType === 'OUT_OF_DELIVERY') sEntity = (s.riderName || '').trim();
          else if (isTruckScanType(s.scanType)) sEntity = `${s.driverName || ''}_${s.truckNo || ''}_${s.destination || ''}`;
          else if (s.scanType === 'HOLD_REMAINING') sEntity = `${s.shelfLocation || ''}_${s.holdReason || ''}`;
          else if (s.scanType === 'RETURN_SHIPMENTS') sEntity = s.holdReason || '';
          dayBatches.add(`BATCH_${sTime}_${sEntity}`);
        }
      }

      batchList = Array.from(dayBatches);
      dayBatchesCache.set(cacheKey, batchList);
      if (dayBatchesCache.size > 200) {
        const firstKey = dayBatchesCache.keys().next().value;
        if (firstKey) dayBatchesCache.delete(firstKey);
      }
    }

    const myKey = `BATCH_${timeMinute}_${entityKey}`;
    const foundIdx = batchList.indexOf(myKey);
    const serialNum = (foundIdx >= 0 ? foundIdx + 1 : 1).toString().padStart(3, '0');
    return `${opPrefix}${serialNum}`;
  }

  return `${opPrefix}001`;
}

export interface OperationGroup {
  operationCode: string;
  scanType: WarehouseScanType;
  date: string;
  timeStr?: string;
  operatorName?: string;
  riderName?: string;
  driverName?: string;
  truckNo?: string;
  transferBy?: string;
  origin?: string;
  destination?: string;
  deliveryZone?: string;
  holdReason?: string;
  shelfLocation?: string;
  itemCount: number;
  totalCOD: number;
  items: WarehouseScanItem[];
}

export function groupScansByOperation(itemsToGroup: WarehouseScanItem[]): OperationGroup[] {
  const map = new Map<string, WarehouseScanItem[]>();

  for (const s of itemsToGroup) {
    const code = getOperationCode(s, itemsToGroup);
    if (!map.has(code)) {
      map.set(code, []);
    }
    map.get(code)!.push(s);
  }

  const groups: OperationGroup[] = [];

  for (const [code, items] of map.entries()) {
    const first = items[0];
    const totalCOD = items.reduce((acc, it) => acc + (it.codAmount || 0), 0);
    const timeStr = first.createdAt
      ? new Date(first.createdAt).toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit' })
      : undefined;

    groups.push({
      operationCode: code,
      scanType: first.scanType,
      date: first.date,
      timeStr,
      operatorName: first.createdBy || first.operatorEmail,
      riderName: first.riderName,
      driverName: first.driverName,
      truckNo: first.truckNo,
      transferBy: items.find((it) => it.transferBy)?.transferBy || first.transferBy,
      origin: items.find((it) => it.origin)?.origin || first.origin,
      destination: isReasonScanType(first.scanType) ? undefined : first.destination,
      deliveryZone: first.deliveryZone,
      holdReason: first.holdReason,
      shelfLocation: first.shelfLocation,
      itemCount: items.length,
      totalCOD,
      items
    });
  }

  return groups.sort((a, b) => {
    const dateA = a.items[0]?.createdAt || a.date;
    const dateB = b.items[0]?.createdAt || b.date;
    return dateB.localeCompare(dateA);
  });
}

// Lazy loaded Barcode Scanner Modal
const BarcodeScannerModal = React.lazy(() =>
  import('./BarcodeScannerModal').then((m) => ({ default: m.BarcodeScannerModal }))
);

export interface ComboboxOptionItem {
  value: string;
  label?: string;
  subLabel?: string;
  phone?: string;
  group?: string;
  badge?: string;
}

export interface SearchableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: (string | ComboboxOptionItem)[];
  placeholder?: string;
  icon?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  allOptionLabel?: string;
  allOptionValue?: string;
  allowCustomInput?: boolean;
  emptyMessage?: string;
  onClear?: () => void;
  /** Fires only when the user commits a choice (click / Enter), never while typing. */
  onSelect?: (value: string) => void;
}

export const SearchableCombobox: React.FC<SearchableComboboxProps> = ({
  value,
  onChange,
  options,
  placeholder = 'ស្វែងរក...',
  icon,
  required = false,
  disabled = false,
  className = '',
  inputClassName = '',
  allOptionLabel,
  allOptionValue = 'ALL',
  allowCustomInput,
  emptyMessage = 'មិនមានជម្រើស',
  onClear,
  onSelect
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const isFilterMode = Boolean(allOptionLabel);
  const effectiveAllowCustom = allowCustomInput !== undefined ? allowCustomInput : !isFilterMode;

  const normalizedOptions = useMemo<ComboboxOptionItem[]>(() => {
    return options.map((opt) => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt };
      }
      return {
        value: opt.value,
        label: opt.label || opt.value,
        subLabel: opt.subLabel,
        phone: opt.phone,
        group: opt.group,
        badge: opt.badge
      };
    });
  }, [options]);

  const selectedDisplayLabel = useMemo(() => {
    if (isFilterMode && (!value || value === allOptionValue)) {
      return allOptionLabel;
    }
    const found = normalizedOptions.find((o) => o.value === value);
    return found ? (found.label || found.value) : value;
  }, [value, isFilterMode, allOptionValue, allOptionLabel, normalizedOptions]);

  const [searchQuery, setSearchQuery] = useState<string>(value || '');
  const [isUserTyping, setIsUserTyping] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  // Sync searchQuery when closed or when value changes externally
  useEffect(() => {
    if (!isOpen) {
      setIsUserTyping(false);
      setSearchQuery(selectedDisplayLabel || '');
    }
  }, [value, isOpen, selectedDisplayLabel]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsUserTyping(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter query is whatever the user typed
  const searchFilterText = isUserTyping ? searchQuery.trim().toLowerCase() : '';
  const isSearchActive = Boolean(searchFilterText);

  // Filter items based on active search
  const filteredData = useMemo(() => {
    const q = searchFilterText;

    const filterItem = (it: ComboboxOptionItem) => {
      if (!q) return true;
      const v = it.value.toLowerCase();
      const l = (it.label || '').toLowerCase();
      const s = (it.subLabel || '').toLowerCase();
      const p = (it.phone || '').toLowerCase();
      const cleanPhone = (it.phone || '').replace(/[\s\-\.]/g, '');
      const cleanQ = q.replace(/[\s\-\.]/g, '');
      const phoneMatch = cleanPhone && cleanQ ? cleanPhone.includes(cleanQ) : false;
      return v.includes(q) || l.includes(q) || s.includes(q) || p.includes(q) || phoneMatch;
    };

    const matches = normalizedOptions.filter(filterItem);

    // Grouping
    const groupMap = new Map<string, ComboboxOptionItem[]>();
    const ungrouped: ComboboxOptionItem[] = [];

    matches.forEach((item) => {
      if (item.group) {
        if (!groupMap.has(item.group)) groupMap.set(item.group, []);
        groupMap.get(item.group)!.push(item);
      } else {
        ungrouped.push(item);
      }
    });

    const groups = Array.from(groupMap.entries()).map(([name, items]) => ({
      name,
      items
    }));

    const flatList: ComboboxOptionItem[] = [];
    if (allOptionLabel && (!q || allOptionLabel.toLowerCase().includes(q))) {
      flatList.push({
        value: allOptionValue,
        label: allOptionLabel
      });
    }
    flatList.push(...ungrouped);
    groups.forEach((g) => flatList.push(...g.items));

    return { groups, ungrouped, flatList, totalCount: flatList.length };
  }, [searchFilterText, normalizedOptions, allOptionLabel, allOptionValue]);

  // Reset highlight index when results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredData.totalCount]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listContainerRef.current) {
      const el = listContainerRef.current.querySelector(`[data-index="${highlightedIndex}"]`) as HTMLElement;
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelectOption = (item: ComboboxOptionItem) => {
    onChange(item.value);
    setSearchQuery(item.label || item.value);
    setIsUserTyping(false);
    setIsOpen(false);
    if (onSelect) onSelect(item.value);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsUserTyping(false);
    if (isFilterMode) {
      onChange(allOptionValue);
      setSearchQuery(allOptionLabel || '');
    } else {
      onChange('');
      setSearchQuery('');
    }
    if (onClear) onClear();
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex((prev) => Math.min(prev + 1, Math.max(0, filteredData.flatList.length - 1)));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      }
    } else if (e.key === 'Enter') {
      if (isOpen) {
        e.preventDefault();
        if (filteredData.flatList.length > 0) {
          const item = filteredData.flatList[highlightedIndex] || filteredData.flatList[0];
          if (item) handleSelectOption(item);
        } else if (effectiveAllowCustom && searchQuery.trim()) {
          onChange(searchQuery.trim());
          setIsUserTyping(false);
          setIsOpen(false);
          if (onSelect) onSelect(searchQuery.trim());
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setIsUserTyping(false);
    }
  };

  const hasValue = isFilterMode
    ? Boolean(value && value !== allOptionValue)
    : Boolean(value || searchQuery);

  return (
    <div className={`relative w-full min-w-0 max-w-full ${className}`} ref={containerRef}>
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 z-10">
            {icon}
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          required={required}
          autoComplete="off"
          placeholder={placeholder}
          value={isOpen ? searchQuery : (selectedDisplayLabel || '')}
          onChange={(e) => {
            const val = e.target.value;
            setIsUserTyping(true);
            setSearchQuery(val);
            if (!isOpen) setIsOpen(true);
            if (effectiveAllowCustom) {
              onChange(val);
            }
          }}
          onFocus={(e) => {
            setIsUserTyping(false);
            setSearchQuery(selectedDisplayLabel || '');
            setIsOpen(true);
            e.target.select();
          }}
          onKeyDown={handleKeyDown}
          className={`w-full h-8 ${icon ? 'pl-7' : 'pl-2.5'} pr-12 rounded-xl border text-xs font-semibold transition shadow-2xs focus:outline-none truncate ${
            isOpen
              ? 'border-cyan-500 ring-2 ring-cyan-500/20 bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white hover:border-slate-400 dark:hover:border-slate-600'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${inputClassName}`}
        />

        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-10">
          {hasValue && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-md text-slate-400 hover:text-rose-500 transition cursor-pointer"
              title="លុបចេញ (Clear)"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const next = !isOpen;
              setIsOpen(next);
              if (next) {
                setIsUserTyping(false);
                setSearchQuery(selectedDisplayLabel || '');
                inputRef.current?.focus();
              }
            }}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
            title="បើក/បិទបញ្ជី"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-150 ${
                isOpen ? 'rotate-180 text-cyan-600' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Floating Dropdown List */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 max-h-60 flex flex-col">
          <div className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
            <span className="font-semibold flex items-center gap-1">
              <span>📋 បញ្ជីជម្រើស</span>
              <span>({filteredData.totalCount})</span>
            </span>
            {isSearchActive && (
              <span className="text-[9.5px] text-cyan-600 dark:text-cyan-400 font-medium">
                លទ្ធផលស្វែងរក
              </span>
            )}
          </div>

          <div ref={listContainerRef} className="overflow-y-auto max-h-48 custom-scrollbar p-1 text-xs">
            {filteredData.totalCount === 0 ? (
              <div className="py-3 px-2 text-center text-slate-400 text-xs">
                {searchQuery ? (
                  <div>
                    <div>
                      មិនមានទិន្នន័យ &quot;<strong>{searchQuery}</strong>&quot;
                    </div>
                    {effectiveAllowCustom && (
                      <div className="mt-1 text-[10.5px] text-cyan-600 dark:text-cyan-400 font-semibold">
                        ចុច Enter ដើម្បីប្រើជាទិន្នន័យដោយដៃ
                      </div>
                    )}
                  </div>
                ) : (
                  <div>{emptyMessage}</div>
                )}
              </div>
            ) : (
              <>
                {/* 1. All Option (if in filter mode) */}
                {allOptionLabel && (
                  <button
                    type="button"
                    data-index={0}
                    onClick={() =>
                      handleSelectOption({
                        value: allOptionValue,
                        label: allOptionLabel
                      })
                    }
                    className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition cursor-pointer mb-0.5 text-xs ${
                      value === allOptionValue || !value
                        ? 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 font-bold'
                        : highlightedIndex === 0
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate">{allOptionLabel}</span>
                    {(value === allOptionValue || !value) && (
                      <Check className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                    )}
                  </button>
                )}

                {/* 2. Ungrouped Options */}
                {filteredData.ungrouped.map((item) => {
                  const isSelected = value === item.value;
                  const itemIndex = filteredData.flatList.findIndex((it) => it.value === item.value);
                  const isHighlighted = highlightedIndex === itemIndex;
                  return (
                    <button
                      key={`item_${item.value}`}
                      type="button"
                      data-index={itemIndex}
                      onClick={() => handleSelectOption(item)}
                      className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition cursor-pointer mb-0.5 text-xs ${
                        isSelected
                          ? 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 font-bold'
                          : isHighlighted
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="shrink-0 font-semibold text-slate-900 dark:text-white">{item.label || item.value}</span>
                        {(item.subLabel || item.phone) && (
                          <span className="truncate text-[10.5px] text-slate-600 dark:text-slate-300 font-medium" title={item.subLabel || item.phone}>
                            ({item.subLabel || item.phone})
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                      )}
                    </button>
                  );
                })}

                {/* 3. Grouped Options */}
                {filteredData.groups.map((group) => (
                  <div key={`group_${group.name}`} className="mb-1">
                    <div className="px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 rounded flex items-center justify-between mb-0.5">
                      <span>{group.name}</span>
                      <span className="text-[9px] font-normal opacity-80">({group.items.length})</span>
                    </div>
                    {group.items.map((item) => {
                      const isSelected = value === item.value;
                      const itemIndex = filteredData.flatList.findIndex(
                        (it) => it.value === item.value && it.group === item.group
                      );
                      const isHighlighted = highlightedIndex === itemIndex;
                      return (
                        <button
                          key={`grp_${group.name}_${item.value}`}
                          type="button"
                          data-index={itemIndex}
                          onClick={() => handleSelectOption(item)}
                          className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition cursor-pointer mb-0.5 text-xs ${
                            isSelected
                              ? 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 font-bold'
                              : isHighlighted
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="shrink-0 font-semibold text-slate-900 dark:text-white">{item.label || item.value}</span>
                            {(item.subLabel || item.phone) && (
                              <span className="truncate text-[10.5px] text-slate-600 dark:text-slate-300 font-medium" title={item.subLabel || item.phone}>
                                ({item.subLabel || item.phone})
                              </span>
                            )}
                          </div>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const CAMBODIA_PROVINCES: string[] = [
  'រាជធានីភ្នំពេញ (Phnom Penh)',
  'ខេត្តកណ្ដាល (Kandal)',
  'ខេត្តកំពង់ចាម (Kampong Cham)',
  'ខេត្តកំពង់ឆ្នាំង (Kampong Chhnang)',
  'ខេត្តកំពង់ស្ពឺ (Kampong Speu)',
  'ខេត្តកំពង់ធំ (Kampong Thom)',
  'ខេត្តកំពត (Kampot)',
  'ខេត្តកោះកុង (Koh Kong)',
  'ខេត្តកែប (Kep)',
  'ក្រចេះ (Kratie)',
  'ខេត្តតាកែវ (Takeo)',
  'ខេត្តត្បូងឃ្មុំ (Tboung Khmum)',
  'ខេត្តបន្ទាយមានជ័យ (Banteay Meanchey)',
  'ខេត្តបាត់ដំបង (Battambang)',
  'ខេត្តប៉ៃលិន (Pailin)',
  'ខេត្តពោធិ៍សាត់ (Pursat)',
  'ខេត្តព្រះវិហារ (Preah Vihear)',
  'ខេត្តព្រះសីហនុ (Preah Sihanouk)',
  'ខេត្តព្រៃវែង (Prey Veng)',
  'ខេត្តមណ្ឌលគិរី (Mondulkiri)',
  'ខេត្តរតនគិរី (Ratanakiri)',
  'ខេត្តសៀមរាប (Siem Reap)',
  'ខេត្តស្ទឹងត្រែង (Stung Treng)',
  'ខេត្តស្វាយរៀង (Svay Rieng)',
  'ខេត្តឧត្ដរមានជ័យ (Oddar Meanchey)'
];

export const HOLD_REASONS: string[] = [
  'មិនទាន់មានជើងឡាន / រង់ចាំជើងឡាន (Awaiting Truck / Departure)',
  'អតិថិជនពន្យារពេលទទួល (Customer Postponed)',
  'ទាក់ទងអ្នកទទួលមិនបាន (Unreachable Receiver)',
  'អាសយដ្ឋានមិនច្បាស់លាស់ (Wrong / Incomplete Address)',
  'ទំនិញមានបញ្ហា / បែកបាក់ / ពិនិត្យឡើងវិញ (Damaged / Needs Inspection)',
  'មិនទាន់បង់លុយ / COD មិនទាន់ច្បាស់ (Payment / COD Pending)',
  'អីវ៉ាន់សល់ពីជើងដឹក Rider យកមកទុកវិញ (Returned by Rider)',
  'សាខាពេញ ឬបិទទទួលបណ្ដោះអាសន្ន (Branch Full / Closed)',
  'រង់ចាំការបញ្ជាក់ពីអ្នកផ្ញើ (Waiting Shipper Confirmation)',
  'ផ្សេងៗ (Other Reason)'
];

export const RETURN_REASONS: string[] = [
  'អតិថិជនបដិសេធមិនទទួល (Customer Refused)',
  'ទាក់ទងអ្នកទទួលមិនបាន (Unreachable Receiver)',
  'អាសយដ្ឋានខុស / រកមិនឃើញ (Wrong Address)',
  'អ្នកផ្ញើស្នើសុំយកវិញ (Shipper Requested Return)',
  'លុបចោលការកម្ម៉ង់ (Order Cancelled)',
  'ទំនិញខូចខាត (Damaged)',
  'ផ្ញើលើសរយៈពេលរក្សាទុក (Storage Time Exceeded)',
  'ផ្សេងៗ (Other Reason)'
];

/** Reason choices for the Hold or Return form */
export const reasonsForTab = (t?: WarehouseScanType | string): string[] =>
  t === 'RETURN_SHIPMENTS' ? RETURN_REASONS : HOLD_REASONS;

export const WAREHOUSE_SHELVES: string[] = [
  'ធ្នើរ A (Shelf A)',
  'ធ្នើរ B (Shelf B)',
  'ធ្នើរ C (Shelf C)',
  'ធ្នើរ D (Shelf D)',
  'ធ្នើរ E (Shelf E)',
  'តំបន់ទំនិញធ្ងន់ (Heavy Cargo Area)',
  'តំបន់រង់ចាំជើងឡានខេត្ត (Provincial Staging)',
  'តំបន់ Rider ដឹកភ្នំពេញ (Phnom Penh Staging)',
  'បន្ទប់ទំនិញសុវត្ថិភាព / តម្លៃខ្ពស់ (High Value Cage)',
  'តំបន់ទំនិញត្រួតពិនិត្យ (Inspection Area)'
];

export const TRANSFER_BY_OPTIONS = ['VET', 'Capito', 'Taxi', 'Other'] as const;

export const TRANSFER_BY_COMBOBOX_OPTIONS: ComboboxOptionItem[] = [
  { value: 'VET', label: 'VET', badge: 'Bus / Van' },
  { value: 'Capito', label: 'Capito', badge: 'Bus' },
  { value: 'Taxi', label: 'Taxi', badge: 'Taxi' },
  { value: 'Other', label: 'Other', badge: 'ផ្សេងៗ' }
];

export interface WarehouseFormDraft {
  origin?: string;
  destination?: string;
  driverName?: string;
  truckNo?: string;
  transferBy?: string;
  riderName?: string;
  deliveryZone?: string;
  codAmount?: string;
  currency?: 'USD' | 'KHR';
  remarks?: string;
  holdReason?: string;
  shelfLocation?: string;
  scanDate?: string;
  batchQueue?: ManifestItem[];
}

export const getWarehouseDraftStorageKey = (tab: WarehouseScanType, userEmail?: string) => {
  const cleanEmail = (userEmail || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  return cleanEmail ? `accounting_warehouse_draft_${cleanEmail}_${tab}` : `accounting_warehouse_draft_${tab}`;
};

export function loadInitialWarehouseDraft(tab: WarehouseScanType, userEmail?: string): Partial<WarehouseFormDraft> {
  try {
    const userKey = getWarehouseDraftStorageKey(tab, userEmail);
    const raw = localStorage.getItem(userKey) || (!userEmail ? null : localStorage.getItem(getWarehouseDraftStorageKey(tab)));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (err) {
    console.debug('Failed to load warehouse form draft:', err);
  }
  return {};
}

export function saveWarehouseTabDraft(tab: WarehouseScanType, draft: WarehouseFormDraft, userEmail?: string) {
  try {
    localStorage.setItem(getWarehouseDraftStorageKey(tab, userEmail), JSON.stringify(draft));
  } catch (err) {
    console.debug('Failed to save warehouse form draft:', err);
  }
}

export function clearWarehouseTabDraft(tab: WarehouseScanType, userEmail?: string) {
  try {
    localStorage.removeItem(getWarehouseDraftStorageKey(tab, userEmail));
  } catch {}
}

interface WarehouseManagementPageProps {
  currentUser?: AuthUser | null;
  permissions?: UserPermission[];
  settings?: AppSettings;
  payers?: Payer[];
  initialTab?: WarehouseScanType;
  onTabChange?: (tab: WarehouseScanType) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateToDataReport?: () => void;
  onRefreshMasterData?: (silent?: boolean) => Promise<void>;
}

export const WarehouseManagementPage: React.FC<WarehouseManagementPageProps> = ({
  currentUser,
  permissions,
  settings,
  payers = [],
  initialTab,
  onTabChange,
  onShowToast,
  onRefreshMasterData
}) => {
  // Permission checks for the 4 separated tabs
  const canAccessScanIn = useMemo(() => canUserAccessPage('SCAN_IN', currentUser, permissions), [currentUser, permissions]);
  const canAccessScanOut = useMemo(() => canUserAccessPage('SCAN_OUT', currentUser, permissions), [currentUser, permissions]);
  const canAccessOutOfDelivery = useMemo(() => canUserAccessPage('OUT_OF_DELIVERY', currentUser, permissions), [currentUser, permissions]);
  const canAccessHold = useMemo(() => canUserAccessPage('HOLD_REMAINING', currentUser, permissions), [currentUser, permissions]);
  const canAccessArrived = useMemo(() => canUserAccessPage('ARRIVED_HUB', currentUser, permissions), [currentUser, permissions]);
  const canAccessReturn = useMemo(() => canUserAccessPage('RETURN_SHIPMENTS', currentUser, permissions), [currentUser, permissions]);

  // 🏭 Station Mode Lock: 'ALL' | 'SCAN_IN' | 'SCAN_OUT' | 'OUT_OF_DELIVERY' | 'HOLD_REMAINING'
  const [stationLock, setStationLockState] = useState<StationLockMode>(() => {
    return (localStorage.getItem('ial_warehouse_station_lock') as StationLockMode) || 'ALL';
  });
  const [isStationModalOpen, setIsStationModalOpen] = useState<boolean>(false);

  // 🛡️ Strict Duplicate Prevention (Default: true for multi-user safety)
  const [blockDuplicates, setBlockDuplicates] = useState<boolean>(() => {
    return localStorage.getItem('warehouse_block_duplicates') !== 'false';
  });

  const toggleBlockDuplicates = () => {
    setBlockDuplicates((prev) => {
      const next = !prev;
      localStorage.setItem('warehouse_block_duplicates', String(next));
      if (next) {
        notify('🛡️ បានបើកមុខងារការពារស្កេនស្ទួន (ទប់ស្កាត់កញ្ចប់ស្ទួន)', 'success');
      } else {
        notify('⚠️ បានបិទមុខងារការពារស្កេនស្ទួន', 'info');
      }
      return next;
    });
  };

  // 🟢 Realtime Connection Status
  const [realtimeStatus, setRealtimeStatus] = useState<WarehouseRealtimeStatus>(() => getWarehouseRealtimeStatus());

  useEffect(() => {
    return subscribeToWarehouseRealtimeStatus((status) => {
      setRealtimeStatus(status);
    });
  }, []);

  // Compute default tab based on URL hash, initialTab, stationLock, localStorage and access rights
  const getDefaultTab = (): WarehouseScanType => {
    // Priority 0: Station Lock
    const savedStationLock = (localStorage.getItem('ial_warehouse_station_lock') as StationLockMode) || 'ALL';
    if (savedStationLock !== 'ALL') {
      if (savedStationLock === 'SCAN_IN' && canAccessScanIn) return 'SCAN_IN';
      if (savedStationLock === 'SCAN_OUT' && canAccessScanOut) return 'SCAN_OUT';
      if (savedStationLock === 'OUT_OF_DELIVERY' && canAccessOutOfDelivery) return 'OUT_OF_DELIVERY';
      if (savedStationLock === 'HOLD_REMAINING' && canAccessHold) return 'HOLD_REMAINING';
      if (savedStationLock === 'ARRIVED_HUB' && canAccessArrived) return 'ARRIVED_HUB';
      if (savedStationLock === 'RETURN_SHIPMENTS' && canAccessReturn) return 'RETURN_SHIPMENTS';
    }

    // Check URL Hash first
    const hash = window.location.hash.replace('#', '').toUpperCase();
    if (hash === 'SCAN_IN' && canAccessScanIn) return 'SCAN_IN';
    if (hash === 'SCAN_OUT' && canAccessScanOut) return 'SCAN_OUT';
    if (hash === 'OUT_OF_DELIVERY' && canAccessOutOfDelivery) return 'OUT_OF_DELIVERY';
    if (hash === 'HOLD_REMAINING' && canAccessHold) return 'HOLD_REMAINING';
    if (hash === 'ARRIVED_HUB' && canAccessArrived) return 'ARRIVED_HUB';
    if (hash === 'RETURN_SHIPMENTS' && canAccessReturn) return 'RETURN_SHIPMENTS';

    if (initialTab) {
      if (initialTab === 'SCAN_IN' && canAccessScanIn) return 'SCAN_IN';
      if (initialTab === 'SCAN_OUT' && canAccessScanOut) return 'SCAN_OUT';
      if (initialTab === 'OUT_OF_DELIVERY' && canAccessOutOfDelivery) return 'OUT_OF_DELIVERY';
      if (initialTab === 'HOLD_REMAINING' && canAccessHold) return 'HOLD_REMAINING';
      if (initialTab === 'ARRIVED_HUB' && canAccessArrived) return 'ARRIVED_HUB';
      if (initialTab === 'RETURN_SHIPMENTS' && canAccessReturn) return 'RETURN_SHIPMENTS';
    }

    const savedTab = localStorage.getItem('warehouse_active_tab') as WarehouseScanType | null;
    if (savedTab) {
      if (savedTab === 'SCAN_IN' && canAccessScanIn) return 'SCAN_IN';
      if (savedTab === 'SCAN_OUT' && canAccessScanOut) return 'SCAN_OUT';
      if (savedTab === 'OUT_OF_DELIVERY' && canAccessOutOfDelivery) return 'OUT_OF_DELIVERY';
      if (savedTab === 'HOLD_REMAINING' && canAccessHold) return 'HOLD_REMAINING';
      if (savedTab === 'ARRIVED_HUB' && canAccessArrived) return 'ARRIVED_HUB';
      if (savedTab === 'RETURN_SHIPMENTS' && canAccessReturn) return 'RETURN_SHIPMENTS';
    }

    if (canAccessScanIn) return 'SCAN_IN';
    if (canAccessScanOut) return 'SCAN_OUT';
    if (canAccessOutOfDelivery) return 'OUT_OF_DELIVERY';
    if (canAccessHold) return 'HOLD_REMAINING';
    if (canAccessArrived) return 'ARRIVED_HUB';
    if (canAccessReturn) return 'RETURN_SHIPMENTS';
    return 'SCAN_IN';
  };

  // 1. Data State
  const [scans, setScans] = useState<WarehouseScanItem[]>(() => getInitialWarehouseScans());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshingMaster, setIsRefreshingMaster] = useState<boolean>(false);

  // Data Scope Privilege (All Data vs Own Only)
  const canViewAll = useMemo(() => {
    return canUserViewAllData(currentUser, permissions);
  }, [currentUser, permissions]);

  const myEmail = useMemo(() => (currentUser?.email || '').toLowerCase().trim(), [currentUser?.email]);
  const myName = useMemo(() => (currentUser?.name || '').toLowerCase().trim(), [currentUser?.name]);

  const isOwnScan = useCallback(
    (s: WarehouseScanItem) => {
      if (!myEmail) return false;
      const opEmail = (s.operatorEmail || '').toLowerCase().trim();
      if (opEmail && opEmail === myEmail) return true;
      const creator = (s.createdBy || '').toLowerCase().trim();
      if (creator && (creator === myEmail || (myName && creator === myName))) return true;
      return false;
    },
    [myEmail, myName]
  );

  // Scoped list of scans based on Data Scope
  const scopedScans = useMemo(() => {
    if (canViewAll) return scans;
    return scans.filter(isOwnScan);
  }, [scans, canViewAll, isOwnScan]);

  const [activeTab, setActiveTabState] = useState<WarehouseScanType>(getDefaultTab);

  const setActiveTab = (tab: WarehouseScanType) => {
    if (stationLock !== 'ALL' && tab !== stationLock) {
      if (soundEnabled) playWarningBeep();
      notify(`🔒 ម៉ាស៊ីននេះបានចាក់សោសម្រាប់តែ «${STATION_INFO[stationLock].short}»! សូមដោះសោ (Unlock Station) ប្រសិនបើចង់ប្តូរ។`, 'error');
      return;
    }
    setActiveTabState(tab);
    localStorage.setItem('warehouse_active_tab', tab);
    localStorage.setItem('accounting_current_view', tab);
    window.history.replaceState(null, '', `#${tab.toLowerCase()}`);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  const setStationLock = (mode: StationLockMode) => {
    setStationLockState(mode);
    localStorage.setItem('ial_warehouse_station_lock', mode);
    if (mode !== 'ALL') {
      setActiveTabState(mode);
      localStorage.setItem('warehouse_active_tab', mode);
      localStorage.setItem('accounting_current_view', mode);
      window.history.replaceState(null, '', `#${mode.toLowerCase()}`);
      if (onTabChange) onTabChange(mode);
      notify(`🔒 បានកំណត់ម៉ាស៊ីននេះជា «${STATION_INFO[mode].label}» រួចរាល់!`, 'success');
    } else {
      notify(`🔓 បានដោះសោ Station រួចរាល់! អាចប្តូរ Tab បានសេរី។`, 'info');
    }
    setIsStationModalOpen(false);
  };

  // Sync activeTab when initialTab or permissions change
  useEffect(() => {
    if (stationLock !== 'ALL' && activeTab !== stationLock) {
      setActiveTabState(stationLock);
      return;
    }
    if (initialTab && initialTab !== activeTab && stationLock === 'ALL') {
      setActiveTabState(initialTab);
      localStorage.setItem('warehouse_active_tab', initialTab);
    }
  }, [initialTab, stationLock, activeTab]);

  // If the current tab is not allowed, fall back to the first tab the user can access
  useEffect(() => {
    const access: [WarehouseScanType, boolean][] = [
      ['SCAN_IN', canAccessScanIn],
      ['SCAN_OUT', canAccessScanOut],
      ['OUT_OF_DELIVERY', canAccessOutOfDelivery],
      ['HOLD_REMAINING', canAccessHold],
      ['ARRIVED_HUB', canAccessArrived],
      ['RETURN_SHIPMENTS', canAccessReturn]
    ];
    if (access.some(([tab, ok]) => tab === activeTab && !ok)) {
      const fallback = access.find(([tab, ok]) => ok && tab !== activeTab);
      if (fallback) setActiveTab(fallback[0]);
    }
  }, [activeTab, canAccessScanIn, canAccessScanOut, canAccessOutOfDelivery, canAccessHold, canAccessArrived, canAccessReturn]);

  // Real-time scans subscription
  useEffect(() => {
    // Only show full loading spinner if we have zero cached scans to display
    if (scans.length === 0) {
      setIsLoading(true);
    }

    const unsubscribe = subscribeToWarehouseScans((items) => {
      setScans(items);
      setIsLoading(false);
    });

    const handleMasterUpdate = (e: any) => {
      if (Array.isArray(e.detail)) {
        setScans(e.detail);
        setIsLoading(false);
      }
    };
    window.addEventListener('ial_warehouse_scans_updated', handleMasterUpdate);

    // Fallback safety: never keep user stuck on loading spinner for more than 2 seconds
    const fallbackTimer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => {
      unsubscribe();
      window.removeEventListener('ial_warehouse_scans_updated', handleMasterUpdate);
      clearTimeout(fallbackTimer);
    };
  }, []);

  // Permissions
  const canCreate = useMemo(() => canCreateWarehouseScan(currentUser, permissions), [currentUser, permissions]);
  const canEdit = useMemo(() => canEditWarehouseScan(currentUser, permissions), [currentUser, permissions]);
  const canDelete = useMemo(() => canDeleteWarehouseScan(currentUser, permissions), [currentUser, permissions]);
  const canOperate = useMemo(() => canOperateWarehouse(currentUser, permissions), [currentUser, permissions]);

  // 1. Data Report Destinations (ទាញទិន្នន័យគោលដៅចេញពី Data Report Page នៃ Column DESTINATION)
  const [dataReportDestinations, setDataReportDestinations] = useState<string[]>(() => getDataReportDestinations());
  const [isLoadingDestinations, setIsLoadingDestinations] = useState<boolean>(false);

  // Sync Data Report destinations when data report updates or mounts
  useEffect(() => {
    const handleUpdate = () => {
      const dests = getDataReportDestinations();
      setDataReportDestinations(dests);
    };
    window.addEventListener('accounting_data_report_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('accounting_data_report_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  // Refresh destinations live from Google Sheets
  const refreshDataReportDestinations = useCallback(async (showNotification = false) => {
    setIsLoadingDestinations(true);
    try {
      const config = getInitialDataReportConfig();
      if (!config.sheetUrl) {
        const localDests = getDataReportDestinations();
        setDataReportDestinations(localDests);
        if (showNotification) {
          onShowToast?.(`ទាញបាន ${localDests.length} គោលដៅពីទិន្នន័យ Data Report ដែលបានរក្សាទុក (Cache)`, 'info');
        }
        return;
      }
      const res = await fetchLiveDataReport(config.sheetUrl, config.sheetName);
      if (res.success && res.rows.length > 0) {
        const freshDests = getDataReportDestinations();
        setDataReportDestinations(freshDests);
        if (showNotification) {
          onShowToast?.(`✓ បានទាញយក ${freshDests.length} គោលដៅពី Data Report ដោយជោគជ័យ!`, 'success');
        }
      } else {
        const localDests = getDataReportDestinations();
        setDataReportDestinations(localDests);
        if (showNotification) {
          onShowToast?.(`ទាញបាន ${localDests.length} គោលដៅពី Data Report`, 'info');
        }
      }
    } catch (err: any) {
      console.warn('Error refreshing Data Report destinations:', err);
      const localDests = getDataReportDestinations();
      setDataReportDestinations(localDests);
    } finally {
      setIsLoadingDestinations(false);
    }
  }, [onShowToast]);

  // Manifest rows only: DESTINATION from Data Report, scan value as fallback.
  // Tables keep showing the ORIGIN / DESTINATION chosen in the Scan form.
  const destOf = (s: WarehouseScanItem): string | undefined =>
    getDataReportDestination(s.barcode || s.tracking || '') || s.destination || undefined;

  // Destination options: Cambodia Provinces first, then Data Report, then scan history
  const provinceOptions = useMemo(() => {
    const set = new Set<string>();

    // Priority 1: Standard Cambodia Provinces (Top)
    CAMBODIA_PROVINCES.forEach((p) => {
      if (p && p.trim()) set.add(p.trim());
    });

    // Priority 2: Data Report Destinations (column DESTINATION)
    dataReportDestinations.forEach((d) => {
      if (d && d.trim()) set.add(d.trim());
    });

    // Priority 3: Scan history destinations
    scans.forEach((s) => {
      if (s.destination && s.destination.trim()) {
        set.add(s.destination.trim());
      }
    });

    return Array.from(set);
  }, [dataReportDestinations, scans]);

  // Destination SearchableCombobox options with nice grouping & badges (ខេត្ត-ក្រុងនានា at TOP)
  const destinationComboboxOptions = useMemo<ComboboxOptionItem[]>(() => {
    const items: ComboboxOptionItem[] = [];
    const seen = new Set<string>();

    // 1. Standard Cambodia Provinces (Top Priority - 🏛️ ខេត្ត-ក្រុងនានា)
    CAMBODIA_PROVINCES.forEach((p) => {
      const clean = (p || '').trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        items.push({
          value: clean,
          label: clean,
          group: '🏛️ ខេត្ត-ក្រុងនានា'
        });
      }
    });

    // 2. Data Report Destinations (📍 គោលដៅពី Data Report)
    dataReportDestinations.forEach((d) => {
      const clean = (d || '').trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        items.push({
          value: clean,
          label: clean,
          group: '📍 គោលដៅពី Data Report',
          badge: 'Data Report'
        });
      }
    });

    // 3. Scan history (📦 គោលដៅធ្លាប់ស្កេន)
    scans.forEach((s) => {
      const clean = (s.destination || '').trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        items.push({
          value: clean,
          label: clean,
          group: '📦 គោលដៅធ្លាប់ស្កេន'
        });
      }
    });

    return items;
  }, [dataReportDestinations, scans]);

  // Rider list extracted from Payers (Company Staff page)
  const riderOptions = useMemo(() => {
    let list: Payer[] = [];
    if (payers && payers.length > 0) {
      list = payers;
    } else {
      try {
        const stored = localStorage.getItem('accounting_payers') || localStorage.getItem('payers');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) list = parsed;
        }
      } catch {}
    }

    const activeList = list.filter((p) => p.status !== 'INACTIVE' && p.name && p.name.trim());
    const riders = activeList.filter((p) => {
      const c = String(p.category || '').toUpperCase();
      const n = String(p.name || '').toUpperCase();
      return c === 'RIDER' || n.includes('RIDER') || n.includes('អ្នកដឹក');
    });
    const others = activeList.filter((p) => !riders.includes(p));

    return { riders, others, all: activeList };
  }, [payers]);

  // Driver list extracted from Payers (Company Staff page - ឈ្មោះអ្នកប្រគល់)
  const driverOptions = useMemo(() => {
    let list: Payer[] = [];
    if (payers && payers.length > 0) {
      list = payers;
    } else {
      try {
        const stored = localStorage.getItem('accounting_payers') || localStorage.getItem('payers');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) list = parsed;
        }
      } catch {}
    }

    const activeList = list.filter((p) => p.status !== 'INACTIVE' && p.name && p.name.trim());
    
    // Prioritize drivers or staff categorized with driver/transporter terms
    const drivers = activeList.filter((p) => {
      const c = String(p.category || '').toUpperCase();
      const n = String(p.name || '').toUpperCase();
      const a = String(p.area || '').toUpperCase();
      const notes = String(p.notes || '').toUpperCase();
      const combined = `${c} ${n} ${a} ${notes}`;
      return (
        c === 'DRIVER' ||
        combined.includes('DRIVER') ||
        combined.includes('បើកបរ') ||
        combined.includes('តៃកុង') ||
        combined.includes('ឡាន') ||
        combined.includes('ដឹក')
      );
    });

    const others = activeList.filter((p) => !drivers.includes(p));

    drivers.sort((a, b) => a.name.localeCompare(b.name));
    others.sort((a, b) => a.name.localeCompare(b.name));

    return { drivers, others, all: activeList };
  }, [payers]);

  // 2. Scan Form State
  const initialDraft = useMemo(() => loadInitialWarehouseDraft(getDefaultTab(), currentUser?.email), [currentUser?.email]);
  // Start collapsed on phones so the list is visible first; tap the launch bar to open.
  const [isFormOpen, setIsFormOpen] = useState<boolean>(
    () => typeof window === 'undefined' || window.innerWidth >= 640
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [origin, setOrigin] = useState<string>(() => initialDraft.origin || '');
  const [destination, setDestination] = useState<string>(() => initialDraft.destination || '');
  const [driverName, setDriverName] = useState<string>(() => initialDraft.driverName || '');
  const [truckNo, setTruckNo] = useState<string>(() => initialDraft.truckNo || '');
  const [transferBy, setTransferBy] = useState<string>(() => initialDraft.transferBy || '');
  const [codAmount, setCodAmount] = useState<string>(() => initialDraft.codAmount || '');
  const [currency, setCurrency] = useState<'USD' | 'KHR'>(() => initialDraft.currency || 'USD');
  const [riderName, setRiderName] = useState<string>(() => initialDraft.riderName || '');
  const [deliveryZone, setDeliveryZone] = useState<string>(() => initialDraft.deliveryZone || '');
  const [remarks, setRemarks] = useState<string>(() => initialDraft.remarks || '');
  const [holdReason, setHoldReason] = useState<string>(() => initialDraft.holdReason || reasonsForTab(activeTab)[0]);
  const [shelfLocation, setShelfLocation] = useState<string>(() => initialDraft.shelfLocation || '');
  const [scanDate, setScanDate] = useState<string>(() => {
    if (initialDraft.scanDate && Array.isArray(initialDraft.batchQueue) && initialDraft.batchQueue.length > 0) {
      return initialDraft.scanDate;
    }
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh' }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  });
  const [autoMatched, setAutoMatched] = useState<boolean>(false);
  const [matchedPreview, setMatchedPreview] = useState<MatchedDataReportInfo | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => getScannerSoundConfig().enabled);
  const [remainingSubTab, setRemainingSubTab] = useState<'SCANNED' | 'UNDISPATCHED'>('SCANNED');

  useEffect(() => {
    const handleSoundChange = (e: any) => {
      if (e?.detail) {
        setSoundEnabled(e.detail.enabled);
      }
    };
    window.addEventListener('accounting_sound_config_changed', handleSoundChange);
    return () => window.removeEventListener('accounting_sound_config_changed', handleSoundChange);
  }, []);
  const [dispatchedWarning, setDispatchedWarning] = useState<string | null>(null);

  // Continuous Auto-Scan Mode (ស្កេនបន្តដោយស្វ័យប្រវត្តិ មិនបាច់ចុច Submit/Enter ច្រើនដង)
  const [autoContinuousScan, setAutoContinuousScan] = useState<boolean>(() => {
    return localStorage.getItem('accounting_auto_continuous_scan') !== 'false';
  });
  const lastCharTimeRef = useRef<number>(0);
  const fastKeystrokesCountRef = useRef<number>(0);
  const autoSubmitTimerRef = useRef<any>(null);

  const toggleContinuousScan = () => {
    setAutoContinuousScan((prev) => {
      const next = !prev;
      localStorage.setItem('accounting_auto_continuous_scan', String(next));
      return next;
    });
  };

  // Model No options pulled from Meterial_Office page
  const [truckModelOptions, setTruckModelOptions] = useState<string[]>(() => {
    return getCachedModelNoList();
  });
  const [isLoadingTrucks, setIsLoadingTrucks] = useState<boolean>(false);

  // Driver / Name Handle options pulled from Meterial_Office page
  const [driverHandleOptions, setDriverHandleOptions] = useState<string[]>(() => {
    return getCachedNameHandleList();
  });

  // Driver -> Truck (Name Handle -> Model No) mapping pulled from Meterial_Office page
  const [driverTruckMap, setDriverTruckMap] = useState<Record<string, string[]>>(() => {
    return getCachedDriverTruckMap();
  });

  // Filter and Search States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'THIS_MONTH'>('TODAY');
  const [operatorFilter, setOperatorFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'barcode'>('newest');

  // Detailed Filters requested by User
  const [filterDestination, setFilterDestination] = useState<string>('ALL'); // ទីតាំង / ខេត្ត-ក្រុង *
  const [filterDriver, setFilterDriver] = useState<string>('ALL'); // Driver (អ្នកបើកបរ)
  const [filterTruckNo, setFilterTruckNo] = useState<string>('ALL'); // Truck No
  const [filterRider, setFilterRider] = useState<string>('ALL'); // Rider (អ្នកដឹក)
  const [filterHoldReason, setFilterHoldReason] = useState<string>('ALL'); // មូលហេតុនៅសល់ / ផ្អាក *
  const [filterBranchTarget, setFilterBranchTarget] = useState<string>('ALL'); // សាខា / ខេត្តគោលដៅ
  const [filterShelfLocation, setFilterShelfLocation] = useState<string>('ALL'); // ធ្នើរ / កន្លែងទុក (Hold)
  const [filterOperationCode, setFilterOperationCode] = useState<string>('ALL'); // លេខកូដប្រតិបត្តិការ (Operation Code)
  const [filterStartDate, setFilterStartDate] = useState<string>(''); // កាលបរិច្ឆេទចាប់ផ្តើម (Start Date)
  const [filterEndDate, setFilterEndDate] = useState<string>(''); // កាលបរិច្ឆេទបញ្ចប់ (End Date)
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState<boolean>(false); // Toggle filter panel (default collapsed to save space)

  // Matching truck(s) for the currently selected driver from Meterial_Office
  const assignedTrucksForDriver = useMemo(() => {
    return lookupTrucksByDriver(driverName, driverTruckMap);
  }, [driverName, driverTruckMap]);

  const isTruckAutoMatched = Boolean(
    driverName.trim() &&
    truckNo.trim() &&
    assignedTrucksForDriver.includes(truckNo.trim())
  );

  // Combobox options for Driver
  const driverComboboxOptions = useMemo<ComboboxOptionItem[]>(() => {
    const list: ComboboxOptionItem[] = [
      {
        value: DRIVER_OTHER_OPTION,
        label: DRIVER_OTHER_OPTION,
        subLabel: 'Driver ខាងក្រៅ ឬមិនមានក្នុងបញ្ជី',
        group: '✳️ ផ្សេងៗ'
      }
    ];

    // 1. Meterial Office Name Handles
    driverHandleOptions.forEach((handle) => {
      const mappedTrucks = lookupTrucksByDriver(handle, driverTruckMap);
      list.push({
        value: handle,
        label: handle,
        subLabel: mappedTrucks.length > 0 ? `🚛 ឡាន: ${mappedTrucks.join(', ')}` : undefined,
        badge: mappedTrucks.length > 0 ? mappedTrucks[0] : undefined,
        group: '📋 Meterial Office (Name Handle)'
      });
    });

    // 2. Company Staff Drivers
    driverOptions.drivers.forEach((d) => {
      const mappedTrucks = lookupTrucksByDriver(d.name, driverTruckMap);
      list.push({
        value: d.name,
        label: d.name,
        subLabel: mappedTrucks.length > 0 ? `🚛 ឡាន: ${mappedTrucks.join(', ')}` : (d.phone ? d.phone : undefined),
        phone: d.phone,
        badge: mappedTrucks.length > 0 ? mappedTrucks[0] : undefined,
        group: '🚛 ក្រុម Driver (បុគ្គលិក)'
      });
    });

    // 3. Other Staff
    driverOptions.others.forEach((p) => {
      list.push({
        value: p.name,
        label: p.name,
        subLabel: p.phone ? p.phone : undefined,
        phone: p.phone,
        group: '👥 បុគ្គលិកផ្សេងទៀត'
      });
    });

    return list;
  }, [driverHandleOptions, driverOptions, driverTruckMap]);

  // Combobox options for Rider
  const riderComboboxOptions = useMemo<ComboboxOptionItem[]>(() => {
    const list: ComboboxOptionItem[] = [];

    // 1. Rider staff
    riderOptions.riders.forEach((r) => {
      list.push({
        value: r.name,
        label: r.name,
        subLabel: r.phone ? r.phone : undefined,
        phone: r.phone,
        group: '🚴‍♂️ ក្រុម Rider'
      });
    });

    // 2. Other staff
    riderOptions.others.forEach((p) => {
      list.push({
        value: p.name,
        label: p.name,
        subLabel: p.phone ? p.phone : undefined,
        phone: p.phone,
        group: '👥 បុគ្គលិកផ្សេងទៀត'
      });
    });

    return list;
  }, [riderOptions]);

  // Combobox options for Truck No (prioritizes assigned truck for selected driver)
  const truckComboboxOptions = useMemo<ComboboxOptionItem[]>(() => {
    if (assignedTrucksForDriver.length === 0) {
      const items: ComboboxOptionItem[] = truckModelOptions.map((m) => ({
        value: m,
        label: m
      }));
      items.push({
        value: 'ផ្សេងៗ (Other)',
        label: 'ផ្សេងៗ (Other)',
        badge: 'Other',
        group: '📌 ជម្រើសផ្សេងទៀត'
      });
      return items;
    }

    const list: ComboboxOptionItem[] = [];

    // 1. Prioritize driver's assigned truck(s) from Meterial_Office
    assignedTrucksForDriver.forEach((m) => {
      list.push({
        value: m,
        label: m,
        badge: '★ ឡានប្រចាំខ្លួន',
        subLabel: `ឡានរបស់ ${driverName} (Meterial_Office)`,
        group: `⭐ ឡានរបស់ Driver (${driverName})`
      });
    });

    // 2. All other trucks from Meterial_Office
    truckModelOptions
      .filter((m) => !assignedTrucksForDriver.includes(m))
      .forEach((m) => {
        list.push({
          value: m,
          label: m,
          group: '🚛 គ្រប់ Model No. ទាំងអស់'
        });
      });

    // 3. Option for Other
    list.push({
      value: 'ផ្សេងៗ (Other)',
      label: 'ផ្សេងៗ (Other)',
      badge: 'Other',
      group: '📌 ជម្រើសផ្សេងទៀត'
    });

    return list;
  }, [truckModelOptions, assignedTrucksForDriver, driverName]);

  // Refresh / sync truck model numbers & driver handles from Meterial_Office
  const refreshMeterialOfficeData = useCallback(async (force = false) => {
    const cachedTrucks = getCachedModelNoList();
    if (cachedTrucks.length > 0) {
      setTruckModelOptions(cachedTrucks);
    }
    const cachedDrivers = getCachedNameHandleList();
    if (cachedDrivers.length > 0) {
      setDriverHandleOptions(cachedDrivers);
    }
    const cachedMap = getCachedDriverTruckMap();
    if (Object.keys(cachedMap).length > 0) {
      setDriverTruckMap(cachedMap);
    }
    if (!force && cachedTrucks.length > 0 && cachedDrivers.length > 0 && Object.keys(cachedMap).length > 0) return;

    const sheetUrl =
      settings?.meterialOfficeSheetUrl ||
      localStorage.getItem('accounting_meterial_office_sheet_url') ||
      '';
    const sheetName =
      settings?.meterialOfficeSheetName ||
      localStorage.getItem('accounting_meterial_office_sheet_name') ||
      '';

    if (!sheetUrl) return;

    setIsLoadingTrucks(true);
    try {
      const [models, handles] = await Promise.all([
        getOrFetchModelNoList(sheetUrl, sheetName, force),
        getOrFetchNameHandleList(sheetUrl, sheetName, force)
      ]);
      if (models && models.length > 0) {
        setTruckModelOptions(models);
      }
      if (handles && handles.length > 0) {
        setDriverHandleOptions(handles);
      }
      const map = getCachedDriverTruckMap();
      if (map && Object.keys(map).length > 0) {
        setDriverTruckMap(map);
      }
    } catch (e) {
      console.debug('Failed to refresh Meterial_Office data:', e);
    } finally {
      setIsLoadingTrucks(false);
    }
  }, [settings?.meterialOfficeSheetUrl, settings?.meterialOfficeSheetName]);

  useEffect(() => {
    refreshMeterialOfficeData(false);

    const handleUpdate = () => {
      const models = getCachedModelNoList();
      if (models.length > 0) {
        setTruckModelOptions(models);
      }
      const handles = getCachedNameHandleList();
      if (handles.length > 0) {
        setDriverHandleOptions(handles);
      }
      const map = getCachedDriverTruckMap();
      if (Object.keys(map).length > 0) {
        setDriverTruckMap(map);
      }
    };

    window.addEventListener('meterial_office_data_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('meterial_office_data_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [refreshMeterialOfficeData]);

  // Batch Scanning State (Multiple Barcodes in 1 Operation)
  const [batchQueue, setBatchQueue] = useState<ManifestItem[]>(() => {
    return Array.isArray(initialDraft.batchQueue) ? initialDraft.batchQueue : [];
  });
  const batchQueueRef = useRef<ManifestItem[]>(Array.isArray(initialDraft.batchQueue) ? initialDraft.batchQueue : []);
  const queueSelection = useGridSelection<ManifestItem>(batchQueue, (item) => item.id);
  useEffect(() => {
    batchQueueRef.current = batchQueue;
  }, [batchQueue]);

  // Keep track of activeTab transitions to save & restore tab-specific drafts
  const prevActiveTabRef = useRef<WarehouseScanType>(activeTab);
  const isDraftMountedRef = useRef<boolean>(false);

  // Auto-persist form fields & batch queue to localStorage on reload/refresh
  useEffect(() => {
    if (!isDraftMountedRef.current) {
      isDraftMountedRef.current = true;
      return;
    }
    if (editingId) return; // Do not overwrite draft with editing state of an old record

    const hasData =
      batchQueue.length > 0 ||
      Boolean(origin.trim()) ||
      Boolean(destination.trim()) ||
      Boolean(driverName.trim()) ||
      Boolean(truckNo.trim()) ||
      Boolean(transferBy.trim()) ||
      Boolean(riderName.trim()) ||
      Boolean(deliveryZone.trim()) ||
      Boolean(remarks.trim()) ||
      Boolean(codAmount.trim()) ||
      Boolean(shelfLocation.trim());

    if (hasData) {
      saveWarehouseTabDraft(
        activeTab,
        {
          origin,
          destination,
          driverName,
          truckNo,
          transferBy,
          riderName,
          deliveryZone,
          codAmount,
          currency,
          remarks,
          holdReason,
          shelfLocation,
          scanDate,
          batchQueue
        },
        currentUser?.email
      );
    } else {
      clearWarehouseTabDraft(activeTab, currentUser?.email);
    }
  }, [
    activeTab,
    editingId,
    origin,
    destination,
    driverName,
    truckNo,
    transferBy,
    riderName,
    deliveryZone,
    codAmount,
    currency,
    remarks,
    holdReason,
    shelfLocation,
    scanDate,
    batchQueue,
    currentUser?.email
  ]);

  // Restore draft when switching activeTab
  useEffect(() => {
    if (prevActiveTabRef.current !== activeTab) {
      const draft = loadInitialWarehouseDraft(activeTab, currentUser?.email);
      setOrigin(draft.origin || '');
      setDestination(draft.destination || '');
      setDriverName(draft.driverName || '');
      setTruckNo(draft.truckNo || '');
      setTransferBy(draft.transferBy || '');
      setRiderName(draft.riderName || '');
      setDeliveryZone(draft.deliveryZone || '');
      setCodAmount(draft.codAmount || '');
      setCurrency(draft.currency || 'USD');
      setRemarks(draft.remarks || '');
      setHoldReason(draft.holdReason || reasonsForTab(activeTab)[0]);
      setShelfLocation(draft.shelfLocation || '');
      if (draft.scanDate && Array.isArray(draft.batchQueue) && draft.batchQueue.length > 0) {
        setScanDate(draft.scanDate);
      } else {
        try {
          setScanDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh' }).format(new Date()));
        } catch {
          setScanDate(new Date().toISOString().slice(0, 10));
        }
      }
      const targetQueue = Array.isArray(draft.batchQueue) ? draft.batchQueue : [];
      setBatchQueue(targetQueue);
      batchQueueRef.current = targetQueue;
      prevActiveTabRef.current = activeTab;

      // Reset transient inputs
      setEditingId(null);
      setBarcodeInput('');
      setAutoMatched(false);
      setMatchedPreview(null);
      setFormError(null);
      setDispatchedWarning(null);
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    }
  }, [activeTab]);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState<boolean>(false);
  const [isManifestModalOpen, setIsManifestModalOpen] = useState<boolean>(false);
  const [manifestData, setManifestData] = useState<{
    items: ManifestItem[];
    scanType: WarehouseScanType;
    date: string;
    operationCode?: string;
    destination?: string;
    driverName?: string;
    truckNo?: string;
    transferBy?: string;
    riderName?: string;
    deliveryZone?: string;
    holdReason?: string;
    shelfLocation?: string;
    operatorName?: string;
  } | null>(null);

  const [isOpPrintModalOpen, setIsOpPrintModalOpen] = useState<boolean>(false);

  const batchTotalCOD = useMemo(() => {
    let usd = 0;
    let khr = 0;
    batchQueue.forEach((it) => {
      if (it.codAmount) {
        if (it.currency === 'KHR') khr += it.codAmount;
        else usd += it.codAmount;
      }
    });
    return { usd, khr };
  }, [batchQueue]);

  const batchTotalKG = useMemo(() => {
    let kg = 0;
    batchQueue.forEach((it) => {
      const w = it.weightKg !== undefined ? it.weightKg : (lookupTrackingFromDataReport(it.barcode)?.weightKg || 0);
      if (w > 0) kg += w;
    });
    return Math.round(kg * 100) / 100;
  }, [batchQueue]);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Set of barcodes that have been dispatched (either SCAN_OUT or OUT_OF_DELIVERY)
  const dispatchedBarcodes = useMemo(() => {
    const set = new Set<string>();
    scans.forEach((s) => {
      if (s.scanType === 'SCAN_OUT' || s.scanType === 'OUT_OF_DELIVERY') {
        if (s.barcode) set.add(s.barcode.toUpperCase());
        if (s.tracking) set.add(s.tracking.toUpperCase());
      }
    });
    return set;
  }, [scans]);

  // 🏢 Arrived Hub: the ScanOut operation (OP-OUT-...) currently being received at this hub
  const [arrivedSourceOp, setArrivedSourceOpState] = useState<string>(() => {
    try {
      return localStorage.getItem('warehouse_arrived_source_op') || '';
    } catch {
      return '';
    }
  });
  const setArrivedSourceOp = (code: string) => {
    setArrivedSourceOpState(code);
    try {
      if (code) localStorage.setItem('warehouse_arrived_source_op', code);
      else localStorage.removeItem('warehouse_arrived_source_op');
    } catch {
      /* storage unavailable */
    }
  };

  // All ScanOut operations (from every operator: the receiving hub did not create them), newest first
  const scanOutOperations = useMemo(() => {
    const map = new Map<
      string,
      { code: string; origin: string; destination: string; driverName: string; truckNo: string; date: string; createdAt: string; operator: string; barcodes: Set<string> }
    >();
    for (const s of scans) {
      if (s.scanType !== 'SCAN_OUT') continue;
      const code = getOperationCode(s, scans);
      let op = map.get(code);
      if (!op) {
        op = {
          code,
          origin: s.origin || '',
          destination: s.destination || '',
          driverName: s.driverName || '',
          truckNo: s.truckNo || '',
          date: s.date || '',
          createdAt: s.createdAt || '',
          operator: s.createdBy || s.operatorEmail || '',
          barcodes: new Set<string>()
        };
        map.set(code, op);
      }
      if (s.barcode) op.barcodes.add(s.barcode.toUpperCase());
      if ((s.createdAt || '') > op.createdAt) op.createdAt = s.createdAt || '';
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [scans]);

  // Latest ScanOut operation for each barcode (to tell the operator where an unexpected parcel belongs)
  const scanOutOpByBarcode = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = scanOutOperations.length - 1; i >= 0; i--) {
      const op = scanOutOperations[i];
      op.barcodes.forEach((b) => map.set(b, op.code));
    }
    return map;
  }, [scanOutOperations]);

  // Arrived Hub locations of this user (null = Admin, sees every location)
  const myArrivedLocations = useMemo(() => getUserAllowedLocations(currentUser, permissions), [currentUser, permissions]);

  // ScanOut operations sent to this user's locations
  const myScanOutOperations = useMemo(
    () =>
      myArrivedLocations === null
        ? scanOutOperations
        : scanOutOperations.filter((op) => myArrivedLocations.some((l) => isLocationMatch(op.destination, l))),
    [scanOutOperations, myArrivedLocations]
  );

  // Arrived Hub receipts per OP-OUT (barcode → receipt scan), from every operator at the hub
  const arrivedScansByOp = useMemo(() => {
    const map = new Map<string, Map<string, WarehouseScanItem>>();
    for (const s of scans) {
      if (s.scanType !== 'ARRIVED_HUB' || !s.sourceOperationCode || !s.barcode) continue;
      let byBarcode = map.get(s.sourceOperationCode);
      if (!byBarcode) {
        byBarcode = new Map<string, WarehouseScanItem>();
        map.set(s.sourceOperationCode, byBarcode);
      }
      const key = s.barcode.toUpperCase();
      const prev = byBarcode.get(key);
      if (!prev || (s.createdAt || '') < (prev.createdAt || '')) byBarcode.set(key, s); // keep the first receipt
    }
    return map;
  }, [scans]);

  // Barcodes already received per OP-OUT
  const arrivedReceivedByOp = useMemo(() => {
    const map = new Map<string, Set<string>>();
    arrivedScansByOp.forEach((byBarcode, code) => map.set(code, new Set(byBarcode.keys())));
    return map;
  }, [arrivedScansByOp]);

  const getArrivedReceivedCount = useCallback(
    (op: { code: string; barcodes: Set<string> }) => {
      const received = arrivedReceivedByOp.get(op.code);
      if (!received) return 0;
      let n = 0;
      op.barcodes.forEach((b) => {
        if (received.has(b)) n++;
      });
      return n;
    },
    [arrivedReceivedByOp]
  );

  // Only OP-OUT not yet fully verified (the selected one stays so its progress remains visible)
  const pendingScanOutOperations = useMemo(
    () => myScanOutOperations.filter((op) => op.code === arrivedSourceOp || getArrivedReceivedCount(op) < op.barcodes.size),
    [myScanOutOperations, arrivedSourceOp, getArrivedReceivedCount]
  );

  const arrivedSourceInfo = useMemo(
    () => myScanOutOperations.find((op) => op.code === arrivedSourceOp) || null,
    [myScanOutOperations, arrivedSourceOp]
  );

  const arrivedSourceOptions = useMemo<ComboboxOptionItem[]>(
    () =>
      pendingScanOutOperations.map((op) => {
        const received = getArrivedReceivedCount(op);
        const total = op.barcodes.size;
        return {
          value: op.code,
          label: op.code,
          subLabel: `${op.date} • ${op.destination || '—'} • ${op.driverName || '—'} / ${op.truckNo || '—'}`,
          badge:
            received >= total ? `✅ រួច ${total}/${total}` : received > 0 ? `🟡 កំពុងទទួល ${received}/${total}` : `⏳ មិនទាន់ស្កេន • ${total} កញ្ចប់`
        };
      }),
    [pendingScanOutOperations, getArrivedReceivedCount]
  );

  // Pick a ScanOut operation to receive: copy its Destination / Driver / Truck into the form
  const handleSelectArrivedSource = (code: string) => {
    const op = myScanOutOperations.find((o) => o.code === code);
    if (!op) {
      setArrivedSourceOp('');
      return;
    }
    setArrivedSourceOp(op.code);
    setOrigin(op.origin);
    setDestination(op.destination);
    setDriverName(op.driverName);
    setTruckNo(op.truckNo);
    setFormError(null);
    setDispatchedWarning(null);
    setTimeout(() => barcodeInputRef.current?.focus(), 150);
  };

  // Received / missing / unexpected for the selected ScanOut operation (saved scans + current batch)
  const arrivedVerification = useMemo(() => {
    if (!arrivedSourceInfo) return null;
    const expected = arrivedSourceInfo.barcodes;
    const received = new Set<string>();
    const unexpected = new Set<string>();
    const add = (barcode?: string) => {
      const b = (barcode || '').toUpperCase();
      if (!b) return;
      if (expected.has(b)) received.add(b);
      else unexpected.add(b);
    };
    scans.forEach((s) => {
      if (s.scanType === 'ARRIVED_HUB' && s.sourceOperationCode === arrivedSourceInfo.code) add(s.barcode);
    });
    if (activeTab === 'ARRIVED_HUB') batchQueue.forEach((q) => add(q.barcode));
    const missing: string[] = [];
    expected.forEach((b) => {
      if (!received.has(b)) missing.push(b);
    });
    return { expectedCount: expected.size, received, unexpected: Array.from(unexpected), missing };
  }, [arrivedSourceInfo, scans, batchQueue, activeTab]);

  // Items that were scanned in (SCAN_IN) but have NOT been dispatched (not in SCAN_OUT or OUT_OF_DELIVERY)
  const unDispatchedScanInItems = useMemo(() => {
    const scanIns = scopedScans.filter((s) => s.scanType === 'SCAN_IN');
    // Parcels sent back to the shipper have left the warehouse too
    const returned = new Set(
      scopedScans.filter((s) => s.scanType === 'RETURN_SHIPMENTS').map((s) => (s.barcode || s.tracking || '').toUpperCase())
    );
    const map = new Map<string, WarehouseScanItem>();
    scanIns.forEach((item) => {
      const key = (item.barcode || item.tracking || '').toUpperCase();
      if (key && !dispatchedBarcodes.has(key) && !returned.has(key)) {
        map.set(key, item);
      }
    });
    return Array.from(map.values());
  }, [scopedScans, dispatchedBarcodes]);

  // 1-Click quick update hold for un-dispatched items
  const handleQuickUpdateHold = (item: WarehouseScanItem) => {
    setActiveTab('HOLD_REMAINING');
    setEditingId(null);
    setBarcodeInput(item.barcode);
    setOrigin(item.origin || '');
    setDestination(item.destination || '');
    setRemarks(item.remarks ? `ScanIn: ${item.remarks}` : '');
    setScanDate(new Date().toISOString().slice(0, 10));
    setHoldReason(HOLD_REASONS[0]);
    setDispatchedWarning(null);
    setIsFormOpen(true);
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  };


  // Reset tab-specific filters when switching between warehouse functions
  useEffect(() => {
    setFilterDriver('ALL');
    setFilterTruckNo('ALL');
    setFilterRider('ALL');
    setFilterHoldReason('ALL');
    setFilterShelfLocation('ALL');
    setFilterOperationCode('ALL');
  }, [activeTab]);

  // Pagination & View Mode
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'cards' : 'table'
  );
  const [isGroupedByOperation, setIsGroupedByOperation] = useState<boolean>(true);
  const [expandedOpCodes, setExpandedOpCodes] = useState<Set<string>>(new Set());

  const toggleExpandOpCode = (opCode: string) => {
    setExpandedOpCodes((prev) => {
      const next = new Set(prev);
      if (next.has(opCode)) next.delete(opCode);
      else next.add(opCode);
      return next;
    });
  };

  // Multi-item selection states
  const [selectedScanIds, setSelectedScanIds] = useState<Set<string>>(new Set());
  const [isBatchDeleting, setIsBatchDeleting] = useState<boolean>(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState<boolean>(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState<boolean>(false);
  const [isClearingAll, setIsClearingAll] = useState<boolean>(false);

  // Clear selections & collapse operations when switching tabs
  useEffect(() => {
    setSelectedScanIds(new Set());
    setExpandedOpCodes(new Set());
  }, [activeTab, remainingSubTab]);

  // Modal states
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<WarehouseScanItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isBackingUpPg, setIsBackingUpPg] = useState<boolean>(false);
  const [showDeployHelpModal, setShowDeployHelpModal] = useState<boolean>(false);
  const [showCodeViewerModal, setShowCodeViewerModal] = useState<boolean>(false);
  const [isCodeGsCopied, setIsCodeGsCopied] = useState<boolean>(false);

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
    if (activeTab === 'ARRIVED_HUB' && !arrivedSourceInfo) {
      setFormError('⚠️ សូមជ្រើសរើស ប្រតិបត្តិការ ScanOut (OP-OUT) ដែលត្រូវទទួល ជាមុនសិន!');
      if (soundEnabled) playWarningBeep();
      setBarcodeInput('');
      return;
    }
    if (activeTab === 'OUT_OF_DELIVERY' && !riderName.trim()) {
      setFormError('⚠️ សូមជ្រើសរើស Rider (អ្នកដឹក) ជាមុនសិន ទើបអនុញ្ញាតអោយស្កេន Barcode!');
      if (soundEnabled) playWarningBeep();
      setBarcodeInput('');
      return;
    }
    if (isTruckScanType(activeTab) && (!destination.trim() || !driverName.trim() || !truckNo.trim() || (hasOriginField(activeTab) && !origin.trim()))) {
      setFormError('⚠️ សូមជ្រើសរើស Origin, ទីតាំង, Driver (អ្នកបើកបរ) និង Truck No ជាមុនសិន ទើបអនុញ្ញាតអោយស្កេន Barcode!');
      if (soundEnabled) playWarningBeep();
      setBarcodeInput('');
      return;
    }
    // Scanner Gun detection (rapid character input stream from hardware barcode reader)
    const now = Date.now();
    const charDelta = now - lastCharTimeRef.current;
    lastCharTimeRef.current = now;
    if (charDelta < 85) {
      fastKeystrokesCountRef.current++;
    } else {
      fastKeystrokesCountRef.current = 1;
    }

    // A. If scanner gun sends newline / carriage return (or user pasted code with newline)
    if (val.includes('\n') || val.includes('\r')) {
      const cleanOnEnter = sanitizeTrackingCode(val);
      if (cleanOnEnter) {
        if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
        handleAddBarcodeToBatch(cleanOnEnter);
        return;
      }
    }

    setBarcodeInput(val);
    setFormError(null);
    setDispatchedWarning(null);
    const clean = sanitizeTrackingCode(val).toUpperCase();
    if (clean.length >= 4) {
      // 1. Check if item has already departed
      if (activeTab !== 'ARRIVED_HUB' && activeTab !== 'RETURN_SHIPMENTS' && dispatchedBarcodes.has(clean)) {
        setDispatchedWarning(`⚠️ កញ្ចប់លេខ ${clean} នេះធ្លាប់បាន ScanOut ឬចេញចែកចាយ (Rider) រួចរាល់ហើយ!`);
      }

      // 2. Auto-lookup previous ScanIn to pre-fill destination
      const prevScanIn = scans.find(
        (s) => s.scanType === 'SCAN_IN' && (s.barcode?.toUpperCase() === clean || s.tracking?.toUpperCase() === clean)
      );
      if (prevScanIn && prevScanIn.destination && !destination) {
        setDestination(prevScanIn.destination);
      }

      // 3. Lookup in DataReport
      const match = lookupTrackingFromDataReport(clean);
      if (match) {
        setMatchedPreview(match);
        if (match.destination && !isReasonScanType(activeTab)) {
          const matchedProv = provinceOptions.find((p) =>
            p.toLowerCase().trim() === match.destination!.toLowerCase().trim() ||
            p.toLowerCase().includes(match.destination!.toLowerCase().trim()) ||
            match.destination!.toLowerCase().includes(p.toLowerCase().trim())
          );
          setDestination(matchedProv || match.destination);
        }
        if (match.codAmount !== undefined) setCodAmount(String(match.codAmount));
        if (match.currency) setCurrency(match.currency);
        if (match.holdReason && activeTab === 'HOLD_REMAINING') {
          const matchedReason = HOLD_REASONS.find((r) =>
            r.toLowerCase().includes(match.holdReason!.toLowerCase()) ||
            match.holdReason!.toLowerCase().includes(r.toLowerCase())
          );
          if (matchedReason) {
            setHoldReason(matchedReason);
          } else {
            setHoldReason(match.holdReason);
          }
        }
        if (match.shelfLocation && activeTab === 'HOLD_REMAINING') {
          setShelfLocation(match.shelfLocation);
        }
        setAutoMatched(true);
      } else {
        setMatchedPreview(null);
        setAutoMatched(false);
      }

      // B. Auto-Submit in Continuous Scan mode if barcode was input by a hardware scanner gun
      if (autoContinuousScan && fastKeystrokesCountRef.current >= 4 && clean.length >= 5) {
        if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
        autoSubmitTimerRef.current = setTimeout(() => {
          handleAddBarcodeToBatch(clean);
        }, 150);
      }
    } else {
      setMatchedPreview(null);
      setAutoMatched(false);
    }
  };

  const resetFormFields = (fullClear: boolean = false) => {
    setEditingId(null);
    setBarcodeInput('');
    setAutoMatched(false);
    setMatchedPreview(null);
    setFormError(null);
    setDispatchedWarning(null);
    if (fullClear) {
      if (batchQueue.length > 0) {
        if (!window.confirm(`តើអ្នកពិតជាចង់លុបសម្អាត Form និងបញ្ជី Batch ចំនួន ${batchQueue.length} កញ្ចប់នេះមែនទេ?`)) {
          return;
        }
        setBatchQueue([]);
        batchQueueRef.current = [];
      }
      setOrigin('');
      setDestination('');
      setDriverName('');
      setTruckNo('');
      setTransferBy('');
      setRiderName('');
      setDeliveryZone('');
      setCodAmount('');
      setRemarks('');
      setHoldReason(reasonsForTab(activeTab)[0]);
      setShelfLocation('');
      clearWarehouseTabDraft(activeTab, currentUser?.email);
    }
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  };

  const handleEditItem = (item: WarehouseScanItem) => {
    setEditingId(item.id);
    setActiveTab(item.scanType);
    setBarcodeInput(item.barcode);
    setOrigin(item.origin || '');
    setDestination(item.destination || '');
    setDriverName(item.driverName || '');
    setTruckNo(item.truckNo || '');
    setTransferBy(item.transferBy || '');
    setCodAmount(item.codAmount !== undefined ? String(item.codAmount) : '');
    setCurrency(item.currency || 'USD');
    setRiderName(item.riderName || '');
    setDeliveryZone(item.deliveryZone || '');
    setRemarks(item.remarks || '');
    setHoldReason(item.holdReason || reasonsForTab(activeTab)[0]);
    setShelfLocation(item.shelfLocation || '');
    setScanDate(item.date);
    setDispatchedWarning(null);
    setIsFormOpen(true);
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 150);
  };

  // 1. Add Barcode to Batch Queue
  const handleAddBarcodeToBatch = (explicitCode?: string): { success: boolean; message?: string } => {
    const raw = explicitCode !== undefined ? explicitCode : barcodeInput;
    const cleanBarcode = sanitizeTrackingCode(raw).toUpperCase();
    if (!cleanBarcode) {
      setFormError('សូមបញ្ចូល ឬស្កេនលេខ Barcode / Tracking!');
      barcodeInputRef.current?.focus();
      return { success: false, message: 'សូមបញ្ចូល ឬស្កេនលេខ Barcode / Tracking!' };
    }

    // Validation: Arrived Hub must be receiving a specific ScanOut operation
    if (activeTab === 'ARRIVED_HUB' && !arrivedSourceInfo) {
      setFormError('⚠️ សូមជ្រើសរើស ប្រតិបត្តិការ ScanOut (OP-OUT) ដែលត្រូវទទួល ជាមុនសិន!');
      if (soundEnabled) playWarningBeep();
      return { success: false, message: '⚠️ សូមជ្រើសរើស OP-OUT ជាមុនសិន!' };
    }

    // Validation: Rider is strictly mandatory for OUT_OF_DELIVERY
    if (activeTab === 'OUT_OF_DELIVERY' && !riderName.trim()) {
      setFormError('⚠️ សូមជ្រើសរើស Rider (អ្នកដឹក) ជាមុនសិន ទើបអនុញ្ញាតអោយស្កេន Barcode!');
      if (soundEnabled) playWarningBeep();
      return { success: false, message: '⚠️ សូមជ្រើសរើស Rider (អ្នកដឹក) ជាមុនសិន!' };
    }

    // Validation: Destination, Driver, and Truck No are mandatory for ScanIn and ScanOut
    if (isTruckScanType(activeTab)) {
      if (hasOriginField(activeTab) && !origin.trim()) {
        setFormError('⚠️ សូមជ្រើសរើស ORIGIN (ប្រភព) ជាមុនសិន (ទាមទារដាច់ខាត)!');
        return { success: false, message: '⚠️ សូមជ្រើសរើស ORIGIN (ប្រភព) ជាមុនសិន!' };
      }
      if (!destination.trim()) {
        setFormError('⚠️ សូមជ្រើសរើស ទីតាំង / ខេត្ត-ក្រុង ជាមុនសិន (ទាមទារដាច់ខាត)!');
        return { success: false, message: '⚠️ សូមជ្រើសរើស ទីតាំង / គោលដៅ ជាមុនសិន!' };
      }
      if (!driverName.trim()) {
        setFormError('⚠️ សូមជ្រើសរើស Driver (អ្នកបើកបរ) ជាមុនសិន (ទាមទារដាច់ខាត)!');
        if (soundEnabled) playWarningBeep();
        return { success: false, message: '⚠️ សូមជ្រើសរើស Driver ជាមុនសិន!' };
      }
      if (!truckNo.trim()) {
        setFormError('⚠️ សូមជ្រើសរើស Truck No ជាមុនសិន (ទាមទារដាច់ខាត)!');
        if (soundEnabled) playWarningBeep();
        return { success: false, message: '⚠️ សូមជ្រើសរើស Truck No ជាមុនសិន!' };
      }
    }
    if (activeTab === 'HOLD_REMAINING' && !holdReason.trim()) {
      setFormError('⚠️ សូមជ្រើសរើស មូលហេតុនៅសល់ / ផ្អាក ជាមុនសិន!');
      return { success: false, message: '⚠️ សូមជ្រើសរើស មូលហេតុនៅសល់ ជាមុនសិន!' };
    }
    if (activeTab === 'RETURN_SHIPMENTS' && !holdReason.trim()) {
      setFormError('⚠️ សូមជ្រើសរើស មូលហេតុបង្វិលត្រឡប់ ជាមុនសិន!');
      return { success: false, message: '⚠️ សូមជ្រើសរើស មូលហេតុបង្វិល ជាមុនសិន!' };
    }

    // A. Check duplicate in current Batch Queue (using batchQueueRef to guarantee fresh state against camera loops)
    const currentQueue = batchQueueRef.current;
    if (currentQueue.some((it) => it.barcode?.toUpperCase() === cleanBarcode)) {
      if (soundEnabled) {
        playDuplicateAlarmSound(undefined, 'ស្ទួន! មានក្នុងកន្ត្រកស្កេនរួចហើយ');
      }
      const dupMsg = `⚠️ លេខ Barcode «${cleanBarcode}» ត្រូវបានស្កេនចូលក្នុង Batch នេះរួចហើយ! (ស្ទួន)`;
      setFormError(dupMsg);
      return { success: false, message: dupMsg };
    }

    // B. Check duplicate in database for same scanType today (or across connected operators)
    // (Arrived Hub: also a duplicate if already received for this OP-OUT on any date)
    const existingDup = scans.find(
      (s) =>
        s.scanType === activeTab &&
        (s.date === scanDate || (activeTab === 'ARRIVED_HUB' && s.sourceOperationCode === arrivedSourceOp)) &&
        (s.barcode?.toUpperCase() === cleanBarcode || s.tracking?.toUpperCase() === cleanBarcode)
    );
    if (existingDup) {
      const opCodeStr = getOperationCode(existingDup, scans);
      const whoScanned = existingDup.createdBy || existingDup.operatorEmail || 'បុគ្គលិកផ្សេង';
      const whenScanned = formatCreatedAt(existingDup.createdAt);
      const dupMsg = `⚠️ ស្ទួន (Duplicate)! Barcode «${cleanBarcode}» ធ្លាប់បានស្កេន ${STATION_INFO[activeTab as StationLockMode]?.short || activeTab} រួចហើយដោយ ${whoScanned} នៅម៉ោង ${whenScanned} (${opCodeStr})!`;

      if (soundEnabled) {
        playDuplicateAlarmSound(undefined, 'ស្ទួន! បានស្កេនរួចហើយ');
      }
      setFormError(dupMsg);
      setDispatchedWarning(dupMsg);

      if (blockDuplicates) {
        // 🚨 Strict duplicate protection: refuse to add duplicate to queue and refocus
        setTimeout(() => {
          if (barcodeInputRef.current) {
            barcodeInputRef.current.focus();
            barcodeInputRef.current.select();
          }
        }, 50);
        return { success: false, message: dupMsg };
      }
    } else {
      setDispatchedWarning(null);
    }

    // C. Arrived Hub: verify the parcel against the selected ScanOut operation (warn, but still allow)
    let arrivalStatus: ArrivalStatus | undefined;
    if (activeTab === 'ARRIVED_HUB' && arrivedSourceInfo) {
      if (arrivedSourceInfo.barcodes.has(cleanBarcode)) {
        arrivalStatus = 'MATCHED';
      } else {
        arrivalStatus = 'UNEXPECTED';
        const otherOp = scanOutOpByBarcode.get(cleanBarcode);
        const warnMsg = otherOp
          ? `⚠️ «${cleanBarcode}» មិនមានក្នុង ${arrivedSourceInfo.code} ទេ (ជារបស់ ${otherOp})។ បានកត់ត្រាជា «លើស/ខុសបញ្ជី»។`
          : `⚠️ «${cleanBarcode}» មិនមានក្នុងប្រតិបត្តិការ ScanOut ណាមួយទេ។ បានកត់ត្រាជា «លើស/ខុសបញ្ជី»។`;
        if (soundEnabled) playWarningBeep();
        setDispatchedWarning(warnMsg);
        notify(warnMsg, 'info');
      }
    }

    // D. Auto-match from cached DataReport
    const match = lookupTrackingFromDataReport(cleanBarcode);

    // If destination exists in Data Report, auto-sync destination state (not for Arrived Hub and not for Hold Remaining)
    if (match?.destination && activeTab !== 'ARRIVED_HUB' && !isReasonScanType(activeTab)) {
      const matchedProv = provinceOptions.find((p) =>
        p.toLowerCase().trim() === match.destination!.toLowerCase().trim() ||
        p.toLowerCase().includes(match.destination!.toLowerCase().trim()) ||
        match.destination!.toLowerCase().includes(p.toLowerCase().trim())
      );
      setDestination(matchedProv || match.destination);
    }

    const queuedItem: ManifestItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      barcode: cleanBarcode,
      shipper: match?.shipper,
      consignee: match?.consignee,
      origin: hasOriginField(activeTab) ? (origin.trim() || undefined) : undefined,
      destination: activeTab === 'ARRIVED_HUB' ? destination : isReasonScanType(activeTab) ? undefined : (match?.destination || destination),
      transferBy: activeTab === 'SCAN_IN' ? (transferBy.trim() || undefined) : undefined,
      sourceOperationCode: activeTab === 'ARRIVED_HUB' ? arrivedSourceInfo?.code : undefined,
      arrivalStatus,
      driverName: isTruckScanType(activeTab) ? (driverName.trim() || undefined) : undefined,
      truckNo: isTruckScanType(activeTab) ? (truckNo.trim() || undefined) : undefined,
      payment: match?.payment,
      customerName: match?.consignee || match?.customerName,
      customerPhone: match?.customerPhone,
      codAmount: match?.codAmount !== undefined ? match.codAmount : (codAmount ? parseFloat(codAmount) : undefined),
      currency: match?.currency || currency || 'USD',
      shelfLocation: (activeTab === 'HOLD_REMAINING' ? (shelfLocation.trim() || match?.shelfLocation || undefined) : undefined),
      holdReason: (isReasonScanType(activeTab) ? (holdReason.trim() || match?.holdReason || reasonsForTab(activeTab)[0]) : undefined),
      remarks: remarks.trim() || (activeTab !== 'ARRIVED_HUB' && activeTab !== 'RETURN_SHIPMENTS' && dispatchedBarcodes.has(cleanBarcode) ? 'ចែកជូនឡើងវិញ (Re-delivery)' : undefined),
      weightKg: match?.weightKg,
      scannedAt: new Date().toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    setBatchQueue((prev) => {
      if (prev.some((it) => it.barcode?.toUpperCase() === cleanBarcode)) {
        return prev;
      }
      const updated = [queuedItem, ...prev];
      batchQueueRef.current = updated;
      saveWarehouseTabDraft(
        activeTab,
        {
          origin,
          destination,
          driverName,
          truckNo,
          transferBy,
          riderName,
          deliveryZone,
          codAmount,
          currency,
          remarks,
          holdReason,
          shelfLocation,
          scanDate,
          batchQueue: updated
        },
        currentUser?.email
      );
      return updated;
    });
    if (soundEnabled) playScanBeep();

    setFormError(null);
    setBarcodeInput('');
    setRemarks('');
    setAutoMatched(false);
    setMatchedPreview(null);

    // Guaranteed Focus retention for continuous scanning without re-clicking!
    const refocus = () => {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
        barcodeInputRef.current.select();
      }
    };
    refocus();
    requestAnimationFrame(refocus);
    setTimeout(refocus, 40);
    setTimeout(refocus, 120);

    return {
      success: true,
      message: `✓ បានបន្ថែម #${cleanBarcode} ចូល Batch (${batchQueue.length + 1})`
    };
  };

  const handleUpdateBatchItemRemarks = (id: string, newRemarks: string) => {
    setBatchQueue((prev) => {
      const next = prev.map((it) => (it.id === id ? { ...it, remarks: newRemarks } : it));
      batchQueueRef.current = next;
      saveWarehouseTabDraft(
        activeTab,
        {
          origin,
          destination,
          driverName,
          truckNo,
          transferBy,
          riderName,
          deliveryZone,
          codAmount,
          currency,
          remarks,
          holdReason,
          shelfLocation,
          scanDate,
          batchQueue: next
        },
        currentUser?.email
      );
      return next;
    });
  };

  const handleRemoveBatchItem = (id: string) => {
    setBatchQueue((prev) => {
      const next = prev.filter((it) => it.id !== id);
      batchQueueRef.current = next;
      saveWarehouseTabDraft(
        activeTab,
        {
          origin,
          destination,
          driverName,
          truckNo,
          transferBy,
          riderName,
          deliveryZone,
          codAmount,
          currency,
          remarks,
          holdReason,
          shelfLocation,
          scanDate,
          batchQueue: next
        },
        currentUser?.email
      );
      return next;
    });
  };

  const handleClearBatch = () => {
    if (batchQueue.length === 0) return;
    if (window.confirm(`តើអ្នកពិតជាចង់លុបសម្អាត Batch ចំនួន ${batchQueue.length} កញ្ចប់ និងទិន្នន័យ Form ទាំងអស់នេះមែនទេ?`)) {
      setBatchQueue([]);
      batchQueueRef.current = [];
      setOrigin('');
      setDestination('');
      setDriverName('');
      setTruckNo('');
      setTransferBy('');
      setRiderName('');
      setDeliveryZone('');
      setCodAmount('');
      setRemarks('');
      setHoldReason(reasonsForTab(activeTab)[0]);
      setShelfLocation('');
      setBarcodeInput('');
      setEditingId(null);
      setFormError(null);
      setDispatchedWarning(null);
      clearWarehouseTabDraft(activeTab, currentUser?.email);
      notify('✓ បានលុបសម្អាត Batch និង Form រួចរាល់!', 'info');
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    }
  };

  // 2. Save entire Batch Queue to Storage, Database & Google Sheets
  const handleSaveBatch = async () => {
    if (batchQueue.length === 0) return;
    if (!canCreate) {
      notify('អ្នកមិនមានសិទ្ធិបញ្ចូលទិន្នន័យស្កេនថ្មីឡើយ', 'error');
      return;
    }

    setIsSubmittingBatch(true);
    setFormError(null);

    try {
      // Concurrency-safe Operation Code generation across all connected operators partitioned by Email
      const generatedOpCode = await getNextOperationCode(
        activeTab,
        scanDate,
        scans,
        currentUser?.email || currentUser?.name
      );

      const itemsToSave = batchQueue.map((q) => ({
        operationCode: generatedOpCode,
        batchId: generatedOpCode,
        scanType: activeTab,
        barcode: q.barcode,
        tracking: q.barcode,
        shipper: q.shipper,
        consignee: q.consignee,
        payment: q.payment,
        customerName: q.consignee || q.customerName,
        customerPhone: q.customerPhone,
        origin: hasOriginField(activeTab) ? (q.origin || origin || '').trim() || undefined : undefined,
        destination: isReasonScanType(activeTab) ? undefined : ((q.destination || destination || '').trim() || undefined),
        driverName: isTruckScanType(activeTab) ? (driverName || '').trim() || undefined : undefined,
        truckNo: isTruckScanType(activeTab) ? (truckNo || '').trim() || undefined : undefined,
        transferBy: activeTab === 'SCAN_IN' ? (transferBy || '').trim() || undefined : undefined,
        riderName: activeTab === 'OUT_OF_DELIVERY' ? (riderName || '').trim() || undefined : undefined,
        deliveryZone: activeTab === 'OUT_OF_DELIVERY' ? (deliveryZone || '').trim() || undefined : undefined,
        codAmount: q.codAmount,
        currency: q.currency || 'USD',
        holdReason: isReasonScanType(activeTab) ? (q.holdReason || holdReason || reasonsForTab(activeTab)[0]) : undefined,
        shelfLocation: activeTab === 'HOLD_REMAINING' ? (q.shelfLocation || shelfLocation || '').trim() || undefined : undefined,
        sourceOperationCode: activeTab === 'ARRIVED_HUB' ? q.sourceOperationCode || arrivedSourceOp || undefined : undefined,
        arrivalStatus: activeTab === 'ARRIVED_HUB' ? q.arrivalStatus : undefined,
        remarks: (q.remarks || remarks || '').trim() || undefined,
        date: scanDate,
        operatorEmail: currentUser?.email || '',
        createdBy: currentUser?.name || currentUser?.email || 'User'
      }));

      const saved = await saveWarehouseScanBatch(itemsToSave);

      // Immediately update local scans state for instant UI response (0ms)
      setScans((prev) => {
        const newIds = new Set(saved.map((s) => s.id));
        return [...saved, ...prev.filter((p) => !newIds.has(p.id))];
      });

      // Save manifest data for printing with operationCode
      setManifestData({
        items: [...batchQueue],
        scanType: activeTab,
        date: scanDate,
        operationCode: generatedOpCode,
        origin: hasOriginField(activeTab) ? origin || undefined : undefined,
        destination: isReasonScanType(activeTab) ? undefined : (destination || undefined),
        driverName: driverName || undefined,
        truckNo: truckNo || undefined,
        transferBy: activeTab === 'SCAN_IN' ? (transferBy || undefined) : undefined,
        riderName: riderName || undefined,
        deliveryZone: deliveryZone || undefined,
        holdReason: holdReason || undefined,
        shelfLocation: shelfLocation || undefined,
        operatorName: currentUser?.name || currentUser?.email || 'User'
      });

      notify(`✓ បានរក្សាទុក Batch ចំនួន ${saved.length} កញ្ចប់ ជោគជ័យ!`, 'success');
      setBatchQueue([]);
      batchQueueRef.current = [];
      saveWarehouseTabDraft(
        activeTab,
        {
          origin,
          destination,
          driverName,
          truckNo,
          transferBy,
          riderName,
          deliveryZone,
          codAmount,
          currency,
          remarks,
          holdReason,
          shelfLocation,
          scanDate,
          batchQueue: []
        },
        currentUser?.email
      );
      resetFormFields(false);
      setIsManifestModalOpen(true);
    } catch (err: any) {
      setFormError(err?.message || 'កំហុសពេលរក្សាទុក Batch');
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  // Submit scan form (handles single edit or batch add)
  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // If editing existing item, update it directly
    if (editingId) {
      const cleanBarcode = sanitizeTrackingCode(barcodeInput).toUpperCase();
      if (!cleanBarcode) {
        setFormError('សូមបញ្ចូល ឬស្កេនលេខ Barcode / Tracking!');
        barcodeInputRef.current?.focus();
        return;
      }

      if (isTruckScanType(activeTab)) {
        if (hasOriginField(activeTab) && !origin.trim()) {
          setFormError('⚠️ សូមជ្រើសរើស ORIGIN (ប្រភព) ជាមុនសិន (ទាមទារដាច់ខាត)!');
          return;
        }
        if (!destination.trim()) {
          setFormError('⚠️ សូមជ្រើសរើស ទីតាំង / ខេត្ត-ក្រុង ជាមុនសិន (ទាមទារដាច់ខាត)!');
          return;
        }
        if (!driverName.trim()) {
          setFormError('⚠️ សូមជ្រើសរើស Driver (អ្នកបើកបរ) ជាមុនសិន (ទាមទារដាច់ខាត)!');
          return;
        }
        if (!truckNo.trim()) {
          setFormError('⚠️ សូមជ្រើសរើស Truck No ជាមុនសិន (ទាមទារដាច់ខាត)!');
          return;
        }
      }

      if (activeTab === 'OUT_OF_DELIVERY' && !riderName.trim()) {
        setFormError('⚠️ សូមជ្រើសរើស Rider (អ្នកដឹក) ជាមុនសិន (ទាមទារដាច់ខាត)!');
        return;
      }

      setIsSubmitting(true);
      setFormError(null);

      try {
        const existingItem = scans.find((s) => s.id === editingId);
        const itemPayload: any = {
          id: editingId,
          operationCode: existingItem?.operationCode,
          batchId: existingItem?.batchId,
          scanType: activeTab,
          barcode: cleanBarcode,
          tracking: cleanBarcode,
          shipper: matchedPreview?.shipper,
          consignee: matchedPreview?.consignee,
          payment: matchedPreview?.payment,
          customerName: matchedPreview?.consignee,
          customerPhone: matchedPreview?.customerPhone,
          date: scanDate,
          operatorEmail: currentUser?.email || '',
          createdBy: currentUser?.name || currentUser?.email || 'User'
        };

        if (isTruckScanType(activeTab)) {
          itemPayload.destination = destination.trim();
          if (hasOriginField(activeTab)) itemPayload.origin = origin.trim() || undefined;
          itemPayload.driverName = driverName.trim() || undefined;
          itemPayload.truckNo = truckNo.trim() || undefined;
          if (activeTab === 'SCAN_IN') {
            itemPayload.transferBy = transferBy.trim() || undefined;
          }
          if (activeTab === 'ARRIVED_HUB') {
            itemPayload.sourceOperationCode = existingItem?.sourceOperationCode;
            itemPayload.arrivalStatus = existingItem?.arrivalStatus;
            itemPayload.remarks = existingItem?.remarks;
          }
        } else if (activeTab === 'OUT_OF_DELIVERY') {
          itemPayload.riderName = riderName.trim() || undefined;
          itemPayload.deliveryZone = deliveryZone.trim() || undefined;
          itemPayload.codAmount = codAmount.trim() ? parseFloat(codAmount) : undefined;
          itemPayload.currency = currency;
          itemPayload.remarks = remarks.trim() || undefined;
        } else if (activeTab === 'RETURN_SHIPMENTS') {
          itemPayload.destination = undefined;
          itemPayload.holdReason = holdReason.trim() || RETURN_REASONS[0];
          itemPayload.remarks = remarks.trim() || undefined;
        } else if (activeTab === 'HOLD_REMAINING') {
          itemPayload.destination = undefined;
          itemPayload.holdReason = holdReason.trim() || reasonsForTab(activeTab)[0];
          itemPayload.shelfLocation = shelfLocation.trim() || undefined;
          itemPayload.remarks = remarks.trim() || undefined;
        }

        const saved = await saveWarehouseScan(itemPayload);
        setScans((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
        if (soundEnabled) playScanBeep();
        notify(`✓ បានកែប្រែទិន្នន័យស្កេនជោគជ័យ៖ ${saved.barcode}`, 'success');
        resetFormFields(false);
      } catch (err: any) {
        setFormError(err?.message || 'កំហុសពេលកែប្រែទិន្នន័យ');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Normal Add to Batch Queue
    handleAddBarcodeToBatch();
  };

  // Delete Scan item (Instant Optimistic UI)
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    const target = itemToDelete;

    // 1. Instant optimistic UI feedback (0ms latency)
    setItemToDelete(null);
    setScans((prev) => prev.filter((p) => p.id !== target.id));
    if (editingId === target.id) {
      resetFormFields();
    }
    notify(`✓ បានលុបកំណត់ត្រាស្កេន ${target.barcode} ជោគជ័យ!`, 'success');

    // 2. Background persistent deletion
    try {
      await deleteWarehouseScan(target.id, target.barcode, target.scanType);
    } catch (err: any) {
      console.warn('Background delete error:', err);
      notify(err?.message || 'បរាជ័យក្នុងការលុបពី Hostinger MariaDB Master!', 'error');
    }
  };


  // Fetch / Pull latest scans from Hostinger Master Database
  const [isFetchingSheets, setIsFetchingSheets] = useState<boolean>(false);
  const handleFetchGoogleSheets = async () => {
    if (isFetchingSheets) return;
    setIsFetchingSheets(true);
    try {
      const items = await fetchWarehouseScansFromMaster();
      notify(`✓ បានទាញយកទិន្នន័យ (${items.length} មុខទំនិញ) ពី Hostinger Master Database ជោគជ័យ!`, 'success');
    } catch (e: any) {
      notify(`កំហុសក្នុងការទាញយកទិន្នន័យពី Hostinger Database៖ ${e?.message || String(e)}`, 'error');
    } finally {
      setIsFetchingSheets(false);
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

  // Unique filter option lists from current dataset
  const uniqueFilterOptions = useMemo(() => {
    const destSet = new Set<string>();
    const driverSet = new Set<string>();
    const truckSet = new Set<string>();
    const riderSet = new Set<string>();
    const reasonSet = new Set<string>();
    const returnReasonSet = new Set<string>();
    const branchSet = new Set<string>();
    const shelfSet = new Set<string>();

    provinceOptions.forEach((p) => {
      destSet.add(p);
      branchSet.add(p);
    });
    HOLD_REASONS.forEach((r) => reasonSet.add(r));

    scans.forEach((s) => {
      if (s.destination) {
        destSet.add(s.destination);
        branchSet.add(s.destination);
      }
      if (s.driverName) driverSet.add(s.driverName);
      if (s.truckNo) truckSet.add(s.truckNo);
      if (s.riderName) riderSet.add(s.riderName);
      if (s.holdReason && s.scanType === 'RETURN_SHIPMENTS') returnReasonSet.add(s.holdReason);
      else if (s.holdReason) reasonSet.add(s.holdReason);
      if (s.shelfLocation) shelfSet.add(s.shelfLocation);
      if (s.deliveryZone) branchSet.add(s.deliveryZone);
    });

    driverOptions.drivers.forEach((d) => driverSet.add(d.name));
    driverOptions.others.forEach((d) => driverSet.add(d.name));
    driverHandleOptions.forEach((h) => driverSet.add(h));
    riderOptions.riders.forEach((r) => riderSet.add(r.name));
    riderOptions.others.forEach((r) => riderSet.add(r.name));
    truckModelOptions.forEach((m) => truckSet.add(m));

    return {
      destinations: Array.from(destSet).filter(Boolean).sort((a, b) => a.localeCompare(b)),
      drivers: Array.from(driverSet).filter(Boolean).sort((a, b) => a.localeCompare(b)),
      trucks: Array.from(truckSet).filter(Boolean).sort((a, b) => a.localeCompare(b)),
      riders: Array.from(riderSet).filter(Boolean).sort((a, b) => a.localeCompare(b)),
      holdReasons: Array.from(reasonSet).filter(Boolean),
      returnReasons: Array.from(returnReasonSet).filter(Boolean),
      shelves: Array.from(shelfSet).filter(Boolean).sort((a, b) => a.localeCompare(b)),
      branchTargets: Array.from(branchSet).filter(Boolean).sort((a, b) => a.localeCompare(b))
    };
  }, [scans, provinceOptions, driverOptions, riderOptions, truckModelOptions, driverHandleOptions]);

  // Active filters counter (context-aware for activeTab - only counts filters inside the filter panel)
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterStartDate) count++;
    if (filterEndDate) count++;
    if (filterDestination !== 'ALL') count++;
    if (filterBranchTarget !== 'ALL') count++;

    if (isTruckScanType(activeTab)) {
      if (filterDriver !== 'ALL') count++;
      if (filterTruckNo !== 'ALL') count++;
    } else if (activeTab === 'OUT_OF_DELIVERY') {
      if (filterRider !== 'ALL') count++;
    } else if (activeTab === 'HOLD_REMAINING') {
      if (filterHoldReason !== 'ALL') count++;
      if (filterShelfLocation !== 'ALL') count++;
    } else if (activeTab === 'RETURN_SHIPMENTS') {
      if (filterHoldReason !== 'ALL') count++;
    }

    return count;
  }, [
    activeTab,
    filterDestination,
    filterDriver,
    filterTruckNo,
    filterRider,
    filterHoldReason,
    filterBranchTarget,
    filterShelfLocation,
    filterStartDate,
    filterEndDate
  ]);

  const handleResetFilters = () => {
    setFilterDestination('ALL');
    setFilterDriver('ALL');
    setFilterTruckNo('ALL');
    setFilterRider('ALL');
    setFilterHoldReason('ALL');
    setFilterBranchTarget('ALL');
    setFilterShelfLocation('ALL');
    setFilterStartDate('');
    setFilterEndDate('');
    setDateFilter('ALL');
    setOperatorFilter('ALL');
    setSearchQuery('');
  };

  // Filter & Search
  const filteredScans = useMemo(() => {
    let list: WarehouseScanItem[];
    if (activeTab === 'HOLD_REMAINING' && remainingSubTab === 'UNDISPATCHED') {
      list = [...unDispatchedScanInItems];
    } else {
      list = scopedScans.filter((s) => s.scanType === activeTab);
    }

    // 1. Date Filter (Quick buttons or Custom Start/End Range)
    let today = new Date().toISOString().slice(0, 10);
    let yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Phnom_Penh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      today = formatter.format(new Date());
      const yDate = new Date();
      yDate.setDate(yDate.getDate() - 1);
      yesterday = formatter.format(yDate);
    } catch {}
    const thisMonth = today.slice(0, 7);

    if (filterStartDate && filterEndDate) {
      list = list.filter((s) => s.date >= filterStartDate && s.date <= filterEndDate);
    } else if (filterStartDate) {
      list = list.filter((s) => s.date >= filterStartDate);
    } else if (filterEndDate) {
      list = list.filter((s) => s.date <= filterEndDate);
    } else if (dateFilter === 'TODAY') {
      list = list.filter((s) => s.date === today || (!s.date && s.createdAt?.startsWith(today)));
    } else if (dateFilter === 'YESTERDAY') {
      list = list.filter((s) => s.date === yesterday || (!s.date && s.createdAt?.startsWith(yesterday)));
    } else if (dateFilter === 'THIS_MONTH') {
      list = list.filter((s) => (s.date || s.createdAt || '').startsWith(thisMonth));
    }

    // 2. ទីតាំង / ខេត្ត-ក្រុង * (Available on all tabs)
    if (filterDestination !== 'ALL') {
      const destLower = filterDestination.toLowerCase().trim();
      list = list.filter((s) =>
        (s.destination || '').toLowerCase().includes(destLower) ||
        destLower.includes((s.destination || '').toLowerCase())
      );
    }

    // 3. សាខា / ខេត្តគោលដៅ (Available on all tabs)
    if (filterBranchTarget !== 'ALL') {
      const targetLower = filterBranchTarget.toLowerCase().trim();
      list = list.filter((s) =>
        (s.destination || '').toLowerCase().includes(targetLower) ||
        (s.deliveryZone || '').toLowerCase().includes(targetLower)
      );
    }

    // 4. Tab-specific filtering (ScanIn/ScanOut -> Driver, Truck; Out of Delivery -> Rider; Hold -> HoldReason, Shelf)
    if (isTruckScanType(activeTab)) {
      // Driver (អ្នកបើកបរ)
      if (filterDriver !== 'ALL') {
        const driverLower = filterDriver.toLowerCase().trim();
        list = list.filter((s) => (s.driverName || '').toLowerCase() === driverLower);
      }
      // Truck No
      if (filterTruckNo !== 'ALL') {
        const truckLower = filterTruckNo.toLowerCase().trim();
        list = list.filter((s) => (s.truckNo || '').toLowerCase() === truckLower);
      }
    } else if (activeTab === 'OUT_OF_DELIVERY') {
      // Rider (អ្នកដឹក)
      if (filterRider !== 'ALL') {
        const riderLower = filterRider.toLowerCase().trim();
        list = list.filter((s) => (s.riderName || '').toLowerCase() === riderLower);
      }
    } else if (isReasonScanType(activeTab)) {
      // មូលហេតុនៅសល់ / ផ្អាក / បង្វិល *
      if (filterHoldReason !== 'ALL') {
        const reasonLower = filterHoldReason.toLowerCase().trim();
        list = list.filter((s) => (s.holdReason || '').toLowerCase() === reasonLower);
      }
      // ធ្នើរ / Shelf Location (Hold only)
      if (activeTab === 'HOLD_REMAINING' && filterShelfLocation !== 'ALL') {
        const shelfLower = filterShelfLocation.toLowerCase().trim();
        list = list.filter((s) => (s.shelfLocation || '').toLowerCase() === shelfLower);
      }
    }

    // Operator Filter
    if (operatorFilter !== 'ALL') {
      list = list.filter((s) => (s.operatorEmail || s.createdBy || '') === operatorFilter);
    }

    // Operation Code Filter
    if (filterOperationCode !== 'ALL') {
      list = list.filter((s) => getOperationCode(s, scans) === filterOperationCode);
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
          (s.driverName || '').toLowerCase().includes(q) ||
          (s.truckNo || '').toLowerCase().includes(q) ||
          (s.location || '').toLowerCase().includes(q) ||
          (s.riderName || '').toLowerCase().includes(q) ||
          (s.riderPhone || '').toLowerCase().includes(q) ||
          (s.deliveryZone || '').toLowerCase().includes(q) ||
          (s.holdReason || '').toLowerCase().includes(q) ||
          (s.shelfLocation || '').toLowerCase().includes(q) ||
          (s.remarks || '').toLowerCase().includes(q) ||
          (s.shipper || '').toLowerCase().includes(q) ||
          (s.consignee || '').toLowerCase().includes(q) ||
          (s.payment || '').toLowerCase().includes(q) ||
          getOperationCode(s, scans).toLowerCase().includes(q)
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
  }, [
    scopedScans,
    activeTab,
    remainingSubTab,
    unDispatchedScanInItems,
    dateFilter,
    filterStartDate,
    filterEndDate,
    filterDestination,
    filterDriver,
    filterTruckNo,
    filterRider,
    filterHoldReason,
    filterBranchTarget,
    filterShelfLocation,
    filterOperationCode,
    operatorFilter,
    searchQuery,
    sortBy
  ]);

  // Statistics
  const todayStr = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => {
    const todayItems = scopedScans.filter((s) => s.date === todayStr);
    return {
      totalToday: todayItems.length,
      scanInToday: todayItems.filter((s) => s.scanType === 'SCAN_IN').length,
      scanOutToday: todayItems.filter((s) => s.scanType === 'SCAN_OUT').length,
      outOfDeliveryToday: todayItems.filter((s) => s.scanType === 'OUT_OF_DELIVERY').length,
      holdRemainingToday: todayItems.filter((s) => s.scanType === 'HOLD_REMAINING').length,
      holdRemainingTotal: scopedScans.filter((s) => s.scanType === 'HOLD_REMAINING').length,
      arrivedToday: todayItems.filter((s) => s.scanType === 'ARRIVED_HUB').length,
      unDispatchedCount: unDispatchedScanInItems.length,
      totalOverall: scopedScans.length
    };
  }, [scopedScans, todayStr, unDispatchedScanInItems]);

  // Unique operators for filter
  const operators = useMemo(() => {
    const set = new Set<string>();
    scopedScans.forEach((s) => {
      const email = s.operatorEmail || (s.createdBy?.includes('@') ? s.createdBy : '');
      if (email) set.add(email);
    });
    return Array.from(set);
  }, [scopedScans]);

  // Distinct operations in current active tab (for the Operation Filter dropdown)
  const currentTabOperationGroups = useMemo(() => {
    const tabScans = scopedScans.filter((s) => s.scanType === activeTab);
    return groupScansByOperation(tabScans);
  }, [scopedScans, activeTab]);

  // Distinct operations in filtered scans (for the Operation Print selector & Grouped view)
  const filteredOperationGroups = useMemo(() => {
    return groupScansByOperation(filteredScans);
  }, [filteredScans]);

  // Paginated operations when isGroupedByOperation is active
  const totalOperationPages = Math.ceil(filteredOperationGroups.length / pageSize) || 1;
  const paginatedOperations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOperationGroups.slice(start, start + pageSize);
  }, [filteredOperationGroups, currentPage, pageSize]);

  // Total pages based on view mode
  const totalPages = isGroupedByOperation
    ? totalOperationPages
    : (Math.ceil(filteredScans.length / pageSize) || 1);

  const paginatedScans = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredScans.slice(start, start + pageSize);
  }, [filteredScans, currentPage, pageSize]);

  // Current page items for selection (flat vs grouped)
  const currentPageItems = useMemo(() => {
    if (isGroupedByOperation) {
      return paginatedOperations.flatMap((g) => g.items);
    }
    return paginatedScans;
  }, [isGroupedByOperation, paginatedOperations, paginatedScans]);



  // Multi-item selection helpers
  const isAllCurrentPageSelected = currentPageItems.length > 0 && currentPageItems.every((s) => selectedScanIds.has(s.id));
  const isSomeCurrentPageSelected = currentPageItems.some((s) => selectedScanIds.has(s.id));

  const handleToggleSelect = (id: string) => {
    setSelectedScanIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllCurrentPage = () => {
    if (currentPageItems.length === 0) return;
    if (isAllCurrentPageSelected) {
      setSelectedScanIds((prev) => {
        const next = new Set(prev);
        currentPageItems.forEach((s) => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedScanIds((prev) => {
        const next = new Set(prev);
        currentPageItems.forEach((s) => next.add(s.id));
        return next;
      });
    }
  };

  const handleConfirmDeleteGroup = async (group: OperationGroup) => {
    if (!canDelete) {
      notify('អ្នកមិនមានសិទ្ធិលុបទិន្នន័យឡើយ', 'error');
      return;
    }
    if (
      window.confirm(
        `⚠️ តើអ្នកពិតជាចង់លុបប្រតិបត្តិការ «${group.operationCode}» ដែលមានចំនួន ${group.items.length} កញ្ចប់នេះមែនទេ?`
      )
    ) {
      try {
        await deleteWarehouseScanBatch(group.items);
        setScans((prev) => {
          const deleteIds = new Set(group.items.map((it) => it.id));
          return prev.filter((p) => !deleteIds.has(p.id));
        });
        notify(`✓ បានលុបប្រតិបត្តិការ ${group.operationCode} (${group.items.length} កញ្ចប់) រួចរាល់!`, 'success');
      } catch (err: any) {
        notify(`កំហុសពេលលុបប្រតិបត្តិការ៖ ${err?.message || 'បរាជ័យ'}`, 'error');
      }
    }
  };

  const handleSelectAllFiltered = () => {
    if (filteredScans.length === 0) return;
    const allSelected = filteredScans.every((s) => selectedScanIds.has(s.id));
    if (allSelected) {
      setSelectedScanIds(new Set());
    } else {
      setSelectedScanIds(new Set(filteredScans.map((s) => s.id)));
    }
  };

  const handleClearSelection = () => {
    setSelectedScanIds(new Set());
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [
    activeTab,
    remainingSubTab,
    dateFilter,
    filterStartDate,
    filterEndDate,
    filterDestination,
    filterDriver,
    filterTruckNo,
    filterRider,
    filterHoldReason,
    filterBranchTarget,
    operatorFilter,
    searchQuery,
    sortBy,
    pageSize
  ]);

  // Export CSV
  const handleExportCSV = () => {
    if (!filteredScans.length) {
      notify('មិនមានទិន្នន័យសម្រាប់ទាញយកឡើយ', 'info');
      return;
    }
    try {
      let headers: string[];
      if (isTruckScanType(activeTab)) {
        headers = ['#', 'Barcode', 'Tracking', 'Destination', 'Driver Name', 'Truck No', ...(activeTab === 'SCAN_IN' ? ['Transfer By'] : []), 'Date', 'Operator', 'Created At'];
      } else if (activeTab === 'HOLD_REMAINING') {
        headers = ['#', 'Barcode', 'Tracking', 'Destination', 'Hold Reason (មូលហេតុនៅសល់)', 'Shelf Location (ធ្នើរ)', 'Date', 'Operator', 'Created At', 'Remarks'];
      } else if (activeTab === 'RETURN_SHIPMENTS') {
        headers = ['#', 'Barcode', 'Tracking', 'Operation Code', 'Return Reason (មូលហេតុបង្វិល)', 'Date', 'Operator', 'Created At', 'Remarks'];
      } else {
        headers = ['#', 'Barcode', 'Tracking', 'Rider Name', 'Delivery Zone', 'COD Amount', 'Currency', 'Date', 'Operator', 'Created At', 'Remarks'];
      }

      const rows = filteredScans.map((s, idx) => {
        if (isTruckScanType(activeTab)) {
          return [
            idx + 1,
            s.barcode,
            s.tracking || s.barcode,
            s.destination || '',
            s.driverName || '',
            s.truckNo || '',
            ...(activeTab === 'SCAN_IN' ? [s.transferBy || ''] : []),
            s.date,
            s.operatorEmail || s.createdBy || '',
            s.createdAt
          ];
        } else if (activeTab === 'RETURN_SHIPMENTS') {
          return [
            idx + 1,
            s.barcode,
            s.tracking || s.barcode,
            getOperationCode(s, scans),
            s.holdReason || '',
            s.date,
            s.operatorEmail || s.createdBy || '',
            s.createdAt,
            s.remarks || ''
          ];
        } else if (activeTab === 'HOLD_REMAINING') {
          return [
            idx + 1,
            s.barcode,
            s.tracking || s.barcode,
            s.destination || '',
            s.holdReason || '',
            s.shelfLocation || '',
            s.date,
            s.operatorEmail || s.createdBy || '',
            s.createdAt,
            s.remarks || ''
          ];
        } else {
          return [
            idx + 1,
            s.barcode,
            s.tracking || s.barcode,
            s.riderName || '',
            s.deliveryZone || '',
            s.codAmount !== undefined ? s.codAmount : '',
            s.currency || 'USD',
            s.date,
            s.operatorEmail || s.createdBy || '',
            s.createdAt,
            s.remarks || ''
          ];
        }
      });

      const csvContent = formatCsv(headers, rows);
      downloadCsv(`warehouse_${activeTab.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
      notify('✓ បានទាញយក CSV ជោគជ័យ!', 'success');
    } catch (err: any) {
      notify('បរាជ័យក្នុងការទាញយក CSV៖ ' + err?.message, 'error');
    }
  };

  // Export operations to Excel (.xlsx): all filtered operations, or a single operation
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const handleExportExcel = async (groups: OperationGroup[] = filteredOperationGroups, fileLabel?: string) => {
    if (!groups.length) {
      notify('មិនមានទិន្នន័យសម្រាប់ទាញយកឡើយ', 'info');
      return;
    }
    setIsExportingExcel(true);
    try {
      const count = await exportWarehouseOperationsToExcel(groups, {
        fileLabel,
        exportedBy: currentUser?.email || currentUser?.name
      });
      notify(`✓ បានទាញយក Excel ជោគជ័យ! (${groups.length} ប្រតិបត្តិការ, ${count} កញ្ចប់)`, 'success');
    } catch (err: any) {
      notify('បរាជ័យក្នុងការទាញយក Excel៖ ' + (err?.message || err), 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Manifest opens instantly from the cached Data Report. If some barcodes are missing
  // (the browser cache keeps only part of the report), fetch it live in the background,
  // at most once every 5 minutes, and rebuild the manifest when new rows arrive.
  const lastLiveReportFetch = useRef(0);
  const manifestOpenRef = useRef(false);
  manifestOpenRef.current = isManifestModalOpen;
  const refreshReportForManifest = (list: WarehouseScanItem[], rebuild: () => void) => {
    const missingCodes = list
      .map((s) => s.barcode || s.tracking || '')
      .filter((code) => code && !lookupTrackingFromDataReport(code));
    if (missingCodes.length === 0) return;
    if (Date.now() - lastLiveReportFetch.current < 5 * 60 * 1000) return;
    lastLiveReportFetch.current = Date.now();
    const config = getInitialDataReportConfig();
    if (!config.sheetUrl) return;
    fetchLiveDataReport(config.sheetUrl, config.sheetName)
      .then(() => {
        // Only refresh a manifest that is still open; never reopen one the user closed.
        if (manifestOpenRef.current && missingCodes.some((code) => lookupTrackingFromDataReport(code))) rebuild();
      })
      .catch((err) => console.warn('Could not refresh Data Report for manifest:', err));
  };

  // 3. Print filtered items as an official Batch Manifest (filtered by Rider/Driver and Date)
  const handlePrintFilteredManifest = () => {
    if (filteredScans.length === 0) {
      notify('មិនមានទិន្នន័យដើម្បីបោះពុម្ពឡើយ', 'error');
      return;
    }
    refreshReportForManifest(filteredScans, handlePrintFilteredManifest);

    const items: ManifestItem[] = filteredScans.map((s) => {
      const report = lookupTrackingFromDataReport(s.barcode || s.tracking || '');
      return {
        id: s.id || `item-${s.barcode}-${Date.now()}`,
        barcode: s.barcode || s.tracking || '',
        shipper: s.shipper || report?.shipper,
        consignee: s.consignee || s.customerName || report?.consignee || report?.customerName,
        destination: destOf(s),
        payment: s.payment || report?.payment,
        customerName: s.consignee || s.customerName || report?.consignee || report?.customerName,
        customerPhone: s.customerPhone || report?.customerPhone,
        codAmount: s.codAmount !== undefined ? s.codAmount : report?.codAmount,
        currency: s.currency || report?.currency || 'USD',
        shelfLocation: activeTab === 'HOLD_REMAINING' ? (s.shelfLocation || report?.shelfLocation) : undefined,
        holdReason: isReasonScanType(activeTab) ? (s.holdReason || report?.holdReason) : undefined,
        remarks: s.remarks,
        driverName: isTruckScanType(activeTab) ? s.driverName : undefined,
        truckNo: isTruckScanType(activeTab) ? s.truckNo : undefined,
        origin: s.origin,
        sourceOperationCode: s.sourceOperationCode,
        arrivalStatus: s.arrivalStatus,
        riderName: activeTab === 'OUT_OF_DELIVERY' ? s.riderName : undefined,
        deliveryZone: activeTab === 'OUT_OF_DELIVERY' ? s.deliveryZone : undefined,
        scannedAt: s.createdAt ? new Date(s.createdAt).toLocaleTimeString('km-KH') : undefined
      };
    });

    // 1. Detect rider (Only for OUT_OF_DELIVERY)
    const detectedRider = activeTab === 'OUT_OF_DELIVERY'
      ? (filterRider !== 'ALL'
        ? filterRider
        : (filteredScans.length > 0 && filteredScans.every((s) => s.riderName && s.riderName === filteredScans[0]?.riderName))
        ? filteredScans[0]?.riderName
        : undefined)
      : undefined;

    // 2. Detect deliveryZone (Only for OUT_OF_DELIVERY)
    const detectedZone = activeTab === 'OUT_OF_DELIVERY'
      ? (filterBranchTarget !== 'ALL'
        ? filterBranchTarget
        : (filteredScans.length > 0 && filteredScans.every((s) => s.deliveryZone && s.deliveryZone === filteredScans[0]?.deliveryZone))
        ? filteredScans[0]?.deliveryZone
        : undefined)
      : undefined;

    // 3. Detect driver (Only for SCAN_IN or SCAN_OUT)
    const detectedDriver = isTruckScanType(activeTab)
      ? (filterDriver !== 'ALL'
        ? filterDriver
        : (filteredScans.length > 0 && filteredScans.every((s) => s.driverName && s.driverName === filteredScans[0]?.driverName))
        ? filteredScans[0]?.driverName
        : undefined)
      : undefined;

    // 4. Detect truck (Only for SCAN_IN or SCAN_OUT)
    const detectedTruck = isTruckScanType(activeTab)
      ? (filterTruckNo !== 'ALL'
        ? filterTruckNo
        : (filteredScans.length > 0 && filteredScans.every((s) => s.truckNo && s.truckNo === filteredScans[0]?.truckNo))
        ? filteredScans[0]?.truckNo
        : undefined)
      : undefined;

    // 4.5 Detect transferBy (Only for SCAN_IN)
    const detectedTransferBy = activeTab === 'SCAN_IN'
      ? (filteredScans.length > 0 && filteredScans.every((s) => s.transferBy && s.transferBy === filteredScans[0]?.transferBy))
        ? filteredScans[0]?.transferBy
        : undefined
      : undefined;

    // 5. Detect holdReason (Hold / Return)
    const detectedHoldReason = isReasonScanType(activeTab)
      ? (filterHoldReason !== 'ALL'
        ? filterHoldReason
        : (filteredScans.length > 0 && filteredScans.every((s) => s.holdReason && s.holdReason === filteredScans[0]?.holdReason))
        ? filteredScans[0]?.holdReason
        : undefined)
      : undefined;

    // 6. Detect shelfLocation (Only for HOLD_REMAINING)
    const detectedShelf = activeTab === 'HOLD_REMAINING'
      ? (filterShelfLocation !== 'ALL'
        ? filterShelfLocation
        : (filteredScans.length > 0 && filteredScans.every((s) => s.shelfLocation && s.shelfLocation === filteredScans[0]?.shelfLocation))
        ? filteredScans[0]?.shelfLocation
        : undefined)
      : undefined;

    // 7. Detect destination (Only if specifically filtered or all match)
    const detectedDest = filterDestination !== 'ALL'
      ? filterDestination
      : (filteredScans.length > 0 && filteredScans.every((s) => s.destination && s.destination === filteredScans[0]?.destination))
      ? filteredScans[0]?.destination
      : undefined;

    // 8. Detect date
    let today = new Date().toISOString().slice(0, 10);
    let yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Phnom_Penh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      today = formatter.format(new Date());
      const yDate = new Date();
      yDate.setDate(yDate.getDate() - 1);
      yesterday = formatter.format(yDate);
    } catch {}
    const thisMonth = today.slice(0, 7);

    const detectedDate = (filterStartDate && filterEndDate && filterStartDate === filterEndDate)
      ? filterStartDate
      : (filterStartDate && filterEndDate)
      ? `${filterStartDate} ➔ ${filterEndDate}`
      : filterStartDate
      ? `ចាប់ពី ${filterStartDate}`
      : filterEndDate
      ? `ដល់ត្រឹម ${filterEndDate}`
      : dateFilter === 'TODAY'
      ? today
      : dateFilter === 'YESTERDAY'
      ? yesterday
      : dateFilter === 'THIS_MONTH'
      ? `ខែ ${thisMonth}`
      : (filteredScans.length > 0 && filteredScans.every((s) => s.date === filteredScans[0]?.date))
      ? filteredScans[0]?.date
      : today;

    // 9. Detect operation code
    const firstOp = filteredScans[0] ? getOperationCode(filteredScans[0], scans) : undefined;
    const detectedOpCode = (filteredScans.length > 0 && filteredScans.every((s) => getOperationCode(s, scans) === firstOp))
      ? firstOp
      : undefined;

    setManifestData({
      items,
      scanType: activeTab,
      date: detectedDate || scanDate,
      destination: detectedDest,
      driverName: detectedDriver,
      truckNo: detectedTruck,
      transferBy: detectedTransferBy,
      riderName: detectedRider,
      deliveryZone: detectedZone,
      holdReason: detectedHoldReason,
      shelfLocation: detectedShelf,
      operatorName: currentUser?.name || currentUser?.email || 'User',
      operationCode: detectedOpCode
    });

    setIsManifestModalOpen(true);
  };

  // Print a specific operation group
  const handlePrintOperation = (group: OperationGroup) => {
    refreshReportForManifest(group.items, () => handlePrintOperation(group));
    const items: ManifestItem[] = group.items.map((s) => {
      const report = lookupTrackingFromDataReport(s.barcode || s.tracking || '');
      return {
        id: s.id || `item-${s.barcode}-${Date.now()}`,
        barcode: s.barcode || s.tracking || '',
        shipper: s.shipper || report?.shipper,
        consignee: s.consignee || s.customerName || report?.consignee || report?.customerName,
        destination: isReasonScanType(s.scanType) ? undefined : destOf(s),
        payment: s.payment || report?.payment,
        customerName: s.consignee || s.customerName || report?.consignee || report?.customerName,
        customerPhone: s.customerPhone || report?.customerPhone,
        codAmount: s.codAmount !== undefined ? s.codAmount : report?.codAmount,
        currency: s.currency || report?.currency || 'USD',
        shelfLocation: s.scanType === 'HOLD_REMAINING' ? (s.shelfLocation || report?.shelfLocation) : undefined,
        holdReason: isReasonScanType(s.scanType) ? (s.holdReason || report?.holdReason) : undefined,
        remarks: s.remarks,
        driverName: isTruckScanType(s.scanType) ? s.driverName : undefined,
        truckNo: isTruckScanType(s.scanType) ? s.truckNo : undefined,
        origin: s.origin,
        sourceOperationCode: s.sourceOperationCode,
        arrivalStatus: s.arrivalStatus,
        riderName: s.scanType === 'OUT_OF_DELIVERY' ? s.riderName : undefined,
        deliveryZone: s.scanType === 'OUT_OF_DELIVERY' ? s.deliveryZone : undefined,
        scannedAt: s.createdAt ? new Date(s.createdAt).toLocaleTimeString('km-KH') : undefined
      };
    });

      setManifestData({
      items,
      scanType: group.scanType,
      date: group.date || scanDate,
      destination: isReasonScanType(group.scanType) ? undefined : group.destination,
      driverName: group.driverName,
      truckNo: group.truckNo,
      transferBy: group.transferBy,
      riderName: group.riderName,
      deliveryZone: group.deliveryZone,
      holdReason: group.holdReason,
      shelfLocation: group.shelfLocation,
      operatorName: group.operatorName || currentUser?.name || currentUser?.email || 'User',
      operationCode: group.operationCode
    });

    setIsOpPrintModalOpen(false);
    setIsManifestModalOpen(true);
  };

  // Helper to print an operation group by code
  const handlePrintOperationByCode = (opCode: string) => {
    const group = currentTabOperationGroups.find((g) => g.operationCode === opCode);
    if (group) {
      handlePrintOperation(group);
    } else {
      // Fallback: filter scans with that opCode
      const matchingScans = scans.filter((s) => s.scanType === activeTab && getOperationCode(s, scans) === opCode);
      if (matchingScans.length > 0) {
        const dummyGroup = groupScansByOperation(matchingScans)[0];
        if (dummyGroup) handlePrintOperation(dummyGroup);
      }
    }
  };

  // Toolbar print dispatcher: if multiple operations are in view, open selector modal; otherwise print directly
  const handleToolbarPrint = () => {
    if (filteredScans.length === 0) return;
    if (filteredOperationGroups.length > 1) {
      setIsOpPrintModalOpen(true);
    } else if (filteredOperationGroups.length === 1) {
      handlePrintOperation(filteredOperationGroups[0]);
    } else {
      handlePrintFilteredManifest();
    }
  };

  // Print single item manifest from table row
  const handlePrintSingleItem = (s: WarehouseScanItem) => {
    refreshReportForManifest([s], () => handlePrintSingleItem(s));
    const report = lookupTrackingFromDataReport(s.barcode || s.tracking || '');
    const item: ManifestItem = {
      id: s.id || `item-${s.barcode}-${Date.now()}`,
      barcode: s.barcode || s.tracking || '',
      shipper: s.shipper || report?.shipper,
      consignee: s.consignee || s.customerName || report?.consignee || report?.customerName,
      destination: destOf(s),
      payment: s.payment || report?.payment,
      customerName: s.consignee || s.customerName || report?.consignee || report?.customerName,
      customerPhone: s.customerPhone || report?.customerPhone,
      codAmount: s.codAmount !== undefined ? s.codAmount : report?.codAmount,
      currency: s.currency || report?.currency || 'USD',
      shelfLocation: s.scanType === 'HOLD_REMAINING' ? (s.shelfLocation || report?.shelfLocation) : undefined,
      holdReason: isReasonScanType(s.scanType) ? (s.holdReason || report?.holdReason) : undefined,
      remarks: s.remarks,
      driverName: isTruckScanType(s.scanType) ? s.driverName : undefined,
      truckNo: isTruckScanType(s.scanType) ? s.truckNo : undefined,
      origin: s.origin,
      sourceOperationCode: s.sourceOperationCode,
      arrivalStatus: s.arrivalStatus,
      riderName: s.scanType === 'OUT_OF_DELIVERY' ? s.riderName : undefined,
      deliveryZone: s.scanType === 'OUT_OF_DELIVERY' ? s.deliveryZone : undefined,
      scannedAt: s.createdAt ? new Date(s.createdAt).toLocaleTimeString('km-KH') : undefined
    };

    setManifestData({
      items: [item],
      scanType: s.scanType,
      date: s.date || scanDate,
      destination: s.destination || report?.destination,
      driverName: isTruckScanType(s.scanType) ? s.driverName : undefined,
      truckNo: isTruckScanType(s.scanType) ? s.truckNo : undefined,
      origin: s.origin,
      sourceOperationCode: s.sourceOperationCode,
      arrivalStatus: s.arrivalStatus,
      transferBy: s.scanType === 'SCAN_IN' ? s.transferBy : undefined,
      riderName: s.scanType === 'OUT_OF_DELIVERY' ? s.riderName : undefined,
      deliveryZone: s.scanType === 'OUT_OF_DELIVERY' ? s.deliveryZone : undefined,
      holdReason: isReasonScanType(s.scanType) ? s.holdReason : undefined,
      shelfLocation: s.scanType === 'HOLD_REMAINING' ? s.shelfLocation : undefined,
      operatorName: s.operatorEmail || currentUser?.name || currentUser?.email || 'User',
      operationCode: getOperationCode(s, scans)
    });

    setIsManifestModalOpen(true);
  };

  // Print selected items manifest
  const handlePrintSelectedManifest = () => {
    const selectedItems = scans.filter((s) => selectedScanIds.has(s.id));
    if (selectedItems.length === 0) {
      handleToolbarPrint();
      return;
    }
    refreshReportForManifest(selectedItems, handlePrintSelectedManifest);

    const items: ManifestItem[] = selectedItems.map((s) => {
      const report = lookupTrackingFromDataReport(s.barcode || s.tracking || '');
      return {
        id: s.id || `item-${s.barcode}-${Date.now()}`,
        barcode: s.barcode || s.tracking || '',
        shipper: s.shipper || report?.shipper,
        consignee: s.consignee || s.customerName || report?.consignee || report?.customerName,
        destination: destOf(s),
        payment: s.payment || report?.payment,
        customerName: s.consignee || s.customerName || report?.consignee || report?.customerName,
        customerPhone: s.customerPhone || report?.customerPhone,
        codAmount: s.codAmount !== undefined ? s.codAmount : report?.codAmount,
        currency: s.currency || report?.currency || 'USD',
        shelfLocation: s.scanType === 'HOLD_REMAINING' ? (s.shelfLocation || report?.shelfLocation) : undefined,
        holdReason: isReasonScanType(s.scanType) ? (s.holdReason || report?.holdReason) : undefined,
        remarks: s.remarks,
        driverName: isTruckScanType(s.scanType) ? s.driverName : undefined,
        truckNo: isTruckScanType(s.scanType) ? s.truckNo : undefined,
        origin: s.origin,
        sourceOperationCode: s.sourceOperationCode,
        arrivalStatus: s.arrivalStatus,
        riderName: s.scanType === 'OUT_OF_DELIVERY' ? s.riderName : undefined,
        deliveryZone: s.scanType === 'OUT_OF_DELIVERY' ? s.deliveryZone : undefined,
        scannedAt: s.createdAt ? new Date(s.createdAt).toLocaleTimeString('km-KH') : undefined
      };
    });

    const detectedDriver = isTruckScanType(activeTab)
      ? (selectedItems.every((s) => s.driverName && s.driverName === selectedItems[0]?.driverName) ? selectedItems[0]?.driverName : undefined)
      : undefined;

    const detectedTruck = isTruckScanType(activeTab)
      ? (selectedItems.every((s) => s.truckNo && s.truckNo === selectedItems[0]?.truckNo) ? selectedItems[0]?.truckNo : undefined)
      : undefined;

    const detectedTransferBy = activeTab === 'SCAN_IN'
      ? (selectedItems.every((s) => s.transferBy && s.transferBy === selectedItems[0]?.transferBy) ? selectedItems[0]?.transferBy : undefined)
      : undefined;

    const detectedRider = activeTab === 'OUT_OF_DELIVERY'
      ? (selectedItems.every((s) => s.riderName && s.riderName === selectedItems[0]?.riderName) ? selectedItems[0]?.riderName : undefined)
      : undefined;

    const detectedZone = activeTab === 'OUT_OF_DELIVERY'
      ? (selectedItems.every((s) => s.deliveryZone && s.deliveryZone === selectedItems[0]?.deliveryZone) ? selectedItems[0]?.deliveryZone : undefined)
      : undefined;

    const detectedHoldReason = isReasonScanType(activeTab)
      ? (selectedItems.every((s) => s.holdReason && s.holdReason === selectedItems[0]?.holdReason) ? selectedItems[0]?.holdReason : undefined)
      : undefined;

    const detectedShelf = activeTab === 'HOLD_REMAINING'
      ? (selectedItems.every((s) => s.shelfLocation && s.shelfLocation === selectedItems[0]?.shelfLocation) ? selectedItems[0]?.shelfLocation : undefined)
      : undefined;

    const detectedDest = selectedItems.every((s) => s.destination && s.destination === selectedItems[0]?.destination)
      ? selectedItems[0]?.destination
      : undefined;

    const today = new Date().toISOString().slice(0, 10);
    const detectedDate = selectedItems.every((s) => s.date && s.date === selectedItems[0]?.date)
      ? selectedItems[0]?.date
      : today;

    const firstOp = selectedItems[0] ? getOperationCode(selectedItems[0], scans) : undefined;
    const detectedOpCode = (selectedItems.length > 0 && selectedItems.every((s) => getOperationCode(s, scans) === firstOp))
      ? firstOp
      : undefined;

    setManifestData({
      items,
      scanType: activeTab,
      date: detectedDate || scanDate,
      destination: detectedDest,
      driverName: detectedDriver,
      truckNo: detectedTruck,
      transferBy: detectedTransferBy,
      riderName: detectedRider,
      deliveryZone: detectedZone,
      holdReason: detectedHoldReason,
      shelfLocation: detectedShelf,
      operatorName: currentUser?.name || currentUser?.email || 'User',
      operationCode: detectedOpCode
    });

    setIsManifestModalOpen(true);
  };

  // Batch delete selected items (Instant Optimistic UI)
  const handleConfirmBatchDelete = async () => {
    if (selectedScanIds.size === 0) return;
    const idsToDelete = new Set(selectedScanIds);
    const count = idsToDelete.size;
    const itemsToDelete = scans.filter((s) => idsToDelete.has(s.id));

    // 1. Instant optimistic UI feedback (0ms latency)
    setShowBatchDeleteConfirm(false);
    setSelectedScanIds(new Set());
    setScans((prev) => prev.filter((s) => !idsToDelete.has(s.id)));
    notify(`✓ បានលុបកំណត់ត្រាស្កេនដែលបានជ្រើសចំនួន ${count} ជោគជ័យ!`, 'success');

    // 2. Background persistent deletion
    try {
      await deleteWarehouseScanBatch(itemsToDelete);
    } catch (err: any) {
      console.warn('Background batch delete error:', err);
      notify(err?.message || 'បរាជ័យក្នុងការលុបពី Hostinger MariaDB Master!', 'error');
    }
  };

  // Clear all warehouse scans permanently (Instant Optimistic UI)
  const handleConfirmClearAll = async () => {
    // 1. Instant optimistic UI feedback (0ms latency)
    setShowClearAllConfirm(false);
    setSelectedScanIds(new Set());
    setScans([]);
    notify('✓ បានសម្អាតទិន្នន័យប្រតិបត្តិការឃ្លាំងទាំងអស់ជោគជ័យ (LocalStorage)!', 'success');

    // 2. Background persistent wipe
    try {
      await clearAllWarehouseScans();
    } catch (err: any) {
      console.warn('Background clear all error:', err);
      notify(err?.message || 'បរាជ័យក្នុងការសម្អាតទិន្នន័យពី Hostinger MariaDB Master!', 'error');
    }
  };


  return (
    <div className="page-fill w-full max-w-full overflow-x-hidden min-w-0 min-h-full space-y-3.5 sm:space-y-4 pb-24 lg:pb-0">
      {/* ========================================================================= */}
      {/* 🌟 1. UNIFIED COMMAND HEADER (Compact, Responsive & Space-Saving) */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#0c1424] border border-slate-200/90 dark:border-slate-800/80 rounded-2xl p-2 sm:p-2.5 shadow-xs space-y-1.5 w-full max-w-full min-w-0 overflow-hidden">
        {/* Row 1: Title, Scans Count, Status Pill & Quick Form Toggle */}
        <div className="hidden sm:flex items-center justify-between gap-1.5 w-full min-w-0">
          {/* Left: Branding & Status */}
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-600 via-teal-600 to-blue-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
              <Boxes className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight truncate">
              គ្រប់គ្រងឃ្លាំង<span className="hidden sm:inline"> (Warehouse Hub)</span>
            </h1>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9.5px] font-bold bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-200/80 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {scans.length}
            </span>

            {/* Hostinger Database Live Status Pill */}
            <div
              className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9.5px] font-bold border shrink-0 transition ${
                realtimeStatus === 'CONNECTED'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                  : realtimeStatus === 'CONNECTING'
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 animate-pulse'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
              }`}
              title="ទិន្នន័យចម្បង Hostinger Database (Sync Live ផ្ទាល់ពី Hostinger MariaDB Master តែមួយគត់)"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  realtimeStatus === 'CONNECTED'
                    ? 'bg-emerald-500 animate-pulse'
                    : realtimeStatus === 'CONNECTING'
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-rose-500'
                }`}
              />
              <span>
                {realtimeStatus === 'CONNECTED'
                  ? <>
                      <span className="sm:hidden">Live</span>
                      <span className="hidden sm:inline">Hostinger Live</span>
                    </>
                  : realtimeStatus === 'CONNECTING'
                  ? 'Connecting...'
                  : 'Disconnected'}
              </span>
            </div>
          </div>

          {/* Right: Quick actions (Sync, Sound, Form toggle). Print/Excel live in the list toolbar below. */}
          <div className="flex items-center gap-1.5 shrink-0">
          {/* Instant Master Live Sync Button */}
          {onRefreshMasterData && (
            <button
              id="btn-sync-master-warehouse"
              type="button"
              disabled={isRefreshingMaster}
              onClick={async () => {
                setIsRefreshingMaster(true);
                try {
                  await onRefreshMasterData(false);
                } finally {
                  setTimeout(() => setIsRefreshingMaster(false), 600);
                }
              }}
              className="h-7 px-2 rounded-lg border border-emerald-200/80 dark:border-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-semibold text-xs transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer shrink-0 disabled:opacity-50 whitespace-nowrap"
              title="ទាញទិន្នន័យឃ្លាំងពី Master Database ភ្លាមៗ (Instant Live Sync)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingMaster ? 'animate-spin text-emerald-600' : ''}`} />
              <span className="hidden md:inline text-[11px] font-bold">{isRefreshingMaster ? 'Syncing...' : 'Sync Live'}</span>
            </button>
          )}

          {/* UI Controls Group (Sound Settings Popover, Fullscreen) */}
          <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700/80 shadow-2xs shrink-0">
            {/* Sound settings Popover (Volume, Tones, Test) */}
            <ScannerSoundSettingsPopover size="sm" />
          </div>

          {/* Form Collapse/Expand Toggle */}
          <button
            type="button"
            onClick={() => setIsFormOpen((prev) => !prev)}
            className={`h-7 px-2 rounded-lg text-[11px] font-semibold flex items-center gap-0.5 transition cursor-pointer shrink-0 border shadow-2xs whitespace-nowrap ${
              isFormOpen
                ? 'bg-cyan-50 dark:bg-slate-700 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
            title={isFormOpen ? 'បង្រួម Form ស្កេនដើម្បីចំនេញទំហំ' : 'បើក Form ស្កេន'}
          >
            {isFormOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            <span>{isFormOpen ? 'លាក់ Form' : 'បើក Form'}</span>
          </button>
          </div>
        </div>

        {/* Row 2: Operations Tabs & Station Mode - In a single horizontal scrollable row! */}
        <div className="grid grid-cols-3 sm:flex sm:items-center gap-1.5 sm:overflow-x-auto no-scrollbar w-full max-w-full min-w-0 pb-0.5 text-xs">
          {/* Tab 1: ScanIn */}
          {canAccessScanIn && (
            <button
              type="button"
              onClick={() => {
                if (activeTab !== 'SCAN_IN') setActiveTab('SCAN_IN');
              }}
              className={`h-9 sm:h-7 px-1.5 sm:px-2.5 py-1.5 sm:py-0 rounded-xl sm:rounded-lg text-xs font-bold flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 transition whitespace-nowrap cursor-pointer shrink-0 min-w-0 ${
                activeTab === 'SCAN_IN'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25 ring-1 ring-emerald-500/30'
                  : 'bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80'
              } ${stationLock !== 'ALL' && stationLock !== 'SCAN_IN' ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {stationLock !== 'ALL' && stationLock !== 'SCAN_IN' ? (
                <Lock className="w-3 h-3 text-slate-400 shrink-0" />
              ) : (
                <ArrowDownToLine className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate"><span className="hidden 2xl:inline">📥 </span><span className="xl:hidden">ScanIn</span><span className="hidden xl:inline">ScanIn (ចូលឃ្លាំង)</span></span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'SCAN_IN'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {scopedScans.filter((s) => s.scanType === 'SCAN_IN').length}
              </span>
            </button>
          )}

          {/* Tab 2: ScanOut */}
          {canAccessScanOut && (
            <button
              type="button"
              onClick={() => {
                if (activeTab !== 'SCAN_OUT') setActiveTab('SCAN_OUT');
              }}
              className={`h-9 sm:h-7 px-1.5 sm:px-2.5 py-1.5 sm:py-0 rounded-xl sm:rounded-lg text-xs font-bold flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 transition whitespace-nowrap cursor-pointer shrink-0 min-w-0 ${
                activeTab === 'SCAN_OUT'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-amber-500/25 ring-1 ring-amber-500/30'
                  : 'bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80'
              } ${stationLock !== 'ALL' && stationLock !== 'SCAN_OUT' ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {stationLock !== 'ALL' && stationLock !== 'SCAN_OUT' ? (
                <Lock className="w-3 h-3 text-slate-400 shrink-0" />
              ) : (
                <ArrowUpFromLine className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate"><span className="hidden 2xl:inline">📤 </span><span className="xl:hidden">ScanOut</span><span className="hidden xl:inline">ScanOut (ចេញពីឃ្លាំង)</span></span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'SCAN_OUT'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300'
                }`}
              >
                {scopedScans.filter((s) => s.scanType === 'SCAN_OUT').length}
              </span>
            </button>
          )}

          {/* Tab 3: Out of Delivery */}
          {canAccessOutOfDelivery && (
            <button
              type="button"
              onClick={() => {
                if (activeTab !== 'OUT_OF_DELIVERY') setActiveTab('OUT_OF_DELIVERY');
              }}
              className={`h-9 sm:h-7 px-1.5 sm:px-2.5 py-1.5 sm:py-0 rounded-xl sm:rounded-lg text-xs font-bold flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 transition whitespace-nowrap cursor-pointer shrink-0 min-w-0 ${
                activeTab === 'OUT_OF_DELIVERY'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-500/30'
                  : 'bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80'
              } ${stationLock !== 'ALL' && stationLock !== 'OUT_OF_DELIVERY' ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {stationLock !== 'ALL' && stationLock !== 'OUT_OF_DELIVERY' ? (
                <Lock className="w-3 h-3 text-slate-400 shrink-0" />
              ) : (
                <Truck className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate"><span className="hidden 2xl:inline">🚚 </span><span className="xl:hidden">Rider</span><span className="hidden xl:inline">Out of Delivery (Rider)</span></span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'OUT_OF_DELIVERY'
                    ? 'bg-white/20 text-white'
                    : 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300'
                }`}
              >
                {scopedScans.filter((s) => s.scanType === 'OUT_OF_DELIVERY').length}
              </span>
            </button>
          )}

          {/* Tab 4: Hold / Remaining in Warehouse */}
          {canAccessHold && (
            <button
              type="button"
              onClick={() => {
                if (activeTab !== 'HOLD_REMAINING') setActiveTab('HOLD_REMAINING');
              }}
              className={`h-9 sm:h-7 px-1.5 sm:px-2.5 py-1.5 sm:py-0 rounded-xl sm:rounded-lg text-xs font-bold flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 transition whitespace-nowrap cursor-pointer shrink-0 min-w-0 ${
                activeTab === 'HOLD_REMAINING'
                  ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 text-white shadow-md shadow-purple-500/25 ring-1 ring-purple-500/30'
                  : 'bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80'
              } ${stationLock !== 'ALL' && stationLock !== 'HOLD_REMAINING' ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {stationLock !== 'ALL' && stationLock !== 'HOLD_REMAINING' ? (
                <Lock className="w-3 h-3 text-slate-400 shrink-0" />
              ) : (
                <PackageCheck className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate"><span className="hidden 2xl:inline">📦 </span><span className="xl:hidden">Hold</span><span className="hidden xl:inline">នៅសល់ក្នុងឃ្លាំង (Hold)</span></span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'HOLD_REMAINING'
                    ? 'bg-white/20 text-white'
                    : 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300'
                }`}
              >
                {scopedScans.filter((s) => s.scanType === 'HOLD_REMAINING').length}
              </span>
            </button>
          )}

          {/* Tab 5: Arrived Hub — receive & verify a ScanOut operation at another hub */}
          {canAccessArrived && (
            <button
              type="button"
              onClick={() => {
                if (activeTab !== 'ARRIVED_HUB') setActiveTab('ARRIVED_HUB');
              }}
              className={`h-9 sm:h-7 px-1.5 sm:px-2.5 py-1.5 sm:py-0 rounded-xl sm:rounded-lg text-xs font-bold flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 transition whitespace-nowrap cursor-pointer shrink-0 min-w-0 ${
                activeTab === 'ARRIVED_HUB'
                  ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-md shadow-teal-500/25 ring-1 ring-teal-500/30'
                  : 'bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80'
              } ${stationLock !== 'ALL' && stationLock !== 'ARRIVED_HUB' ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {stationLock !== 'ALL' && stationLock !== 'ARRIVED_HUB' ? (
                <Lock className="w-3 h-3 text-slate-400 shrink-0" />
              ) : (
                <PackageOpen className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate"><span className="hidden 2xl:inline">🏢 </span><span className="xl:hidden">Arrived</span><span className="hidden xl:inline">Arrived Hub (ទទួលចូលឃ្លាំង)</span></span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'ARRIVED_HUB'
                    ? 'bg-white/20 text-white'
                    : 'bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300'
                }`}
              >
                {scopedScans.filter((s) => s.scanType === 'ARRIVED_HUB').length}
              </span>
            </button>
          )}

          {/* Tab 6: Return — parcels sent back to the shipper */}
          {canAccessReturn && (
            <button
              type="button"
              onClick={() => {
                if (activeTab !== 'RETURN_SHIPMENTS') setActiveTab('RETURN_SHIPMENTS');
              }}
              className={`h-9 sm:h-7 px-1.5 sm:px-2.5 py-1.5 sm:py-0 rounded-xl sm:rounded-lg text-xs font-bold flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 transition whitespace-nowrap cursor-pointer shrink-0 min-w-0 ${
                activeTab === 'RETURN_SHIPMENTS'
                  ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-md shadow-rose-500/25 ring-1 ring-rose-500/30'
                  : 'bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80'
              } ${stationLock !== 'ALL' && stationLock !== 'RETURN_SHIPMENTS' ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {stationLock !== 'ALL' && stationLock !== 'RETURN_SHIPMENTS' ? (
                <Lock className="w-3 h-3 text-slate-400 shrink-0" />
              ) : (
                <Undo2 className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate"><span className="hidden 2xl:inline">↩️ </span><span className="xl:hidden">Return</span><span className="hidden xl:inline">បង្វិលត្រឡប់ (Return)</span></span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'RETURN_SHIPMENTS'
                    ? 'bg-white/20 text-white'
                    : 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300'
                }`}
              >
                {scopedScans.filter((s) => s.scanType === 'RETURN_SHIPMENTS').length}
              </span>
            </button>
          )}

          {/* 🏭 Station Mode Selector Button (Lock this device to a station) */}
          <button
            type="button"
            onClick={() => setIsStationModalOpen(true)}
            className={`h-9 sm:h-7 px-1.5 sm:px-2.5 rounded-xl sm:rounded-lg text-xs font-bold flex items-center justify-center gap-1 sm:gap-1.5 transition whitespace-nowrap cursor-pointer border shadow-2xs shrink-0 min-w-0 ${
            stationLock !== 'ALL'
                ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-500/25 ring-1 ring-amber-400'
                : 'bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
            title="កំណត់ Station Mode សម្រាប់ម៉ាស៊ីននេះ (ចាក់សោ Tab កុំឱ្យច្រឡំ)"
          >
            {stationLock !== 'ALL' ? (
              <>
                <Lock className="w-3 h-3 text-white shrink-0 animate-pulse" />
                <span>🔒 {STATION_INFO[stationLock].short}</span>
                <span className="text-[9.5px] px-1 py-0.2 rounded-full bg-black/20 text-white font-mono uppercase">ជាប់សោ</span>
              </>
            ) : (
              <>
                <Unlock className="w-3 h-3 text-slate-400 shrink-0" />
                <span>សេរី (All)</span>
              </>
            )}
          </button>
        </div>
        {/* Row 3: Today's metrics (folded into the header card to save vertical space) */}
        <div className="hidden sm:flex items-center justify-between gap-2 w-full max-w-full min-w-0 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 text-xs">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 sm:gap-2 min-w-0 text-[11px]">
          {/* Total Today */}
          <div className="w-full sm:w-auto flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
            <span className="w-5 h-5 rounded-md bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 flex items-center justify-center shrink-0">
              <ClipboardList className="w-3 h-3" />
            </span>
            <span>សរុបថ្ងៃនេះ:</span>
            <span className="font-mono font-black text-cyan-600 dark:text-cyan-400">
              {stats.totalToday}
            </span>
          </div>

          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">•</span>

          {/* Interactive pills */}
          <button
            type="button"
            onClick={() => setActiveTab('SCAN_IN')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg font-semibold transition cursor-pointer ${
              activeTab === 'SCAN_IN'
                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600'
            }`}
          >
            <span>📥 ScanIn:</span>
            <span className="font-mono font-bold">{stats.scanInToday}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('SCAN_OUT')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg font-semibold transition cursor-pointer ${
              activeTab === 'SCAN_OUT'
                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-amber-600'
            }`}
          >
            <span>📤 ScanOut:</span>
            <span className="font-mono font-bold">{stats.scanOutToday}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('OUT_OF_DELIVERY')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg font-semibold transition cursor-pointer ${
              activeTab === 'OUT_OF_DELIVERY'
                ? 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-200 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-blue-600'
            }`}
          >
            <span>🚚 Rider:</span>
            <span className="font-mono font-bold">{stats.outOfDeliveryToday}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('HOLD_REMAINING')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg font-semibold transition cursor-pointer ${
              activeTab === 'HOLD_REMAINING'
                ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-200 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-purple-600'
            }`}
          >
            <span>📦 នៅសល់:</span>
            <span className="font-mono font-bold">{stats.holdRemainingTotal}</span>
            {stats.unDispatchedCount > 0 && (
              <span className="text-[10px] text-rose-500 font-bold ml-0.5">
                ({stats.unDispatchedCount} មិនទាន់ចេញ)
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ARRIVED_HUB')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg font-semibold transition cursor-pointer ${
              activeTab === 'ARRIVED_HUB'
                ? 'bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-200 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-teal-600'
            }`}
          >
            <span>🏢 Arrived:</span>
            <span className="font-mono font-bold">{stats.arrivedToday}</span>
          </button>
        </div>

        {/* Right side overall total */}
        <div className="hidden md:flex items-center gap-1.5 text-[10.5px] text-slate-500 shrink-0 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>ទូទាំងប្រព័ន្ធ: <strong className="font-mono text-slate-700 dark:text-slate-300 font-bold">{stats.totalOverall}</strong></span>
        </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ⚡ 3. ERGONOMIC SCANNING FORM (1-Row High-Efficiency Space-Saving Design) */}
      {/* ========================================================================= */}
      {isFormOpen ? (
        <div
          className={`bg-white dark:bg-[#0c1424] border rounded-2xl p-2 sm:p-2.5 shadow-xs space-y-1.5 transition-all ${
            activeTab === 'SCAN_IN'
              ? 'border-emerald-300/80 dark:border-emerald-800/60 ring-1 ring-emerald-500/10'
              : activeTab === 'SCAN_OUT'
              ? 'border-amber-300/80 dark:border-amber-800/60 ring-1 ring-amber-500/10'
              : activeTab === 'HOLD_REMAINING'
              ? 'border-purple-300/80 dark:border-purple-800/60 ring-1 ring-purple-500/10'
              : activeTab === 'RETURN_SHIPMENTS'
              ? 'border-rose-300/80 dark:border-rose-800/60 ring-1 ring-rose-500/10'
              : activeTab === 'ARRIVED_HUB'
              ? 'border-teal-300/80 dark:border-teal-800/60 ring-1 ring-teal-500/10'
              : 'border-blue-300/80 dark:border-blue-800/60 ring-1 ring-blue-500/10'
          }`}
        >
          {/* Form Header Bar (Compact & Functional) */}
          <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`w-2 h-2 rounded-full ${
                  activeTab === 'SCAN_IN'
                    ? 'bg-emerald-500'
                    : activeTab === 'SCAN_OUT'
                    ? 'bg-amber-500'
                    : activeTab === 'HOLD_REMAINING'
                    ? 'bg-purple-500'
                    : activeTab === 'RETURN_SHIPMENTS'
                    ? 'bg-rose-500'
                    : activeTab === 'ARRIVED_HUB'
                    ? 'bg-teal-500'
                    : 'bg-blue-500'
                }`}
              />
              <h2 className="text-xs font-bold text-slate-900 dark:text-white">
                {editingId
                  ? 'កែប្រែកំណត់ត្រាស្កេន'
                  : activeTab === 'SCAN_IN'
                  ? 'ស្កេនអីវ៉ាន់ចូលឃ្លាំង (ScanIn Form)'
                  : activeTab === 'SCAN_OUT'
                  ? 'ស្កេនអីវ៉ាន់ចេញពីឃ្លាំង (ScanOut Form)'
                  : activeTab === 'HOLD_REMAINING'
                  ? 'ស្កេន Update នៅសល់ក្នុងឃ្លាំង (Hold Form)'
                  : activeTab === 'RETURN_SHIPMENTS'
                  ? 'ស្កេនទំនិញបង្វិលត្រឡប់ (Return Form)'
                  : activeTab === 'ARRIVED_HUB'
                  ? 'ស្កេនទទួលចូលឃ្លាំង (Arrived Hub Form)'
                  : 'ស្កេនចេញចែកចាយតាម Rider (Out of Delivery)'}
              </h2>
              {autoMatched && (
                <span className="px-2 py-0.2 rounded-full text-[9.5px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center gap-1 animate-pulse">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span>រកឃើញក្នុង Data Report</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {manifestData && batchQueue.length === 0 && (
                <button
                  type="button"
                  onClick={() => setIsManifestModalOpen(true)}
                  className="h-7 px-2 rounded-lg border border-cyan-300 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 text-[10.5px] font-semibold flex items-center gap-1 cursor-pointer shadow-2xs hover:bg-cyan-100"
                  title="បោះពុម្ពប័ណ្ណ Manifest នៃ Batch ចុងក្រោយ"
                >
                  <Printer className="w-3 h-3" />
                  <span className="hidden sm:inline">Manifest ({manifestData.items.length})</span>
                </button>
              )}
              {editingId ? (
                <button
                  type="button"
                  onClick={resetFormFields}
                  className="h-7 px-2.5 text-[10.5px] text-rose-500 hover:text-rose-600 font-bold cursor-pointer whitespace-nowrap shrink-0"
                >
                  បោះបង់កែប្រែ
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => resetFormFields(true)}
                  className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-600 dark:text-slate-300 text-[10.5px] font-medium cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                  title="សម្អាត Form"
                >
                  សំអាត (Clear)
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="បង្រួម Form"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {formError && (
            <div className="py-1.5 px-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-[11px] flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {dispatchedWarning && (
            <div className="py-2 px-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/70 text-amber-900 dark:text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2 shadow-2xs animate-in fade-in duration-150">
              <div className="flex items-start sm:items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5 sm:mt-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-amber-900 dark:text-amber-200">{dispatchedWarning}</div>
                  <div className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                    💡 <strong>ដំណោះស្រាយ៖</strong> ប្រសិនបើមិនទាន់ចែកជោគជ័យ ហើយត្រូវចេញចែកចាយម្ដងទៀត លោកអ្នកនៅតែអាចចុច <strong>«+ + Batch (Enter)»</strong> ឬចុចប៊ូតុងខាងស្ដាំដើម្បីកត់ត្រាជា <strong>Re-delivery</strong> បានធម្មតា!
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleAddBarcodeToBatch();
                }}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                title="អនុញ្ញាតស្កេនចេញចែកចាយម្ដងទៀត (Re-delivery)"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>ចែកជូនឡើងវិញ (Re-delivery)</span>
              </button>
            </div>
          )}

          {/* Step Guidance Banner for OUT_OF_DELIVERY */}
          {activeTab === 'OUT_OF_DELIVERY' && riderName.trim() && (
            <div className={`py-1.5 px-2.5 rounded-xl border text-[11px] sm:text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 transition-all ${
              !riderName.trim()
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/70 text-amber-900 dark:text-amber-200'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/70 text-emerald-800 dark:text-emerald-200'
            }`}>
              <div className="flex items-center gap-2">
                {!riderName.trim() ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                    <span className="font-bold text-[11px] sm:text-xs">
                      👉 ជំហានទី ១៖ សូមជ្រើសរើស Rider (អ្នកដឹក) ជាមុនសិន ទើបប្រព័ន្ធអនុញ្ញាតអោយស្កេន Barcode!
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-[11px] sm:text-xs">
                      Rider: <strong className="font-semibold text-emerald-700 dark:text-emerald-300 underline underline-offset-2">{riderName}</strong> — ឥឡូវលោកអ្នកអាចស្កេន Barcode បញ្ចូលបាន!
                    </span>
                  </>
                )}
              </div>
              {riderName.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setRiderName('');
                    setBarcodeInput('');
                    setFormError(null);
                  }}
                  className="text-[10.5px] font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-300 underline cursor-pointer shrink-0"
                >
                  ប្តូរ Rider
                </button>
              )}
            </div>
          )}

          {/* Step Guidance Banner for SCAN_IN and SCAN_OUT */}
          {(activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') && destination.trim() && driverName.trim() && truckNo.trim() && (
            <div className={`py-1.5 px-2.5 rounded-xl border text-[11px] sm:text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 transition-all ${
              !destination.trim() || !driverName.trim() || !truckNo.trim()
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/70 text-amber-900 dark:text-amber-200'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/70 text-emerald-800 dark:text-emerald-200'
            }`}>
              <div className="flex items-center gap-2">
                {!destination.trim() || !driverName.trim() || !truckNo.trim() ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                    <span className="font-bold text-[11.5px] sm:text-xs">
                      👉 ជំហានទី ១៖ សូមជ្រើសរើស ទីតាំង, Driver (អ្នកបើកបរ) * និង Truck No * ជាមុនសិន ទើបប្រព័ន្ធអនុញ្ញាតអោយស្កេន Barcode!
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-[11.5px] sm:text-xs">
                      ទីតាំង: <strong className="font-semibold text-emerald-700 dark:text-emerald-300 underline underline-offset-2">{destination}</strong> | Driver: <strong className="font-semibold text-emerald-700 dark:text-emerald-300 underline underline-offset-2">{driverName}</strong> | Truck: <strong className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">{truckNo}</strong>{transferBy ? <> | By: <strong className="font-semibold text-teal-700 dark:text-teal-300">{transferBy}</strong></> : ''} — ឥឡូវលោកអ្នកអាចស្កេន Barcode បាន!
                    </span>
                  </>
                )}
              </div>
              {(driverName.trim() || truckNo.trim() || destination.trim() || transferBy.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setDriverName('');
                    setTruckNo('');
                    setTransferBy('');
                    setBarcodeInput('');
                    setFormError(null);
                  }}
                  className="text-[10.5px] font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-300 underline cursor-pointer shrink-0"
                >
                  ប្តូរ Driver/Truck/Transfer
                </button>
              )}
            </div>
          )}

          {/* 🏢 Arrived Hub: live verification against the selected ScanOut operation */}
          {activeTab === 'ARRIVED_HUB' && arrivedVerification && (
            <div className="rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/50 dark:bg-teal-950/20 p-2 space-y-2">
              <div>
                {batchQueue.length > 0 && (
                  <p className="mb-1 text-[10px] text-slate-500 dark:text-slate-400">
                    🔒 រក្សាទុក ឬសម្អាត Batch បច្ចុប្បន្នសិន ទើបអាចប្តូរ OP-OUT បាន។
                  </p>
                )}
                <div className="min-w-0 space-y-1">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10.5px]">
                    <div className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                      <div className="text-slate-500 dark:text-slate-400">បញ្ជីចេញ</div>
                      <div className="font-mono font-black text-slate-800 dark:text-slate-100 text-sm">{arrivedVerification.expectedCount}</div>
                    </div>
                    <div className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60">
                      <div className="text-emerald-700 dark:text-emerald-300">✓ បានទទួល</div>
                      <div className="font-mono font-black text-emerald-700 dark:text-emerald-300 text-sm">{arrivedVerification.received.size}</div>
                    </div>
                    <div className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60">
                      <div className="text-rose-700 dark:text-rose-300">✗ នៅខ្វះ</div>
                      <div className="font-mono font-black text-rose-700 dark:text-rose-300 text-sm">{arrivedVerification.missing.length}</div>
                    </div>
                    <div className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60">
                      <div className="text-amber-700 dark:text-amber-300">⚠ លើស/ខុសបញ្ជី</div>
                      <div className="font-mono font-black text-amber-700 dark:text-amber-300 text-sm">{arrivedVerification.unexpected.length}</div>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{
                        width: `${arrivedVerification.expectedCount > 0 ? Math.round((arrivedVerification.received.size / arrivedVerification.expectedCount) * 100) : 0}%`
                      }}
                    />
                  </div>
                </div>
              </div>

              {arrivedVerification && (arrivedVerification.missing.length > 0 || arrivedVerification.unexpected.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10.5px]">
                  {arrivedVerification.missing.length > 0 && (
                    <details className="rounded-lg border border-rose-200 dark:border-rose-800/60 bg-white dark:bg-slate-900 px-2 py-1">
                      <summary className="cursor-pointer font-bold text-rose-700 dark:text-rose-300">
                        មើល Barcode នៅខ្វះ ({arrivedVerification.missing.length})
                      </summary>
                      <div className="mt-1 flex flex-wrap gap-1 max-h-32 overflow-y-auto custom-scrollbar">
                        {arrivedVerification.missing.map((b) => (
                          <span key={b} className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-mono">
                            {b}
                          </span>
                        ))}
                      </div>
                    </details>
                  )}
                  {arrivedVerification.unexpected.length > 0 && (
                    <details className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-white dark:bg-slate-900 px-2 py-1">
                      <summary className="cursor-pointer font-bold text-amber-700 dark:text-amber-300">
                        មើល Barcode លើស/ខុសបញ្ជី ({arrivedVerification.unexpected.length})
                      </summary>
                      <div className="mt-1 flex flex-wrap gap-1 max-h-32 overflow-y-auto custom-scrollbar">
                        {arrivedVerification.unexpected.map((b) => (
                          <span
                            key={b}
                            className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-mono"
                            title={scanOutOpByBarcode.get(b) ? `ជារបស់ ${scanOutOpByBarcode.get(b)}` : 'មិនមានក្នុង ScanOut ណាមួយ'}
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleScanSubmit} className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-6 lg:grid-cols-12 gap-2 sm:gap-2.5 items-end">
              {/* Case 1: Form Layout for OUT_OF_DELIVERY: Rider comes FIRST */}
              {activeTab === 'OUT_OF_DELIVERY' ? (
                <>
                  {/* Field 1: Rider (អ្នកដឹក) (Required First) */}
                  <div className="w-full min-w-0 col-span-2 sm:col-span-3 lg:col-span-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 truncate">
                        Rider (អ្នកដឹក) <span className="text-red-500">*</span>
                      </label>
                      {riderName.trim() && (
                        <span className="text-[9.5px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                          <CheckCircle2 className="w-3 h-3" /> រួចរាល់
                        </span>
                      )}
                    </div>
                    <SearchableCombobox
                      value={riderName}
                      onChange={(val) => {
                        setRiderName(val);
                        if (formError) setFormError(null);
                      }}
                      onSelect={(val) => {
                        if (val.trim()) {
                          setTimeout(() => {
                            barcodeInputRef.current?.focus();
                          }, 150);
                        }
                      }}
                      options={riderComboboxOptions}
                      placeholder="ស្វែងរក ឬជ្រើសរើស Rider..."
                      icon={<User className="w-3 h-3 text-slate-400" />}
                      required
                    />
                  </div>

                  {/* Field 2: Barcode / Tracking (Hero Input with Generous Width) */}
                  <div className="w-full min-w-0 col-span-2 sm:col-span-3 lg:col-span-3">
                    <div className="flex items-center justify-between gap-1 mb-0.5 min-w-0">
                      <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 truncate" title="លេខ Barcode / Tracking">
                        <span className="hidden xl:inline">លេខ </span>Barcode<span className="hidden xl:inline"> / Tracking</span> <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={toggleBlockDuplicates}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-lg flex items-center gap-1 transition cursor-pointer shrink-0 shadow-2xs ${
                            blockDuplicates
                              ? 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}
                          title="បើក/បិទ ការពារស្កេនស្ទួន (ទប់ស្កាត់មិនឱ្យបញ្ចូលកញ្ចប់ស្ទួន)"
                        >
                          <ShieldCheck className={`w-2.5 h-2.5 shrink-0 ${blockDuplicates ? 'text-rose-500' : 'text-slate-400'}`} />
                          <span className="hidden 2xl:inline">ការពារ</span>
                          <span>ស្ទួន:</span>
                          <span className="font-mono text-[9px] uppercase">{blockDuplicates ? 'ON' : 'OFF'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={toggleContinuousScan}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-lg flex items-center gap-1 transition cursor-pointer shrink-0 shadow-2xs ${
                            autoContinuousScan
                              ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}
                          title="បើក/បិទ មុខងារស្កេនបន្តដោយស្វ័យប្រវត្តិ (មិនបាច់ចុច Submit/Enter)"
                        >
                          <Zap className={`w-2.5 h-2.5 shrink-0 ${autoContinuousScan ? 'text-emerald-500 fill-emerald-500' : 'text-slate-400'}`} />
                          <span className="hidden 2xl:inline">ស្កេន</span>
                          <span>បន្ត:</span>
                          <span className="font-mono text-[9px] uppercase">{autoContinuousScan ? 'ON' : 'OFF'}</span>
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                        <Barcode className="w-3.5 h-3.5" />
                      </div>
                      <input
                        ref={barcodeInputRef}
                        type="text"
                        disabled={!riderName.trim()}
                        value={barcodeInput}
                        onChange={(e) => handleBarcodeChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
                            handleAddBarcodeToBatch();
                          }
                        }}
                        placeholder={
                          !riderName.trim()
                            ? "🔒 សូមជ្រើសរើស Rider ជាមុន..."
                            : autoContinuousScan
                            ? "⚡ ស្កេន Barcode បន្តបន្ទាប់..."
                            : "ស្កេន Barcode (Enter)..."
                        }
                        className={`w-full h-8 pl-8 pr-12 rounded-xl border text-xs font-mono font-bold transition uppercase shadow-2xs ${
                          !riderName.trim()
                            ? 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 border-slate-200 dark:border-slate-800 cursor-not-allowed opacity-80'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500'
                        }`}
                        autoFocus={Boolean(riderName.trim())}
                      />
                      <button
                        type="button"
                        disabled={!riderName.trim()}
                        onClick={() => {
                          if (!riderName.trim()) {
                            setFormError('⚠️ សូមជ្រើសរើស Rider (អ្នកដឹក) ជាមុនសិន ទើបអាចបើក Camera ស្កេនបាន!');
                            return;
                          }
                          setIsScannerOpen(true);
                        }}
                        className={`absolute inset-y-0 right-0 pr-2 flex items-center ${
                          !riderName.trim() ? 'opacity-40 cursor-not-allowed text-slate-400' : 'text-slate-400 hover:text-cyan-600 cursor-pointer'
                        }`}
                        title={!riderName.trim() ? "សូមជ្រើសរើស Rider ជាមុនសិន" : "បើក Camera ស្កេន"}
                      >
                        <span className="mr-0.5 text-[8.5px] font-mono text-slate-400 font-semibold hidden sm:inline">CAM</span>
                        <Camera className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      </button>
                    </div>
                  </div>

                  {/* Delivery Zone */}
                  <div className="w-full min-w-0 col-span-1 sm:col-span-2 lg:col-span-2">
                    <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-0.5 truncate">
                      តំបន់ដឹក (Zone)
                    </label>
                    <input
                      type="text"
                      value={deliveryZone}
                      onChange={(e) => setDeliveryZone(e.target.value)}
                      placeholder="Zone A..."
                      className="w-full h-8 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 transition shadow-2xs"
                    />
                  </div>

                  {/* COD */}
                  <div className="w-full min-w-0 col-span-1 sm:col-span-2 lg:col-span-2">
                    <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-0.5 truncate">
                      COD (ប្រាក់)
                    </label>
                    <div className="flex gap-1 w-full">
                      <input
                        type="number"
                        step="any"
                        value={codAmount}
                        onChange={(e) => setCodAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full min-w-0 h-8 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 transition font-mono shadow-2xs"
                      />
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as 'USD' | 'KHR')}
                        className="h-8 px-1.5 shrink-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10.5px] font-bold shadow-2xs"
                      >
                        <option value="USD">$</option>
                        <option value="KHR">៛</option>
                      </select>
                    </div>
                  </div>

                  {/* Date */}
                  <div className="w-full min-w-0 col-span-1 sm:col-span-1 lg:col-span-1">
                    <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-0.5 truncate">
                      កាលបរិច្ឆេទ
                    </label>
                    <input
                      type="date"
                      value={scanDate}
                      onChange={(e) => setScanDate(e.target.value)}
                      className="w-full h-8 px-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[10.5px] font-semibold focus:ring-2 focus:ring-blue-500 transition shadow-2xs"
                    />
                  </div>
                </>
              ) : isTruckScanType(activeTab) ? (
                /* Case 2: Form Layout for SCAN_IN and SCAN_OUT: Destination, Driver, Truck come FIRST! */
                <>
                  {/* Field -1: Arrived Hub — the ScanOut operation (OP-OUT) being received */}
                  {activeTab === 'ARRIVED_HUB' && (
                    <div className="w-full min-w-0 col-span-2 sm:col-span-6 lg:col-span-3">
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 truncate" title="ទទួលពីប្រតិបត្តិការ ScanOut (OP-OUT)">
                          ទទួលពី OP-OUT <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[9px] text-teal-600 dark:text-teal-400 font-medium whitespace-nowrap">
                          {myScanOutOperations.filter((op) => getArrivedReceivedCount(op) < op.barcodes.size).length} មិនទាន់ផ្ទៀងផ្ទាត់
                        </span>
                      </div>
                      <SearchableCombobox
                        value={arrivedSourceOp}
                        onChange={(val) => {
                          if (!val) setArrivedSourceOp('');
                          else if (val !== arrivedSourceOp && myScanOutOperations.some((o) => o.code === val)) handleSelectArrivedSource(val);
                        }}
                        onSelect={(val) => {
                          if (val !== arrivedSourceOp) handleSelectArrivedSource(val);
                        }}
                        onClear={() => setArrivedSourceOp('')}
                        options={arrivedSourceOptions}
                        allowCustomInput={false}
                        disabled={batchQueue.length > 0}
                        placeholder="ស្វែងរក OP-OUT, គោលដៅ, Driver..."
                        emptyMessage={
                          myArrivedLocations !== null && myArrivedLocations.length === 0
                            ? 'គណនីនេះមិនទាន់កំណត់ទីតាំងទទួល — សូមទាក់ទង Admin'
                            : 'មិនមាន OP-OUT ដែលរង់ចាំផ្ទៀងផ្ទាត់'
                        }
                        icon={<FolderTree className="w-3 h-3 text-slate-400" />}
                      />
                    </div>
                  )}

                  {/* Field 0: ORIGIN (ប្រភព) — ScanIn / ScanOut only, same options as Destination */}
                  {hasOriginField(activeTab) && (
                    <div className={`w-full min-w-0 col-span-2 sm:col-span-2 ${activeTab === 'SCAN_OUT' ? 'lg:col-span-3' : 'lg:col-span-2'}`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 truncate">
                          ORIGIN (ប្រភព) <span className="text-red-500">*</span>
                        </label>
                      </div>
                      <SearchableCombobox
                        value={origin}
                        onChange={(val) => {
                          setOrigin(val);
                          if (formError) setFormError(null);
                        }}
                        onSelect={(val) => {
                          if (val.trim() && destination.trim() && driverName.trim() && truckNo.trim()) {
                            setTimeout(() => {
                              barcodeInputRef.current?.focus();
                            }, 150);
                          }
                        }}
                        options={destinationComboboxOptions}
                        placeholder="ស្វែងរក ឬជ្រើសរើសប្រភព..."
                        icon={<MapPin className="w-3 h-3 text-slate-400" />}
                        required
                      />
                    </div>
                  )}

                  {/* Field 1: DESTINATION (គោលដៅ) (Searchable Combobox) */}
                  <div className={`w-full min-w-0 col-span-2 sm:col-span-2 ${activeTab === 'SCAN_OUT' ? 'lg:col-span-3' : 'lg:col-span-2'}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 truncate">
                        DESTINATION (គោលដៅ) <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-1">
                        {dataReportDestinations.length > 0 && (
                          <span
                            className="text-[9px] text-cyan-600 dark:text-cyan-400 font-medium whitespace-nowrap"
                            title="ចំនួនគោលដៅទាញចេញពី Data Report Page (column DESTINATION)"
                          >
                            {dataReportDestinations.length}<span className="hidden 2xl:inline"> គោលដៅ</span>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => refreshDataReportDestinations(true)}
                          className={`text-[10px] text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 p-0.5 cursor-pointer flex items-center gap-0.5 ${
                            isLoadingDestinations ? 'animate-spin' : ''
                          }`}
                          title="ទាញទិន្នន័យ DESTINATION ឡើងវិញពី Data Report"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                    <SearchableCombobox
                      value={destination}
                      onChange={(val) => {
                        setDestination(val);
                        if (formError) setFormError(null);
                      }}
                      onSelect={(val) => {
                        if (val.trim() && driverName.trim() && truckNo.trim() && (!hasOriginField(activeTab) || origin.trim())) {
                          setTimeout(() => {
                            barcodeInputRef.current?.focus();
                          }, 150);
                        }
                      }}
                      options={destinationComboboxOptions}
                      placeholder="ស្វែងរក ឬជ្រើសរើសគោលដៅ..."
                      icon={<MapPin className="w-3 h-3 text-slate-400" />}
                      required
                    />
                  </div>

                  {/* Field 2: ឈ្មោះ Driver (Searchable Combobox) */}
                  <div className="w-full min-w-0 col-span-1 sm:col-span-2 lg:col-span-3">
                    <div className="flex items-center justify-between mb-0.5 min-w-0">
                      <label className="block text-[10px] sm:text-[10.5px] font-bold text-slate-700 dark:text-slate-300 truncate">
                        <span className="sm:hidden">Driver</span>
                        <span className="hidden sm:inline">Driver (អ្នកបើកបរ)</span>
                        <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-1 shrink-0">
                        {driverHandleOptions.length > 0 && (
                          <span className="text-[9px] text-cyan-600 dark:text-cyan-400 font-medium whitespace-nowrap">
                            <span className="hidden 2xl:inline">{driverHandleOptions.length} Handles</span>
                            <span className="2xl:hidden">{driverHandleOptions.length}</span>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => refreshMeterialOfficeData(true)}
                          className={`text-[10px] text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 p-0.5 cursor-pointer flex items-center gap-0.5 ${
                            isLoadingTrucks ? 'animate-spin' : ''
                          }`}
                          title="ទាញទិន្នន័យ Name Handle ឡើងវិញពី Meterial_Office"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>

                    <SearchableCombobox
                      value={driverName}
                      onChange={(val) => {
                        setDriverName(val);
                        if (formError) setFormError(null);

                        // Auto-lookup Truck No from Meterial_Office based on selected Driver (Name Handle -> Model No.)
                        let nextTruck = truckNo;
                        const matchedTrucks = lookupTrucksByDriver(val, driverTruckMap);
                        if (matchedTrucks.length > 0) {
                          nextTruck = matchedTrucks[0];
                          setTruckNo(nextTruck);
                        }
                      }}
                      onSelect={(val) => {
                        const nextTruck = lookupTrucksByDriver(val, driverTruckMap)[0] || truckNo;
                        if (val.trim() && nextTruck.trim() && destination.trim()) {
                          setTimeout(() => {
                            barcodeInputRef.current?.focus();
                          }, 150);
                        }
                      }}
                      options={driverComboboxOptions}
                      placeholder="ស្វែងរក Driver..."
                      icon={<User className="w-3 h-3 text-slate-400" />}
                      required
                    />
                  </div>

                  {/* Field 3: Truck No (Searchable Combobox) */}
                  <div className={`w-full min-w-0 col-span-1 ${activeTab === 'SCAN_IN' ? 'sm:col-span-3 lg:col-span-3' : activeTab === 'SCAN_OUT' ? 'sm:col-span-2 lg:col-span-3' : 'sm:col-span-2 lg:col-span-2'}`}>
                    <div className="flex items-center justify-between mb-0.5 min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <label className="block text-[10px] sm:text-[10.5px] font-bold text-slate-700 dark:text-slate-300 truncate">
                          Truck No <span className="text-red-500">*</span>
                        </label>
                        {isTruckAutoMatched && (
                          <span
                            className="text-[8px] sm:text-[8.5px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 px-1 py-0.2 rounded-md shrink-0 animate-in fade-in"
                            title={`ឡាននេះត្រូវបាន Lookup ដោយស្វ័យប្រវត្តិចេញពី Meterial_Office សម្រាប់ ${driverName}`}
                          >
                            ✓ <span className="hidden sm:inline">ឡានតាម Driver</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {truckModelOptions.length > 0 && (
                          <span className="text-[9px] text-cyan-600 dark:text-cyan-400 font-medium whitespace-nowrap">
                            <span className="hidden 2xl:inline">{truckModelOptions.length} Models</span>
                            <span className="2xl:hidden">{truckModelOptions.length}</span>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => refreshMeterialOfficeData(true)}
                          className={`text-[10px] text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 p-0.5 cursor-pointer flex items-center gap-0.5 ${
                            isLoadingTrucks ? 'animate-spin' : ''
                          }`}
                          title="ទាញទិន្នន័យ Model No. ឡើងវិញពី Meterial_Office"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>

                    <SearchableCombobox
                      value={truckNo}
                      onChange={(val) => {
                        setTruckNo(val);
                        if (formError) setFormError(null);
                      }}
                      onSelect={(val) => {
                        if (val.trim() && driverName.trim() && destination.trim()) {
                          setTimeout(() => {
                            barcodeInputRef.current?.focus();
                          }, 150);
                        }
                      }}
                      options={truckComboboxOptions}
                      placeholder="ស្វែងរក Truck No..."
                      icon={<Truck className="w-3 h-3 text-slate-400" />}
                      required
                    />
                  </div>

                  {/* Field: Transfer By / ដាក់តាមរយៈណា (Only for SCAN_IN) */}
                  {activeTab === 'SCAN_IN' && (
                    <div className="w-full min-w-0 col-span-1 sm:col-span-3 lg:col-span-2">
                      <div className="flex items-center justify-between mb-0.5 min-w-0">
                        <label className="block text-[10px] sm:text-[10.5px] font-bold text-slate-700 dark:text-slate-300 truncate" title="Transfer By (ដាក់តាមរយៈណា)">
                          <span className="xl:hidden">Transfer By</span>
                          <span className="hidden xl:inline">Transfer By (ដាក់តាមរយៈណា)</span>
                        </label>
                        {transferBy && (
                          <span className="text-[9px] text-teal-600 dark:text-teal-400 font-bold whitespace-nowrap ml-1 shrink-0">
                            ✓ {transferBy}
                          </span>
                        )}
                      </div>

                      <SearchableCombobox
                        value={transferBy}
                        onChange={(val) => {
                          setTransferBy(val);
                          if (formError) setFormError(null);
                        }}
                        options={TRANSFER_BY_COMBOBOX_OPTIONS}
                        placeholder="ជ្រើសរើស Transfer By..."
                        icon={<ArrowRightLeft className="w-3 h-3 text-slate-400" />}
                      />
                    </div>
                  )}

                  {/* Field 4: Barcode / Tracking input (Hero Input with Generous Width) */}
                  <div className="w-full min-w-0 col-span-2 sm:col-span-4 lg:col-span-8">
                    <div className="flex items-center justify-between gap-1 mb-0.5 min-w-0">
                      <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 truncate" title="លេខ Barcode / Tracking">
                        <span className="hidden xl:inline">លេខ </span>Barcode<span className="hidden xl:inline"> / Tracking</span> <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={toggleBlockDuplicates}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-lg flex items-center gap-1 transition cursor-pointer shrink-0 shadow-2xs ${
                            blockDuplicates
                              ? 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}
                          title="បើក/បិទ ការពារស្កេនស្ទួន (ទប់ស្កាត់មិនឱ្យបញ្ចូលកញ្ចប់ស្ទួន)"
                        >
                          <ShieldCheck className={`w-2.5 h-2.5 shrink-0 ${blockDuplicates ? 'text-rose-500' : 'text-slate-400'}`} />
                          <span className="hidden 2xl:inline">ការពារ</span>
                          <span>ស្ទួន:</span>
                          <span className="font-mono text-[9px] uppercase">{blockDuplicates ? 'ON' : 'OFF'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={toggleContinuousScan}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-lg flex items-center gap-1 transition cursor-pointer shrink-0 shadow-2xs ${
                            autoContinuousScan
                              ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}
                          title="បើក/បិទ មុខងារស្កេនបន្តដោយស្វ័យប្រវត្តិ (មិនបាច់ចុច Submit/Enter)"
                        >
                          <Zap className={`w-2.5 h-2.5 shrink-0 ${autoContinuousScan ? 'text-emerald-500 fill-emerald-500' : 'text-slate-400'}`} />
                          <span className="hidden 2xl:inline">ស្កេន</span>
                          <span>បន្ត:</span>
                          <span className="font-mono text-[9px] uppercase">{autoContinuousScan ? 'ON' : 'OFF'}</span>
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                        <Barcode className="w-3.5 h-3.5" />
                      </div>
                      <input
                        ref={barcodeInputRef}
                        type="text"
                        disabled={!driverName.trim() || !truckNo.trim() || !destination.trim() || (hasOriginField(activeTab) && !origin.trim())}
                        value={barcodeInput}
                        onChange={(e) => handleBarcodeChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
                            handleAddBarcodeToBatch();
                          }
                        }}
                        placeholder={
                          activeTab === 'ARRIVED_HUB' && !arrivedSourceInfo
                            ? "🔒 សូមជ្រើសរើស OP-OUT ជាមុន..."
                            : hasOriginField(activeTab) && !origin.trim()
                            ? "🔒 សូមជ្រើសរើស Origin ជាមុន..."
                            : !destination.trim()
                            ? "🔒 សូមជ្រើសរើសទីតាំងជាមុន..."
                            : !driverName.trim() || !truckNo.trim()
                            ? "🔒 ត្រូវរើស Driver & Truck មុន..."
                            : autoContinuousScan
                            ? "⚡ ស្កេន Barcode បន្តបន្ទាប់..."
                            : "ស្កេន Barcode (Enter)..."
                        }
                        className={`w-full h-8 pl-8 pr-12 rounded-xl border text-xs font-mono font-bold transition uppercase shadow-2xs ${
                          !driverName.trim() || !truckNo.trim() || !destination.trim() || (hasOriginField(activeTab) && !origin.trim())
                            ? 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 border-slate-200 dark:border-slate-800 cursor-not-allowed opacity-80'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500'
                        }`}
                        autoFocus={Boolean(driverName.trim() && truckNo.trim() && destination.trim())}
                      />
                      <button
                        type="button"
                        disabled={!driverName.trim() || !truckNo.trim() || !destination.trim() || (hasOriginField(activeTab) && !origin.trim())}
                        onClick={() => {
                          if (!driverName.trim() || !truckNo.trim() || !destination.trim() || (hasOriginField(activeTab) && !origin.trim())) {
                            setFormError('⚠️ សូមជ្រើសរើស ទីតាំង, Driver (អ្នកបើកបរ) និង Truck No ជាមុនសិន!');
                            return;
                          }
                          setIsScannerOpen(true);
                        }}
                        className={`absolute inset-y-0 right-0 pr-2 flex items-center ${
                          !driverName.trim() || !truckNo.trim() || !destination.trim() || (hasOriginField(activeTab) && !origin.trim())
                            ? 'opacity-40 cursor-not-allowed text-slate-400'
                            : 'text-slate-400 hover:text-cyan-600 cursor-pointer'
                        }`}
                        title={
                          !driverName.trim() || !truckNo.trim() || !destination.trim() || (hasOriginField(activeTab) && !origin.trim())
                            ? "សូមជ្រើសរើស Driver & Truck No ជាមុនសិន"
                            : "បើក Camera ស្កេន"
                        }
                      >
                        <span className="mr-0.5 text-[8.5px] font-mono text-slate-400 font-semibold hidden sm:inline">CAM</span>
                        <Camera className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      </button>
                    </div>
                  </div>

                  {/* Field 5: Date */}
                  <div className="w-full min-w-0 col-span-1 sm:col-span-1 lg:col-span-2">
                    <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-0.5 truncate">
                      កាលបរិច្ឆេទ
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none text-slate-400">
                        <Calendar className="w-3 h-3" />
                      </div>
                      <input
                        type="date"
                        value={scanDate}
                        onChange={(e) => setScanDate(e.target.value)}
                        className="w-full h-8 pl-6 pr-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[11px] font-semibold focus:ring-2 focus:ring-cyan-500 transition shadow-2xs"
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* Case 3: Form Layout for HOLD_REMAINING and RETURN_SHIPMENTS (Barcode + Reason + Note) */
                <>
                  {/* Field 1: Barcode / Tracking input (Prominent Hero) */}
                  <div className="w-full min-w-0 col-span-2 sm:col-span-3 lg:col-span-4">
                    <div className="flex items-center justify-between gap-1 mb-0.5 min-w-0">
                      <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 truncate" title="លេខ Barcode / Tracking">
                        <span className="hidden xl:inline">លេខ </span>Barcode<span className="hidden xl:inline"> / Tracking</span> <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={toggleBlockDuplicates}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-lg flex items-center gap-1 transition cursor-pointer shrink-0 shadow-2xs ${
                            blockDuplicates
                              ? 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}
                          title="បើក/បិទ ការពារស្កេនស្ទួន (ទប់ស្កាត់មិនឱ្យបញ្ចូលកញ្ចប់ស្ទួន)"
                        >
                          <ShieldCheck className={`w-2.5 h-2.5 shrink-0 ${blockDuplicates ? 'text-rose-500' : 'text-slate-400'}`} />
                          <span className="hidden 2xl:inline">ការពារ</span>
                          <span>ស្ទួន:</span>
                          <span className="font-mono text-[9px] uppercase">{blockDuplicates ? 'ON' : 'OFF'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={toggleContinuousScan}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-lg flex items-center gap-1 transition cursor-pointer shrink-0 shadow-2xs ${
                            autoContinuousScan
                              ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}
                          title="បើក/បិទ មុខងារស្កេនបន្តដោយស្វ័យប្រវត្តិ (មិនបាច់ចុច Submit/Enter)"
                        >
                          <Zap className={`w-2.5 h-2.5 shrink-0 ${autoContinuousScan ? 'text-emerald-500 fill-emerald-500' : 'text-slate-400'}`} />
                          <span className="hidden 2xl:inline">ស្កេន</span>
                          <span>បន្ត:</span>
                          <span className="font-mono text-[9px] uppercase">{autoContinuousScan ? 'ON' : 'OFF'}</span>
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                        <Barcode className="w-3.5 h-3.5" />
                      </div>
                      <input
                        ref={barcodeInputRef}
                        type="text"
                        value={barcodeInput}
                        onChange={(e) => handleBarcodeChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
                            handleAddBarcodeToBatch();
                          }
                        }}
                        placeholder={autoContinuousScan ? "⚡ ស្កេន Barcode បន្តបន្ទាប់..." : "ស្កេន Barcode (Enter)..."}
                        className="w-full h-8 pl-8 pr-12 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold focus:ring-2 focus:ring-cyan-500 transition uppercase shadow-2xs"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setIsScannerOpen(true)}
                        className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 hover:text-cyan-600 cursor-pointer"
                        title="បើក Camera ស្កេន"
                      >
                        <span className="mr-0.5 text-[8.5px] font-mono text-slate-400 font-semibold hidden sm:inline">CAM</span>
                        <Camera className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      </button>
                    </div>
                  </div>

                  {/* មូលហេតុនៅសល់ */}
                  <div className="w-full min-w-0 col-span-2 sm:col-span-3 lg:col-span-3">
                    <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-0.5 truncate">
                      {activeTab === 'RETURN_SHIPMENTS' ? 'មូលហេតុបង្វិល' : 'មូលហេតុនៅសល់'} <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                        <AlertCircle className="w-3.5 h-3.5 text-purple-600" />
                      </div>
                      <select
                        value={holdReason}
                        onChange={(e) => setHoldReason(e.target.value)}
                        className="w-full h-8 pl-7 pr-2 rounded-xl border border-purple-300 dark:border-purple-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold focus:ring-2 focus:ring-purple-500 transition truncate shadow-2xs"
                      >
                        {reasonsForTab(activeTab).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                        {holdReason && !reasonsForTab(activeTab).includes(holdReason) && (
                          <option value={holdReason}>{holdReason}</option>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* ចំណាំ (Note / Remarks) */}
                  <div className="w-full min-w-0 col-span-2 sm:col-span-4 lg:col-span-3">
                    <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-0.5 truncate">
                      ចំណាំ (Note)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                        <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <input
                        type="text"
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
                            handleAddBarcodeToBatch();
                          }
                        }}
                        placeholder="ចំណាំបន្ថែម..."
                        className="w-full h-8 pl-8 pr-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-purple-500 transition shadow-2xs"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Submit Button (Inline in the same row) */}
              <div className="w-full min-w-0 col-span-2 sm:col-span-1 lg:col-span-2">
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    !barcodeInput.trim() ||
                    (activeTab === 'OUT_OF_DELIVERY' && !riderName.trim()) ||
                    (activeTab === 'ARRIVED_HUB' && !arrivedSourceInfo) ||
                    (isTruckScanType(activeTab) && (!destination.trim() || !driverName.trim() || !truckNo.trim())) ||
                    (hasOriginField(activeTab) && !origin.trim())
                  }
                  className={`w-full h-8 px-2 sm:px-3 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                    activeTab === 'SCAN_IN'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/20'
                      : activeTab === 'SCAN_OUT'
                      ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 shadow-amber-500/20'
                      : activeTab === 'HOLD_REMAINING'
                      ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-700 hover:to-rose-700 shadow-purple-500/20'
                      : activeTab === 'RETURN_SHIPMENTS'
                      ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 shadow-rose-500/20'
                      : activeTab === 'ARRIVED_HUB'
                      ? 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 shadow-teal-500/20'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/20'
                  }`}
                  title={
                    activeTab === 'OUT_OF_DELIVERY' && !riderName.trim()
                      ? "សូមជ្រើសរើស Rider ជាមុនសិន"
                      : isTruckScanType(activeTab) && (!driverName.trim() || !truckNo.trim() || !destination.trim())
                      ? "សូមជ្រើសរើស ទីតាំង, Driver និង Truck No ជាមុនសិន"
                      : "ដាក់ចូល Batch ឬចុច Enter លើក្តារចុច"
                  }
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span className="truncate">
                    {editingId ? 'កែប្រែ' : activeTab === 'SCAN_IN' ? '+ Batch' : '+ Batch (Enter)'}
                  </span>
                </button>
              </div>
            </div>

            {/* Matched Data Preview Pill (If matched from DataReport) */}
            {matchedPreview && (
              <div className="p-1.5 px-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[10.5px] text-emerald-800 dark:text-emerald-200 flex flex-wrap items-center gap-x-3 gap-y-0.5 animate-in fade-in duration-150 shadow-2xs">
                <span className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Data Report:</span>
                </span>
                {matchedPreview.shipper && (
                  <span><strong>Shipper:</strong> {matchedPreview.shipper}</span>
                )}
                {matchedPreview.consignee && (
                  <span><strong>Consignee:</strong> {matchedPreview.consignee}</span>
                )}
                {matchedPreview.destination && (
                  <span><strong>Dest:</strong> {matchedPreview.destination}</span>
                )}
                {matchedPreview.payment && (
                  <span><strong>Payment:</strong> {matchedPreview.payment}</span>
                )}
                {matchedPreview.holdReason && (
                  <span className="font-semibold text-amber-700 dark:text-amber-300">
                    <strong>Reason:</strong> {matchedPreview.holdReason}
                  </span>
                )}
                {matchedPreview.shelfLocation && (
                  <span className="font-semibold text-purple-700 dark:text-purple-300">
                    <strong>Shelf:</strong> {matchedPreview.shelfLocation}
                  </span>
                )}
              </div>
            )}

            {/* Batch Queue Section (Multiple Barcode Operation Table) */}
            {batchQueue.length > 0 && !editingId && (
              <div className="mt-3.5 p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-cyan-50/70 via-emerald-50/70 to-blue-50/70 dark:from-cyan-950/40 dark:via-emerald-950/40 dark:to-blue-950/40 border border-cyan-200/80 dark:border-cyan-800/60 shadow-xs">
                {/* Batch Header Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-cyan-600 text-white shadow-xs">
                      <Package className="w-3.5 h-3.5" />
                      បញ្ជី Batch ត្រៀមរក្សាទុក: {batchQueue.length} កញ្ចប់
                    </span>

                    {/* Total COD badges */}
                    {batchTotalCOD.usd > 0 && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                        COD: ${batchTotalCOD.usd.toFixed(2)}
                      </span>
                    )}
                    {batchTotalCOD.khr > 0 && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                        COD: {batchTotalCOD.khr.toLocaleString()} ៛
                      </span>
                    )}

                    {batchTotalKG > 0 && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 inline-flex items-center gap-1">
                        <Scale className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        គីឡូសរុប: {batchTotalKG.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} KG
                      </span>
                    )}
                  </div>

                  {/* Batch Action Buttons */}
                  <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <button
                      type="button"
                      onClick={handleClearBatch}
                      className="h-8 px-3 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs whitespace-nowrap"
                      title="លុប Batch ចោលទាំងអស់"
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>លុបទាំងអស់</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setManifestData({
                          items: [...batchQueue],
                          scanType: activeTab,
                          date: scanDate,
                          destination: destination || undefined,
                          driverName: driverName || undefined,
                          truckNo: truckNo || undefined,
                          transferBy: transferBy || undefined,
                          riderName: riderName || undefined,
                          deliveryZone: deliveryZone || undefined,
                          holdReason: holdReason || undefined,
                          shelfLocation: shelfLocation || undefined,
                          operatorName: currentUser?.name || currentUser?.email || 'User'
                        });
                        setIsManifestModalOpen(true);
                      }}
                      className="h-8 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs whitespace-nowrap"
                      title="មើល និងបោះពុម្ពប័ណ្ណ Manifest"
                    >
                      <Printer className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                      <span>បោះពុម្ព Manifest</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSubmittingBatch}
                      onClick={handleSaveBatch}
                      className="h-8 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm hover:shadow transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      {isSubmittingBatch ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                          <span>កំពុងរក្សាទុក...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>រក្សាទុក Batch ទាំងអស់ ({batchQueue.length})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Table of queued items */}
                <GridObjectSelectionBar
                  rows={queueSelection.selectedRows}
                  filename="warehouse_queue_selected"
                  onClear={queueSelection.clear}
                />
                <div className="max-h-64 sb-grid-wrap custom-scrollbar">
                  <table className="sb-grid w-full min-w-[700px] text-left">
                    <thead>
                      <tr>
                        <GridHeadGutter
                          checked={queueSelection.allChecked}
                          indeterminate={queueSelection.someChecked}
                          onToggleAll={queueSelection.toggleAll}
                        />
                        <th className="py-2 px-3">លេខ Barcode / Tracking</th>
                        <th className="py-2 px-3">SHIPPER (អ្នកផ្ញើ)</th>
                        <th className="py-2 px-3">CONSIGNEE (អ្នកទទួល)</th>
                        <th className="py-2 px-3">DESTINATION (គោលដៅ)</th>
                        {activeTab === 'SCAN_IN' && (
                          <th className="py-2 px-3 min-w-[140px] text-teal-700 dark:text-teal-300">
                            Transfer By (ដាក់តាមរយៈណា)
                          </th>
                        )}
                        {isReasonScanType(activeTab) && (
                          <>
                            <th className="py-2 px-3 text-amber-700 dark:text-amber-300">{activeTab === 'RETURN_SHIPMENTS' ? 'មូលហេតុបង្វិល (Return Reason)' : 'មូលហេតុនៅសល់ក្នុងឃ្លាំង (Reason)'}</th>
                            {activeTab === 'HOLD_REMAINING' && <th className="py-2 px-2.5 text-purple-700 dark:text-purple-300">ធ្នើរ (Shelf)</th>}
                          </>
                        )}
                        <th className="py-2 px-3 text-center">PAYMENT (ការទូទាត់)</th>
                        <th className="py-2 px-3 min-w-[150px]">ចំណាំ (Note)</th>
                        <th className="py-2 px-3 text-center">ម៉ោងស្កេន</th>
                        <th className="py-2 px-2 text-center w-12">លុប</th>
                      </tr>
                    </thead>
                    <tbody className="font-sans">
                      {batchQueue.map((item, idx) => (
                        <tr key={item.id} className={`group ${queueSelection.isSelected(item.id) ? 'sb-selected' : ''}`}>
                          <GridRowGutter
                            selected={queueSelection.isSelected(item.id)}
                            rowNumber={batchQueue.length - idx}
                            onToggle={() => queueSelection.toggle(item.id)}
                          />
                          <td className="font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              {item.barcode}
                            </span>
                          </td>

                          {/* SHIPPER */}
                          <td className="py-1.5 px-3 text-slate-700 dark:text-slate-300 font-medium truncate max-w-[130px]">
                            {item.shipper || <span className="text-slate-400 italic text-[11px]">—</span>}
                          </td>

                          {/* CONSIGNEE */}
                          <td className="py-1.5 px-3 text-slate-900 dark:text-slate-100 font-bold truncate max-w-[150px]">
                            <div>{item.consignee || item.customerName || <span className="text-slate-400 italic font-normal text-[11px]">—</span>}</div>
                            {item.customerPhone && (
                              <div className="text-[10px] text-slate-400 font-mono font-normal">☎ {item.customerPhone}</div>
                            )}
                          </td>

                          {/* DESTINATION */}
                          <td className="py-1.5 px-3 text-slate-700 dark:text-slate-300">
                            {item.destination ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                <MapPin className="w-3 h-3 text-cyan-600 shrink-0" />
                                <span className="truncate max-w-[140px]">{item.destination}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">—</span>
                            )}
                          </td>

                          {/* Transfer By (Only for SCAN_IN) */}
                          {activeTab === 'SCAN_IN' && (
                            <td className="py-1.5 px-3 text-slate-700 dark:text-slate-300">
                              {(item.transferBy || transferBy) ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800/60 text-[11px] font-bold text-teal-700 dark:text-teal-300">
                                  <ArrowRightLeft className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                                  <span>{item.transferBy || transferBy}</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">—</span>
                              )}
                            </td>
                          )}

                          {/* HOLD_REMAINING REASON & SHELF */}
                          {activeTab === 'HOLD_REMAINING' && (
                            <>
                              <td className="py-1.5 px-3 text-amber-700 dark:text-amber-300 font-semibold text-[11px] max-w-[180px] truncate">
                                {item.holdReason || holdReason || <span className="text-slate-400 italic font-normal text-[11px]">—</span>}
                              </td>
                              <td className="py-1.5 px-2.5 font-mono text-purple-700 dark:text-purple-300 font-medium">
                                {item.shelfLocation || shelfLocation || <span className="text-slate-400 italic font-normal text-[11px]">—</span>}
                              </td>
                            </>
                          )}
                          {activeTab === 'RETURN_SHIPMENTS' && (
                            <td className="py-1.5 px-3 text-rose-700 dark:text-rose-300 font-semibold text-[11px] max-w-[180px] truncate">
                              {item.holdReason || holdReason || <span className="text-slate-400 italic font-normal text-[11px]">—</span>}
                            </td>
                          )}

                          {/* PAYMENT */}
                          <td className="py-1.5 px-3 text-center">
                            {item.payment ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                                item.payment.toUpperCase().includes('COD')
                                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                                  : item.payment.toUpperCase().includes('PAID')
                                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                                  : 'bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                              }`}>
                                {item.payment}
                              </span>
                            ) : item.codAmount !== undefined ? (
                              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                {item.currency === 'KHR' ? `${item.codAmount.toLocaleString()} ៛` : `$${item.codAmount.toFixed(2)}`}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">—</span>
                            )}
                          </td>

                          {/* REMARKS (ចំណាំ) - EDITABLE INPUT BOX */}
                          <td className="py-1 px-2.5 min-w-[150px]">
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                value={item.remarks || ''}
                                onChange={(e) => handleUpdateBatchItemRemarks(item.id, e.target.value)}
                                placeholder="ចំណាំ..."
                                className="w-full h-7 px-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-purple-500 transition shadow-2xs"
                                title="បញ្ចូល ឬកែប្រែចំណាំសម្រាប់កញ្ចប់នេះ"
                              />
                            </div>
                          </td>

                          <td className="py-1.5 px-3 text-center text-[11px] text-slate-500 font-mono whitespace-nowrap">
                            {item.scannedAt}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveBatchItem(item.id)}
                              className="p-1 rounded-lg text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition cursor-pointer"
                              title="លុបចេញពី Batch បើស្កេនច្រឡំ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </form>
        </div>
      ) : (
        /* Collapsed Quick Launch Bar (Frees up 100% of vertical space) */
        <button
          type="button"
          onClick={() => {
            setIsFormOpen(true);
            setTimeout(() => barcodeInputRef.current?.focus(), 100);
          }}
          className="w-full bg-white dark:bg-[#0c1424] border border-slate-200/90 dark:border-slate-800/80 hover:border-cyan-300 dark:hover:border-cyan-800 rounded-2xl p-2 flex items-center gap-2.5 text-left cursor-pointer transition shadow-2xs active:scale-[0.99] group"
        >
          <span
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm ${
              activeTab === 'SCAN_IN'
                ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                : activeTab === 'SCAN_OUT'
                ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                : activeTab === 'HOLD_REMAINING'
                ? 'bg-gradient-to-br from-purple-500 to-pink-600'
                : activeTab === 'RETURN_SHIPMENTS'
                ? 'bg-gradient-to-br from-rose-500 to-red-600'
                : activeTab === 'ARRIVED_HUB'
                ? 'bg-gradient-to-br from-teal-500 to-cyan-600'
                : 'bg-gradient-to-br from-blue-500 to-indigo-600'
            }`}
          >
            <Barcode className="w-4.5 h-4.5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-bold text-slate-900 dark:text-white truncate">
              ស្កេន{' '}
              {activeTab === 'SCAN_IN'
                ? 'ScanIn'
                : activeTab === 'SCAN_OUT'
                ? 'ScanOut'
                : activeTab === 'HOLD_REMAINING'
                ? 'Hold នៅសល់'
                : activeTab === 'RETURN_SHIPMENTS'
                ? 'Return'
                : activeTab === 'ARRIVED_HUB'
                ? 'Arrived Hub'
                : 'Out of Delivery'}
            </span>
            <span className="block text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
              ចុចដើម្បីបើក Form ស្កេនអីវ៉ាន់
            </span>
          </span>
          <span className="h-8 px-3 rounded-xl bg-cyan-600 group-hover:bg-cyan-700 text-white text-[11px] font-bold flex items-center gap-1 shrink-0 shadow-xs whitespace-nowrap">
            <Plus className="w-3.5 h-3.5" />
            បើក Form
          </span>
        </button>
      )}

      {/* ========================================================================= */}
      {/* 🔍 4. COMPACT SEARCH, FILTERS & VIEW MODE TOOLBAR */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#0c1424] border border-slate-200/90 dark:border-slate-800/80 rounded-2xl p-2 shadow-2xs flex flex-wrap items-center gap-2">
        {/* Search + Date pills grow to fill the line; the controls block wraps below only when it no longer fits */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto sm:flex-1 sm:basis-[420px] min-w-0">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ស្វែងរក Barcode, ឈ្មោះ, ទីតាំង, Rider..."
              className="w-full h-8 pl-8 pr-7 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-cyan-500 transition shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Date Filter Pills */}
          <div className="grid grid-cols-4 sm:flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl text-xs shrink-0 text-center">
            <button
              type="button"
              onClick={() => setDateFilter('ALL')}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                dateFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              ទាំងអស់
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('TODAY')}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                dateFilter === 'TODAY'
                  ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              ថ្ងៃនេះ
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('YESTERDAY')}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                dateFilter === 'YESTERDAY'
                  ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              ម្សិលមិញ
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('THIS_MONTH')}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                dateFilter === 'THIS_MONTH'
                  ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              ខែនេះ
            </button>
          </div>
        </div>

        {/* Controls Row: Operator, Filter button, Print, Sort, and View Mode */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 max-w-full min-w-0 w-full sm:w-auto sm:grow">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 w-full sm:w-auto min-w-0">
            {/* Operator Filter */}
            {canViewAll ? (
              operators.length > 0 && (
                <select
                  value={operatorFilter}
                  onChange={(e) => setOperatorFilter(e.target.value)}
                  className="h-8 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs w-full sm:w-auto sm:max-w-[140px] truncate"
                >
                  <option value="ALL">អ្នកស្កេនទាំងអស់</option>
                  {operators.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              )
            ) : (
              <div
                className="h-8 px-2.5 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-1 shadow-2xs"
                title="កម្រិតទិន្នន័យ: មើលបានតែទិន្នន័យរបស់ខ្លួនឯងប៉ុណ្ណោះ (Data Scope: Own Only)"
              >
                <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="truncate max-w-[130px]">{currentUser?.email || 'តែរបស់ខ្ញុំ'}</span>
              </div>
            )}

            {/* Operation Code Filter */}
            {currentTabOperationGroups.length > 1 && (
              <select
                value={filterOperationCode}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterOperationCode(val);
                  if (val !== 'ALL' && dateFilter !== 'ALL') {
                    setDateFilter('ALL');
                  }
                }}
                className="h-8 px-2 rounded-xl border border-cyan-300 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-200 text-xs font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs w-full sm:w-auto sm:max-w-[170px] truncate"
                title="ចម្រាញ់តាមប្រតិបត្តិការ (Operation Code)"
              >
                <option value="ALL">គ្រប់ប្រតិបត្តិការទាំងអស់ ({currentTabOperationGroups.length})</option>
                {currentTabOperationGroups.map((g) => {
                  const label = `${g.operationCode} (${g.items.length}កញ្ចប់)`;
                  return (
                    <option key={g.operationCode} value={g.operationCode}>
                      {label}
                    </option>
                  );
                })}
              </select>
            )}

            {/* Filter Toggle Button with Badge */}
            <button
              type="button"
              onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
              className={`h-8 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs ${
                isFilterPanelOpen || activeFiltersCount > 0
                  ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
              }`}
              title="បើក/បិទ ផ្ទាំងចម្រាញ់ទិន្នន័យលម្អិត"
            >
              <Filter className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>ចម្រាញ់ <span className="hidden 2xl:inline">(Filters)</span></span>
              {activeFiltersCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-cyan-600 text-white font-mono text-[10px] flex items-center justify-center font-bold">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isFilterPanelOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Print Manifest Button for Filtered Items */}
            <button
              type="button"
              onClick={selectedScanIds.size > 0 ? handlePrintSelectedManifest : handleToolbarPrint}
              disabled={filteredScans.length === 0}
              className={`h-8 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs ${
                selectedScanIds.size > 0
                  ? 'border-cyan-600 bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-500/20'
                  : 'border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-950/60 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300'
              }`}
              title={
                selectedScanIds.size > 0
                  ? `បោះពុម្ពប័ណ្ណប្រតិបត្តិការសម្រាប់ ${selectedScanIds.size} កញ្ចប់ដែលបានជ្រើស`
                  : `បោះពុម្ពប័ណ្ណប្រតិបត្តិការ Manifest (${filteredScans.length} កញ្ចប់)`
              }
            >
              <Printer className={`w-3.5 h-3.5 ${selectedScanIds.size > 0 ? 'text-white' : 'text-cyan-600 dark:text-cyan-400'}`} />
              <span>
                {selectedScanIds.size > 0 ? `Print (${selectedScanIds.size})` : `Print (${filteredScans.length})`}
              </span>
            </button>

            {/* Export Operations to Excel for Filtered Items */}
            <button
              type="button"
              onClick={() => handleExportExcel()}
              disabled={filteredScans.length === 0 || isExportingExcel}
              className="h-8 px-2.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
              title={`ទាញយកប្រតិបត្តិការជា Excel (${filteredOperationGroups.length} ប្រតិបត្តិការ, ${filteredScans.length} កញ្ចប់)`}
            >
              {isExportingExcel ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              )}
              <span>Excel ({filteredOperationGroups.length})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto sm:ml-auto min-w-0">
            {/* Toggle Group by Operation */}
            {viewMode === 'table' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsGroupedByOperation(!isGroupedByOperation);
                    setExpandedOpCodes(new Set());
                    setCurrentPage(1);
                  }}
                  className={`h-8 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs whitespace-nowrap ${
                    isGroupedByOperation
                      ? 'border-purple-400 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                  title="បើក/បិទ ការរៀបជាក្រុមតាមលេខកូដប្រតិបត្តិការ (Group by Operation Code)"
                >
                  <FolderTree className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span className="hidden 2xl:inline">Group តាមប្រតិបត្តិការ:</span>
                  <span className="2xl:hidden">Group:</span>
                  <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.2 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200">
                    {isGroupedByOperation ? 'ON' : 'OFF'}
                  </span>
                </button>

                {isGroupedByOperation && paginatedOperations.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const allCodes = paginatedOperations.map((g) => g.operationCode);
                      const allAreExpanded = allCodes.every((c) => expandedOpCodes.has(c));
                      if (allAreExpanded) {
                        setExpandedOpCodes(new Set());
                      } else {
                        setExpandedOpCodes(new Set(allCodes));
                      }
                    }}
                    className="h-8 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 text-xs font-semibold cursor-pointer shadow-2xs flex items-center gap-1"
                    title="ពន្លាត / បង្រួម Barcodes នៃប្រតិបត្តិការទាំងអស់លើទំព័រនេះ"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${paginatedOperations.every((g) => expandedOpCodes.has(g.operationCode)) ? 'rotate-180' : ''}`} />
                    <span className="hidden md:inline">
                      {paginatedOperations.every((g) => expandedOpCodes.has(g.operationCode)) ? 'បង្រួមទាំងអស់' : 'ពន្លាតទាំងអស់'}
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="flex-1 sm:flex-none min-w-0 h-8 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs"
            >
              <option value="newest">ថ្មីបំផុត (Newest)</option>
              <option value="oldest">ចាស់បំផុត (Oldest)</option>
              <option value="barcode">តាម Barcode</option>
            </select>

            {/* View Mode Switcher (Table vs Card for iPad / Mobile) */}
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl text-xs shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-2xs'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title="ទម្រង់តារាង (Table View)"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-2xs'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title="ទម្រង់កាត (Card View - ស័ក្តិសមជាមួយ Mobile & iPad)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 🎯 DETAILED FILTER PANEL (Customized per Page/Function as requested by User) */}
      {isFilterPanelOpen && (
        <div className="bg-gradient-to-r from-slate-50 via-cyan-50/30 to-blue-50/30 dark:from-slate-900/90 dark:via-cyan-950/20 dark:to-blue-950/20 border border-slate-200/90 dark:border-slate-800/80 rounded-2xl p-3 sm:p-3.5 shadow-2xs space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60 dark:border-slate-800/60">
            <div className="flex items-center flex-wrap gap-2">
              <span className="w-6 h-6 rounded-lg bg-cyan-600 text-white flex items-center justify-center shadow-2xs">
                <Filter className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                ចម្រាញ់ទិន្នន័យ (Filters By Category)
              </span>

              {/* Tab-specific contextual badge */}
              <span
                className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold border shadow-2xs ${
                  activeTab === 'SCAN_IN'
                    ? 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-300 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300'
                    : activeTab === 'SCAN_OUT'
                    ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                    : activeTab === 'OUT_OF_DELIVERY'
                    ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                    : activeTab === 'RETURN_SHIPMENTS'
                    ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                    : activeTab === 'ARRIVED_HUB'
                    ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-300 dark:border-teal-800 text-teal-700 dark:text-teal-300'
                    : 'bg-purple-50 dark:bg-purple-950/50 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300'
                }`}
              >
                {activeTab === 'SCAN_IN' && 'តម្រងសម្រាប់: ចូលឃ្លាំង (ScanIn)'}
                {activeTab === 'SCAN_OUT' && 'តម្រងសម្រាប់: ចេញពីឃ្លាំង (ScanOut)'}
                {activeTab === 'OUT_OF_DELIVERY' && 'តម្រងសម្រាប់: ចេញចែកចាយ (Rider)'}
                {activeTab === 'HOLD_REMAINING' && 'តម្រងសម្រាប់: នៅសល់ក្នុងឃ្លាំង (Hold)'}
                {activeTab === 'ARRIVED_HUB' && 'តម្រងសម្រាប់: ទទួលចូលឃ្លាំង (Arrived Hub)'}
                {activeTab === 'RETURN_SHIPMENTS' && 'តម្រងសម្រាប់: បង្វិលត្រឡប់ (Return)'}
              </span>

              {activeFiltersCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300">
                  កំពុងប្រើ {activeFiltersCount} តម្រង
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                រកឃើញ: <strong className="text-cyan-700 dark:text-cyan-400 font-mono font-bold">{filteredScans.length}</strong> ជួរ
              </span>
              <button
                type="button"
                onClick={handlePrintFilteredManifest}
                disabled={filteredScans.length === 0}
                className="px-2.5 py-1 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                title="បោះពុម្ពប័ណ្ណប្រតិបត្តិការតាមតម្រងដែលបានជ្រើស"
              >
                <Printer className="w-3 h-3" />
                <span>បោះពុម្ព Manifest ({filteredScans.length})</span>
              </button>
              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-2.5 py-1 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shadow-2xs"
                  title="សម្អាតតម្រងទាំងអស់"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>សម្អាត (Reset)</span>
                </button>
              )}
            </div>
          </div>

          {/* 1. FILTER CONTROLS FOR SCAN_IN & SCAN_OUT (Destination, Driver, Truck, Branch Target, Date Range) */}
          {isTruckScanType(activeTab) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {/* Filter 1: ទីតាំង / ខេត្ត-ក្រុង * */}
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-cyan-600 shrink-0" />
                  <span>ទីតាំង / ខេត្ត-ក្រុង *</span>
                </label>
                <SearchableCombobox
                  value={filterDestination}
                  onChange={setFilterDestination}
                  options={uniqueFilterOptions.destinations}
                  allOptionLabel="-- ទីតាំង / ខេត្ត ទាំងអស់ --"
                  allOptionValue="ALL"
                  placeholder="ស្វែងរកខេត្ត-ក្រុង..."
                />
              </div>

              {/* Filter 2: Driver (អ្នកបើកបរ) */}
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <User className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span>Driver (អ្នកបើកបរ)</span>
                </label>
                <SearchableCombobox
                  value={filterDriver}
                  onChange={setFilterDriver}
                  options={uniqueFilterOptions.drivers}
                  allOptionLabel="-- Driver ទាំងអស់ --"
                  allOptionValue="ALL"
                  placeholder="ស្វែងរក Driver..."
                />
              </div>

              {/* Filter 3: Truck No */}
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Truck className="w-3 h-3 text-amber-600 shrink-0" />
                  <span>Truck No</span>
                </label>
                <SearchableCombobox
                  value={filterTruckNo}
                  onChange={setFilterTruckNo}
                  options={uniqueFilterOptions.trucks}
                  allOptionLabel="-- Truck No ទាំងអស់ --"
                  allOptionValue="ALL"
                  placeholder="ស្វែងរក Truck No..."
                  inputClassName="font-mono"
                />
              </div>

              {/* Filter 4: សាខា / ខេត្តគោលដៅ */}
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Navigation className="w-3 h-3 text-indigo-600 shrink-0" />
                  <span>សាខា / ខេត្តគោលដៅ</span>
                </label>
                <SearchableCombobox
                  value={filterBranchTarget}
                  onChange={setFilterBranchTarget}
                  options={uniqueFilterOptions.branchTargets}
                  allOptionLabel="-- សាខា / គោលដៅទាំងអស់ --"
                  allOptionValue="ALL"
                  placeholder="ស្វែងរកសាខា / គោលដៅ..."
                />
              </div>

              {/* Filter 5: កាលបរិច្ឆេទ (Start Date -> End Date) */}
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-rose-600 shrink-0" />
                  <span>កាលបរិច្ឆេទ (ចន្លោះថ្ងៃ)</span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full h-8 px-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[10.5px] font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs"
                    title="កាលបរិច្ឆេទចាប់ផ្តើម (Start Date)"
                  />
                  <span className="text-slate-400 text-xs">→</span>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full h-8 px-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[10.5px] font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs"
                    title="កាលបរិច្ឆេទបញ្ចប់ (End Date)"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 2. FILTER CONTROLS FOR OUT_OF_DELIVERY (Rider, Delivery Zone, Destination, Date Range) */}
          {activeTab === 'OUT_OF_DELIVERY' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* Filter 1: Rider (អ្នកដឹក) */}
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <PackageCheck className="w-3 h-3 text-blue-600 shrink-0" />
                  <span>Rider (អ្នកដឹក)</span>
                </label>
                <SearchableCombobox
                  value={filterRider}
                  onChange={setFilterRider}
                  options={uniqueFilterOptions.riders}
                  allOptionLabel="-- Rider ទាំងអស់ --"
                  allOptionValue="ALL"
                  placeholder="ស្វែងរក Rider..."
                />
              </div>

              {/* Filter 2: សាខា / តំបន់ដឹក (Zone) */}
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Navigation className="w-3 h-3 text-indigo-600 shrink-0" />
                  <span>សាខា / តំបន់ដឹក (Zone)</span>
                </label>
                <SearchableCombobox
                  value={filterBranchTarget}
                  onChange={setFilterBranchTarget}
                  options={uniqueFilterOptions.branchTargets}
                  allOptionLabel="-- សាខា / តំបន់ដឹក ទាំងអស់ --"
                  allOptionValue="ALL"
                  placeholder="ស្វែងរកតំបន់ដឹក / សាខា..."
                />
              </div>

              {/* Filter 3: ទីតាំង / ខេត្ត-ក្រុង */}
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-cyan-600 shrink-0" />
                  <span>ទីតាំង / ខេត្ត-ក្រុង</span>
                </label>
                <SearchableCombobox
                  value={filterDestination}
                  onChange={setFilterDestination}
                  options={uniqueFilterOptions.destinations}
                  allOptionLabel="-- ទីតាំង / ខេត្ត ទាំងអស់ --"
                  allOptionValue="ALL"
                  placeholder="ស្វែងរកទីតាំង / ខេត្ត..."
                />
              </div>

              {/* Filter 4: កាលបរិច្ឆេទ (Start Date -> End Date) */}
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-rose-600 shrink-0" />
                  <span>កាលបរិច្ឆេទ (ចន្លោះថ្ងៃ)</span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full h-8 px-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[10.5px] font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs"
                    title="កាលបរិច្ឆេទចាប់ផ្តើម (Start Date)"
                  />
                  <span className="text-slate-400 text-xs">→</span>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full h-8 px-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[10.5px] font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs"
                    title="កាលបរិច្ឆេទបញ្ចប់ (End Date)"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3. FILTER CONTROLS FOR HOLD_REMAINING (Hold Reason, Shelf Location, Date Range) */}
          {activeTab === 'HOLD_REMAINING' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {/* Filter 1: មូលហេតុនៅសល់ / ផ្អាក * */}
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-purple-600 shrink-0" />
                  <span>មូលហេតុនៅសល់ / ផ្អាក *</span>
                </label>
                <select
                  value={filterHoldReason}
                  onChange={(e) => setFilterHoldReason(e.target.value)}
                  className="w-full h-8 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs truncate"
                >
                  <option value="ALL">-- មូលហេតុទាំងអស់ --</option>
                  {uniqueFilterOptions.holdReasons.map((hr) => (
                    <option key={hr} value={hr}>
                      {hr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter 2: ធ្នើរ / កន្លែងទុក (Shelf Location) */}
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-purple-600 shrink-0" />
                  <span>ធ្នើរ / កន្លែងទុក (Shelf)</span>
                </label>
                <select
                  value={filterShelfLocation}
                  onChange={(e) => setFilterShelfLocation(e.target.value)}
                  className="w-full h-8 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs truncate"
                >
                  <option value="ALL">-- ធ្នើរទាំងអស់ --</option>
                  {uniqueFilterOptions.shelves.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter 3: កាលបរិច្ឆេទ (Start Date -> End Date) */}
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-rose-600 shrink-0" />
                  <span>កាលបរិច្ឆេទ (ចន្លោះថ្ងៃ)</span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full h-8 px-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[10.5px] font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs"
                    title="កាលបរិច្ឆេទចាប់ផ្តើម (Start Date)"
                  />
                  <span className="text-slate-400 text-xs">→</span>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full h-8 px-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[10.5px] font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs"
                    title="កាលបរិច្ឆេទបញ្ចប់ (End Date)"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 4. FILTER CONTROLS FOR RETURN_SHIPMENTS (Return Reason, Date Range) */}
          {activeTab === 'RETURN_SHIPMENTS' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                  <span>មូលហេតុបង្វិល</span>
                </label>
                <select
                  value={filterHoldReason}
                  onChange={(e) => setFilterHoldReason(e.target.value)}
                  className="w-full h-8 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs truncate"
                >
                  <option value="ALL">-- មូលហេតុទាំងអស់ --</option>
                  {uniqueFilterOptions.returnReasons.map((hr) => (
                    <option key={hr} value={hr}>
                      {hr}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-rose-600 shrink-0" />
                  <span>កាលបរិច្ឆេទ (ចន្លោះថ្ងៃ)</span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full h-8 px-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[10.5px] font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs"
                    title="កាលបរិច្ឆេទចាប់ផ្តើម (Start Date)"
                  />
                  <span className="text-slate-400 text-xs">→</span>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full h-8 px-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[10.5px] font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs"
                    title="កាលបរិច្ឆេទបញ្ចប់ (End Date)"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-bar for HOLD_REMAINING: Switch between Scanned Hold and Un-dispatched Items */}
      {activeTab === 'HOLD_REMAINING' && (
        <div className="bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-900/50 rounded-2xl p-2 sm:p-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shadow-2xs">
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setRemainingSubTab('SCANNED')}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer text-center ${
                remainingSubTab === 'SCANNED'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 hover:bg-purple-100/50'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>បានស្កេន ({scopedScans.filter((s) => s.scanType === 'HOLD_REMAINING').length})</span>
            </button>

            <button
              type="button"
              onClick={() => setRemainingSubTab('UNDISPATCHED')}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer text-center ${
                remainingSubTab === 'UNDISPATCHED'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100/50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>មិនទាន់ចេញ ({unDispatchedScanInItems.length})</span>
            </button>
          </div>

          <div className="text-[10.5px] sm:text-[11px] text-slate-500 dark:text-slate-400 text-center sm:text-left">
            {remainingSubTab === 'SCANNED'
              ? 'បង្ហាញអីវ៉ាន់ដែលបានស្កេន Update ថាត្រូវផ្អាកទុកក្នុងឃ្លាំង'
              : 'បង្ហាញបញ្ជីអីវ៉ាន់ដែល ScanIn រួច ប៉ុន្តែមិនទាន់ចេញសាខា ឬ Rider'}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📋 5. RESPONSIVE DATA DISPLAY (Table & Mobile Cards) */}
      {/* ========================================================================= */}
      {/* 🌟 Multi-Item Selection Action Banner */}
      {selectedScanIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-cyan-600 via-teal-600 to-blue-600 text-white shadow-md animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
              <CheckSquare className="w-4 h-4 text-white" />
            </span>
            <span className="text-xs font-bold tracking-tight">
              បានជ្រើសរើស <span className="underline decoration-cyan-300 decoration-2 font-mono text-sm">{selectedScanIds.size}</span> កញ្ចប់
            </span>
            {selectedScanIds.size < filteredScans.length && (
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-[11px] underline font-bold text-cyan-100 hover:text-white ml-2 transition cursor-pointer"
              >
                ជ្រើសរើសទាំងអស់ ({filteredScans.length} កញ្ចប់)
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <button
              type="button"
              onClick={handlePrintSelectedManifest}
              className="px-3 py-1.5 rounded-xl bg-white text-cyan-800 hover:bg-cyan-50 font-bold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
              title="បោះពុម្ពប័ណ្ណប្រតិបត្តិការសម្រាប់កញ្ចប់ដែលបានជ្រើស"
            >
              <Printer className="w-3.5 h-3.5 text-cyan-700" />
              <span>បោះពុម្ព Manifest ({selectedScanIds.size})</span>
            </button>

            {canDelete && (
              <button
                type="button"
                onClick={() => setShowBatchDeleteConfirm(true)}
                className="px-3 py-1.5 rounded-xl bg-red-500/90 hover:bg-red-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
                title="លុបកញ្ចប់ដែលបានជ្រើសទាំងអស់"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>លុប ({selectedScanIds.size})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleClearSelection}
              className="px-2.5 py-1.5 rounded-xl bg-black/20 hover:bg-black/30 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer"
              title="ដោះការជ្រើសរើសទាំងអស់"
            >
              <X className="w-3.5 h-3.5" />
              <span>ដោះជ្រើស</span>
            </button>
          </div>
        </div>
      )}

      {viewMode === 'table' ? (
        /* TABLE VIEW (Sticky Header & Sticky Barcode for smooth tablet scroll) */
        <div className="page-fill-body sb-grid-wrap">
          <div className="page-fill-scroll overflow-x-auto max-h-[68vh] custom-scrollbar">
            <table className="sb-grid w-full min-w-[960px] text-left">
              <thead className="sticky top-0 z-20">
                {isGroupedByOperation ? (
                  /* GROUPED BY OPERATION THEAD */
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[10px] whitespace-nowrap">
                    <th className="py-2.5 px-2.5 w-10 min-w-[40px] max-w-[40px] text-center md:sticky md:left-0 z-20 bg-slate-100 dark:bg-slate-900">
                      <input
                        type="checkbox"
                        checked={isAllCurrentPageSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = !isAllCurrentPageSelected && isSomeCurrentPageSelected;
                        }}
                        onChange={handleToggleSelectAllCurrentPage}
                        className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500 cursor-pointer transition"
                        title="ជ្រើសរើសទាំងអស់លើទំព័រនេះ"
                      />
                    </th>
                    <th className="py-2.5 px-2.5 w-10 min-w-[40px] max-w-[40px] text-center md:sticky md:left-10 z-20 bg-slate-100 dark:bg-slate-900">#</th>
                    <th className="py-2.5 px-3 min-w-[210px] whitespace-nowrap md:sticky md:left-20 z-20 bg-slate-100 dark:bg-slate-900 md:border-r md:border-slate-200/60 md:dark:border-slate-800/60 md:shadow-[2px_0_5px_rgba(0,0,0,0.03)] text-purple-700 dark:text-purple-300">
                      លេខកូដប្រតិបត្តិការ (Operation Code)
                    </th>
                    <th className="py-2.5 px-3 min-w-[140px] whitespace-nowrap">កាលបរិច្ឆេទ & ម៉ោង</th>
                    <th className="py-2.5 px-3 min-w-[150px]">អ្នកស្កេន</th>
                    {isTruckScanType(activeTab) && (
                      <>
                        <th className="py-2.5 px-3 min-w-[160px]">ORIGIN (ប្រភព) / DESTINATION (គោលដៅ)</th>
                        <th className="py-2.5 px-3 min-w-[150px]">Driver & Truck No</th>
                        {(activeTab === 'SCAN_IN' || (activeTab as string) === 'ALL') && (
                          <th className="py-2.5 px-3 min-w-[160px] text-teal-700 dark:text-teal-300">Transfer By (ដាក់តាមរយៈណា)</th>
                        )}
                      </>
                    )}
                    {isReasonScanType(activeTab) && (
                      <>
                        <th className="py-2.5 px-3 min-w-[200px]">{activeTab === 'RETURN_SHIPMENTS' ? 'មូលហេតុបង្វិល (Return Reason)' : 'មូលហេតុនៅសល់ក្នុងឃ្លាំង (Reason)'}</th>
                        {activeTab === 'HOLD_REMAINING' && <th className="py-2.5 px-3 min-w-[120px]">ធ្នើរ (Shelf)</th>}
                      </>
                    )}
                    {activeTab === 'OUT_OF_DELIVERY' && (
                      <>
                        <th className="py-2.5 px-3 min-w-[140px]">Rider / អ្នកដឹក</th>
                        <th className="py-2.5 px-3 min-w-[120px]">តំបន់ដឹក (Zone)</th>
                        <th className="py-2.5 px-3 min-w-[100px] text-right">សរុប COD</th>
                      </>
                    )}
                    <th className="py-2.5 px-3 min-w-[110px] text-center">ចំនួនកញ្ចប់</th>
                    <th className="py-2.5 px-2.5 w-24 min-w-[96px] text-center md:sticky md:right-0 z-20 bg-slate-100 dark:bg-slate-900 md:border-l md:border-slate-200/60 md:dark:border-slate-800/60">
                      សកម្មភាព
                    </th>
                  </tr>
                ) : (
                  /* FLAT LIST THEAD */
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[10px] whitespace-nowrap">
                    <th className="py-2.5 px-2.5 w-10 min-w-[40px] max-w-[40px] text-center md:sticky md:left-0 z-20 bg-slate-100 dark:bg-slate-900">
                      <input
                        type="checkbox"
                        checked={isAllCurrentPageSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = !isAllCurrentPageSelected && isSomeCurrentPageSelected;
                        }}
                        onChange={handleToggleSelectAllCurrentPage}
                        className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500 cursor-pointer transition"
                        title="ជ្រើសរើសទាំងអស់លើទំព័រនេះ"
                      />
                    </th>
                    <th className="py-2.5 px-2.5 w-10 min-w-[40px] max-w-[40px] text-center md:sticky md:left-10 z-20 bg-slate-100 dark:bg-slate-900">#</th>
                    <th className="py-2.5 px-3 w-px whitespace-nowrap md:sticky md:left-20 z-20 bg-slate-100 dark:bg-slate-900 md:border-r md:border-slate-200/60 md:dark:border-slate-800/60 md:shadow-[2px_0_5px_rgba(0,0,0,0.03)]">
                      Barcode / Tracking
                    </th>
                    {isTruckScanType(activeTab) && (
                      <>
                        <th className="py-2.5 px-3 min-w-[170px]">ORIGIN (ប្រភព) / DESTINATION (គោលដៅ)</th>
                        <th className="py-2.5 px-3 min-w-[150px]">Driver & Truck No</th>
                        {(activeTab === 'SCAN_IN' || (activeTab as string) === 'ALL') && (
                          <th className="py-2.5 px-3 min-w-[160px] text-teal-700 dark:text-teal-300">Transfer By (ដាក់តាមរយៈណា)</th>
                        )}
                      </>
                    )}
                    {isReasonScanType(activeTab) && (
                      <>
                        <th className="py-2.5 px-3 min-w-[220px]">{activeTab === 'RETURN_SHIPMENTS' ? 'មូលហេតុបង្វិល (Return Reason)' : 'មូលហេតុនៅសល់ក្នុងឃ្លាំង (Reason)'}</th>
                        {activeTab === 'HOLD_REMAINING' && <th className="py-2.5 px-3 min-w-[130px]">ធ្នើរ / កន្លែងទុក (Shelf)</th>}
                      </>
                    )}
                    {activeTab === 'OUT_OF_DELIVERY' && (
                      <>
                        <th className="py-2.5 px-3 min-w-[150px]">Rider / អ្នកដឹក</th>
                        <th className="py-2.5 px-3 min-w-[120px]">តំបន់ / Route</th>
                        <th className="py-2.5 px-3 min-w-[100px] text-right">COD</th>
                      </>
                    )}
                    <th className="py-2.5 px-3 min-w-[140px] whitespace-nowrap">កាលបរិច្ឆេទ & ម៉ោង</th>
                    <th className="py-2.5 px-3 min-w-[150px]">អ្នកស្កេន</th>
                    {(activeTab === 'OUT_OF_DELIVERY' || isReasonScanType(activeTab)) && (
                      <th className="py-2.5 px-3 min-w-[130px]">ចំណាំ</th>
                    )}
                    <th className="py-2.5 px-2.5 w-24 min-w-[96px] text-center md:sticky md:right-0 z-20 bg-slate-100 dark:bg-slate-900 md:border-l md:border-slate-200/60 md:dark:border-slate-800/60">
                      សកម្មភាព
                    </th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                {isLoading ? (
                  <tr>
                    <td colSpan={activeTab === 'SCAN_IN' || (activeTab as string) === 'ALL' ? 14 : 13} className="py-10 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-600" />
                      <span>កំពុងទាញយកទិន្នន័យ...</span>
                    </td>
                  </tr>
                ) : isGroupedByOperation ? (
                  paginatedOperations.length === 0 ? (
                    <tr>
                      <td colSpan={activeTab === 'SCAN_IN' || (activeTab as string) === 'ALL' ? 14 : 13} className="py-10 text-center text-slate-400">
                        <Boxes className="w-7 h-7 mx-auto mb-1.5 opacity-30" />
                        <p className="font-semibold text-slate-500 dark:text-slate-400 text-xs">
                          {activeTab === 'HOLD_REMAINING' && remainingSubTab === 'UNDISPATCHED'
                            ? 'អបអរសាទរ! មិនមានអីវ៉ាន់កកស្ទះមិនទាន់ចេញឡើយ (Un-dispatched is 0)'
                            : 'មិនទាន់មានទិន្នន័យស្កេនក្នុងបញ្ជីនេះឡើយ'}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {activeTab === 'HOLD_REMAINING' && remainingSubTab === 'UNDISPATCHED'
                            ? 'រាល់អីវ៉ាន់ទាំងអស់ដែល ScanIn បានចេញទៅសាខា ឬតាម Rider រួចរាល់អស់ហើយ'
                            : 'សូមស្កេន ឬវាយបញ្ចូល Barcode ក្នុង Form ខាងលើដើម្បីបន្ថែមទិន្នន័យ'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedOperations.map((group, groupIdx) => {
                      const isGroupAllSelected = group.items.length > 0 && group.items.every((it) => selectedScanIds.has(it.id));
                      const isGroupSomeSelected = group.items.some((it) => selectedScanIds.has(it.id));
                      const isExpanded = expandedOpCodes.has(group.operationCode);
                      const globalGroupIdx = (currentPage - 1) * pageSize + groupIdx + 1;
                      const firstItem = group.items[0];
                      const displayDateTime = firstItem?.createdAt ? formatCreatedAt(firstItem.createdAt) : group.date;

                      // ScanOut: how much of this OP-OUT the destination hub has received (Arrived Hub)
                      const arrival = (() => {
                        if (group.scanType !== 'SCAN_OUT') return null;
                        const expected = new Set(group.items.map((it) => (it.barcode || '').toUpperCase()).filter(Boolean));
                        const received = arrivedReceivedByOp.get(group.operationCode);
                        let count = 0;
                        expected.forEach((b) => {
                          if (received?.has(b)) count++;
                        });
                        const total = expected.size;
                        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                        if (total > 0 && count >= total) {
                          return {
                            count, total, pct,
                            label: `ទទួលគ្រប់ ${count}/${total}`,
                            icon: '✅',
                            chip: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
                            badge: 'bg-emerald-600 text-white',
                            bar: 'bg-emerald-500'
                          };
                        }
                        if (count > 0) {
                          return {
                            count, total, pct,
                            label: `ទទួលបាន ${count}/${total} • ខ្វះ ${total - count}`,
                            icon: '🟡',
                            chip: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700',
                            badge: 'bg-amber-500 text-white',
                            bar: 'bg-amber-500'
                          };
                        }
                        return {
                          count, total, pct,
                          label: 'មិនទាន់ទទួល',
                          icon: '⏳',
                          chip: 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600',
                          badge: 'bg-slate-500 text-white',
                          bar: 'bg-slate-400'
                        };
                      })();

                      return (
                        <React.Fragment key={group.operationCode}>
                          <tr
                            className={`transition group border-b border-slate-200/80 dark:border-slate-800/80 ${
                              isGroupAllSelected
                                ? 'bg-purple-50/70 dark:bg-purple-950/40 hover:bg-purple-100/70 dark:hover:bg-purple-900/50'
                                : isExpanded
                                ? 'bg-slate-50/90 dark:bg-slate-800/60 hover:bg-slate-100/80 dark:hover:bg-slate-800/90'
                                : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            {/* Checkbox */}
                            <td className="py-2.5 px-2.5 w-10 min-w-[40px] max-w-[40px] text-center md:sticky md:left-0 z-10 bg-white dark:bg-[#0c1424] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80">
                              <input
                                type="checkbox"
                                checked={isGroupAllSelected}
                                ref={(el) => {
                                  if (el) el.indeterminate = !isGroupAllSelected && isGroupSomeSelected;
                                }}
                                onChange={() => {
                                  setSelectedScanIds((prev) => {
                                    const next = new Set(prev);
                                    if (isGroupAllSelected) {
                                      group.items.forEach((it) => next.delete(it.id));
                                    } else {
                                      group.items.forEach((it) => next.add(it.id));
                                    }
                                    return next;
                                  });
                                }}
                                className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500 cursor-pointer transition"
                                title={`ជ្រើសរើសទាំងអស់ក្នុងប្រតិបត្តិការ ${group.operationCode}`}
                              />
                            </td>

                            {/* # Index */}
                            <td className="py-2.5 px-2.5 w-10 min-w-[40px] max-w-[40px] text-center text-slate-400 font-mono text-[11px] md:sticky md:left-10 z-10 bg-white dark:bg-[#0c1424] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80">
                              {globalGroupIdx}
                            </td>

                            {/* Operation Code */}
                            <td className="py-2.5 px-3 min-w-[210px] whitespace-nowrap md:sticky md:left-20 z-10 bg-white dark:bg-[#0c1424] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 md:border-r md:border-slate-200/60 md:dark:border-slate-800/60 md:shadow-[2px_0_5px_rgba(0,0,0,0.03)]">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleExpandOpCode(group.operationCode)}
                                  className={`p-1 rounded-md transition cursor-pointer ${
                                    isExpanded
                                      ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300'
                                      : 'text-slate-400 hover:text-purple-600 hover:bg-slate-200 dark:hover:bg-slate-700'
                                  }`}
                                  title={isExpanded ? 'បង្រួម Barcode' : 'ពន្លាតមើល Barcode ទាំងអស់'}
                                >
                                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-purple-600' : ''}`} />
                                </button>
                                <span
                                  className={`font-mono font-bold text-xs px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                                    arrival ? arrival.chip : 'bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border-purple-200/70 dark:border-purple-800/70'
                                  }`}
                                  title={arrival ? `Arrived Hub: ${arrival.label}` : undefined}
                                >
                                  {arrival ? (
                                    <span className="shrink-0 text-[11px] leading-none">{arrival.icon}</span>
                                  ) : (
                                    <FolderTree className="w-3 h-3 text-purple-600 dark:text-purple-400 shrink-0" />
                                  )}
                                  <span>{group.operationCode}</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(group.operationCode);
                                    setCopiedId(`op_${group.operationCode}`);
                                    setTimeout(() => setCopiedId(null), 1500);
                                  }}
                                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 cursor-pointer shrink-0"
                                  title="Copy Operation Code"
                                >
                                  {copiedId === `op_${group.operationCode}` ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                              {group.scanType === 'ARRIVED_HUB' && (() => {
                                const sources = Array.from(new Set(group.items.map((it) => it.sourceOperationCode).filter(Boolean)));
                                const unexpectedCount = group.items.filter((it) => it.arrivalStatus === 'UNEXPECTED').length;
                                return (
                                  <div className="mt-1 ml-8 flex items-center gap-1.5 text-[10.5px]">
                                    {sources.length > 0 && (
                                      <span className="font-mono text-teal-700 dark:text-teal-300" title="ទទួលពីប្រតិបត្តិការ ScanOut">
                                        ← {sources.join(', ')}
                                      </span>
                                    )}
                                    {unexpectedCount > 0 && (
                                      <span className="px-1.5 py-0.2 rounded-full font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300">
                                        ⚠ លើស {unexpectedCount}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                              {arrival && (
                                <div className="mt-1 ml-8 flex items-center gap-1.5 text-[10.5px]" title="ស្ថានភាពទទួលនៅ Arrived Hub">
                                  <span className={`px-1.5 py-0.5 rounded-md font-bold whitespace-nowrap ${arrival.badge}`}>
                                    {arrival.icon} {arrival.label}
                                  </span>
                                  <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0">
                                    <div className={`h-full ${arrival.bar}`} style={{ width: `${arrival.pct}%` }} />
                                  </div>
                                  <span className="font-mono font-bold text-slate-500 dark:text-slate-400">{arrival.pct}%</span>
                                </div>
                              )}
                            </td>

                            {/* Date & Time */}
                            <td className="py-2.5 px-3 whitespace-nowrap font-mono text-xs text-slate-700 dark:text-slate-300 font-medium">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{displayDateTime}</span>
                              </div>
                            </td>

                            {/* Operator */}
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 text-xs truncate max-w-[170px]" title={group.operatorName || ''}>
                              <div className="flex items-center gap-1">
                                <User className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{group.operatorName || '—'}</span>
                              </div>
                            </td>

                            {/* Destination and Driver/Truck for ScanIn and ScanOut */}
                            {isTruckScanType(activeTab) && (
                              <>
                                <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                                  {group.destination ? (
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 text-xs"
                                      title={group.destination}
                                    >
                                      <MapPin className="w-3 h-3 text-cyan-600 dark:text-cyan-400 shrink-0" />
                                      <span className="truncate max-w-[200px] xl:max-w-[300px]">{group.destination}</span>
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                  {group.origin && (
                                    <div className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400 whitespace-nowrap" title="ORIGIN (ប្រភព)">
                                      ពី: <span className="font-semibold text-slate-700 dark:text-slate-300">{group.origin}</span>
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                                  {group.driverName || group.truckNo ? (
                                    <div className="flex flex-col whitespace-nowrap gap-0.5">
                                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                                        {group.driverName || '—'}
                                      </span>
                                      {group.truckNo && (
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                          🚛 {group.truckNo}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                {(activeTab === 'SCAN_IN' || (activeTab as string) === 'ALL') && (
                                  <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                                    {group.transferBy ? (
                                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800/60 text-xs font-bold text-teal-700 dark:text-teal-300">
                                        <ArrowRightLeft className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                                        <span>{group.transferBy}</span>
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 italic text-xs">—</span>
                                    )}
                                  </td>
                                )}
                              </>
                            )}

                            {/* Reason, Shelf for Hold Remaining */}
                            {isReasonScanType(activeTab) && (
                              <>
                                <td className="py-2.5 px-3">
                                  {group.holdReason ? (
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60 text-xs font-semibold"
                                      title={group.holdReason}
                                    >
                                      <AlertCircle className="w-3 h-3 text-purple-600 shrink-0" />
                                      <span className="truncate max-w-[240px] xl:max-w-[360px]">{group.holdReason}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-xs">—</span>
                                  )}
                                </td>
                                {activeTab === 'HOLD_REMAINING' && (
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    {group.shelfLocation ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 text-xs font-bold">
                                        <Archive className="w-3 h-3 text-amber-600 shrink-0" />
                                        <span>{group.shelfLocation}</span>
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 text-xs">—</span>
                                    )}
                                  </td>
                                )}
                              </>
                            )}

                            {/* Out of Delivery columns */}
                            {activeTab === 'OUT_OF_DELIVERY' && (
                              <>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <div className="font-bold text-blue-700 dark:text-blue-300">
                                    {group.riderName || '—'}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  {group.deliveryZone ? (
                                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                                      {group.deliveryZone}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                  {group.totalCOD ? (
                                    group.items[0]?.currency === 'KHR'
                                      ? `${group.totalCOD.toLocaleString()} ៛`
                                      : `$${group.totalCOD.toFixed(2)}`
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              </>
                            )}

                            {/* Total item count */}
                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => toggleExpandOpCode(group.operationCode)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100 dark:hover:bg-cyan-900 transition cursor-pointer"
                                title="ចុចដើម្បីពន្លាត/បង្រួម Barcode"
                              >
                                <Boxes className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                                <span>{group.items.length} កញ្ចប់</span>
                              </button>
                            </td>

                            {/* Actions */}
                            <td className="py-2.5 px-2.5 w-40 min-w-[160px] text-center md:sticky md:right-0 z-10 bg-white dark:bg-[#0c1424] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 md:border-l md:border-slate-200/60 md:dark:border-slate-800/60 whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handlePrintOperationByCode(group.operationCode)}
                                  className="p-2 bg-cyan-50 dark:bg-cyan-950/40 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 rounded-lg transition cursor-pointer"
                                  title={`បោះពុម្ពប័ណ្ណប្រតិបត្តិការ (${group.operationCode})`}
                                >
                                  <Printer className="w-[18px] h-[18px]" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleExportExcel([group], group.operationCode)}
                                  disabled={isExportingExcel}
                                  className="p-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 rounded-lg transition cursor-pointer disabled:opacity-50"
                                  title={`ទាញយកប្រតិបត្តិការជា Excel (${group.operationCode})`}
                                >
                                  <FileSpreadsheet className="w-[18px] h-[18px]" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleExpandOpCode(group.operationCode)}
                                  className="p-2 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-600 dark:text-purple-400 hover:text-purple-700 rounded-lg transition cursor-pointer"
                                  title={isExpanded ? 'បង្រួម Barcode' : 'ពន្លាតមើល Barcode'}
                                >
                                  <ChevronDown className={`w-[18px] h-[18px] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>
                                {canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmDeleteGroup(group)}
                                    className="p-2 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-500 dark:text-red-400 hover:text-red-700 rounded-lg transition cursor-pointer"
                                    title={`លុបប្រតិបត្តិការ ${group.operationCode} (${group.items.length} កញ្ចប់)`}
                                  >
                                    <Trash2 className="w-[18px] h-[18px]" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Nested Sub-Table of Barcodes for this Operation */}
                          {isExpanded && (
                            <tr className="bg-slate-50/80 dark:bg-slate-900/40 border-b border-purple-100 dark:border-purple-900/30">
                              <td colSpan={activeTab === 'SCAN_IN' || (activeTab as string) === 'ALL' ? 14 : 13} className="p-3 pl-8 sm:pl-12">
                                <div className="bg-white dark:bg-[#0c1424] rounded-xl border border-purple-200/80 dark:border-purple-800/60 shadow-xs overflow-hidden">
                                  <div className="p-2 sm:p-2.5 bg-gradient-to-r from-purple-50/90 to-cyan-50/70 dark:from-purple-950/40 dark:to-cyan-950/30 border-b border-purple-100 dark:border-purple-900/40 flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                      <FolderTree className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                      <span className="font-bold text-slate-800 dark:text-slate-200">
                                        បញ្ជី Barcode ក្នុងប្រតិបត្តិការ <span className="font-mono text-purple-700 dark:text-purple-300">{group.operationCode}</span>
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                                        {group.items.length} កញ្ចប់
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handlePrintOperationByCode(group.operationCode)}
                                        className="px-2 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                                      >
                                        <Printer className="w-3 h-3" />
                                        <span>ព្រីន Manifest ({group.items.length})</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleExportExcel([group], group.operationCode)}
                                        disabled={isExportingExcel}
                                        className="px-2 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 transition cursor-pointer flex items-center gap-1 shadow-2xs disabled:opacity-50"
                                      >
                                        <FileSpreadsheet className="w-3 h-3" />
                                        <span>Excel</span>
                                      </button>
                                    </div>
                                  </div>
                                  <div className="overflow-x-auto max-h-[40vh] custom-scrollbar">
                                    <table className="sb-grid w-full text-left">
                                      <thead>
                                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                          <th className="py-2 px-2.5 w-10 text-center">
                                            <input
                                              type="checkbox"
                                              checked={isGroupAllSelected}
                                              ref={(el) => {
                                                if (el) el.indeterminate = !isGroupAllSelected && isGroupSomeSelected;
                                              }}
                                              onChange={() => {
                                                setSelectedScanIds((prev) => {
                                                  const next = new Set(prev);
                                                  if (isGroupAllSelected) {
                                                    group.items.forEach((it) => next.delete(it.id));
                                                  } else {
                                                    group.items.forEach((it) => next.add(it.id));
                                                  }
                                                  return next;
                                                });
                                              }}
                                              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                                            />
                                          </th>
                                          <th className="py-2 px-2.5 w-10 text-center font-mono">#</th>
                                          <th className="py-2 px-3">BARCODE / TRACKING</th>
                                          {isTruckScanType(activeTab) && (
                                            <>
                                              <th className="py-2 px-3">ORIGIN (ប្រភព) / DESTINATION (គោលដៅ)</th>
                                              <th className="py-2 px-3">Driver & Truck No</th>
                                              {(activeTab === 'SCAN_IN' || (activeTab as string) === 'ALL') && (
                                                <th className="py-2 px-3 text-teal-700 dark:text-teal-300">Transfer By (ដាក់តាមរយៈណា)</th>
                                              )}
                                            </>
                                          )}
                                          {isReasonScanType(activeTab) && (
                                            <>
                                              <th className="py-2 px-3">{activeTab === 'RETURN_SHIPMENTS' ? 'មូលហេតុបង្វិល (Return Reason)' : 'មូលហេតុនៅសល់ក្នុងឃ្លាំង (Reason)'}</th>
                                              {activeTab === 'HOLD_REMAINING' && <th className="py-2 px-3">ធ្នើរ / កន្លែងទុក (Shelf)</th>}
                                            </>
                                          )}
                                          {activeTab === 'OUT_OF_DELIVERY' && (
                                            <>
                                              <th className="py-2 px-3">Rider / អ្នកដឹក</th>
                                              <th className="py-2 px-3">តំបន់ / Route</th>
                                              <th className="py-2 px-3 text-right">COD</th>
                                            </>
                                          )}
                                          {(activeTab === 'OUT_OF_DELIVERY' || isReasonScanType(activeTab)) && (
                                            <th className="py-2 px-3">ចំណាំ</th>
                                          )}
                                          {group.scanType === 'SCAN_OUT' && (
                                            <th className="py-2 px-3 whitespace-nowrap">ស្ថានភាពទទួល (Arrived)</th>
                                          )}
                                          <th className="py-2 px-3">កាលបរិច្ឆេទ & ម៉ោង</th>
                                          <th className="py-2 px-2.5 text-center w-20">សកម្មភាព</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                                        {group.items.map((item, itemIdx) => (
                                          <tr
                                            key={item.id}
                                            className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                                              selectedScanIds.has(item.id) ? 'bg-cyan-50/60 dark:bg-cyan-950/30' : ''
                                            }`}
                                          >
                                            <td className="py-2 px-2.5 text-center">
                                              <input
                                                type="checkbox"
                                                checked={selectedScanIds.has(item.id)}
                                                onChange={() => handleToggleSelect(item.id)}
                                                className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                                              />
                                            </td>
                                            <td className="py-2 px-2.5 text-center text-slate-400 font-mono text-[11px]">
                                              {itemIdx + 1}
                                            </td>
                                            <td className="py-2 px-3 whitespace-nowrap font-roboto font-bold text-slate-900 dark:text-white">
                                              <div className="flex items-center gap-1.5 w-max">
                                                <span>{item.barcode}</span>
                                                {item.arrivalStatus === 'UNEXPECTED' && (
                                                  <span
                                                    className="px-1.5 py-0.2 rounded-full text-[9.5px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 font-sans"
                                                    title="Barcode នេះមិនមានក្នុងបញ្ជី ScanOut ដែលបានទទួល"
                                                  >
                                                    ⚠ លើស/ខុសបញ្ជី
                                                  </span>
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    navigator.clipboard.writeText(item.barcode);
                                                    setCopiedId(item.id);
                                                    setTimeout(() => setCopiedId(null), 1500);
                                                  }}
                                                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 cursor-pointer shrink-0"
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
                                            {isTruckScanType(activeTab) && (
                                              <>
                                                <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                                                  {item.destination ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-xs">
                                                      <MapPin className="w-3 h-3 text-cyan-600 shrink-0" />
                                                      <span>{item.destination}</span>
                                                    </span>
                                                  ) : (
                                                    '—'
                                                  )}
                                                  {item.origin && (
                                                    <div className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400 whitespace-nowrap" title="ORIGIN (ប្រភព)">
                                                      ពី: <span className="font-semibold text-slate-700 dark:text-slate-300">{item.origin}</span>
                                                    </div>
                                                  )}
                                                </td>
                                                <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                                                  {item.driverName || item.truckNo ? (
                                                    <div className="flex flex-col whitespace-nowrap gap-0.5">
                                                      <span className="font-semibold">{item.driverName || '—'}</span>
                                                      {item.truckNo && (
                                                        <span className="text-[10px] text-slate-500 font-mono">
                                                          🚛 {item.truckNo}
                                                        </span>
                                                      )}
                                                    </div>
                                                  ) : (
                                                    '—'
                                                  )}
                                                </td>
                                                {(activeTab === 'SCAN_IN' || (activeTab as string) === 'ALL') && (
                                                  <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                                                    {item.transferBy ? (
                                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800/60 text-[11px] font-bold text-teal-700 dark:text-teal-300">
                                                        <ArrowRightLeft className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                                                        <span>{item.transferBy}</span>
                                                      </span>
                                                    ) : (
                                                      <span className="text-slate-400 italic text-[11px]">—</span>
                                                    )}
                                                  </td>
                                                )}
                                              </>
                                            )}
                                            {isReasonScanType(activeTab) && (
                                              <>
                                                <td className="py-2 px-3">
                                                  {item.holdReason ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60 text-xs font-semibold">
                                                      <AlertCircle className="w-3 h-3 text-purple-600 shrink-0" />
                                                      <span>{item.holdReason}</span>
                                                    </span>
                                                  ) : (
                                                    '—'
                                                  )}
                                                </td>
                                                {activeTab === 'HOLD_REMAINING' && (
                                                  <td className="py-2 px-3 whitespace-nowrap">
                                                    {item.shelfLocation ? (
                                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200/60 text-xs font-bold">
                                                        <Archive className="w-3 h-3 text-amber-600 shrink-0" />
                                                        <span>{item.shelfLocation}</span>
                                                      </span>
                                                    ) : (
                                                      '—'
                                                    )}
                                                  </td>
                                                )}
                                              </>
                                            )}
                                            {activeTab === 'OUT_OF_DELIVERY' && (
                                              <>
                                                <td className="py-2 px-3 font-bold text-blue-700 dark:text-blue-300 whitespace-nowrap">
                                                  {item.riderName || '—'}
                                                </td>
                                                <td className="py-2 px-3 whitespace-nowrap">
                                                  {item.deliveryZone ? (
                                                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                                                      {item.deliveryZone}
                                                    </span>
                                                  ) : (
                                                    '—'
                                                  )}
                                                </td>
                                                <td className="py-2 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                                  {item.codAmount !== undefined ? (
                                                    item.currency === 'KHR'
                                                      ? `${item.codAmount.toLocaleString()} ៛`
                                                      : `$${item.codAmount.toFixed(2)}`
                                                  ) : (
                                                    '—'
                                                  )}
                                                </td>
                                              </>
                                            )}
                                            {(activeTab === 'OUT_OF_DELIVERY' || isReasonScanType(activeTab)) && (
                                              <td className="py-2 px-3 text-slate-500 text-[11px] truncate max-w-[150px]" title={item.remarks || ''}>
                                                {item.remarks || '—'}
                                              </td>
                                            )}
                                            {group.scanType === 'SCAN_OUT' && (() => {
                                              const receipt = arrivedScansByOp.get(group.operationCode)?.get((item.barcode || '').toUpperCase());
                                              return (
                                                <td className="py-2 px-3 whitespace-nowrap">
                                                  {receipt ? (
                                                    <div className="flex flex-col gap-0.5">
                                                      <span className="w-max px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-emerald-600 text-white">
                                                        ✓ បានទទួល
                                                      </span>
                                                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                                        {receipt.createdAt ? formatCreatedAt(receipt.createdAt) : receipt.date}
                                                        {receipt.createdBy ? ` • ${receipt.createdBy}` : ''}
                                                      </span>
                                                    </div>
                                                  ) : (
                                                    <span className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                                      ⏳ មិនទាន់ទទួល
                                                    </span>
                                                  )}
                                                </td>
                                              );
                                            })()}
                                            <td className="py-2 px-3 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                              {item.createdAt ? formatCreatedAt(item.createdAt) : item.date}
                                            </td>
                                            <td className="py-2 px-2.5 text-center whitespace-nowrap">
                                              <div className="flex items-center justify-center gap-1">
                                                {canEdit && (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleEditItem(item)}
                                                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-cyan-600 rounded-lg transition cursor-pointer"
                                                    title="កែប្រែ"
                                                  >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                  </button>
                                                )}
                                                {canDelete && (
                                                  <button
                                                    type="button"
                                                    onClick={() => setItemToDelete(item)}
                                                    className="p-1 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-500 hover:text-red-600 rounded-lg transition cursor-pointer"
                                                    title="លុប"
                                                  >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                  </button>
                                                )}
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )
                ) : (
                  /* Flat list when isGroupedByOperation is false */
                  paginatedScans.length === 0 ? (
                    <tr>
                      <td colSpan={activeTab === 'SCAN_IN' || (activeTab as string) === 'ALL' ? 14 : 13} className="py-10 text-center text-slate-400">
                        <Boxes className="w-7 h-7 mx-auto mb-1.5 opacity-30" />
                        <p className="font-semibold text-slate-500 dark:text-slate-400 text-xs">
                          {activeTab === 'HOLD_REMAINING' && remainingSubTab === 'UNDISPATCHED'
                            ? 'អបអរសាទរ! មិនមានអីវ៉ាន់កកស្ទះមិនទាន់ចេញឡើយ (Un-dispatched is 0)'
                            : 'មិនទាន់មានទិន្នន័យស្កេនក្នុងបញ្ជីនេះឡើយ'}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {activeTab === 'HOLD_REMAINING' && remainingSubTab === 'UNDISPATCHED'
                            ? 'រាល់អីវ៉ាន់ទាំងអស់ដែល ScanIn បានចេញទៅសាខា ឬតាម Rider រួចរាល់អស់ហើយ'
                            : 'សូមស្កេន ឬវាយបញ្ចូល Barcode ក្នុង Form ខាងលើដើម្បីបន្ថែមទិន្នន័យ'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedScans.map((item, idx) => {
                      const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                      return (
                        <tr
                          key={item.id}
                          className={`transition group ${
                            selectedScanIds.has(item.id)
                              ? 'bg-cyan-50/70 dark:bg-cyan-950/40 hover:bg-cyan-100/70 dark:hover:bg-cyan-900/50'
                              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-2 px-2.5 w-10 min-w-[40px] max-w-[40px] text-center md:sticky md:left-0 z-10 bg-white dark:bg-[#0c1424] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80">
                            <input
                              type="checkbox"
                              checked={selectedScanIds.has(item.id)}
                              onChange={() => handleToggleSelect(item.id)}
                              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500 cursor-pointer transition"
                            />
                          </td>
                          <td className="py-2 px-2.5 w-10 min-w-[40px] max-w-[40px] text-center text-slate-400 font-mono text-[11px] md:sticky md:left-10 z-10 bg-white dark:bg-[#0c1424] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80">
                            {globalIdx}
                          </td>
                          <td className="py-2 px-3 w-px whitespace-nowrap font-roboto text-[14px] font-bold text-slate-900 dark:text-white md:sticky md:left-20 z-10 bg-white dark:bg-[#0c1424] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 md:border-r md:border-slate-200/60 md:dark:border-slate-800/60 md:shadow-[2px_0_5px_rgba(0,0,0,0.03)]">
                            <div className="flex items-center gap-1.5 w-max">
                              <span>{item.barcode}</span>
                              {item.arrivalStatus === 'UNEXPECTED' && (
                                <span
                                  className="px-1.5 py-0.2 rounded-full text-[9.5px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 font-sans"
                                  title="Barcode នេះមិនមានក្នុងបញ្ជី ScanOut ដែលបានទទួល"
                                >
                                  ⚠ លើស/ខុសបញ្ជី
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(item.barcode);
                                  setCopiedId(item.id);
                                  setTimeout(() => setCopiedId(null), 1500);
                                }}
                                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 cursor-pointer shrink-0"
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

                          {/* Destination and Driver/Truck for ScanIn and ScanOut */}
                          {isTruckScanType(activeTab) && (
                            <>
                              <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                                {item.destination ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 text-xs"
                                    title={item.destination}
                                  >
                                    <MapPin className="w-3 h-3 text-cyan-600 dark:text-cyan-400 shrink-0" />
                                    <span className="truncate max-w-[220px] xl:max-w-[320px] 2xl:max-w-none">{item.destination}</span>
                                  </span>
                                ) : (
                                  '—'
                                )}
                                {item.origin && (
                                  <div className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400 whitespace-nowrap" title="ORIGIN (ប្រភព)">
                                    ពី: <span className="font-semibold text-slate-700 dark:text-slate-300">{item.origin}</span>
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                                {item.driverName || item.truckNo ? (
                                  <div className="flex flex-col whitespace-nowrap gap-0.5">
                                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                                      {item.driverName || '—'}
                                    </span>
                                    {item.truckNo && (
                                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                        🚛 {item.truckNo}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              {(activeTab === 'SCAN_IN' || (activeTab as string) === 'ALL') && (
                                <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                                  {item.transferBy ? (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800/60 text-xs font-bold text-teal-700 dark:text-teal-300">
                                      <ArrowRightLeft className="w-3 h-3 text-teal-600 dark:text-teal-400 shrink-0" />
                                      <span>{item.transferBy}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 italic text-xs">—</span>
                                  )}
                                </td>
                              )}
                            </>
                          )}

                          {/* Reason, Shelf for Hold Remaining */}
                          {isReasonScanType(activeTab) && (
                            <>
                              <td className="py-2 px-3">
                                {item.holdReason ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60 text-xs font-semibold"
                                    title={item.holdReason}
                                  >
                                    <AlertCircle className="w-3 h-3 text-purple-600 shrink-0" />
                                    <span className="truncate max-w-[240px] xl:max-w-[360px] 2xl:max-w-none">{item.holdReason}</span>
                                  </span>
                                ) : remainingSubTab === 'UNDISPATCHED' ? (
                                  <span className="text-[11px] text-rose-500 dark:text-rose-400 font-bold whitespace-nowrap">
                                    មិនទាន់ ScanOut / Rider
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-xs">—</span>
                                )}
                              </td>
                              {activeTab === 'HOLD_REMAINING' && (
                                <td className="py-2 px-3 whitespace-nowrap">
                                  {item.shelfLocation ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 text-xs font-bold">
                                      <Archive className="w-3 h-3 text-amber-600 shrink-0" />
                                      <span>{item.shelfLocation}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-xs">—</span>
                                  )}
                                </td>
                              )}
                            </>
                          )}

                          {/* Out of Delivery columns */}
                          {activeTab === 'OUT_OF_DELIVERY' && (
                            <>
                              <td className="py-2 px-3 whitespace-nowrap">
                                <div className="font-bold text-blue-700 dark:text-blue-300">
                                  {item.riderName || '—'}
                                </div>
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                {item.deliveryZone ? (
                                  <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs">
                                    {item.deliveryZone}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
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

                          <td className="py-2 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap font-mono text-xs">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-700 dark:text-slate-200">{item.date}</span>
                                {item.createdAt && formatCreatedAt(item.createdAt).slice(11) && formatCreatedAt(item.createdAt).slice(11) !== '—' && (
                                  <span className="text-[11px] text-slate-400">
                                    {formatCreatedAt(item.createdAt).slice(11)}
                                  </span>
                                )}
                              </div>
                              {/* Operation Code badge */}
                              {(() => {
                                const opCode = getOperationCode(item, scans);
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handlePrintOperationByCode(opCode)}
                                    className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900 border border-cyan-200/60 dark:border-cyan-800/60 w-max cursor-pointer transition"
                                    title={`ចុចដើម្បីព្រីនប្រតិបត្តិការ ${opCode}`}
                                  >
                                    <span>{opCode}</span>
                                  </button>
                                );
                              })()}
                            </div>
                          </td>
                          <td
                            className="py-2 px-3 text-slate-600 dark:text-slate-400 text-[11px] truncate max-w-[160px] xl:max-w-[240px] 2xl:max-w-none"
                            title={item.operatorEmail || item.createdBy || ''}
                          >
                            {item.operatorEmail || item.createdBy || '—'}
                          </td>
                          {(activeTab === 'OUT_OF_DELIVERY' || isReasonScanType(activeTab)) && (
                            <td
                              className="py-2 px-3 text-slate-500 text-[11px] truncate max-w-[150px] xl:max-w-[240px] 2xl:max-w-none"
                              title={item.remarks || ''}
                            >
                              {item.remarks || '—'}
                            </td>
                          )}
                          <td className="py-2 px-2.5 w-24 min-w-[96px] text-center md:sticky md:right-0 z-10 bg-white dark:bg-[#0c1424] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 md:border-l md:border-slate-200/60 md:dark:border-slate-800/60 whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              {activeTab === 'HOLD_REMAINING' && remainingSubTab === 'UNDISPATCHED' ? (
                                <button
                                  type="button"
                                  onClick={() => handleQuickUpdateHold(item)}
                                  className="px-2 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-rose-600 text-white text-[11px] font-bold hover:from-purple-700 hover:to-rose-700 transition flex items-center gap-1 cursor-pointer shadow-xs whitespace-nowrap"
                                  title="ស្កេន Update នៅសល់ក្នុងឃ្លាំង"
                                >
                                  <PackageCheck className="w-3 h-3" />
                                  <span>Update នៅសល់</span>
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handlePrintOperationByCode(getOperationCode(item, scans))}
                                    className="p-1 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 text-slate-400 hover:text-cyan-600 rounded-lg transition cursor-pointer"
                                    title={`បោះពុម្ពប័ណ្ណប្រតិបត្តិការ (${getOperationCode(item, scans)})`}
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                  </button>
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => handleEditItem(item)}
                                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-cyan-600 rounded-lg transition cursor-pointer"
                                      title="កែប្រែ"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button
                                      type="button"
                                      onClick={() => setItemToDelete(item)}
                                      className="p-1 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-500 hover:text-red-600 rounded-lg transition cursor-pointer"
                                      title="លុប"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="p-2 sm:p-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px]">
                ទំព័រ {currentPage} / {totalPages} (
                {isGroupedByOperation
                  ? `សរុប ${filteredOperationGroups.length} ប្រតិបត្តិការ — ${filteredScans.length} កញ្ចប់`
                  : `សរុប ${filteredScans.length} ជួរ`}
                )
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* CARD VIEW (Ultra convenient for Mobile & iPad touch devices) */
        <div className="space-y-3">
          {isLoading ? (
            <div className="py-12 text-center text-slate-400 bg-white dark:bg-[#0c1424] rounded-2xl border border-slate-200 dark:border-slate-800">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-600" />
              <span>កំពុងទាញយកទិន្នន័យ...</span>
            </div>
          ) : paginatedScans.length === 0 ? (
            <div className="py-12 text-center text-slate-400 bg-white dark:bg-[#0c1424] rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <Boxes className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="font-semibold text-slate-500 dark:text-slate-400 text-xs">
                {activeTab === 'HOLD_REMAINING' && remainingSubTab === 'UNDISPATCHED'
                  ? 'អបអរសាទរ! មិនមានអីវ៉ាន់កកស្ទះមិនទាន់ចេញឡើយ (Un-dispatched is 0)'
                  : 'មិនទាន់មានទិន្នន័យស្កេនក្នុងបញ្ជីនេះឡើយ'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
              {paginatedScans.map((item, idx) => {
                const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                const opCode = getOperationCode(item, scans);
                const isSelected = selectedScanIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`bg-white dark:bg-[#0c1424] border rounded-xl p-3 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-2 ${
                      isSelected
                        ? 'border-cyan-500 ring-2 ring-cyan-500/30 bg-cyan-50/20 dark:bg-cyan-950/20'
                        : 'border-slate-200/90 dark:border-slate-800/80 hover:border-cyan-400/50'
                    }`}
                  >
                    {/* Card Top: Select Checkbox + Index + Barcode + Copy + Status Pill */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500 cursor-pointer transition shrink-0"
                        />
                        <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                          {globalIdx}
                        </span>
                        <span className="font-mono font-black text-[13.5px] text-slate-900 dark:text-white tracking-tight truncate select-all">
                          {item.barcode}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(item.barcode);
                            setCopiedId(item.id);
                            setTimeout(() => setCopiedId(null), 1500);
                          }}
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer shrink-0 transition"
                          title="Copy Barcode"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[2.5]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <span
                        className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                          item.scanType === 'SCAN_IN'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/50'
                            : item.scanType === 'SCAN_OUT'
                            ? 'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50'
                            : item.scanType === 'HOLD_REMAINING'
                            ? 'bg-purple-50 text-purple-700 border-purple-200/70 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800/50'
                            : item.scanType === 'RETURN_SHIPMENTS'
                            ? 'bg-rose-50 text-rose-700 border-rose-200/70 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/50'
                            : item.scanType === 'ARRIVED_HUB'
                            ? 'bg-teal-50 text-teal-700 border-teal-200/70 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800/50'
                            : 'bg-blue-50 text-blue-700 border-blue-200/70 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/50'
                        }`}
                      >
                        {item.scanType === 'SCAN_IN'
                          ? 'ScanIn'
                          : item.scanType === 'SCAN_OUT'
                          ? 'ScanOut'
                          : item.scanType === 'HOLD_REMAINING'
                          ? 'Hold នៅសល់'
                          : item.scanType === 'RETURN_SHIPMENTS'
                          ? 'Return'
                          : item.scanType === 'ARRIVED_HUB'
                          ? item.arrivalStatus === 'UNEXPECTED' ? 'Arrived ⚠ លើស' : 'Arrived'
                          : 'Rider'}
                      </span>
                    </div>

                    {/* Card Middle: Key Info */}
                    <div className="space-y-1.5 text-xs border-t border-slate-100 dark:border-slate-800/80 pt-2">
                      {isTruckScanType(activeTab) && (
                        <>
                          <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                            <MapPin className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                            <span className="font-bold text-[12px] truncate">{item.destination || '—'}</span>
                          </div>
                          {(item.driverName || item.truckNo || item.transferBy) && (
                            <div className="flex items-center flex-wrap gap-1.5 text-[11px]">
                              {item.driverName && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-medium">
                                  <User className="w-3 h-3 text-slate-400" />
                                  <span className="truncate max-w-[110px]">{item.driverName}</span>
                                </span>
                              )}
                              {item.truckNo && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 font-mono font-semibold border border-cyan-200/50">
                                  <Truck className="w-3 h-3 text-cyan-500" />
                                  <span>{item.truckNo}</span>
                                </span>
                              )}
                              {item.transferBy && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-semibold border border-teal-200/50">
                                  <span>By: {item.transferBy}</span>
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {isReasonScanType(activeTab) && (
                        <>
                          {item.holdReason && (
                            <div className="flex items-start gap-1.5 text-[11px] text-purple-900 dark:text-purple-200 font-medium bg-gradient-to-r from-purple-50/90 to-indigo-50/60 dark:from-purple-950/40 dark:to-indigo-950/30 p-2 rounded-lg border border-purple-200/70 dark:border-purple-800/50 leading-snug">
                              <AlertTriangle className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                              <span className="break-words line-clamp-2">{item.holdReason}</span>
                            </div>
                          )}
                          {item.shelfLocation && (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                              <Archive className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>ទីតាំង៖ {item.shelfLocation}</span>
                            </div>
                          )}
                          {item.remarks && (
                            <div className="text-[10.5px] text-slate-500 dark:text-slate-400 italic truncate bg-slate-50 dark:bg-slate-900/60 px-2 py-0.5 rounded border border-slate-100 dark:border-slate-800/60">
                              "{item.remarks}"
                            </div>
                          )}
                        </>
                      )}

                      {activeTab === 'OUT_OF_DELIVERY' && (
                        <>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-blue-700 dark:text-blue-300 truncate max-w-[130px]">
                              🚴 {item.riderName || '—'}
                            </span>
                            {item.codAmount !== undefined && (
                              <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60">
                                COD: {item.currency === 'KHR' ? `${item.codAmount.toLocaleString()} ៛` : `$${item.codAmount.toFixed(2)}`}
                              </span>
                            )}
                          </div>
                          {item.deliveryZone && (
                            <div className="text-[11px] text-slate-500">
                              Zone: <span className="font-semibold text-slate-700 dark:text-slate-300">{item.deliveryZone}</span>
                            </div>
                          )}
                        </>
                      )}

                      {/* Timestamp & Operator */}
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{item.date} {formatCreatedAt(item.createdAt).slice(11)}</span>
                        </div>
                        <span
                          className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[120px]"
                          title={item.operatorEmail || item.createdBy || ''}
                        >
                          <User className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                          {(item.operatorEmail || item.createdBy || '').split('@')[0]}
                        </span>
                      </div>
                    </div>

                    {/* Card Bottom: OpCode Badge + Actions */}
                    <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                      {/* Left: Compact OpCode Badge */}
                      <span
                        className="font-mono text-[9px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200/70 dark:border-slate-800 truncate max-w-[110px]"
                        title={opCode}
                      >
                        {opCode}
                      </span>

                      {/* Right: Crisp Action Buttons with whitespace-nowrap */}
                      <div className="flex items-center gap-1 shrink-0">
                        {activeTab === 'HOLD_REMAINING' && remainingSubTab === 'UNDISPATCHED' ? (
                          <button
                            type="button"
                            onClick={() => handleQuickUpdateHold(item)}
                            className="h-6.5 px-2 rounded-lg bg-gradient-to-r from-purple-600 to-rose-600 text-white text-[10.5px] font-bold hover:from-purple-700 hover:to-rose-700 transition flex items-center gap-1 cursor-pointer shadow-2xs whitespace-nowrap"
                          >
                            <PackageCheck className="w-3 h-3" />
                            <span>Update នៅសល់</span>
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handlePrintOperationByCode(opCode)}
                              className="h-6 px-1.5 rounded-md bg-cyan-50/80 hover:bg-cyan-100 dark:bg-cyan-950/50 dark:hover:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200/70 dark:border-cyan-800/50 text-[10.5px] font-bold transition flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              title={`បោះពុម្ពប័ណ្ណប្រតិបត្តិការ (${opCode})`}
                            >
                              <Printer className="w-3 h-3 text-cyan-600" />
                              <span>Print</span>
                            </button>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => handleEditItem(item)}
                                className="h-6 px-1.5 rounded-md bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700/60 text-[10.5px] font-semibold transition flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <Edit2 className="w-3 h-3 text-blue-600" />
                                <span>កែប្រែ</span>
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => setItemToDelete(item)}
                                className="h-6 px-1.5 rounded-md bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/50 text-[10.5px] font-semibold transition flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <Trash2 className="w-3 h-3 text-rose-600" />
                                <span>លុប</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Cards Pagination */}
          {totalPages > 1 && (
            <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c1424] flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px]">
                ទំព័រ {currentPage} / {totalPages} ({filteredScans.length} កាត)
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-sm w-full rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  បញ្ជាក់ការលុបជាក្រុម
                </h3>
                <p className="text-xs text-slate-500">
                  តើអ្នកប្រាកដជាចង់លុបទិន្នន័យដែលបានជ្រើសរើសមែនទេ?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">ចំនួនកញ្ចប់ត្រូវលុប: </span>
                <span className="font-mono font-bold text-red-600 text-sm">
                  {selectedScanIds.size} កញ្ចប់
                </span>
              </div>
              <p className="text-[10px] text-red-500 mt-1">
                ⚠️ សកម្មភាពនេះមិនអាចត្រឡប់ក្រោយវិញបានទេ!
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isBatchDeleting}
                onClick={() => setShowBatchDeleteConfirm(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                បោះបង់
              </button>
              <button
                type="button"
                disabled={isBatchDeleting}
                onClick={handleConfirmBatchDelete}
                className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isBatchDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isBatchDeleting ? 'កំពុងលុប...' : `លុប (${selectedScanIds.size})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Warehouse Scans Confirmation Modal */}
      {showClearAllConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-sm w-full rounded-2xl border border-rose-200 dark:border-rose-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  សម្អាតទិន្នន័យឃ្លាំងទាំងអស់
                </h3>
                <p className="text-xs text-slate-500">
                  តើអ្នកប្រាកដជាចង់សម្អាតទិន្នន័យស្កេនទាំងអស់ ({scans.length} កញ្ចប់) មែនទេ?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40 text-xs space-y-1">
              <p className="text-slate-700 dark:text-slate-300 font-medium">
                ទិន្នន័យទាំងអស់នឹងត្រូវលុបចេញពីប្រព័ន្ធ និង Cache ទាំងស្រុង ១០០%។
              </p>
              <p className="text-[10px] text-rose-600 font-semibold mt-1">
                ⚠️ សកម្មភាពនេះមិនអាចត្រឡប់ក្រោយវិញបានទេ!
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isClearingAll}
                onClick={() => setShowClearAllConfirm(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                បោះបង់
              </button>
              <button
                type="button"
                disabled={isClearingAll}
                onClick={handleConfirmClearAll}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isClearingAll ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isClearingAll ? 'កំពុងសម្អាត...' : 'សម្អាតទាំងអស់'}</span>
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
            existingBarcodes={batchQueue.map((b) => b.barcode)}
            onScanSuccess={(code) => {
              return handleAddBarcodeToBatch(code);
            }}
            autoCloseOnScan={false}
            totalScannedCount={batchQueue.length}
          />
        </React.Suspense>
      )}

      {/* Batch Manifest Print Modal */}
      {isManifestModalOpen && (
        <BatchManifestModal
          isOpen={isManifestModalOpen}
          onClose={() => {
            setIsManifestModalOpen(false);
            setManifestData(null);
          }}
          scanType={manifestData ? manifestData.scanType : activeTab}
          items={manifestData ? manifestData.items : batchQueue}
          date={manifestData ? manifestData.date : scanDate}
          destination={manifestData ? manifestData.destination : destination}
          driverName={manifestData ? manifestData.driverName : (isTruckScanType(activeTab) ? driverName : undefined)}
          truckNo={manifestData ? manifestData.truckNo : (isTruckScanType(activeTab) ? truckNo : undefined)}
          transferBy={manifestData ? manifestData.transferBy : (activeTab === 'SCAN_IN' ? transferBy : undefined)}
          riderName={manifestData ? manifestData.riderName : (activeTab === 'OUT_OF_DELIVERY' ? riderName : undefined)}
          deliveryZone={manifestData ? manifestData.deliveryZone : (activeTab === 'OUT_OF_DELIVERY' ? deliveryZone : undefined)}
          holdReason={manifestData ? manifestData.holdReason : (isReasonScanType(activeTab) ? holdReason : undefined)}
          shelfLocation={manifestData ? manifestData.shelfLocation : (activeTab === 'HOLD_REMAINING' ? shelfLocation : undefined)}
          operatorName={manifestData?.operatorName || currentUser?.name || currentUser?.email}
          operationCode={manifestData?.operationCode}
        />
      )}

      {/* 🖨️ Operation Batch Print Selector Modal (When clicking Print with multiple operations) */}
      {isOpPrintModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#0c1424] max-w-xl w-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-cyan-500/10 via-teal-500/10 to-transparent flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-cyan-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
                  <Printer className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    ជ្រើសរើសប្រតិបត្តិការដើម្បីបោះពុម្ព (Print Operation)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                    <span>រកឃើញ {filteredOperationGroups.length} ប្រតិបត្តិការ ក្នុងចំណោម {filteredScans.length} កញ្ចប់</span>
                    <span className="font-semibold text-cyan-600 dark:text-cyan-400">
                      ({dateFilter === 'TODAY' ? 'ថ្ងៃនេះ' : dateFilter === 'ALL' ? 'ទាំងអស់' : dateFilter === 'YESTERDAY' ? 'ម្សិលមិញ' : 'ខែនេះ'})
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Date quick filter pills */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[10.5px]">
                  <button
                    type="button"
                    onClick={() => setDateFilter('TODAY')}
                    className={`px-2 py-0.5 rounded-md font-bold transition cursor-pointer ${
                      dateFilter === 'TODAY'
                        ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    ថ្ងៃនេះ
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilter('ALL')}
                    className={`px-2 py-0.5 rounded-md font-bold transition cursor-pointer ${
                      dateFilter === 'ALL'
                        ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    ទាំងអស់
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpPrintModalOpen(false)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: List of Operations */}
            <div className="p-3.5 sm:p-4 overflow-y-auto space-y-2.5 max-h-[60vh]">
              {filteredOperationGroups.length === 0 && (
                <div className="p-8 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                    <Printer className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    មិនមានទិន្នន័យប្រតិបត្តិការសម្រាប់{dateFilter === 'TODAY' ? 'ថ្ងៃនេះ' : 'ការស្វែងរកនេះ'}ឡើយ
                  </p>
                  {dateFilter === 'TODAY' && (
                    <button
                      type="button"
                      onClick={() => setDateFilter('ALL')}
                      className="px-3 py-1 rounded-lg text-xs font-bold bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100 transition cursor-pointer"
                    >
                      👉 បង្ហាញទិន្នន័យទាំងអស់ (Show All)
                    </button>
                  )}
                </div>
              )}

              {filteredOperationGroups.length > 0 && (
                <>
                  {/* Option to Print All Combined */}
                  <div className="p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-between gap-2 hover:border-cyan-400 transition">
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <span>🗂️ បោះពុម្ពរួមបញ្ចូលគ្នាទាំងអស់ (Print All Combined)</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        បោះពុម្ពរាល់ទិន្នន័យដែលកំពុងបង្ហាញ ({filteredScans.length} កញ្ចប់) ក្នុង Manifest តែមួយ
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpPrintModalOpen(false);
                        handlePrintFilteredManifest();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>បោះពុម្ពទាំងអស់</span>
                    </button>
                  </div>

                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 pt-1 uppercase tracking-wider">
                    ឬជ្រើសរើសតាមលេខកូដប្រតិបត្តិការនីមួយៗ (Individual Operations)៖
                  </div>
                </>
              )}

              {filteredOperationGroups.map((group, idx) => (
                <div
                  key={group.operationCode}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-cyan-400 dark:hover:border-cyan-600 transition shadow-2xs flex items-center justify-between gap-3 group"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-5 h-5 rounded-md bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-mono text-xs font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/40 px-2 py-0.5 rounded-md border border-cyan-200/60 dark:border-cyan-800/60">
                        {group.operationCode}
                      </span>
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                        {group.items.length} កញ្ចប់
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 flex-wrap">
                      {group.riderName && (
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          🚴 {group.riderName} {group.deliveryZone ? `(${group.deliveryZone})` : ''}
                        </span>
                      )}
                      {(group.driverName || group.truckNo) && (
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          👤 {group.driverName || '—'} {group.truckNo ? `🚛 ${group.truckNo}` : ''}
                        </span>
                      )}
                      {group.destination && (
                        <span className="text-slate-500 truncate max-w-[180px]">
                          📍 {group.destination}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 ml-auto">
                        ⏰ {group.timeStr || ''} ({group.date})
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePrintOperation(group)}
                    className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-cyan-600/20 cursor-pointer shrink-0 active:scale-95"
                    title={`បោះពុម្ពប្រតិបត្តិការ ${group.operationCode}`}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print ({group.items.length})</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsOpPrintModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
              >
                បិទ
              </button>
            </div>
          </div>
        </div>
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🏭 STATION MODE MODAL (Lock Device to Specific Warehouse Station) */}
      {/* ========================================================================= */}
      {isStationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-slate-100/60 dark:from-slate-900 dark:to-slate-800/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>កំណត់ Station Mode (ចាក់សោម៉ាស៊ីន)</span>
                    {stationLock !== 'ALL' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-700">
                        🔒 កំពុងចាក់សោ
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    កំណត់មុខងារជាក់លាក់សម្រាប់កុំព្យូទ័រ/ឧបករណ៍នេះ ដើម្បីកុំឱ្យច្រឡំចុចប្តូរ Tab និងជៀសវាងស្កេនជាន់គ្នា
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsStationModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Station Options */}
            <div className="p-4 sm:p-5 space-y-2.5 max-h-[70vh] overflow-y-auto">
              {(['ALL', 'SCAN_IN', 'SCAN_OUT', 'OUT_OF_DELIVERY', 'HOLD_REMAINING', 'ARRIVED_HUB', 'RETURN_SHIPMENTS'] as StationLockMode[]).map((mode) => {
                const info = STATION_INFO[mode];
                const isSelected = stationLock === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setStationLock(mode)}
                    className={`w-full text-left p-3.5 rounded-xl border transition flex items-start gap-3 cursor-pointer group ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/30 ring-2 ring-amber-500/20 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {mode === 'ALL' ? (
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${isSelected ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                          <Unlock className="w-4 h-4" />
                        </div>
                      ) : mode === 'SCAN_IN' ? (
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${isSelected ? 'bg-emerald-600 text-white' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'}`}>
                          <ArrowDownToLine className="w-4 h-4" />
                        </div>
                      ) : mode === 'SCAN_OUT' ? (
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${isSelected ? 'bg-amber-600 text-white' : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'}`}>
                          <ArrowUpFromLine className="w-4 h-4" />
                        </div>
                      ) : mode === 'OUT_OF_DELIVERY' ? (
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${isSelected ? 'bg-blue-600 text-white' : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'}`}>
                          <Truck className="w-4 h-4" />
                        </div>
                      ) : mode === 'ARRIVED_HUB' ? (
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${isSelected ? 'bg-teal-600 text-white' : 'bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300'}`}>
                          <PackageOpen className="w-4 h-4" />
                        </div>
                      ) : mode === 'RETURN_SHIPMENTS' ? (
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${isSelected ? 'bg-rose-600 text-white' : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'}`}>
                          <Undo2 className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${isSelected ? 'bg-purple-600 text-white' : 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'}`}>
                          <PackageCheck className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{info.label}</span>
                        </div>
                        {isSelected && (
                          <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-700">
                            <Check className="w-3 h-3" />
                            <span>កំពុងប្រើ</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {info.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                💾 ការកំណត់នេះនឹងត្រូវចងចាំលើ Browser នៃម៉ាស៊ីននេះ
              </span>
              <button
                type="button"
                onClick={() => setIsStationModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 text-xs font-bold transition cursor-pointer"
              >
                យល់ព្រម
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
