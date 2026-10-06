import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Truck,
  Search,
  Plus,
  Trash2,
  Edit2,
  Download,
  Calendar,
  User,
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
  Code2,
  FileCode,
  ExternalLink,
  LayoutGrid,
  List,
  Send,
  Users,
  BarChart3,
  TrendingUp,
  Bell,
  CheckCheck
} from 'lucide-react';
import { CodeViewerModal, CODE_GS_CONTENT } from './CodeViewerModal';
import { DistributionReportItem, AuthUser, UserPermission, AppSettings, OperatorDistributionSummary } from '../types';
import { sanitizeTrackingCode } from '../utils/sanitizeTracking';
import {
  canOperateDistributionActions,
  canCreateDistributionReport,
  canEditDistributionReport,
  canDeleteDistributionReport,
  getInitialDistributionReports,
  saveDistributionReport,
  deleteDistributionReport,
  subscribeToDistributionReports,
  syncLocalDistributionReportsToFirestore,
  forceSyncDistributionReports,
  syncAllDistributionReportsToGoogleSheets,
  getOperatorDistributionStats,
  triggerManualDistributionSummary,
  checkAndAutoSendDaily6PMSummary,
  getTodayDateStringPhnomPenh
} from '../services/distributionReportService';
import { isMasterAdmin, canUserViewAllData } from '../services/userPermissionService';
import { formatDailyDistributionSummaryTelegramMessage } from '../services/telegramService';
import { getCachedDataReport } from '../services/dataReportService';
import { OperatorDistributionSummaryModal } from './OperatorDistributionSummaryModal';

// Format ISO date string into readable YYYY-MM-DD HH:mm
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

// Code-split BarcodeScannerModal
const BarcodeScannerModal = React.lazy(() =>
  import('./BarcodeScannerModal').then((m) => ({ default: m.BarcodeScannerModal }))
);

interface DistributionReportPageProps {
  currentUser?: AuthUser | null;
  permissions?: UserPermission[];
  settings?: AppSettings;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateToDataReport?: () => void;
}

