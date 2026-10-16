import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  FileSpreadsheet,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Zap,
  Play,
  Square,
  ChevronDown,
  ChevronUp,
  Settings,
  HelpCircle,
  Calendar,
  Layers,
  Database
} from 'lucide-react';

interface PodSheetSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
  isPodAutoSync?: boolean;
  onTogglePodAutoSync?: (active: boolean) => void;
  lastSyncedPodId?: number;
  onUpdateLastSyncedPodId?: (id: number) => void;
}

export const PodSheetSyncModal: React.FC<PodSheetSyncModalProps> = ({
  isOpen,
  onClose,
  onShowToast,
  isPodAutoSync: externalIsAutoSync,
  onTogglePodAutoSync,
  lastSyncedPodId: externalLastSyncedId,
  onUpdateLastSyncedPodId
}) => {
  const [stats, setStats] = useState<{
    total_2_months: number;
    total_all_delivered: number;
    max_delivered_id?: number;
    earliest_delivery?: string;
    latest_delivery?: string;
    target_sheet_id: string;
    target_sheet_tab: string;
    target_sheet_url: string;
  } | null>(null);

  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [syncMode, setSyncMode] = useState<'new' | 'recent' | 'full'>('new');
  const [batchSize, setBatchSize] = useState<number>(1500);

  // Auto-Sync Settings
  const [isAutoSyncActive, setIsAutoSyncActive] = useState<boolean>(() => {
    if (typeof externalIsAutoSync === 'boolean') return externalIsAutoSync;
    try {
      return localStorage.getItem('ial_pod_auto_sync') === 'true';
    } catch {
      return false;
    }
  });

  const [lastSyncedId, setLastSyncedId] = useState<number>(() => {
    if (typeof externalLastSyncedId === 'number' && externalLastSyncedId > 0) return externalLastSyncedId;
    try {
      const saved = localStorage.getItem('ial_pod_last_synced_id');
      if (saved) return parseInt(saved, 10);
    } catch {}
    return 0;
  });

  const [pendingNewCount, setPendingNewCount] = useState<number | null>(null);
  const [isCheckingPending, setIsCheckingPending] = useState(false);

  // Sync external props with internal state
  useEffect(() => {
    if (typeof externalIsAutoSync === 'boolean') {
      setIsAutoSyncActive(externalIsAutoSync);
    }
  }, [externalIsAutoSync]);

  useEffect(() => {
    if (typeof externalLastSyncedId === 'number' && externalLastSyncedId > 0) {
      setLastSyncedId(externalLastSyncedId);
    }
  }, [externalLastSyncedId]);

  // Web App URL configuration
  const defaultWebAppUrl =
    (import.meta as any).env?.VITE_POD_BACKUP_WEBAPP_URL ||
    'https://script.google.com/macros/s/AKfycbz94heSc-q_UmlkOA2EcOY_7PgvdSiPgNHe0TS1EA25P7Z9AwevE5GqszwhIfMY5tBG/exec';

  const [webAppUrl, setWebAppUrl] = useState(() => {
    try {
      const saved = localStorage.getItem('ial_pod_backup_webapp_url');
      if (saved && saved.trim()) return saved.trim();
    } catch {}
    return defaultWebAppUrl;
  });

  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [urlStatus, setUrlStatus] = useState<'unchecked' | 'valid' | 'invalid'>('unchecked');
  const [urlMessage, setUrlMessage] = useState('');

  // Sync Running State
  const [isSyncing, setIsSyncing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [currentBatchText, setCurrentBatchText] = useState('');
  const [syncLogs, setSyncLogs] = useState<{ time: string; msg: string; type: 'info' | 'success' | 'error' }[]>([]);
  const abortSyncRef = useRef(false);

  // Setup Guide Accordion
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Fetch Stats when modal opens
  useEffect(() => {
    if (!isOpen) return;
    fetchStats();
  }, [isOpen]);

  const fetchStats = async () => {
    setIsLoadingStats(true);
    try {
      const res = await fetch(`/api/remote-mysql?action=pod_sync_stats&_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store' }
      });
      const data = await res.json();
      if (data.ok) {
        setStats(data);
        const maxId = Number(data.max_delivered_id) || 0;
        if ((!lastSyncedId || lastSyncedId === 0) && maxId > 0) {
          setLastSyncedId(maxId);
          try {
            localStorage.setItem('ial_pod_last_synced_id', String(maxId));
          } catch {}
          onUpdateLastSyncedPodId?.(maxId);
          checkPendingNew(maxId);
        } else if (lastSyncedId > 0) {
          checkPendingNew(lastSyncedId);
        }
      } else {
        onShowToast(data.message || 'មិនអាចទាញយកស្ថិតិ POD បានទេ', 'error');
      }
    } catch (err: any) {
      onShowToast(`កំហុសតភ្ជាប់: ${err.message}`, 'error');
    } finally {
      setIsLoadingStats(false);
    }
  };

  const checkPendingNew = async (targetId: number) => {
    if (!targetId && targetId !== 0) return;
    setIsCheckingPending(true);
    try {
      const res = await fetch(`/api/remote-mysql?action=pod_sync_new_records&since_id=${targetId}&limit=1000&_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store' }
      });
      const data = await res.json();
      if (data.ok) {
        setPendingNewCount(data.count || 0);
      }
    } catch {
      // silent
    } finally {
      setIsCheckingPending(false);
    }
  };

  const handleUpdateLastSyncedId = (newId: number) => {
    const val = Math.max(0, newId);
    setLastSyncedId(val);
    try {
      localStorage.setItem('ial_pod_last_synced_id', String(val));
    } catch {}
    onUpdateLastSyncedPodId?.(val);
    checkPendingNew(val);
  };

  const handleToggleAutoSync = () => {
    const next = !isAutoSyncActive;
    setIsAutoSyncActive(next);
    try {
      localStorage.setItem('ial_pod_auto_sync', String(next));
    } catch {}
    onTogglePodAutoSync?.(next);
    if (next) {
      onShowToast('✓ បានបើក Auto-Sync ទៅ Google Sheets (តែទិន្នន័យ Delivered ថ្មី)', 'success');
      addLog('✓ បានបើក Auto-Sync ទៅ Google Sheets ដោយស្វ័យប្រវត្តិ (Background Incremental Sync)', 'info');
    } else {
      onShowToast('បានបិទ Auto-Sync ទៅ Google Sheets', 'info');
      addLog('បានបិទ Auto-Sync ទៅ Google Sheets', 'info');
    }
  };

  const addLog = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString('km-KH');
    setSyncLogs(prev => [{ time, msg, type }, ...prev.slice(0, 50)]);
  };

  // Test Web App Connection
  const handleTestConnection = async () => {
    if (!webAppUrl || !webAppUrl.trim()) {
      setUrlStatus('invalid');
      setUrlMessage('សូមបញ្ចូល Google Apps Script Web App URL ជាមុនសិន');
      return;
    }
    setIsTestingUrl(true);
    setUrlStatus('unchecked');
    setUrlMessage('កំពុងតេស្តភ្ជាប់ទៅកាន់ Web App...');

    try {
      const testUrl = webAppUrl.trim();
      const res = await fetch(`/api/remote-mysql?action=test_pod_webapp&url=${encodeURIComponent(testUrl)}`);
      const data = await res.json();
      if (data.ok) {
        setUrlStatus('valid');
        setUrlMessage(data.message || '✓ ភ្ជាប់ទៅកាន់ Google Web App ជោគជ័យ!');
        onShowToast('✓ ភ្ជាប់ទៅកាន់ Google Web App ជោគជ័យ!', 'success');
      } else {
        setUrlStatus('invalid');
        setUrlMessage(data.message || '⚠️ ការតភ្ជាប់បរាជ័យ');
        onShowToast(data.message || 'ការតភ្ជាប់បរាជ័យ', 'error');
      }
    } catch (err: any) {
      setUrlStatus('invalid');
      setUrlMessage(`❌ ការតភ្ជាប់បរាជ័យ: ${err.message}`);
    } finally {
      setIsTestingUrl(false);
    }
  };

  // Save Web App URL
  const handleSaveWebAppUrl = (newUrl: string) => {
    setWebAppUrl(newUrl);
    try {
      localStorage.setItem('ial_pod_backup_webapp_url', newUrl.trim());
    } catch {}
  };

  // Copy Standalone Google Apps Script Code
  const handleCopyScriptCode = () => {
    const code = `/**
 * =========================================================================
 * 🚚 IAL SYSTEMS - POD DELIVERED SHIPMENTS BACKUP SYNC SCRIPT
 * =========================================================================
 * Google Spreadsheet: ialsystems_backup_pod
 * Sheet Tab: ialsystems_backup_pod
 * ID: 1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ
 * =========================================================================
 */
const POD_CONFIG = {
  SPREADSHEET_ID: '1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ',
  SHEET_NAME: 'ialsystems_backup_pod',
  TIMEZONE: 'Asia/Phnom_Penh'
};

const POD_HEADERS = [
  'ID', 'Tracking_Number', 'Sign_By', 'Delivery_On', 'Issue_By',
  'Delivery_By', 'Shipped_On', 'Status', 'COD', 'Remarks', 'Synced_At'
];

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    ok: true, status: 'online', service: 'IAL POD Backup Sync API'
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, message: 'Server busy' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(data.spreadsheetId || POD_CONFIG.SPREADSHEET_ID);
    let sheet = ss.getSheetByName(data.sheetName || POD_CONFIG.SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(data.sheetName || POD_CONFIG.SHEET_NAME);

    const isFirstBatch = data.isFirstBatch === true;
    const mode = data.mode || 'append';
    const nowStr = Utilities.formatDate(new Date(), POD_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

    if (isFirstBatch && mode === 'replace') {
      sheet.clear();
      sheet.getRange(1, 1, 1, POD_HEADERS.length).setValues([POD_HEADERS]);
      sheet.getRange(1, 1, 1, POD_HEADERS.length).setBackground('#0F172A').setFontColor('#FFFFFF').setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, POD_HEADERS.length).setValues([POD_HEADERS]);
      sheet.getRange(1, 1, 1, POD_HEADERS.length).setBackground('#0F172A').setFontColor('#FFFFFF').setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    const rows = data.rows || [];
    if (rows.length > 0) {
      const formatted = rows.map(r => [
        r.id !== undefined && r.id !== null ? String(r.id) : '',
        r.tracking_number ? String(r.tracking_number).trim() : '',
        r.sign_by ? String(r.sign_by).trim() : '',
        r.delivery_on ? String(r.delivery_on).trim() : '',
        r.issue_by ? String(r.issue_by).trim() : '',
        r.delivery_by ? String(r.delivery_by).trim() : '',
        r.shipped_on ? String(r.shipped_on).trim() : '',
        r.status ? String(r.status).trim() : 'Delivered',
        r.cod !== null && r.cod !== undefined && r.cod !== '' ? String(r.cod).trim() : '',
        r.remark ? String(r.remark).trim() : '',
        r.synced_at || nowStr
      ]);
      const startRow = sheet.getLastRow() + 1;
      const neededRows = startRow + formatted.length - 1;
      if (neededRows > sheet.getMaxRows()) {
        sheet.insertRowsAfter(sheet.getMaxRows(), neededRows - sheet.getMaxRows() + 50);
      }
      sheet.getRange(startRow, 1, formatted.length, POD_HEADERS.length).setValues(formatted);
    }

    return ContentService.createTextOutput(JSON.stringify({
      ok: true, message: '✓ Synced successfully', count: rows.length, total: sheet.getLastRow() - 1
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}`;

    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    onShowToast('✓ បានចម្លងកូដ Google Apps Script ទៅកាន់ Clipboard រួចរាល់!', 'success');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // Sync តែទិន្នន័យថ្មី (Incremental by ID)
  const handleSyncNewOnly = async () => {
    if (!webAppUrl || !webAppUrl.trim()) {
      onShowToast('សូមបញ្ចូល Google Apps Script Web App URL ជាមុនសិន', 'error');
      return;
    }

    setIsSyncing(true);
    setProgressPercent(20);
    setProcessedCount(0);
    setSyncLogs([]);

    const startId = lastSyncedId || 0;
    addLog(`⚡ កំពុងទាញយកទិន្នន័យ Delivered ថ្មីៗចាប់ពី ID > #${startId}...`, 'info');

    try {
      const res = await fetch('/api/remote-mysql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auto_sync_new_pod',
          sinceId: startId,
          webAppUrl: webAppUrl.trim(),
          spreadsheetId: stats?.target_sheet_id || '1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ',
          sheetName: stats?.target_sheet_tab || 'ialsystems_backup_pod'
        })
      });

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.message || 'កំហុសពេល Auto-Sync');
      }

      setProgressPercent(100);
      if (data.synced_count > 0) {
        const newMax = data.new_max_id;
        handleUpdateLastSyncedId(newMax);
        setProcessedCount(data.synced_count);
        addLog(`🎉 ${data.message}`, 'success');
        onShowToast(data.message, 'success');
        setPendingNewCount(0);
      } else {
        addLog(`✓ ${data.message}`, 'info');
        onShowToast(data.message, 'info');
        setPendingNewCount(0);
      }
    } catch (err: any) {
      addLog(`❌ កំហុសពេល Sync ថ្មី: ${err.message}`, 'error');
      onShowToast(`កំហុស Auto-Sync: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setProgressPercent(0), 1200);
    }
  };

  // Execute Sync Operation (Chunked with Progress Bar or Incremental)
  const handleStartSync = async () => {
    if (!webAppUrl || !webAppUrl.trim()) {
      onShowToast('សូមបញ្ចូល Google Apps Script Web App URL ជាមុនសិន', 'error');
      return;
    }

    if (syncMode === 'new') {
      await handleSyncNewOnly();
      return;
    }

    abortSyncRef.current = false;
    setIsSyncing(true);
    setProgressPercent(0);
    setProcessedCount(0);
    setSyncLogs([]);

    const startTime = Date.now();
    const effectiveLimit = batchSize || 1500;
    const targetTotal = syncMode === 'recent' ? 1000 : (stats?.total_2_months || 17500);
    setTotalToProcess(targetTotal);

    addLog(`🚀 ចាប់ផ្តើម Sync ទិន្នន័យ (របៀប: ${syncMode === 'full' ? 'Full Sync ២ ខែ' : 'Recent 1,000 កញ្ចប់'}) សរុប ${targetTotal.toLocaleString()} កញ្ចប់...`, 'info');

    let currentOffset = 0;
    let totalSynced = 0;
    let isFirst = true;

    try {
      while (currentOffset < targetTotal && !abortSyncRef.current) {
        const fetchLimit = Math.min(effectiveLimit, targetTotal - currentOffset);
        setCurrentBatchText(`កំពុងទាញយកជួរទី ${currentOffset + 1} ដល់ ${currentOffset + fetchLimit}...`);

        // 1. Fetch batch from MySQL backend
        const batchRes = await fetch(
          `/api/remote-mysql?action=pod_sync_batch&offset=${currentOffset}&limit=${fetchLimit}&months=2`
        );
        const batchData = await batchRes.json();

        if (!batchData.ok || !batchData.records || batchData.records.length === 0) {
          addLog(`✓ មិនមានទិន្នន័យបន្ថែមទេ (បានបញ្ចប់ត្រឹម ${totalSynced.toLocaleString()} ជួរ)`, 'info');
          break;
        }

        const rows = batchData.records;
        setCurrentBatchText(`កំពុងបញ្ជូន ${rows.length.toLocaleString()} ជួរទៅកាន់ Google Sheets...`);

        // 2. Post batch to Google Sheets via backend proxy or direct
        const syncRes = await fetch('/api/remote-mysql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'sync_pod_batch',
            webAppUrl: webAppUrl.trim(),
            rows,
            mode: syncMode === 'full' ? 'replace' : 'append',
            isFirstBatch: isFirst,
            spreadsheetId: stats?.target_sheet_id || '1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ',
            sheetName: stats?.target_sheet_tab || 'ialsystems_backup_pod'
          })
        });

        const syncResult = await syncRes.json();
        if (!syncResult.ok) {
          throw new Error(syncResult.data?.message || syncResult.message || 'កំហុសពេលសរសេរចូល Google Sheets');
        }

        isFirst = false;
        totalSynced += rows.length;
        currentOffset += rows.length;
        setProcessedCount(totalSynced);

        const pct = Math.min(100, Math.round((totalSynced / targetTotal) * 100));
        setProgressPercent(pct);
        addLog(`✓ Sync Batch ជោគជ័យ: +${rows.length.toLocaleString()} កញ្ចប់ (សរុប: ${totalSynced.toLocaleString()} / ${targetTotal.toLocaleString()} - ${pct}%)`, 'success');

        if (abortSyncRef.current) {
          addLog('🛑 អ្នកប្រើប្រាស់បានបញ្ឈប់ការ Sync (Aborted)', 'error');
          break;
        }

        // Small breathing delay between batches (200ms)
        await new Promise(r => setTimeout(r, 200));
      }

      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      if (!abortSyncRef.current) {
        setProgressPercent(100);
        addLog(`🎉 អបអរសាទរ! បាន Sync ទិន្នន័យ ${totalSynced.toLocaleString()} កញ្ចប់ទៅកាន់ Google Sheets ជោគជ័យក្នុងរយៈពេល ${durationSec}s!`, 'success');
        onShowToast(`🎉 បាន Sync ទិន្នន័យ ${totalSynced.toLocaleString()} កញ្ចប់ទៅកាន់ Google Sheets ជោគជ័យ!`, 'success');
      }
    } catch (err: any) {
      addLog(`❌ កំហុសពេល Sync: ${err.message}`, 'error');
      onShowToast(`កំហុស Sync: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
      setCurrentBatchText('');
    }
  };

  const handleAbortSync = () => {
    abortSyncRef.current = true;
    setIsSyncing(false);
    onShowToast('បានផ្អាកការ Sync', 'info');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                Sync ទៅកាន់ Google Sheets
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                  Status = Delivered
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                បញ្ជូនទិន្នន័យដឹកជញ្ជូន ២ ខែចុងក្រោយចូលទៅក្នុង Google Sheets ដោយស្វ័យប្រវត្តិ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSyncing}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs sm:text-sm">
          {/* 1. Target Google Sheet Info Card */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Google Sheet គោលដៅ:
                </span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {stats?.target_sheet_tab || 'ialsystems_backup_pod'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                <span>Tab: <strong className="text-emerald-600 dark:text-emerald-400">{stats?.target_sheet_tab || 'ialsystems_backup_pod'}</strong></span>
                <span>•</span>
                <span className="truncate max-w-[280px]">ID: {stats?.target_sheet_id || '1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ'}</span>
              </div>
            </div>
            <a
              href={stats?.target_sheet_url || 'https://docs.google.com/spreadsheets/d/1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ/edit?gid=0#gid=0'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs transition shadow-xs shrink-0 cursor-pointer"
            >
              <span>បើក Google Sheet</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* 2. Stats Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40">
              <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold block mb-0.5">
                Delivered (២ ខែចុងក្រោយ)
              </span>
              <span className="text-lg sm:text-xl font-bold font-mono text-emerald-800 dark:text-emerald-200">
                {isLoadingStats ? (
                  <RefreshCw className="w-4 h-4 animate-spin inline text-emerald-500" />
                ) : (
                  (stats?.total_2_months || 0).toLocaleString() + ' កញ្ចប់'
                )}
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mt-0.5">
                ទិន្នន័យនឹងត្រូវ Sync
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block mb-0.5">
                Delivered សរុបទាំងអស់
              </span>
              <span className="text-lg sm:text-xl font-bold font-mono text-slate-700 dark:text-slate-300">
                {isLoadingStats ? (
                  <RefreshCw className="w-4 h-4 animate-spin inline" />
                ) : (
                  (stats?.total_all_delivered || 0).toLocaleString() + ' កញ្ចប់'
                )}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                កាត់បន្ថយបានជាង ៨០%
              </span>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex flex-col justify-center">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block mb-0.5">
                ល្បឿន និងចំណុះ
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                ~1.7% នៃ 10M Cells
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mt-0.5">
                ✓ ស្រាល មិនគាំង Sheet
              </span>
            </div>
          </div>

          {/* 3. Sync Mode & Incremental Auto-Sync Settings */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                ជ្រើសរើសរបៀប Sync (Sync Mode)
              </label>
              {syncMode === 'new' && (
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  ⚡ ណែនាំ: លឿន & មិនស្ទះ Sheet
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Option 1: Incremental Auto-Sync (Recommended) */}
              <button
                type="button"
                onClick={() => setSyncMode('new')}
                disabled={isSyncing}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer relative ${
                  syncMode === 'new'
                    ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-100 shadow-xs ring-2 ring-emerald-500/30'
                    : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    Auto-Sync ថ្មីៗ (ណែនាំ)
                  </span>
                  {syncMode === 'new' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Sync បន្ថែមតែទំនិញ Delivered ថ្មីៗដែលទើបចូលប្រព័ន្ធ
                </p>
              </button>

              {/* Option 2: Recent 1,000 */}
              <button
                type="button"
                onClick={() => setSyncMode('recent')}
                disabled={isSyncing}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                  syncMode === 'recent'
                    ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-100 shadow-xs ring-2 ring-emerald-500/30'
                    : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    Recent 1,000
                  </span>
                  {syncMode === 'recent' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Sync បន្ថែមតែ ១,០០០ កញ្ចប់ចុងក្រោយ (១-២ វិនាទី)
                </p>
              </button>

              {/* Option 3: Full Sync 2 Months */}
              <button
                type="button"
                onClick={() => setSyncMode('full')}
                disabled={isSyncing}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                  syncMode === 'full'
                    ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-100 shadow-xs ring-2 ring-emerald-500/30'
                    : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-amber-600" />
                    Full Sync (២ ខែ)
                  </span>
                  {syncMode === 'full' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  សម្អាត និងផ្ទុកឡើងវិញទាំងអស់ {(stats?.total_2_months || 0).toLocaleString()} កញ្ចប់
                </p>
              </button>
            </div>

            {/* Incremental Auto-Sync Sub-Card (Displayed when 'new' mode is selected) */}
            {syncMode === 'new' && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-slate-50 dark:to-slate-800/50 border border-emerald-500/30 space-y-3 animate-in fade-in">
                {/* Auto-Sync Real-time Toggle */}
                <div className="flex items-center justify-between pb-2.5 border-b border-emerald-500/20">
                  <div>
                    <span className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-emerald-600" />
                      ដំណើរការ Auto-Sync ស្វ័យប្រវត្តិ (Background Push)
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      រាល់ពេលប្រព័ន្ធ Refresh វានឹងរុញទំនិញ Delivered ថ្មីៗចូល Google Sheets ភ្លាមៗ
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleAutoSync}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
                      isAutoSyncActive
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${isAutoSyncActive ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
                    <span>{isAutoSyncActive ? 'កំពុងបើក (ON)' : 'បានបិទ (OFF)'}</span>
                  </button>
                </div>

                {/* ID Tracking Configuration */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                      Sync ទិន្នន័យ Delivered ចាប់ពី ID ៖
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-bold text-slate-400">#</span>
                      <input
                        type="number"
                        value={lastSyncedId || ''}
                        onChange={(e) => handleUpdateLastSyncedId(parseInt(e.target.value || '0', 10))}
                        className="w-full px-2.5 py-1 text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200"
                        placeholder="0"
                      />
                      {stats?.max_delivered_id ? (
                        <button
                          type="button"
                          onClick={() => handleUpdateLastSyncedId(stats.max_delivered_id!)}
                          className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap cursor-pointer transition"
                          title="កំណត់ជា ID ចុងក្រោយបង្អស់"
                        >
                          យក Max ID
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                      ស្ថានភាពទិន្នន័យថ្មី (Pending New) ៖
                    </label>
                    <div className="flex items-center justify-between px-3 py-1 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-700/80">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {isCheckingPending ? (
                          <span className="flex items-center gap-1 text-slate-400">
                            <RefreshCw className="w-3 h-3 animate-spin" /> កំពុងពិនិត្យ...
                          </span>
                        ) : pendingNewCount === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> ទាន់សម័យហើយ (0 ថ្មី)
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                            <Zap className="w-3.5 h-3.5" /> {pendingNewCount} កញ្ចប់ថ្មីរង់ចាំ Sync
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => checkPendingNew(lastSyncedId)}
                        disabled={isCheckingPending}
                        className="text-[11px] text-emerald-600 hover:underline font-semibold cursor-pointer"
                      >
                        Check
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4. Google Apps Script Web App URL & Connection */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                Google Apps Script Web App URL
              </label>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingUrl || isSyncing}
                className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {isTestingUrl ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                <span>តេស្តភ្ជាប់ (Test Ping)</span>
              </button>
            </div>
            <input
              type="text"
              value={webAppUrl}
              onChange={(e) => handleSaveWebAppUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              disabled={isSyncing}
              className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 text-slate-800 dark:text-slate-200 transition"
            />
            {urlMessage && (
              <p className={`text-[11px] ${urlStatus === 'valid' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {urlMessage}
              </p>
            )}
          </div>

          {/* 5. Progress Bar & Live Status (When Syncing) */}
          {isSyncing && (
            <div className="space-y-2 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-900 dark:text-emerald-200">
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  {currentBatchText || 'កំពុងដំណើរការ Sync...'}
                </span>
                <span className="font-mono">{progressPercent}%</span>
              </div>

              {/* Progress Bar Track */}
              <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden relative">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                <span>បានបញ្ជូន: <strong>{processedCount.toLocaleString()}</strong> / {totalToProcess.toLocaleString()} ជួរ</span>
                <button
                  type="button"
                  onClick={handleAbortSync}
                  className="text-red-500 hover:text-red-600 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>បញ្ឈប់ (Stop)</span>
                </button>
              </div>
            </div>
          )}

          {/* 6. Sync Activity Console Logs */}
          {syncLogs.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                ប្រវត្តិដំណើរការ (Live Console Logs):
              </span>
              <div className="max-h-28 overflow-y-auto p-2.5 rounded-xl bg-slate-900 text-slate-300 font-mono text-[10px] space-y-1 border border-slate-800">
                {syncLogs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    <span className="text-slate-500 shrink-0">[{log.time}]</span>
                    <span className={log.type === 'success' ? 'text-emerald-400' : log.type === 'error' ? 'text-rose-400' : 'text-slate-300'}>
                      {log.msg}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 7. Setup Guide Accordion */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowSetupGuide(!showSetupGuide)}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer transition"
            >
              <span className="flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-emerald-500" />
                សេចក្តីណែនាំដំឡើង Google Apps Script ក្នុង Google Sheets (Setup Guide)
              </span>
              {showSetupGuide ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {showSetupGuide && (
              <div className="p-4 space-y-3 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs border-t border-slate-200 dark:border-slate-800">
                <ol className="list-decimal pl-4 space-y-1.5">
                  <li>
                    បើក Google Sheets: <a href="https://docs.google.com/spreadsheets/d/1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ/edit" target="_blank" rel="noreferrer" className="text-emerald-600 underline font-semibold">ialsystems_backup_pod</a>
                  </li>
                  <li>ចូលទៅ Menu <strong>Extensions (ផ្នែកបន្ថែម)</strong> &gt; <strong>Apps Script</strong></li>
                  <li>លុបកូដចាស់ទាំងអស់ រួចចុចប៊ូតុងខាងក្រោមដើម្បី <strong>Copy Code</strong> យកទៅ Paste ចូល</li>
                  <li>ចុច <strong>Deploy (ដាក់ឱ្យដំណើរការ)</strong> &gt; <strong>New deployment</strong></li>
                  <li>ជ្រើសយក <strong>Web app</strong> &gt; Execute as: <strong>Me</strong> &gt; Who has access: <strong>Anyone</strong></li>
                  <li>ចុច <strong>Deploy</strong> រួចចម្លង Web App URL មកដាក់ក្នុងប្រអប់ខាងលើ!</li>
                </ol>

                <button
                  type="button"
                  onClick={handleCopyScriptCode}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 text-white hover:bg-slate-700 font-semibold text-xs transition cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'បានចម្លងរួចរាល់!' : 'ចម្លងកូដ Google Apps Script (Copy Code)'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSyncing}
            className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium text-xs transition cursor-pointer disabled:opacity-50"
          >
            បិទ (Close)
          </button>

          <button
            type="button"
            onClick={handleStartSync}
            disabled={isSyncing || isLoadingStats}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs transition shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>កំពុង Sync ({progressPercent}%)...</span>
              </>
            ) : syncMode === 'new' ? (
              <>
                <Zap className="w-4 h-4 fill-current text-amber-300" />
                <span>Sync តែទិន្នន័យថ្មីៗឥឡូវនេះ</span>
              </>
            ) : syncMode === 'recent' ? (
              <>
                <Layers className="w-4 h-4" />
                <span>Sync ១,០០០ កញ្ចប់</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>ចាប់ផ្តើម Full Sync (២ ខែ)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
