import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Barcode, 
  User, 
  Calendar, 
  DollarSign, 
  Save, 
  RefreshCw, 
  FileText, 
  Layers, 
  Download, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  Banknote,
  X,
  CreditCard,
  Building2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Sheet,
  Camera,
  LayoutGrid,
  History,
  Copy,
  Check,
  Send,
  Pill,
  Package,
  ArrowUpDown
} from 'lucide-react';
import { CollectionItem, CollectionBatch, AuthUser, Payer, DatabaseRecord, UserPermission, AppSettings } from '../types';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import { resolveOperator } from '../services/userPermissionService';
import { getCachedDataBM, fetchLiveBMData, matchBMRecord, MatchedBMRecord } from '../services/dataBMService';

// Code-split BarcodeScannerModal with React.lazy
const BarcodeScannerModal = React.lazy(() => 
  import('./BarcodeScannerModal').then(m => ({ default: m.BarcodeScannerModal }))
);

interface PaymentCollectionPageProps {
  currentUser: AuthUser | null;
  permissions?: UserPermission[];
  exchangeRate?: number;
  onCommitBatch: (batchData: Omit<CollectionBatch, 'id' | 'createdAt'>) => Promise<boolean>;
  savedBatches: CollectionBatch[];
  onDeleteBatch?: (id: string, batchNumber?: string) => Promise<boolean> | void;
  onDeleteAllBatches?: () => Promise<boolean> | void;
  payers?: Payer[];
  dataRecords?: DatabaseRecord[];
  onUpdateGoogleSheetColumns?: () => Promise<boolean>;
  onSyncFirebaseToGoogleSheets?: () => Promise<boolean>;
  onResendTelegramBatch?: (batch: CollectionBatch) => Promise<{ success: boolean; message: string }>;
  settings?: AppSettings;
  medicineBatches?: CollectionBatch[];
  onCommitMedicineBatch?: (batchData: Omit<CollectionBatch, 'id' | 'createdAt'>) => Promise<boolean>;
  onDeleteMedicineBatch?: (id: string, batchNumber?: string) => Promise<boolean> | void;
  onDeleteAllMedicineBatches?: () => Promise<boolean> | void;
  onResendMedicineTelegramBatch?: (batch: CollectionBatch) => Promise<{ success: boolean; message: string }>;
}

const PAYMENT_METHODS_GENERAL = [
  'Cash & Collect',
  'Cash',
  'Collect',
  'COD'
];

const PAYMENT_METHODS_MEDICINE = [
  'COD'
];

// Rich rotating color palettes for distinct individual batch cards
const BATCH_CARD_PALETTES = [
  {
    // 0: Sky Blue / Cyan (Modern Blue)
    lineGradient: 'before:bg-gradient-to-r before:from-sky-500 before:via-blue-500 before:to-indigo-500',
    badgeGradient: 'bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sky-500/25',
    badgeText: 'text-sky-100',
    batchTextHover: 'hover:text-blue-600 dark:hover:text-blue-400',
    hoverBg: 'hover:bg-sky-50/40 dark:hover:bg-sky-950/20',
  },
  {
    // 1: Purple / Violet (Royal Violet)
    lineGradient: 'before:bg-gradient-to-r before:from-purple-500 before:via-violet-500 before:to-pink-500',
    badgeGradient: 'bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow-purple-500/25',
    badgeText: 'text-purple-100',
    batchTextHover: 'hover:text-purple-600 dark:hover:text-purple-400',
    hoverBg: 'hover:bg-purple-50/40 dark:hover:bg-purple-950/20',
  },
  {
    // 2: Emerald / Mint Teal (Fresh Green)
    lineGradient: 'before:bg-gradient-to-r before:from-emerald-500 before:via-teal-400 before:to-green-500',
    badgeGradient: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/25',
    badgeText: 'text-emerald-100',
    batchTextHover: 'hover:text-emerald-600 dark:hover:text-emerald-400',
    hoverBg: 'hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20',
  },
  {
    // 3: Amber / Warm Orange (Sunset Orange)
    lineGradient: 'before:bg-gradient-to-r before:from-amber-500 before:via-orange-500 before:to-rose-400',
    badgeGradient: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-amber-500/25',
    badgeText: 'text-amber-100',
    batchTextHover: 'hover:text-amber-600 dark:hover:text-amber-400',
    hoverBg: 'hover:bg-amber-50/40 dark:hover:bg-amber-950/20',
  },
  {
    // 4: Rose / Pink / Coral (Vibrant Pink)
    lineGradient: 'before:bg-gradient-to-r before:from-rose-500 before:via-pink-500 before:to-fuchsia-500',
    badgeGradient: 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-rose-500/25',
    badgeText: 'text-rose-100',
    batchTextHover: 'hover:text-rose-600 dark:hover:text-rose-400',
    hoverBg: 'hover:bg-rose-50/40 dark:hover:bg-rose-950/20',
  },
  {
    // 5: Indigo / Electric Blue (Deep Indigo)
    lineGradient: 'before:bg-gradient-to-r before:from-indigo-500 before:via-blue-600 before:to-teal-500',
    badgeGradient: 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-indigo-500/25',
    badgeText: 'text-indigo-100',
    batchTextHover: 'hover:text-indigo-600 dark:hover:text-indigo-400',
    hoverBg: 'hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20',
  },
];

