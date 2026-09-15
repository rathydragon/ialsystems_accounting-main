import React, { useState, useMemo } from 'react';
import { 
  Database, 
  Search, 
  RefreshCw, 
  ExternalLink, 
  Download, 
  FileSpreadsheet, 
  Layers, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  DollarSign, 
  Banknote, 
  ArrowUpDown,
  Sparkles,
  Sheet,
  Eye,
  Info,
  ChevronDown, 
  ChevronUp, 
  ChevronLeft,
  ChevronRight,
  Share2
} from 'lucide-react';
import { CollectionBatch, CollectionItem, Payer, AuthUser, AppSettings, DatabaseRecord } from '../types';

interface DataManagementPageProps {
  currentUser: AuthUser | null;
  settings: AppSettings;
  batches: CollectionBatch[];
  payers: Payer[];
  records: DatabaseRecord[];
  onRefreshFromGoogleSheets: () => Promise<boolean>;
  onSyncToGoogleSheets: () => Promise<boolean>;
  onUpdateGoogleSheetColumns?: () => Promise<boolean>;
  onUpdateSettings?: (newSettings: Partial<AppSettings>) => void;
}

type ActiveSheetTab = 'DATA_SHEET' | 'BATCHES' | 'ITEMS' | 'PAYERS' | 'EMBEDDED';

