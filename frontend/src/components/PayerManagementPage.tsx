import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  Phone, 
  MapPin, 
  Edit3, 
  Trash2, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  X, 
  Motorbike, 
  Building, 
  Store, 
  Layers,
  FileSpreadsheet,
  Check,
  ExternalLink
} from 'lucide-react';
import { Payer, PayerCategory, AuthUser, AppSettings } from '../types';
import { formatCsv, downloadCsv } from '../utils/csvHelper';
import {
  gridWrap,
  gridTable,
  gridTh,
  gridTd,
  gridRow,
  gridRowSelected,
  gridNull,
  GridHeadGutter,
  GridRowGutter,
  GridSelectionBar,
  useRowSelection,
  copyRowsAsTsv,
  exportRowsAsCsv,
} from './ui/DataGrid';

interface PayerManagementPageProps {
  payers: Payer[];
  currentUser: AuthUser | null;
  settings: AppSettings;
  onAddPayer: (payerData: Omit<Payer, 'id' | 'createdAt'>) => Promise<boolean> | boolean;
  onUpdatePayer: (id: string, updated: Partial<Payer>) => Promise<boolean> | boolean;
  onDeletePayer: (id: string) => Promise<boolean> | boolean;
  onSyncGoogleSheets?: () => Promise<void>;
  onRefreshMasterData?: (silent?: boolean) => Promise<void>;
}

