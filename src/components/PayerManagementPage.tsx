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

interface PayerManagementPageProps {
  payers: Payer[];
  currentUser: AuthUser | null;
  settings: AppSettings;
  onAddPayer: (payerData: Omit<Payer, 'id' | 'createdAt'>) => Promise<boolean> | boolean;
  onUpdatePayer: (id: string, updated: Partial<Payer>) => Promise<boolean> | boolean;
  onDeletePayer: (id: string) => Promise<boolean> | boolean;
  onSyncGoogleSheets?: () => Promise<void>;
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
  onSyncGoogleSheets
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPayer, setEditingPayer] = useState<Payer | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
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

  // Open Create Modal
  const handleOpenCreateModal = () => {
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
    const headers = ['ID', 'Name', 'Phone', 'Category', 'Area', 'Status', 'Created_At'];
    const rows = filteredPayers.map(p => [
      p.id,
      `"${p.name}"`,
      `"${p.phone || ''}"`,
      p.category,
      `"${p.area || ''}"`,
      p.status,
      p.createdAt
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Payers_List_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
    <div className="space-y-6 animate-in fade-in duration-200">

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <Users className="w-4 h-4" />
            </div>
            <span>អ្នកប្រគល់ប្រាក់ (Payers & Remitters)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            គ្រប់គ្រងបញ្ជីឈ្មោះអ្នកប្រគល់ប្រាក់ (អ្នកដឹកជញ្ជូន, អតិថិជន, ដៃគូ) និង Sync ជាមួយ Google Sheets
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sync Button */}
          <button
            id="btn-sync-payers"
            type="button"
            onClick={handleTriggerSync}
            disabled={isSyncing}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50"
            title="ធ្វើសមកាលកម្មទិន្នន័យជាមួយ Google Sheets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'កំពុង Sync...' : 'Sync Sheets'}</span>
          </button>

          {/* View Google Sheets Schema button */}
          <button
            type="button"
            onClick={() => setIsSchemaModalOpen(true)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            title="Google Sheets Table Structure"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">ទម្រង់តារាង Sheets</span>
          </button>

          {/* Add Payer Button */}
          <button
            id="btn-add-payer"
            type="button"
            onClick={handleOpenCreateModal}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ បន្ថែមអ្នកប្រគល់ប្រាក់</span>
          </button>
        </div>
      </div>

      {/* Google Sheets Connection & Status Banner */}
      <div className="px-4 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 dark:bg-emerald-950/30 dark:border-emerald-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
          <span className="font-semibold text-emerald-900 dark:text-emerald-200">
            Google Sheets Database: <span className="font-mono text-emerald-700 dark:text-emerald-400">Sheet Tab "Payers"</span> (សកម្ម & Sync ដោយស្វ័យប្រវត្ត)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={`https://docs.google.com/spreadsheets/d/${settings?.spreadsheetId || '1SOAJ0-ipwJ6iSvEzMGqwny7ofbKTjsdnVdvz8eYLtnw'}/edit`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold text-[11px]"
          >
            <span>បើកមើលតារាង Google Sheets ផ្ទាល់</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Payers */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              អ្នកប្រគល់សរុប
            </span>
            <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600">
              <Users className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {stats.total} <span className="text-xs font-normal text-slate-400 font-sans">នាក់</span>
          </div>
        </div>

        {/* Riders */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
              អ្នកដឹក (Riders)
            </span>
            <span className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600">
              <Motorbike className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
            {stats.riderCount} <span className="text-xs font-normal text-slate-400 font-sans">នាក់</span>
          </div>
        </div>

        {/* Branches & Clients & Partners */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
              សាខា & អតិថិជន
            </span>
            <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600">
              <Building className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
            {stats.branchCount + stats.customerCount + stats.partnerCount} <span className="text-xs font-normal text-slate-400 font-sans">នាក់</span>
          </div>
        </div>

        {/* Active Status */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              ស្ថានភាពសកម្ម
            </span>
            <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-600 font-mono">
            {stats.activeCount} <span className="text-xs font-normal text-slate-400 font-sans">សកម្ម</span>
          </div>
        </div>
      </div>

      {/* Main Directory Table Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        
        {/* Table Search & Category Filter Toolbar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="ស្វែងរកតាមឈ្មោះ, លេខទូរស័ព្ទ, ឬតំបន់..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px]">
              <button
                type="button"
                onClick={() => setSelectedCategory('ALL')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  selectedCategory === 'ALL'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                ទាំងអស់ ({stats.total})
              </button>
              {stats.branchCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('BRANCH')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    selectedCategory === 'BRANCH'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  សាខា / ផ្នែក ({stats.branchCount})
                </button>
              )}
              {stats.riderCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('RIDER')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    selectedCategory === 'RIDER'
                      ? 'bg-amber-500 text-white shadow-xs'
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
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    selectedCategory === 'CUSTOMER'
                      ? 'bg-blue-600 text-white shadow-xs'
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
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    selectedCategory === 'PARTNER'
                      ? 'bg-emerald-600 text-white shadow-xs'
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
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    selectedCategory === 'OTHER'
                      ? 'bg-slate-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  ផ្សេងៗ ({stats.otherCount})
                </button>
              )}
            </div>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
              title="ទាញយកជា CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

        {/* Payers Table */}
        <div className="overflow-x-auto">
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
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">ឈ្មោះអ្នកប្រគល់</th>
                  <th className="py-3 px-4">លេខទូរស័ព្ទ</th>
                  <th className="py-3 px-4">ប្រភេទ / តួនាទី</th>
                  <th className="py-3 px-4">តំបន់ / សាខា</th>
                  <th className="py-3 px-4">ស្ថានភាព</th>
                  <th className="py-3 px-4 text-right">សកម្មភាព</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPayers.map((payer, idx) => {
                  const effectiveCategory = normalizePayerCategory(payer);
                  const catInfo = CATEGORY_MAP[effectiveCategory] || CATEGORY_MAP.OTHER;
                  const CatIcon = catInfo.icon;
                  return (
                    <tr key={payer.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-200 dark:border-blue-900">
                            {payer.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white text-xs block">
                              {payer.name}
                            </span>
                            {payer.notes && (
                              <span className="text-[10px] text-slate-400 truncate max-w-[150px] block">
                                {payer.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {payer.phone ? (
                          <a
                            href={`tel:${payer.phone}`}
                            className="font-mono text-slate-700 dark:text-slate-300 hover:text-blue-600 flex items-center gap-1 font-semibold"
                          >
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{payer.phone}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${catInfo.color}`}>
                          <CatIcon className="w-3 h-3" />
                          <span>{catInfo.label}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {payer.area ? (
                          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{payer.area}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onUpdatePayer(payer.id, { 
                            status: payer.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' 
                          })}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer transition ${
                            payer.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                              : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                          }`}
                        >
                          {payer.status === 'ACTIVE' ? '● សកម្ម (Active)' : '○ ផ្អាក (Inactive)'}
                        </button>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(payer)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition"
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
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                            title="លុប"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                    <tr>
                      <th className="py-2 px-3">Column</th>
                      <th className="py-2 px-3">Header Name</th>
                      <th className="py-2 px-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
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