export const DataManagementPage: React.FC<DataManagementPageProps> = ({
  currentUser,
  settings,
  batches,
  payers,
  records = [],
  onRefreshFromGoogleSheets,
  onSyncToGoogleSheets,
  onUpdateGoogleSheetColumns
}) => {
  const [activeTab, setActiveTab] = useState<ActiveSheetTab>('DATA_SHEET');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUpdatingColumns, setIsUpdatingColumns] = useState(false);
  const [sortOrder, setSortOrder] = useState<'ORIGINAL' | 'DESC' | 'ASC'>('ORIGINAL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [showShareGuide, setShowShareGuide] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const isConnected = !!settings.webAppUrl?.trim() || !!settings.spreadsheetId?.trim();
  const spreadsheetUrl = settings.spreadsheetId?.trim() 
    ? `https://docs.google.com/spreadsheets/d/${settings.spreadsheetId.trim()}/edit`
    : '';

  // Extract all collection items flattened from batches
  const allItems: (CollectionItem & { batchNumber: string; operator: string })[] = useMemo(() => {
    const list: (CollectionItem & { batchNumber: string; operator: string })[] = [];
    batches.forEach(b => {
      if (Array.isArray(b.items)) {
        b.items.forEach(item => {
          list.push({
            ...item,
            batchNumber: b.batchNumber,
            operator: b.operator || 'Unknown'
          });
        });
      }
    });
    return list;
  }, [batches]);

  // Handle live refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const ok = await onRefreshFromGoogleSheets();
      if (!ok) {
        setShowShareGuide(true);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle manual sync
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await onSyncToGoogleSheets();
    } finally {
      setIsSyncing(false);
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

  // Date Filtering Helper
  const isWithinDateFilter = (dateStr?: string) => {
    if (dateFilter === 'ALL' || !dateStr) return true;
    const itemDate = new Date(dateStr);
    if (isNaN(itemDate.getTime())) return true;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (dateFilter === 'TODAY') {
      const itemDay = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
      return itemDay.getTime() === today.getTime();
    }

    if (dateFilter === 'THIS_WEEK') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      return itemDate >= startOfWeek;
    }

    if (dateFilter === 'THIS_MONTH') {
      return itemDate.getFullYear() === now.getFullYear() && itemDate.getMonth() === now.getMonth();
    }

    return true;
  };

  // Filtered Google Sheet Database Records (Tab "Data")
  const filteredRecords = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    const base = records
      .filter(r => {
        const matchesPayment = paymentFilter === 'ALL' || r.payment.toLowerCase() === paymentFilter.toLowerCase();
        const matchesSearch = !q ||
          r.barcode.toLowerCase().includes(q) ||
          r.payment.toLowerCase().includes(q) ||
          (r.date && r.date.toLowerCase().includes(q));
        const matchesDate = isWithinDateFilter(r.date);
        return matchesPayment && matchesSearch && matchesDate;
      });

    if (sortOrder === 'ORIGINAL') {
      return base;
    }
    return [...base].sort((a, b) => {
      if (sortOrder === 'DESC') {
        return (b.usd - a.usd) || (b.khm - a.khm);
      } else {
        return (a.usd - b.usd) || (a.khm - b.khm);
      }
    });
  }, [records, searchTerm, paymentFilter, dateFilter, sortOrder]);

  // Pagination for Data Sheet
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  // Filtered Batches
  const filteredBatches = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return batches
      .filter(b => {
        const matchesSearch = !q ||
          b.batchNumber.toLowerCase().includes(q) ||
          (b.operator && b.operator.toLowerCase().includes(q)) ||
          (b.notes && b.notes.toLowerCase().includes(q)) ||
          (b.date && b.date.includes(q));
        const matchesDate = isWithinDateFilter(b.date || b.createdAt);
        return matchesSearch && matchesDate;
      })
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.date).getTime() || 0;
        const timeB = new Date(b.createdAt || b.date).getTime() || 0;
        return sortOrder === 'DESC' ? timeB - timeA : timeA - timeB;
      });
  }, [batches, searchTerm, dateFilter, sortOrder]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return allItems
      .filter(item => {
        const matchesSearch = !q ||
          item.tracking.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.batchNumber.toLowerCase().includes(q) ||
          item.paymentMethod.toLowerCase().includes(q) ||
          item.operator.toLowerCase().includes(q);
        const matchesDate = isWithinDateFilter(item.date || item.createdAt);
        return matchesSearch && matchesDate;
      })
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || a.date).getTime() || 0;
        const timeB = new Date(b.createdAt || b.date).getTime() || 0;
        return sortOrder === 'DESC' ? timeB - timeA : timeA - timeB;
      });
  }, [allItems, searchTerm, dateFilter, sortOrder]);

  // Filtered Payers
  const filteredPayers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return payers
      .filter(p => {
        const matchesSearch = !q ||
          p.name.toLowerCase().includes(q) ||
          (p.phone && p.phone.includes(q)) ||
          (p.area && p.area.toLowerCase().includes(q)) ||
          (p.notes && p.notes.toLowerCase().includes(q));
        return matchesSearch;
      })
      .sort((a, b) => {
        const timeA = new Date(a.createdAt || '').getTime() || 0;
        const timeB = new Date(b.createdAt || '').getTime() || 0;
        return sortOrder === 'DESC' ? timeB - timeA : timeA - timeB;
      });
  }, [payers, searchTerm, sortOrder]);

  // Stats Calculations for Data Sheet
  const stats = useMemo(() => {
    let totalUSD = 0;
    let totalKHR = 0;

    if (activeTab === 'DATA_SHEET') {
      filteredRecords.forEach(r => {
        totalUSD += Number(r.usd) || 0;
        totalKHR += Number(r.khm) || 0;
      });
      return {
        totalUSD,
        totalKHR,
        totalCount: filteredRecords.length,
        labelCount: 'ជួរទិន្នន័យ (Rows)'
      };
    } else if (activeTab === 'BATCHES') {
      filteredBatches.forEach(b => {
        totalUSD += Number(b.totalUSD) || 0;
        totalKHR += Number(b.totalKHR) || 0;
      });
      return {
        totalUSD,
        totalKHR,
        totalCount: filteredBatches.length,
        labelCount: 'កញ្ចប់សរុប (Batches)'
      };
    } else {
      records.forEach(r => {
        totalUSD += Number(r.usd) || 0;
        totalKHR += Number(r.khm) || 0;
      });
      return {
        totalUSD,
        totalKHR,
        totalCount: records.length,
        labelCount: 'ជួរទិន្នន័យ (Rows)'
      };
    }
  }, [activeTab, filteredRecords, filteredBatches, records]);

  // Export to CSV
  const handleExportCSV = () => {
    let csvContent = '';
    let filename = '';

    if (activeTab === 'DATA_SHEET') {
      csvContent = 'BARCODE,PAYMENT,USD,KHM,DATE\n' +
        filteredRecords.map(r => 
          `"${r.barcode}","${r.payment}",${r.usd || 0},${r.khm || 0},"${r.date || ''}"`
        ).join('\n');
      filename = `GoogleSheets_Data_${new Date().toISOString().slice(0, 10)}.csv`;
    } else if (activeTab === 'BATCHES') {
      csvContent = 'Batch_ID,Date,Operator,Total_Items,Total_USD,Total_KHR,Notes,Created_At\n' +
        filteredBatches.map(b => 
          `"${b.batchNumber}","${b.date}","${b.operator || ''}",${b.totalItems || 0},${b.totalUSD || 0},${b.totalKHR || 0},"${(b.notes || '').replace(/"/g, '""')}","${b.createdAt || ''}"`
        ).join('\n');
      filename = `GoogleSheets_Batches_${new Date().toISOString().slice(0, 10)}.csv`;
    } else if (activeTab === 'ITEMS') {
      csvContent = 'Batch_ID,Tracking,Customer_Name,Date,Payment_Method,Operator,Created_At\n' +
        filteredItems.map(item => 
          `"${item.batchNumber}","${item.tracking}","${item.name}","${item.date}","${item.paymentMethod}","${item.operator}","${item.createdAt || ''}"`
        ).join('\n');
      filename = `GoogleSheets_Items_${new Date().toISOString().slice(0, 10)}.csv`;
    } else if (activeTab === 'PAYERS') {
      csvContent = 'ID,Name,Phone,Category,Area,Status,Notes,Total_USD,Total_KHR,Created_At\n' +
        filteredPayers.map(p => 
          `"${p.id}","${p.name}","${p.phone || ''}","${p.category}","${p.area || ''}","${p.status}","${(p.notes || '').replace(/"/g, '""')}",${p.totalUSD || 0},${p.totalKHR || 0},"${p.createdAt || ''}"`
        ).join('\n');
      filename = `GoogleSheets_Payers_${new Date().toISOString().slice(0, 10)}.csv`;
    }

    if (!csvContent) return;

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* 1. Header & Live Connection Hero */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 shadow-xs border border-slate-200/80 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  ទិន្នន័យ (Data)
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Google Sheets ផ្ទាល់
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                ការគ្រប់គ្រង និងត្រួតពិនិត្យទិន្នន័យដែលបានភ្ជាប់ដោយផ្ទាល់ជាមួយ Google Sheets
              </p>
            </div>
          </div>
        </div>

        {/* Live Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Refresh from Google Sheets */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            title="ទាញយកទិន្នន័យផ្ទាល់ពី Google Sheets ឥឡូវនេះ"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'កំពុងទាញយក...' : 'ទាញយកផ្ទាល់ (Refresh)'}</span>
          </button>

          {/* Sync Local Data to Google Sheets */}
          <button
            type="button"
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            title="បញ្ជូនទិន្នន័យទៅកាន់ Google Sheets"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'កំពុង Sync...' : 'សមកាលកម្ម (Sync)'}</span>
          </button>

          {/* Update Columns to match UI */}
          {onUpdateGoogleSheetColumns && (
            <button
              id="btn-update-google-columns-data"
              type="button"
              onClick={handleUpdateColumns}
              disabled={isUpdatingColumns}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
              title="កែសម្រួលក្បាលតារាង (Headers / Columns) ក្នុង Google Sheets ឱ្យត្រូវគ្នាជាមួយ UI ភ្លាមៗ"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isUpdatingColumns ? 'animate-spin' : ''}`} />
              <span>{isUpdatingColumns ? 'កំពុង Update...' : '⚡ Update Columns'}</span>
            </button>
          )}

          {/* Open Directly in Google Sheets */}
          {spreadsheetUrl && (
            <a
              href={spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-[#0f9d58] hover:bg-[#0b8043] text-white shadow-sm transition active:scale-95 cursor-pointer"
              title="បើកមើលក្នុង Google Sheets"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>បើក Google Sheets</span>
              <ExternalLink className="w-3 h-3 opacity-80" />
            </a>
          )}

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 border border-slate-300/80 dark:border-slate-700 transition active:scale-95 cursor-pointer"
            title="ទាញយកជាឯកសារ CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Share Permission Guide Alert (Shown if Google Sheets is Restricted or on demand) */}
      {showShareGuide && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 sm:p-5 text-xs text-amber-900 dark:text-amber-200 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-300">
              <Share2 className="w-4 h-4 text-amber-600" />
              <span>របៀបបើកសិទ្ធិទាញទិន្នន័យពី Google Sheets របស់អ្នក៖</span>
            </div>
            <button
              onClick={() => setShowShareGuide(false)}
              className="text-amber-600 hover:text-amber-800 dark:text-amber-400 text-xs font-bold cursor-pointer"
            >
              ✕ បិទ
            </button>
          </div>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-700 dark:text-slate-300 ml-1">
            <li>បើកតារាង Google Sheets របស់អ្នក (ចុចប៊ូតុង <b>«បើក Google Sheets»</b> ខាងលើ)</li>
            <li>ចុចប៊ូតុងពណ៌ខៀវ <b>«Share (ចែករំលែក)»</b> នៅជ្រុងខាងស្តាំខាងលើ</li>
            <li>នៅក្រោម <b>General access (ការចូលប្រើទូទៅ)</b> ប្តូរពី <b>«Restricted (មានកំណត់)»</b> ទៅជា <b>«Anyone with the link (អ្នកដែលមានតំណភ្ជាប់អាចមើលបាន)»</b></li>
            <li>ត្រឡប់មកកាន់កម្មវិធីនេះ រួចចុចប៊ូតុង <b>«ទាញយកផ្ទាល់ (Refresh)»</b> នោះទិន្នន័យនឹងរត់ចូលមកភ្លាមៗ!</li>
          </ol>
        </div>
      )}

      {/* 2. Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total USD */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">សរុបជា USD</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
            ${stats.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">ពីតារាង Google Sheets "Data"</div>
        </div>

        {/* Total KHR */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">សរុបជា KHR</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 tracking-tight">
            {stats.totalKHR.toLocaleString('en-US')} ៛
          </div>
          <div className="text-[11px] text-slate-400 mt-1">ពីតារាង Google Sheets "Data"</div>
        </div>

        {/* Total Records Count */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">ចំនួនទិន្នន័យសរុប</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
              <Sheet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {stats.totalCount} <span className="text-xs font-normal text-slate-400">ជួរ</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">ក្នុងសន្លឹកកិច្ចការ "Data"</div>
        </div>

        {/* Connection Status */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">ស្ថានភាពភ្ជាប់</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 tracking-tight flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Google Sheets Sync</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Spreadsheet ID ភ្ជាប់រួចរាល់</div>
        </div>
      </div>

      {/* 3. Sheet Selector Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-2">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          
          {/* TAB 1: DATA SHEET (Matches User's Google Sheet Tab 'Data') */}
          <button
            type="button"
            onClick={() => setActiveTab('DATA_SHEET')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === 'DATA_SHEET'
                ? 'bg-[#0f9d58] text-white shadow-sm shadow-emerald-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Sheet className="w-4 h-4" />
            <span>ទិន្នន័យ (Data Sheet)</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === 'DATA_SHEET' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}>
              {filteredRecords.length}
            </span>
          </button>

          {/* TAB 2: BATCHES */}
          <button
            type="button"
            onClick={() => setActiveTab('BATCHES')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === 'BATCHES'
                ? 'bg-[#0f9d58] text-white shadow-sm shadow-emerald-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>កញ្ចប់ទទួលប្រាក់ (Batches)</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === 'BATCHES' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}>
              {filteredBatches.length}
            </span>
          </button>

          {/* TAB 3: ITEMS */}
          <button
            type="button"
            onClick={() => setActiveTab('ITEMS')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === 'ITEMS'
                ? 'bg-[#0f9d58] text-white shadow-sm shadow-emerald-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Sheet className="w-4 h-4" />
            <span>មុខទំនិញលម្អិត (Items)</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === 'ITEMS' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}>
              {filteredItems.length}
            </span>
          </button>

          {/* TAB 4: PAYERS */}
          <button
            type="button"
            onClick={() => setActiveTab('PAYERS')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === 'PAYERS'
                ? 'bg-[#0f9d58] text-white shadow-sm shadow-emerald-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>បញ្ជីអ្នកប្រគល់ប្រាក់ (Payers)</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              activeTab === 'PAYERS' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}>
              {filteredPayers.length}
            </span>
          </button>

          {/* TAB 5: EMBEDDED LIVE VIEW */}
          <button
            type="button"
            onClick={() => setActiveTab('EMBEDDED')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === 'EMBEDDED'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>មើល Google Sheets ផ្ទាល់ (Live View)</span>
          </button>
        </div>

        {/* Sort order toggle */}
        {activeTab !== 'EMBEDDED' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSortOrder(prev => {
                  if (prev === 'ORIGINAL') return 'DESC';
                  if (prev === 'DESC') return 'ASC';
                  return 'ORIGINAL';
                });
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer border border-slate-200 dark:border-slate-750"
              title="ប្តូរលំដាប់លំដោយទិន្នន័យ"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                {sortOrder === 'ORIGINAL'
                  ? 'លំដាប់ Sheets ដើម'
                  : sortOrder === 'DESC'
                    ? 'ទឹកប្រាក់ច្រើនមុន'
                    : 'ទឹកប្រាក់តិចមុន'}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* 4. Search & Filters Bar (Hidden on Embedded Tab) */}
      {activeTab !== 'EMBEDDED' && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800">
          {/* Global Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                activeTab === 'DATA_SHEET'
                  ? 'ស្វែងរកលេខ Barcode, វិធីសាស្ត្រទូទាត់, កាលបរិច្ឆេទ...'
                  : activeTab === 'BATCHES' 
                    ? 'ស្វែងរកលេខកញ្ចប់, អ្នកកត់ត្រា, ចំណាំ...' 
                    : activeTab === 'ITEMS'
                      ? 'ស្វែងរក Tracking, ឈ្មោះអតិថិជន...'
                      : 'ស្វែងរកឈ្មោះ, លេខទូរស័ព្ទ...'
              }
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 dark:text-white"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Date & Payment Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {activeTab === 'DATA_SHEET' && (
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="ALL">គ្រប់ PAYMENT</option>
                <option value="CASH">CASH</option>
                <option value="BANK">BANK / ABA</option>
              </select>
            )}

            {(['ALL', 'TODAY', 'THIS_WEEK', 'THIS_MONTH'] as const).map((filterKey) => {
              const labelMap = {
                ALL: 'ទាំងអស់',
                TODAY: 'ថ្ងៃនេះ',
                THIS_WEEK: 'សប្តាហ៍នេះ',
                THIS_MONTH: 'ខែនេះ'
              };
              return (
                <button
                  key={filterKey}
                  type="button"
                  onClick={() => setDateFilter(filterKey)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap cursor-pointer ${
                    dateFilter === filterKey
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {labelMap[filterKey]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Active Tab Content Tables */}
      
      {/* TAB 1: DATA SHEET (Matches User's Google Sheet Tab 'Data') */}
      {activeTab === 'DATA_SHEET' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-850/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                  <th className="py-3.5 px-4 w-14 text-center">#</th>
                  <th className="py-3.5 px-4 font-mono">BARCODE (លេខកូដ)</th>
                  <th className="py-3.5 px-4">PAYMENT (ការទូទាត់)</th>
                  <th className="py-3.5 px-4 text-right">USD ($)</th>
                  <th className="py-3.5 px-4 text-right">KHM (៛)</th>
                  <th className="py-3.5 px-4">DATE (កាលបរិច្ឆេទ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <Sheet className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-semibold text-sm">មិនមានទិន្នន័យក្នុងតារាង Data ទេ</p>
                      <p className="text-xs text-slate-400 mt-1">
                        សូមចុច "ទាញយកផ្ទាល់ (Refresh)" ដើម្បីទាញយកទិន្នន័យពី Google Sheets
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedRecords.map((row, idx) => {
                    const rowNum = (currentPage - 1) * pageSize + idx + 1;
                    return (
                      <tr key={row.id || idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-850/50 transition">
                        <td className="py-3 px-4 text-center text-slate-400 font-mono text-[11px]">
                          {rowNum}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>{row.barcode}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {row.payment || 'CASH'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {row.usd > 0 ? `$${Number(row.usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                          {row.khm > 0 ? `${Number(row.khm).toLocaleString('en-US')} ៛` : '—'}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                          {row.date || '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Toolbar */}
          {filteredRecords.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 text-xs">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <span>បង្ហាញ</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredRecords.length)}
                </span>
                <span>នៃ</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">{filteredRecords.length.toLocaleString()} ជួរ</span>
                
                <span className="mx-1 text-slate-300 dark:text-slate-700">|</span>
                
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                >
                  <option value={50}>50 ជួរ/ទំព័រ</option>
                  <option value={100}>100 ជួរ/ទំព័រ</option>
                  <option value={250}>250 ជួរ/ទំព័រ</option>
                  <option value={500}>500 ជួរ/ទំព័រ</option>
                  <option value={1000}>1000 ជួរ/ទំព័រ</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer font-medium"
                  title="ទំព័រដំបូង"
                >
                  «
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer font-medium"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>មុន</span>
                </button>
                
                <span className="px-3 py-1 font-bold text-slate-700 dark:text-slate-200">
                  {currentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer font-medium"
                >
                  <span>បន្ទាប់</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer font-medium"
                  title="ទំព័រចុងក្រោយ"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BATCHES */}
      {activeTab === 'BATCHES' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-850/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                  <th className="py-3.5 px-4">លេខកញ្ចប់ (Batch ID)</th>
                  <th className="py-3.5 px-4">កាលបរិច្ឆេទ</th>
                  <th className="py-3.5 px-4">អ្នកកត់ត្រា</th>
                  <th className="py-3.5 px-4 text-center">ចំនួនទំនិញ</th>
                  <th className="py-3.5 px-4 text-right">ទឹកប្រាក់ USD</th>
                  <th className="py-3.5 px-4 text-right">ទឹកប្រាក់ KHR</th>
                  <th className="py-3.5 px-4">ចំណាំ</th>
                  <th className="py-3.5 px-4 text-center">Sheets Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-semibold text-sm">មិនមានទិន្នន័យកញ្ចប់ទទួលប្រាក់ទេ</p>
                    </td>
                  </tr>
                ) : (
                  filteredBatches.map((b) => (
                    <tr key={b.id || b.batchNumber} className="hover:bg-slate-50/70 dark:hover:bg-slate-850/50 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>{b.batchNumber}</span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {b.date || (b.createdAt ? b.createdAt.slice(0, 10) : '—')}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-medium">
                        {b.operator || 'Unknown'}
                      </td>
                      <td className="py-3.5 px-4 text-center font-semibold text-slate-800 dark:text-slate-200">
                        {b.totalItems || (Array.isArray(b.items) ? b.items.length : 0)} ជួរ
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ${Number(b.totalUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                        {Number(b.totalKHR || 0).toLocaleString('en-US')} ៛
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {b.notes || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          Synced
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ITEMS */}
      {activeTab === 'ITEMS' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-850/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                  <th className="py-3.5 px-4">កញ្ចប់លេខ (Batch)</th>
                  <th className="py-3.5 px-4">លេខ Tracking</th>
                  <th className="py-3.5 px-4">ឈ្មោះអតិថិជន / មុខទំនិញ</th>
                  <th className="py-3.5 px-4">កាលបរិច្ឆេទ</th>
                  <th className="py-3.5 px-4">វិធីសាស្ត្រទូទាត់</th>
                  <th className="py-3.5 px-4">អ្នកកត់ត្រា</th>
                  <th className="py-3.5 px-4 text-center">ស្ថានភាព</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <Sheet className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-semibold text-sm">មិនមានទិន្នន័យមុខទំនិញលម្អិតទេ</p>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-850/50 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {item.batchNumber}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {item.tracking}
                      </td>
                      <td className="py-3.5 px-4 text-slate-900 dark:text-white font-medium">
                        {item.name}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {item.date || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {item.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                        {item.operator}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          Recorded
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PAYERS */}
      {activeTab === 'PAYERS' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-850/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                  <th className="py-3.5 px-4">អត្តសញ្ញាណ (ID)</th>
                  <th className="py-3.5 px-4">ឈ្មោះអ្នកប្រគល់ប្រាក់</th>
                  <th className="py-3.5 px-4">លេខទូរស័ព្ទ</th>
                  <th className="py-3.5 px-4">ប្រភេទ</th>
                  <th className="py-3.5 px-4">តំបន់ / អាសយដ្ឋាន</th>
                  <th className="py-3.5 px-4 text-center">ស្ថានភាព</th>
                  <th className="py-3.5 px-4">ចំណាំ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredPayers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-semibold text-sm">មិនមានទិន្នន័យអ្នកប្រគល់ប្រាក់ទេ</p>
                    </td>
                  </tr>
                ) : (
                  filteredPayers.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-850/50 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {p.id}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                        {p.name}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {p.phone || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {p.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                        {p.area || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${p.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {p.notes || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: EMBEDDED GOOGLE SPREADSHEET LIVE PREVIEW */}
      {activeTab === 'EMBEDDED' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-850 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Google Sheets Spreadsheet Live Preview</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                បង្ហាញតារាង Google Sheets ដោយផ្ទាល់។ លោកអ្នកក៏អាចបើក Tab ថ្មីដើម្បីកែសម្រួលផ្ទាល់ផងដែរ។
              </p>
            </div>
            {spreadsheetUrl && (
              <a
                href={spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold bg-[#0f9d58] hover:bg-[#0b8043] text-white rounded-xl shadow-sm transition cursor-pointer"
              >
                <span>បើកក្នុងផ្ទាំងថ្មី (Open in New Tab)</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {settings.spreadsheetId ? (
            <div className="w-full h-[650px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white relative">
              <iframe
                src={`https://docs.google.com/spreadsheets/d/${settings.spreadsheetId}/edit?usp=sharing&widget=true&headers=false`}
                className="w-full h-full border-0"
                title="Google Sheets Preview"
                allow="clipboard-read; clipboard-write"
              />
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
              <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                មិនទាន់មាន Spreadsheet ID ទេ
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
