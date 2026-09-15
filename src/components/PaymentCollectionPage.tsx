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
  History
} from 'lucide-react';
import { CollectionItem, CollectionBatch, AuthUser, Payer, DatabaseRecord } from '../types';
import { BarcodeScannerModal } from './BarcodeScannerModal';

interface PaymentCollectionPageProps {
  currentUser: AuthUser | null;
  exchangeRate?: number;
  onCommitBatch: (batchData: Omit<CollectionBatch, 'id' | 'createdAt'>) => Promise<boolean>;
  savedBatches: CollectionBatch[];
  onDeleteBatch?: (id: string, batchNumber?: string) => Promise<boolean> | void;
  onDeleteAllBatches?: () => Promise<boolean> | void;
  payers?: Payer[];
  dataRecords?: DatabaseRecord[];
  onUpdateGoogleSheetColumns?: () => Promise<boolean>;
}

const PAYMENT_METHODS = [
  'Cash & Collect',
  'Cash',
  'Collect',
  'COD'
];

export const PaymentCollectionPage: React.FC<PaymentCollectionPageProps> = ({
  currentUser,
  exchangeRate = 4100,
  onCommitBatch,
  savedBatches,
  onDeleteBatch,
  onDeleteAllBatches,
  payers = [],
  dataRecords = [],
  onUpdateGoogleSheetColumns
}) => {
  // 1. Form Inputs (Without individual amounts)
  const [tracking, setTracking] = useState('');
  const [name, setName] = useState('');
  const [isCustomName, setIsCustomName] = useState(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [date] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const [scanError, setScanError] = useState<string | null>(null);

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

  const handleCameraScanSuccess = (decodedText: string) => {
    const trimmed = decodedText.trim();
    setTracking(trimmed);

    // Instant duplicate validation on camera scan
    const t = trimmed.toLowerCase();
    const inQueue = queue.some(i => i.tracking.toLowerCase().trim() === t);
    const inBatch = savedBatches.find(b => b.items?.some(i => i.tracking.toLowerCase().trim() === t));

    if (inQueue) {
      playDuplicateBeep();
      setScanError(`❌ លេខកូដ «${trimmed}» នេះមានក្នុងតារាងបណ្តោះអាសន្នរួចហើយ! មិនអាចបញ្ចូលស្ទួនបានទេ!`);
    } else if (inBatch) {
      playDuplicateBeep();
      setScanError(`⛔ លេខកូដ «${trimmed}» នេះធ្លាប់បានបញ្ចូល និងរក្សាទុករួចហើយក្នុងកញ្ចប់ ${inBatch.batchNumber}! មិនអាចបញ្ចូលម្តងទៀតបានដាច់ខាត!`);
    } else {
      setScanError(null);
    }

    setTimeout(() => {
      trackingInputRef.current?.focus();
    }, 120);
  };
  const [paymentMethod, setPaymentMethod] = useState('Cash & Collect');
  const [isUpdatingColumns, setIsUpdatingColumns] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<CollectionBatch | null>(null);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);

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
  };

  // 2. Queue / Staging Table State (Auto-deduplicated on load)
  const [queue, setQueue] = useState<CollectionItem[]>(() => {
    const saved = localStorage.getItem('accounting_staging_queue_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Strictly remove any duplicate tracking codes that were saved
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

  // Real-time Duplicate Detection (both in Queue & in all Saved Batches)
  const duplicateInfo = useMemo(() => {
    const t = tracking.trim().toLowerCase();
    if (!t) return null;

    // Check 1: Already in Current Staging Queue
    const inQueueIndex = queue.findIndex(item => item.tracking.toLowerCase().trim() === t);
    if (inQueueIndex !== -1) {
      return {
        type: 'IN_QUEUE' as const,
        message: `លេខកូដ «${tracking.trim()}» នេះមានក្នុងតារាងបណ្តោះអាសន្នរួចហើយ (#${inQueueIndex + 1}) — មិនអាចបញ្ចូលស្ទួនបានទេ!`,
        index: inQueueIndex + 1
      };
    }

    // Check 2: Already in Saved Batches History
    for (const batch of savedBatches) {
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
  }, [tracking, queue, savedBatches]);

  // Clear scanError when user changes tracking input
  useEffect(() => {
    if (scanError) {
      setScanError(null);
    }
  }, [tracking]);

  // Save queue to localStorage
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

  // History & Filters
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');

  const trackingInputRef = useRef<HTMLInputElement>(null);

  // Live Lookup in Data Table while typing/scanning barcode
  const lookupMatch = useMemo(() => {
    const t = tracking.trim().toLowerCase();
    if (!t) return null;
    return dataRecords.find(r => r.barcode.toLowerCase() === t) || null;
  }, [tracking, dataRecords]);

  // When lookupMatch is found, auto-fill payment method
  useEffect(() => {
    if (lookupMatch && lookupMatch.payment) {
      setPaymentMethod(lookupMatch.payment);
    }
  }, [lookupMatch]);

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

  // Method Counts & Live Sums for current Queue (with Cash vs Bank breakdown)
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

    queue.forEach(item => {
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
      total: queue.length,
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
  }, [queue]);

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

  // Add Item into Queue with Auto-Lookup from Data
  const handleAddToQueue = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trackingTrimmed = tracking.trim();
    const nameTrimmed = name.trim();

    if (!trackingTrimmed) {
      setScanError('សូមបញ្ចូលលេខ Tracking ឬលេខកូដកញ្ចប់!');
      trackingInputRef.current?.focus();
      return;
    }

    // 1. Strict Duplicate Check: Already in active Staging Queue
    const inQueueIndex = queue.findIndex(
      item => item.tracking.toLowerCase().trim() === trackingTrimmed.toLowerCase()
    );
    if (inQueueIndex !== -1) {
      playDuplicateBeep();
      setScanError(`❌ លេខកូដ «${trackingTrimmed}» នេះមានក្នុងតារាងបណ្តោះអាសន្នរួចហើយ (ជួរទី ${inQueueIndex + 1})! មិនអនុញ្ញាតឱ្យបញ្ចូលស្ទួនដាច់ខាត!`);
      trackingInputRef.current?.select();
      return;
    }

    // 2. Strict Duplicate Check: Already in Saved Batches history
    for (const batch of savedBatches) {
      if (Array.isArray(batch.items)) {
        const found = batch.items.find(
          item => item.tracking.toLowerCase().trim() === trackingTrimmed.toLowerCase()
        );
        if (found) {
          playDuplicateBeep();
          const dateStr = batch.createdAt ? new Date(batch.createdAt).toLocaleDateString('km-KH') : '';
          setScanError(`⛔ លេខកូដ «${trackingTrimmed}» នេះធ្លាប់បានបញ្ចូល និងរក្សាទុករួចហើយ ក្នុងកញ្ចប់ ${batch.batchNumber}${dateStr ? ` (${dateStr})` : ''}! មិនអនុញ្ញាតឱ្យបញ្ចូលម្តងទៀតជាដាច់ខាត!`);
          trackingInputRef.current?.select();
          return;
        }
      }
    }

    if (!nameTrimmed) {
      setScanError('សូមជ្រើសរើស ឬបញ្ចូលឈ្មោះអតិថិជន / អ្នកប្រគល់!');
      return;
    }

    // Lookup barcode in Data table (Data_Account from Google Sheets)
    const match = dataRecords.find(r => r.barcode.toLowerCase() === trackingTrimmed.toLowerCase());

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

  // Remove Item from Queue
  const handleRemoveFromQueue = (id: string) => {
    setQueue(prev => {
      const filtered = prev.filter(item => item.id !== id);
      if (filtered.length === 0) {
        localStorage.removeItem('accounting_staging_queue_v2');
        localStorage.removeItem('accounting_staging_queue');
      }
      return filtered;
    });
  };

  // Clear Entire Queue (Fast 2-step inline confirm, never blocked by browser popup preventer)
  const [confirmClearQueue, setConfirmClearQueue] = useState(false);

  useEffect(() => {
    if (confirmClearQueue) {
      const timer = setTimeout(() => setConfirmClearQueue(false), 4500);
      return () => clearTimeout(timer);
    }
  }, [confirmClearQueue]);

  const handleClearQueue = () => {
    setQueue([]);
    setName('');
    setIsCustomName(false);
    setTracking('');
    setScanError(null);
    localStorage.removeItem('accounting_staging_queue_v2');
    localStorage.removeItem('accounting_staging_queue');
    setConfirmClearQueue(false);
  };

  // Open Commit Modal with Pre-filled Live Totals (Auto populated from Queue)
  const handleOpenCommitModal = () => {
    if (queue.length === 0) {
      alert('តារាងបណ្តោះអាសន្ននៅទំនេរ! សូមបញ្ចូលទិន្នន័យយ៉ាងហោចណាស់ ១ ជាមុនសិន។');
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
    const batchNumber = `BATCH-${dateStr}-${randStr}`;

    const batchData: Omit<CollectionBatch, 'id' | 'createdAt'> = {
      batchNumber,
      totalItems: queue.length,
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
      operator: currentUser ? (currentUser.name || currentUser.email) : 'Admin',
      notes: batchNote.trim() || undefined,
      items: [...queue]
    };

    const success = await onCommitBatch(batchData);

    if (success) {
      setQueue([]);
      setName('');
      setIsCustomName(false);
      setTracking('');
      setScanError(null);
      localStorage.removeItem('accounting_staging_queue_v2');
      localStorage.removeItem('accounting_staging_queue');
      setIsCommitModalOpen(false);
      handleSetViewMode('SAVED_BATCHES');
    }

    setIsCommitting(false);
  };

  // Filter Saved Batches
  const filteredBatches = useMemo(() => {
    if (!historySearch.trim()) return savedBatches;
    const q = historySearch.toLowerCase();
    return savedBatches.filter(b => 
      b.batchNumber.toLowerCase().includes(q) ||
      b.operator.toLowerCase().includes(q) ||
      (b.notes && b.notes.toLowerCase().includes(q)) ||
      b.items.some(i => i.tracking.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
    );
  }, [savedBatches, historySearch]);

  // Export Batch CSV with Looked-up columns matching UI & Google Sheets
  const handleExportCSV = (batch: CollectionBatch) => {
    const headers = ['Batch_ID', 'Tracking', 'Customer_Name', 'PAYMENT', 'USD', 'KHM', 'DATE', 'Created_At'];
    const rows = batch.items.map(i => [
      batch.batchNumber,
      `"${i.tracking}"`,
      `"${i.name}"`,
      `"${i.paymentMethod || 'CASH'}"`,
      i.usd !== undefined ? i.usd : 0,
      i.khm !== undefined ? i.khm : 0,
      `"${i.date || ''}"`,
      `"${batch.createdAt}"`
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
      `"DATE: ${batch.createdAt}"`,
      `"BATCH NOTE: ${batch.notes || ''}"`
    ];
    const csvContent = [headers.join(','), ...rows.map(r => r.join(',')), '', summaryRow.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${batch.batchNumber}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

      {/* 1. Sleek Compact Header & Mode Switcher Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        
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

        {/* Center / Right: Mode Switcher Tabs + Actions */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Segmented View Mode Switcher */}
          <div className="flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-750">
            <button
              type="button"
              onClick={() => handleSetViewMode('SCAN_QUEUE')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
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
                {queue.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSetViewMode('SAVED_BATCHES')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
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
                {savedBatches.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSetViewMode('ALL')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
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

          {/* Update Columns in Google Sheets */}
          {onUpdateGoogleSheetColumns && (
            <button
              id="btn-update-google-columns"
              type="button"
              onClick={handleUpdateColumns}
              disabled={isUpdatingColumns}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-2xs"
              title="កែសម្រួលក្បាលតារាង (Headers / Columns) ក្នុង Google Sheets ឱ្យត្រូវគ្នាជាមួយ UI ភ្លាមៗ"
            >
              <Sparkles className={`w-3 h-3 ${isUpdatingColumns ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isUpdatingColumns ? 'Updating...' : 'Update Columns'}</span>
            </button>
          )}

        </div>

      </div>

      {/* 2. Scanning Workspace (Form + Metrics Ribbon + Queue Table) */}
      {(viewMode === 'SCAN_QUEUE' || viewMode === 'ALL') && (
        <div className="space-y-2.5 sm:space-y-3">
          
          {/* Form បញ្ចូលទិន្នន័យទទួលប្រាក់ (High Density, Fast Scan) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-850 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  ១. Form បញ្ចូលទិន្នន័យ (Scan & Add)
                </h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                ចុច Enter ដើម្បីបញ្ចូលភ្លាមៗ
              </span>
            </div>

            <form onSubmit={handleAddToQueue} className="p-2.5 sm:p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-start">
                
                {/* 1. Date (Auto) - 2 Cols */}
                <div className="lg:col-span-2">
                  <label className="block font-bold text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-400 mb-0.5 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-blue-600" />
                    <span>កាលបរិច្ឆេទ</span>
                    <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 ml-auto">⚡Auto</span>
                  </label>
                  <div className="h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center font-mono font-bold text-xs text-slate-800 dark:text-slate-200">
                    {date}
                  </div>
                </div>

                {/* 2. Tracking / Barcode - 4 Cols */}
                <div className="lg:col-span-4">
                  <div className="flex items-center justify-between mb-0.5">
                    <label htmlFor="input-col-tracking" className="font-bold text-[10px] sm:text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <Barcode className="w-3 h-3 text-blue-600" />
                      <span>លេខ Tracking / កូដកញ្ចប់</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCameraScannerOpen(true)}
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
                      placeholder="ឧ. TRK-88991..."
                      value={tracking}
                      onChange={(e) => setTracking(e.target.value)}
                      className={`w-full h-9 pl-2.5 pr-18 rounded-xl font-mono text-xs focus:outline-none font-bold transition ${
                        duplicateInfo
                          ? 'border-2 border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-100 focus:ring-2 focus:ring-rose-500/40 shadow-xs'
                          : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600'
                      }`}
                    />
                    <button
                      id="btn-open-camera-scanner"
                      type="button"
                      onClick={() => setIsCameraScannerOpen(true)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:hover:bg-blue-900/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition active:scale-95 cursor-pointer shadow-2xs"
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

                  {/* Scan error if any (and duplicateInfo not already shown) */}
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
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">Data:</span>
                      <span>{lookupMatch.payment || '—'}</span>
                      <span>•</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">${lookupMatch.usd !== undefined ? lookupMatch.usd.toFixed(2) : '0.00'}</span>
                      <span>•</span>
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{lookupMatch.khm !== undefined ? lookupMatch.khm.toLocaleString() : '0'} ៛</span>
                    </div>
                  )}
                </div>

                {/* 3. Customer Name Selection Dropdown - 3 Cols */}
                <div className="lg:col-span-3">
                  <div className="flex items-center justify-between mb-0.5">
                    <label htmlFor={isCustomName ? "input-col-name-custom" : "select-col-name"} className="font-bold text-[10px] sm:text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-500" />
                      <span>ឈ្មោះអតិថិជន</span>
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
                    <div className="relative">
                      <select
                        id="select-col-name"
                        required
                        value={name}
                        onChange={(e) => {
                          if (e.target.value === '__CUSTOM__') {
                            setIsCustomName(true);
                            setName('');
                          } else {
                            setName(e.target.value);
                          }
                        }}
                        className="w-full h-9 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer appearance-none pr-7 shadow-xs"
                      >
                        <option value="">-- ជ្រើសរើសឈ្មោះអតិថិជន --</option>
                        {payers.map((p) => (
                          <option key={p.id} value={p.name}>
                            {p.name} {p.phone ? `(${p.phone})` : ''} {p.category ? `• ${p.category}` : ''}
                          </option>
                        ))}
                        <option value="__CUSTOM__">✍️ + បញ្ចូលឈ្មោះថ្មីដោយផ្ទាល់...</option>
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
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
                        className="w-full h-9 pl-2.5 pr-18 rounded-xl border border-blue-400 dark:border-blue-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-xs"
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

                {/* 4. Payment Method Dropdown - 2 Cols */}
                <div className="lg:col-span-2">
                  <label htmlFor="select-col-payment-method" className="block font-bold text-[10px] sm:text-[11px] text-slate-700 dark:text-slate-300 mb-0.5 flex items-center gap-1">
                    <CreditCard className="w-3 h-3 text-blue-600" />
                    <span>វិធីសាស្ត្រទូទាត់</span>
                  </label>
                  <div className="relative">
                    <select
                      id="select-col-payment-method"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer appearance-none pr-7 shadow-xs"
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* 5. Submit Button - 1 Col */}
                <div className="lg:col-span-1 pt-4 sm:pt-4.5">
                  <button
                    id="btn-add-to-queue"
                    type="submit"
                    disabled={!!duplicateInfo}
                    className={`w-full h-9 rounded-xl font-bold text-xs transition shadow-xs flex items-center justify-center gap-1 ${
                      duplicateInfo
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60'
                        : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-95'
                    }`}
                    title={duplicateInfo ? 'មិនអាចបញ្ចូលបានទេ (លេខកូដជាន់គ្នា)' : 'ចុច Enter ដើម្បីបញ្ចូល'}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Enter</span>
                  </button>
                </div>

              </div>
            </form>
          </div>

          {/* Compact Live Metric Bar & Action Ribbon (High-density, Replaces 4 Giant Cards) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
            
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

              {/* Stat 4: Matched in Data */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400">ក្នុង Data</div>
                  <div className="text-sm font-black font-mono text-amber-600 dark:text-amber-400 leading-tight">
                    {queueStats.lookupCount} <span className="text-[10px] font-normal text-slate-400">/ {queueStats.total}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Action Buttons: Clean Queue & Save Batch */}
            <div className="flex items-center gap-2 ml-auto">
              {queue.length > 0 && (
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

              <button
                id="btn-save-batch-total"
                type="button"
                onClick={handleOpenCommitModal}
                disabled={queue.length === 0}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Save className="w-3.5 h-3.5" />
                <span>រក្សាទុកសរុប ({queue.length} កញ្ចប់) 💾</span>
              </button>
            </div>

          </div>

          {/* Staging Queue Table Container (Compact, High-Density) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
            
            {/* Queue Table Header */}
            <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-850 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  ២. តារាងទិន្នន័យបណ្តោះអាសន្ន (Staging Queue)
                </h3>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                  {queue.length} ជួរ
                </span>
              </div>
              
              {queue.length > 0 && (
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
                        <span>យល់ព្រមសម្អាត ({queue.length})</span>
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

            {/* Queue Table Rows */}
            <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
              {queue.length === 0 ? (
                <div className="py-6 px-4 text-center text-slate-400 space-y-1.5">
                  <Layers className="w-7 h-7 mx-auto opacity-30 text-slate-400" />
                  <p className="font-bold text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                    មិនទាន់មានទិន្នន័យក្នុងតារាងបណ្តោះអាសន្ននៅឡើយទេ
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    សូមវាយបញ្ចូលលេខ Tracking ឈ្មោះអតិថិជន ក្នុង Form ខាងលើ រួចចុច Enter ដើម្បីបន្ថែម
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 z-10">
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Tracking</th>
                      <th className="py-2 px-3">ឈ្មោះអតិថិជន</th>
                      <th className="py-2 px-3">PAYMENT</th>
                      <th className="py-2 px-3">USD ($)</th>
                      <th className="py-2 px-3">KHM (៛)</th>
                      <th className="py-2 px-3">DATE</th>
                      <th className="py-2 px-3 text-right">លុប</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {queue.map((item, index) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-1.5 px-3 text-slate-400 font-mono text-[11px]">
                          {index + 1}
                        </td>
                        <td className="py-1.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.2 rounded border border-blue-200 dark:border-blue-900 text-[11px]">
                              {item.tracking}
                            </span>
                            {item.lookupFound && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300" title="រកឃើញក្នុង Data">
                                Data
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
                          {item.usd !== undefined && item.usd > 0 ? `$${item.usd.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-1.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                          {item.khm !== undefined && item.khm > 0 ? `${item.khm.toLocaleString()} ៛` : '—'}
                        </td>
                        <td className="py-1.5 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                          {item.date || '—'}
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveFromQueue(item.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                            title="លុបចេញពីតារាង"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Bottom Actions: Save Batch Total */}
            {queue.length > 0 && (
              <div className="px-3.5 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  ត្រៀមរក្សាទុកសរុប៖ <b className="text-slate-800 dark:text-slate-200">{queue.length} កញ្ចប់</b>
                </div>

                <button
                  type="button"
                  onClick={handleOpenCommitModal}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>រក្សាទុកសរុប ({queue.length}) 💾</span>
                </button>
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
                <span>អ្នកកត់ត្រា៖ <b>{currentUser ? (currentUser.name || currentUser.email) : 'Admin'}</b></span>
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
          
          <div className="p-3 sm:p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>ប្រវត្តិកញ្ចប់ដែលបានរក្សាទុករួច (Saved Collection Batches)</span>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  {savedBatches.length} Batches
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                បញ្ជីកញ្ចប់ប្រមូលប្រាក់ដែលបាន Commit ចូលប្រព័ន្ធ និង Sync ទៅកាន់ Google Sheets
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {onUpdateGoogleSheetColumns && (
                <button
                  type="button"
                  onClick={handleUpdateColumns}
                  disabled={isUpdatingColumns}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                  title="Update Columns ក្នុង Sheets"
                >
                  <Sparkles className={`w-3 h-3 ${isUpdatingColumns ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Update Columns</span>
                </button>
              )}
              {onDeleteAllBatches && savedBatches.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDeleteAllModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition active:scale-95 cursor-pointer shrink-0 shadow-2xs"
                  title="លុបកញ្ចប់ទាំងអស់ចេញពី Google Sheets និង UI"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>លុបទាំងអស់ ({savedBatches.length})</span>
                </button>
              )}
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="ស្វែងរក Batch ឬ Tracking..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
          </div>

          {filteredBatches.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              មិនទាន់មានប្រវត្តិកញ្ចប់ដែលបានរក្សាទុកនៅឡើយទេ
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredBatches.map((batch) => {
                const isExpanded = expandedBatchId === batch.id;
                return (
                  <div key={batch.id} className="transition-colors">
                    
                    {/* Batch Summary Row (Compact) */}
                    <div className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50/60 dark:hover:bg-slate-850/40">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center font-bold font-mono text-xs shrink-0">
                          {batch.totalItems}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2 font-mono font-bold text-xs text-slate-900 dark:text-white">
                            <span>{batch.batchNumber}</span>
                            <span className="text-[10px] font-sans font-semibold px-2 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                              រក្សាទុករួច
                            </span>
                            {batch.reconciliation && (
                              <span className={`text-[10px] font-sans font-bold px-2 py-0.2 rounded-full border ${
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
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            អ្នកធ្វើ៖ <b>{batch.operator}</b> • {new Date(batch.createdAt).toLocaleString('km-KH')}
                            {batch.notes && (
                              <span className="text-slate-500 font-sans ml-2">
                                • {batch.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 justify-between sm:justify-end">
                        <div className="text-right">
                          <div className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                            ${batch.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="font-mono font-bold text-[11px] text-blue-600 dark:text-blue-400">
                            ៛{batch.totalKHR.toLocaleString()}
                          </div>
                          {(batch.bankUSD !== undefined || batch.bankKHR !== undefined || batch.cashUSD !== undefined || batch.cashKHR !== undefined) && (
                            <div className="text-[10px] font-mono flex flex-wrap items-center justify-end gap-1.5 mt-0.5 font-semibold">
                              {(batch.bankUSD !== undefined || batch.bankKHR !== undefined) && (
                                <span className="text-indigo-600 dark:text-indigo-400" title="ទទួលពីធនាគារ">
                                  🏦 {batch.bankUSD !== undefined ? `$${batch.bankUSD.toFixed(2)}` : ''} {batch.bankKHR !== undefined ? `• ${batch.bankKHR.toLocaleString()}៛` : ''}
                                </span>
                              )}
                              {(batch.cashUSD !== undefined || batch.cashKHR !== undefined) && (
                                <span className="text-amber-600 dark:text-amber-400" title="ទទួលប្រាក់សុទ្ធ">
                                  💵 {batch.cashUSD !== undefined ? `$${batch.cashUSD.toFixed(2)}` : ''} {batch.cashKHR !== undefined ? `• ${batch.cashKHR.toLocaleString()}៛` : ''}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleExportCSV(batch)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                            title="ទាញយកជា CSV"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {onDeleteBatch && (
                            <button
                              id={`btn-delete-batch-${batch.batchNumber}`}
                              type="button"
                              onClick={() => setBatchToDelete(batch)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                              title="លុបកញ្ចប់"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                            title={isExpanded ? "បិទព័ត៌មានលម្អិត" : "មើលលម្អិត"}
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Items Drawer */}
                    {isExpanded && (
                      <div className="p-3 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="text-slate-400 font-bold uppercase text-[10px] border-b border-slate-200 dark:border-slate-800 pb-1.5">
                                <th className="py-1.5 px-3">Tracking</th>
                                <th className="py-1.5 px-3">ឈ្មោះអតិថិជន</th>
                                <th className="py-1.5 px-3">PAYMENT</th>
                                <th className="py-1.5 px-3">USD ($)</th>
                                <th className="py-1.5 px-3">KHM (៛)</th>
                                <th className="py-1.5 px-3">DATE</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                              {batch.items.map((item) => (
                                <tr key={item.id}>
                                  <td className="py-1.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                                    {item.tracking}
                                  </td>
                                  <td className="py-1.5 px-3 text-slate-800 dark:text-slate-200 font-semibold">
                                    {item.name}
                                  </td>
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
                                  <td className="py-1.5 px-3 text-slate-500 font-mono text-[11px]">
                                    {item.date || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}

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
                disabled={isDeletingBatch}
                onClick={async () => {
                  const b = batchToDelete;
                  if (!b || !onDeleteBatch) return;
                  setIsDeletingBatch(true);
                  try {
                    await onDeleteBatch(b.id, b.batchNumber);
                    setBatchToDelete(null);
                  } finally {
                    setIsDeletingBatch(false);
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isDeletingBatch ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isDeletingBatch ? 'កំពុងលុប...' : 'យល់ព្រមលុប'}</span>
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
                  សម្អាតទិន្នន័យ Batches ទាំងស្រុងចេញពី Sheets និង UI
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 space-y-1.5">
              <p className="font-bold flex items-center gap-1">
                ⚠️ ការព្រមានសំខាន់ (Critical Warning)៖
              </p>
              <p className="leading-relaxed">
                សកម្មភាពនេះនឹងលុបកញ្ចប់ចំនួន <b>{savedBatches.length}</b> ទាំងស្រុង៖
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>លុបរាល់ជួរទាំងអស់ក្នុង Tab <b>Batches</b> នៃ Google Sheets</li>
                <li>លុបរាល់មុខទំនិញទាំងអស់ក្នុង Tab <b>Collection_Items</b> នៃ Google Sheets</li>
                <li>សម្អាតបញ្ជីកញ្ចប់ទាំងអស់លើ UI និង LocalStorage</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                disabled={isDeletingAll}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                បោះបង់
              </button>
              <button
                type="button"
                disabled={isDeletingAll}
                onClick={async () => {
                  if (!onDeleteAllBatches) return;
                  setIsDeletingAll(true);
                  try {
                    await onDeleteAllBatches();
                    setShowDeleteAllModal(false);
                  } finally {
                    setIsDeletingAll(false);
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isDeletingAll ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isDeletingAll ? 'កំពុងលុបទាំងអស់...' : 'យល់ព្រមលុបទាំងអស់'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Camera Barcode & QR Code Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScanSuccess={handleCameraScanSuccess}
      />

    </div>
  );
};
