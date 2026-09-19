import React, { useState, useMemo, useEffect } from 'react';
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
  Share2,
  Maximize2,
  Minimize2,
  Columns3,
  Table2,
  Copy,
  Check
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

type ActiveSheetTab = 'DATA_SHEET' | 'BATCHES';

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
  const [activeTab, setActiveTab] = useState<ActiveSheetTab>(() => {
    const saved = localStorage.getItem('accounting_data_active_tab');
    if (saved === 'DATA_SHEET' || saved === 'BATCHES') return saved as ActiveSheetTab;
    return 'DATA_SHEET';
  });

  useEffect(() => {
    localStorage.setItem('accounting_data_active_tab', activeTab);
  }, [activeTab]);
  const [scrollMode, setScrollMode] = useState<'CONTAINER' | 'FULL_PAGE'>('CONTAINER');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUpdatingColumns, setIsUpdatingColumns] = useState(false);
  const [sortOrder, setSortOrder] = useState<'ORIGINAL' | 'DESC' | 'ASC'>('ORIGINAL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<'default' | 'barcode' | 'name' | 'category' | 'stock' | 'usd' | 'total'>('default');
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('DESC');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showShareGuide, setShowShareGuide] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const handleCopyCode = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Copy full row's columns (Barcode, Payment, USD, KHM, Date) separated by Tab for Excel/Google Sheets
  const handleCopyRowColumns = (row: DatabaseRecord, id?: string) => {
    const columns = [
      row.barcode || '',
      row.payment || 'Cash & Collect',
      row.usd !== undefined && row.usd !== null ? row.usd : 0,
      row.khm !== undefined && row.khm !== null ? row.khm : 0,
      row.date || ''
    ];
    const textToCopy = columns.join('\t');
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id || row.id || row.barcode);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleColumnSort = (field: 'barcode' | 'name' | 'category' | 'stock' | 'usd' | 'total') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortField(field);
      setSortDirection('DESC');
    }
  };

  // Helper to format numbers with standard numerals (like '1,250 ជួរ')
  const toKhmerNumber = (num: number) => {
    return num.toLocaleString('en-US');
  };

  // Standard Accounting Formatter (Excel / Google Sheets style)
  // Pin currency symbol to the left, tabular numbers to the right, '-' for zero
  const formatAccountingUSD = (amount?: number) => {
    if (amount === undefined || amount === null || isNaN(amount) || amount === 0) {
      return { symbol: '$', text: '-', isZero: true, isNegative: false };
    }
    if (amount < 0) {
      const absStr = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return { symbol: '$', text: `(${absStr})`, isZero: false, isNegative: true };
    }
    const str = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return { symbol: '$', text: str, isZero: false, isNegative: false };
  };

  const formatAccountingKHR = (amount?: number) => {
    if (amount === undefined || amount === null || isNaN(amount) || amount === 0) {
      return { symbol: '៛', text: '-', isZero: true, isNegative: false };
    }
    if (amount < 0) {
      const absStr = Math.abs(amount).toLocaleString('en-US');
      return { symbol: '៛', text: `(${absStr})`, isZero: false, isNegative: true };
    }
    const str = Math.round(amount).toLocaleString('en-US');
    return { symbol: '៛', text: str, isZero: false, isNegative: false };
  };

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

  // Fast map from barcode/tracking to item details (e.g. Item Name / Customer Name)
  const itemMap = useMemo(() => {
    const map: Record<string, CollectionItem> = {};
    allItems.forEach(item => {
      if (item.tracking) {
        map[item.tracking.toLowerCase().trim()] = item;
      }
    });
    return map;
  }, [allItems]);

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
        
        // Status filter (PAID, PENDING, or Date filter)
        let matchesStatus = true;
        if (statusFilter === 'PAID') {
          matchesStatus = (r.usd > 0 || r.khm > 0);
        } else if (statusFilter === 'PENDING') {
          matchesStatus = (r.usd === 0 && r.khm === 0);
        } else if (statusFilter === 'TODAY' || statusFilter === 'THIS_WEEK' || statusFilter === 'THIS_MONTH') {
          matchesStatus = isWithinDateFilter(r.date);
        }

        const matched = itemMap[r.barcode.toLowerCase().trim()];
        const itemName = matched?.name || r.note || '';

        const matchesSearch = !q ||
          r.barcode.toLowerCase().includes(q) ||
          r.payment.toLowerCase().includes(q) ||
          itemName.toLowerCase().includes(q) ||
          (r.date && r.date.toLowerCase().includes(q));

        const matchesDate = isWithinDateFilter(r.date);
        return matchesPayment && matchesStatus && matchesSearch && matchesDate;
      });

    if (sortField !== 'default') {
      return [...base].sort((a, b) => {
        let diff = 0;
        if (sortField === 'barcode') {
          diff = a.barcode.localeCompare(b.barcode);
        } else if (sortField === 'name') {
          const nameA = itemMap[a.barcode.toLowerCase().trim()]?.name || a.note || '';
          const nameB = itemMap[b.barcode.toLowerCase().trim()]?.name || b.note || '';
          diff = nameA.localeCompare(nameB);
        } else if (sortField === 'category') {
          diff = (a.payment || '').localeCompare(b.payment || '');
        } else if (sortField === 'stock') {
          diff = 0;
        } else if (sortField === 'usd') {
          diff = a.usd - b.usd;
        } else if (sortField === 'total') {
          diff = (a.khm || a.usd) - (b.khm || b.usd);
        }
        return sortDirection === 'ASC' ? diff : -diff;
      });
    }

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
  }, [records, searchTerm, paymentFilter, statusFilter, dateFilter, sortOrder, sortField, sortDirection, itemMap]);

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

    let csvContent = '';
    let filename = '';

    if (activeTab === 'DATA_SHEET') {
      csvContent = 'BARCODE,PAYMENT,USD,KHM,DATE\n' +
        filteredRecords.map(r => 
          `"${r.barcode}","${r.payment}",${r.usd || 0},${r.khm || 0},"${r.date || ''}"`
        ).join('\n');
      filename = `GoogleSheets_Data_${new Date().toISOString().slice(0, 10)}.csv`;
    } else if (activeTab === 'BATCHES') {
      csvContent = 'Batch_ID,Date,Operator,Total_Items,Total_USD,Total_KHR,Bank_USD,Bank_KHR,Cash_USD,Cash_KHR,Reconciliation,Notes,Created_At\n' +
        filteredBatches.map(b => 
          `"${b.batchNumber}","${b.date}","${b.operator || ''}",${b.totalItems || 0},${b.totalUSD || 0},${b.totalKHR || 0},${b.bankUSD || 0},${b.bankKHR || 0},${b.cashUSD || 0},${b.cashKHR || 0},"${(b.reconciliation || '✓ គ្រប់ចំនួន (Balanced 100%)').replace(/"/g, '""')}","${(b.notes || '').replace(/"/g, '""')}","${formatDateTimeForCSV(b.createdAt)}"`
        ).join('\n');
      filename = `GoogleSheets_Batches_${new Date().toISOString().slice(0, 10)}.csv`;
    } else if (activeTab === 'ITEMS') {
      csvContent = 'Batch_ID,Tracking,Customer_Name,Date,Payment_Method,Operator,Created_At\n' +
        filteredItems.map(item => 
          `"${item.batchNumber}","${item.tracking}","${item.name}","${item.date}","${item.paymentMethod}","${item.operator}","${formatDateTimeForCSV(item.createdAt)}"`
        ).join('\n');
      filename = `GoogleSheets_Items_${new Date().toISOString().slice(0, 10)}.csv`;
    } else if (activeTab === 'PAYERS') {
      csvContent = 'ID,Name,Phone,Category,Area,Status,Notes,Total_USD,Total_KHR,Created_At\n' +
        filteredPayers.map(p => 
          `"${p.id}","${p.name}","${p.phone || ''}","${p.category}","${p.area || ''}","${p.status}","${(p.notes || '').replace(/"/g, '""')}",${p.totalUSD || 0},${p.totalKHR || 0},"${formatDateTimeForCSV(p.createdAt)}"`
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
    <div className="space-y-6 pb-28 lg:pb-10 animate-in fade-in duration-300">
      
      {/* 1. Sleek Compact Header & Live KPI Dashboard Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-2.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 sm:gap-3.5">
        
        {/* Left: Compact Title & Status */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
              <Database className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-sm sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  ទិន្នន័យ (Data)
                </h1>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 sm:px-2 sm:py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500 hidden sm:block">
                ទិន្នន័យផ្សាយផ្ទាល់ពីសន្លឹកកិច្ចការ Google Sheets "Data"
              </p>
            </div>
          </div>

          {/* Quick Mobile Action Icons */}
          <div className="flex sm:hidden items-center gap-1">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              title="ទាញយកផ្ទាល់ (Refresh)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            {spreadsheetUrl && (
              <a
                href={spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-xs font-bold bg-[#0f9d58] text-white shadow-2xs transition active:scale-95 cursor-pointer"
                title="Google Sheets"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Mobile Compact 3-col KPI Strip (Takes only ~35px) */}
        <div className="sm:hidden grid grid-cols-3 gap-1 p-1.5 bg-slate-50 dark:bg-slate-850/60 rounded-xl border border-slate-200/80 dark:border-slate-800 text-center">
          <div className="py-0.5">
            <div className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono leading-tight truncate">
              ${stats.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[9px] text-slate-400">USD</div>
          </div>
          <div className="py-0.5 border-l border-slate-200 dark:border-slate-700">
            <div className="text-xs font-black text-blue-600 dark:text-blue-400 font-mono leading-tight truncate">
              {stats.totalKHR.toLocaleString('en-US')} ៛
            </div>
            <div className="text-[9px] text-slate-400">KHR</div>
          </div>
          <div className="py-0.5 border-l border-slate-200 dark:border-slate-700">
            <div className="text-xs font-black text-slate-900 dark:text-white font-mono leading-tight truncate">
              {stats.totalCount.toLocaleString()}
            </div>
            <div className="text-[9px] text-slate-400">ជួរទិន្នន័យ</div>
          </div>
        </div>

        {/* Right: Desktop KPIs */}
        <div className="hidden sm:grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 items-center">
          
          {/* KPI 1: USD */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">សរុបជា USD</div>
              <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono truncate">
                ${stats.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* KPI 2: KHR */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40">
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Banknote className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">សរុបជា KHR</div>
              <div className="text-sm font-black text-blue-600 dark:text-blue-400 font-mono truncate">
                {stats.totalKHR.toLocaleString('en-US')} ៛
              </div>
            </div>
          </div>

          {/* KPI 3: Rows */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Sheet className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">ទិន្នន័យសរុប</div>
              <div className="text-sm font-black text-slate-900 dark:text-white font-mono truncate">
                {stats.totalCount.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">ជួរ</span>
              </div>
            </div>
          </div>

          {/* KPI 4: Quick Refresh & Google Sheets Action */}
          <div className="flex items-center gap-1.5 justify-end">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              title="ទាញយកទិន្នន័យផ្ទាល់ពី Google Sheets ឥឡូវនេះ"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'ទាញយក...' : 'Refresh'}</span>
            </button>

            {spreadsheetUrl && (
              <a
                href={spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-xl text-slate-600 hover:text-[#0f9d58] dark:text-slate-400 dark:hover:text-[#0f9d58] bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                title="បើកមើលក្នុង Google Sheets"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>

        </div>

      </div>

      {/* Viewer Mode Banner */}
      {currentUser?.role === 'VIEWER' && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span><strong>សិទ្ធិមើលប៉ុណ្ណោះ (Viewer - Read Only)៖</strong> អ្នកអាចស្វែងរក មើលទិន្នន័យ Google Sheets និងទាញយករបាយការណ៍ CSV បាន។ ការកែប្រែការកំណត់ និងសិទ្ធិត្រូវបានការពារ។</span>
        </div>
      )}

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

      {/* 3. Unified Master Data Table Container with Sticky Menubar, Tabs, Filters & Headers */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col transition-all overflow-hidden">
        
        {/* STICKY TOP UNIT: Menubar + Menu Tabs + Search & Filters */}
        <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-all shadow-xs">
          
          {/* Row 1: Menu Tabs (Left) & Actions Menubar (Right) */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 px-3 py-2.5 sm:px-5 sm:py-3 border-b border-slate-100 dark:border-slate-800/80">
            {/* Segmented Menu Tab Bar (iPadOS Pill Style) */}
            <div className="bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-700/60 inline-flex items-center gap-1 max-w-full overflow-x-auto scrollbar-none shadow-inner self-start xl:self-auto">
              
              {/* ITEM 1: តារាងទិន្នន័យ (Data Table) */}
              <button
                type="button"
                onClick={() => setActiveTab('DATA_SHEET')}
                className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'DATA_SHEET'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs border border-slate-200/80 dark:border-slate-700/80 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                }`}
              >
                <Table2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>តារាង</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-mono font-bold ${
                  activeTab === 'DATA_SHEET'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                  {toKhmerNumber(filteredRecords.length)}
                </span>
              </button>

              {/* ITEM 2: កញ្ចប់ទទួលប្រាក់ (Batches) */}
              <button
                type="button"
                onClick={() => setActiveTab('BATCHES')}
                className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'BATCHES'
                    ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs border border-slate-200/80 dark:border-slate-700/80 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                }`}
              >
                <Layers className="w-4 h-4 text-purple-600 shrink-0" />
                <span>កញ្ចប់</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-mono font-bold ${
                  activeTab === 'BATCHES'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                  {toKhmerNumber(filteredBatches.length)}
                </span>
              </button>

              {/* ITEM 3: សមកាលកម្ម (Sync & Auto) - Desktop only */}
              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg sm:rounded-xl text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/60 transition active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                title="ចុចដើម្បីសមកាលកម្មទិន្នន័យជាមួយ Google Sheets"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-500 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>សមកាលកម្ម</span>
              </button>

              {/* ITEM 4: រចនាសម្ព័ន្ធជួរឈរ (Update Columns) - Desktop only */}
              {onUpdateGoogleSheetColumns && (
                <button
                  id="btn-update-google-columns-menubar"
                  type="button"
                  onClick={handleUpdateColumns}
                  disabled={isUpdatingColumns}
                  className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg sm:rounded-xl text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/60 transition active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  title="ចុចដើម្បីកែសម្រួលរចនាសម្ព័ន្ធជួរឈរក្នុង Google Sheets"
                >
                  <Columns3 className={`w-3.5 h-3.5 text-slate-500 shrink-0 ${isUpdatingColumns ? 'animate-spin' : ''}`} />
                  <span>ជួរឈរ</span>
                </button>
              )}
            </div>

            {/* Menubar Action Buttons (Unified iPad / Tablet Action Toolbar) */}
            <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto scrollbar-none py-0.5 max-w-full">
              {/* 1. Refresh Button */}
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 h-8 sm:h-9 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 transition active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap shadow-2xs shrink-0"
                title="ទាញយកទិន្នន័យផ្ទាល់ពី Google Sheets"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'ទាញ...' : 'ផ្ទុកឡើងវិញ'}</span>
              </button>

              {/* 2. Google Sheets Button */}
              {spreadsheetUrl && (
                <a
                  href={spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 h-8 sm:h-9 rounded-xl text-xs font-bold bg-[#0f9d58] hover:bg-[#0b8043] text-white shadow-2xs transition active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
                  title="បើកមើលក្នុង Google Sheets"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Sheets</span>
                </a>
              )}

              {/* 3. CSV Export Button */}
              <button
                type="button"
                onClick={handleExportCSV}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 h-8 sm:h-9 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition active:scale-95 cursor-pointer whitespace-nowrap shadow-2xs shrink-0"
                title="ទាញយកជាឯកសារ CSV"
              >
                <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>CSV</span>
              </button>

              {/* 4. Sort Order Button */}
              <button
                type="button"
                onClick={() => {
                  setSortOrder(prev => {
                    if (prev === 'ORIGINAL') return 'DESC';
                    if (prev === 'DESC') return 'ASC';
                    return 'ORIGINAL';
                  });
                }}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 h-8 sm:h-9 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition active:scale-95 cursor-pointer whitespace-nowrap shadow-2xs shrink-0"
                title="ប្តូរលំដាប់លំដោយទិន្នន័យ"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {sortOrder === 'ORIGINAL'
                    ? 'លំដាប់ដើម'
                    : sortOrder === 'DESC'
                      ? 'ច្រើនមុន'
                      : 'តិចមុន'}
                </span>
              </button>

              {/* 5. Scroll Mode Toggle Button */}
              <button
                type="button"
                onClick={() => setScrollMode(prev => prev === 'CONTAINER' ? 'FULL_PAGE' : 'CONTAINER')}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 h-8 sm:h-9 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer whitespace-nowrap shadow-2xs border shrink-0 ${
                  scrollMode === 'CONTAINER'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
                title={scrollMode === 'CONTAINER' ? 'កំពុង Scroll ក្នុងប្រអប់ជាប់ក្បាល (ចុចដើម្បី Scroll ពេញទំព័រ)' : 'កំពុង Scroll ពេញទំព័រ (ចុចដើម្បី Scroll ក្នុងប្រអប់ជាប់ក្បាល)'}
              >
                {scrollMode === 'CONTAINER' ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>ជាប់ក្បាល</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                    <span>ពេញទំព័រ</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Row 2: Search & Filter Toolbar */}
          <div className="px-3 py-2 sm:px-5 sm:py-2.5 bg-slate-50/75 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 sm:gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ស្វែងរកតាមឈ្មោះ, លេខកូដ..."
                className="w-full pl-8 pr-7 py-2 h-9 text-xs rounded-xl bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 dark:text-white placeholder:text-slate-400 shadow-2xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer p-1"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-2 sm:flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Dropdown 1: គ្រប់ប្រភេទទាំងអស់ (All) */}
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-1.5 h-9 text-[11px] sm:text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold focus:outline-none shadow-2xs cursor-pointer truncate"
              >
                <option value="ALL">គ្រប់ប្រភេទ (All)</option>
                <option value="CASH">CASH</option>
                <option value="BANK">BANK / ABA</option>
              </select>

              {/* Dropdown 2: ស្ថានភាពទាំងអស់ (Status) */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-1.5 h-9 text-[11px] sm:text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold focus:outline-none shadow-2xs cursor-pointer truncate"
              >
                <option value="ALL">គ្រប់ស្ថានភាព (All)</option>
                <option value="PAID">បានទូទាត់រួច</option>
                <option value="PENDING">មិនទាន់ទូទាត់</option>
                <option value="TODAY">ថ្ងៃនេះ</option>
              </select>
            </div>
          </div>

          {/* Sub-header Information Strip (Compact) */}
          {activeTab === 'DATA_SHEET' && (
            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/50 px-3 sm:px-5 py-1.5 flex items-center justify-between text-[11px] text-emerald-800 dark:text-emerald-300">
              <div className="flex items-center gap-1.5 truncate">
                <FileSpreadsheet className="w-3 h-3 text-emerald-600 shrink-0" />
                <span className="truncate">
                  Sheet: <strong className="font-bold text-slate-800 dark:text-slate-100">Data</strong>
                </span>
              </div>
              <div className="font-semibold font-mono text-[11px] text-slate-600 dark:text-slate-300">
                {paginatedRecords.length} / {filteredRecords.length.toLocaleString()} ជួរ
              </div>
            </div>
          )}
        </div>

        {/* 4. Active Tab Content Tables with Sticky Table Headers (<thead>) */}
        
        {/* TAB 1: DATA SHEET (Matches User's Google Sheet Tab 'Data') */}
        {activeTab === 'DATA_SHEET' && (
          <>
            <div className={`overflow-x-auto ${scrollMode === 'CONTAINER' ? 'overflow-y-auto max-h-[calc(100vh-380px)] lg:max-h-[calc(100vh-320px)] min-h-[220px] sm:min-h-[300px] lg:min-h-[420px]' : ''} relative custom-scrollbar`}>
              {/* 1. Desktop Table (hidden on mobile, visible on lg:table) */}
              <table className="hidden lg:table w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-850/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 shadow-xs">
                  <tr className="text-slate-600 dark:text-slate-400 font-bold text-xs">
                    <th className="sticky top-0 bg-slate-50/95 dark:bg-slate-850/95 py-3.5 px-4 w-14 text-center">#</th>
                    
                    <th 
                      onClick={() => handleColumnSort('barcode')}
                      className="sticky top-0 bg-slate-50/95 dark:bg-slate-850/95 py-3.5 px-4 font-mono cursor-pointer hover:text-slate-900 dark:hover:text-white transition whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>BARCODE (លេខកូដ)</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>

                    <th 
                      onClick={() => handleColumnSort('category')}
                      className="sticky top-0 bg-slate-50/95 dark:bg-slate-850/95 py-3.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>PAYMENT (ការទូទាត់)</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>

                    <th 
                      onClick={() => handleColumnSort('usd')}
                      className="sticky top-0 bg-slate-50/95 dark:bg-slate-850/95 py-3.5 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition whitespace-nowrap"
                    >
                      <div className="inline-flex items-center justify-end gap-1.5 w-28">
                        <span>USD ($)</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>

                    <th 
                      onClick={() => handleColumnSort('total')}
                      className="sticky top-0 bg-slate-50/95 dark:bg-slate-850/95 py-3.5 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition whitespace-nowrap"
                    >
                      <div className="inline-flex items-center justify-end gap-1.5 w-28">
                        <span>KHM (៛)</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>

                    <th 
                      onClick={() => handleColumnSort('name')}
                      className="sticky top-0 bg-slate-50/95 dark:bg-slate-850/95 py-3.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-white transition whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>DATE (កាលបរិច្ឆេទ)</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <Sheet className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="font-semibold text-sm">មិនមានទិន្នន័យក្នុងតារាងទេ</p>
                        <p className="text-xs text-slate-400 mt-1">
                          សូមចុច "ទាញយកផ្ទាល់ (Refresh)" ដើម្បីទាញយកទិន្នន័យពី Google Sheets
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedRecords.map((row, idx) => {
                      const rowNum = (currentPage - 1) * pageSize + idx + 1;
                      const rowKey = `row-${row.id || row.barcode || idx}`;
                      const isRowCopied = copiedId === rowKey;
                      const isBarcodeCopied = copiedId === `barcode-${row.id || row.barcode || idx}`;

                      return (
                        <tr key={row.id || idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-850/50 transition">
                          {/* 1. # */}
                          <td className="py-3 px-4 text-center text-slate-400 font-mono text-[11px]">
                            {rowNum}
                          </td>

                          {/* 2. BARCODE (លេខកូដ) */}
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <button
                                type="button"
                                onClick={() => handleCopyCode(row.barcode, `barcode-${row.id || row.barcode || idx}`)}
                                title="ចុចដើម្បី Copy លេខកូដ Barcode តែមួយគត់"
                                className="hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer flex items-center gap-1"
                              >
                                <span>{row.barcode}</span>
                                {isBarcodeCopied && <Check className="w-3 h-3 text-emerald-600 inline" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyCode(row.barcode, `barcode-${row.id || row.barcode || idx}`)}
                                title="ចម្លងតែលេខ Barcode មួយគត់"
                                className="opacity-70 hover:opacity-100 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ml-1"
                              >
                                {isBarcodeCopied ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyRowColumns(row, rowKey)}
                                title="ចម្លងទិន្នន័យគ្រប់ Column សម្រាប់ Excel / Sheets"
                                className="opacity-70 hover:opacity-100 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                {isRowCopied ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Table2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* 3. PAYMENT (ការទូទាត់) */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {row.payment || 'CASH'}
                            </span>
                          </td>

                          {/* 4. USD ($) - Accounting Format */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {(() => {
                              const acc = formatAccountingUSD(row.usd);
                              return (
                                <div className="inline-flex items-center justify-between font-mono text-xs w-28 text-right">
                                  <span className="text-slate-400 dark:text-slate-500 font-normal select-none">{acc.symbol}</span>
                                  <span className={`tabular-nums ${
                                    acc.isZero 
                                      ? 'text-slate-400 dark:text-slate-500 font-normal' 
                                      : acc.isNegative 
                                        ? 'text-rose-600 dark:text-rose-400 font-bold' 
                                        : 'text-emerald-600 dark:text-emerald-400 font-bold'
                                  }`}>
                                    {acc.text}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>

                          {/* 5. KHM (៛) - Accounting Format */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {(() => {
                              const acc = formatAccountingKHR(row.khm);
                              return (
                                <div className="inline-flex items-center justify-between font-mono text-xs w-28 text-right">
                                  <span className="text-slate-400 dark:text-slate-500 font-normal select-none">{acc.symbol}</span>
                                  <span className={`tabular-nums ${
                                    acc.isZero 
                                      ? 'text-slate-400 dark:text-slate-500 font-normal' 
                                      : acc.isNegative 
                                        ? 'text-rose-600 dark:text-rose-400 font-bold' 
                                        : 'text-blue-600 dark:text-blue-400 font-bold'
                                  }`}>
                                    {acc.text}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>

                          {/* 6. DATE (កាលបរិច្ឆេទ) */}
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                            {row.date || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* 2. Mobile & Tablet Single-Row Column List (visible on mobile/tablet, hidden on lg) */}
              <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
                {/* Column Headers for Mobile / Tablet */}
                <div className="sticky top-0 z-10 bg-slate-100/95 dark:bg-slate-850/95 backdrop-blur-sm border-b border-slate-200/80 dark:border-slate-800 px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-[11px] font-bold text-slate-400 dark:text-slate-500 flex items-center justify-between gap-1.5 sm:gap-2 shadow-2xs select-none">
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                    <span className="w-5 text-center shrink-0">#</span>
                    <span className="shrink-0">BARCODE</span>
                    <span className="text-slate-400 dark:text-slate-500 ml-1 sm:ml-2 shrink-0">DATE</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 text-right">
                    <span className="shrink-0">PAYMENT</span>
                    <span className="shrink-0">USD / KHR</span>
                    <span className="w-12 text-center shrink-0">COPY</span>
                  </div>
                </div>

                {filteredRecords.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <Sheet className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-semibold text-sm">មិនមានទិន្នន័យក្នុងតារាងទេ</p>
                    <p className="text-xs text-slate-400 mt-1">
                      សូមចុច "ទាញយកផ្ទាល់ (Refresh)" ដើម្បីទាញយកទិន្នន័យពី Google Sheets
                    </p>
                  </div>
                ) : (
                  paginatedRecords.map((row, idx) => {
                    const rowNum = (currentPage - 1) * pageSize + idx + 1;
                    const rowKey = `row-${row.id || row.barcode || idx}`;
                    const isRowCopied = copiedId === rowKey;
                    const isBarcodeCopied = copiedId === `barcode-${row.id || row.barcode || idx}`;
                    const usdVal = Number(row.usd) || 0;
                    const khmVal = Number(row.khm) || 0;

                    return (
                      <div
                        key={row.id || idx}
                        className="px-2.5 sm:px-3 py-2 sm:py-2.5 hover:bg-slate-50/80 dark:hover:bg-slate-850/60 transition-colors flex items-center justify-between gap-1.5 sm:gap-2 text-xs"
                      >
                        {/* Left Column Group: # + Barcode + Date */}
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className="text-slate-400 font-mono text-[11px] font-semibold w-5 text-center shrink-0">
                            {rowNum}.
                          </span>

                          <button
                            type="button"
                            onClick={() => handleCopyCode(row.barcode, `barcode-${row.id || row.barcode || idx}`)}
                            className="font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-900 text-[11px] sm:text-xs tracking-tight hover:bg-blue-100 dark:hover:bg-blue-900/80 active:scale-95 transition cursor-pointer flex items-center gap-1 shrink-0"
                            title="ចុចដើម្បី Copy Barcode តែមួយគត់"
                          >
                            <span>{row.barcode}</span>
                            {isBarcodeCopied && <Check className="w-2.5 h-2.5 text-emerald-600" />}
                          </button>

                          {row.date && (
                            <span className="text-slate-400 dark:text-slate-500 text-[10px] sm:text-[11px] font-normal truncate shrink-0">
                              {row.date}
                            </span>
                          )}
                        </div>

                        {/* Right Column Group: Payment + Amount + Copy Buttons */}
                        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                          <span className="text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                            {row.payment || 'CASH'}
                          </span>

                          <div className="font-mono text-[11px] sm:text-xs font-bold shrink-0 text-right leading-tight">
                            <span className="text-emerald-600 dark:text-emerald-400">
                              ${usdVal.toFixed(2)}
                            </span>
                            <span className="text-slate-300 dark:text-slate-700 mx-0.5">/</span>
                            <span className="text-blue-600 dark:text-blue-400">
                              {khmVal.toLocaleString()}៛
                            </span>
                          </div>

                          {/* Actions: Copy Barcode & Copy Columns */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleCopyCode(row.barcode, `barcode-${row.id || row.barcode || idx}`)}
                              title="ចម្លងតែលេខ Barcode មួយគត់"
                              className="p-1 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95 cursor-pointer"
                            >
                              {isBarcodeCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyRowColumns(row, rowKey)}
                              title="ចម្លងទិន្នន័យគ្រប់ Column សម្រាប់ Excel / Sheets"
                              className="p-1 rounded-md text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95 cursor-pointer"
                            >
                              {isRowCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Table2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Pagination Toolbar */}
            {filteredRecords.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm text-xs shadow-xs">
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
          </>
        )}

        {/* TAB 2: BATCHES */}
        {activeTab === 'BATCHES' && (
          <div className={`overflow-x-auto ${scrollMode === 'CONTAINER' ? 'overflow-y-auto max-h-[calc(100vh-380px)] lg:max-h-[calc(100vh-300px)] min-h-[220px] sm:min-h-[300px] lg:min-h-[420px]' : ''} relative custom-scrollbar`}>
            {/* 1. Desktop Table (hidden on mobile, visible on lg:table) */}
            <table className="hidden lg:table w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-100/95 dark:bg-slate-850/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 shadow-xs">
                <tr className="text-slate-600 dark:text-slate-400 font-bold">
                  <th className="sticky top-0 bg-slate-100/95 dark:bg-slate-850/95 py-3.5 px-4">លេខកញ្ចប់ (Batch ID)</th>
                  <th className="sticky top-0 bg-slate-100/95 dark:bg-slate-850/95 py-3.5 px-4">កាលបរិច្ឆេទ</th>
                  <th className="sticky top-0 bg-slate-100/95 dark:bg-slate-850/95 py-3.5 px-4">អ្នកកត់ត្រា</th>
                  <th className="sticky top-0 bg-slate-100/95 dark:bg-slate-850/95 py-3.5 px-4 text-center">ចំនួនទំនិញ</th>
                  <th className="sticky top-0 bg-slate-100/95 dark:bg-slate-850/95 py-3.5 px-4 text-right">ទឹកប្រាក់សរុប (Total)</th>
                  <th className="sticky top-0 bg-slate-100/95 dark:bg-slate-850/95 py-3.5 px-4 text-right">ធនាគារ (Bank)</th>
                  <th className="sticky top-0 bg-slate-100/95 dark:bg-slate-850/95 py-3.5 px-4 text-right">ប្រាក់សុទ្ធ (Cash)</th>
                  <th className="sticky top-0 bg-slate-100/95 dark:bg-slate-850/95 py-3.5 px-4 text-center">ផ្ទៀងផ្ទាត់ (Reconciliation)</th>
                  <th className="sticky top-0 bg-slate-100/95 dark:bg-slate-850/95 py-3.5 px-4">ចំណាំ</th>
                  <th className="sticky top-0 bg-slate-100/95 dark:bg-slate-850/95 py-3.5 px-4 text-center">Sheets Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
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
                      <td className="py-3.5 px-4 text-right font-mono">
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">
                          ${Number(b.totalUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                          {Number(b.totalKHR || 0).toLocaleString('en-US')} ៛
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs">
                        {(b.bankUSD || b.bankKHR) ? (
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">
                              ${Number(b.bankUSD || 0).toFixed(2)}
                            </span>
                            <span className="text-[11px] text-indigo-500 dark:text-indigo-300">
                              {Number(b.bankKHR || 0).toLocaleString()} ៛
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs">
                        {(b.cashUSD || b.cashKHR) ? (
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-amber-600 dark:text-amber-400">
                              ${Number(b.cashUSD || 0).toFixed(2)}
                            </span>
                            <span className="text-[11px] text-amber-500 dark:text-amber-300">
                              {Number(b.cashKHR || 0).toLocaleString()} ៛
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          (b.reconciliation && (b.reconciliation.includes('គ្រប់ចំនួន') || b.reconciliationStatus === 'BALANCED')) || (!b.reconciliation && !b.bankUSD && !b.bankKHR && !b.cashUSD && !b.cashKHR)
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : b.reconciliation && (b.reconciliation.includes('ខ្វះ') || b.reconciliationStatus === 'SHORTAGE')
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        }`}>
                          {b.reconciliation || '✓ គ្រប់ចំនួន'}
                        </span>
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

            {/* 2. Mobile Card List for Batches (visible on mobile, hidden on lg) */}
            <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredBatches.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="font-semibold text-sm">មិនមានទិន្នន័យកញ្ចប់ទទួលប្រាក់ទេ</p>
                </div>
              ) : (
                filteredBatches.map((b, idx) => (
                  <div
                    key={b.id || b.batchNumber}
                    className="p-3 hover:bg-slate-50/70 dark:hover:bg-slate-850/50 transition-colors flex flex-col gap-1.5"
                  >
                    {/* Row 1: Number + Batch ID (Left) | Status Pill (Right) */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-slate-400 font-mono text-xs font-semibold shrink-0">
                          {idx + 1}.
                        </span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white text-xs truncate">
                          {b.batchNumber}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 shrink-0">
                          {b.totalItems || (Array.isArray(b.items) ? b.items.length : 0)} ជួរ
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60">
                          <span>{b.reconciliation || 'រក្សាទុករួច'}</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        </span>
                      </div>
                    </div>

                    {/* Row 2: Operator & Date (Left) | Amounts USD / KHR (Right) */}
                    <div className="flex items-center justify-between gap-2 text-xs pl-5">
                      <div className="text-slate-500 dark:text-slate-400 text-xs truncate">
                        <span>👤 {b.operator || 'Admin'}</span>
                        <span className="text-slate-400 dark:text-slate-500 text-[10px] ml-1.5">
                          • {b.date || (b.createdAt ? b.createdAt.slice(0, 10) : '—')}
                        </span>
                      </div>

                      <div className="font-mono text-xs font-bold shrink-0 text-right">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          USD {Number(b.totalUSD || 0).toFixed(2)}
                        </span>
                        <span className="text-slate-300 dark:text-slate-700 mx-1">/</span>
                        <span className="text-blue-600 dark:text-blue-400">
                          {Number(b.totalKHR || 0).toLocaleString()} KHR
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