const CATEGORY_MAP: Record<PayerCategory, { label: string; icon: any; color: string }> = {
  RIDER: { label: 'អ្នកដឹកជញ្ជូន (Rider)', icon: Motorbike, color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800' },
  CUSTOMER: { label: 'អតិថិជន (Client)', icon: Users, color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800' },
  BRANCH: { label: 'បុគ្គលិកសាខា (Branch)', icon: Building, color: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800' },
  PARTNER: { label: 'ដៃគូសហការ (Partner)', icon: Store, color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800' },
  OTHER: { label: 'ផ្សេងៗ (Other)', icon: Layers, color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' }
};

export const normalizePayerCategory = (p: Payer): PayerCategory => {
  const c = String(p.category || '').toUpperCase().trim();
  const a = String(p.area || '').toUpperCase().trim();
  const n = String(p.notes || '').toUpperCase().trim();
  const name = String(p.name || '').toUpperCase().trim();
  const combined = `${c} ${a} ${n} ${name}`;

  if (c === 'RIDER' || combined.includes('RIDER') || combined.includes('អ្នកដឹក') || combined.includes('ដឹកជញ្ជូន') || combined.includes('DELIVERY') || combined.includes('DRIVER')) {
    return 'RIDER';
  }
  if (c === 'BRANCH' || combined.includes('BRANCH') || combined.includes('សាខា') || combined.includes('OVERSEA') || combined.includes('OCS') || combined.includes('ផ្នែក') || combined.includes('OFFICE')) {
    return 'BRANCH';
  }
  if (c === 'CUSTOMER' || combined.includes('CUSTOMER') || combined.includes('អតិថិជន') || combined.includes('CLIENT')) {
    return 'CUSTOMER';
  }
  if (c === 'PARTNER' || combined.includes('PARTNER') || combined.includes('ដៃគូ') || combined.includes('AGENT')) {
    return 'PARTNER';
  }
  return (p.category as PayerCategory) || 'OTHER';
};

export const PayerManagementPage: React.FC<PayerManagementPageProps> = ({
  payers,
  currentUser,
  settings,
  onAddPayer,
  onUpdatePayer,
  onDeletePayer,
  onSyncGoogleSheets,
  onRefreshMasterData
}) => {
  const isViewer = currentUser?.role === 'VIEWER';
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPayer, setEditingPayer] = useState<Payer | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshingMaster, setIsRefreshingMaster] = useState(false);
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);

  // Form State
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCategory, setFormCategory] = useState<PayerCategory>('RIDER');
  const [formArea, setFormArea] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Stats
  const stats = useMemo(() => {
    let riderCount = 0;
    let customerCount = 0;
    let branchCount = 0;
    let partnerCount = 0;
    let otherCount = 0;
    let activeCount = 0;

    payers.forEach(p => {
      if (p.status === 'ACTIVE') activeCount++;
      const cat = normalizePayerCategory(p);
      if (cat === 'RIDER') riderCount++;
      else if (cat === 'CUSTOMER') customerCount++;
      else if (cat === 'BRANCH') branchCount++;
      else if (cat === 'PARTNER') partnerCount++;
      else otherCount++;
    });

    return {
      total: payers.length,
      riderCount,
      customerCount,
      branchCount,
      partnerCount,
      otherCount,
      activeCount
    };
  }, [payers]);

  // Filtered Payers
  const filteredPayers = useMemo(() => {
    return payers.filter(p => {
      const effectiveCategory = normalizePayerCategory(p);
      const matchCategory = selectedCategory === 'ALL' || effectiveCategory === selectedCategory;
      const q = searchTerm.toLowerCase().trim();
      const matchSearch = !q || 
        p.name.toLowerCase().includes(q) || 
        (p.phone && p.phone.includes(q)) || 
        (p.area && p.area.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q));
      return matchCategory && matchSearch;
    });
  }, [payers, selectedCategory, searchTerm]);

  // Row selection for the desktop staff table
  const payerKeys = useMemo(() => filteredPayers.map((p) => p.id), [filteredPayers]);
  const payerSelection = useRowSelection(payerKeys);
  const selectedPayerMatrix = (): [string[], any[][]] => [
    ['Name', 'Phone', 'Category', 'Area', 'Status', 'Notes'],
    filteredPayers
      .filter((p) => payerSelection.isSelected(p.id))
      .map((p) => [p.name, p.phone || '', normalizePayerCategory(p), p.area || '', p.status, p.notes || '']),
  ];

  // Open Create Modal
  const handleOpenCreateModal = () => {
    if (isViewer) {
      alert('គណនីរបស់អ្នកមានសិទ្ធិមើលប៉ុណ្ណោះ (Viewer - Read Only) មិនអាចបន្ថែមអ្នកប្រគល់ប្រាក់បានឡើយ!');
      return;
    }
    setEditingPayer(null);
    setFormName('');
    setFormPhone('');
    setFormCategory('RIDER');
    setFormArea('');
    setFormNotes('');
    setFormStatus('ACTIVE');
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (payer: Payer) => {
    if (isViewer) {
      alert('គណនីរបស់អ្នកមានសិទ្ធិមើលប៉ុណ្ណោះ (Viewer - Read Only) មិនអាចកែប្រែទិន្នន័យបានឡើយ!');
      return;
    }
    setEditingPayer(payer);
    setFormName(payer.name);
    setFormPhone(payer.phone || '');
    setFormCategory(payer.category);
    setFormArea(payer.area || '');
    setFormNotes(payer.notes || '');
    setFormStatus(payer.status);
    setIsModalOpen(true);
  };

  // Handle Submit Form
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formName.trim();
    if (!trimmedName) {
      alert('សូមបញ្ចូលឈ្មោះអ្នកប្រគល់ប្រាក់!');
      return;
    }

    if (editingPayer) {
      // Update
      await onUpdatePayer(editingPayer.id, {
        name: trimmedName,
        phone: formPhone.trim() || undefined,
        category: formCategory,
        area: formArea.trim() || undefined,
        notes: formNotes.trim() || undefined,
        status: formStatus,
        updatedAt: new Date().toISOString()
      });
    } else {
      // Add
      await onAddPayer({
        name: trimmedName,
        phone: formPhone.trim() || undefined,
        category: formCategory,
        area: formArea.trim() || undefined,
        notes: formNotes.trim() || undefined,
        status: formStatus,
        totalBatches: 0,
        totalUSD: 0,
        totalKHR: 0
      });
    }

    setIsModalOpen(false);
  };

  // Export Payers CSV
  const handleExportCSV = () => {
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

    const headers = ['ID', 'Name', 'Phone', 'Category', 'Area', 'Status', 'Created_At'];
    const rows = filteredPayers.map(p => [
      p.id,
      p.name,
      p.phone || '',
      p.category,
      p.area || '',
      p.status,
      formatDateTimeForCSV(p.createdAt)
    ]);
    const csvContent = formatCsv(headers, rows);
    downloadCsv(`Payers_List_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
  };

  // Trigger Google Sheet sync
  const handleTriggerSync = async () => {
    if (onSyncGoogleSheets) {
      setIsSyncing(true);
      await onSyncGoogleSheets();
      setIsSyncing(false);
    }
  };

  return (
    <div className="page-fill w-full space-y-2 animate-in fade-in duration-200 pb-24 lg:pb-0">

      {/* Viewer Mode Alert Banner */}
      {isViewer && (
        <div className="p-2 sm:p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span><b>សិទ្ធិមើលប៉ុណ្ណោះ (Viewer - Read Only)៖</b> មិនអាចបន្ថែម កែប្រែ ឬលុបអ្នកប្រគល់ប្រាក់បានឡើយ។</span>
        </div>
      )}

      {/* Main Directory Table Container */}
      <div className="page-fill-body bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">

        {/* Single compact toolbar: title + search + category pills + actions
            (phone: title/actions -> search -> pills; lg: everything on one row) */}
        <div className="px-2.5 sm:px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex flex-wrap items-center gap-2">

          {/* Title */}
          <div className="order-1 flex items-center gap-2 min-w-0 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white tracking-tight whitespace-nowrap">
              អ្នកប្រគល់ប្រាក់
            </h2>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-mono font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60 whitespace-nowrap"
              title={`${stats.total} នាក់ • ${stats.activeCount} សកម្ម`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {stats.activeCount}/{stats.total}
            </span>
          </div>

          {/* Search */}
          <div className="order-3 w-full lg:w-auto lg:flex-1 lg:min-w-[180px] relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ស្វែងរកតាមឈ្មោះ, លេខទូរស័ព្ទ, ឬតំបន់..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-7 h-8 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                title="សម្អាត"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="order-4 w-full lg:w-auto overflow-x-auto scrollbar-none">
            <div className="inline-flex items-center gap-1 bg-white dark:bg-slate-800/90 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px]">
              <button
                type="button"
                onClick={() => setSelectedCategory('ALL')}
                className={`h-7 px-2.5 rounded-md font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedCategory === 'ALL'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                ទាំងអស់ ({stats.total})
              </button>
              {stats.branchCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('BRANCH')}
                  className={`h-7 px-2.5 rounded-md font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    selectedCategory === 'BRANCH'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  សាខា ({stats.branchCount})
                </button>
              )}
              {stats.riderCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('RIDER')}
                  className={`h-7 px-2.5 rounded-md font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    selectedCategory === 'RIDER'
                      ? 'bg-amber-500 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Rider ({stats.riderCount})
                </button>
              )}
              {stats.customerCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('CUSTOMER')}
                  className={`h-7 px-2.5 rounded-md font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    selectedCategory === 'CUSTOMER'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  អតិថិជន ({stats.customerCount})
                </button>
              )}
              {stats.partnerCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('PARTNER')}
                  className={`h-7 px-2.5 rounded-md font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    selectedCategory === 'PARTNER'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  ដៃគូ ({stats.partnerCount})
                </button>
              )}
              {stats.otherCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('OTHER')}
                  className={`h-7 px-2.5 rounded-md font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    selectedCategory === 'OTHER'
                      ? 'bg-slate-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  ផ្សេងៗ ({stats.otherCount})
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="order-2 lg:order-5 ml-auto lg:ml-0 flex items-center gap-1.5 shrink-0">
            {/* Instant Live Sync Button */}
            {onRefreshMasterData && (
              <button
                id="btn-sync-master-payers"
                type="button"
                onClick={async () => {
                  setIsRefreshingMaster(true);
                  try {
                    await onRefreshMasterData(false);
                  } finally {
                    setTimeout(() => setIsRefreshingMaster(false), 600);
                  }
                }}
                disabled={isRefreshingMaster}
                className="h-8 px-2 rounded-lg border border-emerald-200/80 dark:border-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1 transition shadow-2xs cursor-pointer disabled:opacity-50 shrink-0"
                title="ទាញទិន្នន័យអ្នកប្រគល់ប្រាក់ថ្មីពី Hostinger Master Database ភ្លាមៗ (Instant Live Sync)"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingMaster ? 'animate-spin text-emerald-600' : ''}`} />
                <span>Live</span>
              </button>
            )}

            {/* Sync Button */}
            <button
              id="btn-sync-payers"
              type="button"
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="h-8 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 transition shadow-2xs cursor-pointer disabled:opacity-50 shrink-0"
              title="ធ្វើសមកាលកម្មទិន្នន័យជាមួយ Google Sheets"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>

            {/* View Google Sheets Schema button */}
            <button
              type="button"
              onClick={() => setIsSchemaModalOpen(true)}
              className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center transition cursor-pointer shrink-0"
              title="ទម្រង់តារាង (Google Sheets Table Structure)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            </button>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition flex items-center gap-1 cursor-pointer text-xs font-semibold shadow-2xs shrink-0"
              title="ទាញយកជា CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </button>

            {/* Add Payer Button */}
            {!isViewer && (
              <button
                id="btn-add-payer"
                type="button"
                onClick={handleOpenCreateModal}
                className="h-8 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-semibold flex items-center justify-center gap-1 transition shadow-xs cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>បន្ថែម</span>
              </button>
            )}
          </div>

        </div>

        {/* Payers Table & Mobile Card List */}
        <div className="page-fill-body">
          {filteredPayers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Users className="w-10 h-10 mx-auto opacity-30 text-slate-400" />
              <p className="font-bold text-sm text-slate-600 dark:text-slate-300">
                មិនទាន់មានអ្នកប្រគល់ប្រាក់នៅឡើយទេ
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                សូមចុចប៊ូតុង «+ បន្ថែមអ្នកប្រគល់ប្រាក់» ខាងលើដើម្បីចុះឈ្មោះអ្នកដឹកជញ្ជូន អតិថិជន ឬបុគ្គលិកប្រគល់ប្រាក់។
              </p>
            </div>
          ) : (
            <>
              {/* 1. Desktop Table View (hidden on mobile, visible on lg:block) */}
              <div className="page-fill-body hidden lg:block space-y-1.5">
                {payerSelection.count > 0 && (
                  <GridSelectionBar
                    count={payerSelection.count}
                    onCopy={() => copyRowsAsTsv(...selectedPayerMatrix())}
                    onExport={() => exportRowsAsCsv('company_staff_selected', ...selectedPayerMatrix())}
                    onClear={payerSelection.clear}
                  />
                )}
                <div className={`page-fill-scroll ${gridWrap} max-h-[calc(100vh-300px)]`}>
                <table className={gridTable}>
                  <thead>
                    <tr>
                      <GridHeadGutter
                        checked={payerSelection.allChecked}
                        indeterminate={payerSelection.someChecked}
                        onToggleAll={payerSelection.toggleAll}
                      />
                      <th className={`${gridTh()} min-w-[240px]`}><span className="font-medium">ឈ្មោះអ្នកប្រគល់</span></th>
                      <th className={`${gridTh()} min-w-[140px]`}><span className="font-medium">លេខទូរស័ព្ទ</span></th>
                      <th className={`${gridTh()} min-w-[160px]`}><span className="font-medium">ប្រភេទ / តួនាទី</span></th>
                      <th className={`${gridTh()} min-w-[140px]`}><span className="font-medium">តំបន់ / សាខា</span></th>
                      <th className={`${gridTh()} min-w-[130px]`}><span className="font-medium">ស្ថានភាព</span></th>
                      <th className={`${gridTh()} text-right min-w-[90px]`}><span className="font-medium">សកម្មភាព</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayers.map((payer, idx) => {
                      const effectiveCategory = normalizePayerCategory(payer);
                      const catInfo = CATEGORY_MAP[effectiveCategory] || CATEGORY_MAP.OTHER;
                      const CatIcon = catInfo.icon;
                      const isSelected = payerSelection.isSelected(payer.id);
                      const statusCls =
                        payer.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30'
                          : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
                      const statusLabel = (
                        <>
                          <span className={`w-1.5 h-1.5 rounded-full ${payer.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {payer.status === 'ACTIVE' ? 'សកម្ម (Active)' : 'ផ្អាក (Inactive)'}
                        </>
                      );
                      return (
                        <tr key={payer.id} className={`${gridRow} ${isSelected ? gridRowSelected : ''}`}>
                          <GridRowGutter
                            selected={isSelected}
                            rowNumber={idx + 1}
                            onToggle={() => payerSelection.toggle(payer.id)}
                          />

                          <td className={gridTd()}>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center font-semibold text-[11px] shrink-0">
                                {payer.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-slate-900 dark:text-slate-100">{payer.name}</span>
                              {payer.notes && (
                                <span className="text-[11px] text-slate-400 truncate max-w-[150px]" title={payer.notes}>
                                  · {payer.notes}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className={`${gridTd()} font-mono tabular-nums`}>
                            {payer.phone ? (
                              <a
                                href={`tel:${payer.phone}`}
                                className="text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400"
                              >
                                {payer.phone}
                              </a>
                            ) : (
                              gridNull
                            )}
                          </td>

                          <td className={gridTd()}>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium ${catInfo.color}`}>
                              <CatIcon className="w-3 h-3" />
                              <span>{catInfo.label}</span>
                            </span>
                          </td>

                          <td className={`${gridTd()} text-slate-600 dark:text-slate-300`}>
                            {payer.area || gridNull}
                          </td>

                          <td className={gridTd()}>
                            {isViewer ? (
                              <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[11px] font-medium ${statusCls}`}>
                                {statusLabel}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onUpdatePayer(payer.id, {
                                  status: payer.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
                                })}
                                title="ចុចដើម្បីប្តូរស្ថានភាព"
                                className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[11px] font-medium cursor-pointer transition hover:opacity-80 ${statusCls}`}
                              >
                                {statusLabel}
                              </button>
                            )}
                          </td>

                          <td className={`${gridTd()} text-right`}>
                            {isViewer ? (
                              <span className="text-[10px] text-slate-400 font-mono">មើលប៉ុណ្ណោះ</span>
                            ) : (
                              <div className="flex items-center justify-end gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(payer)}
                                  className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                  title="កែប្រែ"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`តើអ្នកពិតជាចង់លុបអ្នកប្រគល់ «${payer.name}» មែនទេ?`)) {
                                      onDeletePayer(payer.id);
                                    }
                                  }}
                                  className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                                  title="លុប"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>

              {/* 2. Mobile Card List View (visible on mobile, hidden on lg) */}
              <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredPayers.map((payer, idx) => {
                  const effectiveCategory = normalizePayerCategory(payer);
                  const catInfo = CATEGORY_MAP[effectiveCategory] || CATEGORY_MAP.OTHER;
                  const CatIcon = catInfo.icon;
                  const isActive = payer.status === 'ACTIVE';

                  return (
                    <div
                      key={payer.id}
                      className={`px-3 py-2.5 flex items-center gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${isActive ? '' : 'opacity-60'}`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-200/80 dark:border-blue-900">
                        {payer.name.charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="font-bold text-[13px] text-slate-900 dark:text-white truncate">{payer.name}</p>
                        <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-bold border shrink-0 ${catInfo.color}`}>
                            <CatIcon className="w-2.5 h-2.5" />
                            {catInfo.label.split(' ')[0]}
                          </span>
                          {payer.phone ? (
                            <a
                              href={`tel:${payer.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-mono font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-600 inline-flex items-center gap-0.5 shrink-0"
                            >
                              <Phone className="w-3 h-3 text-slate-400" />
                              {payer.phone}
                            </a>
                          ) : (
                            <span className="text-slate-400 italic shrink-0">គ្មានលេខ</span>
                          )}
                          {payer.area && (
                            <span className="inline-flex items-center gap-0.5 min-w-0">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{payer.area}</span>
                            </span>
                          )}
                        </div>
                        {payer.notes && (
                          <p className="text-[10.5px] text-slate-400 dark:text-slate-500 truncate">{payer.notes}</p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {isViewer ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              isActive
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
                                : 'bg-slate-100 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {isActive ? 'សកម្ម' : 'ផ្អាក'}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onUpdatePayer(payer.id, { status: isActive ? 'INACTIVE' : 'ACTIVE' })}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-pointer active:scale-95 transition ${
                              isActive
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
                                : 'bg-slate-100 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                            }`}
                            title="ចុចដើម្បីប្ដូរស្ថានភាព"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {isActive ? 'សកម្ម' : 'ផ្អាក'}
                          </button>
                        )}
                        {!isViewer && (
                          <div className="flex items-center -mr-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(payer)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                              aria-label={`កែប្រែ ${payer.name}`}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`តើអ្នកពិតជាចង់លុបអ្នកប្រគល់ «${payer.name}» មែនទេ?`)) {
                                  onDeletePayer(payer.id);
                                }
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                              aria-label={`លុប ${payer.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

      </div>

      {/* Modal: Add / Edit Payer */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    {editingPayer ? 'កែប្រែព័ត៌មានអ្នកប្រគល់ប្រាក់' : 'ចុះឈ្មោះអ្នកប្រគល់ប្រាក់ថ្មី'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    បញ្ចូលព័ត៌មានដើម្បីងាយស្រួលជ្រើសរើសក្នុងទំព័រទទួលប្រាក់
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-5 space-y-4 text-xs">
              
              {/* Payer Name */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ឈ្មោះអ្នកប្រគល់ប្រាក់ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="ឧ. លោក សុខា, វណ្ណា Delivery, ក្រុមហ៊ុន ABC..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Phone & Category Grid */}
              <div className="grid grid-cols-2 gap-3">
                
                {/* Phone */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>លេខទូរស័ព្ទ</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="012 345 678"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ប្រភេទ / តួនាទី
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as PayerCategory)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  >
                    <option value="RIDER">អ្នកដឹកជញ្ជូន (Rider)</option>
                    <option value="CUSTOMER">អតិថិជន (Client)</option>
                    <option value="BRANCH">បុគ្គលិកសាខា (Branch)</option>
                    <option value="PARTNER">ដៃគូសហការ (Partner)</option>
                    <option value="OTHER">ផ្សេងៗ (Other)</option>
                  </select>
                </div>

              </div>

              {/* Area / Zone */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>តំបន់ / សាខា / អាសយដ្ឋាន</span>
                </label>
                <input
                  type="text"
                  placeholder="ឧ. ភ្នំពេញ, សាខាច្បារអំពៅ, តំបន់បឹងកេងកង..."
                  value={formArea}
                  onChange={(e) => setFormArea(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  កំណត់ចំណាំ (Remarks) - ជម្រើស
                </label>
                <input
                  type="text"
                  placeholder="ព័ត៌មានបន្ថែម (បើមាន)..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ស្ថានភាពគណនី
                </label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-emerald-600">
                    <input
                      type="radio"
                      name="formStatus"
                      checked={formStatus === 'ACTIVE'}
                      onChange={() => setFormStatus('ACTIVE')}
                    />
                    <span>សកម្ម (Active)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-500">
                    <input
                      type="radio"
                      name="formStatus"
                      checked={formStatus === 'INACTIVE'}
                      onChange={() => setFormStatus('INACTIVE')}
                    />
                    <span>ផ្អាក (Inactive)</span>
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  បោះបង់
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-md flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingPayer ? 'រក្សាទុកការកែប្រែ' : 'បន្ថែមអ្នកប្រគល់'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Modal: Google Sheets Table Structure Guide */}
      {isSchemaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center font-bold">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    រចនាសម្ព័ន្ធតារាងក្នុង Google Sheets (Table Schema)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Tab Name: <code className="text-blue-600 font-bold">Payers</code>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSchemaModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                នៅក្នុង Google Spreadsheet របស់លោកអ្នក ប្រព័ន្ធគាំទ្រ Tab ឈ្មោះ <b>«Payers»</b> ដោយមានជួរឈរ (Columns) ដូចខាងក្រោម៖
              </p>

              <div className="sb-grid-wrap">
                <table className="sb-grid w-full text-left">
                  <thead>
                    <tr>
                      <th className="py-2 px-3">Column</th>
                      <th className="py-2 px-3">Header Name</th>
                      <th className="py-2 px-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    <tr>
                      <td className="py-2 px-3 font-bold text-blue-600">A</td>
                      <td className="py-2 px-3 font-bold">ID</td>
                      <td className="py-2 px-3 font-sans text-slate-500">លេខសម្គាល់អ្នកប្រគល់</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-bold text-blue-600">B</td>
                      <td className="py-2 px-3 font-bold">Name</td>
                      <td className="py-2 px-3 font-sans text-slate-500">ឈ្មោះអ្នកប្រគល់ប្រាក់</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-bold text-blue-600">C</td>
                      <td className="py-2 px-3 font-bold">Phone</td>
                      <td className="py-2 px-3 font-sans text-slate-500">លេខទូរស័ព្ទ</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-bold text-blue-600">D</td>
                      <td className="py-2 px-3 font-bold">Category</td>
                      <td className="py-2 px-3 font-sans text-slate-500">ប្រភេទ (Rider, Customer...)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-bold text-blue-600">E</td>
                      <td className="py-2 px-3 font-bold">Area</td>
                      <td className="py-2 px-3 font-sans text-slate-500">តំបន់ / សាខា</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-bold text-blue-600">F</td>
                      <td className="py-2 px-3 font-bold">Status</td>
                      <td className="py-2 px-3 font-sans text-slate-500">ស្ថានភាព (ACTIVE/INACTIVE)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-bold text-blue-600">G</td>
                      <td className="py-2 px-3 font-bold">Notes</td>
                      <td className="py-2 px-3 font-sans text-slate-500">ចំណាំបន្ថែម</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-bold text-blue-600">H</td>
                      <td className="py-2 px-3 font-bold">Created_At</td>
                      <td className="py-2 px-3 font-sans text-slate-500">កាលបរិច្ឆេទបង្កើត</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Google Apps Script ក្នុង <code>Code.gs</code> នឹងបង្កើត Tab នេះដោយស្វ័យប្រវត្តិនៅពេលលោកអ្នក Save ឬ Sync។</span>
              </div>

              <button
                type="button"
                onClick={() => setIsSchemaModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold transition"
              >
                យល់ព្រម (Close)
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
