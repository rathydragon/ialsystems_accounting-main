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
  Sparkles,
  Sheet,
  Camera
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

  const handleCameraScanSuccess = (decodedText: string) => {
    setTracking(decodedText);
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

  // 2. Queue / Staging Table State
  const [queue, setQueue] = useState<CollectionItem[]>(() => {
    const saved = localStorage.getItem('accounting_staging_queue_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { }
    }
    return [];
  });

  // Save queue to localStorage
  useEffect(() => {
    localStorage.setItem('accounting_staging_queue_v2', JSON.stringify(queue));
  }, [queue]);

  // Modal State for Committing Batch Total
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [batchTotalUSD, setBatchTotalUSD] = useState('');
  const [batchTotalKHR, setBatchTotalKHR] = useState('');
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

  // Method Counts & Live Sums for current Queue
  const queueStats = useMemo(() => {
    let cashCollectCount = 0;
    let otherCount = 0;
    let totalUSD = 0;
    let totalKHR = 0;
    let lookupCount = 0;

    queue.forEach(item => {
      if (item.paymentMethod === 'Cash & Collect' || item.paymentMethod?.toUpperCase() === 'CASH') {
        cashCollectCount++;
      } else {
        otherCount++;
      }
      totalUSD += Number(item.usd) || 0;
      totalKHR += Number(item.khm) || 0;
      if (item.lookupFound || (item.usd !== undefined && item.usd > 0) || (item.khm !== undefined && item.khm > 0)) {
        lookupCount++;
      }
    });

    return {
      total: queue.length,
      cashCollectCount,
      otherCount,
      totalUSD,
      totalKHR,
      lookupCount
    };
  }, [queue]);

  // Add Item into Queue with Auto-Lookup from Data
  const handleAddToQueue = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trackingTrimmed = tracking.trim();
    const nameTrimmed = name.trim();

    if (!trackingTrimmed) {
      alert('សូមបញ្ចូលលេខ Tracking ឬលេខកូដកញ្ចប់!');
      trackingInputRef.current?.focus();
      return;
    }
    if (!nameTrimmed) {
      alert('សូមបញ្ចូលឈ្មោះអតិថិជន ឬអ្នកប្រគល់!');
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

    // Reset Form for next rapid scan
    setTracking('');
    trackingInputRef.current?.focus();
  };

  // Remove Item from Queue
  const handleRemoveFromQueue = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  // Clear Entire Queue
  const handleClearQueue = () => {
    if (queue.length === 0) return;
    if (window.confirm('តើអ្នកពិតជាចង់សម្អាតតារាងបណ្តោះអាសន្ននេះចោលទាំងអស់មែនទេ?')) {
      setQueue([]);
    }
  };

  // Open Commit Modal with Pre-filled Live Totals
  const handleOpenCommitModal = () => {
    if (queue.length === 0) {
      alert('តារាងបណ្តោះអាសន្ននៅទំនេរ! សូមបញ្ចូលទិន្នន័យយ៉ាងហោចណាស់ ១ ជាមុនសិន។');
      return;
    }
    setBatchTotalUSD(queueStats.totalUSD > 0 ? queueStats.totalUSD.toFixed(2) : '');
    setBatchTotalKHR(queueStats.totalKHR > 0 ? String(queueStats.totalKHR) : '');
    setBatchNote('');
    setIsCommitModalOpen(true);
  };

  // Confirm & Commit Batch with Totals
  const handleConfirmCommit = async (e: React.FormEvent) => {
    e.preventDefault();

    const totalUSD = parseFloat(batchTotalUSD) || 0;
    const totalKHR = parseFloat(batchTotalKHR) || 0;

    if (totalUSD <= 0 && totalKHR <= 0) {
      if (!window.confirm('លោកអ្នកមិនបានបញ្ចូលចំនួនទឹកប្រាក់សរុបទេ (USD=0, KHR=0)។ តើអ្នកចង់បន្តរក្សាទុកកញ្ចប់នេះដែរឬទេ?')) {
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
      operator: currentUser ? (currentUser.name || currentUser.email) : 'Admin',
      notes: batchNote.trim() || undefined,
      items: [...queue]
    };

    const success = await onCommitBatch(batchData);

    if (success) {
      setQueue([]);
      localStorage.removeItem('accounting_staging_queue_v2');
      setIsCommitModalOpen(false);
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

  return (
    <div className="space-y-6 animate-in fade-in duration-200">

      {/* Simple Page Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            ទំព័រទទួលប្រាក់ (Payment Collection)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            ស្កេន ឬបញ្ចូលលេខកញ្ចប់ Tracking ដើម្បីទាញទិន្នន័យ (PAYMENT, USD, KHM, DATE) ដោយស្វ័យប្រវត្តិពីរតារាង Data
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onUpdateGoogleSheetColumns && (
            <button
              id="btn-update-google-columns"
              type="button"
              onClick={handleUpdateColumns}
              disabled={isUpdatingColumns}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
              title="កែសម្រួលក្បាលតារាង (Headers / Columns) ក្នុង Google Sheets ឱ្យត្រូវគ្នាជាមួយ UI ភ្លាមៗ"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isUpdatingColumns ? 'animate-spin' : ''}`} />
              <span>{isUpdatingColumns ? 'កំពុង Update Columns...' : '⚡ Update Columns (Sheets)'}</span>
            </button>
          )}

          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>ក្នុងតារាងបណ្តោះអាសន្ន៖ <b className="text-blue-600 dark:text-blue-400 font-mono font-bold">{queue.length}</b> ជួរ</span>
          </div>
        </div>
      </div>

      {/* Form បញ្ចូលទិន្នន័យទទួលប្រាក់ (Horizontal Bar / បណ្ដោយ) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-850 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              ១. Form បញ្ចូលទិន្នន័យទទួលប្រាក់ (Scan & Add)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
            ចុច Enter ដើម្បីបញ្ចូលភ្លាមៗ
          </span>
        </div>

        <form onSubmit={handleAddToQueue} className="p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-start">
            
            {/* 1. Date (Auto) - 2 Cols */}
            <div className="lg:col-span-2">
              <label className="block font-bold text-[11px] text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>កាលបរិច្ឆេទ</span>
                <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 ml-auto">⚡Auto</span>
              </label>
              <div className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center font-mono font-bold text-xs text-slate-800 dark:text-slate-200">
                {date}
              </div>
            </div>

            {/* 2. Tracking / Barcode - 4 Cols */}
            <div className="lg:col-span-4">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="input-col-tracking" className="font-bold text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Barcode className="w-3.5 h-3.5 text-blue-600" />
                  <span>លេខ Tracking / កូដកញ្ចប់</span>
                  <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsCameraScannerOpen(true)}
                  className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  title="បើកកាមេរ៉ាស្កេន"
                >
                  <Camera className="w-3 h-3" />
                  <span>បើក Camera</span>
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
                  className="w-full h-10 pl-3 pr-20 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 font-bold"
                />
                <button
                  id="btn-open-camera-scanner"
                  type="button"
                  onClick={() => setIsCameraScannerOpen(true)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:hover:bg-blue-900/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition active:scale-95 cursor-pointer shadow-2xs"
                  title="បើក Camera Scan Barcode / QR Code"
                >
                  <Camera className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Scan</span>
                </button>
              </div>
              {lookupMatch && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 px-2.5 py-1 rounded-lg text-emerald-800 dark:text-emerald-300 animate-in fade-in duration-150">
                  <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">រកឃើញ Data:</span>
                  <span>PAYMENT: <b className="font-mono">{lookupMatch.payment || '—'}</b></span>
                  <span>•</span>
                  <span>USD: <b className="font-mono text-emerald-600 dark:text-emerald-400">${lookupMatch.usd !== undefined ? lookupMatch.usd.toFixed(2) : '0.00'}</b></span>
                  <span>•</span>
                  <span>KHM: <b className="font-mono text-blue-600 dark:text-blue-400">{lookupMatch.khm !== undefined ? lookupMatch.khm.toLocaleString() : '0'} ៛</b></span>
                  <span>•</span>
                  <span>DATE: <b className="font-mono">{lookupMatch.date || '—'}</b></span>
                </div>
              )}
            </div>

            {/* 3. Customer Name Selection Dropdown - 3 Cols */}
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor={isCustomName ? "input-col-name-custom" : "select-col-name"} className="font-bold text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span>ឈ្មោះអតិថិជន / អ្នកប្រគល់</span>
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
                    + បញ្ចូលឈ្មោះថ្មី
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
                    ជ្រើសរើសពី Dropdown ▾
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
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer appearance-none pr-8 shadow-xs"
                  >
                    <option value="">-- ជ្រើសរើសឈ្មោះអតិថិជន / អ្នកប្រគល់ --</option>
                    {payers.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name} {p.phone ? `(${p.phone})` : ''} {p.category ? `• ${p.category}` : ''}
                      </option>
                    ))}
                    <option value="__CUSTOM__">✍️ + បញ្ចូលឈ្មោះថ្មីដោយផ្ទាល់ (Custom Name)...</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
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
                    className="w-full h-10 pl-3 pr-24 rounded-xl border border-blue-400 dark:border-blue-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomName(false);
                      setName('');
                    }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
                    title="ត្រឡប់ទៅជ្រើសរើសពី Dropdown"
                  >
                    Dropdown ▾
                  </button>
                </div>
              )}
            </div>

            {/* 4. Payment Method Dropdown - 2 Cols */}
            <div className="lg:col-span-2">
              <label htmlFor="select-col-payment-method" className="block font-bold text-[11px] text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                <span>វិធីសាស្ត្រទូទាត់</span>
              </label>
              <div className="relative">
                <select
                  id="select-col-payment-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer appearance-none pr-8 shadow-xs"
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* 5. Submit Button - 1 Col */}
            <div className="lg:col-span-1">
              <button
                id="btn-add-to-queue"
                type="submit"
                className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-sm flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Enter</span>
              </button>
            </div>

          </div>
        </form>
      </div>

      {/* Section ២: តារាងបណ្តោះអាសន្ន & រក្សាទុកសរុប (Full Width) */}
      <div className="space-y-4">
        
        {/* Real-time Summary Cards for Current Batch */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* Total Items */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
              កញ្ចប់ក្នុងតារាង
            </span>
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono">
              {queueStats.total} <span className="text-xs font-normal text-slate-400">កញ្ចប់</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              ទិន្នន័យត្រៀមរក្សាទុក
            </div>
          </div>

          {/* Total USD */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block mb-1 flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" />
              <span>សរុបជា USD</span>
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              ${queueStats.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5 font-medium">
              បូកស្វ័យប្រវត្តិតាម Data
            </div>
          </div>

          {/* Total KHM (KHR) */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 block mb-1 flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5" />
              <span>សរុបជា KHM (៛)</span>
            </span>
            <div className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
              {queueStats.totalKHR.toLocaleString()} <span className="text-xs font-normal text-slate-400">៛</span>
            </div>
            <div className="text-[10px] text-blue-600/80 dark:text-blue-400/80 mt-0.5 font-medium">
              បូកស្វ័យប្រវត្តិតាម Data
            </div>
          </div>

          {/* Looked up from Data */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 block mb-1 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>រកឃើញក្នុង Data</span>
            </span>
            <div className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
              {queueStats.lookupCount} <span className="text-xs font-normal text-slate-400">/ {queueStats.total}</span>
            </div>
            <div className="text-[10px] text-indigo-500 mt-0.5 font-medium">
              ផ្គូផ្គងជាមួយតារាង Data
            </div>
          </div>

        </div>

        {/* Staging Queue Table Container */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
            
            {/* Queue Table Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  ២. តារាងទិន្នន័យបណ្តោះអាសន្ន (Staging Queue)
                </h3>
              </div>
              
              {queue.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearQueue}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>សម្អាតចោល</span>
                </button>
              )}
            </div>

            {/* Queue Table Rows */}
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              {queue.length === 0 ? (
                <div className="p-12 text-center text-slate-400 space-y-2">
                  <Layers className="w-10 h-10 mx-auto opacity-30 text-slate-400" />
                  <p className="font-bold text-sm text-slate-600 dark:text-slate-300">
                    មិនទាន់មានទិន្នន័យក្នុងតារាងបណ្តោះអាសន្ននៅឡើយទេ
                  </p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    សូមវាយបញ្ចូលលេខ Tracking ឈ្មោះអតិថិជន ក្នុង Form ខាងលើ រួចចុច Enter ដើម្បីបន្ថែមចូលតារាងនេះ។
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Tracking</th>
                      <th className="py-2.5 px-3">ឈ្មោះអតិថិជន</th>
                      <th className="py-2.5 px-3">PAYMENT</th>
                      <th className="py-2.5 px-3">USD ($)</th>
                      <th className="py-2.5 px-3">KHM (៛)</th>
                      <th className="py-2.5 px-3">DATE</th>
                      <th className="py-2.5 px-3 text-right">លុប</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {queue.map((item, index) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                          {index + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900">
                              {item.tracking}
                            </span>
                            {item.lookupFound && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300" title="រកឃើញក្នុង Data">
                                Data
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                          {item.name}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
                            {item.paymentMethod || '—'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {item.usd !== undefined && item.usd > 0 ? `$${item.usd.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                          {item.khm !== undefined && item.khm > 0 ? `${item.khm.toLocaleString()} ៛` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                          {item.date || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
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
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                {queue.length > 0 ? (
                  <span>ត្រៀមរក្សាទុកសរុប៖ <b>{queue.length} កញ្ចប់</b></span>
                ) : (
                  <span>សូមបញ្ចូលទិន្នន័យដើម្បីរក្សាទុក</span>
                )}
              </div>

              <button
                id="btn-save-batch-total"
                type="button"
                onClick={handleOpenCommitModal}
                disabled={queue.length === 0}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>
                  {`៣. រក្សាទុកសរុប (${queue.length} កញ្ចប់) 💾`}
                </span>
              </button>
            </div>

          </div>

        </div>

      {/* Commit Batch Total Modal */}
      {isCommitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center font-bold">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    រក្សាទុកសរុបកញ្ចប់ (Save Batch Total)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    បញ្ចូលទឹកប្រាក់សរុបសម្រាប់ {queue.length} កញ្ចប់ក្នុងតារាង
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCommitModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCommit} className="p-5 space-y-4 text-xs">
              
              {/* Batch Stat Summary */}
              <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 flex items-center justify-between">
                <span className="font-semibold text-blue-900 dark:text-blue-200">
                  ចំនួនកញ្ចប់សរុប (Total Items):
                </span>
                <span className="font-mono font-black text-sm text-blue-700 dark:text-blue-300">
                  {queue.length} កញ្ចប់
                </span>
              </div>

              {/* Total USD Amount Input */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>ទឹកប្រាក់សរុបជា USD ($)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-black text-emerald-600 text-base">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    autoFocus
                    value={batchTotalUSD}
                    onChange={(e) => setBatchTotalUSD(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono font-black text-base focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              {/* Total KHR Amount Input */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Banknote className="w-4 h-4 text-blue-600" />
                  <span>ទឹកប្រាក់សរុបជា KHR (៛)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-black text-blue-600 text-base">
                    ៛
                  </span>
                  <input
                    type="number"
                    step="100"
                    min="0"
                    placeholder="0"
                    value={batchTotalKHR}
                    onChange={(e) => setBatchTotalKHR(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono font-black text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Batch Remarks / Notes */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
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

      {/* Bottom Section: Saved Batches History */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>ប្រវត្តិកញ្ចប់ដែលបានរក្សាទុករួច (Saved Collection Batches)</span>
            </h3>
            <p className="text-xs text-slate-400">
              បញ្ជីកញ្ចប់ប្រមូលប្រាក់ដែលបាន Commit ចូលប្រព័ន្ធ និង Sync ទៅកាន់ Google Sheets
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onUpdateGoogleSheetColumns && (
              <button
                type="button"
                onClick={handleUpdateColumns}
                disabled={isUpdatingColumns}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                title="Update Columns ក្នុង Sheets"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isUpdatingColumns ? 'animate-spin' : ''}`} />
                <span>Update Columns</span>
              </button>
            )}
            {onDeleteAllBatches && savedBatches.length > 0 && (
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition active:scale-95 cursor-pointer shrink-0 shadow-2xs"
                title="លុបកញ្ចប់ទាំងអស់ចេញពី Google Sheets (Batches & Items) និង UI ក្នុងពេលតែមួយ (Delete All in One)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>លុបទាំងអស់ ({savedBatches.length})</span>
              </button>
            )}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="ស្វែងរក Batch ឬ Tracking..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>
        </div>

        {filteredBatches.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            មិនទាន់មានប្រវត្តិកញ្ចប់ដែលបានរក្សាទុកនៅឡើយទេ
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredBatches.map((batch) => {
              const isExpanded = expandedBatchId === batch.id;
              return (
                <div key={batch.id} className="transition-colors">
                  
                  {/* Batch Summary Row */}
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-850/40">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center font-bold font-mono text-xs shrink-0">
                        {batch.totalItems}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 font-mono font-bold text-xs text-slate-900 dark:text-white">
                          <span>{batch.batchNumber}</span>
                          <span className="text-[10px] font-sans font-semibold px-2 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                            រក្សាទុករួច
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          អ្នកធ្វើ៖ <b>{batch.operator}</b> • កាលបរិច្ឆេទ៖ {new Date(batch.createdAt).toLocaleString('km-KH')}
                          {batch.notes && (
                            <span className="block text-slate-500 font-sans mt-0.5">
                              ចំណាំ៖ {batch.notes}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 justify-between sm:justify-end">
                      <div className="text-right">
                        <div className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                          ${batch.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                          ៛{batch.totalKHR.toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleExportCSV(batch)}
                          className="p-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                          title="ទាញយកជា CSV"
                        >
                          <Download className="w-4 h-4" />
                        </button>

                        {onDeleteBatch && (
                          <button
                            id={`btn-delete-batch-${batch.batchNumber}`}
                            type="button"
                            onClick={() => setBatchToDelete(batch)}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                            title="លុបកញ្ចប់"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                          className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          title={isExpanded ? "បិទព័ត៌មានលម្អិត" : "មើលលម្អិត"}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Items Drawer */}
                  {isExpanded && (
                    <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-slate-400 font-bold uppercase text-[10px] border-b border-slate-200 dark:border-slate-800 pb-2">
                              <th className="py-2 px-3">Tracking</th>
                              <th className="py-2 px-3">ឈ្មោះអតិថិជន</th>
                              <th className="py-2 px-3">PAYMENT</th>
                              <th className="py-2 px-3">USD ($)</th>
                              <th className="py-2 px-3">KHM (៛)</th>
                              <th className="py-2 px-3">DATE</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                            {batch.items.map((item) => (
                              <tr key={item.id}>
                                <td className="py-2 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                                  {item.tracking}
                                </td>
                                <td className="py-2 px-3 text-slate-800 dark:text-slate-200 font-semibold">
                                  {item.name}
                                </td>
                                <td className="py-2 px-3">
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
                                    {item.paymentMethod || '—'}
                                  </span>
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  {item.usd !== undefined && item.usd > 0 ? `$${item.usd.toFixed(2)}` : '—'}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                                  {item.khm !== undefined && item.khm > 0 ? `${item.khm.toLocaleString()} ៛` : '—'}
                                </td>
                                <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
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
