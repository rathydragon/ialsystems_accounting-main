import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
  Columns3,
  Table2,
  Copy,
  Check,
  X,
  LayoutList,
  Tag,
  CreditCard,
  Package,
  User,
  FileText
} from 'lucide-react';
import { CollectionBatch, CollectionItem, Payer, AuthUser, AppSettings, DatabaseRecord } from '../types';
import { formatCsv, downloadCsv } from '../utils/csvHelper';
import {
  gridTable,
  gridTh,
  gridTd,
  gridRow,
  gridRowSelected,
  gridType,
  gridNull,
  GridHeadGutter,
  GridRowGutter,
  GridSelectionBar,
  GridObjectSelectionBar,
  useGridSelection,
  useRowSelection,
  copyRowsAsTsv,
  exportRowsAsCsv,
} from './ui/DataGrid';


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
  // Time the live data last changed (records are polled by App while this page is open)
  const [lastUpdated, setLastUpdated] = useState(() => new Date());
  useEffect(() => {
    setLastUpdated(new Date());
  }, [records, batches]);
  const [scrollMode] = useState<'CONTAINER' | 'FULL_PAGE'>('CONTAINER');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'>('ALL');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUpdatingColumns, setIsUpdatingColumns] = useState(false);
  const [sortOrder] = useState<'ORIGINAL' | 'DESC' | 'ASC'>('ORIGINAL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<'default' | 'barcode' | 'name' | 'category' | 'stock' | 'usd' | 'total' | 'pickup' | 'destination'>('default');
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('DESC');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showShareGuide, setShowShareGuide] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [dataViewMode, setDataViewMode] = useState<'LIST' | 'TABLE'>(() => {
    const saved = localStorage.getItem('accounting_data_view_mode');
    return (saved === 'TABLE' || saved === 'LIST') ? saved : 'LIST';
  });

  useEffect(() => {
    localStorage.setItem('accounting_data_view_mode', dataViewMode);
  }, [dataViewMode]);

  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [detailModalRecord, setDetailModalRecord] = useState<DatabaseRecord | null>(null);

  const getPaymentBadge = (payment?: string) => {
    const p = (payment || 'CASH').toUpperCase().trim();
    if (p === 'COLLECT') {
      return {
        bg: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
        dot: 'bg-purple-500',
        text: 'COLLECT'
      };
    }
    if (p === 'BANK' || p.includes('ABA') || p.includes('WING') || p.includes('TRANSFER') || p.includes('AC')) {
      return {
        bg: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
        dot: 'bg-sky-500',
        text: p || 'BANK'
      };
    }
    return {
      bg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      dot: 'bg-emerald-500',
      text: p || 'CASH'
    };
  };

  // Synced Horizontal Scrollbar Refs & State
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const footerScrollRef = useRef<HTMLDivElement>(null);
  const activeScrollSource = useRef<'table' | 'footer' | null>(null);
  const scrollResetTimer = useRef<number | null>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState<number>(0);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState<boolean>(false);

  const updateScrollDimensions = useCallback(() => {
    if (tableContainerRef.current) {
      const { scrollWidth, clientWidth } = tableContainerRef.current;
      setTableScrollWidth((prev) => (Math.abs(prev - scrollWidth) > 2 ? scrollWidth : prev));
      setHasHorizontalOverflow((prev) => {
        const next = scrollWidth > clientWidth + 4;
        return prev !== next ? next : prev;
      });
    }
  }, []);

  useEffect(() => {
    updateScrollDimensions();
    const el = tableContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      updateScrollDimensions();
    });
    observer.observe(el);

    window.addEventListener('resize', updateScrollDimensions);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScrollDimensions);
    };
  }, [updateScrollDimensions, records, activeTab, scrollMode, pageSize, currentPage]);

  const handleTableScroll = useCallback(() => {
    if (activeScrollSource.current === 'footer') return;
    activeScrollSource.current = 'table';

    if (tableContainerRef.current && footerScrollRef.current) {
      const tableEl = tableContainerRef.current;
      const footerEl = footerScrollRef.current;

      const maxTableScroll = tableEl.scrollWidth - tableEl.clientWidth;
      const maxFooterScroll = footerEl.scrollWidth - footerEl.clientWidth;

      if (maxTableScroll > 0 && maxFooterScroll > 0) {
        const ratio = tableEl.scrollLeft / maxTableScroll;
        const target = Math.round(ratio * maxFooterScroll);
        if (Math.abs(footerEl.scrollLeft - target) > 1) {
          footerEl.scrollLeft = target;
        }
      }
    }

    if (scrollResetTimer.current) window.clearTimeout(scrollResetTimer.current);
    scrollResetTimer.current = window.setTimeout(() => {
      activeScrollSource.current = null;
    }, 100);
  }, []);

  const handleFooterScroll = useCallback(() => {
    if (activeScrollSource.current === 'table') return;
    activeScrollSource.current = 'footer';

    if (tableContainerRef.current && footerScrollRef.current) {
      const tableEl = tableContainerRef.current;
      const footerEl = footerScrollRef.current;

      const maxTableScroll = tableEl.scrollWidth - tableEl.clientWidth;
      const maxFooterScroll = footerEl.scrollWidth - footerEl.clientWidth;

      if (maxTableScroll > 0 && maxFooterScroll > 0) {
        const ratio = footerEl.scrollLeft / maxFooterScroll;
        const target = Math.round(ratio * maxTableScroll);
        if (Math.abs(tableEl.scrollLeft - target) > 1) {
          tableEl.scrollLeft = target;
        }
      }
    }

    if (scrollResetTimer.current) window.clearTimeout(scrollResetTimer.current);
    scrollResetTimer.current = window.setTimeout(() => {
      activeScrollSource.current = null;
    }, 100);
  }, []);

  const scrollTableLeft = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({ left: -250, behavior: 'smooth' });
    }
  };

  const scrollTableRight = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({ left: 250, behavior: 'smooth' });
    }
  };

  const handleCopyCode = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Copy full row's columns (Barcode, Pick Up, Destination, Payment, USD, KHM, Date) separated by Tab for Excel/Google Sheets
  const handleCopyRowColumns = (row: DatabaseRecord, id?: string) => {
    const columns = [
      row.barcode || '',
      row.pickup || '',
      row.destination || '',
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

  const handleColumnSort = (field: 'barcode' | 'name' | 'category' | 'stock' | 'usd' | 'total' | 'pickup' | 'destination') => {
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
          (r.pickup || '').toLowerCase().includes(q) ||
          (r.destination || '').toLowerCase().includes(q) ||
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
        } else if (sortField === 'pickup') {
          diff = (a.pickup || '').localeCompare(b.pickup || '');
        } else if (sortField === 'destination') {
          diff = (a.destination || '').localeCompare(b.destination || '');
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

  // Row selection for the Data sheet table (keys match the per-row copy keys)
  const dataRowKeys = useMemo(
    () => paginatedRecords.map((row, idx) => `row-${row.id || row.barcode || idx}`),
    [paginatedRecords]
  );
  const dataSelection = useRowSelection(dataRowKeys);
  const selectedDataMatrix = (): [string[], any[][]] => [
    ['BARCODE', 'PAYMENT', 'USD', 'KHM', 'DATE'],
    paginatedRecords
      .filter((_, idx) => dataSelection.isSelected(dataRowKeys[idx]))
      .map((row) => [row.barcode || '', row.pickup || '', row.destination || '', row.payment || '', row.usd ?? 0, row.khm ?? 0, row.date || '']),
  ];

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

  const batchSelection = useGridSelection(filteredBatches as CollectionBatch[], (b) => (b.id || b.batchNumber) as string);

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

    let headers: string[] = [];
    let rows: (string | number | boolean | null | undefined)[][] = [];
    let filename = '';

    if (activeTab === 'DATA_SHEET') {
      headers = ['BARCODE', 'PICK UP', 'DESTINATION', 'PAYMENT', 'USD', 'KHM', 'DATE'];
      rows = filteredRecords.map(r => [r.barcode, r.pickup || '', r.destination || '', r.payment, r.usd || 0, r.khm || 0, r.date || '']);
      filename = `GoogleSheets_Data_${new Date().toISOString().slice(0, 10)}.csv`;
    } else if (activeTab === 'BATCHES') {
      headers = ['Batch_ID', 'Date', 'Operator', 'Total_Items', 'Total_USD', 'Total_KHR', 'Bank_USD', 'Bank_KHR', 'Cash_USD', 'Cash_KHR', 'Reconciliation', 'Notes', 'Created_At'];
      rows = filteredBatches.map(b => [
        b.batchNumber,
        b.date,
        b.operator || '',
        b.totalItems || 0,
        b.totalUSD || 0,
        b.totalKHR || 0,
        b.bankUSD || 0,
        b.bankKHR || 0,
        b.cashUSD || 0,
        b.cashKHR || 0,
        b.reconciliation || '✓ គ្រប់ចំនួន (Balanced 100%)',
        b.notes || '',
        formatDateTimeForCSV(b.createdAt)
      ]);
      filename = `GoogleSheets_Batches_${new Date().toISOString().slice(0, 10)}.csv`;
    } else if (activeTab === 'ITEMS') {
      headers = ['Batch_ID', 'Tracking', 'Customer_Name', 'Date', 'Payment_Method', 'Operator', 'Created_At'];
      rows = filteredItems.map(item => [
        item.batchNumber,
        item.tracking,
        item.name,
        item.date,
        item.paymentMethod,
        item.operator,
        formatDateTimeForCSV(item.createdAt)
      ]);
      filename = `GoogleSheets_Items_${new Date().toISOString().slice(0, 10)}.csv`;
    } else if (activeTab === 'PAYERS') {
      headers = ['ID', 'Name', 'Phone', 'Category', 'Area', 'Status', 'Notes', 'Total_USD', 'Total_KHR', 'Created_At'];
      rows = filteredPayers.map(p => [
        p.id,
        p.name,
        p.phone || '',
        p.category,
        p.area || '',
        p.status,
        p.notes || '',
        p.totalUSD || 0,
        p.totalKHR || 0,
        formatDateTimeForCSV(p.createdAt)
      ]);
      filename = `GoogleSheets_Payers_${new Date().toISOString().slice(0, 10)}.csv`;
    }

    if (rows.length === 0 && headers.length === 0) return;

    const csvContent = formatCsv(headers, rows);
    downloadCsv(filename, csvContent);
  };

  return (
    <div className="page-fill w-full space-y-3 pb-28 lg:pb-0 animate-in fade-in duration-300">
      
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
      <div className="page-fill-body bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col transition-all overflow-hidden">
        
        {/* STICKY TOP UNIT: Menubar + Menu Tabs + Search & Filters */}
        <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-all shadow-xs">
          
          {/* Desktop (xl): Row 1 + Row 2 collapse into ONE bar via display:contents */}
          <div className="xl:flex xl:items-center xl:gap-2 xl:px-3 xl:py-1.5 xl:border-b xl:border-slate-100 xl:dark:border-slate-800/80">
          {/* Row 1: Title + Menu Tabs + KPI chips + CSV in one compact bar */}
          <div className="xl:contents flex flex-wrap items-center gap-2 px-2.5 py-1.5 sm:px-3 border-b border-slate-100 dark:border-slate-800/80">
            {/* Title & Live status */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-sm shadow-emerald-500/20 shrink-0">
                <Database className="w-3.5 h-3.5" />
              </div>
              <h1 className="text-sm font-black text-slate-900 dark:text-white tracking-tight whitespace-nowrap">
                ទិន្នន័យ
              </h1>
              <span
                className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"
                title={`Live Sync • ${lastUpdated.toLocaleTimeString('en-US')}`}
              />
            </div>

            {/* Segmented Menu Tab Bar: Full width 50% / 50% split on iPad and phone */}
            <div className="order-last xl:order-none w-full xl:w-auto grid grid-cols-2 xl:inline-flex bg-slate-100 dark:bg-slate-800/90 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 shadow-inner gap-0.5">
              
              {/* ITEM 1: តារាងទិន្នន័យ (Data Table) - 50% on Mobile/iPad */}
              <button
                type="button"
                onClick={() => setActiveTab('DATA_SHEET')}
                className={`flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg text-xs sm:text-sm transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'DATA_SHEET'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs border border-slate-200/80 dark:border-slate-700/80 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                }`}
              >
                <Table2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-bold">តារាង</span>
                <span className={`px-1.5 py-px rounded-full text-[10px] font-mono font-bold ${
                  activeTab === 'DATA_SHEET'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                  {toKhmerNumber(filteredRecords.length)}
                </span>
              </button>

              {/* ITEM 2: កញ្ចប់ទទួលប្រាក់ (Batches) - 50% on Mobile/iPad */}
              <button
                type="button"
                onClick={() => setActiveTab('BATCHES')}
                className={`flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg text-xs sm:text-sm transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'BATCHES'
                    ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs border border-slate-200/80 dark:border-slate-700/80 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                }`}
              >
                <Layers className="w-4 h-4 text-purple-600 shrink-0" />
                <span className="font-bold">កញ្ចប់</span>
                <span className={`px-1.5 py-px rounded-full text-[10px] font-mono font-bold ${
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
                className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/60 transition active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
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
                  className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/60 transition active:scale-95 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  title="ចុចដើម្បីកែសម្រួលរចនាសម្ព័ន្ធជួរឈរក្នុង Google Sheets"
                >
                  <Columns3 className={`w-3.5 h-3.5 text-slate-500 shrink-0 ${isUpdatingColumns ? 'animate-spin' : ''}`} />
                  <span>ជួរឈរ</span>
                </button>
              )}
            </div>

            {/* KPI chips + CSV */}
            <div className="xl:order-3 flex items-center gap-1.5 flex-1 xl:flex-none min-w-0 justify-end overflow-x-auto scrollbar-none text-[11px]">
              <span className="inline-flex items-center gap-1 h-7 px-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 whitespace-nowrap shrink-0">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <b className="font-black font-mono text-emerald-700 dark:text-emerald-400">
                  {stats.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </b>
              </span>
              <span className="inline-flex items-center gap-1 h-7 px-2 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40 whitespace-nowrap shrink-0">
                <Banknote className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <b className="font-black font-mono text-blue-700 dark:text-blue-400">
                  {stats.totalKHR.toLocaleString('en-US')} ៛
                </b>
              </span>
              <span className="inline-flex items-center gap-1 h-7 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 whitespace-nowrap shrink-0">
                <Sheet className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <b className="font-black font-mono text-slate-900 dark:text-white">{stats.totalCount.toLocaleString()}</b>
                <span className="text-slate-400">ជួរ</span>
              </span>
              <button
                type="button"
                onClick={handleExportCSV}
                className="shrink-0 flex items-center justify-center gap-1 px-2.5 h-7 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition active:scale-95 cursor-pointer whitespace-nowrap shadow-2xs"
                title="ទាញយកជាឯកសារ CSV"
              >
                <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Row 2: Search & Filter Toolbar */}
          <div className="xl:contents px-2.5 py-1.5 sm:px-3 bg-slate-50/75 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 sm:gap-3">
            {/* Search Input */}
            <div className="xl:order-1 relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ស្វែងរកតាមឈ្មោះ, លេខកូដ..."
                className="w-full pl-8 pr-7 py-1.5 h-8 text-xs rounded-lg bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 dark:text-white placeholder:text-slate-400 shadow-2xs"
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
            <div className="xl:order-2 grid grid-cols-2 sm:flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Dropdown 1: គ្រប់ប្រភេទទាំងអស់ (All) */}
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="w-full sm:w-auto px-2.5 py-1 h-8 text-[11px] sm:text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold focus:outline-none shadow-2xs cursor-pointer truncate"
              >
                <option value="ALL">គ្រប់ប្រភេទ (All)</option>
                <option value="CASH">CASH</option>
                <option value="BANK">BANK / ABA</option>
              </select>

              {/* Dropdown 2: ស្ថានភាពទាំងអស់ (Status) */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-auto px-2.5 py-1 h-8 text-[11px] sm:text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold focus:outline-none shadow-2xs cursor-pointer truncate"
              >
                <option value="ALL">គ្រប់ស្ថានភាព (All)</option>
                <option value="PAID">បានទូទាត់រួច</option>
                <option value="PENDING">មិនទាន់ទូទាត់</option>
                <option value="TODAY">ថ្ងៃនេះ</option>
              </select>
            </div>
          </div>

          </div>

          {/* Sub-header Information Strip */}
          {activeTab === 'DATA_SHEET' && (
            <div className="lg:hidden bg-emerald-50/70 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/50 px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-800 dark:text-emerald-300">
              <div className="flex items-center gap-2 truncate">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">
                  Sheet: <strong className="font-bold text-slate-800 dark:text-slate-100">Data</strong>
                </span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="font-semibold font-mono text-slate-600 dark:text-slate-300">
                  {paginatedRecords.length} / {filteredRecords.length.toLocaleString()} ជួរ
                </span>
              </div>

              {/* Mobile / Tablet View Switcher: List vs Table */}
              <div className="flex lg:hidden items-center p-0.5 bg-white/90 dark:bg-slate-800/90 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setDataViewMode('LIST')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    dataViewMode === 'LIST'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-emerald-600'
                  }`}
                  title="មើលជាទម្រង់កាតរៀបរយ ងាយស្រួលមើលលើទូរស័ព្ទ"
                >
                  <LayoutList className="w-3 h-3" />
                  <span>កាតរៀបរយ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDataViewMode('TABLE')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    dataViewMode === 'TABLE'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-emerald-600'
                  }`}
                  title="មើលជាទម្រង់តារាងសៀវភៅពេញ (អាច Scroll ឆ្វេងស្តាំ)"
                >
                  <Table2 className="w-3 h-3" />
                  <span>តារាងពេញ</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 4. Active Tab Content Tables with Sticky Table Headers (<thead>) */}
        
        {/* TAB 1: DATA SHEET (Matches User's Google Sheet Tab 'Data') */}
        {activeTab === 'DATA_SHEET' && (
          <>
            {dataSelection.count > 0 && (
              <div className="px-3 pb-2">
                <GridSelectionBar
                  count={dataSelection.count}
                  onCopy={() => copyRowsAsTsv(...selectedDataMatrix())}
                  onExport={() => exportRowsAsCsv('data_sheet_selected', ...selectedDataMatrix())}
                  onClear={dataSelection.clear}
                />
              </div>
            )}
            <div 
              ref={tableContainerRef}
              onScroll={handleTableScroll}
              className={`overflow-x-auto ${scrollMode === 'CONTAINER' ? 'page-fill-scroll overflow-y-auto max-h-[calc(100vh-380px)] lg:max-h-[calc(100vh-320px)] min-h-[220px] sm:min-h-[300px] lg:min-h-[420px]' : ''} relative custom-scrollbar`}
            >
              {/* 1. Full Spreadsheet Table (Visible on Desktop, or when Mobile switches to 'TABLE' view) */}
              <table className={`${dataViewMode === 'TABLE' ? 'table' : 'hidden lg:table'} ${gridTable} min-w-[980px]`}>
                <thead>
                  <tr className="select-none">
                    <GridHeadGutter
                      checked={dataSelection.allChecked}
                      indeterminate={dataSelection.someChecked}
                      onToggleAll={dataSelection.toggleAll}
                    />
                    {[
                      { key: 'barcode', label: 'barcode', hint: 'លេខកូដ', cls: 'min-w-[160px]' },
                      { key: 'pickup', label: 'pick up', hint: 'អ្នកយក', cls: 'min-w-[150px]' },
                      { key: 'destination', label: 'destination', hint: 'គោលដៅ', cls: 'min-w-[160px]' },
                      { key: 'category', label: 'payment', hint: 'ការទូទាត់', cls: 'min-w-[120px]' },
                      { key: 'usd', label: 'usd', hint: '$', cls: 'min-w-[120px] text-right' },
                      { key: 'total', label: 'khm', hint: '៛', cls: 'min-w-[130px] text-right' },
                      { key: 'name', label: 'date', hint: 'កាលបរិច្ឆេទ', cls: 'min-w-[140px]' },
                    ].map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleColumnSort(col.key as any)}
                        className={`${gridTh()} ${col.cls} cursor-pointer hover:text-slate-900 dark:hover:text-white`}
                      >
                        <div className={`flex items-center gap-1.5 ${col.cls.includes('text-right') ? 'justify-end' : ''}`}>
                          <span className="font-medium">{col.label}</span>
                          <span className={gridType.replace('ml-1.5 ', '')}>{col.hint}</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                        </div>
                      </th>
                    ))}
                    <th className={`${gridTh()} text-center min-w-[90px]`}>
                      <span className="font-medium">សកម្មភាព</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
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
                      const badge = getPaymentBadge(row.payment);
                      const linkedItem = row.barcode ? itemMap[row.barcode.toLowerCase().trim()] : null;
                      const isSelected = dataSelection.isSelected(rowKey);

                      return (
                        <tr
                          key={row.id || idx}
                          className={`${gridRow} cursor-default ${isSelected ? gridRowSelected : ''}`}
                        >
                          {/* 1. ☐ # */}
                          <GridRowGutter
                            selected={isSelected}
                            rowNumber={rowNum}
                            onToggle={() => dataSelection.toggle(rowKey)}
                          />

                          {/* 2. BARCODE (លេខកូដ) */}
                          <td className={`${gridTd()} font-mono text-slate-900 dark:text-slate-100`}>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setDetailModalRecord(row)}
                                title="ចុចដើម្បីមើលព័ត៌មានលម្អិត"
                                className="hover:text-emerald-600 dark:hover:text-emerald-400 transition cursor-pointer font-semibold"
                              >
                                {row.barcode}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyCode(row.barcode, `barcode-${row.id || row.barcode || idx}`)}
                                title="ចម្លងតែលេខ Barcode មួយគត់"
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                {isBarcodeCopied ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                              {linkedItem?.name && (
                                <span className="ml-1 font-sans text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-[140px]" title={linkedItem.name}>
                                  · {linkedItem.name}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* PICK UP (អ្នកយក) */}
                          <td className={`${gridTd()} text-slate-800 dark:text-slate-200 truncate max-w-[200px]`} title={row.pickup || ''}>
                            {row.pickup || gridNull}
                          </td>

                          {/* DESTINATION (គោលដៅ) */}
                          <td className={`${gridTd()} text-slate-800 dark:text-slate-200 truncate max-w-[220px]`} title={row.destination || ''}>
                            {row.destination || gridNull}
                          </td>

                          {/* 3. PAYMENT (ការទូទាត់) */}
                          <td className={gridTd()}>
                            <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[11px] font-medium ${badge.bg}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                              <span>{badge.text}</span>
                            </span>
                          </td>

                          {/* 4. USD ($) - Accounting Format */}
                          <td className={`${gridTd()} text-right`}>
                            {(() => {
                              const acc = formatAccountingUSD(row.usd);
                              return (
                                <div className="inline-flex items-center justify-between font-mono w-24">
                                  <span className="text-slate-300 dark:text-slate-600 select-none">{acc.symbol}</span>
                                  <span className={`tabular-nums ${
                                    acc.isZero
                                      ? 'text-slate-300 dark:text-slate-600'
                                      : acc.isNegative
                                        ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                        : 'text-slate-900 dark:text-slate-100 font-semibold'
                                  }`}>
                                    {acc.text}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>

                          {/* 5. KHM (៛) - Accounting Format */}
                          <td className={`${gridTd()} text-right`}>
                            {(() => {
                              const acc = formatAccountingKHR(row.khm);
                              return (
                                <div className="inline-flex items-center justify-between font-mono w-28">
                                  <span className="text-slate-300 dark:text-slate-600 select-none">{acc.symbol}</span>
                                  <span className={`tabular-nums ${
                                    acc.isZero
                                      ? 'text-slate-300 dark:text-slate-600'
                                      : acc.isNegative
                                        ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                        : 'text-slate-900 dark:text-slate-100 font-semibold'
                                  }`}>
                                    {acc.text}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>

                          {/* 6. DATE (កាលបរិច្ឆេទ) */}
                          <td className={`${gridTd()} font-mono tabular-nums text-slate-600 dark:text-slate-300`}>
                            {row.date || gridNull}
                          </td>

                          {/* 7. ACTIONS (សកម្មភាព) */}
                          <td className={`${gridTd()} text-center`}>
                            <div className="flex items-center justify-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => setDetailModalRecord(row)}
                                title="មើលព័ត៌មានលម្អិត"
                                className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyRowColumns(row, rowKey)}
                                title="ចម្លងទិន្នន័យគ្រប់ Column សម្រាប់ Excel / Sheets"
                                className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                              >
                                {isRowCopied ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Table2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* 2. Modern Mobile & Tablet Card / Row List (Shown on mobile when view mode is 'LIST') */}
              <div className={`${dataViewMode === 'LIST' ? 'block lg:hidden' : 'hidden'} divide-y divide-slate-100 dark:divide-slate-800/80`}>
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
                    const badge = getPaymentBadge(row.payment);
                    const linkedItem = row.barcode ? itemMap[row.barcode.toLowerCase().trim()] : null;
                    const isExpanded = expandedRowId === rowKey;

                    return (
                      <div
                        key={row.id || idx}
                        className="p-3 sm:p-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-850/60 transition-colors flex flex-col gap-2"
                      >
                        {/* Row Top: Index + Barcode + Copy | Payment Badge + Detail Toggle */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                              {rowNum}
                            </span>

                            <div className="flex items-center gap-1.5 min-w-0">
                              <button
                                type="button"
                                onClick={() => setDetailModalRecord(row)}
                                className="font-mono font-black text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 text-xs sm:text-[13px] tracking-tight cursor-pointer truncate"
                                title="ចុចដើម្បីមើលព័ត៌មានលម្អិត"
                              >
                                {row.barcode}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCopyCode(row.barcode, `barcode-${row.id || row.barcode || idx}`)}
                                className="p-1 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 transition active:scale-90 cursor-pointer shrink-0"
                                title="ចម្លង Barcode"
                              >
                                {isBarcodeCopied ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                              <span>{badge.text}</span>
                            </span>

                            <button
                              type="button"
                              onClick={() => setExpandedRowId(isExpanded ? null : rowKey)}
                              className={`p-1 rounded-lg border transition cursor-pointer ${
                                isExpanded 
                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400' 
                                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                              }`}
                              title={isExpanded ? 'បិទព័ត៌មានលម្អិត' : 'មើលព័ត៌មានលម្អិត'}
                            >
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                        </div>

                        {/* Pick up → Destination */}
                        {(row.pickup || row.destination) && (
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 min-w-0">
                            <span className="truncate">{row.pickup || '—'}</span>
                            <span className="text-slate-300 dark:text-slate-600 shrink-0">→</span>
                            <span className="truncate font-medium">{row.destination || '—'}</span>
                          </div>
                        )}

                        {/* Row Bottom: Date (Never truncated!) + Customer info | Amounts USD & KHR */}
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium min-w-0">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-medium text-xs whitespace-nowrap">
                              {row.date || '—'}
                            </span>
                            {linkedItem?.name && (
                              <span className="text-slate-400 dark:text-slate-500 text-[11px] truncate max-w-[130px] sm:max-w-[180px]">
                                • 👤 {linkedItem.name}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 font-mono text-xs font-bold shrink-0 text-right">
                            <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                              ${usdVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-slate-300 dark:text-slate-700 font-normal">/</span>
                            <span className="text-blue-600 dark:text-blue-400 tabular-nums">
                              {khmVal.toLocaleString('en-US')} ៛
                            </span>
                          </div>
                        </div>

                        {/* In-Place Expanded Detail Drawer */}
                        {isExpanded && (
                          <div className="mt-1 p-3 rounded-xl bg-slate-50/90 dark:bg-slate-850/80 border border-slate-200/80 dark:border-slate-800 text-xs flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                                <div className="text-[10px] text-slate-400">ទឹកប្រាក់ USD</div>
                                <div className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                                  ${usdVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              </div>
                              <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                                <div className="text-[10px] text-slate-400">ទឹកប្រាក់ KHR</div>
                                <div className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                                  {khmVal.toLocaleString('en-US')} ៛
                                </div>
                              </div>
                            </div>

                            <div className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                              <div className="flex items-center justify-between py-1 border-b border-slate-200/40 dark:border-slate-800">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <Tag className="w-3 h-3" />
                                  <span>Barcode:</span>
                                </span>
                                <span className="font-mono font-bold text-slate-900 dark:text-white">{row.barcode}</span>
                              </div>
                              <div className="flex items-center justify-between py-1 border-b border-slate-200/40 dark:border-slate-800">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  <span>កាលបរិច្ឆេទ:</span>
                                </span>
                                <span className="font-medium text-slate-800 dark:text-slate-200">{row.date || '—'}</span>
                              </div>
                              <div className="flex items-center justify-between py-1 border-b border-slate-200/40 dark:border-slate-800">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <CreditCard className="w-3 h-3" />
                                  <span>ការទូទាត់:</span>
                                </span>
                                <span className="font-bold text-slate-800 dark:text-slate-200">{row.payment || 'CASH'}</span>
                              </div>
                              {linkedItem && (
                                <>
                                  {linkedItem.name && (
                                    <div className="flex items-center justify-between py-1 border-b border-slate-200/40 dark:border-slate-800">
                                      <span className="text-slate-400 flex items-center gap-1">
                                        <User className="w-3 h-3" />
                                        <span>អតិថិជន:</span>
                                      </span>
                                      <span className="font-bold text-slate-800 dark:text-slate-200">{linkedItem.name}</span>
                                    </div>
                                  )}
                                  {linkedItem.batchNumber && (
                                    <div className="flex items-center justify-between py-1 border-b border-slate-200/40 dark:border-slate-800">
                                      <span className="text-slate-400 flex items-center gap-1">
                                        <Package className="w-3 h-3" />
                                        <span>កញ្ចប់ Batch:</span>
                                      </span>
                                      <span className="font-mono text-slate-700 dark:text-slate-300">{linkedItem.batchNumber}</span>
                                    </div>
                                  )}
                                  {linkedItem.operator && (
                                    <div className="flex items-center justify-between py-1 border-b border-slate-200/40 dark:border-slate-800">
                                      <span className="text-slate-400 flex items-center gap-1">
                                        <User className="w-3 h-3" />
                                        <span>អ្នកកត់ត្រា:</span>
                                      </span>
                                      <span className="text-slate-700 dark:text-slate-300">{linkedItem.operator}</span>
                                    </div>
                                  )}
                                </>
                              )}
                              {row.note && (
                                <div className="flex items-start justify-between py-1 border-b border-slate-200/40 dark:border-slate-800">
                                  <span className="text-slate-400 flex items-center gap-1">
                                    <FileText className="w-3 h-3" />
                                    <span>ចំណាំ:</span>
                                  </span>
                                  <span className="text-slate-700 dark:text-slate-300 text-right">{row.note}</span>
                                </div>
                              )}
                            </div>

                            {/* Action Buttons inside Drawer */}
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleCopyCode(row.barcode, `barcode-${row.id || row.barcode || idx}`)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-[11px] shadow-2xs transition active:scale-95 cursor-pointer"
                              >
                                {isBarcodeCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-400" />}
                                <span>ចម្លង Barcode</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCopyRowColumns(row, rowKey)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-[11px] shadow-2xs transition active:scale-95 cursor-pointer"
                              >
                                {isRowCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Table2 className="w-3 h-3 text-slate-400" />}
                                <span>ចម្លងជួរ (Sheets)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setDetailModalRecord(row)}
                                className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition active:scale-95 cursor-pointer"
                                title="បើកផ្ទាំងធំ (Modal)"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Pagination Toolbar with Synced Horizontal Scrollbar */}
            {filteredRecords.length > 0 && (
              <div className="sticky bottom-2 z-20 flex flex-col gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md text-xs shadow-md rounded-b-2xl">
                
                {/* Synced Horizontal Scrollbar with Quick Nav Buttons */}
                {hasHorizontalOverflow && (
                  <div className="flex items-center gap-1.5 pb-2 border-b border-slate-200/60 dark:border-slate-800/80 w-full">
                    <button
                      type="button"
                      onClick={scrollTableLeft}
                      className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
                      title="Scroll ទៅឆ្វេង (Scroll Left)"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    <div
                      ref={footerScrollRef}
                      onScroll={handleFooterScroll}
                      className="flex-1 overflow-x-auto overflow-y-hidden h-2.5 sm:h-3 custom-scrollbar bg-slate-200/70 dark:bg-slate-800/70 rounded-full border border-slate-200 dark:border-slate-700 cursor-ew-resize hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                      title="អូស Scroll ឆ្វេង-ស្តាំ ដើម្បីរំកិលតារាង (Drag to scroll table)"
                    >
                      <div style={{ width: `${tableScrollWidth}px`, height: '1px' }} />
                    </div>

                    <button
                      type="button"
                      onClick={scrollTableRight}
                      className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
                      title="Scroll ទៅស្តាំ (Scroll Right)"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
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
            </div>
          )}
          </>
        )}

        {/* TAB 2: BATCHES */}
        {activeTab === 'BATCHES' && batchSelection.count > 0 && (
          <div className="hidden lg:block px-3 pb-2">
            <GridObjectSelectionBar
              rows={batchSelection.selectedRows}
              filename="collection_batches_selected"
              omit={['items']}
              onClear={batchSelection.clear}
            />
          </div>
        )}
        {activeTab === 'BATCHES' && (
          <div className={`overflow-x-auto ${scrollMode === 'CONTAINER' ? 'page-fill-scroll overflow-y-auto max-h-[calc(100vh-380px)] lg:max-h-[calc(100vh-300px)] min-h-[220px] sm:min-h-[300px] lg:min-h-[420px]' : ''} relative custom-scrollbar`}>
            {/* 1. Desktop Table (hidden on mobile, visible on lg:table) */}
            <table className="sb-grid hidden lg:table w-full text-left">
              <thead>
                <tr>
                  <GridHeadGutter
                    checked={batchSelection.allChecked}
                    indeterminate={batchSelection.someChecked}
                    onToggleAll={batchSelection.toggleAll}
                  />
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
              <tbody>
                {filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400">
                      <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-semibold text-sm">មិនមានទិន្នន័យកញ្ចប់ទទួលប្រាក់ទេ</p>
                    </td>
                  </tr>
                ) : (
                  filteredBatches.map((b, bIdx) => (
                    <tr
                      key={b.id || b.batchNumber}
                      className={`group ${batchSelection.isSelected(batchSelection.keys[bIdx]) ? 'sb-selected' : ''}`}
                    >
                      <GridRowGutter
                        selected={batchSelection.isSelected(batchSelection.keys[bIdx])}
                        rowNumber={bIdx + 1}
                        onToggle={() => batchSelection.toggle(batchSelection.keys[bIdx])}
                      />
                      <td className="font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {b.batchNumber}
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

      {/* 5. Detail Modal Dialog for inspecting complete record details */}
      {detailModalRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-850/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">ព័ត៌មានលម្អិតទិន្នន័យ</h3>
                  <p className="text-[10px] text-slate-400">Sheet: Data • ព័ត៌មានលម្អិតពេញលេញ</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDetailModalRecord(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
              {/* Barcode Hero Box */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">លេខកូដ Barcode</div>
                  <div className="text-base font-black font-mono text-slate-900 dark:text-white tracking-tight truncate">
                    {detailModalRecord.barcode}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopyCode(detailModalRecord.barcode, `modal-${detailModalRecord.barcode}`)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition active:scale-95 cursor-pointer shrink-0"
                >
                  {copiedId === `modal-${detailModalRecord.barcode}` ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>បានចម្លង</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>ចម្លង</span>
                    </>
                  )}
                </button>
              </div>

              {/* Financial Amounts Cards */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60">
                  <div className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1 mb-1">
                    <DollarSign className="w-3 h-3 text-emerald-600" />
                    <span>ទឹកប្រាក់ USD</span>
                  </div>
                  <div className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                    ${(Number(detailModalRecord.usd) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/60">
                  <div className="text-[10px] font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1 mb-1">
                    <Banknote className="w-3 h-3 text-blue-600" />
                    <span>ទឹកប្រាក់ KHR</span>
                  </div>
                  <div className="text-base font-black font-mono text-blue-600 dark:text-blue-400">
                    {(Number(detailModalRecord.khm) || 0).toLocaleString('en-US')} ៛
                  </div>
                </div>
              </div>

              {/* Details List */}
              <div className="p-3.5 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-2.5 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/50 dark:border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>កាលបរិច្ឆេទ</span>
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {detailModalRecord.date || '—'}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-slate-200/50 dark:border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                    <span>វិធីសាស្ត្រទូទាត់</span>
                  </span>
                  {(() => {
                    const badge = getPaymentBadge(detailModalRecord.payment);
                    return (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        <span>{badge.text}</span>
                      </span>
                    );
                  })()}
                </div>

                {(() => {
                  const linked = detailModalRecord.barcode ? itemMap[detailModalRecord.barcode.toLowerCase().trim()] : null;
                  return (
                    <>
                      {detailModalRecord.pickup && (
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/50 dark:border-slate-800">
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span>អ្នកយក (Pick Up)</span>
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">{detailModalRecord.pickup}</span>
                        </div>
                      )}
                      {detailModalRecord.destination && (
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/50 dark:border-slate-800">
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-slate-400" />
                            <span>គោលដៅ (Destination)</span>
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">{detailModalRecord.destination}</span>
                        </div>
                      )}
                      {linked?.name && (
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/50 dark:border-slate-800">
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span>អតិថិជន / ទំនិញ</span>
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{linked.name}</span>
                        </div>
                      )}
                      {linked?.batchNumber && (
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/50 dark:border-slate-800">
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-slate-400" />
                            <span>កញ្ចប់ Batch No.</span>
                          </span>
                          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{linked.batchNumber}</span>
                        </div>
                      )}
                      {linked?.operator && (
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/50 dark:border-slate-800">
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span>អ្នកកត់ត្រា</span>
                          </span>
                          <span className="text-slate-700 dark:text-slate-300">{linked.operator}</span>
                        </div>
                      )}
                    </>
                  );
                })()}

                {detailModalRecord.note && (
                  <div className="flex items-start justify-between">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>ចំណាំ</span>
                    </span>
                    <span className="text-slate-700 dark:text-slate-300 text-right max-w-[200px]">{detailModalRecord.note}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/80 flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopyRowColumns(detailModalRecord, `modal-row-${detailModalRecord.id || detailModalRecord.barcode}`)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-xs shadow-2xs transition active:scale-95 cursor-pointer"
              >
                {copiedId === `modal-row-${detailModalRecord.id || detailModalRecord.barcode}` ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>បានចម្លងជួរពេញ</span>
                  </>
                ) : (
                  <>
                    <Table2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>ចម្លងសម្រាប់ Sheets</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setDetailModalRecord(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs transition cursor-pointer"
              >
                បិទ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
