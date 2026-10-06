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
  ExternalLink,
  User,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  PackageCheck,
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
  Zap
} from 'lucide-react';
import { WarehouseScanItem, WarehouseScanType, AuthUser, UserPermission, AppSettings, Payer } from '../types';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import {
  canOperateWarehouse,
  canCreateWarehouseScan,
  canEditWarehouseScan,
  canDeleteWarehouseScan,
  getInitialWarehouseScans,
  saveWarehouseScan,
  saveWarehouseScanBatch,
  deleteWarehouseScan,
  subscribeToWarehouseScans,
  syncLocalWarehouseScansToFirestore,
  syncAllWarehouseScansToGoogleSheets,
  lookupTrackingFromDataReport,
  MatchedDataReportInfo
} from '../services/warehouseScanService';
import { CodeViewerModal, CODE_GS_CONTENT } from './CodeViewerModal';
import { BatchManifestModal, ManifestItem } from './BatchManifestModal';
import { canUserAccessPage, canUserViewAllData } from '../services/userPermissionService';
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

// Warning beep for duplicate or error
function playWarningBeep() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, audioCtx.currentTime);
    osc.frequency.setValueAtTime(220, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
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

/**
 * Get or compute a unique, readable operation code for any warehouse scan item
 * Standard Format: OP-{TYPE}-{YYMMDD}-{SERIAL} (e.g. OP-OUT-261005-001)
 */
export function getOperationCode(item: WarehouseScanItem, allScans?: WarehouseScanItem[]): string {
  if (item.operationCode && item.operationCode.trim()) {
    return item.operationCode.trim();
  }
  if (item.batchId && item.batchId.trim()) {
    return item.batchId.trim();
  }

  // Deterministic fallback based on scanType, date, and batch grouping key
  const d = item.createdAt ? new Date(item.createdAt) : new Date(item.date || Date.now());
  const yymmdd = (item.date || d.toISOString().slice(0, 10)).replace(/-/g, '').slice(2);
  const prefix = item.scanType === 'SCAN_IN' ? 'IN' : item.scanType === 'SCAN_OUT' ? 'OUT' : item.scanType === 'OUT_OF_DELIVERY' ? 'DLV' : 'HLD';

  // Group items belonging to the same operation batch (same scanType, same date, same minute & driver/rider/truck)
  const timeMinute = item.createdAt ? item.createdAt.slice(11, 16) : '00:00';
  let entityKey = '';
  if (item.scanType === 'OUT_OF_DELIVERY') {
    entityKey = (item.riderName || '').trim();
  } else if (item.scanType === 'SCAN_IN' || item.scanType === 'SCAN_OUT') {
    entityKey = `${item.driverName || ''}_${item.truckNo || ''}_${item.destination || ''}`;
  } else if (item.scanType === 'HOLD_REMAINING') {
    entityKey = `${item.shelfLocation || ''}_${item.holdReason || ''}`;
  }

  // If allScans is available, compute the 3-digit serial order for this day and scanType
  if (allScans && allScans.length > 0) {
    const dayItemDate = item.date || d.toISOString().slice(0, 10);
    const dayBatches = new Set<string>();
    const sortedSameDay = allScans
      .filter((s) => s.scanType === item.scanType && (s.date === dayItemDate || (s.createdAt && s.createdAt.slice(0, 10) === dayItemDate)))
      .sort((a, b) => (a.createdAt || a.date || '').localeCompare(b.createdAt || b.date || ''));

    for (const s of sortedSameDay) {
      if (s.operationCode && s.operationCode.startsWith(`OP-${prefix}-${yymmdd}-`)) {
        dayBatches.add(s.operationCode);
      } else {
        const sTime = s.createdAt ? s.createdAt.slice(11, 16) : '00:00';
        let sEntity = '';
        if (s.scanType === 'OUT_OF_DELIVERY') sEntity = (s.riderName || '').trim();
        else if (s.scanType === 'SCAN_IN' || s.scanType === 'SCAN_OUT') sEntity = `${s.driverName || ''}_${s.truckNo || ''}_${s.destination || ''}`;
        else if (s.scanType === 'HOLD_REMAINING') sEntity = `${s.shelfLocation || ''}_${s.holdReason || ''}`;
        dayBatches.add(`BATCH_${sTime}_${sEntity}`);
      }
    }

    const batchList = Array.from(dayBatches);
    const myKey = `BATCH_${timeMinute}_${entityKey}`;
    const foundIdx = batchList.indexOf(myKey);
    const serialNum = (foundIdx >= 0 ? foundIdx + 1 : 1).toString().padStart(3, '0');
    return `OP-${prefix}-${yymmdd}-${serialNum}`;
  }

  return `OP-${prefix}-${yymmdd}-001`;
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
      destination: first.destination,
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
  onClear
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
    <div className={`relative w-full ${className}`} ref={containerRef}>
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
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">{item.label || item.value}</span>
                        {(item.subLabel || item.phone) && (
                          <span className="text-[10px] text-slate-400 font-normal">
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
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">{item.label || item.value}</span>
                            {(item.subLabel || item.phone) && (
                              <span className="text-[10px] text-slate-400 font-normal">
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

interface WarehouseManagementPageProps {
  currentUser?: AuthUser | null;
  permissions?: UserPermission[];
  settings?: AppSettings;
  payers?: Payer[];
  initialTab?: WarehouseScanType;
  onTabChange?: (tab: WarehouseScanType) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateToDataReport?: () => void;
}

export const WarehouseManagementPage: React.FC<WarehouseManagementPageProps> = ({
  currentUser,
  permissions,
  settings,
  payers = [],
  initialTab,
  onTabChange,
  onShowToast
}) => {
  // Permission checks for the 4 separated tabs
  const canAccessScanIn = useMemo(() => canUserAccessPage('SCAN_IN', currentUser, permissions), [currentUser, permissions]);
  const canAccessScanOut = useMemo(() => canUserAccessPage('SCAN_OUT', currentUser, permissions), [currentUser, permissions]);
  const canAccessOutOfDelivery = useMemo(() => canUserAccessPage('OUT_OF_DELIVERY', currentUser, permissions), [currentUser, permissions]);
  const canAccessHold = useMemo(() => canUserAccessPage('HOLD_REMAINING', currentUser, permissions), [currentUser, permissions]);

  // Compute default tab based on URL hash, initialTab, localStorage and access rights
  const getDefaultTab = (): WarehouseScanType => {
    // Check URL Hash first
    const hash = window.location.hash.replace('#', '').toUpperCase();
    if (hash === 'SCAN_IN' && canAccessScanIn) return 'SCAN_IN';
    if (hash === 'SCAN_OUT' && canAccessScanOut) return 'SCAN_OUT';
    if (hash === 'OUT_OF_DELIVERY' && canAccessOutOfDelivery) return 'OUT_OF_DELIVERY';
    if (hash === 'HOLD_REMAINING' && canAccessHold) return 'HOLD_REMAINING';

    if (initialTab) {
      if (initialTab === 'SCAN_IN' && canAccessScanIn) return 'SCAN_IN';
      if (initialTab === 'SCAN_OUT' && canAccessScanOut) return 'SCAN_OUT';
      if (initialTab === 'OUT_OF_DELIVERY' && canAccessOutOfDelivery) return 'OUT_OF_DELIVERY';
      if (initialTab === 'HOLD_REMAINING' && canAccessHold) return 'HOLD_REMAINING';
    }

    const savedTab = localStorage.getItem('warehouse_active_tab') as WarehouseScanType | null;
    if (savedTab) {
      if (savedTab === 'SCAN_IN' && canAccessScanIn) return 'SCAN_IN';
      if (savedTab === 'SCAN_OUT' && canAccessScanOut) return 'SCAN_OUT';
      if (savedTab === 'OUT_OF_DELIVERY' && canAccessOutOfDelivery) return 'OUT_OF_DELIVERY';
      if (savedTab === 'HOLD_REMAINING' && canAccessHold) return 'HOLD_REMAINING';
    }

    if (canAccessScanIn) return 'SCAN_IN';
    if (canAccessScanOut) return 'SCAN_OUT';
    if (canAccessOutOfDelivery) return 'OUT_OF_DELIVERY';
    if (canAccessHold) return 'HOLD_REMAINING';
    return 'SCAN_IN';
  };

  // 1. Data State
  const [scans, setScans] = useState<WarehouseScanItem[]>(() => getInitialWarehouseScans());
  const [isLoading, setIsLoading] = useState<boolean>(false);

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
    setActiveTabState(tab);
    localStorage.setItem('warehouse_active_tab', tab);
    localStorage.setItem('accounting_current_view', tab);
    window.history.replaceState(null, '', `#${tab.toLowerCase()}`);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  // Sync activeTab when initialTab or permissions change
  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTabState(initialTab);
      localStorage.setItem('warehouse_active_tab', initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (activeTab === 'SCAN_IN' && !canAccessScanIn) {
      if (canAccessScanOut) setActiveTab('SCAN_OUT');
      else if (canAccessOutOfDelivery) setActiveTab('OUT_OF_DELIVERY');
      else if (canAccessHold) setActiveTab('HOLD_REMAINING');
    } else if (activeTab === 'SCAN_OUT' && !canAccessScanOut) {
      if (canAccessScanIn) setActiveTab('SCAN_IN');
      else if (canAccessOutOfDelivery) setActiveTab('OUT_OF_DELIVERY');
      else if (canAccessHold) setActiveTab('HOLD_REMAINING');
    } else if (activeTab === 'OUT_OF_DELIVERY' && !canAccessOutOfDelivery) {
      if (canAccessScanIn) setActiveTab('SCAN_IN');
      else if (canAccessScanOut) setActiveTab('SCAN_OUT');
      else if (canAccessHold) setActiveTab('HOLD_REMAINING');
    } else if (activeTab === 'HOLD_REMAINING' && !canAccessHold) {
      if (canAccessScanIn) setActiveTab('SCAN_IN');
      else if (canAccessScanOut) setActiveTab('SCAN_OUT');
      else if (canAccessOutOfDelivery) setActiveTab('OUT_OF_DELIVERY');
    }
  }, [activeTab, canAccessScanIn, canAccessScanOut, canAccessOutOfDelivery, canAccessHold]);

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
  const [isFormOpen, setIsFormOpen] = useState<boolean>(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [driverName, setDriverName] = useState<string>('');
  const [truckNo, setTruckNo] = useState<string>('');
  const [codAmount, setCodAmount] = useState<string>('');
  const [currency, setCurrency] = useState<'USD' | 'KHR'>('USD');
  const [riderName, setRiderName] = useState<string>('');
  const [deliveryZone, setDeliveryZone] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [holdReason, setHoldReason] = useState<string>(HOLD_REASONS[0]);
  const [shelfLocation, setShelfLocation] = useState<string>('');
  const [scanDate, setScanDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [autoMatched, setAutoMatched] = useState<boolean>(false);
  const [matchedPreview, setMatchedPreview] = useState<MatchedDataReportInfo | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [remainingSubTab, setRemainingSubTab] = useState<'SCANNED' | 'UNDISPATCHED'>('SCANNED');
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
    const list: ComboboxOptionItem[] = [];

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
      return truckModelOptions.map((m) => ({
        value: m,
        label: m
      }));
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
  const [batchQueue, setBatchQueue] = useState<ManifestItem[]>([]);
  const batchQueueRef = useRef<ManifestItem[]>([]);
  useEffect(() => {
    batchQueueRef.current = batchQueue;
  }, [batchQueue]);
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

  // Items that were scanned in (SCAN_IN) but have NOT been dispatched (not in SCAN_OUT or OUT_OF_DELIVERY)
  const unDispatchedScanInItems = useMemo(() => {
    const scanIns = scopedScans.filter((s) => s.scanType === 'SCAN_IN');
    const map = new Map<string, WarehouseScanItem>();
    scanIns.forEach((item) => {
      const key = (item.barcode || item.tracking || '').toUpperCase();
      if (key && !dispatchedBarcodes.has(key)) {
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

  // 3. Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'THIS_MONTH'>('ALL');
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
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Multi-item selection states
  const [selectedScanIds, setSelectedScanIds] = useState<Set<string>>(new Set());
  const [isBatchDeleting, setIsBatchDeleting] = useState<boolean>(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState<boolean>(false);

  // Clear selections when switching tabs
  useEffect(() => {
    setSelectedScanIds(new Set());
  }, [activeTab, remainingSubTab]);

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
    if (activeTab === 'OUT_OF_DELIVERY' && !riderName.trim()) {
      setFormError('⚠️ សូមជ្រើសរើស Rider (អ្នកដឹក) ជាមុនសិន ទើបអនុញ្ញាតអោយស្កេន Barcode!');
      if (soundEnabled) playWarningBeep();
      setBarcodeInput('');
      return;
    }
    if ((activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') && (!destination.trim() || !driverName.trim() || !truckNo.trim())) {
      setFormError('⚠️ សូមជ្រើសរើស ទីតាំង, Driver (អ្នកបើកបរ) និង Truck No ជាមុនសិន ទើបអនុញ្ញាតអោយស្កេន Barcode!');
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
      if (dispatchedBarcodes.has(clean)) {
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
        if (match.destination) {
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
      setDestination('');
      setDriverName('');
      setTruckNo('');
      setRiderName('');
      setDeliveryZone('');
      setCodAmount('');
      setRemarks('');
      setHoldReason(HOLD_REASONS[0]);
      setShelfLocation('');
    }
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 100);
  };

  const handleEditItem = (item: WarehouseScanItem) => {
    setEditingId(item.id);
    setActiveTab(item.scanType);
    setBarcodeInput(item.barcode);
    setDestination(item.destination || '');
    setDriverName(item.driverName || '');
    setTruckNo(item.truckNo || '');
    setCodAmount(item.codAmount !== undefined ? String(item.codAmount) : '');
    setCurrency(item.currency || 'USD');
    setRiderName(item.riderName || '');
    setDeliveryZone(item.deliveryZone || '');
    setRemarks(item.remarks || '');
    setHoldReason(item.holdReason || HOLD_REASONS[0]);
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

    // Validation: Rider is strictly mandatory for OUT_OF_DELIVERY
    if (activeTab === 'OUT_OF_DELIVERY' && !riderName.trim()) {
      setFormError('⚠️ សូមជ្រើសរើស Rider (អ្នកដឹក) ជាមុនសិន ទើបអនុញ្ញាតអោយស្កេន Barcode!');
      if (soundEnabled) playWarningBeep();
      return { success: false, message: '⚠️ សូមជ្រើសរើស Rider (អ្នកដឹក) ជាមុនសិន!' };
    }

    // Validation: Destination, Driver, and Truck No are mandatory for ScanIn and ScanOut
    if (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') {
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

    // A. Check duplicate in current Batch Queue (using batchQueueRef to guarantee fresh state against camera loops)
    const currentQueue = batchQueueRef.current;
    if (currentQueue.some((it) => it.barcode?.toUpperCase() === cleanBarcode)) {
      if (soundEnabled) playWarningBeep();
      const dupMsg = `⚠️ លេខ Barcode «${cleanBarcode}» ត្រូវបានស្កេនចូលក្នុង Batch នេះរួចហើយ! (ស្ទួន)`;
      setFormError(dupMsg);
      return { success: false, message: dupMsg };
    }

    // B. Check duplicate in database for same scanType today
    const existingDup = scans.find(
      (s) =>
        s.scanType === activeTab &&
        s.date === scanDate &&
        (s.barcode?.toUpperCase() === cleanBarcode || s.tracking?.toUpperCase() === cleanBarcode)
    );
    if (existingDup) {
      if (soundEnabled) playWarningBeep();
      setDispatchedWarning(`⚠️ លេខ Barcode «${cleanBarcode}» ធ្លាប់បានស្កេន ${activeTab} នៅថ្ងៃ ${scanDate} រួចហើយ!`);
    } else {
      setDispatchedWarning(null);
    }

    // C. Auto-match from cached DataReport
    const match = lookupTrackingFromDataReport(cleanBarcode);

    // If destination exists in Data Report, auto-sync destination state
    if (match?.destination) {
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
      destination: match?.destination || destination,
      payment: match?.payment,
      customerName: match?.consignee || match?.customerName,
      customerPhone: match?.customerPhone,
      codAmount: match?.codAmount !== undefined ? match.codAmount : (codAmount ? parseFloat(codAmount) : undefined),
      currency: match?.currency || currency || 'USD',
      shelfLocation: (activeTab === 'HOLD_REMAINING' ? (shelfLocation.trim() || match?.shelfLocation || undefined) : undefined),
      holdReason: (activeTab === 'HOLD_REMAINING' ? (holdReason.trim() || match?.holdReason || HOLD_REASONS[0]) : undefined),
      remarks: remarks.trim() || (dispatchedBarcodes.has(cleanBarcode) ? 'ចែកជូនឡើងវិញ (Re-delivery)' : undefined),
      scannedAt: new Date().toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    setBatchQueue((prev) => {
      if (prev.some((it) => it.barcode?.toUpperCase() === cleanBarcode)) {
        return prev;
      }
      const updated = [queuedItem, ...prev];
      batchQueueRef.current = updated;
      return updated;
    });
    if (soundEnabled) playScanBeep();

    setFormError(null);
    setBarcodeInput('');
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

  const handleRemoveBatchItem = (id: string) => {
    setBatchQueue((prev) => {
      const next = prev.filter((it) => it.id !== id);
      batchQueueRef.current = next;
      return next;
    });
  };

  const handleClearBatch = () => {
    if (batchQueue.length === 0) return;
    if (window.confirm(`តើអ្នកពិតជាចង់សម្អាត Batch ចំនួន ${batchQueue.length} កញ្ចប់នេះមែនទេ?`)) {
      setBatchQueue([]);
      batchQueueRef.current = [];
    }
  };

  // 2. Save entire Batch Queue to Storage, Firestore & Google Sheets
  const handleSaveBatch = async () => {
    if (batchQueue.length === 0) return;
    if (!canCreate) {
      notify('អ្នកមិនមានសិទ្ធិបញ្ចូលទិន្នន័យស្កេនថ្មីឡើយ', 'error');
      return;
    }

    setIsSubmittingBatch(true);
    setFormError(null);

    try {
      const prefix = activeTab === 'SCAN_IN' ? 'IN' : activeTab === 'SCAN_OUT' ? 'OUT' : activeTab === 'OUT_OF_DELIVERY' ? 'DLV' : 'HLD';
      const yymmdd = scanDate.replace(/-/g, '').slice(2);
      
      // Calculate today's next sequential serial (001, 002, 003...) for this scanType
      const existingOpCodesToday = new Set<string>();
      scans
        .filter((s) => s.scanType === activeTab && (s.date === scanDate || (s.createdAt && s.createdAt.slice(0, 10) === scanDate)))
        .forEach((s) => {
          const code = getOperationCode(s, scans);
          if (code && code.startsWith(`OP-${prefix}-${yymmdd}-`)) {
            existingOpCodesToday.add(code);
          }
        });

      // Find max serial number for today
      let nextSerialNum = existingOpCodesToday.size + 1;
      existingOpCodesToday.forEach((code) => {
        const parts = code.split('-');
        const serialPart = parts[parts.length - 1];
        const num = parseInt(serialPart, 10);
        if (!isNaN(num) && num >= nextSerialNum) {
          nextSerialNum = num + 1;
        }
      });

      const serialStr = nextSerialNum.toString().padStart(3, '0');
      const generatedOpCode = `OP-${prefix}-${yymmdd}-${serialStr}`;

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
        destination: (q.destination || destination || '').trim() || undefined,
        driverName: (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') ? (driverName || '').trim() || undefined : undefined,
        truckNo: (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') ? (truckNo || '').trim() || undefined : undefined,
        riderName: activeTab === 'OUT_OF_DELIVERY' ? (riderName || '').trim() || undefined : undefined,
        deliveryZone: activeTab === 'OUT_OF_DELIVERY' ? (deliveryZone || '').trim() || undefined : undefined,
        codAmount: q.codAmount,
        currency: q.currency || 'USD',
        holdReason: activeTab === 'HOLD_REMAINING' ? (q.holdReason || holdReason || HOLD_REASONS[0]) : undefined,
        shelfLocation: activeTab === 'HOLD_REMAINING' ? (q.shelfLocation || shelfLocation || '').trim() || undefined : undefined,
        remarks: (q.remarks || remarks || '').trim() || undefined,
        date: scanDate,
        operatorEmail: currentUser?.email || '',
        createdBy: currentUser?.name || currentUser?.email || 'User'
      }));

      const saved = await saveWarehouseScanBatch(itemsToSave);

      // Save manifest data for printing with operationCode
      setManifestData({
        items: [...batchQueue],
        scanType: activeTab,
        date: scanDate,
        operationCode: generatedOpCode,
        destination: destination || undefined,
        driverName: driverName || undefined,
        truckNo: truckNo || undefined,
        riderName: riderName || undefined,
        deliveryZone: deliveryZone || undefined,
        holdReason: holdReason || undefined,
        shelfLocation: shelfLocation || undefined,
        operatorName: currentUser?.name || currentUser?.email || 'User'
      });

      notify(`✓ បានរក្សាទុក Batch ចំនួន ${saved.length} កញ្ចប់ ជោគជ័យ!`, 'success');
      setBatchQueue([]);
      batchQueueRef.current = [];
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

      if (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') {
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
        const itemPayload: any = {
          id: editingId,
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

        if (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') {
          itemPayload.destination = destination.trim();
          itemPayload.driverName = driverName.trim() || undefined;
          itemPayload.truckNo = truckNo.trim() || undefined;
        } else if (activeTab === 'OUT_OF_DELIVERY') {
          itemPayload.riderName = riderName.trim() || undefined;
          itemPayload.deliveryZone = deliveryZone.trim() || undefined;
          itemPayload.codAmount = codAmount.trim() ? parseFloat(codAmount) : undefined;
          itemPayload.currency = currency;
          itemPayload.remarks = remarks.trim() || undefined;
        } else if (activeTab === 'HOLD_REMAINING') {
          itemPayload.destination = destination.trim() || undefined;
          itemPayload.holdReason = holdReason.trim() || HOLD_REASONS[0];
          itemPayload.shelfLocation = shelfLocation.trim() || undefined;
          itemPayload.remarks = remarks.trim() || undefined;
        }

        const saved = await saveWarehouseScan(itemPayload);
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

  // Unique filter option lists from current dataset
  const uniqueFilterOptions = useMemo(() => {
    const destSet = new Set<string>();
    const driverSet = new Set<string>();
    const truckSet = new Set<string>();
    const riderSet = new Set<string>();
    const reasonSet = new Set<string>();
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
      if (s.holdReason) reasonSet.add(s.holdReason);
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
      shelves: Array.from(shelfSet).filter(Boolean).sort((a, b) => a.localeCompare(b)),
      branchTargets: Array.from(branchSet).filter(Boolean).sort((a, b) => a.localeCompare(b))
    };
  }, [scans, provinceOptions, driverOptions, riderOptions, truckModelOptions, driverHandleOptions]);

  // Active filters counter (context-aware for activeTab)
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterStartDate) count++;
    if (filterEndDate) count++;
    if (dateFilter !== 'ALL') count++;
    if (operatorFilter !== 'ALL') count++;
    if (filterDestination !== 'ALL') count++;
    if (filterBranchTarget !== 'ALL') count++;

    if (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') {
      if (filterDriver !== 'ALL') count++;
      if (filterTruckNo !== 'ALL') count++;
    } else if (activeTab === 'OUT_OF_DELIVERY') {
      if (filterRider !== 'ALL') count++;
    } else if (activeTab === 'HOLD_REMAINING') {
      if (filterHoldReason !== 'ALL') count++;
      if (filterShelfLocation !== 'ALL') count++;
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
    filterEndDate,
    dateFilter,
    operatorFilter
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
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);

    if (filterStartDate && filterEndDate) {
      list = list.filter((s) => s.date >= filterStartDate && s.date <= filterEndDate);
    } else if (filterStartDate) {
      list = list.filter((s) => s.date >= filterStartDate);
    } else if (filterEndDate) {
      list = list.filter((s) => s.date <= filterEndDate);
    } else if (dateFilter === 'TODAY') {
      list = list.filter((s) => s.date === today);
    } else if (dateFilter === 'YESTERDAY') {
      list = list.filter((s) => s.date === yesterday);
    } else if (dateFilter === 'THIS_MONTH') {
      list = list.filter((s) => (s.date || '').startsWith(thisMonth));
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
    if (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') {
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
    } else if (activeTab === 'HOLD_REMAINING') {
      // មូលហេតុនៅសល់ / ផ្អាក *
      if (filterHoldReason !== 'ALL') {
        const reasonLower = filterHoldReason.toLowerCase().trim();
        list = list.filter((s) => (s.holdReason || '').toLowerCase() === reasonLower);
      }
      // ធ្នើរ / Shelf Location
      if (filterShelfLocation !== 'ALL') {
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

  // Distinct operations in filtered scans (for the Operation Print selector)
  const filteredOperationGroups = useMemo(() => {
    return groupScansByOperation(filteredScans);
  }, [filteredScans]);

  // Pagination
  const totalPages = Math.ceil(filteredScans.length / pageSize) || 1;
  const paginatedScans = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredScans.slice(start, start + pageSize);
  }, [filteredScans, currentPage, pageSize]);

  // Multi-item selection helpers
  const isAllCurrentPageSelected = paginatedScans.length > 0 && paginatedScans.every((s) => selectedScanIds.has(s.id));
  const isSomeCurrentPageSelected = paginatedScans.some((s) => selectedScanIds.has(s.id));

  const handleToggleSelect = (id: string) => {
    setSelectedScanIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllCurrentPage = () => {
    if (paginatedScans.length === 0) return;
    if (isAllCurrentPageSelected) {
      setSelectedScanIds((prev) => {
        const next = new Set(prev);
        paginatedScans.forEach((s) => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedScanIds((prev) => {
        const next = new Set(prev);
        paginatedScans.forEach((s) => next.add(s.id));
        return next;
      });
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
      if (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') {
        headers = ['#', 'Barcode', 'Tracking', 'Destination', 'Driver Name', 'Truck No', 'Date', 'Operator', 'Created At'];
      } else if (activeTab === 'HOLD_REMAINING') {
        headers = ['#', 'Barcode', 'Tracking', 'Destination', 'Hold Reason (មូលហេតុនៅសល់)', 'Shelf Location (ធ្នើរ)', 'Date', 'Operator', 'Created At', 'Remarks'];
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
            `"${(s.driverName || '').replace(/"/g, '""')}"`,
            `"${(s.truckNo || '').replace(/"/g, '""')}"`,
            s.date,
            `"${s.operatorEmail || s.createdBy || ''}"`,
            `"${s.createdAt}"`
          ].join(',');
        } else if (activeTab === 'HOLD_REMAINING') {
          return [
            idx + 1,
            `="${s.barcode}"`,
            `="${s.tracking || s.barcode}"`,
            `"${(s.destination || '').replace(/"/g, '""')}"`,
            `"${(s.holdReason || '').replace(/"/g, '""')}"`,
            `"${(s.shelfLocation || '').replace(/"/g, '""')}"`,
            s.date,
            `"${s.operatorEmail || s.createdBy || ''}"`,
            `"${s.createdAt}"`,
            `"${(s.remarks || '').replace(/"/g, '""')}"`
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

  // 3. Print filtered items as an official Batch Manifest (filtered by Rider/Driver and Date)
  const handlePrintFilteredManifest = () => {
    if (filteredScans.length === 0) {
      notify('មិនមានទិន្នន័យដើម្បីបោះពុម្ពឡើយ', 'error');
      return;
    }

    const items: ManifestItem[] = filteredScans.map((s) => {
      const report = lookupTrackingFromDataReport(s.barcode || s.tracking || '');
      return {
        id: s.id || `item-${s.barcode}-${Date.now()}`,
        barcode: s.barcode || s.tracking || '',
        shipper: s.shipper || report?.shipper,
        consignee: s.consignee || s.customerName || report?.consignee || report?.customerName,
        destination: s.destination || report?.destination,
        payment: s.payment || report?.payment,
        customerName: s.consignee || s.customerName || report?.consignee || report?.customerName,
        customerPhone: s.customerPhone || report?.customerPhone,
        codAmount: s.codAmount !== undefined ? s.codAmount : report?.codAmount,
        currency: s.currency || report?.currency || 'USD',
        shelfLocation: activeTab === 'HOLD_REMAINING' ? (s.shelfLocation || report?.shelfLocation) : undefined,
        holdReason: activeTab === 'HOLD_REMAINING' ? (s.holdReason || report?.holdReason) : undefined,
        remarks: s.remarks,
        driverName: (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') ? s.driverName : undefined,
        truckNo: (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') ? s.truckNo : undefined,
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
    const detectedDriver = (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT')
      ? (filterDriver !== 'ALL'
        ? filterDriver
        : (filteredScans.length > 0 && filteredScans.every((s) => s.driverName && s.driverName === filteredScans[0]?.driverName))
        ? filteredScans[0]?.driverName
        : undefined)
      : undefined;

    // 4. Detect truck (Only for SCAN_IN or SCAN_OUT)
    const detectedTruck = (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT')
      ? (filterTruckNo !== 'ALL'
        ? filterTruckNo
        : (filteredScans.length > 0 && filteredScans.every((s) => s.truckNo && s.truckNo === filteredScans[0]?.truckNo))
        ? filteredScans[0]?.truckNo
        : undefined)
      : undefined;

    // 5. Detect holdReason (Only for HOLD_REMAINING)
    const detectedHoldReason = activeTab === 'HOLD_REMAINING'
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
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
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
    const items: ManifestItem[] = group.items.map((s) => {
      const report = lookupTrackingFromDataReport(s.barcode || s.tracking || '');
      return {
        id: s.id || `item-${s.barcode}-${Date.now()}`,
        barcode: s.barcode || s.tracking || '',
        shipper: s.shipper || report?.shipper,
        consignee: s.consignee || s.customerName || report?.consignee || report?.customerName,
        destination: s.destination || report?.destination,
        payment: s.payment || report?.payment,
        customerName: s.consignee || s.customerName || report?.consignee || report?.customerName,
        customerPhone: s.customerPhone || report?.customerPhone,
        codAmount: s.codAmount !== undefined ? s.codAmount : report?.codAmount,
        currency: s.currency || report?.currency || 'USD',
        shelfLocation: s.scanType === 'HOLD_REMAINING' ? (s.shelfLocation || report?.shelfLocation) : undefined,
        holdReason: s.scanType === 'HOLD_REMAINING' ? (s.holdReason || report?.holdReason) : undefined,
        remarks: s.remarks,
        driverName: (s.scanType === 'SCAN_IN' || s.scanType === 'SCAN_OUT') ? s.driverName : undefined,
        truckNo: (s.scanType === 'SCAN_IN' || s.scanType === 'SCAN_OUT') ? s.truckNo : undefined,
        riderName: s.scanType === 'OUT_OF_DELIVERY' ? s.riderName : undefined,
        deliveryZone: s.scanType === 'OUT_OF_DELIVERY' ? s.deliveryZone : undefined,
        scannedAt: s.createdAt ? new Date(s.createdAt).toLocaleTimeString('km-KH') : undefined
      };
    });

    setManifestData({
      items,
      scanType: group.scanType,
      date: group.date || scanDate,
      destination: group.destination,
      driverName: group.driverName,
      truckNo: group.truckNo,
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
    const report = lookupTrackingFromDataReport(s.barcode || s.tracking || '');
    const item: ManifestItem = {
      id: s.id || `item-${s.barcode}-${Date.now()}`,
      barcode: s.barcode || s.tracking || '',
      shipper: s.shipper || report?.shipper,
      consignee: s.consignee || s.customerName || report?.consignee || report?.customerName,
      destination: s.destination || report?.destination,
      payment: s.payment || report?.payment,
      customerName: s.consignee || s.customerName || report?.consignee || report?.customerName,
      customerPhone: s.customerPhone || report?.customerPhone,
      codAmount: s.codAmount !== undefined ? s.codAmount : report?.codAmount,
      currency: s.currency || report?.currency || 'USD',
      shelfLocation: s.scanType === 'HOLD_REMAINING' ? (s.shelfLocation || report?.shelfLocation) : undefined,
      holdReason: s.scanType === 'HOLD_REMAINING' ? (s.holdReason || report?.holdReason) : undefined,
      remarks: s.remarks,
      driverName: (s.scanType === 'SCAN_IN' || s.scanType === 'SCAN_OUT') ? s.driverName : undefined,
      truckNo: (s.scanType === 'SCAN_IN' || s.scanType === 'SCAN_OUT') ? s.truckNo : undefined,
      riderName: s.scanType === 'OUT_OF_DELIVERY' ? s.riderName : undefined,
      deliveryZone: s.scanType === 'OUT_OF_DELIVERY' ? s.deliveryZone : undefined,
      scannedAt: s.createdAt ? new Date(s.createdAt).toLocaleTimeString('km-KH') : undefined
    };

    setManifestData({
      items: [item],
      scanType: s.scanType,
      date: s.date || scanDate,
      destination: s.destination || report?.destination,
      driverName: (s.scanType === 'SCAN_IN' || s.scanType === 'SCAN_OUT') ? s.driverName : undefined,
      truckNo: (s.scanType === 'SCAN_IN' || s.scanType === 'SCAN_OUT') ? s.truckNo : undefined,
      riderName: s.scanType === 'OUT_OF_DELIVERY' ? s.riderName : undefined,
      deliveryZone: s.scanType === 'OUT_OF_DELIVERY' ? s.deliveryZone : undefined,
      holdReason: s.scanType === 'HOLD_REMAINING' ? s.holdReason : undefined,
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

    const items: ManifestItem[] = selectedItems.map((s) => {
      const report = lookupTrackingFromDataReport(s.barcode || s.tracking || '');
      return {
        id: s.id || `item-${s.barcode}-${Date.now()}`,
        barcode: s.barcode || s.tracking || '',
        shipper: s.shipper || report?.shipper,
        consignee: s.consignee || s.customerName || report?.consignee || report?.customerName,
        destination: s.destination || report?.destination,
        payment: s.payment || report?.payment,
        customerName: s.consignee || s.customerName || report?.consignee || report?.customerName,
        customerPhone: s.customerPhone || report?.customerPhone,
        codAmount: s.codAmount !== undefined ? s.codAmount : report?.codAmount,
        currency: s.currency || report?.currency || 'USD',
        shelfLocation: s.scanType === 'HOLD_REMAINING' ? (s.shelfLocation || report?.shelfLocation) : undefined,
        holdReason: s.scanType === 'HOLD_REMAINING' ? (s.holdReason || report?.holdReason) : undefined,
        remarks: s.remarks,
        driverName: (s.scanType === 'SCAN_IN' || s.scanType === 'SCAN_OUT') ? s.driverName : undefined,
        truckNo: (s.scanType === 'SCAN_IN' || s.scanType === 'SCAN_OUT') ? s.truckNo : undefined,
        riderName: s.scanType === 'OUT_OF_DELIVERY' ? s.riderName : undefined,
        deliveryZone: s.scanType === 'OUT_OF_DELIVERY' ? s.deliveryZone : undefined,
        scannedAt: s.createdAt ? new Date(s.createdAt).toLocaleTimeString('km-KH') : undefined
      };
    });

    const detectedDriver = (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT')
      ? (selectedItems.every((s) => s.driverName && s.driverName === selectedItems[0]?.driverName) ? selectedItems[0]?.driverName : undefined)
      : undefined;

    const detectedTruck = (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT')
      ? (selectedItems.every((s) => s.truckNo && s.truckNo === selectedItems[0]?.truckNo) ? selectedItems[0]?.truckNo : undefined)
      : undefined;

    const detectedRider = activeTab === 'OUT_OF_DELIVERY'
      ? (selectedItems.every((s) => s.riderName && s.riderName === selectedItems[0]?.riderName) ? selectedItems[0]?.riderName : undefined)
      : undefined;

    const detectedZone = activeTab === 'OUT_OF_DELIVERY'
      ? (selectedItems.every((s) => s.deliveryZone && s.deliveryZone === selectedItems[0]?.deliveryZone) ? selectedItems[0]?.deliveryZone : undefined)
      : undefined;

    const detectedHoldReason = activeTab === 'HOLD_REMAINING'
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
      riderName: detectedRider,
      deliveryZone: detectedZone,
      holdReason: detectedHoldReason,
      shelfLocation: detectedShelf,
      operatorName: currentUser?.name || currentUser?.email || 'User',
      operationCode: detectedOpCode
    });

    setIsManifestModalOpen(true);
  };

  // Batch delete selected items
  const handleConfirmBatchDelete = async () => {
    if (selectedScanIds.size === 0) return;
    setIsBatchDeleting(true);
    try {
      const itemsToDelete = scans.filter((s) => selectedScanIds.has(s.id));
      await Promise.all(itemsToDelete.map((it) => deleteWarehouseScan(it.id, it.barcode, it.scanType)));
      notify(`✓ បានលុបកំណត់ត្រាស្កេនដែលបានជ្រើសចំនួន ${itemsToDelete.length} ជោគជ័យ!`, 'success');
      setSelectedScanIds(new Set());
      setShowBatchDeleteConfirm(false);
    } catch (err: any) {
      notify('កំហុសពេលលុបជាក្រុម៖ ' + (err?.message || err), 'error');
    } finally {
      setIsBatchDeleting(false);
    }
  };


  return (
    <div
      ref={containerRef}
      className={`w-full min-h-full space-y-3.5 sm:space-y-4 pb-24 lg:pb-12 transition-all duration-200 ${
        isFullScreen
          ? 'fixed inset-0 z-50 bg-slate-50 dark:bg-[#070d18] p-3 sm:p-6 overflow-y-auto w-screen h-screen'
          : 'w-full'
      }`}
    >
      {/* Floating Exit Button in Fullscreen Mode */}
      {isFullScreen && (
        <div className="fixed top-3 right-4 z-50 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
          <button
            type="button"
            onClick={toggleFullScreen}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold shadow-xl border border-slate-700/80 flex items-center gap-1.5 transition active:scale-95 cursor-pointer backdrop-blur-md"
            title="ចេញពី Full Screen (ឬចុច Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
            <span>ចេញពី Full Screen (Esc)</span>
          </button>
        </div>
      )}
      {/* ========================================================================= */}
      {/* 🌟 1. UNIFIED COMMAND HEADER (Compact, Responsive & Space-Saving) */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#0c1424] border border-slate-200/90 dark:border-slate-800/80 rounded-2xl p-2.5 sm:p-3 shadow-xs space-y-2.5">
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2">
          {/* Left: Branding & Status */}
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-cyan-600 via-teal-600 to-blue-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
              <Boxes className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h1 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 dark:text-white tracking-tight truncate">
                  គ្រប់គ្រងឃ្លាំង (Warehouse Hub)
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-200/80 dark:border-cyan-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {scans.length} កំណត់ត្រា
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate hidden md:block">
                ScanIn (ចូលឃ្លាំង) • ScanOut (ចេញពីឃ្លាំង) • Out of Delivery (ចេញចែកចាយតាម Rider)
              </p>
            </div>
          </div>

          {/* Right: Quick Action Toolbar */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto flex-wrap">
            {/* Form Collapse/Expand Toggle (Saves maximum vertical space) */}
            <button
              type="button"
              onClick={() => setIsFormOpen((prev) => !prev)}
              className={`h-8 px-2 sm:px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition cursor-pointer shadow-2xs ${
                isFormOpen
                  ? 'border-cyan-300 dark:border-cyan-800/80 bg-cyan-50/80 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50'
              }`}
              title={isFormOpen ? 'បង្រួម Form ស្កេនដើម្បីចំនេញទំហំ' : 'បើក Form ស្កេន'}
            >
              {isFormOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isFormOpen ? 'លាក់ Form' : 'បើក Form'}</span>
            </button>

            {/* Sound toggle button */}
            <button
              type="button"
              onClick={() => setSoundEnabled((prev) => !prev)}
              className={`h-8 w-8 sm:w-auto sm:px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer shadow-2xs ${
                soundEnabled
                  ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400'
              }`}
              title={soundEnabled ? 'សំឡេង Beep បើក (ចុចដើម្បីបិទ)' : 'សំឡេង Beep បិទ (ចុចដើម្បីបើក)'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-600" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={toggleFullScreen}
              className="h-8 px-2 sm:px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 transition cursor-pointer shadow-2xs"
              title="ពេញអេក្រង់ (Full Screen)"
            >
              {isFullScreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden md:inline font-bold">បង្រួម</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden md:inline font-bold">ពេញអេក្រង់</span>
                </>
              )}
            </button>

            {/* Sync Sheets Button */}
            <button
              type="button"
              onClick={handleSyncGoogleSheets}
              disabled={isSyncingSheets}
              className="h-8 px-2 sm:px-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50 shadow-2xs"
              title="បញ្ជូនទិន្នន័យទៅ Google Sheets"
            >
              {isSyncingSheets ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              )}
              <span className="hidden sm:inline">{isSyncingSheets ? 'កំពុងបញ្ជូន...' : 'Sync Sheets'}</span>
            </button>

            {/* Code.gs Button */}
            <button
              type="button"
              onClick={() => setShowDeployHelpModal(true)}
              className="h-8 px-2 sm:px-2.5 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-2xs"
              title="មើលកូដ Code.gs"
            >
              <Code2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="hidden md:inline">Code.gs</span>
            </button>

            {/* Backup PG Button */}
            <button
              type="button"
              onClick={handleBackupPostgres}
              disabled={isBackingUpPg}
              className="h-8 px-2 sm:px-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Backup PG"
            >
              {isBackingUpPg ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
              ) : (
                <Database className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              )}
              <span className="hidden md:inline">{isBackingUpPg ? 'Backup...' : 'Backup PG'}</span>
            </button>

            {/* Print Manifest Button */}
            <button
              type="button"
              onClick={handleToolbarPrint}
              disabled={filteredScans.length === 0}
              className="h-8 px-2 sm:px-2.5 rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50/70 dark:bg-cyan-950/40 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300 text-xs font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50 shadow-2xs"
              title={`បោះពុម្ពប័ណ្ណប្រតិបត្តិការ Manifest (${filteredScans.length} កញ្ចប់)`}
            >
              <Printer className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span className="hidden sm:inline">Print ({filteredScans.length})</span>
            </button>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredScans.length === 0}
              className="h-8 px-2 sm:px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50 shadow-2xs"
              title="ទាញយក CSV"
            >
              <Download className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>

        {/* 🌟 4 OPERATIONS TABS (Responsive segmented switcher) */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
          {/* Tab 1: ScanIn */}
          {canAccessScanIn && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('SCAN_IN');
                resetFormFields();
              }}
              className={`px-2.5 py-1.5 sm:px-3.5 sm:py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer shrink-0 ${
                activeTab === 'SCAN_IN'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25 ring-1 ring-emerald-500/30'
                  : 'bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80'
              }`}
            >
              <ArrowDownToLine className="w-3.5 h-3.5 shrink-0" />
              <span>📥 <span className="sm:hidden">ScanIn</span><span className="hidden sm:inline">ScanIn (ចូលឃ្លាំង)</span></span>
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
                setActiveTab('SCAN_OUT');
                resetFormFields();
              }}
              className={`px-2.5 py-1.5 sm:px-3.5 sm:py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer shrink-0 ${
                activeTab === 'SCAN_OUT'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-amber-500/25 ring-1 ring-amber-500/30'
                  : 'bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80'
              }`}
            >
              <ArrowUpFromLine className="w-3.5 h-3.5 shrink-0" />
              <span>📤 <span className="sm:hidden">ScanOut</span><span className="hidden sm:inline">ScanOut (ចេញពីឃ្លាំង)</span></span>
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
                setActiveTab('OUT_OF_DELIVERY');
                resetFormFields();
              }}
              className={`px-2.5 py-1.5 sm:px-3.5 sm:py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer shrink-0 ${
                activeTab === 'OUT_OF_DELIVERY'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-500/30'
                  : 'bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80'
              }`}
            >
              <Truck className="w-3.5 h-3.5 shrink-0" />
              <span>🚚 <span className="sm:hidden">Rider</span><span className="hidden sm:inline">Out of Delivery (Rider)</span></span>
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
                setActiveTab('HOLD_REMAINING');
                resetFormFields();
              }}
              className={`px-2.5 py-1.5 sm:px-3.5 sm:py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer shrink-0 ${
                activeTab === 'HOLD_REMAINING'
                  ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 text-white shadow-md shadow-purple-500/25 ring-1 ring-purple-500/30'
                  : 'bg-slate-100/90 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/80'
              }`}
            >
              <PackageCheck className="w-3.5 h-3.5 shrink-0" />
              <span>📦 <span className="sm:hidden">Hold នៅសល់</span><span className="hidden sm:inline">នៅសល់ក្នុងឃ្លាំង (Hold)</span></span>
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
        </div>
      </div>      {/* ========================================================================= */}
      {/* 📊 2. ULTRA-COMPACT METRIC BAR (ចំនេញទំហំអេក្រង់ និងងាយស្រួលចុចប្តូរ Tab) */}
      {/* ========================================================================= */}
      <div className="bg-white/90 dark:bg-[#0c1424]/90 border border-slate-200/90 dark:border-slate-800/80 rounded-xl px-2.5 sm:px-3 py-1.5 shadow-2xs flex items-center justify-between gap-2 overflow-x-auto text-xs">
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 text-[11px] sm:text-xs">
          {/* Total Today */}
          <div className="flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
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
        </div>

        {/* Right side overall total */}
        <div className="hidden md:flex items-center gap-1.5 text-[10.5px] text-slate-500 shrink-0 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>ទូទាំងប្រព័ន្ធ: <strong className="font-mono text-slate-700 dark:text-slate-300 font-bold">{stats.totalOverall}</strong></span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ⚡ 3. ERGONOMIC SCANNING FORM (1-Row High-Efficiency Space-Saving Design) */}
      {/* ========================================================================= */}
      {isFormOpen ? (
        <div
          className={`bg-white dark:bg-[#0c1424] border rounded-2xl p-2.5 sm:p-3 shadow-xs space-y-2 transition-all ${
            activeTab === 'SCAN_IN'
              ? 'border-emerald-300/80 dark:border-emerald-800/60 ring-1 ring-emerald-500/10'
              : activeTab === 'SCAN_OUT'
              ? 'border-amber-300/80 dark:border-amber-800/60 ring-1 ring-amber-500/10'
              : activeTab === 'HOLD_REMAINING'
              ? 'border-purple-300/80 dark:border-purple-800/60 ring-1 ring-purple-500/10'
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
          {activeTab === 'OUT_OF_DELIVERY' && (
            <div className={`p-2 sm:p-2.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all ${
              !riderName.trim()
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/70 text-amber-900 dark:text-amber-200'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/70 text-emerald-800 dark:text-emerald-200'
            }`}>
              <div className="flex items-center gap-2">
                {!riderName.trim() ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                    <span className="font-bold text-[11.5px] sm:text-xs">
                      👉 ជំហានទី ១៖ សូមជ្រើសរើស Rider (អ្នកដឹក) ជាមុនសិន ទើបប្រព័ន្ធអនុញ្ញាតអោយស្កេន Barcode!
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-[11.5px] sm:text-xs">
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
          {(activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') && (
            <div className={`p-2 sm:p-2.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all ${
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
                      ទីតាំង: <strong className="font-semibold text-emerald-700 dark:text-emerald-300 underline underline-offset-2">{destination}</strong> | Driver: <strong className="font-semibold text-emerald-700 dark:text-emerald-300 underline underline-offset-2">{driverName}</strong> | Truck: <strong className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">{truckNo}</strong> — ឥឡូវលោកអ្នកអាចស្កេន Barcode បាន!
                    </span>
                  </>
                )}
              </div>
              {(driverName.trim() || truckNo.trim() || destination.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setDriverName('');
                    setTruckNo('');
                    setBarcodeInput('');
                    setFormError(null);
                  }}
                  className="text-[10.5px] font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-300 underline cursor-pointer shrink-0"
                >
                  ប្តូរ Driver/Truck
                </button>
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
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        លេខ Barcode / Tracking <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={toggleContinuousScan}
                        className={`text-[9.5px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 transition cursor-pointer shrink-0 shadow-2xs ${
                          autoContinuousScan
                            ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                        }`}
                        title="បើក/បិទ មុខងារស្កេនបន្តដោយស្វ័យប្រវត្តិ (មិនបាច់ចុច Submit/Enter)"
                      >
                        <Zap className={`w-2.5 h-2.5 ${autoContinuousScan ? 'text-emerald-500 fill-emerald-500' : 'text-slate-400'}`} />
                        <span>ស្កេនបន្ត:</span>
                        <span className="font-mono text-[9px] uppercase">{autoContinuousScan ? 'ON' : 'OFF'}</span>
                      </button>
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
              ) : (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') ? (
                /* Case 2: Form Layout for SCAN_IN and SCAN_OUT: Destination, Driver, Truck come FIRST! */
                <>
                  {/* Field 1: DESTINATION (គោលដៅ) (Searchable Combobox) */}
                  <div className="w-full min-w-0 col-span-2 sm:col-span-2 lg:col-span-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 truncate">
                        DESTINATION (គោលដៅ) <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-1">
                        {dataReportDestinations.length > 0 && (
                          <span
                            className="text-[9px] text-cyan-600 dark:text-cyan-400 font-medium"
                            title="ចំនួនគោលដៅទាញចេញពី Data Report Page (column DESTINATION)"
                          >
                            {dataReportDestinations.length} គោលដៅ
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
                        if (val.trim() && driverName.trim() && truckNo.trim()) {
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
                  <div className="w-full min-w-0 col-span-1 sm:col-span-2 lg:col-span-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 truncate">
                        Driver (អ្នកបើកបរ) <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-1">
                        {driverHandleOptions.length > 0 && (
                          <span className="text-[9px] text-cyan-600 dark:text-cyan-400 font-medium">
                            {driverHandleOptions.length} Handles
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

                        if (val.trim() && nextTruck.trim() && destination.trim()) {
                          setTimeout(() => {
                            barcodeInputRef.current?.focus();
                          }, 150);
                        }
                      }}
                      options={driverComboboxOptions}
                      placeholder="ស្វែងរក Driver / Handle..."
                      icon={<User className="w-3 h-3 text-slate-400" />}
                      required
                    />
                  </div>

                  {/* Field 3: Truck No (Searchable Combobox) */}
                  <div className="w-full min-w-0 col-span-1 sm:col-span-2 lg:col-span-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 truncate">
                          Truck No <span className="text-red-500">*</span>
                        </label>
                        {isTruckAutoMatched && (
                          <span
                            className="text-[8.5px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 px-1 py-0.2 rounded-md shrink-0 animate-in fade-in"
                            title={`ឡាននេះត្រូវបាន Lookup ដោយស្វ័យប្រវត្តិចេញពី Meterial_Office សម្រាប់ ${driverName}`}
                          >
                            ✓ ឡានតាម Driver
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {truckModelOptions.length > 0 && (
                          <span className="text-[9px] text-cyan-600 dark:text-cyan-400 font-medium">
                            {truckModelOptions.length} Models
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
                        if (val.trim() && driverName.trim() && destination.trim()) {
                          setTimeout(() => {
                            barcodeInputRef.current?.focus();
                          }, 150);
                        }
                      }}
                      options={truckComboboxOptions}
                      placeholder="ស្វែងរក Model No... (3A-1234)"
                      icon={<Truck className="w-3 h-3 text-slate-400" />}
                      required
                    />
                  </div>

                  {/* Field 4: Barcode / Tracking input (Hero Input with Generous Width) */}
                  <div className="w-full min-w-0 col-span-2 sm:col-span-3 lg:col-span-3">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        លេខ Barcode / Tracking <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={toggleContinuousScan}
                        className={`text-[9.5px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 transition cursor-pointer shrink-0 shadow-2xs ${
                          autoContinuousScan
                            ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                        }`}
                        title="បើក/បិទ មុខងារស្កេនបន្តដោយស្វ័យប្រវត្តិ (មិនបាច់ចុច Submit/Enter)"
                      >
                        <Zap className={`w-2.5 h-2.5 ${autoContinuousScan ? 'text-emerald-500 fill-emerald-500' : 'text-slate-400'}`} />
                        <span>ស្កេនបន្ត:</span>
                        <span className="font-mono text-[9px] uppercase">{autoContinuousScan ? 'ON' : 'OFF'}</span>
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                        <Barcode className="w-3.5 h-3.5" />
                      </div>
                      <input
                        ref={barcodeInputRef}
                        type="text"
                        disabled={!driverName.trim() || !truckNo.trim() || !destination.trim()}
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
                          !destination.trim()
                            ? "🔒 សូមជ្រើសរើសទីតាំងជាមុន..."
                            : !driverName.trim() || !truckNo.trim()
                            ? "🔒 ត្រូវរើស Driver & Truck មុន..."
                            : autoContinuousScan
                            ? "⚡ ស្កេន Barcode បន្តបន្ទាប់..."
                            : "ស្កេន Barcode (Enter)..."
                        }
                        className={`w-full h-8 pl-8 pr-12 rounded-xl border text-xs font-mono font-bold transition uppercase shadow-2xs ${
                          !driverName.trim() || !truckNo.trim() || !destination.trim()
                            ? 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 border-slate-200 dark:border-slate-800 cursor-not-allowed opacity-80'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500'
                        }`}
                        autoFocus={Boolean(driverName.trim() && truckNo.trim() && destination.trim())}
                      />
                      <button
                        type="button"
                        disabled={!driverName.trim() || !truckNo.trim() || !destination.trim()}
                        onClick={() => {
                          if (!driverName.trim() || !truckNo.trim() || !destination.trim()) {
                            setFormError('⚠️ សូមជ្រើសរើស ទីតាំង, Driver (អ្នកបើកបរ) និង Truck No ជាមុនសិន!');
                            return;
                          }
                          setIsScannerOpen(true);
                        }}
                        className={`absolute inset-y-0 right-0 pr-2 flex items-center ${
                          !driverName.trim() || !truckNo.trim() || !destination.trim()
                            ? 'opacity-40 cursor-not-allowed text-slate-400'
                            : 'text-slate-400 hover:text-cyan-600 cursor-pointer'
                        }`}
                        title={
                          !driverName.trim() || !truckNo.trim() || !destination.trim()
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
                  <div className="w-full min-w-0 col-span-1 sm:col-span-1 lg:col-span-1">
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
                /* Case 3: Form Layout for HOLD_REMAINING */
                <>
                  {/* Field 1: Barcode / Tracking input (Prominent Hero) */}
                  <div className="w-full min-w-0 col-span-2 sm:col-span-3 lg:col-span-3">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        លេខ Barcode / Tracking <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={toggleContinuousScan}
                        className={`text-[9.5px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 transition cursor-pointer shrink-0 shadow-2xs ${
                          autoContinuousScan
                            ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
                        }`}
                        title="បើក/បិទ មុខងារស្កេនបន្តដោយស្វ័យប្រវត្តិ (មិនបាច់ចុច Submit/Enter)"
                      >
                        <Zap className={`w-2.5 h-2.5 ${autoContinuousScan ? 'text-emerald-500 fill-emerald-500' : 'text-slate-400'}`} />
                        <span>ស្កេនបន្ត:</span>
                        <span className="font-mono text-[9px] uppercase">{autoContinuousScan ? 'ON' : 'OFF'}</span>
                      </button>
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
                      មូលហេតុនៅសល់ <span className="text-red-500">*</span>
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
                        {HOLD_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                        {holdReason && !HOLD_REASONS.includes(holdReason) && (
                          <option value={holdReason}>{holdReason}</option>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* ធ្នើរ / Shelf Location */}
                  <div className="w-full min-w-0 col-span-1 sm:col-span-2 lg:col-span-2">
                    <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-0.5 truncate">
                      ធ្នើរ / កន្លែងទុក (Shelf)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                        <Layers className="w-3 h-3 text-amber-600" />
                      </div>
                      <input
                        type="text"
                        list="warehouse-shelves-list"
                        value={shelfLocation}
                        onChange={(e) => setShelfLocation(e.target.value)}
                        placeholder="ធ្នើរ..."
                        className="w-full h-8 pl-7 pr-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-purple-500 transition shadow-2xs"
                      />
                      <datalist id="warehouse-shelves-list">
                        {WAREHOUSE_SHELVES.map((shelf) => (
                          <option key={shelf} value={shelf} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  {/* សាខា / គោលដៅ */}
                  <div className="w-full min-w-0 col-span-1 sm:col-span-2 lg:col-span-2">
                    <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-0.5 truncate">
                      សាខា / ខេត្តគោលដៅ
                    </label>
                    <SearchableCombobox
                      value={destination}
                      onChange={setDestination}
                      options={destinationComboboxOptions}
                      placeholder="ស្វែងរក ឬជ្រើសរើសគោលដៅ..."
                      icon={<MapPin className="w-3 h-3 text-cyan-600" />}
                    />
                  </div>
                </>
              )}

              {/* Submit Button (Inline in the same row) */}
              <div className="w-full min-w-0 col-span-1 sm:col-span-2 lg:col-span-2">
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    !barcodeInput.trim() ||
                    (activeTab === 'OUT_OF_DELIVERY' && !riderName.trim()) ||
                    ((activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') && (!destination.trim() || !driverName.trim() || !truckNo.trim()))
                  }
                  className={`w-full h-8 px-3 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                    activeTab === 'SCAN_IN'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/20'
                      : activeTab === 'SCAN_OUT'
                      ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 shadow-amber-500/20'
                      : activeTab === 'HOLD_REMAINING'
                      ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-700 hover:to-rose-700 shadow-purple-500/20'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/20'
                  }`}
                  title={
                    activeTab === 'OUT_OF_DELIVERY' && !riderName.trim()
                      ? "សូមជ្រើសរើស Rider ជាមុនសិន"
                      : (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') && (!driverName.trim() || !truckNo.trim() || !destination.trim())
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
                    {editingId ? 'កែប្រែ' : '+ Batch (Enter)'}
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
                <div className="max-h-64 overflow-y-auto overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs custom-scrollbar">
                  <table className="w-full min-w-[700px] text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 sticky top-0 font-semibold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2 px-2.5 w-10 text-center">#</th>
                        <th className="py-2 px-3">លេខ Barcode / Tracking</th>
                        <th className="py-2 px-3">SHIPPER (អ្នកផ្ញើ)</th>
                        <th className="py-2 px-3">CONSIGNEE (អ្នកទទួល)</th>
                        <th className="py-2 px-3">DESTINATION (គោលដៅ)</th>
                        {activeTab === 'HOLD_REMAINING' && (
                          <>
                            <th className="py-2 px-3 text-amber-700 dark:text-amber-300">មូលហេតុនៅសល់ក្នុងឃ្លាំង (Reason)</th>
                            <th className="py-2 px-2.5 text-purple-700 dark:text-purple-300">ធ្នើរ (Shelf)</th>
                          </>
                        )}
                        <th className="py-2 px-3 text-center">PAYMENT (ការទូទាត់)</th>
                        <th className="py-2 px-3 text-center">ម៉ោងស្កេន</th>
                        <th className="py-2 px-2 text-center w-12">លុប</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                      {batchQueue.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-cyan-50/50 dark:hover:bg-cyan-950/20 transition">
                          <td className="py-1.5 px-2.5 text-center text-slate-400 font-mono text-[11px]">
                            {batchQueue.length - idx}
                          </td>
                          <td className="py-1.5 px-3 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              <Barcode className="w-3.5 h-3.5 text-cyan-600" />
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
        <div
          onClick={() => {
            setIsFormOpen(true);
            setTimeout(() => barcodeInputRef.current?.focus(), 100);
          }}
          className="bg-white dark:bg-[#0c1424] border border-dashed border-cyan-300 dark:border-cyan-800/60 hover:border-cyan-500 dark:hover:border-cyan-600 rounded-xl px-4 py-2 flex items-center justify-between cursor-pointer transition shadow-2xs group"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
            <Barcode className="w-4 h-4 text-cyan-600 group-hover:scale-110 transition-transform" />
            <span>
              ចុចទីនេះដើម្បីបើក Form ស្កេនអីវ៉ាន់ (
              {activeTab === 'SCAN_IN'
                ? 'ScanIn'
                : activeTab === 'SCAN_OUT'
                ? 'ScanOut'
                : activeTab === 'HOLD_REMAINING'
                ? 'Hold នៅសល់'
                : 'Out of Delivery'}
              )
            </span>
          </div>
          <span className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1 group-hover:underline">
            + បើក Form
          </span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🔍 4. COMPACT SEARCH, FILTERS & VIEW MODE TOOLBAR */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#0c1424] border border-slate-200/90 dark:border-slate-800/80 rounded-2xl p-2 sm:p-2.5 shadow-2xs space-y-2">
        {/* Top Row: Search Input + Date Filter Pills */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
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
        <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Operator Filter */}
            {canViewAll ? (
              operators.length > 0 && (
                <select
                  value={operatorFilter}
                  onChange={(e) => setOperatorFilter(e.target.value)}
                  className="h-8 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs max-w-[140px] truncate"
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
                onChange={(e) => setFilterOperationCode(e.target.value)}
                className="h-8 px-2 rounded-xl border border-cyan-300 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-200 text-xs font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs max-w-[170px] truncate"
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
              className={`h-8 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs ${
                isFilterPanelOpen || activeFiltersCount > 0
                  ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
              }`}
              title="បើក/បិទ ផ្ទាំងចម្រាញ់ទិន្នន័យលម្អិត"
            >
              <Filter className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>ចម្រាញ់ <span className="hidden sm:inline">(Filters)</span></span>
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
              className={`h-8 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs ${
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
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-8 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:ring-2 focus:ring-cyan-500 shadow-2xs"
            >
              <option value="newest">ថ្មីបំផុត (Newest)</option>
              <option value="oldest">ចាស់បំផុត (Oldest)</option>
              <option value="barcode">តាម Barcode</option>
            </select>

            {/* View Mode Switcher (Table vs Card for iPad / Mobile) */}
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl text-xs">
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
                    : 'bg-purple-50 dark:bg-purple-950/50 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300'
                }`}
              >
                {activeTab === 'SCAN_IN' && 'តម្រងសម្រាប់: ចូលឃ្លាំង (ScanIn)'}
                {activeTab === 'SCAN_OUT' && 'តម្រងសម្រាប់: ចេញពីឃ្លាំង (ScanOut)'}
                {activeTab === 'OUT_OF_DELIVERY' && 'តម្រងសម្រាប់: ចេញចែកចាយ (Rider)'}
                {activeTab === 'HOLD_REMAINING' && 'តម្រងសម្រាប់: នៅសល់ក្នុងឃ្លាំង (Hold)'}
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
          {(activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') && (
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

          {/* 3. FILTER CONTROLS FOR HOLD_REMAINING (Hold Reason, Destination, Branch Target, Shelf Location, Date Range) */}
          {activeTab === 'HOLD_REMAINING' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
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

              {/* Filter 2: ទីតាំង / ខេត្ត-ក្រុង */}
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

              {/* Filter 3: សាខា / ខេត្តគោលដៅ */}
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

              {/* Filter 4: ធ្នើរ / កន្លែងទុក (Shelf Location) */}
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
        <div className="bg-white dark:bg-[#0c1424] border border-slate-200/90 dark:border-slate-800/80 rounded-2xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto max-h-[68vh] custom-scrollbar">
            <table className="w-full min-w-[960px] text-left border-collapse text-xs">
              <thead className="sticky top-0 z-20">
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
                  {(activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') && (
                    <>
                      <th className="py-2.5 px-3 min-w-[170px]">ទីតាំង / ខេត្ត-ក្រុង</th>
                      <th className="py-2.5 px-3 min-w-[150px]">Driver & Truck No</th>
                    </>
                  )}
                  {activeTab === 'HOLD_REMAINING' && (
                    <>
                      <th className="py-2.5 px-3 min-w-[170px]">ទីតាំង / ខេត្ត</th>
                      <th className="py-2.5 px-3 min-w-[220px]">មូលហេតុនៅសល់ក្នុងឃ្លាំង (Reason)</th>
                      <th className="py-2.5 px-3 min-w-[130px]">ធ្នើរ / កន្លែងទុក (Shelf)</th>
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
                  {(activeTab === 'OUT_OF_DELIVERY' || activeTab === 'HOLD_REMAINING') && (
                    <th className="py-2.5 px-3 min-w-[130px]">ចំណាំ</th>
                  )}
                  <th className="py-2.5 px-2.5 w-24 min-w-[96px] text-center md:sticky md:right-0 z-20 bg-slate-100 dark:bg-slate-900 md:border-l md:border-slate-200/60 md:dark:border-slate-800/60">
                    សកម្មភាព
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                {isLoading ? (
                  <tr>
                    <td colSpan={13} className="py-10 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-600" />
                      <span>កំពុងទាញយកទិន្នន័យ...</span>
                    </td>
                  </tr>
                ) : paginatedScans.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-10 text-center text-slate-400">
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
                        <td className="py-2 px-3 w-px whitespace-nowrap font-mono font-bold text-slate-900 dark:text-white md:sticky md:left-20 z-10 bg-white dark:bg-[#0c1424] group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 md:border-r md:border-slate-200/60 md:dark:border-slate-800/60 md:shadow-[2px_0_5px_rgba(0,0,0,0.03)]">
                          <div className="flex items-center gap-1.5 w-max">
                            <span>{item.barcode}</span>
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
                        {(activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') && (
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
                            </td>
                            <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                              {item.driverName || item.truckNo ? (
                                <div className="flex flex-col whitespace-nowrap">
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
                          </>
                        )}

                        {/* Destination, Reason, Shelf for Hold Remaining */}
                        {activeTab === 'HOLD_REMAINING' && (
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
                            </td>
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
                        {(activeTab === 'OUT_OF_DELIVERY' || activeTab === 'HOLD_REMAINING') && (
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
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="p-2 sm:p-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px]">
                ទំព័រ {currentPage} / {totalPages} (សរុប {filteredScans.length} ជួរ)
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
                return (
                  <div
                    key={item.id}
                    className={`bg-white dark:bg-[#0c1424] border rounded-xl p-3 shadow-2xs space-y-2 transition ${
                      selectedScanIds.has(item.id)
                        ? 'border-cyan-500 ring-2 ring-cyan-500/30 bg-cyan-50/20 dark:bg-cyan-950/20'
                        : 'border-slate-200/90 dark:border-slate-800/80 hover:border-cyan-400/50'
                    }`}
                  >
                    {/* Card Top: Select Checkbox + Barcode + Copy + Number */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedScanIds.has(item.id)}
                          onChange={() => handleToggleSelect(item.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500 cursor-pointer transition shrink-0"
                        />
                        <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-mono flex items-center justify-center shrink-0">
                          {globalIdx}
                        </span>
                        <span className="font-mono font-bold text-xs text-slate-900 dark:text-white truncate">
                          {item.barcode}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(item.barcode);
                            setCopiedId(item.id);
                            setTimeout(() => setCopiedId(null), 1500);
                          }}
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 cursor-pointer shrink-0"
                          title="Copy Barcode"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          item.scanType === 'SCAN_IN'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : item.scanType === 'SCAN_OUT'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            : item.scanType === 'HOLD_REMAINING'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                        }`}
                      >
                        {item.scanType === 'SCAN_IN'
                          ? 'ScanIn'
                          : item.scanType === 'SCAN_OUT'
                          ? 'ScanOut'
                          : item.scanType === 'HOLD_REMAINING'
                          ? 'Hold នៅសល់'
                          : 'Rider'}
                      </span>
                    </div>

                    {/* Card Middle: Key Info */}
                    <div className="space-y-1 text-xs border-t border-slate-100 dark:border-slate-800/80 pt-2">
                      {(activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT') && (
                        <>
                          <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                            <MapPin className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                            <span className="font-semibold truncate">{item.destination || '—'}</span>
                          </div>
                          {(item.driverName || item.truckNo) && (
                            <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                              {item.driverName && <span>👤 {item.driverName}</span>}
                              {item.truckNo && <span className="font-mono">🚛 {item.truckNo}</span>}
                            </div>
                          )}
                        </>
                      )}

                      {activeTab === 'HOLD_REMAINING' && (
                        <>
                          {item.destination && (
                            <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                              <MapPin className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                              <span className="font-semibold truncate">{item.destination}</span>
                            </div>
                          )}
                          {item.holdReason && (
                            <div className="text-[11px] text-purple-700 dark:text-purple-300 font-semibold bg-purple-50 dark:bg-purple-950/60 p-1.5 rounded-lg border border-purple-200/50">
                              ⚠️ {item.holdReason}
                            </div>
                          )}
                          {item.shelfLocation && (
                            <div className="text-[11px] text-amber-700 dark:text-amber-300 font-bold flex items-center gap-1">
                              <Archive className="w-3.5 h-3.5 text-amber-600" />
                              <span>ទីតាំង៖ {item.shelfLocation}</span>
                            </div>
                          )}
                          {item.remarks && (
                            <div className="text-[11px] text-slate-500 italic truncate">
                              "{item.remarks}"
                            </div>
                          )}
                        </>
                      )}

                      {activeTab === 'OUT_OF_DELIVERY' && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-blue-700 dark:text-blue-300">
                              🚴 {item.riderName || '—'}
                            </span>
                            {item.codAmount !== undefined && (
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
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

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                        <span>📅 {item.date} {formatCreatedAt(item.createdAt).slice(11)}</span>
                        <span className="truncate max-w-[110px]">{item.operatorEmail || item.createdBy || ''}</span>
                      </div>
                    </div>

                    {/* Card Bottom: Actions */}
                    <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                      {activeTab === 'HOLD_REMAINING' && remainingSubTab === 'UNDISPATCHED' ? (
                        <button
                          type="button"
                          onClick={() => handleQuickUpdateHold(item)}
                          className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-rose-600 text-white text-[11px] font-bold hover:from-purple-700 hover:to-rose-700 transition flex items-center gap-1 cursor-pointer shadow-xs"
                        >
                          <PackageCheck className="w-3 h-3" />
                          <span>Update នៅសល់</span>
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handlePrintOperationByCode(getOperationCode(item, scans))}
                            className="px-2 py-1 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 text-cyan-600 text-[11px] font-semibold rounded-lg transition cursor-pointer flex items-center gap-1"
                            title={`បោះពុម្ពប័ណ្ណប្រតិបត្តិការ (${getOperationCode(item, scans)})`}
                          >
                            <Printer className="w-3 h-3 text-cyan-600" />
                            <span>Print ({getOperationCode(item, scans)})</span>
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleEditItem(item)}
                              className="px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold rounded-lg transition cursor-pointer flex items-center gap-1"
                            >
                              <Edit2 className="w-3 h-3 text-cyan-600" />
                              <span>កែប្រែ</span>
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setItemToDelete(item)}
                              className="px-2 py-1 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 text-[11px] font-semibold rounded-lg transition cursor-pointer flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>លុប</span>
                            </button>
                          )}
                        </>
                      )}
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
          driverName={manifestData ? manifestData.driverName : (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT' ? driverName : undefined)}
          truckNo={manifestData ? manifestData.truckNo : (activeTab === 'SCAN_IN' || activeTab === 'SCAN_OUT' ? truckNo : undefined)}
          riderName={manifestData ? manifestData.riderName : (activeTab === 'OUT_OF_DELIVERY' ? riderName : undefined)}
          deliveryZone={manifestData ? manifestData.deliveryZone : (activeTab === 'OUT_OF_DELIVERY' ? deliveryZone : undefined)}
          holdReason={manifestData ? manifestData.holdReason : (activeTab === 'HOLD_REMAINING' ? holdReason : undefined)}
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
            <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-cyan-500/10 via-teal-500/10 to-transparent flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/20">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    ជ្រើសរើសប្រតិបត្តិការដើម្បីបោះពុម្ព (Print Operation)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    រកឃើញ {filteredOperationGroups.length} ប្រតិបត្តិការផ្សេងគ្នា ក្នុងចំណោម {filteredScans.length} កញ្ចប់
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpPrintModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: List of Operations */}
            <div className="p-3.5 sm:p-4 overflow-y-auto space-y-2.5 max-h-[60vh]">
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