export const DistributionReportPage: React.FC<DistributionReportPageProps> = ({
  currentUser,
  permissions,
  settings,
  onShowToast
}) => {
  // 1. Data State
  const [reports, setReports] = useState<DistributionReportItem[]>(() => getInitialDistributionReports());
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Cached Google Sheet Data Report rows for instant barcode info lookup & DELIVERED status check
  const [cachedSheetRows] = useState(() => {
    try {
      return getCachedDataReport().rows || [];
    } catch {
      return [];
    }
  });

  // Real-time Firestore subscription & auto-sync local items
  useEffect(() => {
    setIsLoading(true);
    // Push any local reports to Firestore in case they were created offline
    syncLocalDistributionReportsToFirestore().catch(() => {});

    const unsubscribe = subscribeToDistributionReports((items) => {
      setReports(items);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Granular action permissions (Create, Edit, Delete)
  const canCreate = useMemo(() => {
    return canCreateDistributionReport(currentUser, permissions);
  }, [currentUser, permissions]);

  const canEdit = useMemo(() => {
    return canEditDistributionReport(currentUser, permissions);
  }, [currentUser, permissions]);

  const canDelete = useMemo(() => {
    return canDeleteDistributionReport(currentUser, permissions);
  }, [currentUser, permissions]);

  const canOperateActions = useMemo(() => {
    return canOperateDistributionActions(currentUser, permissions);
  }, [currentUser, permissions]);

  // Strict Admin Privilege (Only Admin role or Master Admin email)
  const isAdmin = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.email && isMasterAdmin(currentUser.email)) return true;
    if (currentUser.role === 'ADMIN') return true;
    if (permissions && currentUser.email) {
      const cleanEmail = currentUser.email.toLowerCase().trim();
      const perm = permissions.find((p) => p.email?.toLowerCase().trim() === cleanEmail);
      if (perm && perm.status !== 'SUSPENDED' && perm.role === 'ADMIN') return true;
    }
    return false;
  }, [currentUser, permissions]);

  // Data Scope Privilege (All Data vs Own Only)
  const canViewAll = useMemo(() => {
    return canUserViewAllData(currentUser, permissions);
  }, [currentUser, permissions]);

  const myEmail = useMemo(() => (currentUser?.email || '').toLowerCase().trim(), [currentUser?.email]);
  const myName = useMemo(() => (currentUser?.name || '').toLowerCase().trim(), [currentUser?.name]);

  const isOwnRecord = useCallback(
    (r: DistributionReportItem) => {
      if (!myEmail) return false;
      const opEmail = (r.operatorEmail || '').toLowerCase().trim();
      if (opEmail && opEmail === myEmail) return true;
      const creator = (r.createdBy || '').toLowerCase().trim();
      if (creator && (creator === myEmail || (myName && creator === myName))) return true;
      return false;
    },
    [myEmail, myName]
  );

  // Scoped list of reports based on Data Scope
  const scopedReports = useMemo(() => {
    if (canViewAll) return reports;
    return reports.filter(isOwnRecord);
  }, [reports, canViewAll, isOwnRecord]);

  // 2. Form State
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [barcode, setBarcode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  // 3. Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'THIS_MONTH'>('ALL');
  const [operatorFilter, setOperatorFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'barcode' | 'name'>('newest');

  // View Mode: 'table' or 'cards' (defaults to 'cards' on mobile, 'table' on desktop)
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'cards';
    }
    return 'table';
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Toast / Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<DistributionReportItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Operator Transaction Summary State (EMAIL អ្នកធ្វើប្រតិបត្តិការ & Telegram Bot)
  const [showOperatorSummaryModal, setShowOperatorSummaryModal] = useState<boolean>(false);
  const [isSendingTelegramSummary, setIsSendingTelegramSummary] = useState<boolean>(false);
  const [summaryTargetDate, setSummaryTargetDate] = useState<string>(() => getTodayDateStringPhnomPenh());
  const [auto6PMSentToday, setAuto6PMSentToday] = useState<boolean>(() => {
    try {
      const today = getTodayDateStringPhnomPenh();
      return localStorage.getItem('accounting_distribution_summary_sent_date') === today;
    } catch {
      return false;
    }
  });

  // Google Sheets & PostgreSQL Backup Action States
  const [isSyncingSheets, setIsSyncingSheets] = useState<boolean>(false);
  const [isBackingUpPg, setIsBackingUpPg] = useState<boolean>(false);
  const [showDeployHelpModal, setShowDeployHelpModal] = useState<boolean>(false);
  const [showCodeViewerModal, setShowCodeViewerModal] = useState<boolean>(false);
  const [isCodeGsCopied, setIsCodeGsCopied] = useState<boolean>(false);

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

  // Full Page / Full Viewport State
  const STORAGE_KEY_FULL_PAGE = 'accounting_distribution_full_page_v1';
  const [isFullScreen, setIsFullScreen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FULL_PAGE);
      if (saved !== null) return saved === 'true';
    } catch {}
    return true; // Default to full page
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Toggle Full Page mode (Pure CSS viewport fill)
  const toggleFullScreen = useCallback(() => {
    setIsFullScreen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY_FULL_PAGE, String(next));
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
        try {
          localStorage.setItem(STORAGE_KEY_FULL_PAGE, 'false');
        } catch {}
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

  const notify = useCallback(
    (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
      if (onShowToast) {
        onShowToast(msg, type);
      } else {
        alert(msg);
      }
    },
    [onShowToast]
  );

  // Force Live Sync with Firebase
  const [isLiveSyncing, setIsLiveSyncing] = useState<boolean>(false);
  const handleForceSyncLive = async () => {
    if (isLiveSyncing) return;
    setIsLiveSyncing(true);
    try {
      const res = await forceSyncDistributionReports();
      if (res.success) {
        notify(`✓ បាន Sync ទិន្នន័យ (${res.total} របាយការណ៍) ជាមួយ Cloud Firebase រួចរាល់!`, 'success');
      } else {
        notify('⚠️ បរាជ័យក្នុងការ Sync ជាមួយ Firebase សូមពិនិត្យមើល Internet', 'error');
      }
    } catch (e: any) {
      notify('កំហុស Sync Firebase៖ ' + (e?.message || e), 'error');
    } finally {
      setIsLiveSyncing(false);
    }
  };

  // Calculate Operator Transaction Counts & Share (EMAIL អ្នកធ្វើប្រតិបត្តិការ)
  const { summaries: operatorStats, totalToday: operatorTotalToday, totalAll: operatorTotalAll } = useMemo(() => {
    return getOperatorDistributionStats(scopedReports, summaryTargetDate);
  }, [scopedReports, summaryTargetDate]);

  // Selected operator stats for compact badge
  const selectedOperatorStat = useMemo(() => {
    if (operatorFilter === 'ALL') return null;
    return operatorStats.find(
      (op) => (op.operatorEmail || op.operatorName) === operatorFilter
    ) || null;
  }, [operatorStats, operatorFilter]);

  // Automated 6:00 PM (18:00 ICT) Trigger Check (Runs every 45s while app is open for Admin only)
  useEffect(() => {
    if (!isAdmin) return;
    const checkSchedule = async () => {
      try {
        const res = await checkAndAutoSendDaily6PMSummary(reports, settings);
        if (res.triggered) {
          setAuto6PMSentToday(true);
          notify(res.message || '✓ បានផ្ញើសរុបប្រតិបត្តិការប្រចាំថ្ងៃម៉ោង ៦ ល្ងាច ទៅ Telegram រួចរាល់!', 'success');
        }
      } catch (e) {
        console.debug('Auto 6 PM schedule check:', e);
      }
    };

    checkSchedule();
    const interval = setInterval(checkSchedule, 45000);
    return () => clearInterval(interval);
  }, [reports, settings, notify, isAdmin]);

  // Manual Trigger: Send Operator Summary to Telegram Now (Admin Only)
  const handleSendTelegramSummaryNow = async (customDate?: string) => {
    if (!isAdmin) {
      notify('⚠️ សិទ្ធិត្រូវបានកំណត់៖ មានតែ Admin ទើបអាចផ្ញើសរុបទៅ Telegram បាន!', 'error');
      return;
    }
    setIsSendingTelegramSummary(true);
    try {
      const dateToSend = customDate || summaryTargetDate;
      const res = await triggerManualDistributionSummary(reports, settings, dateToSend);
      if (res.success) {
        setAuto6PMSentToday(true);
        notify(res.message, 'success');
      } else {
        notify(res.message, 'error');
      }
    } catch (err: any) {
      notify('កំហុសពេលផ្ញើសរុបទៅ Telegram៖ ' + (err?.message || err), 'error');
    } finally {
      setIsSendingTelegramSummary(false);
    }
  };

  // Lookup barcode details in cached Data Report rows
  const matchedDataReportRow = useMemo(() => {
    if (!barcode.trim() || !cachedSheetRows.length) return null;
    const clean = sanitizeTrackingCode(barcode).toUpperCase();
    return cachedSheetRows.find((row) => {
      return Object.values(row).some((val) => {
        if (!val) return false;
        return String(val).trim().toUpperCase() === clean;
      });
    }) || null;
  }, [barcode, cachedSheetRows]);

  // Extract display info from matched row
  const matchedInfo = useMemo(() => {
    if (!matchedDataReportRow) return null;
    const extract = (keys: string[]) => {
      for (const k of Object.keys(matchedDataReportRow)) {
        if (keys.some((cand) => k.toLowerCase().includes(cand))) {
          const val = matchedDataReportRow[k];
          if (val) return String(val).trim();
        }
      }
      return '';
    };

    return {
      shipper: extract(['shipper', 'អ្នកផ្ញើ']),
      consignee: extract(['consignee', 'អ្នកទទួល']),
      destination: extract(['destination', 'dest', 'ទិសដៅ']),
      status: extract(['status', 'ស្ថានភាព']),
      description: extract(['description', 'desc', 'ទំនិញ'])
    };
  }, [matchedDataReportRow]);

  // Check if matched row has status === 'DELIVERED'
  const isMatchedRowDelivered = useMemo(() => {
    if (!matchedDataReportRow) return false;
    return Object.values(matchedDataReportRow).some(
      (v) => String(v || '').trim().toUpperCase() === 'DELIVERED'
    );
  }, [matchedDataReportRow]);

  // Duplicate Barcode check
  const duplicateReport = useMemo(() => {
    if (!barcode.trim()) return null;
    const clean = sanitizeTrackingCode(barcode).toUpperCase();

    if (editingId) {
      const currentItem = reports.find((r) => r.id === editingId);
      const originalBarcode = currentItem ? sanitizeTrackingCode(currentItem.barcode).toUpperCase() : '';
      if (clean === originalBarcode) {
        return null;
      }
      return reports.find((r) => r.id !== editingId && sanitizeTrackingCode(r.barcode).toUpperCase() === clean) || null;
    }

    return reports.find((r) => sanitizeTrackingCode(r.barcode).toUpperCase() === clean) || null;
  }, [barcode, reports, editingId]);

  // Handlers for Form
  const handleOpenNewForm = () => {
    setEditingId(null);
    setBarcode('');
    setName('');
    setDate(new Date().toISOString().slice(0, 10));
    setFormError(null);
    setIsFormOpen(true);
    setTimeout(() => {
      formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      barcodeInputRef.current?.focus();
    }, 150);
  };

  const handleEdit = (item: DistributionReportItem) => {
    if (!canEdit) {
      notify('⚠️ សិទ្ធិត្រូវបានកំណត់៖ គណនីរបស់អ្នកគ្មានសិទ្ធិកែប្រែរបាយការណ៍ឡើយ!', 'error');
      return;
    }
    if (!canViewAll && !isOwnRecord(item)) {
      notify('⚠️ សិទ្ធិត្រូវបានកំណត់៖ លោកអ្នកអាចកែប្រែបានតែទិន្នន័យដែលខ្លួនឯងបានបញ្ចូលប៉ុណ្ណោះ!', 'error');
      return;
    }
    setEditingId(item.id);
    setBarcode(item.barcode);
    setName(item.name || '');
    setDate(item.date);
    setFormError(null);
    setIsFormOpen(true);
    setTimeout(() => {
      formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      barcodeInputRef.current?.focus();
    }, 150);
  };

  const handleResetForm = () => {
    setEditingId(null);
    setBarcode('');
    setName('');
    setFormError(null);
    setIsFormOpen(false);
  };

  const handleSubmit = async () => {
    const cleanBarcode = sanitizeTrackingCode(barcode).toUpperCase();
    if (!cleanBarcode) {
      setFormError('សូមបញ្ចូល ឬ Scan លេខបាកូដ (Barcode)!');
      barcodeInputRef.current?.focus();
      return;
    }

    if (editingId && !canEdit) {
      setFormError('⚠️ សិទ្ធិត្រូវបានកំណត់៖ គណនីរបស់អ្នកគ្មានសិទ្ធិកែប្រែរបាយការណ៍ឡើយ!');
      return;
    }

    if (!editingId && !canCreate) {
      setFormError('⚠️ សិទ្ធិត្រូវបានកំណត់៖ គណនីរបស់អ្នកគ្មានសិទ្ធិបញ្ចូលរបាយការណ៍ថ្មីឡើយ!');
      return;
    }

    if (isMatchedRowDelivered && !editingId) {
      setFormError(
        `⚠️ កញ្ចប់លេខ «${cleanBarcode}» នេះមានស្ថានភាព «DELIVERED» (បានប្រគល់រួចរាល់) ក្នុងប្រព័ន្ធ Data Report — មិនអនុញ្ញាតឱ្យបញ្ចូលរបាយការណ៍ចែកចាយម្ដងទៀតឡើយ!`
      );
      barcodeInputRef.current?.focus();
      return;
    }

    // Note: If duplicate barcode exists, we inform the user via the banner, but allow saving additional dispatches/entries


    if (!name.trim()) {
      setFormError('សូមបញ្ចូលឈ្មោះអ្នកដឹក ឬអ្នកទទួល (Name)!');
      return;
    }
    if (!date) {
      setFormError('សូមជ្រើសរើសកាលបរិច្ឆេទ (Date)!');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const saved = await saveDistributionReport({
        id: editingId || undefined,
        barcode: cleanBarcode,
        name: name.trim(),
        date,
        remarks: '',
        createdBy: currentUser?.name || currentUser?.email || 'User',
        operatorEmail: currentUser?.email || '',
        webAppUrl: settings?.webAppUrl
      } as any);

      setReports((prev) => {
        const idx = prev.findIndex((p) => p.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [saved, ...prev];
      });

      notify(
        editingId ? '✓ បានកែប្រែរបាយការណ៍ចែកចាយជោគជ័យ!' : '✓ បានកត់ត្រារបាយការណ៍ចែកចាយជោគជ័យ!',
        'success'
      );

      handleResetForm();
    } catch (e: any) {
      setFormError('មានបញ្ហាក្នុងការរក្សាទុក៖ ' + (e?.message || e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (item: DistributionReportItem) => {
    if (!canDelete) {
      notify('⚠️ សិទ្ធិត្រូវបានកំណត់៖ គណនីរបស់អ្នកគ្មានសិទ្ធិលុបរបាយការណ៍ឡើយ!', 'error');
      return;
    }
    if (!canViewAll && !isOwnRecord(item)) {
      notify('⚠️ សិទ្ធិត្រូវបានកំណត់៖ លោកអ្នកអាចលុបបានតែទិន្នន័យដែលខ្លួនឯងបានបញ្ចូលប៉ុណ្ណោះ!', 'error');
      return;
    }
    setItemToDelete(item);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    if (!canDelete) {
      notify('⚠️ សិទ្ធិត្រូវបានកំណត់៖ គណនីរបស់អ្នកគ្មានសិទ្ធិលុបរបាយការណ៍ឡើយ!', 'error');
      return;
    }
    setIsDeleting(true);
    try {
      await deleteDistributionReport(itemToDelete.id, itemToDelete.barcode, settings?.webAppUrl);
      setReports((prev) => prev.filter((r) => r.id !== itemToDelete.id));
      notify(`✓ បានលុបរបាយការណ៍ Barcode «${itemToDelete.barcode}» ជោគជ័យ!`, 'info');
      if (editingId === itemToDelete.id) {
        handleResetForm();
      }
      setItemToDelete(null);
    } catch (err: any) {
      notify('កំហុសពេលលុប៖ ' + (err?.message || err), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Sync all distribution reports to Google Sheets Tab «Distribution_Reports»
  const handleSyncGoogleSheets = async () => {
    if (isSyncingSheets) return;
    setIsSyncingSheets(true);
    try {
      const res = await syncAllDistributionReportsToGoogleSheets(reports, settings?.webAppUrl);
      if (res.success) {
        notify(`✓ បានបញ្ជូនទិន្នន័យ (${res.count} របាយការណ៍) ទៅ Google Sheets Tab «Distribution_Reports» ជោគជ័យ!`, 'success');
      } else {
        if (res.needsNewDeploy || res.error?.includes('Unknown action') || res.error?.includes('sync_distribution_reports')) {
          setShowDeployHelpModal(true);
        }
        notify(`បរាជ័យក្នុងការបញ្ជូនទៅ Google Sheets៖ ${res.error || 'Unknown error'}`, 'error');
      }
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      if (errMsg.includes('Unknown action') || errMsg.includes('sync_distribution_reports')) {
        setShowDeployHelpModal(true);
      }
      notify(`កំហុសក្នុងការបញ្ជូន៖ ${errMsg}`, 'error');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Run Local PostgreSQL Backup
  const handleBackupPostgres = async () => {
    if (isBackingUpPg) return;
    setIsBackingUpPg(true);
    try {
      const res = await fetch('/api/backup-postgres', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success') {
        notify('✓ បាន Backup ចូល PostgreSQL ជោគជ័យ! (រួមទាំង Distribution Reports)', 'success');
      } else {
        notify(`បរាជ័យក្នុងការ Backup PostgreSQL៖ ${data.message || 'សូមពិនិត្យមើលសេវា PostgreSQL'}`, 'error');
      }
    } catch (e: any) {
      notify(`កំហុសក្នុងការ Backup៖ ${e?.message || 'Server API Error'}`, 'error');
    } finally {
      setIsBackingUpPg(false);
    }
  };

  const handleCopyBarcode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
    notify(`✓ បានចម្លង ${code}`, 'success');
  };

  // Distinct Operators for Filter Dropdown (scoped by Data Scope)
  const uniqueOperators = useMemo(() => {
    const set = new Set<string>();
    scopedReports.forEach((r) => {
      const email = r.operatorEmail || (r.createdBy?.includes('@') ? r.createdBy : null);
      if (email) set.add(email);
    });
    return Array.from(set);
  }, [scopedReports]);

  // Filtered & Sorted Reports (scoped by Data Scope)
  const filteredReports = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const thisMonthPrefix = todayStr.slice(0, 7);

    let list = scopedReports.filter((item) => {
      // 1. Date Filter
      if (dateFilter === 'TODAY' && item.date !== todayStr) return false;
      if (dateFilter === 'YESTERDAY' && item.date !== yesterdayStr) return false;
      if (dateFilter === 'THIS_MONTH' && !item.date?.startsWith(thisMonthPrefix)) return false;

      // 2. Operator Filter
      if (operatorFilter !== 'ALL') {
        const itemEmail = item.operatorEmail || (item.createdBy?.includes('@') ? item.createdBy : '');
        if (itemEmail !== operatorFilter) return false;
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          (item.barcode || '').toLowerCase().includes(q) ||
          (item.name || '').toLowerCase().includes(q) ||
          (item.date || '').toLowerCase().includes(q) ||
          (item.operatorEmail || item.createdBy || '').toLowerCase().includes(q) ||
          (item.createdAt || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });

    // Sorting
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
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      return 0;
    });

    return list;
  }, [scopedReports, searchQuery, dateFilter, operatorFilter, sortBy]);

  // Statistics (scoped by Data Scope)
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = useMemo(() => {
    return scopedReports.filter((r) => r.date === todayStr).length;
  }, [scopedReports, todayStr]);

  const filterCounts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const yDate = new Date();
    yDate.setDate(yDate.getDate() - 1);
    const yesterday = yDate.toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);

    return {
      all: scopedReports.length,
      today: scopedReports.filter((r) => r.date === today).length,
      yesterday: scopedReports.filter((r) => r.date === yesterday).length,
      thisMonth: scopedReports.filter((r) => r.date && r.date.startsWith(thisMonth)).length,
    };
  }, [scopedReports]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredReports.length / pageSize) || 1;
  const paginatedReports = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredReports.slice(start, start + pageSize);
  }, [filteredReports, currentPage, pageSize]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFilter, operatorFilter, sortBy, pageSize]);

  // Export CSV
  const handleExportCSV = () => {
    if (!filteredReports.length) {
      notify('មិនមានទិន្នន័យសម្រាប់ទាញយកឡើយ', 'info');
      return;
    }
    try {
      const header = ['#', 'Barcode', 'Name', 'Date', 'Operator Email', 'Created At'];
      const rowsData = filteredReports.map((r, idx) => [
        idx + 1,
        `"${(r.barcode || '').replace(/"/g, '""')}"`,
        `"${(r.name || '').replace(/"/g, '""')}"`,
        `"${(r.date || '').replace(/"/g, '""')}"`,
        `"${(r.operatorEmail || r.createdBy || '').replace(/"/g, '""')}"`,
        `"${(formatCreatedAt(r.createdAt) || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = '\uFEFF' + [header.join(','), ...rowsData.map((row) => row.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Distribution_Reports_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      notify('✓ បានទាញយក CSV របាយការណ៍ចែកចាយជោគជ័យ!', 'success');
    } catch {
      notify('កំហុសក្នុងការទាញយក CSV', 'error');
    }
  };

  return (
    <div
      ref={containerRef}
      className={`w-full transition-all space-y-2.5 sm:space-y-3 ${
        isFullScreen
          ? 'fixed inset-0 z-50 bg-slate-50 dark:bg-[#080d1a] p-2.5 sm:p-4 overflow-y-auto w-screen h-screen'
          : 'pb-8'
      } text-slate-900 dark:text-slate-100`}
    >
      {/* Floating Exit Button in Full Page Mode */}
      {isFullScreen && (
        <div className="fixed top-2.5 right-3 z-50 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
          <button
            type="button"
            onClick={toggleFullScreen}
            className="px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold shadow-xl border border-slate-700/80 flex items-center gap-1.5 transition active:scale-95 cursor-pointer backdrop-blur-md"
            title="ចេញពី Full Page (ឬចុច Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
            <span>ចេញពី Full Page (Esc)</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🏷️ TOP HEADER BANNER (Ultra Compact & Space-Saving) */}
      {/* ========================================================================= */}
      <div className="relative overflow-hidden bg-white/90 dark:bg-[#0d1629]/90 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 rounded-xl py-2 px-3 sm:py-2.5 sm:px-3.5 shadow-2xs">
        {/* Subtle decorative background ambient glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent rounded-full blur-2xl pointer-events-none -mr-12 -mt-12" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-2 sm:gap-2.5">
          {/* Title & Description Section */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-lg bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-600 text-white flex items-center justify-center shadow-sm shadow-amber-500/20 shrink-0">
              <Truck className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white tracking-tight">
                  របាយការណ៍ចែកចាយ <span className="text-amber-500 font-bold">(Distribution Alert)</span>
                </h1>
                <button
                  type="button"
                  onClick={handleForceSyncLive}
                  disabled={isLiveSyncing}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-50 dark:bg-amber-950/70 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70 cursor-pointer transition active:scale-95 disabled:opacity-50"
                  title="ចុចដើម្បីទាញ និងរុញទិន្នន័យ Sync ជាមួយ Firebase ឡើងវិញភ្លាមៗ (Two-Way Live Sync)"
                >
                  <span className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${isLiveSyncing ? 'animate-spin' : 'animate-ping'}`} />
                  {isLiveSyncing ? <RefreshCw className="w-2.5 h-2.5 animate-spin text-amber-500" /> : <Sparkles className="w-2.5 h-2.5 text-amber-500" />}
                  <span>{isLiveSyncing ? 'កំពុង Sync...' : 'Live Sync'}</span>
                </button>
              </div>
              <p className="text-[10.5px] text-slate-400 mt-0.2 line-clamp-1">
                កត់ត្រា ស្វែងរក និងគ្រប់គ្រងរបាយការណ៍ចែកចាយតាម Barcode ពេលវេលាជាក់ស្ដែង
              </p>
            </div>
          </div>

          {/* Action Buttons Toolbar (Compact) */}
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap justify-between sm:justify-end">
            <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 scrollbar-none">
              {/* Full Screen Toggle */}
              <button
                type="button"
                onClick={toggleFullScreen}
                className="h-7.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-2xs shrink-0"
                title={isFullScreen ? 'ចេញពី Full Page (Esc)' : 'ពេញទំព័រ (Full Page)'}
              >
                {isFullScreen ? (
                  <>
                    <Minimize2 className="w-3 h-3 text-amber-500" />
                    <span>បង្រួម</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3 h-3 text-slate-500" />
                    <span>ពេញទំព័រ</span>
                  </>
                )}
              </button>

              {/* Sync to Google Sheets */}
              <button
                type="button"
                onClick={handleSyncGoogleSheets}
                disabled={isSyncingSheets}
                className="h-7.5 px-2 rounded-lg border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/80 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1 transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs shrink-0"
                title="បញ្ជូនទិន្នន័យរបាយការណ៍ចែកចាយទៅ Google Sheets"
              >
                {isSyncingSheets ? (
                  <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />
                ) : (
                  <FileSpreadsheet className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                )}
                <span>Sync Sheets</span>
              </button>

              {/* Code.gs Modal */}
              <button
                type="button"
                onClick={() => setShowDeployHelpModal(true)}
                className="h-7.5 px-2 rounded-lg border border-amber-200/80 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-2xs shrink-0"
                title="មើលកូដ Code.gs"
              >
                <Code2 className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>Code.gs</span>
              </button>

              {/* Backup PG */}
              <button
                type="button"
                onClick={handleBackupPostgres}
                disabled={isBackingUpPg}
                className="h-7.5 px-2 rounded-lg border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50/80 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold flex items-center gap-1 transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs shrink-0"
                title="Backup ចូល PostgreSQL & Supabase"
              >
                {isBackingUpPg ? (
                  <RefreshCw className="w-3 h-3 animate-spin text-indigo-600" />
                ) : (
                  <Database className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                )}
                <span>Backup PG</span>
              </button>

              {/* Export CSV */}
              <button
                type="button"
                onClick={handleExportCSV}
                disabled={filteredReports.length === 0}
                className="h-7.5 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs shrink-0"
                title="ទាញយកជាឯកសារ Excel/CSV"
              >
                <Download className="w-3 h-3 text-emerald-500" />
                <span>CSV</span>
              </button>

              {/* Operator Transaction Summary & Telegram Bot Button (Admin Only) */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowOperatorSummaryModal(true)}
                  className="h-7.5 px-2.5 rounded-lg border border-sky-200/80 dark:border-sky-800/60 bg-sky-50/80 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/50 text-sky-700 dark:text-sky-300 text-[11px] font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-2xs shrink-0"
                  title="រាប់ចំនួនប្រតិបត្តិការតាម EMAIL និងផ្ញើសរុបទៅ Telegram Bot (Admin Only)"
                >
                  <Send className="w-3 h-3 text-sky-500" />
                  <span>សរុបតាម EMAIL</span>
                  {operatorStats.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9.5px] bg-sky-500 text-white font-mono font-bold leading-none">
                      {operatorStats.length}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Primary Action Button (+ New Report) */}
            <button
              type="button"
              onClick={() => {
                if (isFormOpen) {
                  handleResetForm();
                } else {
                  handleOpenNewForm();
                }
              }}
              className="h-7.5 px-3 rounded-lg bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-700 text-white text-[11.5px] font-bold flex items-center justify-center gap-1 transition-all shadow-sm shadow-amber-500/25 active:scale-98 cursor-pointer shrink-0"
            >
              {isFormOpen ? (
                <>
                  <X className="w-3 h-3" />
                  <span>បិទ Form</span>
                </>
              ) : (
                <>
                  <Plus className="w-3 h-3" />
                  <span>+ បញ្ចូលថ្មី</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📊 SUMMARY STATS CARDS (Ultra Compact KPI Cards) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {/* Card 1: Total Reports (Scoped) */}
        <div
          onClick={() => setDateFilter('ALL')}
          className="bg-white/80 dark:bg-[#0d1629]/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 hover:border-amber-400/50 dark:hover:border-amber-500/40 rounded-xl py-1.5 px-3 shadow-2xs hover:shadow-xs transition-all duration-200 cursor-pointer group flex items-center justify-between"
          title={canViewAll ? "ចុចដើម្បីបង្ហាញរបាយការណ៍ទាំងអស់" : "ចុចដើម្បីបង្ហាញរបាយការណ៍ផ្ទាល់ខ្លួន"}
        >
          <div>
            <div className="text-[9.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {canViewAll ? 'របាយការណ៍សរុប' : 'របាយការណ៍របស់ខ្ញុំ (Mine)'}
            </div>
            <div className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-0.2 font-mono group-hover:text-amber-500 transition-colors">
              {scopedReports.length}
            </div>
          </div>
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-all">
            <ClipboardList className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Card 2: Today's Reports */}
        <div
          onClick={() => setDateFilter('TODAY')}
          className="bg-white/80 dark:bg-[#0d1629]/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 hover:border-blue-400/50 dark:hover:border-blue-500/40 rounded-xl py-1.5 px-3 shadow-2xs hover:shadow-xs transition-all duration-200 cursor-pointer group flex items-center justify-between"
          title="ចុចដើម្បីច្រោះមើលតែរបាយការណ៍ថ្ងៃនេះ"
        >
          <div>
            <div className="text-[9.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <span>ថ្ងៃនេះ</span>
              <span className="text-[9px] text-blue-500 font-mono">({todayStr.slice(5)})</span>
            </div>
            <div className="text-lg sm:text-xl font-black text-blue-600 dark:text-blue-400 mt-0.2 font-mono">
              {todayCount}
            </div>
          </div>
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-all">
            <Calendar className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Card 3: Permissions & Data Scope Status */}
        <div className="bg-white/80 dark:bg-[#0d1629]/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl py-1.5 px-3 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[9.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              កម្រិតទិន្នន័យ & សិទ្ធិ
            </div>
            <div className="text-[11px] font-bold mt-0.5 flex flex-wrap items-center gap-1">
              <span
                className={`px-1.5 py-0.2 rounded-full text-[9px] sm:text-[9.5px] font-bold flex items-center gap-1 ${
                  canViewAll
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60'
                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                }`}
              >
                {canViewAll ? '🌐 មើលទាំងអស់' : '🔒 តែរបស់ខ្លួន'}
              </span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[9px] sm:text-[9.5px] font-bold ${
                  canOperateActions
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                    : canCreate
                    ? 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {canOperateActions ? '✓ កែប្រែ/លុប' : canCreate ? '+ បញ្ចូលថ្មី' : '🔒 មើលប៉ុណ្ណោះ'}
              </span>
            </div>
          </div>
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            {canViewAll ? <ShieldCheck className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
          </div>
        </div>

        {/* Card 4: Operators Count */}
        <div
          onClick={() => {
            if (isAdmin) setShowOperatorSummaryModal(true);
          }}
          className={`bg-white/80 dark:bg-[#0d1629]/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl py-1.5 px-3 shadow-2xs transition-all duration-200 flex items-center justify-between ${
            isAdmin
              ? 'hover:border-purple-400/50 dark:hover:border-purple-500/40 hover:shadow-xs cursor-pointer group'
              : ''
          }`}
          title={isAdmin ? "ចុចដើម្បីមើលការរាប់ប្រតិបត្តិការតាម EMAIL នីមួយៗ & Telegram Bot (Admin Only)" : "ចំនួនប្រតិបត្តិករសកម្ម"}
        >
          <div>
            <div className="text-[9.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              ប្រតិបត្តិករសកម្ម
            </div>
            <div className={`text-lg sm:text-xl font-black text-purple-600 dark:text-purple-400 mt-0.2 font-mono ${isAdmin ? 'group-hover:scale-105 transition-transform' : ''}`}>
              {canViewAll ? (operatorStats.length || uniqueOperators.length) : 1}
            </div>
          </div>
          <div className={`w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 ${isAdmin ? 'group-hover:scale-105 transition-all' : ''}`}>
            <User className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 👥 OPERATOR TRANSACTION SUMMARY & 6:00 PM TELEGRAM BOT CARD (Admin Only) */}
      {/* ========================================================================= */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-amber-500/10 dark:from-sky-950/40 dark:via-indigo-950/30 dark:to-amber-950/30 border border-sky-200/80 dark:border-sky-800/60 rounded-xl p-2.5 sm:p-3 shadow-2xs backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-2 border-b border-sky-100 dark:border-sky-900/50">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-sky-500 text-white flex items-center justify-center shadow-xs shadow-sky-500/30 shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>EMAIL (អ្នកធ្វើប្រតិបត្តិការ)</span>
                    <span className="text-[10.5px] text-sky-600 dark:text-sky-400 font-bold">
                      — រាប់ចំនួនប្រតិបត្តិការ & សរុបម៉ោង ៦ ល្ងាច
                    </span>
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-400/20 text-amber-700 dark:text-amber-300 border border-amber-300/40 inline-flex items-center gap-1">
                    <ShieldCheck className="w-2.5 h-2.5 text-amber-500" />
                    Admin Only
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold ${
                      auto6PMSentToday
                        ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                        : 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                    }`}
                  >
                    <Clock className="w-2.5 h-2.5" />
                    <span>
                      {auto6PMSentToday
                        ? '✓ បានផ្ញើសរុបទៅ Telegram រួចរាល់ថ្ងៃនេះ'
                        : '⏰ ស្វ័យប្រវត្ត៖ ម៉ោង 6:00 PM រៀងរាល់ថ្ងៃ'}
                    </span>
                  </span>
                </div>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  រាប់ចំនួនប្រតិបត្តិការតាម EMAIL នីមួយៗ និងផ្ញើរបាយការណ៍សរុបចូល Telegram Bot
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
              <button
                type="button"
                onClick={() => handleSendTelegramSummaryNow()}
                disabled={isSendingTelegramSummary || reports.length === 0}
                className="h-7 px-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-xs shadow-sky-600/30 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                title="ផ្ញើរបាយការណ៍សរុបប្រតិបត្តិការថ្ងៃនេះទៅកាន់ Telegram Bot ភ្លាមៗ (Admin Only)"
              >
                {isSendingTelegramSummary ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
                <span>ផ្ញើសរុប Telegram ឥឡូវនេះ</span>
              </button>

              <button
                type="button"
                onClick={() => setShowOperatorSummaryModal(true)}
                className="h-7 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition active:scale-95 cursor-pointer shadow-2xs"
              >
                <BarChart3 className="w-3 h-3 text-sky-500" />
                <span>មើលលម្អិត & Preview</span>
              </button>
            </div>
          </div>

          {/* Compact Dropdown & Filter Bar (Space-Saving 100%) */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 pt-0.5">
            <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Dropdown Select */}
              <div className="relative flex-1 max-w-xl">
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-sky-600 dark:text-sky-400">
                  <Mail className="w-3.5 h-3.5" />
                </div>
                <select
                  value={operatorFilter}
                  onChange={(e) => setOperatorFilter(e.target.value)}
                  className="w-full h-8 pl-8 pr-8 rounded-lg border border-sky-200 dark:border-sky-800 bg-white/95 dark:bg-slate-900/95 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1.5 focus:ring-sky-500/40 focus:border-sky-500 transition cursor-pointer shadow-2xs"
                  title="ជ្រើសរើស EMAIL អ្នកធ្វើប្រតិបត្តិការ ដើម្បីច្រោះមើលទិន្នន័យ"
                >
                  <option value="ALL">
                    👥 អ្នកធ្វើប្រតិបត្តិការទាំងអស់ ({operatorStats.length} នាក់) — សរុបថ្ងៃនេះ {operatorTotalToday} ប្រតិបត្តិការ (សរុប {operatorTotalAll})
                  </option>
                  {operatorStats.map((op, idx) => {
                    const rank = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                    const targetVal = op.operatorEmail || op.operatorName;
                    return (
                      <option key={targetVal || idx} value={targetVal}>
                        {rank} {op.operatorName} ({op.operatorEmail || 'គ្មាន Email'}) — {op.todayCount} ថ្ងៃនេះ | សរុប {op.totalCount} ({op.percentage}%)
                      </option>
                    );
                  })}
                </select>
                {operatorFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setOperatorFilter('ALL')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                    title="ដោះជម្រើស (ត្រឡប់ទៅមើលទាំងអស់)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Active Operator Stat Badge OR Summary Count */}
              {selectedOperatorStat ? (
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-sky-500 text-white text-xs font-bold shadow-2xs shrink-0 animate-in fade-in">
                  <span className="text-[11px]">
                    {operatorStats.findIndex(o => (o.operatorEmail || o.operatorName) === operatorFilter) === 0 ? '🥇' :
                     operatorStats.findIndex(o => (o.operatorEmail || o.operatorName) === operatorFilter) === 1 ? '🥈' :
                     operatorStats.findIndex(o => (o.operatorEmail || o.operatorName) === operatorFilter) === 2 ? '🥉' : `#${operatorStats.findIndex(o => (o.operatorEmail || o.operatorName) === operatorFilter) + 1}`}
                  </span>
                  <span className="truncate max-w-[130px]">{selectedOperatorStat.operatorName}</span>
                  <span className="px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono">
                    {selectedOperatorStat.todayCount} ថ្ងៃនេះ ({selectedOperatorStat.percentage}%)
                  </span>
                  <button
                    type="button"
                    onClick={() => setOperatorFilter('ALL')}
                    className="p-0.5 hover:bg-white/20 rounded transition cursor-pointer text-white/80 hover:text-white"
                    title="លុប Filter ចោល"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="hidden xl:flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 font-medium shrink-0">
                  <span className="px-2 py-0.5 rounded-md bg-white/70 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800/60">
                    សរុប <strong>{operatorStats.length}</strong> នាក់
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white/70 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800/60">
                    ថ្ងៃនេះ <strong>{operatorTotalToday}</strong> ប្រតិបត្តិការ
                  </span>
                </div>
              )}
            </div>

            {/* Top 3 Quick Jump Mini Badges */}
            {operatorStats.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none self-end md:self-center shrink-0">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-0.5">Top:</span>
                {operatorStats.slice(0, 3).map((op, idx) => {
                  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
                  const target = op.operatorEmail || op.operatorName;
                  const isActive = operatorFilter === target;
                  return (
                    <button
                      key={target || idx}
                      type="button"
                      onClick={() => setOperatorFilter(isActive ? 'ALL' : target)}
                      className={`h-6.5 px-2 rounded-md text-[10.5px] font-bold flex items-center gap-1 transition cursor-pointer active:scale-95 ${
                        isActive
                          ? 'bg-sky-600 text-white shadow-2xs'
                          : 'bg-white/85 dark:bg-slate-900/85 hover:bg-sky-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-800/70'
                      }`}
                      title={`${op.operatorName} (${op.todayCount} ថ្ងៃនេះ / សរុប ${op.totalCount})`}
                    >
                      <span>{medal}</span>
                      <span className="truncate max-w-[80px]">{op.operatorName.split(' ')[0]}</span>
                      <span className="text-[9.5px] font-mono text-sky-600 dark:text-sky-400 font-bold">
                        {op.todayCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📝 COLLAPSIBLE ADD / EDIT FORM SECTION */}
      {/* ========================================================================= */}
      {isFormOpen && (
        <div
          ref={formCardRef}
          className="bg-white dark:bg-[#0d1629] border-2 border-amber-500/40 dark:border-amber-500/30 rounded-2xl p-4 sm:p-6 shadow-xl animate-in fade-in slide-in-from-top-4 duration-200"
        >
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                {editingId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {editingId ? 'កែប្រែរបាយការណ៍ចែកចាយ' : 'បញ្ចូលរបាយការណ៍ចែកចាយថ្មី'}
              </h3>
            </div>
            <button
              type="button"
              onClick={handleResetForm}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {formError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Field 1: Barcode */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Barcode className="w-3.5 h-3.5 text-amber-500" />
                  <span>BARCODE (លេខកញ្ចប់ / AWBN)</span>
                  <span className="text-red-500">*</span>
                </span>
                {matchedDataReportRow && (
                  <span className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    រកឃើញក្នុង Data
                  </span>
                )}
              </label>

              <div className="relative flex items-center gap-1.5">
                <div className="relative flex-1">
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    placeholder="e.g. E12812211249 ឬ Scan..."
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    className={`w-full px-3 py-2 rounded-xl border font-mono text-xs focus:outline-none focus:ring-2 uppercase transition ${
                      duplicateReport || (isMatchedRowDelivered && !editingId)
                        ? 'border-red-500 bg-red-50/40 dark:bg-red-950/20 text-red-900 dark:text-red-200 focus:ring-red-500'
                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-amber-500'
                    }`}
                  />
                  {barcode && (
                    <button
                      type="button"
                      onClick={() => setBarcode('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 text-xs font-bold transition shrink-0 cursor-pointer"
                  title="Scan Barcode តាមកាមេរ៉ា"
                >
                  <Camera className="w-4 h-4 text-amber-500" />
                  <span>Scan</span>
                </button>
              </div>

              {/* DELIVERED Status Warning */}
              {isMatchedRowDelivered && !editingId && (
                <div className="mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900/60 text-[11px] flex items-center gap-1.5 text-red-700 dark:text-red-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>
                    ⚠️ កញ្ចប់នេះមានស្ថានភាព <strong>DELIVERED</strong> រួចរាល់ក្នុងប្រព័ន្ធ!
                  </span>
                </div>
              )}

              {/* Duplicate Warning (Informational - allows recording additional entry) */}
              {duplicateReport && (
                <div className="mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900/60 text-[11px] flex items-center justify-between gap-1.5 text-amber-800 dark:text-amber-200 animate-in fade-in">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="truncate">
                      ⚠️ Barcode នេះធ្លាប់កត់ត្រារួចហើយ៖ <strong>{duplicateReport.name}</strong> ({duplicateReport.date}) — <em>អ្នកនៅតែអាចរក្សាទុកបន្ថែមបាន</em>
                    </span>
                  </div>
                  {canOperateActions && (
                    <button
                      type="button"
                      onClick={() => handleEdit(duplicateReport)}
                      className="px-2 py-0.5 rounded bg-amber-200/80 hover:bg-amber-300 text-amber-900 text-[10.5px] font-bold shrink-0 cursor-pointer"
                    >
                      កែប្រែចាស់
                    </button>
                  )}
                </div>
              )}

              {/* Matched row details preview */}
              {matchedInfo && (
                <div className="mt-2 p-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-[11px] space-y-0.5">
                  <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                    <span>ព័ត៌មានកញ្ចប់៖</span>
                    {matchedInfo.status && (
                      <span className="px-1.5 py-0.2 rounded-full text-[9.5px] bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-mono">
                        {matchedInfo.status}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300 text-[10.5px]">
                    {matchedInfo.consignee && <div>អ្នកទទួល: <strong>{matchedInfo.consignee}</strong></div>}
                    {matchedInfo.destination && <div>ទិសដៅ: {matchedInfo.destination}</div>}
                  </div>
                </div>
              )}
            </div>

            {/* Field 2: Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-amber-500" />
                <span>NAME (ឈ្មោះអ្នកចែកចាយ / អ្នកទទួល)</span>
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="បញ្ចូលឈ្មោះអ្នកដឹក ឬអ្នកទទួល..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
              />
              {matchedInfo?.consignee && !name && (
                <button
                  type="button"
                  onClick={() => setName(matchedInfo.consignee)}
                  className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  + ដាក់ឈ្មោះអ្នកទទួល: {matchedInfo.consignee}
                </button>
              )}
            </div>

            {/* Field 3: Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-amber-500" />
                  <span>DATE (កាលបរិច្ឆេទ)</span>
                  <span className="text-red-500">*</span>
                </span>
                <button
                  type="button"
                  onClick={() => setDate(new Date().toISOString().slice(0, 10))}
                  className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  ថ្ងៃនេះ
                </button>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleResetForm}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
            >
              បោះបង់ (Cancel)
            </button>
            <button
              type="button"
              disabled={isSubmitting || (isMatchedRowDelivered && !editingId)}
              onClick={() => handleSubmit()}
              className={`px-5 py-2 rounded-xl text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm ${
                isMatchedRowDelivered && !editingId
                  ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 cursor-pointer active:scale-98 shadow-amber-500/25'
              }`}
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : isMatchedRowDelivered && !editingId ? (
                <Lock className="w-4 h-4" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>
                {isMatchedRowDelivered && !editingId
                  ? 'មិនអនុញ្ញាត (DELIVERED រួចហើយ)'
                  : editingId
                  ? 'រក្សាទុកការកែប្រែ'
                  : 'រក្សាទុករបាយការណ៍'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🔍 SEARCH, FILTERS & VIEW MODE CONTROLS (Compact) */}
      {/* ========================================================================= */}
      <div className="bg-white/90 dark:bg-[#0d1629]/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 shadow-2xs space-y-2">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="ស្វែងរកតាម Barcode, ឈ្មោះ (Name), កាលបរិច្ឆេទ, ឬ Email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8.5 pr-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1.5 focus:ring-amber-500/30 focus:border-amber-500 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Date Filters Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 lg:pb-0 scrollbar-none">
            {[
              { id: 'ALL', label: 'ទាំងអស់', count: filterCounts.all },
              { id: 'TODAY', label: 'ថ្ងៃនេះ', count: filterCounts.today },
              { id: 'YESTERDAY', label: 'ម្សិលមិញ', count: filterCounts.yesterday },
              { id: 'THIS_MONTH', label: 'ខែនេះ', count: filterCounts.thisMonth }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDateFilter(tab.id as any)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1 active:scale-95 ${
                  dateFilter === tab.id
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-2xs shadow-amber-500/20'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[9.5px] font-mono ${
                    dateFilter === tab.id
                      ? 'bg-white/25 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Controls: Operator, Sort & View Mode Switcher */}
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap justify-between sm:justify-end">
            {/* Operator Filter Dropdown */}
            {uniqueOperators.length > 0 && (
              <div className="flex-1 sm:flex-none">
                <select
                  value={operatorFilter}
                  onChange={(e) => setOperatorFilter(e.target.value)}
                  disabled={!canViewAll}
                  className="w-full sm:w-auto h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1.5 focus:ring-amber-500 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                  title={!canViewAll ? "សិទ្ធិមើលតែរបស់ខ្លួន (Locked to Own Only)" : "ច្រោះតាមអ្នកធ្វើប្រតិបត្តិការ"}
                >
                  {canViewAll ? (
                    <>
                      <option value="ALL">គ្រប់អ្នកធ្វើ (All Operators)</option>
                      {uniqueOperators.map((email) => (
                        <option key={email} value={email}>
                          {email}
                        </option>
                      ))}
                    </>
                  ) : (
                    <option value="ALL">របស់ខ្ញុំ ({myEmail || myName})</option>
                  )}
                </select>
              </div>
            )}

            {/* Sort Selector */}
            <div className="flex-1 sm:flex-none">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full sm:w-auto h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1.5 focus:ring-amber-500 cursor-pointer"
              >
                <option value="newest">ថ្មីទៅចាស់ (Newest)</option>
                <option value="oldest">ចាស់ទៅថ្មី (Oldest)</option>
                <option value="barcode">Barcode (A-Z)</option>
                <option value="name">Name (A-Z)</option>
              </select>
            </div>

            {/* View Mode Toggle (Table vs Cards) */}
            <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-lg border border-slate-200/80 dark:border-slate-700/80 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="បង្ហាញជាតារាង (Table View)"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">តារាង</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="បង្ហាញជាកាតទូរស័ព្ទ (Cards View)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">កាត</span>
              </button>
            </div>
          </div>
        </div>

        {/* Results Info & Active Filters bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 pt-1.5 border-t border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center gap-2 flex-wrap">
            <span>រកឃើញ៖ <strong className="text-slate-900 dark:text-white font-mono">{filteredReports.length}</strong> របាយការណ៍</span>
            {(searchQuery || dateFilter !== 'ALL' || operatorFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDateFilter('ALL');
                  setOperatorFilter('ALL');
                }}
                className="text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5 cursor-pointer font-semibold ml-1"
              >
                <X className="w-3 h-3" />
                សម្អាត Filter
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <span>បង្ហាញក្នុងមួយទំព័រ:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-6 px-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[11px] font-bold focus:ring-1 focus:ring-amber-500 cursor-pointer"
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📋 CONTENT PRESENTATION: TABLE VIEW OR CARDS VIEW */}
      {/* ========================================================================= */}
      {paginatedReports.length === 0 ? (
        <div className="bg-white/90 dark:bg-[#0d1629]/90 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-8 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-2.5">
            <Truck className="w-6 h-6 opacity-75" />
          </div>
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
            មិនមានទិន្នន័យរបាយការណ៍ចែកចាយឡើយ
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            {searchQuery || dateFilter !== 'ALL'
              ? 'សូមសាកល្បងផ្លាស់ប្ដូរពាក្យស្វែងរក ឬចុច «សម្អាត Filter»'
              : 'ចុចប៊ូតុង «+ បញ្ចូលរបាយការណ៍ថ្មី» ខាងលើដើម្បីកត់ត្រាទិន្នន័យដំបូង'}
          </p>
          {!searchQuery && dateFilter === 'ALL' && (
            <button
              type="button"
              onClick={handleOpenNewForm}
              className="mt-4 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-xs shadow-md shadow-amber-500/25 transition active:scale-95 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>បញ្ចូលរបាយការណ៍ដំបូង</span>
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* ==================== 1. DESKTOP / TABLET COMPACT TABLE VIEW ==================== */
        <div className="bg-white/95 dark:bg-[#0d1629]/95 border border-slate-200/80 dark:border-slate-800/80 rounded-xl sm:rounded-2xl shadow-2xs overflow-hidden backdrop-blur-md flex flex-col">
          <div className={`overflow-auto custom-scrollbar ${isFullScreen ? 'max-h-[calc(100vh-235px)]' : 'max-h-[72vh]'}`}>
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200/80 dark:border-slate-700/80 uppercase tracking-wider text-[10.5px] sticky top-0 z-20 backdrop-blur-sm shadow-2xs">
                <tr>
                  <th className="py-2 px-2.5 w-10 text-center whitespace-nowrap">#</th>
                  <th className="py-2 px-3 min-w-[150px] whitespace-nowrap">BARCODE (លេខកញ្ចប់)</th>
                  <th className="py-2 px-3 min-w-[150px]">NAME (ឈ្មោះអ្នកចែកចាយ/ទទួល)</th>
                  <th className="py-2 px-3 min-w-[120px] whitespace-nowrap">DATE (កាលបរិច្ឆេទ)</th>
                  <th className="py-2 px-3 min-w-[170px] whitespace-nowrap">EMAIL (អ្នកធ្វើប្រតិបត្តិការ)</th>
                  <th className="py-2 px-3 min-w-[140px] whitespace-nowrap">CREATED AT</th>
                  <th className="py-2 px-2.5 w-20 text-center whitespace-nowrap">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-[#0d1629]">
                {paginatedReports.map((item, index) => {
                  const isCopied = copiedId === item.id;
                  const emailDisplay = item.operatorEmail || (item.createdBy?.includes('@') ? item.createdBy : (item.createdBy || ''));
                  const globalIndex = (currentPage - 1) * pageSize + index + 1;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-colors group"
                    >
                      <td className="py-1.5 sm:py-2 px-2.5 text-center text-slate-400 font-mono text-[10.5px] whitespace-nowrap">
                        {globalIndex}
                      </td>

                      {/* Barcode Column */}
                      <td className="py-1.5 sm:py-2 px-3 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                          <span className="font-mono font-bold text-xs tracking-wide">
                            {item.barcode}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyBarcode(item.barcode, item.id)}
                            className="p-0.5 rounded hover:bg-amber-500/20 text-slate-400 hover:text-amber-600 transition cursor-pointer"
                            title="ចម្លង Barcode"
                          >
                            {isCopied ? (
                              <Check className="w-3 h-3 text-emerald-500 animate-in zoom-in" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Name Column */}
                      <td className="py-1.5 sm:py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
                            <User className="w-3 h-3 text-amber-500" />
                          </div>
                          <span className="text-xs truncate max-w-[200px]">{item.name || '—'}</span>
                        </div>
                      </td>

                      {/* Date Column */}
                      <td className="py-1.5 sm:py-2 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] whitespace-nowrap bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{item.date}</span>
                        </span>
                      </td>

                      {/* Operator Email Column */}
                      <td className="py-1.5 sm:py-2 px-3">
                        {emailDisplay ? (
                          <div
                            className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-mono text-[11px] max-w-[200px] truncate"
                            title={emailDisplay}
                          >
                            <Mail className="w-3 h-3 text-amber-500 shrink-0" />
                            <span className="truncate">{emailDisplay}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">—</span>
                        )}
                      </td>

                      {/* Created At Column */}
                      <td className="py-1.5 sm:py-2 px-3 whitespace-nowrap">
                        {item.createdAt ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10.5px] bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60 whitespace-nowrap">
                            <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                            <span>{formatCreatedAt(item.createdAt)}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">—</span>
                        )}
                      </td>

                      {/* Actions Column */}
                      <td className="py-1.5 sm:py-2 px-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            disabled={!canEdit || (!canViewAll && !isOwnRecord(item))}
                            className={`p-1 rounded-md transition ${
                              canEdit && (canViewAll || isOwnRecord(item))
                                ? 'text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer active:scale-95'
                                : 'text-slate-300 dark:text-slate-600 cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                            title={
                              canEdit && (canViewAll || isOwnRecord(item))
                                ? 'កែប្រែទិន្នន័យ (Edit)'
                                : 'គណនីគ្មានសិទ្ធិកែប្រែ'
                            }
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(item)}
                            disabled={!canDelete || (!canViewAll && !isOwnRecord(item))}
                            className={`p-1 rounded-md transition ${
                              canDelete && (canViewAll || isOwnRecord(item))
                                ? 'text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 cursor-pointer active:scale-95'
                                : 'text-slate-300 dark:text-slate-600 cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                            title={
                              canDelete && (canViewAll || isOwnRecord(item))
                                ? 'លុបរបាយការណ៍ (Delete)'
                                : 'គណនីគ្មានសិទ្ធិលុប'
                            }
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
          </div>

          {/* Table Footer & Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-3 sm:px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 text-xs text-slate-500">
            <div className="text-[11px]">
              <span>បង្ហាញទិន្នន័យ </span>
              <strong className="text-slate-900 dark:text-white font-mono">
                {filteredReports.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
              </strong>
              <span> ដល់ </span>
              <strong className="text-slate-900 dark:text-white font-mono">
                {Math.min(currentPage * pageSize, filteredReports.length)}
              </strong>
              <span> នៃសរុប </span>
              <strong className="text-slate-900 dark:text-white font-mono">
                {filteredReports.length}
              </strong>
              <span> របាយការណ៍</span>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-0.5 active:scale-95 shadow-2xs"
                >
                  <ChevronLeft className="w-3 h-3" />
                  <span>មុន</span>
                </button>

                <span className="px-2 py-0.5 font-mono font-bold text-slate-700 dark:text-slate-300 text-xs">
                  {currentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-0.5 active:scale-95 shadow-2xs"
                >
                  <span>បន្ទាប់</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ==================== 2. MOBILE & TABLET COMPACT CARD FEED VIEW ==================== */
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
            {paginatedReports.map((item, index) => {
              const isCopied = copiedId === item.id;
              const emailDisplay = item.operatorEmail || (item.createdBy?.includes('@') ? item.createdBy : (item.createdBy || ''));
              const globalIndex = (currentPage - 1) * pageSize + index + 1;

              return (
                <div
                  key={item.id}
                  className="relative overflow-hidden bg-white/95 dark:bg-[#0d1629]/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 hover:border-amber-400/60 dark:hover:border-amber-500/50 rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between gap-2.5 group"
                >
                  {/* Subtle top amber gradient stripe */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 opacity-90" />

                  {/* Card Header: Index + Barcode + Date */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono text-[10.5px] font-bold flex items-center justify-center shrink-0">
                        #{globalIndex}
                      </span>
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-mono font-bold text-xs tracking-wider">
                        <span>{item.barcode}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyBarcode(item.barcode, item.id)}
                          className="p-0.5 rounded hover:bg-amber-500/20 text-slate-400 hover:text-amber-600 transition cursor-pointer"
                          title="ចម្លង Barcode"
                        >
                          {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[10.5px] font-semibold shrink-0">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{item.date}</span>
                    </span>
                  </div>

                  {/* Card Body: Name */}
                  <div className="space-y-1">
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-500/10 to-orange-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          ឈ្មោះអ្នកចែកចាយ / ទទួល
                        </div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight truncate">
                          {item.name || '—'}
                        </div>
                      </div>
                    </div>

                    {/* Meta tags: Operator email & created time */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-xs">
                      {emailDisplay && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 font-mono text-[10.5px] truncate max-w-[190px]">
                          <Mail className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                          <span className="truncate">{emailDisplay}</span>
                        </span>
                      )}
                      {item.createdAt && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-800/80 text-slate-400 font-mono text-[10px]">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{formatCreatedAt(item.createdAt)}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Footer: Thumb-friendly Touch Actions */}
                  <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => handleEdit(item)}
                      disabled={!canEdit || (!canViewAll && !isOwnRecord(item))}
                      className={`h-7.5 px-3 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                        canEdit && (canViewAll || isOwnRecord(item))
                          ? 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 active:scale-95'
                          : 'opacity-40 cursor-not-allowed text-slate-400'
                      }`}
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>កែប្រែ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(item)}
                      disabled={!canDelete || (!canViewAll && !isOwnRecord(item))}
                      className={`h-7.5 px-3 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                        canDelete && (canViewAll || isOwnRecord(item))
                          ? 'bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200/60 dark:border-red-800/60 active:scale-95'
                          : 'opacity-40 cursor-not-allowed text-slate-400'
                      }`}
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>លុប</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cards View Footer Pagination */}
          <div className="bg-white/90 dark:bg-[#0d1629]/90 border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 shadow-2xs">
            <div className="text-[11px]">
              <span>បង្ហាញទិន្នន័យ </span>
              <strong className="text-slate-900 dark:text-white font-mono">
                {filteredReports.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
              </strong>
              <span> ដល់ </span>
              <strong className="text-slate-900 dark:text-white font-mono">
                {Math.min(currentPage * pageSize, filteredReports.length)}
              </strong>
              <span> នៃសរុប </span>
              <strong className="text-slate-900 dark:text-white font-mono">
                {filteredReports.length}
              </strong>
              <span> របាយការណ៍</span>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 active:scale-95 shadow-2xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>មុន</span>
                </button>

                <span className="px-3 py-1 font-mono font-bold text-slate-700 dark:text-slate-300 text-xs">
                  {currentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 active:scale-95 shadow-2xs"
                >
                  <span>បន្ទាប់</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barcode Camera Scanner Modal */}
      {isScannerOpen && (
        <React.Suspense fallback={null}>
          <BarcodeScannerModal
            isOpen={isScannerOpen}
            onClose={() => setIsScannerOpen(false)}
            onScanSuccess={(decoded) => {
              const clean = sanitizeTrackingCode(decoded).toUpperCase();
              setBarcode(clean);
              setIsScannerOpen(false);
              notify(`✓ បាន Scan Barcode: ${clean}`, 'success');
            }}
            autoCloseOnScan={true}
          />
        </React.Suspense>
      )}

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  លុបរបាយការណ៍ចែកចាយ?
                </h4>
                <p className="text-xs text-slate-500">
                  តើអ្នកប្រាកដជាចង់លុបទិន្នន័យរបាយការណ៍នេះមែនទេ?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1 font-mono">
              <div>
                <span className="text-slate-400">Barcode: </span>
                <strong className="text-amber-600 dark:text-amber-400">{itemToDelete.barcode}</strong>
              </div>
              <div>
                <span className="text-slate-400">Name: </span>
                <strong className="text-slate-800 dark:text-slate-200">{itemToDelete.name}</strong>
              </div>
              <div>
                <span className="text-slate-400">Date: </span>
                <span className="text-slate-600 dark:text-slate-300">{itemToDelete.date}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setItemToDelete(null)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
              >
                បោះបង់
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{isDeleting ? 'កំពុងលុប...' : 'លុបទិន្នន័យ'}</span>
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
                    ដោះស្រាយកំហុស «Unknown action: sync_distribution_reports»
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
                <strong>មូលហេតុ៖</strong> Google Sheets Web App របស់អ្នកកំពុងដំណើរការ Version ចាស់ (មិនទាន់មានមុខងារ sync_distribution_reports ក្នុង Apps Script ដែលបាន Deploy លើ Google Drive ទេ)។ ដើម្បីឱ្យ Google Sheets ទទួលទិន្នន័យបាន លោកអ្នកគ្រាន់តែ Copy Code.gs ទៅ Deploy Version ថ្មីតែម្ដងគត់។
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

      {/* ========================================================================= */}
      {/* 📊 OPERATOR TRANSACTION SUMMARY & TELEGRAM BOT MODAL (Admin Only) */}
      {/* ========================================================================= */}
      {isAdmin && (
        <OperatorDistributionSummaryModal
          isOpen={showOperatorSummaryModal}
          onClose={() => setShowOperatorSummaryModal(false)}
          reports={reports}
          settings={settings}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onFilterOperator={(emailOrName) => {
            setOperatorFilter(emailOrName);
          }}
          onShowToast={onShowToast}
          auto6PMSentToday={auto6PMSentToday}
        />
      )}
    </div>
  );
};