export const PaymentCollectionPage: React.FC<PaymentCollectionPageProps> = ({
  currentUser,
  permissions = [],
  exchangeRate = 4100,
  onCommitBatch,
  savedBatches,
  onDeleteBatch,
  onDeleteAllBatches,
  payers = [],
  dataRecords = [],
  onUpdateGoogleSheetColumns,
  onSyncFirebaseToGoogleSheets,
  onResendTelegramBatch,
  settings,
  medicineBatches = [],
  onCommitMedicineBatch,
  onDeleteMedicineBatch,
  onDeleteAllMedicineBatches,
  onResendMedicineTelegramBatch
}) => {
  const isViewer = currentUser?.role === 'VIEWER';
  const isAdmin = currentUser?.role === 'ADMIN';

  // Category Switcher: 'GENERAL' (ទទួលប្រាក់ទូទៅ) vs 'MEDICINE' (ទទួលលុយថ្នាំពេទ្យ)
  type CollectionCategory = 'GENERAL' | 'MEDICINE';
  const [collectionCategory, setCollectionCategory] = useState<CollectionCategory>(() => {
    const hash = window.location.hash.toLowerCase();
    if (hash === '#medicine' || hash === '#collection-medicine') return 'MEDICINE';
    const saved = localStorage.getItem('accounting_active_collection_category');
    return (saved === 'MEDICINE' || saved === 'GENERAL') ? saved : 'GENERAL';
  });

  const handleSelectCategory = (cat: CollectionCategory) => {
    setCollectionCategory(cat);
    localStorage.setItem('accounting_active_collection_category', cat);
    setScanError(null);
    setTracking('');
    setPaymentMethod(cat === 'MEDICINE' ? 'COD' : 'Cash & Collect');
    setTimeout(() => {
      trackingInputRef.current?.focus();
    }, 80);
  };

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.toLowerCase();
      if (h === '#medicine' || h === '#collection-medicine') {
        setCollectionCategory('MEDICINE');
        setPaymentMethod('COD');
      } else if (h === '#collection') {
        setCollectionCategory('GENERAL');
        setPaymentMethod('Cash & Collect');
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Data_BM Rows and Columns state for Medicine Collection
  const [dataBMRows, setDataBMRows] = useState<any[]>(() => getCachedDataBM().rows);
  const [dataBMCols, setDataBMCols] = useState<any[]>(() => getCachedDataBM().columns);
  const [isSyncingBM, setIsSyncingBM] = useState(false);
  const [bmLastSync, setBmLastSync] = useState<string | undefined>(() => getCachedDataBM().lastSync);

  // Live Refresh Data_BM from Google Sheets
  const handleRefreshBMData = async (silent = false) => {
    setIsSyncingBM(true);
    try {
      const res = await fetchLiveBMData(settings?.dataBmSheetUrl, settings?.dataBmSheetName);
      if (res.rows && res.rows.length > 0) {
        setDataBMRows(res.rows);
        setDataBMCols(res.columns);
        setBmLastSync(new Date().toISOString());
      }
    } catch (e) {
      console.warn('Failed to refresh Data_BM in PaymentCollectionPage:', e);
    } finally {
      setIsSyncingBM(false);
    }
  };

  useEffect(() => {
    if (collectionCategory === 'MEDICINE' && dataBMRows.length === 0 && !isSyncingBM) {
      handleRefreshBMData(true);
    }
  }, [collectionCategory, dataBMRows.length]);

  // 1. Form Inputs (Without individual amounts)
  const [tracking, setTracking] = useState('');
  const [name, setName] = useState('');
  const [isCustomName, setIsCustomName] = useState(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [date] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Searchable Combobox State for Customer/Payer Selection
  const [isPayerDropdownOpen, setIsPayerDropdownOpen] = useState(false);
  const [payerSearchQuery, setPayerSearchQuery] = useState('');
  const [highlightedPayerIndex, setHighlightedPayerIndex] = useState(0);
  const payerDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (payerDropdownRef.current && !payerDropdownRef.current.contains(e.target as Node)) {
        setIsPayerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter payers live based on search query
  const filteredPayers = useMemo(() => {
    const q = payerSearchQuery.trim().toLowerCase();
    // If empty query or query exactly equals current selected name, show all payers
    if (!q || q === name.trim().toLowerCase()) return payers;
    return payers.filter(p => 
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.phone && p.phone.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  }, [payers, payerSearchQuery, name]);

  // Reset highlight index when filtered results change
  useEffect(() => {
    setHighlightedPayerIndex(0);
  }, [filteredPayers.length]);

  const [scanError, setScanError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 1500);
  };

  // Audio Alerts using Web Audio API (Duplicate Error vs Success)
  const playDuplicateBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.setValueAtTime(180, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.38);
    } catch (e) { }
  };

  const playSuccessBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) { }
  };

  const [paymentMethod, setPaymentMethod] = useState(() => {
    const hash = window.location.hash.toLowerCase();
    const isMed = hash === '#medicine' || hash === '#collection-medicine' || localStorage.getItem('accounting_active_collection_category') === 'MEDICINE';
    return isMed ? 'COD' : 'Cash & Collect';
  });

  // Enforce COD exclusively for Medicine collection
  useEffect(() => {
    if (collectionCategory === 'MEDICINE') {
      setPaymentMethod('COD');
    }
  }, [collectionCategory]);
  const [isUpdatingColumns, setIsUpdatingColumns] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<CollectionBatch | null>(null);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [resendingBatchId, setResendingBatchId] = useState<string | null>(null);
  const [resendSuccessBatchId, setResendSuccessBatchId] = useState<string | null>(null);

  const handleResendTelegram = async (batch: CollectionBatch) => {
    const isMedicineBatch = batch.batchNumber.startsWith('MED-') || collectionCategory === 'MEDICINE';
    const resendFn = isMedicineBatch && onResendMedicineTelegramBatch ? onResendMedicineTelegramBatch : onResendTelegramBatch;
    if (!resendFn || resendingBatchId) return;
    setResendingBatchId(batch.id);
    try {
      const res = await resendFn(batch);
      if (res && res.success) {
        setResendSuccessBatchId(batch.id);
        playSuccessBeep();
        setTimeout(() => setResendSuccessBatchId(null), 2500);
      }
    } catch (e) {
      console.error('Resend Telegram error:', e);
    } finally {
      setResendingBatchId(null);
    }
  };

  // View Mode: 'SCAN_QUEUE' (Ultra-compact scanner & queue), 'SAVED_BATCHES' (History), or 'ALL' (Stacked)
  type CollectionViewMode = 'SCAN_QUEUE' | 'SAVED_BATCHES' | 'ALL';
  const [viewMode, setViewMode] = useState<CollectionViewMode>(() => {
    const saved = localStorage.getItem('accounting_collection_view_mode');
    if (saved === 'SAVED_BATCHES' || saved === 'ALL' || saved === 'SCAN_QUEUE') {
      return saved;
    }
    return 'SCAN_QUEUE';
  });

  const handleSetViewMode = (mode: CollectionViewMode) => {
    setViewMode(mode);
    localStorage.setItem('accounting_collection_view_mode', mode);
    if (mode === 'SCAN_QUEUE' || mode === 'ALL') {
      setTimeout(() => {
        trackingInputRef.current?.focus();
      }, 80);
    }
  };

  // 2. Queue / Staging Table State (General)
  const [queue, setQueue] = useState<CollectionItem[]>(() => {
    const saved = localStorage.getItem('accounting_staging_queue_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const unique: CollectionItem[] = [];
          const seen = new Set<string>();
          for (const item of parsed) {
            const key = (item.tracking || '').toLowerCase().trim();
            if (key && !seen.has(key)) {
              seen.add(key);
              unique.push({
                ...item,
                id: item.id || `item-init-${seen.size}-${Date.now()}`
              });
            }
          }
          return unique;
        }
      } catch (e) { }
    }
    return [];
  });

  // 2.1 Medicine Queue / Staging Table State
  const STORAGE_KEY_MEDICINE_QUEUE = 'accounting_medicine_staging_queue_v1';
  const [medicineQueue, setMedicineQueue] = useState<CollectionItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_MEDICINE_QUEUE);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const unique: CollectionItem[] = [];
          const seen = new Set<string>();
          for (const item of parsed) {
            const key = (item.tracking || '').toLowerCase().trim();
            if (key && !seen.has(key)) {
              seen.add(key);
              unique.push({
                ...item,
                id: item.id || `med-item-init-${seen.size}-${Date.now()}`
              });
            }
          }
          return unique;
        }
      } catch (e) { }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MEDICINE_QUEUE, JSON.stringify(medicineQueue));
  }, [medicineQueue]);

  // Active helpers based on current collectionCategory
  const activeQueue = collectionCategory === 'MEDICINE' ? medicineQueue : queue;
  const activeBatches = collectionCategory === 'MEDICINE' ? medicineBatches : savedBatches;

  // Synchronous atomic tracking cache Set to prevent async race conditions during rapid camera scans
  const scannedCacheRef = useRef<Set<string>>(new Set());
  const scannedMedicineCacheRef = useRef<Set<string>>(new Set());

  // Keep scannedCacheRef synchronized with General queue and savedBatches
  useEffect(() => {
    const set = new Set<string>();
    queue.forEach(it => {
      const c = sanitizeTrackingCode(it.tracking).toLowerCase();
      if (c) set.add(c);
    });
    savedBatches.forEach(b => {
      if (Array.isArray(b.items)) {
        b.items.forEach(it => {
          const c = sanitizeTrackingCode(it.tracking).toLowerCase();
          if (c) set.add(c);
        });
      }
    });
    scannedCacheRef.current = set;
  }, [queue, savedBatches]);

  // Keep scannedMedicineCacheRef synchronized with Medicine queue and medicineBatches
  useEffect(() => {
    const set = new Set<string>();
    medicineQueue.forEach(it => {
      const c = sanitizeTrackingCode(it.tracking).toLowerCase();
      if (c) set.add(c);
    });
    medicineBatches.forEach(b => {
      if (Array.isArray(b.items)) {
        b.items.forEach(it => {
          const c = sanitizeTrackingCode(it.tracking).toLowerCase();
          if (c) set.add(c);
        });
      }
    });
    scannedMedicineCacheRef.current = set;
  }, [medicineQueue, medicineBatches]);

  const handleCameraScanSuccess = (decodedText: string): { success: boolean; message?: string } => {
    const trackingClean = sanitizeTrackingCode(decodedText);
    if (!trackingClean) {
      return { success: false, message: 'លេខកូដទទេ' };
    }

    if (isViewer) {
      playDuplicateBeep();
      const msg = '⚠️ គណនីរបស់អ្នកមានសិទ្ធិមើលប៉ុណ្ណោះ (Viewer - Read Only) មិនអាចបញ្ចូលទិន្នន័យបានទេ!';
      setScanError(msg);
      return { success: false, message: msg };
    }

    const keyLower = trackingClean.toLowerCase();

    // MEDICINE MODE SCANNING
    if (collectionCategory === 'MEDICINE') {
      if (scannedMedicineCacheRef.current.has(keyLower)) {
        playDuplicateBeep();
        const inQueueIdx = medicineQueue.findIndex(
          item => sanitizeTrackingCode(item.tracking).toLowerCase() === keyLower
        );
        if (inQueueIdx !== -1) {
          const msg = `❌ លេខកូដថ្នាំពេទ្យ «${trackingClean}» នេះមានក្នុងតារាងបណ្តោះអាសន្នរួចហើយ (ជួរទី ${inQueueIdx + 1})!`;
          setScanError(msg);
          return { success: false, message: msg };
        }
        for (const batch of medicineBatches) {
          if (Array.isArray(batch.items) && batch.items.some(it => sanitizeTrackingCode(it.tracking).toLowerCase() === keyLower)) {
            const dateStr = batch.createdAt ? new Date(batch.createdAt).toLocaleDateString('km-KH') : '';
            const msg = `⛔ លេខកូដថ្នាំពេទ្យ «${trackingClean}» នេះធ្លាប់បានបញ្ចូលរួចហើយ ក្នុងកញ្ចប់ ${batch.batchNumber}${dateStr ? ` (${dateStr})` : ''}!`;
            setScanError(msg);
            return { success: false, message: msg };
          }
        }
        const genericMsg = `❌ លេខកូដ «${trackingClean}» នេះត្រូវបានកត់ត្រារួចហើយ!`;
        setScanError(genericMsg);
        return { success: false, message: genericMsg };
      }

      // Lookup in Data_BM
      const matchBM = matchBMRecord(trackingClean, dataBMRows, dataBMCols);
      const nameTrimmed = name.trim();
      const effectiveName = nameTrimmed || matchBM?.handleBy || '';

      if (!effectiveName) {
        playDuplicateBeep();
        const msg = '⚠️ សូមជ្រើសរើស ឬបញ្ចូលឈ្មោះអ្នកប្រគល់ប្រាក់ (Payer / Handle By) ជាមុនសិន!';
        setScanError(msg);
        return { success: false, message: msg };
      }

      if (!nameTrimmed && matchBM?.handleBy) {
        setName(matchBM.handleBy);
      }

      scannedMedicineCacheRef.current.add(keyLower);

      const newItem: CollectionItem = {
        id: 'med-item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        tracking: trackingClean,
        name: effectiveName,
        date: matchBM && matchBM.deliveryDate ? matchBM.deliveryDate : date,
        paymentMethod: 'COD',
        usd: matchBM ? matchBM.usd : 0,
        khm: matchBM ? matchBM.khm : 0,
        lookupFound: !!matchBM,
        createdAt: new Date().toISOString()
      };

      setMedicineQueue(prev => [newItem, ...prev]);
      playSuccessBeep();
      setScanError(null);
      setTracking('');

      const priceText = matchBM ? (matchBM.usd ? `$${matchBM.usd.toFixed(2)}` : (matchBM.khm ? `${matchBM.khm.toLocaleString()}៛` : '')) : '';
      return {
        success: true,
        message: `✅ បានបញ្ចូលជោគជ័យ ${priceText ? `(${priceText})` : ''} ${matchBM?.handleBy ? `[${matchBM.handleBy}]` : ''}`
      };
    }

    // GENERAL MODE SCANNING
    const nameTrimmed = name.trim();
    if (!nameTrimmed) {
      playDuplicateBeep();
      const msg = '⚠️ សូមជ្រើសរើស ឬបញ្ចូលឈ្មោះអ្នកប្រគល់ប្រាក់ (Payer) ជាមុនសិន!';
      setScanError(msg);
      return { success: false, message: msg };
    }

    // 0. Synchronous Mutex Check: Immediate race condition protection
    if (scannedCacheRef.current.has(keyLower)) {
      playDuplicateBeep();
      // Find where it exists
      const inQueueIdx = queue.findIndex(
        item => sanitizeTrackingCode(item.tracking).toLowerCase() === keyLower
      );
      if (inQueueIdx !== -1) {
        const msg = `❌ លេខកូដ «${trackingClean}» នេះមានក្នុងតារាងបណ្តោះអាសន្នរួចហើយ (ជួរទី ${inQueueIdx + 1})!`;
        setScanError(msg);
        return { success: false, message: msg };
      }
      for (const batch of savedBatches) {
        if (Array.isArray(batch.items) && batch.items.some(it => sanitizeTrackingCode(it.tracking).toLowerCase() === keyLower)) {
          const dateStr = batch.createdAt ? new Date(batch.createdAt).toLocaleDateString('km-KH') : '';
          const msg = `⛔ លេខកូដ «${trackingClean}» នេះធ្លាប់បានបញ្ចូលរួចហើយ ក្នុងកញ្ចប់ ${batch.batchNumber}${dateStr ? ` (${dateStr})` : ''}!`;
          setScanError(msg);
          return { success: false, message: msg };
        }
      }
      const genericMsg = `❌ លេខកូដ «${trackingClean}» នេះត្រូវបានកត់ត្រារួចហើយ!`;
      setScanError(genericMsg);
      return { success: false, message: genericMsg };
    }

    // Atomic claim: Add immediately to memory set
    scannedCacheRef.current.add(keyLower);

    // Lookup barcode in Data table (Data_Account from Google Sheets)
    const match = dataRecords.find(r => sanitizeTrackingCode(r.barcode).toLowerCase() === keyLower);

    const newItem: CollectionItem = {
      id: 'item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      tracking: trackingClean,
      name: nameTrimmed,
      date: match && match.date ? match.date : date,
      paymentMethod: match && match.payment ? match.payment : paymentMethod,
      usd: match ? match.usd : 0,
      khm: match ? match.khm : 0,
      lookupFound: !!match,
      createdAt: new Date().toISOString()
    };

    setQueue(prev => [newItem, ...prev]);
    playSuccessBeep();
    setScanError(null);
    setTracking('');

    const priceText = match ? (match.usd ? `$${match.usd.toFixed(2)}` : (match.khm ? `${match.khm.toLocaleString()}៛` : '')) : '';
    return {
      success: true,
      message: `✅ បានបញ្ចូលជោគជ័យ ${priceText ? `(${priceText})` : ''}`
    };
  };

  const handleOpenScanner = () => {
    if (collectionCategory === 'GENERAL' && !name.trim()) {
      playDuplicateBeep();
      setScanError('⚠️ សូមជ្រើសរើស ឬបញ្ចូលឈ្មោះអ្នកប្រគល់ប្រាក់ (Payer) ជាមុនសិន មុនពេលបើក Camera Scan!');
      setIsPayerDropdownOpen(true);
      return;
    }
    setIsCameraScannerOpen(true);
  };

  // Real-time Duplicate Detection (both in active Queue & in all active Saved Batches)
  const duplicateInfo = useMemo(() => {
    const t = tracking.trim().toLowerCase();
    if (!t) return null;

    // Check 1: Already in Current Active Staging Queue
    const inQueueIndex = activeQueue.findIndex(item => item.tracking.toLowerCase().trim() === t);
    if (inQueueIndex !== -1) {
      return {
        type: 'IN_QUEUE' as const,
        message: `លេខកូដ «${tracking.trim()}» នេះមានក្នុងតារាងបណ្តោះអាសន្នរួចហើយ (#${inQueueIndex + 1}) — មិនអាចបញ្ចូលស្ទួនបានទេ!`,
        index: inQueueIndex + 1
      };
    }

    // Check 2: Already in Active Saved Batches History
    for (const batch of activeBatches) {
      if (Array.isArray(batch.items)) {
        const found = batch.items.find(item => item.tracking.toLowerCase().trim() === t);
        if (found) {
          const dateStr = batch.createdAt ? new Date(batch.createdAt).toLocaleDateString('km-KH') : '';
          return {
            type: 'IN_BATCH' as const,
            message: `លេខកូដ «${tracking.trim()}» នេះធ្លាប់បានបញ្ចូល និងរក្សាទុករួចហើយក្នុងកញ្ចប់ ${batch.batchNumber}${dateStr ? ` (${dateStr})` : ''} — មិនអនុញ្ញាតឱ្យបញ្ចូលម្តងទៀតដាច់ខាត!`,
            batchNumber: batch.batchNumber,
            date: dateStr
          };
        }
      }
    }

    return null;
  }, [tracking, activeQueue, activeBatches]);

  // Clear scanError when user changes tracking input
  useEffect(() => {
    if (scanError) {
      setScanError(null);
    }
  }, [tracking]);

  // Save general queue to localStorage
  useEffect(() => {
    localStorage.setItem('accounting_staging_queue_v2', JSON.stringify(queue));
  }, [queue]);

  // Modal State for Committing Batch Total & Reconciliation
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [bankReceivedUSD, setBankReceivedUSD] = useState('');
  const [bankReceivedKHR, setBankReceivedKHR] = useState('');
  const [cashReceivedUSD, setCashReceivedUSD] = useState('');
  const [cashReceivedKHR, setCashReceivedKHR] = useState('');
  const [batchNote, setBatchNote] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);

  // History & Filters (Group by Date & Sort by Last Recorded)
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [isGroupedByDate, setIsGroupedByDate] = useState<boolean>(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const trackingInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus Tracking / AWBN input box automatically on mount, tab change, or modal close
  useEffect(() => {
    const timer = setTimeout(() => {
      trackingInputRef.current?.focus();
    }, 80);
    return () => clearTimeout(timer);
  }, [collectionCategory, viewMode, isCameraScannerOpen]);

  // Refocus tracking input when the user returns to the browser tab/window
  useEffect(() => {
    const handleWindowFocus = () => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag !== 'INPUT' && activeTag !== 'SELECT' && activeTag !== 'TEXTAREA') {
        trackingInputRef.current?.focus();
      }
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, []);

  // Live Lookup in Data Table while typing/scanning barcode
  const lookupMatch = useMemo(() => {
    const t = tracking.trim().toLowerCase();
    if (!t) return null;
    if (collectionCategory === 'MEDICINE') {
      const matchBM = matchBMRecord(tracking, dataBMRows, dataBMCols);
      if (matchBM) {
        return {
          id: matchBM.awbn,
          barcode: matchBM.awbn,
          payment: 'COD',
          usd: matchBM.usd,
          khm: matchBM.khm,
          date: matchBM.deliveryDate,
          customerName: matchBM.handleBy,
          rider: matchBM.handleBy,
          isMedicine: true
        };
      }
      return null;
    }
    return dataRecords.find(r => r.barcode.toLowerCase() === t) || null;
  }, [tracking, collectionCategory, dataRecords, dataBMRows, dataBMCols]);

  // When lookupMatch is found, auto-fill payment method or rider name
  useEffect(() => {
    if (lookupMatch) {
      if (collectionCategory === 'MEDICINE') {
        setPaymentMethod('COD');
      } else if (lookupMatch.payment) {
        setPaymentMethod(lookupMatch.payment);
      }
      if (collectionCategory === 'MEDICINE' && lookupMatch.customerName && !name.trim()) {
        setName(lookupMatch.customerName);
      }
    }
  }, [lookupMatch, collectionCategory]);

  // Backfill existing queue items with lookup data when dataRecords is loaded
  useEffect(() => {
    if (dataRecords.length === 0) return;
    setQueue(prevQueue => {
      let changed = false;
      const updated = prevQueue.map(item => {
        const match = dataRecords.find(r => r.barcode.toLowerCase() === item.tracking.toLowerCase());
        if (match && (!item.lookupFound || item.usd === undefined || item.khm === undefined)) {
          changed = true;
          return {
            ...item,
            date: match.date || item.date,
            paymentMethod: match.payment || item.paymentMethod,
            usd: match.usd,
            khm: match.khm,
            lookupFound: true
          };
        }
        return item;
      });
      return changed ? updated : prevQueue;
    });
  }, [dataRecords]);

  // Method Counts & Live Sums for active Queue (with Cash vs Bank breakdown)
  const queueStats = useMemo(() => {
    let cashCollectCount = 0;
    let otherCount = 0;
    let totalUSD = 0;
    let totalKHR = 0;
    let cashUSD = 0;
    let cashKHR = 0;
    let bankUSD = 0;
    let bankKHR = 0;
    let lookupCount = 0;

    activeQueue.forEach(item => {
      const pm = (item.paymentMethod || '').trim().toUpperCase();
      const isCash = pm === 'CASH & COLLECT' || pm === 'CASH' || pm === 'COD';
      const usdVal = Number(item.usd) || 0;
      const khrVal = Number(item.khm) || 0;

      if (isCash) {
        cashCollectCount++;
        cashUSD += usdVal;
        cashKHR += khrVal;
      } else {
        otherCount++;
        bankUSD += usdVal;
        bankKHR += khrVal;
      }
      totalUSD += usdVal;
      totalKHR += khrVal;
      if (item.lookupFound || usdVal > 0 || khrVal > 0) {
        lookupCount++;
      }
    });

    return {
      total: activeQueue.length,
      cashCollectCount,
      otherCount,
      totalUSD,
      totalKHR,
      cashUSD,
      cashKHR,
      bankUSD,
      bankKHR,
      lookupCount
    };
  }, [activeQueue]);

  // Trackings in Queue without amount (neither USD nor KHM)
  const itemsWithoutAmount = useMemo(() => {
    return activeQueue.filter(item => (Number(item.usd) || 0) <= 0 && (Number(item.khm) || 0) <= 0);
  }, [activeQueue]);
  const hasItemsWithoutAmount = itemsWithoutAmount.length > 0;

  // Auto-clean any existing duplicates in queue state if they existed before
  useEffect(() => {
    const seen = new Set<string>();
    let hasDuplicate = false;
    for (const item of queue) {
      const key = (item.tracking || '').toLowerCase().trim();
      if (seen.has(key)) {
        hasDuplicate = true;
        break;
      }
      seen.add(key);
    }
    if (hasDuplicate) {
      const cleanList: CollectionItem[] = [];
      const cleanSet = new Set<string>();
      for (const item of queue) {
        const key = (item.tracking || '').toLowerCase().trim();
        if (key && !cleanSet.has(key)) {
          cleanSet.add(key);
          cleanList.push(item);
        }
      }
      setQueue(cleanList);
    }
  }, [queue]);

  // Auto-clean any existing duplicates in medicineQueue state
  useEffect(() => {
    const seen = new Set<string>();
    let hasDuplicate = false;
    for (const item of medicineQueue) {
      const key = (item.tracking || '').toLowerCase().trim();
      if (seen.has(key)) {
        hasDuplicate = true;
        break;
      }
      seen.add(key);
    }
    if (hasDuplicate) {
      const cleanList: CollectionItem[] = [];
      const cleanSet = new Set<string>();
      for (const item of medicineQueue) {
        const key = (item.tracking || '').toLowerCase().trim();
        if (key && !cleanSet.has(key)) {
          cleanSet.add(key);
          cleanList.push(item);
        }
      }
      setMedicineQueue(cleanList);
    }
  }, [medicineQueue]);

  // Add Item into Queue with Auto-Lookup from Data (or Data_BM for Medicine)
  const handleAddToQueue = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (isViewer) {
      setScanError('⚠️ គណនីរបស់អ្នកមានសិទ្ធិមើលប៉ុណ្ណោះ (Viewer - Read Only) មិនអាចបញ្ចូលទិន្នន័យបានទេ!');
      return;
    }

    const trackingTrimmed = sanitizeTrackingCode(tracking);

    if (!trackingTrimmed) {
      setScanError('សូមបញ្ចូលលេខ Tracking ឬលេខកូដកញ្ចប់!');
      trackingInputRef.current?.focus();
      return;
    }

    const keyLower = trackingTrimmed.toLowerCase();

    // 0. Synchronous Mutex Check
    const activeCache = collectionCategory === 'MEDICINE' ? scannedMedicineCacheRef : scannedCacheRef;
    if (activeCache.current.has(keyLower)) {
      playDuplicateBeep();
      const inQueueIndex = activeQueue.findIndex(
        item => sanitizeTrackingCode(item.tracking).toLowerCase() === keyLower
      );
      if (inQueueIndex !== -1) {
        setScanError(`❌ លេខកូដ «${trackingTrimmed}» នេះមានក្នុងតារាងបណ្តោះអាសន្នរួចហើយ (ជួរទី ${inQueueIndex + 1})! មិនអនុញ្ញាតឱ្យបញ្ចូលស្ទួនដាច់ខាត!`);
        trackingInputRef.current?.select();
        return;
      }
      for (const batch of activeBatches) {
        if (Array.isArray(batch.items) && batch.items.some(it => sanitizeTrackingCode(it.tracking).toLowerCase() === keyLower)) {
          const dateStr = batch.createdAt ? new Date(batch.createdAt).toLocaleDateString('km-KH') : '';
          setScanError(`⛔ លេខកូដ «${trackingTrimmed}» នេះធ្លាប់បានបញ្ចូល និងរក្សាទុករួចហើយ ក្នុងកញ្ចប់ ${batch.batchNumber}${dateStr ? ` (${dateStr})` : ''}! មិនអនុញ្ញាតឱ្យបញ្ចូលម្តងទៀតជាដាច់ខាត!`);
          trackingInputRef.current?.select();
          return;
        }
      }
      setScanError(`❌ លេខកូដ «${trackingTrimmed}» នេះត្រូវបានកត់ត្រារួចហើយ!`);
      trackingInputRef.current?.select();
      return;
    }

    // Medicine Mode Handle
    if (collectionCategory === 'MEDICINE') {
      const matchBM = matchBMRecord(trackingTrimmed, dataBMRows, dataBMCols);
      const nameTrimmed = name.trim();
      const effectiveName = nameTrimmed || matchBM?.handleBy || '';

      if (!effectiveName) {
        setScanError('សូមជ្រើសរើស ឬបញ្ចូលឈ្មោះអ្នកប្រគល់ប្រាក់ (Handle By / Rider)!');
        return;
      }

      if (!nameTrimmed && matchBM?.handleBy) {
        setName(matchBM.handleBy);
      }

      // Atomic claim
      activeCache.current.add(keyLower);

      const newItem: CollectionItem = {
        id: 'med-item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        tracking: trackingTrimmed,
        name: effectiveName,
        date: matchBM && matchBM.deliveryDate ? matchBM.deliveryDate : date,
        paymentMethod: 'COD',
        usd: matchBM ? matchBM.usd : 0,
        khm: matchBM ? matchBM.khm : 0,
        lookupFound: !!matchBM,
        createdAt: new Date().toISOString()
      };

      setMedicineQueue(prev => [newItem, ...prev]);
      playSuccessBeep();
      setScanError(null);
      setTracking('');
      trackingInputRef.current?.focus();
      return;
    }

    // General Mode Handle
    const nameTrimmed = name.trim();
    if (!nameTrimmed) {
      setScanError('សូមជ្រើសរើស ឬបញ្ចូលឈ្មោះអ្នកប្រគល់ប្រាក់!');
      return;
    }

    // Atomic claim
    activeCache.current.add(keyLower);

    // Lookup barcode in Data table (Data_Account from Google Sheets)
    const match = dataRecords.find(r => sanitizeTrackingCode(r.barcode).toLowerCase() === keyLower);

    const newItem: CollectionItem = {
      id: 'item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      tracking: trackingTrimmed,
      name: nameTrimmed,
      date: match && match.date ? match.date : date,
      paymentMethod: match && match.payment ? match.payment : paymentMethod,
      usd: match ? match.usd : 0,
      khm: match ? match.khm : 0,
      lookupFound: !!match,
      createdAt: new Date().toISOString()
    };

    setQueue(prev => [newItem, ...prev]);
    playSuccessBeep();
    setScanError(null);

    // Reset Form for next rapid scan
    setTracking('');
    trackingInputRef.current?.focus();
  };

  // Remove Item from active Queue
  const handleRemoveFromQueue = (id: string) => {
    if (collectionCategory === 'MEDICINE') {
      setMedicineQueue(prev => {
        const filtered = prev.filter(item => item.id !== id);
        if (filtered.length === 0) {
          localStorage.removeItem(STORAGE_KEY_MEDICINE_QUEUE);
        }
        return filtered;
      });
      return;
    }
    setQueue(prev => {
      const filtered = prev.filter(item => item.id !== id);
      if (filtered.length === 0) {
        localStorage.removeItem('accounting_staging_queue_v2');
        localStorage.removeItem('accounting_staging_queue');
      }
      return filtered;
    });
  };

  // Clear Entire active Queue
  const [confirmClearQueue, setConfirmClearQueue] = useState(false);

  useEffect(() => {
    if (confirmClearQueue) {
      const timer = setTimeout(() => setConfirmClearQueue(false), 4500);
      return () => clearTimeout(timer);
    }
  }, [confirmClearQueue]);

  const handleClearQueue = () => {
    if (collectionCategory === 'MEDICINE') {
      setMedicineQueue([]);
      setName('');
      setIsCustomName(false);
      setTracking('');
      setScanError(null);
      setPaymentMethod('COD');
      localStorage.removeItem(STORAGE_KEY_MEDICINE_QUEUE);
      setConfirmClearQueue(false);
      return;
    }
    setQueue([]);
    setName('');
    setIsCustomName(false);
    setTracking('');
    setScanError(null);
    setPaymentMethod('Cash & Collect');
    localStorage.removeItem('accounting_staging_queue_v2');
    localStorage.removeItem('accounting_staging_queue');
    setConfirmClearQueue(false);
  };

  // Open Commit Modal with Pre-filled Live Totals (Auto populated from active Queue)
  const handleOpenCommitModal = () => {
    if (isViewer) {
      alert('គណនីរបស់អ្នកមានសិទ្ធិមើលប៉ុណ្ណោះ (Viewer - Read Only) មិនអាចរក្សាទុកកញ្ចប់បានឡើយ!');
      return;
    }
    if (activeQueue.length === 0) {
      alert('តារាងបណ្តោះអាសន្ននៅទំនេរ! សូមបញ្ចូលទិន្នន័យយ៉ាងហោចណាស់ ១ ជាមុនសិន។');
      return;
    }
    if (hasItemsWithoutAmount) {
      const sampleList = itemsWithoutAmount.slice(0, 5).map(it => `• ${it.tracking} (${it.name || 'គ្មានឈ្មោះ'})`).join('\n');
      const moreText = itemsWithoutAmount.length > 5 ? `\n... និង ${itemsWithoutAmount.length - 5} ទៀត` : '';
      alert(`❌ មិនអនុញ្ញាតឱ្យរក្សាទុកសរុបជាដាច់ខាត!\n\nមានចំនួន ${itemsWithoutAmount.length} Tracking មិនទាន់មានចំនួនទឹកប្រាក់ USD ($) ឬ KHM (៛) ឡើយ៖\n${sampleList}${moreText}\n\n⚠️ បញ្ជាក់៖ មិនអនុញ្ញាតឱ្យរក្សាទុកសរុបមួយប្រតិបត្តិការនេះឡើយ។ សូមពិនិត្យ ឬលុប Tracking ទាំងនេះចេញពីតារាងបណ្តោះអាសន្នជាមុនសិន!`);
      return;
    }
    setBankReceivedUSD(queueStats.bankUSD > 0 ? queueStats.bankUSD.toFixed(2) : (queueStats.cashUSD === 0 && queueStats.totalUSD > 0 ? queueStats.totalUSD.toFixed(2) : ''));
    setBankReceivedKHR(queueStats.bankKHR > 0 ? String(queueStats.bankKHR) : (queueStats.cashKHR === 0 && queueStats.totalKHR > 0 ? String(queueStats.totalKHR) : ''));
    setCashReceivedUSD(queueStats.cashUSD > 0 ? queueStats.cashUSD.toFixed(2) : '');
    setCashReceivedKHR(queueStats.cashKHR > 0 ? String(queueStats.cashKHR) : '');
    setBatchNote('');
    setIsCommitModalOpen(true);
  };

  // Confirm & Commit Batch with Totals & Verification
  const handleConfirmCommit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isViewer) {
      alert('គណនីរបស់អ្នកមានសិទ្ធិមើលប៉ុណ្ណោះ (Viewer - Read Only) មិនអាចរក្សាទុកកញ្ចប់បានឡើយ!');
      return;
    }

    if (hasItemsWithoutAmount || activeQueue.some(item => (Number(item.usd) || 0) <= 0 && (Number(item.khm) || 0) <= 0)) {
      alert('❌ មិនអនុញ្ញាតឱ្យរក្សាទុកសរុបជាដាច់ខាត! មាន Tracking មិនទាន់មានចំនួនទឹកប្រាក់ USD ($) ឬ KHM (៛) ឡើយ។ សូមពិនិត្យ ឬលុបចេញពីតារាងជាមុនសិន។');
      return;
    }

    const numBankUSD = parseFloat(bankReceivedUSD) || 0;
    const numBankKHR = parseFloat(bankReceivedKHR) || 0;
    const numCashUSD = parseFloat(cashReceivedUSD) || 0;
    const numCashKHR = parseFloat(cashReceivedKHR) || 0;
    const totalUSD = queueStats.totalUSD;
    const totalKHR = queueStats.totalKHR;

    const actualTotalUSD = numBankUSD + numCashUSD;
    const actualTotalKHR = numBankKHR + numCashKHR;

    const diffUSDVal = actualTotalUSD - totalUSD;
    const diffKHRVal = actualTotalKHR - totalKHR;
    const isMatchedUSDVal = Math.abs(diffUSDVal) < 0.005;
    const isMatchedKHRVal = Math.abs(diffKHRVal) < 0.5;
    const isAllBalancedVal = isMatchedUSDVal && isMatchedKHRVal;

    let recStatus: 'BALANCED' | 'SHORTAGE' | 'SURPLUS' = 'BALANCED';
    let recSummary = '✓ គ្រប់ចំនួន (Balanced 100%)';

    if (!isAllBalancedVal) {
      if (diffUSDVal < -0.005 || diffKHRVal < -0.5) {
        recStatus = 'SHORTAGE';
        const parts: string[] = [];
        if (diffUSDVal < -0.005) parts.push(`-$${Math.abs(diffUSDVal).toFixed(2)}`);
        if (diffKHRVal < -0.5) parts.push(`-${Math.abs(diffKHRVal).toLocaleString()}៛`);
        recSummary = `⚠️ ខ្វះប្រាក់ (${parts.join(', ')})`;
      } else {
        recStatus = 'SURPLUS';
        const parts: string[] = [];
        if (diffUSDVal > 0.005) parts.push(`+$${diffUSDVal.toFixed(2)}`);
        if (diffKHRVal > 0.5) parts.push(`+${diffKHRVal.toLocaleString()}៛`);
        recSummary = `ℹ️ លើសប្រាក់ (${parts.join(', ')})`;
      }
    }

    if (totalUSD <= 0 && totalKHR <= 0 && actualTotalUSD <= 0 && actualTotalKHR <= 0) {
      if (!window.confirm('ទឹកប្រាក់សរុប និងទឹកប្រាក់ជាក់ស្តែងសុទ្ធតែជា 0។ តើអ្នកចង់បន្តរក្សាទុកកញ្ចប់នេះដែរឬទេ?')) {
        return;
      }
    }

    setIsCommitting(true);
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randStr = Math.floor(1000 + Math.random() * 9000);
    const prefix = collectionCategory === 'MEDICINE' ? 'MED' : 'BATCH';
    const batchNumber = `${prefix}-${dateStr}-${randStr}`;

    const batchData: Omit<CollectionBatch, 'id' | 'createdAt'> = {
      batchNumber,
      totalItems: activeQueue.length,
      totalUSD,
      totalKHR,
      bankUSD: numBankUSD > 0 ? numBankUSD : undefined,
      bankKHR: numBankKHR > 0 ? numBankKHR : undefined,
      cashUSD: numCashUSD > 0 ? numCashUSD : undefined,
      cashKHR: numCashKHR > 0 ? numCashKHR : undefined,
      reconciliation: recSummary,
      reconciliationStatus: recStatus,
      diffUSD: diffUSDVal,
      diffKHR: diffKHRVal,
      operator: resolveOperator(currentUser, permissions).name,
      operatorEmail: resolveOperator(currentUser, permissions).email,
      notes: batchNote.trim() || undefined,
      items: [...activeQueue]
    };

    let success = false;
    if (collectionCategory === 'MEDICINE') {
      if (onCommitMedicineBatch) {
        success = await onCommitMedicineBatch(batchData);
      } else {
        success = await onCommitBatch(batchData);
      }
      if (success) {
        setMedicineQueue([]);
        setName('');
        setIsCustomName(false);
        setTracking('');
        setScanError(null);
        setPaymentMethod('COD');
        localStorage.removeItem(STORAGE_KEY_MEDICINE_QUEUE);
        setIsCommitModalOpen(false);
        handleSetViewMode('SAVED_BATCHES');
      }
    } else {
      success = await onCommitBatch(batchData);
      if (success) {
        setQueue([]);
        setName('');
        setIsCustomName(false);
        setTracking('');
        setScanError(null);
        setPaymentMethod('Cash & Collect');
        localStorage.removeItem('accounting_staging_queue_v2');
        localStorage.removeItem('accounting_staging_queue');
        setIsCommitModalOpen(false);
        handleSetViewMode('SAVED_BATCHES');
      }
    }

    setIsCommitting(false);
  };

  // Filter Saved Batches from activeBatches and sort by last recorded
  const filteredBatches = useMemo(() => {
    let list = activeBatches;
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      list = activeBatches.filter(b => 
        b.batchNumber.toLowerCase().includes(q) ||
        b.operator.toLowerCase().includes(q) ||
        (b.notes && b.notes.toLowerCase().includes(q)) ||
        (b.items && b.items.some(i => i.tracking.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)))
      );
    }
    return [...list].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime() || 0;
      const timeB = new Date(b.createdAt || 0).getTime() || 0;
      if (timeA !== timeB) {
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      }
      return sortOrder === 'desc'
        ? (b.batchNumber || '').localeCompare(a.batchNumber || '')
        : (a.batchNumber || '').localeCompare(b.batchNumber || '');
    });
  }, [activeBatches, historySearch, sortOrder]);

  // Helper to extract standard date key (YYYY-MM-DD) from batch createdAt or batchNumber
  const getBatchDateKey = (dateStr?: string, batchNumber?: string): string => {
    if (dateStr) {
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        }
      } catch {}
    }
    if (batchNumber) {
      const match = batchNumber.match(/(?:BATCH|MED)-(\d{2})(\d{2})(\d{2})-/i);
      if (match) {
        const [, yy, mm, dd] = match;
        return `20${yy}-${mm}-${dd}`;
      }
    }
    return 'unknown';
  };

  // Helper to format date header in Khmer & Gregorian
  const formatGroupDateHeader = (dateKey: string) => {
    if (dateKey === 'unknown') {
      return {
        title: 'កាលបរិច្ឆេទមិនច្បាស់លាស់ (Unknown Date)',
        badgeDate: '—',
        relativeBadge: undefined,
        isToday: false,
        isYesterday: false
      };
    }

    const [yearStr, monthStr, dayStr] = dateKey.split('-');
    const y = Number(yearStr);
    const m = Number(monthStr);
    const d = Number(dayStr);
    const dateObj = new Date(y, m - 1, d);

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    const yesterdayObj = new Date();
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterdayKey = `${yesterdayObj.getFullYear()}-${String(yesterdayObj.getMonth() + 1).padStart(2, '0')}-${String(yesterdayObj.getDate()).padStart(2, '0')}`;

    const isToday = dateKey === todayKey;
    const isYesterday = dateKey === yesterdayKey;

    let khmerWeekday = '';
    let khmerFullDate = '';
    try {
      khmerWeekday = dateObj.toLocaleDateString('km-KH', { weekday: 'long' });
      khmerFullDate = dateObj.toLocaleDateString('km-KH', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      khmerWeekday = '';
      khmerFullDate = `${dayStr}/${monthStr}/${yearStr}`;
    }

    const weekdayPrefix = khmerWeekday ? (khmerWeekday.startsWith('ថ្ងៃ') ? khmerWeekday : `ថ្ងៃ${khmerWeekday}`) : '';
    const fullTitle = weekdayPrefix ? `${weekdayPrefix} • ${khmerFullDate}` : khmerFullDate;
    const relativeBadge = isToday ? '✨ ថ្ងៃនេះ (Today)' : isYesterday ? 'ម្សិលមិញ (Yesterday)' : undefined;

    return {
      title: fullTitle,
      badgeDate: `${dayStr}/${monthStr}/${yearStr}`,
      relativeBadge,
      isToday,
      isYesterday
    };
  };

  // Group filteredBatches by Date modified / recorded
  const dateGroups = useMemo(() => {
    const groupsMap = new Map<string, CollectionBatch[]>();

    filteredBatches.forEach(batch => {
      const key = getBatchDateKey(batch.createdAt, batch.batchNumber);
      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
      }
      groupsMap.get(key)!.push(batch);
    });

    const sortedKeys = Array.from(groupsMap.keys()).sort((a, b) => {
      if (a === 'unknown') return 1;
      if (b === 'unknown') return -1;
      return sortOrder === 'desc' ? b.localeCompare(a) : a.localeCompare(b);
    });

    return sortedKeys.map(key => {
      const batches = groupsMap.get(key) || [];
      const totalBatches = batches.length;
      let totalItems = 0;
      let totalUSD = 0;
      let totalKHR = 0;
      let bankUSD = 0;
      let bankKHR = 0;
      let cashUSD = 0;
      let cashKHR = 0;

      batches.forEach(b => {
        totalItems += b.totalItems || (b.items?.length || 0);
        totalUSD += b.totalUSD || 0;
        totalKHR += b.totalKHR || 0;
        bankUSD += b.bankUSD || 0;
        bankKHR += b.bankKHR || 0;
        cashUSD += b.cashUSD || 0;
        cashKHR += b.cashKHR || 0;
      });

      return {
        dateKey: key,
        headerInfo: formatGroupDateHeader(key),
        batches,
        totalBatches,
        totalItems,
        totalUSD,
        totalKHR,
        bankUSD,
        bankKHR,
        cashUSD,
        cashKHR
      };
    });
  }, [filteredBatches, sortOrder]);

  const toggleDateGroup = (dateKey: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [dateKey]: !prev[dateKey]
    }));
  };

  const allGroupsCollapsed = useMemo(() => {
    if (dateGroups.length === 0) return false;
    return dateGroups.every(g => !!collapsedGroups[g.dateKey]);
  }, [dateGroups, collapsedGroups]);

  const toggleAllGroups = () => {
    if (allGroupsCollapsed) {
      setCollapsedGroups({});
    } else {
      const next: Record<string, boolean> = {};
      dateGroups.forEach(g => {
        next[g.dateKey] = true;
      });
      setCollapsedGroups(next);
    }
  };

  // Helper to format ISO/date string to local DateTime (YYYY-MM-DD HH:mm:ss)
  const formatDateTimeForCSV = (dateStr?: string): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch {
      return String(dateStr);
    }
  };

  const formatDateOnlyForCSV = (dateStr?: string, fallbackCreatedAt?: string): string => {
    if (!dateStr) {
      if (fallbackCreatedAt) {
        return formatDateTimeForCSV(fallbackCreatedAt).split(' ')[0];
      }
      return '';
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || /^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
      return dateStr;
    }
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return String(dateStr);
    }
  };

  // Export Batch CSV with Looked-up columns matching UI & Google Sheets
  const handleExportCSV = (batch: CollectionBatch) => {
    const formattedCreatedAt = formatDateTimeForCSV(batch.createdAt);
    const headers = ['Batch_ID', 'Tracking', 'Customer_Name', 'PAYMENT', 'USD', 'KHM', 'DATE', 'Created_At'];
    const rows = batch.items.map(i => [
      batch.batchNumber,
      `"${i.tracking}"`,
      `"${i.name}"`,
      `"${i.paymentMethod || 'CASH'}"`,
      i.usd !== undefined ? i.usd : 0,
      i.khm !== undefined ? i.khm : 0,
      `"${formatDateOnlyForCSV(i.date, batch.createdAt)}"`,
      `"${formattedCreatedAt}"`
    ]);
    const summaryRow = [
      `"TOTAL ITEMS: ${batch.totalItems}"`,
      `"TOTAL USD: $${batch.totalUSD}"`,
      `"TOTAL KHR: ${batch.totalKHR} KHR"`,
      `"BANK USD: $${batch.bankUSD || 0}"`,
      `"BANK KHR: ${batch.bankKHR || 0} KHR"`,
      `"CASH USD: $${batch.cashUSD || 0}"`,
      `"CASH KHR: ${batch.cashKHR || 0} KHR"`,
      `"RECONCILIATION: ${batch.reconciliation || 'គ្រប់ចំនួន (Balanced 100%)'}"`,
      `"OPERATOR: ${batch.operator}"`,
      `"DATE: ${formattedCreatedAt}"`,
      `"BATCH NOTE: ${batch.notes || ''}"`
    ];
    const csvContent = [headers.join(','), ...rows.map(r => r.join(',')), '', summaryRow.join(',')].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${batch.batchNumber}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // State for syncing Firebase batches to Google Sheets
  const [isSyncingToSheets, setIsSyncingToSheets] = useState(false);

  // Handle sync from Firebase to Google Sheets
  const handleSyncToSheets = async () => {
    if (onSyncFirebaseToGoogleSheets) {
      setIsSyncingToSheets(true);
      try {
        await onSyncFirebaseToGoogleSheets();
      } finally {
        setIsSyncingToSheets(false);
      }
    } else if (onUpdateGoogleSheetColumns) {
      handleUpdateColumns();
    }
  };

  // Handle direct Google Sheets column update
  const handleUpdateColumns = async () => {
    if (!onUpdateGoogleSheetColumns) return;
    setIsUpdatingColumns(true);
    try {
      await onUpdateGoogleSheetColumns();
    } finally {
      setIsUpdatingColumns(false);
    }
  };

  // Live Reconciliation Computations for Commit Modal
  const numBankUSD = parseFloat(bankReceivedUSD) || 0;
  const numBankKHR = parseFloat(bankReceivedKHR) || 0;
  const numCashUSD = parseFloat(cashReceivedUSD) || 0;
  const numCashKHR = parseFloat(cashReceivedKHR) || 0;

  const actualTotalUSD = numBankUSD + numCashUSD;
  const actualTotalKHR = numBankKHR + numCashKHR;

  const diffUSD = actualTotalUSD - queueStats.totalUSD;
  const diffKHR = actualTotalKHR - queueStats.totalKHR;

  const isMatchedUSD = Math.abs(diffUSD) < 0.005;
  const isMatchedKHR = Math.abs(diffKHR) < 0.5;
  const isAllBalanced = isMatchedUSD && isMatchedKHR;

  return (
    <div className="space-y-2.5 sm:space-y-3 animate-in fade-in duration-200">

      {/* 1. Sleek Compact Header & Mode Switcher Bar with Highlight Gradient (Mobile/Tablet only) */}
      <div className="relative overflow-hidden bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/20 dark:from-slate-900 dark:via-blue-950/20 dark:to-slate-900 rounded-2xl p-2.5 sm:p-3.5 border border-blue-200/70 dark:border-blue-900/50 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-2.5 before:absolute before:top-0 before:left-0 before:right-0 before:h-1 lg:before:hidden before:bg-gradient-to-r before:from-blue-600 before:via-indigo-500 before:to-emerald-500">
        
        {/* Left: Title & Live Status */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight">
                ទិន្នន័យប្រាក់ (Payment Collection)
              </h2>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Data Live Sync
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500">
              ស្កេន ឬបញ្ចូលលេខកូដ Tracking ដើម្បីប្រមូលទិន្នន័យស្វ័យប្រវត្តិចូល Data
            </p>
          </div>
        </div>

        {/* Center / Right: Mode Switcher Tabs + Actions (50%/50% split on mobile/iPad) */}
        <div className="flex items-center gap-1.5 sm:gap-2 w-full md:w-auto">
          
          {/* Segmented View Mode Switcher */}
          <div className="flex-1 md:flex-none grid grid-cols-2 md:inline-flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-750 gap-1">
            <button
              type="button"
              onClick={() => handleSetViewMode('SCAN_QUEUE')}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'SCAN_QUEUE'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>ស្កេន & តារាង</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                viewMode === 'SCAN_QUEUE'
                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold'
                  : 'bg-slate-200 dark:bg-slate-750 text-slate-600 dark:text-slate-300'
              }`}>
                {activeQueue.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSetViewMode('SAVED_BATCHES')}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'SAVED_BATCHES'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>ប្រវត្តិកញ្ចប់</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                viewMode === 'SAVED_BATCHES'
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold'
                  : 'bg-slate-200 dark:bg-slate-750 text-slate-600 dark:text-slate-300'
              }`}>
                {activeBatches.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSetViewMode('ALL')}
              className={`hidden md:flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'ALL'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="បង្ហាញទាំងពីររួមគ្នា (Split/Stacked View)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden xl:inline text-[11px]">មើលទាំងអស់</span>
            </button>
          </div>

          {/* Sync Firebase to Google Sheets */}
          {(onSyncFirebaseToGoogleSheets || onUpdateGoogleSheetColumns) && (
            <button
              id="btn-sync-firebase-to-sheets"
              type="button"
              onClick={handleSyncToSheets}
              disabled={isSyncingToSheets || isUpdatingColumns}
              className="shrink-0 flex items-center justify-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-2xs"
              title="ទាញទិន្នន័យកញ្ចប់ និងមុខទំនិញពី Firebase ចូលទៅកាន់ Google Sheets (Batches & Items)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingToSheets ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncingToSheets ? 'Syncing...' : 'Sync to Sheets'}</span>
            </button>
          )}

        </div>

      </div>

      {/* Category Selection Tabs Bar: General (Data_Account) vs Medicine (Data_BM) */}
      <div className="flex items-center justify-between p-1.5 sm:p-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-[280px]">
          <button
            type="button"
            onClick={() => setCollectionCategory('GENERAL')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
              collectionCategory === 'GENERAL'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-750'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>ទទួលប្រាក់ទូទៅ (Data)</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              collectionCategory === 'GENERAL'
                ? 'bg-white/20 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}>
              {queue.length}
            </span>
          </button>

          <button
            id="tab-medicine-collection"
            type="button"
            onClick={() => setCollectionCategory('MEDICINE')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
              collectionCategory === 'MEDICINE'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-750'
            }`}
          >
            <Pill className="w-4 h-4 text-emerald-300" />
            <span>ទទួលលុយថ្នាំពេទ្យ (Data_BM)</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              collectionCategory === 'MEDICINE'
                ? 'bg-white/20 text-white font-bold'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}>
              {medicineQueue.length}
            </span>
          </button>
        </div>

        {/* Live Data Sync Badge / Refresh Button for Data_BM */}
        {collectionCategory === 'MEDICINE' ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 font-medium text-[11px]">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              <span>ភ្ជាប់ Data_BM ({dataBMRows.length} ជួរ)</span>
            </span>
            <button
              type="button"
              onClick={() => handleRefreshBMData(false)}
              disabled={isSyncingBM}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition active:scale-95 cursor-pointer"
              title="ទាញទិន្នន័យ Data_BM ថ្មីពី Google Sheets"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncingBM ? 'animate-spin' : ''}`} />
              <span className="text-[11px]">{isSyncingBM ? 'កំពុងទាញ...' : 'Refresh BM'}</span>
            </button>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-medium text-[11px]">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span>ភ្ជាប់ Data ({dataRecords.length} ជួរ)</span>
            </span>
          </div>
        )}
      </div>

      {/* Viewer Mode Banner */}
      {isViewer && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span><strong>សិទ្ធិមើលប៉ុណ្ណោះ (Viewer - Read Only)៖</strong> គណនីរបស់អ្នកអាចត្រួតពិនិត្យ និងទាញយករបាយការណ៍បានប៉ុណ្ណោះ មិនអាចបន្ថែម កែប្រែ រក្សាទុកកញ្ចប់ ឬលុបទិន្នន័យបានឡើយ។</span>
        </div>
      )}

      {/* 2. Scanning Workspace (Form + Metrics Ribbon + Queue Table) */}
      {(viewMode === 'SCAN_QUEUE' || viewMode === 'ALL') && (
        <div className="space-y-2.5 sm:space-y-3">
          
          {/* Form បញ្ចូលទិន្នន័យទទួលប្រាក់ (High Density, Fast Scan) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-visible relative z-20">
            <div className="px-3 py-1.5 sm:px-3.5 sm:py-2 border-b border-slate-100 dark:border-slate-850 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  ១. Form បញ្ចូលទិន្នន័យ (Scan & Add)
                </h3>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                📅 {date}
              </span>
            </div>

            <form onSubmit={handleAddToQueue} className="p-2 sm:p-3">
              <div className="grid grid-cols-2 lg:grid-cols-12 gap-2 items-start">
                
                {/* 1. Date (Desktop only, mobile shows in header) */}
                <div className="hidden lg:block lg:col-span-2">
                  <label className="block font-bold text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-400 mb-0.5 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-blue-600" />
                    <span>កាលបរិច្ឆេទ</span>
                    <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 ml-auto">⚡Auto</span>
                  </label>
                  <div className="h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center font-mono font-bold text-xs text-slate-800 dark:text-slate-200">
                    {date}
                  </div>
                </div>

                {/* 2. Tracking / Barcode - 2 cols on mobile, 4 cols on desktop */}
                <div className="col-span-2 lg:col-span-4">
                  <div className="flex items-center justify-between mb-0.5">
                    <label htmlFor="input-col-tracking" className="font-bold text-[10px] sm:text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Barcode className="w-3 h-3 text-blue-600" />
                      <span>{collectionCategory === 'MEDICINE' ? 'AWBN / លេខកូដថ្នាំពេទ្យ' : 'លេខ Tracking / កូដកញ្ចប់'}</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleOpenScanner}
                      className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                      title="បើកកាមេរ៉ាស្កេន"
                    >
                      <Camera className="w-2.5 h-2.5" />
                      <span>Camera</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="input-col-tracking"
                      ref={trackingInputRef}
                      type="text"
                      required
                      autoFocus
                      placeholder={collectionCategory === 'MEDICINE' ? "ឧ. BM001 / AWBN..." : "ឧ. TRK-88991..."}
                      value={tracking}
                      onChange={(e) => setTracking(e.target.value)}
                      className={`w-full h-8 sm:h-9 pl-2.5 pr-16 sm:pr-18 rounded-xl font-mono text-xs focus:outline-none font-bold transition ${
                        duplicateInfo
                          ? 'border-2 border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-100 focus:ring-2 focus:ring-rose-500/40 shadow-xs'
                          : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600'
                      }`}
                    />
                    <button
                      id="btn-open-camera-scanner"
                      type="button"
                      onClick={handleOpenScanner}
                      className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] sm:text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:hover:bg-blue-900/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition active:scale-95 cursor-pointer shadow-2xs"
                      title="បើក Camera Scan Barcode / QR Code"
                    >
                      <Camera className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                      <span>Scan</span>
                    </button>
                  </div>

                  {/* Duplicate warning alert banner */}
                  {duplicateInfo && (
                    <div className="mt-1 flex items-start gap-1.5 text-[11px] bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-900 px-2.5 py-1.5 rounded-xl text-rose-800 dark:text-rose-200 font-semibold animate-in fade-in slide-in-from-top-1 duration-150 shadow-2xs">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      <div className="flex-1 leading-snug">
                        <span>{duplicateInfo.message}</span>
                      </div>
                    </div>
                  )}

                  {/* Scan error if any */}
                  {!duplicateInfo && scanError && (
                    <div className="mt-1 flex items-start gap-1.5 text-[11px] bg-rose-50 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-900 px-2.5 py-1.5 rounded-xl text-rose-800 dark:text-rose-200 font-semibold animate-in fade-in slide-in-from-top-1 duration-150 shadow-2xs">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      <div className="flex-1 leading-snug">
                        <span>{scanError}</span>
                      </div>
                    </div>
                  )}
                  {lookupMatch && (
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 px-2 py-0.5 rounded-lg text-emerald-800 dark:text-emerald-300 animate-in fade-in duration-150">
                      <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">{collectionCategory === 'MEDICINE' ? 'Data_BM:' : 'Data:'}</span>
                      {lookupMatch.customerName && <span>{lookupMatch.customerName} •</span>}
                      <span>{lookupMatch.payment || '—'}</span>
                      <span>•</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">${lookupMatch.usd !== undefined ? lookupMatch.usd.toFixed(2) : '0.00'}</span>
                      <span>•</span>
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{lookupMatch.khm !== undefined ? lookupMatch.khm.toLocaleString() : '0'} ៛</span>
                    </div>
                  )}
                </div>

                {/* 3. Payer Name Selection Dropdown - 2 cols on mobile, 3 cols on desktop */}
                <div className="col-span-2 lg:col-span-3 relative z-30">
                  <div className="flex items-center justify-between mb-0.5">
                    <label htmlFor={isCustomName ? "input-col-name-custom" : "select-col-name"} className="font-bold text-[10px] sm:text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-500" />
                      <span>អ្នកប្រគល់ប្រាក់</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    {!isCustomName ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomName(true);
                          setName('');
                        }}
                        className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        + ឈ្មោះថ្មី
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomName(false);
                          setName('');
                        }}
                        className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        List ▾
                      </button>
                    )}
                  </div>

                  {!isCustomName ? (
                    <div ref={payerDropdownRef} className="relative">
                      <div className="relative flex items-center">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none" />
                        <input
                          id="select-col-name"
                          type="text"
                          required
                          autoComplete="off"
                          placeholder="ជ្រើសរើសអ្នកប្រគល់..."
                          value={isPayerDropdownOpen ? payerSearchQuery : name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPayerSearchQuery(val);
                            if (!isPayerDropdownOpen) setIsPayerDropdownOpen(true);
                          }}
                          onFocus={(e) => {
                            setPayerSearchQuery(name);
                            setIsPayerDropdownOpen(true);
                            e.target.select();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              if (!isPayerDropdownOpen) setIsPayerDropdownOpen(true);
                              setHighlightedPayerIndex(prev => Math.min(prev + 1, Math.max(0, filteredPayers.length - 1)));
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setHighlightedPayerIndex(prev => Math.max(prev - 1, 0));
                            } else if (e.key === 'Enter') {
                              if (isPayerDropdownOpen) {
                                e.preventDefault();
                                if (filteredPayers.length > 0) {
                                  const chosen = filteredPayers[highlightedPayerIndex] || filteredPayers[0];
                                  if (chosen) {
                                    setName(chosen.name);
                                    setPayerSearchQuery(chosen.name);
                                    setIsPayerDropdownOpen(false);
                                    setTimeout(() => trackingInputRef.current?.focus(), 60);
                                  }
                                } else if (payerSearchQuery.trim()) {
                                  setName(payerSearchQuery.trim());
                                  setIsPayerDropdownOpen(false);
                                  setTimeout(() => trackingInputRef.current?.focus(), 60);
                                }
                              }
                            } else if (e.key === 'Escape') {
                              setIsPayerDropdownOpen(false);
                            }
                          }}
                          className={`w-full h-8 sm:h-9 pl-8 pr-14 rounded-xl border bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-xs transition ${
                            isPayerDropdownOpen 
                              ? 'border-blue-500 ring-2 ring-blue-500/20' 
                              : 'border-slate-300 dark:border-slate-700'
                          }`}
                        />
                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                          {(name || payerSearchQuery) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setName('');
                                setPayerSearchQuery('');
                                setIsPayerDropdownOpen(true);
                              }}
                              className="p-1 rounded-md text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                              title="លុបឈ្មោះចេញ (Clear)"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const next = !isPayerDropdownOpen;
                              setIsPayerDropdownOpen(next);
                              if (next) {
                                setPayerSearchQuery(name);
                              }
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                            title="បើក/បិទបញ្ជីឈ្មោះ"
                          >
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isPayerDropdownOpen ? 'rotate-180 text-blue-600' : ''}`} />
                          </button>
                        </div>
                      </div>

                      {/* Floating Dropdown List */}
                      {isPayerDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950/70 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="font-semibold">
                              {filteredPayers.length} ឈ្មោះ {payerSearchQuery && payerSearchQuery !== name ? 'ត្រូវគ្នានឹងការស្វែងរក' : 'សរុប'}
                            </span>
                            {payerSearchQuery && payerSearchQuery !== name && (
                              <button
                                type="button"
                                onClick={() => setPayerSearchQuery('')}
                                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                              >
                                បង្ហាញទាំងអស់
                              </button>
                            )}
                          </div>

                          {/* Options list */}
                          <div className="overflow-y-auto max-h-52 divide-y divide-slate-100 dark:divide-slate-800/60">
                            {filteredPayers.length === 0 ? (
                              <div className="p-3.5 text-center text-xs text-slate-400">
                                <p className="mb-2">មិនមានឈ្មោះត្រូវនឹង «{payerSearchQuery}» ឡើយ</p>
                                {payerSearchQuery.trim() && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setName(payerSearchQuery.trim());
                                      setIsPayerDropdownOpen(false);
                                      setTimeout(() => trackingInputRef.current?.focus(), 60);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 font-bold hover:bg-blue-100 transition cursor-pointer text-xs"
                                  >
                                    ✍️ ជ្រើសរើសប្រើឈ្មោះ «{payerSearchQuery.trim()}»
                                  </button>
                                )}
                              </div>
                            ) : (
                              filteredPayers.map((p, idx) => {
                                const isSelected = name.trim().toLowerCase() === p.name.trim().toLowerCase();
                                const isHighlighted = idx === highlightedPayerIndex;
                                return (
                                  <div
                                    key={p.id || idx}
                                    onClick={() => {
                                      setName(p.name);
                                      setPayerSearchQuery(p.name);
                                      setIsPayerDropdownOpen(false);
                                      setTimeout(() => trackingInputRef.current?.focus(), 60);
                                    }}
                                    onMouseEnter={() => setHighlightedPayerIndex(idx)}
                                    className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between transition ${
                                      isSelected
                                        ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold'
                                        : isHighlighted
                                        ? 'bg-slate-100/90 dark:bg-slate-800 text-slate-900 dark:text-white'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-200'
                                    }`}
                                  >
                                    <div className="min-w-0 pr-2">
                                      <div className="flex items-center gap-1.5 truncate">
                                        <span className="font-semibold">{p.name}</span>
                                        {p.category && (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold shrink-0">
                                            {p.category}
                                          </span>
                                        )}
                                      </div>
                                      {p.phone && (
                                        <div className="text-[10px] text-slate-400 font-mono">
                                          {p.phone}
                                        </div>
                                      )}
                                    </div>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* Footer custom option */}
                          <div className="p-1.5 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-100 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={() => {
                                setIsCustomName(true);
                                setIsPayerDropdownOpen(false);
                                setName('');
                              }}
                              className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer flex items-center gap-1.5"
                            >
                              <span>✍️</span>
                              <span>បញ្ចូលឈ្មោះថ្មីដោយផ្ទាល់ (Custom Input)...</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative flex items-center">
                      <input
                        id="input-col-name-custom"
                        type="text"
                        required
                        placeholder="ឧ. លោក សុខា..."
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        className="w-full h-8 sm:h-9 pl-2.5 pr-16 sm:pr-18 rounded-xl border border-blue-400 dark:border-blue-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomName(false);
                          setName('');
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                      >
                        List ▾
                      </button>
                    </div>
                  )}
                </div>

                {/* 4. Payment Method Dropdown - 1 col on mobile, 2 cols on desktop */}
                <div className="col-span-1 lg:col-span-2">
                  <label htmlFor="select-col-payment-method" className="block font-bold text-[10px] sm:text-[11px] text-slate-700 dark:text-slate-300 mb-0.5 flex items-center gap-1">
                    <CreditCard className="w-3 h-3 text-blue-600" />
                    <span>វិធីសាស្ត្រ</span>
                  </label>
                  <div className="relative">
                    <select
                      id="select-col-payment-method"
                      value={collectionCategory === 'MEDICINE' ? 'COD' : paymentMethod}
                      onChange={(e) => {
                        if (collectionCategory !== 'MEDICINE') {
                          setPaymentMethod(e.target.value);
                        }
                      }}
                      disabled={collectionCategory === 'MEDICINE'}
                      className={`w-full h-8 sm:h-9 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-[11px] sm:text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 appearance-none pr-6 shadow-xs truncate ${
                        collectionCategory === 'MEDICINE' ? 'bg-slate-100/80 dark:bg-slate-900 text-blue-700 dark:text-blue-300 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      {collectionCategory === 'MEDICINE' ? (
                        <option value="COD">COD</option>
                      ) : (
                        PAYMENT_METHODS_GENERAL.map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))
                      )}
                    </select>
                    {collectionCategory !== 'MEDICINE' && (
                      <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    )}
                  </div>
                </div>

                {/* 5. Submit Button - 1 col on mobile, 1 col on desktop */}
                <div className="col-span-1 lg:col-span-1 pt-3.5 sm:pt-4.5">
                  <button
                    id="btn-add-to-queue"
                    type="submit"
                    disabled={isViewer || !!duplicateInfo}
                    className={`w-full h-8 sm:h-9 rounded-xl font-bold text-xs transition shadow-xs flex items-center justify-center gap-1 ${
                      isViewer || duplicateInfo
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60'
                        : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-95'
                    }`}
                    title={isViewer ? 'សិទ្ធិមើលប៉ុណ្ណោះ (Read Only)' : duplicateInfo ? 'មិនអាចបញ្ចូលបានទេ (លេខកូដជាន់គ្នា)' : 'ចុច Enter ដើម្បីបញ្ចូល'}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Enter</span>
                  </button>
                </div>

              </div>
            </form>
          </div>

          {/* Compact Live Metric Bar & Action Ribbon */}
          {/* A. Mobile Compact Bar (Saves vertical space) */}
          <div className="sm:hidden flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs gap-2">
            <div className="flex items-center gap-1.5 text-xs font-mono min-w-0">
              <span className="font-bold text-slate-800 dark:text-slate-100 shrink-0">{queueStats.total} កញ្ចប់</span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">${queueStats.totalUSD.toFixed(2)}</span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="font-bold text-blue-600 dark:text-blue-400 shrink-0">{queueStats.totalKHR.toLocaleString()} ៛</span>
            </div>
            {!isViewer && (
              <button
                type="button"
                onClick={handleOpenCommitModal}
                disabled={activeQueue.length === 0 || hasItemsWithoutAmount}
                title={hasItemsWithoutAmount ? `មិនអាចរក្សាទុកបានទេ៖ មាន ${itemsWithoutAmount.length} កញ្ចប់គ្មានទឹកប្រាក់` : undefined}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs shrink-0 flex items-center gap-1 transition ${
                  hasItemsWithoutAmount || activeQueue.length === 0
                    ? 'bg-slate-300 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-95'
                }`}
              >
                <Save className="w-3 h-3" />
                <span>រក្សាទុក</span>
              </button>
            )}
          </div>

          {/* B. Tablet/Desktop Metric Bar */}
          <div className="hidden sm:flex bg-white dark:bg-slate-900 rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 dark:border-slate-800 shadow-xs flex-wrap items-center justify-between gap-2.5">
            
            {/* 4 Stats Inline Badges */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              
              {/* Stat 1: Queue Items */}
              <div className="flex items-center gap-2 pr-2 sm:pr-3 border-r border-slate-200/80 dark:border-slate-800">
                <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400">កញ្ចប់ក្នុងតារាង</div>
                  <div className="text-sm font-black font-mono text-slate-900 dark:text-white leading-tight">
                    {queueStats.total} <span className="text-[10px] font-normal text-slate-400">កញ្ចប់</span>
                  </div>
                </div>
              </div>

              {/* Stat 2: USD Total */}
              <div className="flex items-center gap-2 pr-2 sm:pr-3 border-r border-slate-200/80 dark:border-slate-800">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <DollarSign className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">សរុបជា USD</div>
                  <div className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400 leading-tight">
                    ${queueStats.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Stat 3: KHM Total */}
              <div className="flex items-center gap-2 pr-2 sm:pr-3 border-r border-slate-200/80 dark:border-slate-800">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Banknote className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">សរុបជា KHM</div>
                  <div className="text-sm font-black font-mono text-indigo-600 dark:text-indigo-400 leading-tight">
                    {queueStats.totalKHR.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">៛</span>
                  </div>
                </div>
              </div>

              {/* Stat 4: Matched in Data / Data_BM */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400">ក្នុង {collectionCategory === 'MEDICINE' ? 'Data_BM' : 'Data'}</div>
                  <div className="text-sm font-black font-mono text-amber-600 dark:text-amber-400 leading-tight">
                    {queueStats.lookupCount} <span className="text-[10px] font-normal text-slate-400">/ {queueStats.total}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Action Buttons: Clean Queue & Save Batch */}
            <div className="flex items-center gap-2 ml-auto">
              {!isViewer && activeQueue.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearQueue}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer flex items-center gap-1"
                  title="សម្អាតតារាងបណ្តោះអាសន្នទាំងអស់"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">សម្អាត</span>
                </button>
              )}

              {isViewer ? (
                <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs font-semibold flex items-center gap-1.5 border border-slate-200 dark:border-slate-700">
                  <span>🔒 មើលប៉ុណ្ណោះ (Read Only)</span>
                </div>
              ) : (
                <button
                  id="btn-save-batch-total"
                  type="button"
                  onClick={handleOpenCommitModal}
                  disabled={activeQueue.length === 0 || hasItemsWithoutAmount}
                  title={hasItemsWithoutAmount ? `មិនអាចរក្សាទុកបានទេ៖ មាន ${itemsWithoutAmount.length} កញ្ចប់គ្មានទឹកប្រាក់ USD/KHM` : undefined}
                  className={`px-4 py-2 rounded-xl font-bold text-xs transition shadow-sm flex items-center justify-center gap-1.5 ${
                    hasItemsWithoutAmount || activeQueue.length === 0
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-95'
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>រក្សាទុកសរុប ({activeQueue.length} កញ្ចប់) 💾</span>
                </button>
              )}
            </div>

          </div>

          {/* Staging Queue Table Container (Compact, High-Density) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
            
            {/* Queue Table Header */}
            <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-850 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  ២. តារាងទិន្នន័យបណ្តោះអាសន្ន {collectionCategory === 'MEDICINE' ? '(ថ្នាំពេទ្យ - Staging Queue)' : '(Staging Queue)'}
                </h3>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                  {activeQueue.length} ជួរ
                </span>
              </div>
              
              {activeQueue.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {confirmClearQueue ? (
                    <div className="flex items-center gap-1 animate-in fade-in zoom-in-95 duration-150">
                      <button
                        type="button"
                        onClick={handleClearQueue}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1 cursor-pointer transition shadow-xs active:scale-95"
                        title="ចុចដើម្បីសម្អាតទាំងអស់ភ្លាមៗ"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>យល់ព្រមសម្អាត ({activeQueue.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearQueue(false)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        title="បោះបង់"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmClearQueue(true)}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                      title="សម្អាតតារាងបណ្តោះអាសន្នទាំងអស់"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>សម្អាតចោល</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Warning Banner: Items missing amount */}
            {hasItemsWithoutAmount && (
              <div className="px-3.5 py-2.5 bg-rose-50 dark:bg-rose-950/50 border-b border-rose-200 dark:border-rose-900/80 flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <span className="font-bold">មិនអនុញ្ញាតឱ្យរក្សាទុកសរុបជាដាច់ខាត៖ </span>
                  <span>មាន <b>{itemsWithoutAmount.length}</b> Tracking មិនទាន់មានចំនួនទឹកប្រាក់ USD ($) ឬ KHM (៛) ឡើយ! សូមពិនិត្យ ឬលុបចេញពីតារាងបណ្តោះអាសន្ន។</span>
                </div>
              </div>
            )}

            {/* Queue Table Rows & Mobile Card List */}
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              {activeQueue.length === 0 ? (
                <div className="py-6 px-4 text-center text-slate-400 space-y-1.5">
                  <Layers className="w-7 h-7 mx-auto opacity-30 text-slate-400" />
                  <p className="font-bold text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                    មិនទាន់មានទិន្នន័យក្នុងតារាងបណ្តោះអាសន្ននៅឡើយទេ
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    សូមវាយបញ្ចូលលេខ Tracking និងអ្នកប្រគល់ប្រាក់ ក្នុង Form ខាងលើ រួចចុច Enter ដើម្បីបន្ថែម
                  </p>
                </div>
              ) : (
                <>
                  {/* 1. Desktop Table (hidden on mobile, visible on lg:table) */}
                  <table className="hidden lg:table w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 z-10">
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase text-[10px]">
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">{collectionCategory === 'MEDICINE' ? 'AWBN / លេខកូដ' : 'Tracking'}</th>
                        <th className="py-2 px-3">{collectionCategory === 'MEDICINE' ? 'អ្នកប្រគល់ / Handle By' : 'អ្នកប្រគល់ប្រាក់'}</th>
                        <th className="py-2 px-3">PAYMENT</th>
                        <th className="py-2 px-3">USD ($)</th>
                        <th className="py-2 px-3">KHM (៛)</th>
                        <th className="py-2 px-3">DATE</th>
                        <th className="py-2 px-3 text-right">លុប</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {activeQueue.map((item, index) => {
                        const isMissingAmount = (Number(item.usd) || 0) <= 0 && (Number(item.khm) || 0) <= 0;
                        return (
                          <tr 
                            key={item.id} 
                            className={`transition-colors ${
                              isMissingAmount 
                                ? 'bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100/60 dark:hover:bg-rose-900/40 border-l-4 border-l-rose-500' 
                                : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-1.5 px-3 text-slate-400 font-mono text-[11px]">
                              {index + 1}
                            </td>
                            <td className="py-1.5 px-3">
                              <div className="flex items-center gap-1.5">
                                <span className={`font-mono font-bold px-1.5 py-0.2 rounded border text-[11px] ${
                                  isMissingAmount
                                    ? 'text-rose-700 dark:text-rose-300 bg-rose-100/80 dark:bg-rose-950/80 border-rose-300 dark:border-rose-800'
                                    : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-900'
                                }`}>
                                  {item.tracking}
                                </span>
                                {item.lookupFound && (
                                  <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300" title={collectionCategory === 'MEDICINE' ? 'រកឃើញក្នុង Data_BM' : 'រកឃើញក្នុង Data'}>
                                    {collectionCategory === 'MEDICINE' ? 'Data_BM' : 'Data'}
                                  </span>
                                )}
                                {isMissingAmount && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-600 text-white shrink-0" title="មិនមានចំនួនទឹកប្រាក់">
                                    គ្មានទឹកប្រាក់
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-1.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                              {item.name}
                            </td>
                            <td className="py-1.5 px-3">
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
                                {item.paymentMethod || '—'}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              {item.usd !== undefined && Number(item.usd) > 0 ? (
                                `$${Number(item.usd).toFixed(2)}`
                              ) : isMissingAmount ? (
                                <span className="text-rose-500 font-bold">—</span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-1.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                              {item.khm !== undefined && Number(item.khm) > 0 ? (
                                `${Number(item.khm).toLocaleString()} ៛`
                              ) : isMissingAmount ? (
                                <span className="text-rose-500 font-bold">—</span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-1.5 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                              {item.date || '—'}
                            </td>
                            <td className="py-1.5 px-3 text-right">
                              {!isViewer && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFromQueue(item.id)}
                                  className={`p-1 rounded transition cursor-pointer ${
                                    isMissingAmount
                                      ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-100 dark:hover:bg-rose-900/60'
                                      : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                  }`}
                                  title="លុបចេញពីតារាង"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* 2. Mobile Card List (visible on mobile, hidden on lg) */}
                  <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
                    {activeQueue.map((item, index) => {
                      const isMissingAmount = (Number(item.usd) || 0) <= 0 && (Number(item.khm) || 0) <= 0;
                      return (
                        <div
                          key={item.id}
                          className={`p-3 transition-colors flex flex-col gap-1.5 ${
                            isMissingAmount
                              ? 'bg-rose-50/70 dark:bg-rose-950/30 border-l-4 border-l-rose-500'
                              : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          {/* Row 1: Number + Tracking (Left) | Payment Method + Delete (Right) */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-slate-400 font-mono text-xs font-semibold shrink-0">
                                {index + 1}.
                              </span>
                              <span className={`font-mono font-bold px-2 py-0.5 rounded-md border text-xs tracking-tight ${
                                isMissingAmount
                                  ? 'text-rose-700 dark:text-rose-300 bg-rose-100/80 dark:bg-rose-950/80 border-rose-300 dark:border-rose-800'
                                  : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-900'
                              }`}>
                                {item.tracking}
                              </span>
                              {item.lookupFound && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                                  {collectionCategory === 'MEDICINE' ? 'Data_BM' : 'Data'}
                                </span>
                              )}
                              {isMissingAmount && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-600 text-white shrink-0">
                                  គ្មានទឹកប្រាក់
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
                                {item.paymentMethod || 'CASH'}
                              </span>
                              {!isViewer && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFromQueue(item.id)}
                                  className={`p-1 rounded transition cursor-pointer ${
                                    isMissingAmount
                                      ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-100 dark:hover:bg-rose-900/60'
                                      : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                  }`}
                                  title="លុបចេញពីតារាង"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Row 2: Customer Name (Left) | Amount USD / KHR (Right) */}
                          <div className="flex items-center justify-between gap-2 text-xs pl-5">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs truncate">
                              {item.name}
                              {item.date && (
                                <span className="text-slate-400 dark:text-slate-500 text-[10px] font-normal ml-1.5">
                                  • {item.date}
                                </span>
                              )}
                            </div>

                            {/* Amounts formatted as USD xxx / xxx KHR matching mockup */}
                            <div className="font-mono text-xs font-bold shrink-0 text-right">
                              {isMissingAmount ? (
                                <span className="text-rose-600 dark:text-rose-400 font-bold text-[11px] bg-rose-100 dark:bg-rose-950/70 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-900">
                                  គ្មានចំនួនទឹកប្រាក់
                                </span>
                              ) : (
                                <>
                                  <span className="text-emerald-600 dark:text-emerald-400">
                                    USD {item.usd !== undefined && item.usd > 0 ? item.usd.toFixed(2) : '0.00'}
                                  </span>
                                  <span className="text-slate-300 dark:text-slate-700 mx-1">/</span>
                                  <span className="text-blue-600 dark:text-blue-400">
                                    {item.khm !== undefined && item.khm > 0 ? `${item.khm.toLocaleString()} KHR` : '0 KHR'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Bottom Actions: Save Batch Total */}
            {activeQueue.length > 0 && (
              <div className="px-3.5 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-slate-500">
                    ត្រៀមរក្សាទុកសរុប៖ <b className="text-slate-800 dark:text-slate-200">{activeQueue.length} កញ្ចប់</b>
                  </span>
                  {hasItemsWithoutAmount && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-900 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                      <span>ជាប់គាំង៖ {itemsWithoutAmount.length} កញ្ចប់គ្មានទឹកប្រាក់ ($ / ៛)</span>
                    </span>
                  )}
                </div>

                {isViewer ? (
                  <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs font-semibold flex items-center gap-1.5 border border-slate-200 dark:border-slate-700">
                    <span>🔒 មើលប៉ុណ្ណោះ (Read Only)</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleOpenCommitModal}
                    disabled={hasItemsWithoutAmount}
                    title={hasItemsWithoutAmount ? `មិនអាចរក្សាទុកបានទេ៖ មាន ${itemsWithoutAmount.length} កញ្ចប់គ្មានទឹកប្រាក់ USD/KHM` : undefined}
                    className={`px-4 py-1.5 rounded-xl font-bold text-xs transition shadow-xs flex items-center justify-center gap-1.5 ${
                      hasItemsWithoutAmount
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-95'
                    }`}
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>រក្សាទុកសរុប ({activeQueue.length}) 💾</span>
                  </button>
                )}
              </div>
            )}

          </div>

        </div>
      )}

      {/* Commit Batch Total Modal */}
      {isCommitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center font-bold shadow-xs">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    រក្សាទុកសរុបកញ្ចប់ (Save Batch & Reconciliation)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    បញ្ចូលប្រាក់ធនាគារ ប្រាក់សុទ្ធ និងផ្ទៀងផ្ទាត់តុល្យភាព ({queue.length} កញ្ចប់)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCommitModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCommit} className="p-4 sm:p-5 space-y-3.5 text-xs overflow-y-auto">
              
              {/* 1. Batch Stat Summary Card (Items + System USD + System KHR) */}
              <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-50/90 to-indigo-50/60 dark:from-slate-850 dark:to-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 shadow-xs space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-blue-200/60 dark:border-blue-900/50">
                  <span className="font-bold text-xs text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>ចំនួនកញ្ចប់សរុប (Total Items):</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      (ប្រាក់សុទ្ធ: {queueStats.cashCollectCount} • ធនាគារ: {queueStats.otherCount})
                    </span>
                    <span className="font-mono font-black text-sm text-blue-700 dark:text-blue-300">
                      {queue.length} កញ្ចប់
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-emerald-200/80 dark:border-emerald-900/50 shadow-2xs">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-0.5">
                      <DollarSign className="w-3 h-3 text-emerald-600" />
                      <span>ទឹកប្រាក់សរុបជា USD ($)</span>
                    </div>
                    <div className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                      ${queueStats.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-blue-200/80 dark:border-blue-900/50 shadow-2xs">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-0.5">
                      <Banknote className="w-3 h-3 text-blue-600" />
                      <span>ទឹកប្រាក់សរុបជា KHR (៛)</span>
                    </div>
                    <div className="font-mono font-black text-sm text-blue-600 dark:text-blue-400">
                      {queueStats.totalKHR.toLocaleString()} ៛
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Received Inputs: Bank vs Cash */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* 2.1 Bank Received Inputs */}
                <div className="p-3 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-900 dark:text-indigo-200">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>១. ទទួលពីធនាគារ (Bank)</span>
                  </div>

                  {/* Bank USD */}
                  <div>
                    <label className="block font-bold text-[10px] text-slate-600 dark:text-slate-400 mb-0.5 flex items-center justify-between">
                      <span>ធនាគារ USD ($)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono font-black text-emerald-600 text-xs">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={bankReceivedUSD}
                        onChange={(e) => setBankReceivedUSD(e.target.value)}
                        className="w-full pl-6 pr-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Bank KHR */}
                  <div>
                    <label className="block font-bold text-[10px] text-slate-600 dark:text-slate-400 mb-0.5 flex items-center justify-between">
                      <span>ធនាគារ KHR (៛)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono font-black text-blue-600 text-xs">
                        ៛
                      </span>
                      <input
                        type="number"
                        step="100"
                        min="0"
                        placeholder="0"
                        value={bankReceivedKHR}
                        onChange={(e) => setBankReceivedKHR(e.target.value)}
                        className="w-full pl-6 pr-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-2xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 2.2 Cash Received Inputs */}
                <div className="p-3 rounded-2xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/20 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900 dark:text-amber-200">
                    <Banknote className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>២. ទទួលប្រាក់សុទ្ធ (Cash)</span>
                  </div>

                  {/* Cash USD */}
                  <div>
                    <label className="block font-bold text-[10px] text-slate-600 dark:text-slate-400 mb-0.5 flex items-center justify-between">
                      <span>ប្រាក់សុទ្ធ USD ($)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono font-black text-emerald-600 text-xs">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={cashReceivedUSD}
                        onChange={(e) => setCashReceivedUSD(e.target.value)}
                        className="w-full pl-6 pr-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-amber-600 shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Cash KHR */}
                  <div>
                    <label className="block font-bold text-[10px] text-slate-600 dark:text-slate-400 mb-0.5 flex items-center justify-between">
                      <span>ប្រាក់សុទ្ធ KHR (៛)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono font-black text-blue-600 text-xs">
                        ៛
                      </span>
                      <input
                        type="number"
                        step="100"
                        min="0"
                        placeholder="0"
                        value={cashReceivedKHR}
                        onChange={(e) => setCashReceivedKHR(e.target.value)}
                        className="w-full pl-6 pr-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-amber-600 shadow-2xs"
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* 3. Live Reconciliation Box (ផ្ទៀងផ្ទាត់តុល្យភាពជាក់ស្តែង VS តារាង) */}
              <div className={`p-3 rounded-2xl border shadow-xs space-y-2 transition ${
                isAllBalanced
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                  : (diffUSD < -0.005 || diffKHR < -0.5)
                    ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
                    : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-white">
                    <CheckCircle2 className={`w-4 h-4 ${isAllBalanced ? 'text-emerald-600' : (diffUSD < -0.005 || diffKHR < -0.5) ? 'text-rose-600' : 'text-amber-600'}`} />
                    <span>ផ្ទៀងផ្ទាត់តុល្យភាព (Reconciliation)</span>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isAllBalanced
                      ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200'
                      : (diffUSD < -0.005 || diffKHR < -0.5)
                        ? 'bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200'
                        : 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
                  }`}>
                    {isAllBalanced
                      ? '✓ ទទួលបានគ្រប់ចំនួន ១០០%'
                      : (diffUSD < -0.005 || diffKHR < -0.5)
                        ? '⚠️ មិនទាន់គ្រប់ចំនួន (ខ្វះ)'
                        : 'ℹ️ ទទួលបានលើសចំនួន'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-200/60 dark:border-slate-800">
                  {/* USD Reconciliation */}
                  <div className="bg-white/70 dark:bg-slate-900/70 p-2 rounded-xl border border-slate-200/70 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mb-0.5">
                      សរុប USD (ធនាគារ + សាច់ប្រាក់):
                    </div>
                    <div className="font-mono font-black text-xs text-slate-900 dark:text-white">
                      ${actualTotalUSD.toFixed(2)}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">តារាង: ${queueStats.totalUSD.toFixed(2)}</span>
                      {isMatchedUSD ? (
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">✓ ស្មើ</span>
                      ) : diffUSD < 0 ? (
                        <span className="font-bold text-rose-600 dark:text-rose-400">ខ្វះ -${Math.abs(diffUSD).toFixed(2)}</span>
                      ) : (
                        <span className="font-bold text-amber-600 dark:text-amber-400">លើស +${diffUSD.toFixed(2)}</span>
                      )}
                    </div>
                  </div>

                  {/* KHR Reconciliation */}
                  <div className="bg-white/70 dark:bg-slate-900/70 p-2 rounded-xl border border-slate-200/70 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mb-0.5">
                      សរុប KHR (ធនាគារ + សាច់ប្រាក់):
                    </div>
                    <div className="font-mono font-black text-xs text-slate-900 dark:text-white">
                      {actualTotalKHR.toLocaleString()} ៛
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">តារាង: {queueStats.totalKHR.toLocaleString()} ៛</span>
                      {isMatchedKHR ? (
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">✓ ស្មើ</span>
                      ) : diffKHR < 0 ? (
                        <span className="font-bold text-rose-600 dark:text-rose-400">ខ្វះ -{Math.abs(diffKHR).toLocaleString()} ៛</span>
                      ) : (
                        <span className="font-bold text-amber-600 dark:text-amber-400">លើស +{diffKHR.toLocaleString()} ៛</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Batch Remarks / Notes */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 text-[11px]">
                  ចំណាំកញ្ចប់សរុប (Batch Notes) - ជម្រើស
                </label>
                <input
                  type="text"
                  placeholder="ចំណាំសង្ខេបអំពីកញ្ចប់នេះ..."
                  value={batchNote}
                  onChange={(e) => setBatchNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Operator info */}
              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                <span>អ្នកកត់ត្រា៖ <b>{currentUser ? (currentUser.name || currentUser.email) : 'Admin'}</b> {currentUser?.email ? <span className="text-[10px] text-slate-400 font-normal">({currentUser.email})</span> : null}</span>
                <span>ថ្ងៃនេះ៖ {new Date().toLocaleDateString('km-KH')}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCommitModalOpen(false)}
                  disabled={isCommitting}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold transition"
                >
                  បោះបង់
                </button>
                <button
                  type="submit"
                  disabled={isCommitting}
                  className="w-1/2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-md flex items-center justify-center gap-1.5"
                >
                  {isCommitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{isCommitting ? 'កំពុងរក្សាទុក...' : 'បញ្ជាក់ និងរក្សាទុក'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* 3. Bottom Section: Saved Batches History (Compact, Shown conditionally or in All view) */}
      {(viewMode === 'SAVED_BATCHES' || viewMode === 'ALL') && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          
          {/* Header Bar with subtle gradient highlight (Mobile/Tablet only) */}
          <div className="relative p-3 sm:p-4 border-b border-slate-200/80 dark:border-slate-800 bg-gradient-to-r from-blue-50/50 via-slate-50 to-indigo-50/40 dark:from-slate-950 dark:via-blue-950/20 dark:to-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-3 before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] lg:before:hidden before:bg-gradient-to-r before:from-blue-600 before:via-indigo-500 before:to-emerald-500">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                {collectionCategory === 'MEDICINE' ? <Pill className="w-4 h-4 sm:w-5 sm:h-5" /> : <FileText className="w-4 h-4 sm:w-5 sm:h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white leading-tight">
                    {collectionCategory === 'MEDICINE' 
                      ? 'ប្រវត្តិកញ្ចប់ថ្នាំពេទ្យ (Medicine Saved Batches)' 
                      : 'ប្រវត្តិកញ្ចប់ដែលបានរក្សាទុក (Saved Batches)'}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold font-mono bg-blue-100/70 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-900 shadow-2xs">
                    {activeBatches.length} {activeBatches.length === 1 ? 'Batch' : 'Batches'}
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-400">
                  {collectionCategory === 'MEDICINE'
                    ? 'បញ្ជីកញ្ចប់ទទួលលុយថ្នាំពេទ្យដែលបានរក្សាទុកក្នុងប្រព័ន្ធ (Data_BM)'
                    : 'បញ្ជីកញ្ចប់ប្រមូលប្រាក់ដែលបាន Commit ចូលប្រព័ន្ធ និង Sync ទៅកាន់ Google Sheets'}
                </p>
              </div>
            </div>

            {/* Actions & Search */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 sm:w-60">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={collectionCategory === 'MEDICINE' ? "ស្វែងរក MED- ឬ AWBN..." : "ស្វែងរក Batch ឬ Tracking..."}
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-2xs"
                />
                {historySearch && (
                  <button 
                    onClick={() => setHistorySearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Group By Date Toggle */}
              <button
                type="button"
                onClick={() => setIsGroupedByDate(prev => !prev)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer shrink-0 shadow-2xs border ${
                  isGroupedByDate 
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' 
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
                title={isGroupedByDate ? "កំពុងបើក៖ បែងចែកតាមកាលបរិច្ឆេទ (Group by Date)" : "ចុចដើម្បីបែងចែកតាមកាលបរិច្ឆេទ"}
              >
                <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span className="hidden sm:inline">តាមថ្ងៃ</span>
              </button>

              {/* Sort Order Toggle */}
              <button
                type="button"
                onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition active:scale-95 cursor-pointer shrink-0 shadow-2xs"
                title={sortOrder === 'desc' ? "តម្រៀប៖ ថ្មីបំផុតមុន (Newest first / Last recorded)" : "តម្រៀប៖ ចាស់បំផុតមុន (Oldest first)"}
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span className="hidden sm:inline">{sortOrder === 'desc' ? 'ថ្មីបំផុតមុន' : 'ចាស់បំផុតមុន'}</span>
              </button>

              {/* Collapse/Expand All Groups Toggle (When grouped) */}
              {isGroupedByDate && dateGroups.length > 1 && (
                <button
                  type="button"
                  onClick={toggleAllGroups}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition active:scale-95 cursor-pointer shrink-0 shadow-2xs"
                  title={allGroupsCollapsed ? "ពង្រីកក្រុមទាំងអស់ (Expand All)" : "បង្រួមក្រុមទាំងអស់ (Collapse All)"}
                >
                  {allGroupsCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  <span className="hidden xl:inline">{allGroupsCollapsed ? 'ពង្រីកទាំងអស់' : 'បង្រួមទាំងអស់'}</span>
                </button>
              )}

              {collectionCategory === 'GENERAL' && (onSyncFirebaseToGoogleSheets || onUpdateGoogleSheetColumns) && (
                <button
                  type="button"
                  onClick={handleSyncToSheets}
                  disabled={isSyncingToSheets || isUpdatingColumns}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition active:scale-95 disabled:opacity-50 cursor-pointer shrink-0 shadow-2xs"
                  title="ទាញទិន្នន័យកញ្ចប់ និងមុខទំនិញពី Firebase ចូលទៅកាន់ Google Sheets"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingToSheets ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">{isSyncingToSheets ? 'Syncing...' : 'Sync to Sheets'}</span>
                  <span className="sm:hidden">Sheets</span>
                </button>
              )}

              {isAdmin && activeBatches.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDeleteAllModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition active:scale-95 cursor-pointer shrink-0 shadow-2xs"
                  title="លុបកញ្ចប់ទាំងអស់"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">លុបទាំងអស់</span>
                  <span className="sm:hidden">លុប</span>
                  <span>({activeBatches.length})</span>
                </button>
              )}
            </div>
          </div>

          {filteredBatches.length === 0 ? (
            <div className="py-12 px-4 text-center text-slate-400 text-xs space-y-1.5">
              <FileText className="w-8 h-8 mx-auto opacity-30 text-slate-400" />
              <p className="font-semibold text-slate-600 dark:text-slate-300">
                {historySearch.trim() ? 'រកមិនឃើញកញ្ចប់ដែលត្រូវនឹងពាក្យស្វែងរកទេ' : 'មិនទាន់មានប្រវត្តិកញ្ចប់ដែលបានរក្សាទុកនៅឡើយទេ'}
              </p>
              <p className="text-[11px] text-slate-400">
                {historySearch.trim() ? 'សូមសាកល្បងស្វែងរកដោយប្រើលេខ Batch ឬ Tracking ផ្សេង' : 'រាល់ពេលចុច Commit Batch វានឹងបង្ហាញនៅក្នុងតារាងនេះដោយស្វ័យប្រវត្តិ'}
              </p>
            </div>
          ) : (() => {
            const renderBatchCard = (batch: CollectionBatch, index: number) => {
              const isExpanded = expandedBatchId === batch.id;
              const isBalanced = batch.reconciliation?.includes('គ្រប់ចំនួន') || batch.reconciliationStatus === 'BALANCED';
              const isShortage = batch.reconciliation?.includes('ខ្វះ') || batch.reconciliationStatus === 'SHORTAGE';
              const palette = BATCH_CARD_PALETTES[index % BATCH_CARD_PALETTES.length];
              return (
                <div 
                  key={batch.id} 
                    className={`group relative transition-all duration-200 hover:z-10 ${palette.hoverBg} hover:shadow-md hover:shadow-slate-200/70 dark:hover:shadow-slate-950/60 before:absolute before:top-0 before:left-0 before:right-0 before:h-[2.5px] lg:before:hidden ${palette.lineGradient} ${
                      isExpanded 
                        ? 'bg-slate-50/70 dark:bg-slate-850/50 shadow-xs' 
                        : ''
                    }`}
                  >
                    
                    {/* Batch Summary Card with Top Highlight */}
                    <div className="p-2.5 sm:px-3 sm:py-2.5">
                      <div className="flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_300px_auto] sm:items-center justify-between gap-2.5 sm:gap-4">
                        
                        {/* Left: Badge, Batch ID, Status, Recon */}
                        <div className="flex items-start sm:items-center gap-2.5 min-w-0 pr-2">
                          <div className={`w-8 h-8 rounded-xl flex flex-col items-center justify-center shrink-0 shadow-xs ${palette.badgeGradient}`}>
                            <span className="font-mono font-bold text-xs leading-none">{batch.totalItems}</span>
                            <span className={`text-[8px] font-sans font-semibold leading-none mt-0.5 opacity-90 ${palette.badgeText}`}>ជួរ</span>
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              <span 
                                onClick={() => handleCopy(batch.batchNumber)}
                                className={`font-mono font-black text-xs sm:text-sm text-slate-900 dark:text-white ${palette.batchTextHover} cursor-pointer inline-flex items-center gap-1 transition`}
                                title="ចុចដើម្បី Copy លេខកញ្ចប់"
                              >
                                <span>{batch.batchNumber}</span>
                                {copiedText === batch.batchNumber ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3 text-slate-400 hover:text-slate-600 opacity-60 hover:opacity-100" />
                                )}
                              </span>

                              <span className="text-[9.5px] font-sans font-semibold px-2 py-0.5 rounded-full bg-emerald-100/80 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                                រក្សាទុករួច
                              </span>

                              {batch.reconciliation && (
                                <span className={`text-[9.5px] font-sans font-bold px-2 py-0.5 rounded-full border ${
                                  batch.reconciliation.includes('គ្រប់ចំនួន') || batch.reconciliationStatus === 'BALANCED'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                    : batch.reconciliation.includes('ខ្វះ') || batch.reconciliationStatus === 'SHORTAGE'
                                      ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                }`}>
                                  {batch.reconciliation}
                                </span>
                              )}
                            </div>

                            {/* Sub-line: Operator & Customer & Date & Notes */}
                            <div className="text-[10.5px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span>👤 <strong className="text-slate-700 dark:text-slate-200 font-semibold">{batch.operator}</strong> {batch.operatorEmail ? <span className="text-[10px] text-slate-400 font-mono">({batch.operatorEmail})</span> : null}</span>
                              {(() => {
                                const cNames = Array.from(new Set((batch.items || []).map(i => i.name?.trim()).filter(Boolean)));
                                if (cNames.length === 0) return null;
                                return (
                                  <>
                                    <span>•</span>
                                    <span className="text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.2 rounded border border-blue-200/60 dark:border-blue-800/40 text-[10px] font-semibold flex items-center gap-1">
                                      <User className="w-2.5 h-2.5" />
                                      <span>{cNames.slice(0, 2).join(', ')}{cNames.length > 2 ? ` (+${cNames.length - 2})` : ''}</span>
                                    </span>
                                  </>
                                );
                              })()}
                              <span>•</span>
                              <span>⏰ {new Date(batch.createdAt).toLocaleString('km-KH', { dateStyle: 'short', timeStyle: 'short' })}</span>
                              {batch.notes && (
                                <>
                                  <span>•</span>
                                  <span className="text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-200/60 dark:border-amber-800/40 text-[10px]">
                                    📝 {batch.notes}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Middle Column: Bank & Cash Breakdown (PC / Desktop only - Uniformly Aligned) */}
                        {(batch.bankUSD !== undefined || batch.bankKHR !== undefined || batch.cashUSD !== undefined || batch.cashKHR !== undefined) ? (
                          <div className="hidden sm:flex items-center gap-1.5 w-[300px] shrink-0 px-2 py-1 rounded-xl bg-slate-50/90 dark:bg-slate-950/40 border border-slate-200/70 dark:border-slate-800/60 font-mono text-[10.5px]">
                            {(batch.bankUSD !== undefined || batch.bankKHR !== undefined) ? (
                              <span className="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40 min-w-[92px] shrink-0">
                                <Building2 className="w-3 h-3 text-indigo-500 shrink-0" />
                                <span className="text-[10px] text-indigo-600/80 dark:text-indigo-400 font-sans font-semibold">Bank:</span>
                                <strong>{batch.bankUSD !== undefined ? `$${batch.bankUSD.toFixed(2)}` : '$0.00'}</strong>
                                {batch.bankKHR !== undefined && batch.bankKHR > 0 && <span>• {batch.bankKHR.toLocaleString()}៛</span>}
                              </span>
                            ) : (
                              <span className="min-w-[92px] shrink-0" />
                            )}
                            {(batch.cashUSD !== undefined || batch.cashKHR !== undefined) ? (
                              <span className="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50/80 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40 flex-1 min-w-0 truncate">
                                <Banknote className="w-3 h-3 text-amber-500 shrink-0" />
                                <span className="text-[10px] text-amber-600/80 dark:text-amber-400 font-sans font-semibold">Cash:</span>
                                <strong>{batch.cashUSD !== undefined ? `$${batch.cashUSD.toFixed(2)}` : '$0.00'}</strong>
                                {batch.cashKHR !== undefined && batch.cashKHR > 0 && <span>• {batch.cashKHR.toLocaleString()}៛</span>}
                              </span>
                            ) : (
                              <span className="flex-1" />
                            )}
                          </div>
                        ) : (
                          <div className="hidden sm:block w-[300px] shrink-0" />
                        )}

                        {/* Right: Amounts & Action Buttons */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800/60 sm:pl-2">
                          <div className="flex sm:flex-col items-baseline sm:items-end gap-2 sm:gap-0.5 min-w-[85px] text-right">
                            <div className="font-mono font-bold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400">
                              ${batch.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            {batch.totalKHR > 0 ? (
                              <div className="font-mono font-semibold text-[11px] text-blue-600 dark:text-blue-400">
                                {batch.totalKHR.toLocaleString()} ៛
                              </div>
                            ) : (
                              <div className="font-mono text-[10px] text-slate-400">0 ៛</div>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {onResendTelegramBatch && (
                              <button
                                type="button"
                                onClick={() => handleResendTelegram(batch)}
                                disabled={resendingBatchId === batch.id}
                                className={`p-1.5 rounded-lg transition cursor-pointer border ${
                                  resendSuccessBatchId === batch.id
                                    ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800'
                                    : 'text-slate-500 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40 border-transparent hover:border-sky-200 dark:hover:border-sky-800'
                                }`}
                                title={
                                  resendingBatchId === batch.id
                                    ? 'កំពុងផ្ញើទៅកាន់ Telegram...'
                                    : resendSuccessBatchId === batch.id
                                      ? 'បានផ្ញើទៅ Telegram រួចរាល់!'
                                      : 'ផ្ញើទៅ Telegram ឡើងវិញ (Resend to Telegram)'
                                }
                              >
                                {resendingBatchId === batch.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-600" />
                                ) : resendSuccessBatchId === batch.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Send className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleExportCSV(batch)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer border border-transparent hover:border-blue-200 dark:hover:border-blue-800"
                              title="ទាញយកជា CSV"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>

                            {!isViewer && onDeleteBatch && (
                              <button
                                id={`btn-delete-batch-${batch.batchNumber}`}
                                type="button"
                                onClick={() => setBatchToDelete(batch)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer border border-transparent hover:border-rose-200 dark:hover:border-rose-800"
                                title="លុបកញ្ចប់"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                              className={`p-1.5 rounded-lg transition cursor-pointer border ${
                                isExpanded 
                                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 border-blue-200 dark:border-blue-800' 
                                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700'
                              }`}
                              title={isExpanded ? "បិទព័ត៌មានលម្អិត" : "មើលលម្អិត"}
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                      </div>

                      {/* Bank & Cash Breakdown Sub-strip (Mobile only) */}
                      {(batch.bankUSD !== undefined || batch.bankKHR !== undefined || batch.cashUSD !== undefined || batch.cashKHR !== undefined) && (
                        <div className="sm:hidden flex flex-wrap items-center gap-1.5 text-[10px] pt-1.5 mt-1 border-t border-slate-100 dark:border-slate-800/50">
                          {(batch.bankUSD !== undefined || batch.bankKHR !== undefined) && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/50 dark:to-blue-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/60 font-mono shadow-2xs">
                              <Building2 className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-sans font-semibold">Bank:</span>
                              <strong>{batch.bankUSD !== undefined ? `$${batch.bankUSD.toFixed(2)}` : '$0'}</strong>
                              {batch.bankKHR !== undefined && batch.bankKHR > 0 && <span>• {batch.bankKHR.toLocaleString()}៛</span>}
                            </span>
                          )}
                          {(batch.cashUSD !== undefined || batch.cashKHR !== undefined) && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/50 text-amber-800 dark:text-amber-200 border border-amber-200/70 dark:border-amber-800/60 font-mono shadow-2xs">
                              <Banknote className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                              <span className="text-[10px] text-amber-700 dark:text-amber-400 font-sans font-semibold">Cash:</span>
                              <strong>{batch.cashUSD !== undefined ? `$${batch.cashUSD.toFixed(2)}` : '$0'}</strong>
                              {batch.cashKHR !== undefined && batch.cashKHR > 0 && <span>• {batch.cashKHR.toLocaleString()}៛</span>}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Expanded Items Drawer (Mobile Card List + Desktop Table) */}
                    {isExpanded && (
                      <div className="p-2.5 sm:p-3.5 bg-slate-50/70 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800">
                        {batch.items && batch.items.length > 0 ? (
                          <>
                            {/* Mobile Card List (lg:hidden) */}
                            <div className="lg:hidden space-y-1.5">
                              {batch.items.map((item, idx) => (
                                <div key={item.id || idx} className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-2xs space-y-1">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-slate-400 font-mono">#{idx + 1}</span>
                                      <span 
                                        onClick={() => handleCopy(item.tracking)}
                                        className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-1.5 py-0.2 rounded border border-blue-200 dark:border-blue-900 cursor-pointer inline-flex items-center gap-1"
                                        title="ចុចដើម្បី Copy"
                                      >
                                        <span>{item.tracking}</span>
                                        {copiedText === item.tracking ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5 opacity-50" />}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono">{item.date || '—'}</span>
                                  </div>

                                  <div className="flex items-center justify-between text-xs pt-0.5">
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[170px]">
                                      {item.name}
                                    </span>
                                    <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-semibold text-slate-600 dark:text-slate-300">
                                      {item.paymentMethod || 'CASH'}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/80 font-mono text-xs font-bold">
                                    <span className="text-emerald-600 dark:text-emerald-400">
                                      {item.usd !== undefined && item.usd > 0 ? `$${item.usd.toFixed(2)}` : '—'}
                                    </span>
                                    <span className="text-blue-600 dark:text-blue-400">
                                      {item.khm !== undefined && item.khm > 0 ? `${item.khm.toLocaleString()} ៛` : '—'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Desktop Compact Table (hidden lg:block) */}
                            <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    <th className="py-2 px-3 w-10">#</th>
                                    <th className="py-2 px-3">Tracking</th>
                                    <th className="py-2 px-3">អ្នកប្រគល់ប្រាក់</th>
                                    <th className="py-2 px-3">PAYMENT</th>
                                    <th className="py-2 px-3">USD ($)</th>
                                    <th className="py-2 px-3">KHM (៛)</th>
                                    <th className="py-2 px-3">DATE</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                  {batch.items.map((item, idx) => (
                                    <tr key={item.id || idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-850/40 transition-colors">
                                      <td className="py-1.5 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                                      <td className="py-1.5 px-3">
                                        <span 
                                          onClick={() => handleCopy(item.tracking)}
                                          className="font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-900 text-[11px] cursor-pointer inline-flex items-center gap-1 hover:border-blue-400 transition"
                                          title="ចុចដើម្បី Copy Tracking"
                                        >
                                          <span>{item.tracking}</span>
                                          {copiedText === item.tracking ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5 opacity-50" />}
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-3 text-slate-800 dark:text-slate-200 font-semibold">{item.name}</td>
                                      <td className="py-1.5 px-3">
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
                                          {item.paymentMethod || '—'}
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                        {item.usd !== undefined && item.usd > 0 ? `$${item.usd.toFixed(2)}` : '—'}
                                      </td>
                                      <td className="py-1.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                                        {item.khm !== undefined && item.khm > 0 ? `${item.khm.toLocaleString()} ៛` : '—'}
                                      </td>
                                      <td className="py-1.5 px-3 text-slate-500 font-mono text-[11px]">{item.date || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        ) : (
                          <div className="py-6 text-center text-slate-400 dark:text-slate-500">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">ពុំមានទិន្នន័យប្រតិបត្តិការលម្អិតទេ</span>
                          </div>
                        )}

                        {/* Expanded Drawer Action Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 mt-2.5 border-t border-slate-200/80 dark:border-slate-800">
                          <div className="text-[11px] text-slate-400">
                            កញ្ចប់: <strong className="font-mono text-slate-700 dark:text-slate-200">{batch.batchNumber}</strong>
                            <span className="mx-1.5">•</span>
                            <span>សរុប {batch.totalItems} វិក្កយបត្រ</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {onResendTelegramBatch && (
                              <button
                                type="button"
                                onClick={() => handleResendTelegram(batch)}
                                disabled={resendingBatchId === batch.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-50 hover:bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800 transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-2xs"
                                title="ផ្ញើព័ត៌មានលម្អិតនៃកញ្ចប់នេះទៅកាន់ Telegram ម្តងទៀត"
                              >
                                {resendingBatchId === batch.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-600" />
                                ) : resendSuccessBatchId === batch.id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Send className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {resendingBatchId === batch.id 
                                    ? 'កំពុងផ្ញើ...' 
                                    : resendSuccessBatchId === batch.id 
                                      ? 'បានផ្ញើរួច!' 
                                      : 'Resend to Telegram'}
                                </span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleExportCSV(batch)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition active:scale-95 cursor-pointer shadow-2xs"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Export CSV</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                </div>
              );
            };

            if (isGroupedByDate) {
              return (
                <div className="divide-y divide-slate-200/90 dark:divide-slate-800">
                  {dateGroups.map((group) => {
                    const isCollapsed = !!collapsedGroups[group.dateKey];
                    return (
                      <div key={group.dateKey} className="group-container">
                        {/* Sticky Date Group Header */}
                        <div 
                          onClick={() => toggleDateGroup(group.dateKey)}
                          className="sticky top-0 z-10 px-3 sm:px-4 py-2.5 bg-gradient-to-r from-slate-100/95 via-blue-50/70 to-slate-100/95 dark:from-slate-850/95 dark:via-slate-800/90 dark:to-slate-850/95 backdrop-blur-md border-y border-slate-200 dark:border-slate-750 flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none transition-colors hover:bg-blue-50/60 dark:hover:bg-slate-800 shadow-2xs"
                        >
                          {/* Left: Icon, Date Title & Badge */}
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                              group.headerInfo.isToday 
                                ? 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white' 
                                : group.headerInfo.isYesterday
                                  ? 'bg-gradient-to-tr from-indigo-500 to-purple-600 text-white'
                                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700'
                            }`}>
                              <Calendar className="w-4 h-4" />
                            </div>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white leading-tight">
                                  {group.headerInfo.title}
                                </span>

                                {group.headerInfo.relativeBadge && (
                                  <span className={`px-2 py-0.5 rounded-full text-[9.5px] sm:text-[10px] font-bold ${
                                    group.headerInfo.isToday
                                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                      : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                                  }`}>
                                    {group.headerInfo.relativeBadge}
                                  </span>
                                )}

                                <span className="font-mono text-[10.5px] text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-900/80 px-1.5 py-0.5 rounded-md border border-slate-200/60 dark:border-slate-700/60">
                                  {group.headerInfo.badgeDate}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Right: Summary for this date group & Collapse Toggle */}
                          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
                            <div className="flex items-center gap-1.5 text-xs font-mono">
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold font-sans bg-blue-100/70 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900 shadow-2xs">
                                {group.totalBatches} កញ្ចប់ ({group.totalItems} ជួរ)
                              </span>

                              <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm">
                                ${group.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>

                              {group.totalKHR > 0 && (
                                <span className="hidden sm:inline font-semibold text-blue-600 dark:text-blue-400 text-[11px]">
                                  • {group.totalKHR.toLocaleString()} ៛
                                </span>
                              )}
                            </div>

                            <div className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-700/60 transition">
                              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                            </div>
                          </div>
                        </div>

                        {/* Batches inside this Date Group */}
                        {isCollapsed ? (
                          <div 
                            onClick={() => toggleDateGroup(group.dateKey)}
                            className="py-2.5 px-4 text-center text-xs text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer bg-slate-50/40 dark:bg-slate-900/40 hover:bg-blue-50/40 dark:hover:bg-slate-850/60 transition flex items-center justify-center gap-1.5"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span>បានបង្រួម {group.totalBatches} កញ្ចប់ — ចុចដើម្បីពង្រីក</span>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                            {group.batches.map((batch, batchIdx) => renderBatchCard(batch, batchIdx))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }

            return (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredBatches.map((batch, index) => renderBatchCard(batch, index))}
              </div>
            );
          })()}

        </div>
      )}

      {/* Custom Delete Confirmation Modal (Does not depend on window.confirm) */}
      {batchToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 max-w-sm w-full rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  លុបកញ្ចប់ទិន្នន័យ (Delete Batch)?
                </h4>
                <p className="text-xs text-slate-500 font-mono">
                  {batchToDelete.batchNumber}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">ចំនួនវិក្កយបត្រ៖</span>
                <span className="font-bold font-mono text-slate-800 dark:text-slate-200">{batchToDelete.totalItems} ជួរ</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ទឹកប្រាក់សរុប USD៖</span>
                <span className="font-bold font-mono text-emerald-600">${batchToDelete.totalUSD.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ទឹកប្រាក់សរុប KHR៖</span>
                <span className="font-bold font-mono text-blue-600">{batchToDelete.totalKHR.toLocaleString()} ៛</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">អ្នកកត់ត្រា៖</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">{batchToDelete.operator}</span>
              </div>
            </div>

            <p className="text-xs text-rose-600 dark:text-rose-400 font-medium leading-relaxed">
              ⚠️ តើអ្នកពិតជាចង់លុបកញ្ចប់នេះមែនទេ? ទិន្នន័យនឹងត្រូវលុបទាំងស្រុងចេញពីប្រព័ន្ធ និងពី Google Sheets!
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setBatchToDelete(null)}
                disabled={isDeletingBatch}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                បោះបង់
              </button>
              <button
                id="btn-confirm-delete-batch"
                type="button"
                onClick={() => {
                  const b = batchToDelete;
                  if (!b) return;
                  const isMedicineBatch = b.batchNumber.startsWith('MED-') || collectionCategory === 'MEDICINE';
                  const deleteFn = isMedicineBatch && onDeleteMedicineBatch ? onDeleteMedicineBatch : onDeleteBatch;
                  if (!deleteFn) return;
                  setBatchToDelete(null);
                  deleteFn(b.id, b.batchNumber);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>យល់ព្រមលុប</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Batches Confirmation Modal (Delete All in One for Sheets and UI) */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  លុបរាល់កញ្ចប់ទាំងអស់ (Delete All in One)
                </h4>
                <p className="text-xs text-slate-400">
                  {collectionCategory === 'MEDICINE'
                    ? 'សម្អាតទិន្នន័យកញ្ចប់ថ្នាំពេទ្យទាំងអស់ចេញពី Firebase និង UI'
                    : 'សម្អាតទិន្នន័យ Batches ទាំងស្រុងចេញពី Sheets និង UI'}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 space-y-1.5">
              <p className="font-bold flex items-center gap-1">
                ⚠️ ការព្រមានសំខាន់ (Critical Warning)៖
              </p>
              <p className="leading-relaxed">
                សកម្មភាពនេះនឹងលុបកញ្ចប់ចំនួន <b>{activeBatches.length}</b> ទាំងស្រុង៖
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                {collectionCategory === 'MEDICINE' ? (
                  <>
                    <li>លុបរាល់កញ្ចប់ថ្នាំពេទ្យទាំងអស់ក្នុង Firebase (medicine_batches)</li>
                    <li>សម្អាតបញ្ជីកញ្ចប់ថ្នាំពេទ្យទាំងអស់លើ UI និង LocalStorage</li>
                  </>
                ) : (
                  <>
                    <li>លុបរាល់ជួរទាំងអស់ក្នុង Tab <b>Batches</b> នៃ Google Sheets</li>
                    <li>លុបរាល់មុខទំនិញទាំងអស់ក្នុង Tab <b>Collection_Items</b> នៃ Google Sheets</li>
                    <li>សម្អាតបញ្ជីកញ្ចប់ទាំងអស់លើ UI និង LocalStorage</li>
                  </>
                )}
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                បោះបង់
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteAllModal(false);
                  if (collectionCategory === 'MEDICINE') {
                    if (onDeleteAllMedicineBatches) onDeleteAllMedicineBatches();
                  } else {
                    if (onDeleteAllBatches) onDeleteAllBatches();
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>យល់ព្រមលុបទាំងអស់</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Camera Barcode & QR Code Scanner Modal (Code-split with React.Suspense) */}
      {isCameraScannerOpen && (
        <React.Suspense fallback={null}>
          <BarcodeScannerModal
            isOpen={isCameraScannerOpen}
            onClose={() => {
              setIsCameraScannerOpen(false);
              setTimeout(() => trackingInputRef.current?.focus(), 120);
            }}
            onScanSuccess={handleCameraScanSuccess}
            currentPayerName={name.trim()}
            totalScannedCount={activeQueue.length}
          />
        </React.Suspense>
      )}

    </div>
  );
};
