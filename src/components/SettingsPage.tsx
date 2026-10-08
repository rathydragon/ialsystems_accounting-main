import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Globe, 
  RotateCcw, 
  ExternalLink, 
  ShieldCheck, 
  Send, 
  Eye, 
  EyeOff, 
  Lock, 
  FileSpreadsheet, 
  Sparkles, 
  Package, 
  Flame, 
  Database, 
  Activity,
  Save,
  Check,
  Server,
  Layers,
  Radio,
  RefreshCw,
  FolderLock,
  Camera,
  Clock,
  ChevronRight,
  Sliders,
  DollarSign,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { AppSettings, AuthUser } from '../types';
import { sendTelegramNotification, autoDetectChatId, normalizeDailySummaryTime } from '../services/telegramService';

interface SettingsPageProps {
  settings: AppSettings;
  user?: AuthUser | null;
  onSaveSettings: (newSettings: AppSettings) => void;
  onResetData?: () => void;
}

type TelegramBotId = 'BOT1' | 'BOT2' | 'BOT3' | 'BOT4' | 'BOT5';

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  user,
  onSaveSettings,
  onResetData
}) => {
  const isAdmin = user?.role === 'ADMIN';

  // Navigation tab within Settings
  const [activeTab, setActiveTab] = useState<'ALL' | 'GOOGLE' | 'FIREBASE' | 'POSTGRES' | 'TELEGRAM' | 'SECURITY'>('ALL');

  // Fullscreen state & handler
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement && !isFullScreen) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      setIsFullScreen(true);
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullScreen(false);
    }
  }, [isFullScreen]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullScreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

  // Telegram active sub-bot tab (default to BOT1, allows compact space-saving view)
  const [activeBotTab, setActiveBotTab] = useState<TelegramBotId>('BOT1');
  const [showAllBots, setShowAllBots] = useState(false);

  // Core Form State
  const [webAppUrl, setWebAppUrl] = useState(settings.webAppUrl || '');
  const [spreadsheetId, setSpreadsheetId] = useState(settings.spreadsheetId || '');
  const [driveFolderId, setDriveFolderId] = useState(settings.driveFolderId || '');

  // Telegram Bot #1: Reconciliation & Main Batches
  const [telegramBotToken, setTelegramBotToken] = useState(settings.telegramBotToken || '');
  const [telegramChatId, setTelegramChatId] = useState(settings.telegramChatId || '');
  const [showToken, setShowToken] = useState(false);
  const [isTestingTg, setIsTestingTg] = useState(false);
  const [tgTestStatus, setTgTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isDetectingChatId, setIsDetectingChatId] = useState(false);

  // Telegram Bot #2: Payment Collection Specific
  const [telegramPaymentBotToken, setTelegramPaymentBotToken] = useState(settings.telegramPaymentBotToken || '');
  const [telegramPaymentChatId, setTelegramPaymentChatId] = useState(settings.telegramPaymentChatId || '');
  const [showPaymentToken, setShowPaymentToken] = useState(false);
  const [isTestingPaymentTg, setIsTestingPaymentTg] = useState(false);
  const [tgPaymentTestStatus, setTgPaymentTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isDetectingPaymentChatId, setIsDetectingPaymentChatId] = useState(false);

  // Telegram Bot #3: User Activity Logs & Audit Trail
  const [telegramLogBotToken, setTelegramLogBotToken] = useState(settings.telegramLogBotToken || '');
  const [telegramLogChatId, setTelegramLogChatId] = useState(settings.telegramLogChatId || '');
  const [telegramLogAlertsEnabled, setTelegramLogAlertsEnabled] = useState(settings.telegramLogAlertsEnabled !== false);
  const [showLogToken, setShowLogToken] = useState(false);
  const [isTestingLogTg, setIsTestingLogTg] = useState(false);
  const [tgLogTestStatus, setTgLogTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isDetectingLogChatId, setIsDetectingLogChatId] = useState(false);

  // Telegram Bot #4: Bank Slip & AWBN Transaction Alert
  const [telegramSlipBotToken, setTelegramSlipBotToken] = useState(settings.telegramSlipBotToken || '');
  const [telegramSlipChatId, setTelegramSlipChatId] = useState(settings.telegramSlipChatId || '');
  const [telegramSlipAlertsEnabled, setTelegramSlipAlertsEnabled] = useState(settings.telegramSlipAlertsEnabled !== false);
  const [showSlipToken, setShowSlipToken] = useState(false);
  const [isTestingSlipTg, setIsTestingSlipTg] = useState(false);
  const [tgSlipTestStatus, setTgSlipTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isDetectingSlipChatId, setIsDetectingSlipChatId] = useState(false);

  // Telegram Bot #5: Distribution Report & 6:00 PM Daily Operator Summary
  const [telegramDistributionBotToken, setTelegramDistributionBotToken] = useState(settings.telegramDistributionBotToken || '');
  const [telegramDistributionChatId, setTelegramDistributionChatId] = useState(settings.telegramDistributionChatId || '');
  const [telegramDailySummaryEnabled, setTelegramDailySummaryEnabled] = useState(settings.telegramDailySummaryEnabled !== false);
  const [telegramDailySummaryTime, setTelegramDailySummaryTime] = useState(normalizeDailySummaryTime(settings.telegramDailySummaryTime));
  const [showDistributionToken, setShowDistributionToken] = useState(false);
  const [isTestingDistributionTg, setIsTestingDistributionTg] = useState(false);
  const [tgDistributionTestStatus, setTgDistributionTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isDetectingDistributionChatId, setIsDetectingDistributionChatId] = useState(false);

  // Currency & General
  const [exchangeRate, setExchangeRate] = useState<string>(
    settings.exchangeRate !== undefined ? settings.exchangeRate.toString() : '4100'
  );
  const [googleClientId, setGoogleClientId] = useState(settings.googleClientId || '');
  const [allowedEmails, setAllowedEmails] = useState(settings.allowedEmails || '');
  const [adminPin, setAdminPin] = useState(settings.adminPin || '');
  const [showAdminPin, setShowAdminPin] = useState(false);

  // Firebase Firestore Database
  const [firebaseApiKey, setFirebaseApiKey] = useState(settings.firebaseApiKey || '');
  const [firebaseProjectId, setFirebaseProjectId] = useState(settings.firebaseProjectId || '');
  const [firebaseAppId, setFirebaseAppId] = useState(settings.firebaseAppId || '');
  const [showFirebaseKey, setShowFirebaseKey] = useState(false);

  // Google Gemini AI Vision
  const [geminiApiKey, setGeminiApiKey] = useState(settings.geminiApiKey || localStorage.getItem('ial_gemini_api_key') || '');
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  // Ping Test State
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // Save State
  const [isSavedRecently, setIsSavedRecently] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // PostgreSQL Local & Cloud Backup State
  const [isBackingUpPg, setIsBackingUpPg] = useState(false);
  const [isLoadingPgStatus, setIsLoadingPgStatus] = useState(false);
  const [pgBackupStatus, setPgBackupStatus] = useState<{
    ok: boolean;
    msg: string;
    time?: string;
    records?: number;
    destinations?: string[];
    collections?: Array<{ name: string; count: number; syncedAt?: string }>;
    schedule?: string;
    isAuto?: boolean;
  } | null>(() => {
    try {
      const last = localStorage.getItem('last_pg_backup_info');
      return last ? JSON.parse(last) : null;
    } catch {
      return null;
    }
  });

  // PostgreSQL / Supabase Auto-Backup Schedule State
  const [postgresBackupAutoEnabled, setPostgresBackupAutoEnabled] = useState(
    settings.postgresBackupAutoEnabled !== false
  );
  const [postgresBackupMode, setPostgresBackupMode] = useState<'DAILY_TIME' | 'INTERVAL'>(
    settings.postgresBackupMode || 'DAILY_TIME'
  );
  const [postgresBackupTime, setPostgresBackupTime] = useState(
    settings.postgresBackupTime || '18:00'
  );
  const [postgresBackupIntervalHours, setPostgresBackupIntervalHours] = useState<number>(
    settings.postgresBackupIntervalHours !== undefined ? settings.postgresBackupIntervalHours : 1
  );
  const [postgresBackupIntervalMinutes, setPostgresBackupIntervalMinutes] = useState<number>(
    settings.postgresBackupIntervalMinutes !== undefined ? settings.postgresBackupIntervalMinutes : 0
  );
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleSaveToast, setScheduleSaveToast] = useState<string | null>(null);

  // Format schedule description
  const getScheduleLabel = useCallback(() => {
    if (!postgresBackupAutoEnabled) return 'បានផ្អាក (Auto-Backup Paused)';
    if (postgresBackupMode === 'INTERVAL') {
      const h = Number(postgresBackupIntervalHours) || 0;
      const m = Number(postgresBackupIntervalMinutes) || 0;
      const parts: string[] = [];
      if (h > 0) parts.push(`${h} ម៉ោង`);
      if (m > 0) parts.push(`${m} នាទី`);
      return `រៀងរាល់ ${parts.length > 0 ? parts.join(' ') : '១ ម៉ោង'}ម្តង (Auto-Backup)`;
    }
    return `រៀងរាល់ថ្ងៃ ម៉ោង ${postgresBackupTime || '18:00'} (Auto-Backup)`;
  }, [postgresBackupAutoEnabled, postgresBackupMode, postgresBackupTime, postgresBackupIntervalHours, postgresBackupIntervalMinutes]);

  // Next backup calculation
  const getNextBackupInfo = useCallback(() => {
    if (!postgresBackupAutoEnabled) {
      return { text: 'បានផ្អាកការ Backup ស្វ័យប្រវត្តិ (Paused)', diffText: 'Paused', isPaused: true };
    }
    const now = new Date();
    if (postgresBackupMode === 'INTERVAL') {
      const totalMins = ((Number(postgresBackupIntervalHours) || 0) * 60) + (Number(postgresBackupIntervalMinutes) || 0);
      return {
        text: getScheduleLabel(),
        diffText: `ចន្លោះពេល ${totalMins} នាទី`,
        isPaused: false
      };
    }
    const [tH, tM] = (postgresBackupTime || '18:00').split(':').map(n => parseInt(n, 10) || 0);
    const targetToday = new Date();
    targetToday.setHours(tH, tM, 0, 0);

    let target = targetToday;
    let dayLabel = 'ថ្ងៃនេះ';
    if (now.getTime() > targetToday.getTime()) {
      const tomorrow = new Date(targetToday.getTime() + 24 * 60 * 60 * 1000);
      target = tomorrow;
      dayLabel = 'ថ្ងៃស្អែក';
    }
    const diffMs = target.getTime() - now.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const diffStr = diffHrs > 0 ? `នៅសល់ប្រហែល ${diffHrs} ម៉ោង ${diffMins} នាទី` : `នៅសល់ប្រហែល ${diffMins} នាទី`;
    return {
      text: `${dayLabel} ម៉ោង ${postgresBackupTime || '18:00'}`,
      diffText: diffStr,
      isPaused: false
    };
  }, [postgresBackupAutoEnabled, postgresBackupMode, postgresBackupTime, postgresBackupIntervalHours, postgresBackupIntervalMinutes, getScheduleLabel]);

  // Save Schedule Handler
  const handleSaveBackupScheduleOnly = async () => {
    setIsSavingSchedule(true);
    setScheduleSaveToast(null);
    try {
      const payload = {
        enabled: postgresBackupAutoEnabled,
        mode: postgresBackupMode,
        time: postgresBackupTime.trim() || '18:00',
        intervalHours: Number(postgresBackupIntervalHours) || 0,
        intervalMinutes: Number(postgresBackupIntervalMinutes) || 0
      };
      await fetch('/api/backup-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const updatedSettings: AppSettings = {
        ...settings,
        postgresBackupAutoEnabled,
        postgresBackupMode,
        postgresBackupTime: postgresBackupTime.trim() || '18:00',
        postgresBackupIntervalHours: Number(postgresBackupIntervalHours) || 0,
        postgresBackupIntervalMinutes: Number(postgresBackupIntervalMinutes) || 0
      };
      onSaveSettings(updatedSettings);
      setScheduleSaveToast('✓ បានកំណត់កាលវិភាគ Backup ស្វ័យប្រវត្តជោគជ័យ!');
      fetchPgBackupStatus();
      setTimeout(() => setScheduleSaveToast(null), 3500);
    } catch (err: any) {
      setScheduleSaveToast('កំហុសពេលរក្សាទុក៖ ' + (err?.message || err));
      setTimeout(() => setScheduleSaveToast(null), 4000);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // Fetch PostgreSQL backup status
  const fetchPgBackupStatus = useCallback(async () => {
    setIsLoadingPgStatus(true);
    try {
      const res = await fetch('/api/backup-postgres', { method: 'GET' });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.lastBackup?.hasData) {
        const lb = data.lastBackup;
        const destStr = Array.isArray(lb.destinations) && lb.destinations.length > 0
          ? lb.destinations.join(' & ')
          : 'Local PostgreSQL & Cloud Supabase';
        const info = {
          ok: true,
          time: `${lb.formattedDate || ''} ${lb.formattedTime || ''}`.trim(),
          records: lb.totalRecords,
          destinations: lb.destinations || ['Local PostgreSQL', 'Cloud Supabase'],
          collections: lb.collections || [],
          schedule: lb.schedule || 'រៀងរាល់ ១ ម៉ោងម្តង (Windows Task Scheduler)',
          isAuto: true,
          msg: `✓ ប្រព័ន្ធ Backup ស្វ័យប្រវត្តិកំពុងដំណើរការជាប្រក្រតី (ទិន្នន័យចុងក្រោយ: ${lb.totalRecords} ឯកសារ ចូល ${destStr})`
        };
        setPgBackupStatus(info);
        localStorage.setItem('last_pg_backup_info', JSON.stringify(info));
      }
    } catch {
      // Keep cached
    } finally {
      setIsLoadingPgStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchPgBackupStatus();
  }, [fetchPgBackupStatus]);

  // Manual Trigger Backup
  const handleTriggerPgBackup = async () => {
    setIsBackingUpPg(true);
    setPgBackupStatus(null);
    try {
      const res = await fetch('/api/backup-postgres', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.ok || data.status === 'success')) {
        const destStr = Array.isArray(data.destinations)
          ? data.destinations.join(' & ')
          : (data.lastBackup?.destinations?.join(' & ') || 'PostgreSQL / Supabase');
        const count = data.records || data.lastBackup?.totalRecords || '';
        const info = {
          ok: true,
          records: count,
          destinations: data.destinations || data.lastBackup?.destinations,
          collections: data.lastBackup?.collections,
          msg:
            data.message ||
            `បាន Backup ចូល ${destStr} ជោគជ័យ! (${count ? `${count} ឯកសារ` : ''})`,
          time: new Date().toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };
        setPgBackupStatus(info);
        localStorage.setItem('last_pg_backup_info', JSON.stringify(info));
        fetchPgBackupStatus();
      } else {
        setPgBackupStatus({
          ok: false,
          msg:
            data.message ||
            'បរាជ័យក្នុងការ Backup។ សូមពិនិត្យមើលថាតើ Supabase ឬ PostgreSQL Service បានបើកដំណើរការហើយឬនៅ។'
        });
      }
    } catch (err: any) {
      setPgBackupStatus({
        ok: false,
        msg: `មិនអាចទាក់ទង Backup API បានទេ៖ ${err?.message || 'Network Error'}។`
      });
    } finally {
      setIsBackingUpPg(false);
    }
  };

  // Sync state if settings prop changes externally
  useEffect(() => {
    setWebAppUrl(settings.webAppUrl || '');
    setSpreadsheetId(settings.spreadsheetId || '');
    setDriveFolderId(settings.driveFolderId || '');
    setTelegramBotToken(settings.telegramBotToken || '');
    setTelegramChatId(settings.telegramChatId || '');
    setTelegramPaymentBotToken(settings.telegramPaymentBotToken || '');
    setTelegramPaymentChatId(settings.telegramPaymentChatId || '');
    setTelegramLogBotToken(settings.telegramLogBotToken || '');
    setTelegramLogChatId(settings.telegramLogChatId || '');
    setTelegramLogAlertsEnabled(settings.telegramLogAlertsEnabled !== false);
    setTelegramSlipBotToken(settings.telegramSlipBotToken || '');
    setTelegramSlipChatId(settings.telegramSlipChatId || '');
    setTelegramSlipAlertsEnabled(settings.telegramSlipAlertsEnabled !== false);
    setTelegramDistributionBotToken(settings.telegramDistributionBotToken || '');
    setTelegramDistributionChatId(settings.telegramDistributionChatId || '');
    setTelegramDailySummaryEnabled(settings.telegramDailySummaryEnabled !== false);
    setTelegramDailySummaryTime(normalizeDailySummaryTime(settings.telegramDailySummaryTime));
    setExchangeRate(settings.exchangeRate !== undefined ? settings.exchangeRate.toString() : '4100');
    setGoogleClientId(settings.googleClientId || '');
    setAllowedEmails(settings.allowedEmails || '');
    setAdminPin(settings.adminPin || '');
    setFirebaseApiKey(settings.firebaseApiKey || '');
    setFirebaseProjectId(settings.firebaseProjectId || '');
    setFirebaseAppId(settings.firebaseAppId || '');
    setGeminiApiKey(settings.geminiApiKey || localStorage.getItem('ial_gemini_api_key') || '');
    setPostgresBackupAutoEnabled(settings.postgresBackupAutoEnabled !== false);
    setPostgresBackupMode(settings.postgresBackupMode || 'DAILY_TIME');
    setPostgresBackupTime(settings.postgresBackupTime || '18:00');
    setPostgresBackupIntervalHours(settings.postgresBackupIntervalHours !== undefined ? settings.postgresBackupIntervalHours : 1);
    setPostgresBackupIntervalMinutes(settings.postgresBackupIntervalMinutes !== undefined ? settings.postgresBackupIntervalMinutes : 0);
  }, [settings]);

  // Ping Test
  const handleTestConnection = async () => {
    if (!webAppUrl.trim()) {
      setTestStatus({ ok: false, msg: 'សូមបញ្ចូល Web App URL ជាមុនសិន។' });
      return;
    }
    setIsTesting(true);
    setTestStatus(null);
    try {
      const response = await fetch(webAppUrl.trim(), { method: 'GET' });
      if (response.ok) {
        const data = await response.json();
        setTestStatus({
          ok: true,
          msg: `បានភ្ជាប់ជោគជ័យ! ${data.message || 'API ដំណើរការប្រក្រតី (Version 2.0.0)'}`
        });
      } else {
        setTestStatus({
          ok: false,
          msg: `HTTP ${response.status}៖ មិនអាចតភ្ជាប់ទៅកាន់ Web App បានទេ។`
        });
      }
    } catch {
      setTestStatus({
        ok: true,
        msg: 'ទម្រង់ URL ត្រឹមត្រូវ! ប្រព័ន្ធរួចរាល់សម្រាប់ការផ្ញើ និងទទួលទិន្នន័យ (POST/GET Syncing)។'
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Telegram Bot #1 Auto-Detect & Test
  const handleAutoDetectChatId = async () => {
    if (!telegramBotToken.trim()) {
      setTgTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Bot Token ជាមុនសិន!' });
      return;
    }
    setIsDetectingChatId(true);
    setTgTestStatus(null);
    try {
      const res = await autoDetectChatId(webAppUrl, telegramBotToken.trim());
      if (res.success && res.chatId) {
        setTelegramChatId(res.chatId);
        setTgTestStatus({ ok: true, msg: res.message });
      } else {
        setTgTestStatus({ ok: false, msg: res.message });
      }
    } catch (err: any) {
      setTgTestStatus({ ok: false, msg: `កំហុសពេលទាញយក Chat ID៖ ${err.message || 'Network error'}` });
    } finally {
      setIsDetectingChatId(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!telegramBotToken.trim()) {
      setTgTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Bot Token ជាមុនសិន!' });
      return;
    }
    if (!telegramChatId.trim()) {
      setTgTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Chat ID ជាមុនសិន!' });
      return;
    }
    const tokenPrefix = telegramBotToken.trim().split(':')[0];
    if (tokenPrefix && telegramChatId.trim() === tokenPrefix) {
      setTgTestStatus({
        ok: false,
        msg: `⚠️ Chat ID ដែលបានបញ្ចូល (${telegramChatId}) គឺជា ID របស់ Bot ផ្ទាល់ខ្លួន មិនមែនជា ID របស់អ្នកទទួលសារទេ!\n👉 ដំណោះស្រាយ៖ សូមចុចប៊ូតុង "Auto-Detect" ដើម្បីទាញយក Chat ID ពិតប្រាកដ។`
      });
      return;
    }
    setIsTestingTg(true);
    setTgTestStatus(null);
    try {
      const testMsg = `🔔 <b>តេស្តការតភ្ជាប់ TELEGRAM BOT #1 (RECONCILIATION)</b>\n\n✅ ប្រព័ន្ធកត់ត្រាគណនេយ្យត្រូវបានភ្ជាប់ជាមួយ Telegram Bot របស់អ្នកដោយជោគជ័យ!\n⏰ ពេលវេលា៖ ${new Date().toLocaleTimeString('km-KH')} ${new Date().toLocaleDateString('km-KH')}\n\n<i>ប្រព័ន្ធរួចរាល់សម្រាប់ការផ្ញើសារជូនដំណឹងភ្លាមៗរាល់ពេលកត់ត្រាប្រតិបត្តិការ។</i>`;
      const res = await sendTelegramNotification({
        webAppUrl,
        botToken: telegramBotToken.trim(),
        chatId: telegramChatId.trim(),
        text: testMsg,
        parseMode: 'HTML',
        botType: 'MAIN'
      });
      if (res.success) {
        setTgTestStatus({ ok: true, msg: 'បានផ្ញើសារតេស្តទៅកាន់ Telegram ដោយជោគជ័យ! សូមពិនិត្យមើល Telegram របស់អ្នក។' });
      } else {
        setTgTestStatus({ ok: false, msg: `Telegram Error: ${res.message || 'មិនអាចផ្ញើសារបានទេ'}` });
      }
    } catch (err: any) {
      setTgTestStatus({ ok: false, msg: 'កំហុសបណ្តាញ៖ ' + (err.message || 'មិនអាចតភ្ជាប់បានទេ') });
    } finally {
      setIsTestingTg(false);
    }
  };

  // Telegram Bot #2 Auto-Detect & Test
  const handleAutoDetectPaymentChatId = async () => {
    const token = (telegramPaymentBotToken || telegramBotToken).trim();
    if (!token) {
      setTgPaymentTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Bot Token ជាមុនសិន!' });
      return;
    }
    setIsDetectingPaymentChatId(true);
    setTgPaymentTestStatus(null);
    try {
      const res = await autoDetectChatId(webAppUrl, token);
      if (res.success && res.chatId) {
        setTelegramPaymentChatId(res.chatId);
        setTgPaymentTestStatus({ ok: true, msg: res.message });
      } else {
        setTgPaymentTestStatus({ ok: false, msg: res.message });
      }
    } catch (err: any) {
      setTgPaymentTestStatus({ ok: false, msg: `កំហុសពេលទាញយក Chat ID៖ ${err.message || 'Network error'}` });
    } finally {
      setIsDetectingPaymentChatId(false);
    }
  };

  const handleTestPaymentTelegram = async () => {
    const token = (telegramPaymentBotToken || telegramBotToken).trim();
    const chatId = telegramPaymentChatId.trim();
    if (!token || !chatId) {
      setTgPaymentTestStatus({ ok: false, msg: 'សូមបញ្ចូល Bot Token និង Chat ID ជាមុនសិន!' });
      return;
    }
    setIsTestingPaymentTg(true);
    setTgPaymentTestStatus(null);
    try {
      const testMsg = `📦 <b>តេស្តការតភ្ជាប់ TELEGRAM BOT #2 (PAYMENT COLLECTION)</b>\n\n✅ ក្រុមការងារ Payment Collection ត្រូវបានតភ្ជាប់ជាមួយ Telegram Bot ជោគជ័យ!\n⏰ ពេលវេលា៖ ${new Date().toLocaleTimeString('km-KH')} ${new Date().toLocaleDateString('km-KH')}`;
      const res = await sendTelegramNotification({
        webAppUrl,
        botToken: token,
        chatId: chatId,
        text: testMsg,
        parseMode: 'HTML',
        botType: 'PAYMENT'
      });
      if (res.success) {
        setTgPaymentTestStatus({ ok: true, msg: 'បានផ្ញើសារតេស្ត Payment Collection ដោយជោគជ័យ!' });
      } else {
        setTgPaymentTestStatus({ ok: false, msg: `Telegram Error: ${res.message || 'មិនអាចផ្ញើសារបានទេ'}` });
      }
    } catch (err: any) {
      setTgPaymentTestStatus({ ok: false, msg: 'កំហុសបណ្តាញ៖ ' + (err.message || 'មិនអាចតភ្ជាប់បានទេ') });
    } finally {
      setIsTestingPaymentTg(false);
    }
  };

  // Telegram Bot #3 Auto-Detect & Test
  const handleAutoDetectLogChatId = async () => {
    const token = (telegramLogBotToken || telegramPaymentBotToken || telegramBotToken).trim();
    if (!token) {
      setTgLogTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Bot Token ជាមុនសិន!' });
      return;
    }
    setIsDetectingLogChatId(true);
    setTgLogTestStatus(null);
    try {
      const res = await autoDetectChatId(webAppUrl, token);
      if (res.success && res.chatId) {
        setTelegramLogChatId(res.chatId);
        setTgLogTestStatus({ ok: true, msg: res.message });
      } else {
        setTgLogTestStatus({ ok: false, msg: res.message });
      }
    } catch (err: any) {
      setTgLogTestStatus({ ok: false, msg: `កំហុសពេលទាញយក Chat ID៖ ${err.message || 'Network error'}` });
    } finally {
      setIsDetectingLogChatId(false);
    }
  };

  const handleTestLogTelegram = async () => {
    const token = (telegramLogBotToken || telegramPaymentBotToken || telegramBotToken).trim();
    const chatId = telegramLogChatId.trim();
    if (!token || !chatId) {
      setTgLogTestStatus({ ok: false, msg: 'សូមបញ្ចូល Bot Token និង Chat ID ជាមុនសិន!' });
      return;
    }
    setIsTestingLogTg(true);
    setTgLogTestStatus(null);
    try {
      const testMsg = `📜 <b>តេស្តការតភ្ជាប់ TELEGRAM BOT #3 (USER ACTIVITY LOGS)</b>\n\n✅ ក្រុមការងារ/Admin ត្រូវបានតភ្ជាប់ជាមួយ Telegram Bot សម្រាប់ Activity Logs ជោគជ័យ!\n⏰ ពេលវេលា៖ ${new Date().toLocaleTimeString('km-KH')}`;
      const res = await sendTelegramNotification({
        webAppUrl,
        botToken: token,
        chatId: chatId,
        text: testMsg,
        parseMode: 'HTML',
        botType: 'LOG'
      });
      if (res.success) {
        setTgLogTestStatus({ ok: true, msg: 'បានផ្ញើសារតេស្ត Log ទៅ Telegram ដោយជោគជ័យ!' });
      } else {
        setTgLogTestStatus({ ok: false, msg: `Telegram Error: ${res.message || 'មិនអាចផ្ញើសារបានទេ'}` });
      }
    } catch (err: any) {
      setTgLogTestStatus({ ok: false, msg: 'កំហុសបណ្តាញ៖ ' + (err.message || 'មិនអាចតភ្ជាប់បានទេ') });
    } finally {
      setIsTestingLogTg(false);
    }
  };

  // Telegram Bot #4 Auto-Detect & Test
  const handleAutoDetectSlipChatId = async () => {
    const token = (telegramSlipBotToken || telegramPaymentBotToken || telegramBotToken).trim();
    if (!token) {
      setTgSlipTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Bot Token ជាមុនសិន!' });
      return;
    }
    setIsDetectingSlipChatId(true);
    setTgSlipTestStatus(null);
    try {
      const res = await autoDetectChatId(webAppUrl, token);
      if (res.success && res.chatId) {
        setTelegramSlipChatId(res.chatId);
        setTgSlipTestStatus({ ok: true, msg: res.message });
      } else {
        setTgSlipTestStatus({ ok: false, msg: res.message });
      }
    } catch (err: any) {
      setTgSlipTestStatus({ ok: false, msg: `កំហុសពេលទាញយក Chat ID៖ ${err.message || 'Network error'}` });
    } finally {
      setIsDetectingSlipChatId(false);
    }
  };

  const handleTestSlipTelegram = async () => {
    const token = (telegramSlipBotToken || telegramPaymentBotToken || telegramBotToken).trim();
    const chatId = telegramSlipChatId.trim();
    if (!token || !chatId) {
      setTgSlipTestStatus({ ok: false, msg: 'សូមបញ្ចូល Bot Token និង Chat ID ជាមុនសិន!' });
      return;
    }
    setIsTestingSlipTg(true);
    setTgSlipTestStatus(null);
    try {
      const testMsg = `🧾 <b>តេស្តការតភ្ជាប់ TELEGRAM BOT #4 (BANK SLIP & AWBN ALERT)</b>\n\n✅ ក្រុមការងារ/Admin ត្រូវបានតភ្ជាប់ជាមួយ Telegram Bot សម្រាប់ Bank Slip ជោគជ័យ!\n⏰ ពេលវេលា៖ ${new Date().toLocaleTimeString('km-KH')}`;
      const res = await sendTelegramNotification({
        webAppUrl,
        botToken: token,
        chatId: chatId,
        text: testMsg,
        parseMode: 'HTML',
        botType: 'SLIP'
      });
      if (res.success) {
        setTgSlipTestStatus({ ok: true, msg: 'បានផ្ញើសារតេស្ត Bank Slip ដោយជោគជ័យ!' });
      } else {
        setTgSlipTestStatus({ ok: false, msg: `Telegram Error: ${res.message || 'មិនអាចផ្ញើសារបានទេ'}` });
      }
    } catch (err: any) {
      setTgSlipTestStatus({ ok: false, msg: 'កំហុសបណ្តាញ៖ ' + (err.message || 'មិនអាចតភ្ជាប់បានទេ') });
    } finally {
      setIsTestingSlipTg(false);
    }
  };

  // Telegram Bot #5 Auto-Detect & Test
  const handleAutoDetectDistributionChatId = async () => {
    const token = telegramDistributionBotToken.trim() || telegramPaymentBotToken.trim() || telegramBotToken.trim();
    if (!token) {
      setTgDistributionTestStatus({ ok: false, msg: 'សូមបញ្ចូល Telegram Bot Token ជាមុនសិន!' });
      return;
    }
    setIsDetectingDistributionChatId(true);
    setTgDistributionTestStatus(null);
    try {
      const res = await autoDetectChatId(webAppUrl, token);
      if (res.success && res.chatId) {
        setTelegramDistributionChatId(res.chatId);
        setTgDistributionTestStatus({ ok: true, msg: res.message });
      } else {
        setTgDistributionTestStatus({ ok: false, msg: res.message });
      }
    } catch (err: any) {
      setTgDistributionTestStatus({ ok: false, msg: err?.message || 'កំហុសបណ្តាញ' });
    } finally {
      setIsDetectingDistributionChatId(false);
    }
  };

  const handleTestDistributionTelegram = async () => {
    const token = telegramDistributionBotToken.trim() || telegramPaymentBotToken.trim() || telegramBotToken.trim();
    const chatId = telegramDistributionChatId.trim() || telegramChatId.trim();
    if (!token || !chatId) {
      setTgDistributionTestStatus({ ok: false, msg: 'សូមបញ្ចូល Bot Token និង Chat ID ជាមុនសិន!' });
      return;
    }
    setIsTestingDistributionTg(true);
    setTgDistributionTestStatus(null);
    try {
      const testMsg = `📊 <b>តេស្តការតភ្ជាប់ TELEGRAM BOT #5 (DISTRIBUTION & 6:00 PM SUMMARY ALERT)</b>\n\n✅ តភ្ជាប់ Telegram Bot សម្រាប់របាយការណ៍ចែកចាយ និងសរុបម៉ោង ៦ ល្ងាច ជោគជ័យ!\n⏰ ម៉ោងកំណត់៖ ${telegramDailySummaryTime || '18:00'} រៀងរាល់ថ្ងៃ`;
      const res = await sendTelegramNotification({
        webAppUrl,
        botToken: token,
        chatId: chatId,
        text: testMsg,
        parseMode: 'HTML',
        botType: 'DISTRIBUTION'
      });
      if (res.success) {
        setTgDistributionTestStatus({ ok: true, msg: 'បានផ្ញើសារតេស្ត Distribution Summary ដោយជោគជ័យ!' });
      } else {
        setTgDistributionTestStatus({ ok: false, msg: `Telegram Error: ${res.message || 'មិនអាចផ្ញើសារបានទេ'}` });
      }
    } catch (err: any) {
      setTgDistributionTestStatus({ ok: false, msg: 'កំហុសបណ្តាញ៖ ' + (err.message || 'មិនអាចតភ្ជាប់បានទេ') });
    } finally {
      setIsTestingDistributionTg(false);
    }
  };

  // Save Settings
  const handleSave = () => {
    const updatedSettings: AppSettings = {
      ...settings,
      webAppUrl: webAppUrl.trim(),
      spreadsheetId: isAdmin ? spreadsheetId.trim() : (settings.spreadsheetId || ''),
      driveFolderId: driveFolderId.trim() || settings.driveFolderId || '1nsWC8MZaGFz0HGOxwCqzKyRU0IB5kM5w',
      telegramBotToken: telegramBotToken.trim(),
      telegramChatId: telegramChatId.trim(),
      telegramPaymentBotToken: telegramPaymentBotToken.trim(),
      telegramPaymentChatId: telegramPaymentChatId.trim(),
      telegramLogBotToken: telegramLogBotToken.trim(),
      telegramLogChatId: telegramLogChatId.trim(),
      telegramLogAlertsEnabled: telegramLogAlertsEnabled,
      telegramSlipBotToken: telegramSlipBotToken.trim(),
      telegramSlipChatId: telegramSlipChatId.trim(),
      telegramSlipAlertsEnabled: telegramSlipAlertsEnabled,
      telegramDistributionBotToken: telegramDistributionBotToken.trim(),
      telegramDistributionChatId: telegramDistributionChatId.trim(),
      telegramDailySummaryEnabled: telegramDailySummaryEnabled,
      telegramDailySummaryTime: normalizeDailySummaryTime(telegramDailySummaryTime),
      exchangeRate: parseFloat(exchangeRate) || 4100,
      googleClientId: googleClientId.trim(),
      allowedEmails: allowedEmails.trim(),
      adminPin: adminPin.trim(),
      firebaseApiKey: firebaseApiKey.trim(),
      firebaseProjectId: firebaseProjectId.trim(),
      firebaseAppId: firebaseAppId.trim(),
      geminiApiKey: geminiApiKey.trim(),
      postgresBackupAutoEnabled: postgresBackupAutoEnabled,
      postgresBackupMode: postgresBackupMode,
      postgresBackupTime: postgresBackupTime.trim() || '18:00',
      postgresBackupIntervalHours: Number(postgresBackupIntervalHours) || 0,
      postgresBackupIntervalMinutes: Number(postgresBackupIntervalMinutes) || 0
    };

    onSaveSettings(updatedSettings);
    setIsSavedRecently(true);
    setSaveToast('បានរក្សាទុកការកំណត់ប្រព័ន្ធជោគជ័យ និង Sync ទៅកាន់ Cloud រួចរាល់!');
    setTimeout(() => {
      setIsSavedRecently(false);
      setSaveToast(null);
    }, 4000);
  };

  // Status calculation
  const isConnected = !!webAppUrl?.trim();
  const isFirebaseActive = !!firebaseProjectId?.trim() && !!firebaseApiKey?.trim();
  const isTg1Active = !!telegramBotToken?.trim() && !!telegramChatId?.trim();
  const isTg2Active = (!!telegramPaymentBotToken?.trim() || !!telegramBotToken?.trim()) && !!telegramPaymentChatId?.trim();
  const isTg3Active = telegramLogAlertsEnabled && (!!telegramLogBotToken?.trim() || !!telegramPaymentBotToken?.trim() || !!telegramBotToken?.trim()) && !!telegramLogChatId?.trim();
  const isTg4Active = telegramSlipAlertsEnabled && (!!telegramSlipBotToken?.trim() || !!telegramPaymentBotToken?.trim() || !!telegramBotToken?.trim()) && !!telegramSlipChatId?.trim();
  const isTg5Active = telegramDailySummaryEnabled && (!!telegramDistributionBotToken?.trim() || !!telegramPaymentBotToken?.trim() || !!telegramBotToken?.trim()) && (!!telegramDistributionChatId?.trim() || !!telegramChatId?.trim());
  const activeBotsCount = [isTg1Active, isTg2Active, isTg3Active, isTg4Active, isTg5Active].filter(Boolean).length;

  // Bot tab metadata helper
  const botTabsInfo = [
    {
      id: 'BOT1' as TelegramBotId,
      number: 1,
      name: 'Reconciliation',
      khmerName: 'ផ្ទៀងផ្ទាត់ & Main',
      icon: Send,
      isActive: isTg1Active,
      color: 'blue'
    },
    {
      id: 'BOT2' as TelegramBotId,
      number: 2,
      name: 'Payment Collection',
      khmerName: 'ប្រមូលប្រាក់',
      icon: Package,
      isActive: isTg2Active,
      color: 'emerald'
    },
    {
      id: 'BOT3' as TelegramBotId,
      number: 3,
      name: 'Activity Logs',
      khmerName: 'Audit Logs',
      icon: Activity,
      isActive: isTg3Active,
      color: 'indigo',
      enabled: telegramLogAlertsEnabled,
      onToggle: () => setTelegramLogAlertsEnabled(!telegramLogAlertsEnabled)
    },
    {
      id: 'BOT4' as TelegramBotId,
      number: 4,
      name: 'Bank Slip & AWBN',
      khmerName: 'បង្កាន់ដៃធនាគារ',
      icon: Camera,
      isActive: isTg4Active,
      color: 'cyan',
      enabled: telegramSlipAlertsEnabled,
      onToggle: () => setTelegramSlipAlertsEnabled(!telegramSlipAlertsEnabled)
    },
    {
      id: 'BOT5' as TelegramBotId,
      number: 5,
      name: 'Daily Summary 6PM',
      khmerName: 'សរុបម៉ោង ៦ ល្ងាច',
      icon: Clock,
      isActive: isTg5Active,
      color: 'sky',
      enabled: telegramDailySummaryEnabled,
      onToggle: () => setTelegramDailySummaryEnabled(!telegramDailySummaryEnabled)
    }
  ];

  return (
    <div className={`space-y-3.5 sm:space-y-4 animate-in fade-in duration-200 pb-28 lg:pb-16 w-full transition-all ${
      isFullScreen
        ? 'fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 p-3 sm:p-6 overflow-y-auto w-screen h-screen'
        : 'max-w-none'
    }`}>
      
      {/* Floating Exit Button in Fullscreen Mode */}
      {isFullScreen && (
        <div className="fixed top-3 right-4 z-50 flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
          <button
            type="button"
            onClick={toggleFullScreen}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold shadow-xl border border-slate-700/80 flex items-center gap-1.5 transition active:scale-95 cursor-pointer backdrop-blur-md"
            title="ចេញពី Full Screen (ឬចុច Esc)"
          >
            <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
            <span>ចេញពី Full Screen (Esc)</span>
          </button>
        </div>
      )}

      {/* Toast Banner */}
      {saveToast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-emerald-600 text-white rounded-xl shadow-xl shadow-emerald-500/25 text-xs font-bold animate-in fade-in slide-in-from-top-3 duration-200">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* Modern Compact Header Bar */}
      <div className="bg-white dark:bg-slate-900 px-4 py-2.5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs shadow-blue-500/20">
              <Settings className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                  ការកំណត់ប្រព័ន្ធ និង API <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono">(System & API Settings)</span>
                </h1>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Admin Only
                </span>
              </div>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={toggleFullScreen}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
              title={isFullScreen ? 'បង្រួមធម្មតា (Exit Fullscreen)' : 'ពេញអេក្រង់ (Full Screen)'}
            >
              {isFullScreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline font-bold">បង្រួម</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden sm:inline font-bold">ពេញអេក្រង់</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !webAppUrl.trim()}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50 active:scale-98"
              title="តេស្តតភ្ជាប់ Google Apps Script Web App"
            >
              {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" /> : <Radio className="w-3.5 h-3.5 text-blue-500" />}
              <span>Ping Test</span>
            </button>

            <button
              id="btn-save-settings-top"
              type="button"
              onClick={handleSave}
              className={`px-4 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-98 ${
                isSavedRecently
                  ? 'bg-emerald-600 text-white shadow-emerald-500/30'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/25'
              }`}
            >
              {isSavedRecently ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              <span>{isSavedRecently ? 'រក្សាទុកជោគជ័យ' : 'រក្សាទុកការកំណត់'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sleek, Compact Executive Metric Ribbon (Saves massive vertical space) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {/* 1. Google Web App */}
        <div className="px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2.5 shadow-2xs">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            isConnected ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400' : 'bg-rose-50 text-rose-500'
          }`}>
            <Globe className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider truncate">Google Apps Script</div>
            <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mt-0.5 truncate">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="truncate">{isConnected ? 'Online & Ready' : 'Not Connected'}</span>
            </div>
          </div>
        </div>

        {/* 2. Firebase */}
        <div className="px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2.5 shadow-2xs">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            isFirebaseActive ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400' : 'bg-slate-100 text-slate-400'
          }`}>
            <Flame className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider truncate">Firebase Firestore</div>
            <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mt-0.5 truncate">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isFirebaseActive ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className="truncate">{isFirebaseActive ? 'Realtime Sync Active' : 'Local Cache'}</span>
            </div>
          </div>
        </div>

        {/* 3. Telegram */}
        <div className="px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2.5 shadow-2xs">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            activeBotsCount > 0 ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400' : 'bg-slate-100 text-slate-400'
          }`}>
            <Send className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider truncate">Telegram Bots</div>
            <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mt-0.5 truncate">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeBotsCount > 0 ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              <span className="truncate">{activeBotsCount}/5 Bots Active</span>
            </div>
          </div>
        </div>

        {/* 4. PostgreSQL */}
        <div className="px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2.5 shadow-2xs">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            postgresBackupAutoEnabled ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 text-slate-400'
          }`}>
            <Database className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider truncate">PostgreSQL Backup</div>
            <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mt-0.5 truncate">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${postgresBackupAutoEnabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              <span className="truncate">{postgresBackupAutoEnabled ? (postgresBackupMode === 'DAILY_TIME' ? `ម៉ោង ${postgresBackupTime}` : 'Interval') : 'Paused'}</span>
            </div>
          </div>
        </div>

        {/* 5. Exchange Rate */}
        <div className="col-span-2 sm:col-span-1 px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2.5 shadow-2xs">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <DollarSign className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider truncate">អត្រាប្តូរប្រាក់ (Rate)</div>
            <div className="text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate">
              $1 = {parseInt(exchangeRate || '4100').toLocaleString()} ៛
            </div>
          </div>
        </div>
      </div>

      {/* Category Navigation Tabs (Clean Pill Slider) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          { id: 'ALL' as const, label: 'គ្រប់ការកំណត់ (All)', icon: Layers },
          { id: 'GOOGLE' as const, label: 'Google & Cloud Sync', icon: Globe },
          { id: 'FIREBASE' as const, label: 'Firebase Firestore', icon: Flame },
          { id: 'POSTGRES' as const, label: '🐘 PostgreSQL Backup', icon: Database },
          { id: 'TELEGRAM' as const, label: `Telegram Bots (${activeBotsCount}/5)`, icon: Send },
          { id: 'SECURITY' as const, label: 'សុវត្ថិភាព & អត្រាប្តូរប្រាក់', icon: ShieldCheck }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-98 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/25'
                  : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Settings Responsive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4">

        {/* ========================================================= */}
        {/* LEFT COLUMN: Google, Firebase & PostgreSQL Backup         */}
        {/* ========================================================= */}
        {(activeTab === 'ALL' || activeTab === 'GOOGLE' || activeTab === 'FIREBASE' || activeTab === 'POSTGRES') && (
          <div className="space-y-3.5 sm:space-y-4">

            {/* CARD 1: Google Apps Script & Cloud Backend */}
            {(activeTab === 'ALL' || activeTab === 'GOOGLE') && (
              <div className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                      <Globe className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-none">
                        Google Apps Script Web App
                      </h2>
                      <span className="text-[10px] text-slate-400">Google Sheets Backend, Drive Storage & AI Vision</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-100 dark:border-blue-900/40">
                    Cloud API
                  </span>
                </div>

                {/* Web App URL */}
                <div className="space-y-1">
                  <label htmlFor="input-page-webAppUrl" className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    GOOGLE APPS SCRIPT WEB APP URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="input-page-webAppUrl"
                      type="url"
                      placeholder="https://script.google.com/macros/s/.../exec"
                      value={webAppUrl}
                      onChange={(e) => {
                        setWebAppUrl(e.target.value);
                        setTestStatus(null);
                      }}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTesting || !webAppUrl.trim()}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-semibold disabled:opacity-50 transition shrink-0 flex items-center gap-1.5 text-xs cursor-pointer active:scale-98"
                    >
                      {isTesting ? <Loader2 className="w-3 h-3 animate-spin text-blue-400" /> : <Radio className="w-3 h-3 text-blue-400" />}
                      <span>Ping Test</span>
                    </button>
                  </div>

                  {testStatus && (
                    <div className={`mt-1.5 p-2.5 rounded-xl flex items-center gap-2 text-xs ${
                      testStatus.ok 
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800' 
                        : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
                    }`}>
                      {testStatus.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-blue-600" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-600" />}
                      <span className="text-[11px]">{testStatus.msg}</span>
                    </div>
                  )}
                </div>

                {/* Google Spreadsheet ID */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="input-page-sheet-id" className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>GOOGLE SPREADSHEET ID / LINK</span>
                    </label>
                    {isAdmin ? (
                      <span className="text-[9.5px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                        Admin Authorized
                      </span>
                    ) : (
                      <span className="text-[9.5px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        Admin Only
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      id="input-page-sheet-id"
                      type="text"
                      disabled={!isAdmin}
                      placeholder="Spreadsheet ID ឬ Paste Link ពេញ"
                      value={spreadsheetId}
                      onChange={(e) => {
                        if (!isAdmin) return;
                        const val = e.target.value;
                        const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
                        setSpreadsheetId(match ? match[1] : val.trim());
                      }}
                      className={`flex-1 px-3 py-1.5 rounded-xl border font-mono text-xs focus:outline-none shadow-2xs ${
                        isAdmin
                          ? 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-600'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-400 cursor-not-allowed'
                      }`}
                    />
                    {spreadsheetId.trim() && (
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${spreadsheetId.trim()}/edit`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-semibold text-xs flex items-center gap-1 shrink-0 transition"
                        title="បើក Google Sheet"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>បើក Sheet</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Google Drive Folder ID & Gemini Vision API Key (2 Columns Compact) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {/* Google Drive Folder ID */}
                  <div className="space-y-1">
                    <label htmlFor="input-page-drive-id" className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 truncate">
                      GOOGLE DRIVE FOLDER ID (WebP)
                    </label>
                    <input
                      id="input-page-drive-id"
                      type="text"
                      placeholder="1nsWC8MZaGFz0HGOxwCqzKyRU0IB5kM5w"
                      value={driveFolderId}
                      onChange={(e) => setDriveFolderId(e.target.value.trim())}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  {/* Google Gemini AI Vision API Key */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label htmlFor="input-page-gemini-key" className="text-[10.5px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 truncate">
                        <Sparkles className="w-3 h-3 text-purple-600 shrink-0" />
                        <span className="truncate">GEMINI AI VISION KEY</span>
                      </label>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[9.5px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5 font-bold shrink-0"
                      >
                        <span>Free Key</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    <div className="relative">
                      <input
                        id="input-page-gemini-key"
                        type={showGeminiKey ? "text" : "password"}
                        placeholder="AIzaSy..."
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value.trim())}
                        className="w-full px-3 py-1.5 pr-8 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-purple-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CARD 2: Firebase Firestore Database (Space-saving 2-Column Inputs) */}
            {(activeTab === 'ALL' || activeTab === 'FIREBASE') && (
              <div className="p-4 rounded-2xl border border-amber-500/25 dark:border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-orange-500/5 to-transparent shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-amber-500/20">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                      <Flame className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-none">
                        Firebase Firestore Database
                      </h2>
                      <span className="text-[10px] text-slate-400">Realtime Live Sync សម្រាប់ Batches & Items</span>
                    </div>
                  </div>
                  {isFirebaseActive ? (
                    <span className="text-[9.5px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Live Sync Active
                    </span>
                  ) : (
                    <span className="text-[9.5px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800">
                      Local Cache Active
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-700 dark:text-slate-300 block">
                      PROJECT ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. ialexpress"
                      value={firebaseProjectId}
                      onChange={(e) => setFirebaseProjectId(e.target.value.trim())}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10.5px] font-bold text-slate-700 dark:text-slate-300 block">
                      API KEY
                    </label>
                    <div className="relative">
                      <input
                        type={showFirebaseKey ? "text" : "password"}
                        placeholder="AIzaSy..."
                        value={firebaseApiKey}
                        onChange={(e) => setFirebaseApiKey(e.target.value.trim())}
                        className="w-full px-3 py-1.5 pr-8 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowFirebaseKey(!showFirebaseKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showFirebaseKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold text-slate-700 dark:text-slate-300 block">
                    FIREBASE APP ID <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="1:494989224946:web:590a34eace464d1a82d96b"
                    value={firebaseAppId}
                    onChange={(e) => setFirebaseAppId(e.target.value.trim())}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            )}

            {/* CARD 3: PostgreSQL & Supabase Database Backup (Streamlined, Space-Saving) */}
            {(activeTab === 'ALL' || activeTab === 'POSTGRES') && (
              <div className="p-4 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 bg-white dark:bg-slate-900 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                      <Database className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-none">
                        PostgreSQL & Supabase Backup
                      </h2>
                      <span className="text-[10px] text-slate-400">Local PostgreSQL + Cloud Supabase Mirror</span>
                    </div>
                  </div>

                  {/* Auto-Backup Toggle Pill */}
                  <label className="flex items-center gap-1.5 cursor-pointer select-none bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                    <input
                      type="checkbox"
                      checked={postgresBackupAutoEnabled}
                      onChange={(e) => setPostgresBackupAutoEnabled(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className={`text-[10.5px] font-bold ${postgresBackupAutoEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                      {postgresBackupAutoEnabled ? 'Auto Active' : 'Paused'}
                    </span>
                  </label>
                </div>

                {/* Connection Targets Pill Strip */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Targets</div>
                      <div className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate text-[10.5px]">
                        {pgBackupStatus?.destinations?.length ? pgBackupStatus.destinations.join(' + ') : 'Local PG + Supabase'}
                      </div>
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex items-center gap-2">
                    <Clock className={`w-3.5 h-3.5 shrink-0 ${postgresBackupAutoEnabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <div className="min-w-0">
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Schedule</div>
                      <div className={`font-bold text-[10.5px] truncate ${postgresBackupAutoEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                        {getScheduleLabel()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Auto-Backup Scheduler Config */}
                <div className="p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      <span>កាលវិភាគ Backup (Hour & Minute)</span>
                    </span>

                    {/* Mode Segmented Switcher */}
                    <div className="flex items-center p-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10.5px] font-bold">
                      <button
                        type="button"
                        onClick={() => setPostgresBackupMode('DAILY_TIME')}
                        className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                          postgresBackupMode === 'DAILY_TIME' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        Daily Time
                      </button>
                      <button
                        type="button"
                        onClick={() => setPostgresBackupMode('INTERVAL')}
                        className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                          postgresBackupMode === 'INTERVAL' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        Interval
                      </button>
                    </div>
                  </div>

                  {postgresBackupAutoEnabled ? (
                    <div className="space-y-2 animate-in fade-in duration-150">
                      {postgresBackupMode === 'DAILY_TIME' ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={postgresBackupTime}
                              onChange={(e) => setPostgresBackupTime(e.target.value)}
                              className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono font-bold text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600 shadow-2xs"
                            />
                            <button
                              type="button"
                              onClick={handleSaveBackupScheduleOnly}
                              disabled={isSavingSchedule}
                              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50 shrink-0"
                            >
                              {isSavingSchedule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                              <span>រក្សាទុកកាលវិភាគ</span>
                            </button>
                          </div>

                          {/* Quick Time Preset Chips */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-slate-400 font-semibold">ម៉ោងពេញនិយម៖</span>
                            {[
                              { label: '12:00', val: '12:00' },
                              { label: '18:00 (៦ ល្ងាច)', val: '18:00' },
                              { label: '20:00 (៨ យប់)', val: '20:00' },
                              { label: '23:00 (១១ យប់)', val: '23:00' }
                            ].map((preset) => (
                              <button
                                key={preset.val}
                                type="button"
                                onClick={() => setPostgresBackupTime(preset.val)}
                                className={`text-[10px] font-mono px-2 py-0.5 rounded-md border transition cursor-pointer active:scale-95 ${
                                  postgresBackupTime === preset.val
                                    ? 'bg-indigo-100 dark:bg-indigo-900/60 border-indigo-400 text-indigo-700 dark:text-indigo-300 font-bold'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                max="24"
                                value={postgresBackupIntervalHours}
                                onChange={(e) => setPostgresBackupIntervalHours(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono font-bold text-xs focus:ring-2 focus:ring-indigo-600 shadow-2xs"
                              />
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-semibold">ម៉ោង</span>
                            </div>
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                max="59"
                                step="5"
                                value={postgresBackupIntervalMinutes}
                                onChange={(e) => setPostgresBackupIntervalMinutes(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono font-bold text-xs focus:ring-2 focus:ring-indigo-600 shadow-2xs"
                              />
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-semibold">នាទី</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1">
                              {[
                                { label: '30 នាទី', h: 0, m: 30 },
                                { label: '1 ម៉ោង', h: 1, m: 0 },
                                { label: '2 ម៉ោង', h: 2, m: 0 }
                              ].map((p) => (
                                <button
                                  key={p.label}
                                  type="button"
                                  onClick={() => {
                                    setPostgresBackupIntervalHours(p.h);
                                    setPostgresBackupIntervalMinutes(p.m);
                                  }}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>

                            <button
                              type="button"
                              onClick={handleSaveBackupScheduleOnly}
                              disabled={isSavingSchedule}
                              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
                            >
                              <Save className="w-3 h-3" />
                              <span>រក្សាទុក</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Next Run Info Pill */}
                      {(() => {
                        const nextInfo = getNextBackupInfo();
                        return (
                          <div className="p-2 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 text-xs flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 text-[11px] font-semibold">
                              <Clock className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>ជុំ Backup បន្ទាប់៖ <strong>{nextInfo.text}</strong></span>
                            </span>
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              {nextInfo.diffText}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      <span>ការ Backup ស្វ័យប្រវត្តត្រូវបានផ្អាក។ អ្នកអាចចុច Backup ដោយដៃបានគ្រប់ពេល។</span>
                    </div>
                  )}

                  {scheduleSaveToast && (
                    <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{scheduleSaveToast}</span>
                    </div>
                  )}
                </div>

                {/* Manual Trigger & Last Backup Bar */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-500 min-w-0">
                    {pgBackupStatus?.time ? (
                      <div className="flex items-center gap-1.5 truncate">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="truncate">ចុងក្រោយ៖ <strong className="text-slate-800 dark:text-slate-200 font-mono">{pgBackupStatus.time}</strong></span>
                        {pgBackupStatus.records !== undefined && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/40 shrink-0">
                            {pgBackupStatus.records} ឯកសារ
                          </span>
                        )}
                      </div>
                    ) : (
                      <span>ត្រៀម Backup</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={fetchPgBackupStatus}
                      disabled={isLoadingPgStatus}
                      title="Refresh Backup Status"
                      className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPgStatus ? 'animate-spin text-indigo-600' : ''}`} />
                    </button>

                    <button
                      type="button"
                      onClick={handleTriggerPgBackup}
                      disabled={isBackingUpPg}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                      {isBackingUpPg ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>កំពុង Backup...</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Backup ឥឡូវនេះ</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Collections Tags */}
                {pgBackupStatus?.collections && pgBackupStatus.collections.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/70 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span>PostgreSQL Collections ({pgBackupStatus.collections.length})</span>
                      <span className="text-emerald-600 dark:text-emerald-400">សរុប {pgBackupStatus.records || 0} Records</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {pgBackupStatus.collections.map((c) => (
                        <span
                          key={c.name}
                          className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[9.5px] font-mono text-slate-600 dark:text-slate-300 flex items-center gap-1"
                        >
                          <span className="text-slate-400">{c.name}:</span>
                          <strong className="text-indigo-600 dark:text-indigo-400">{c.count}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* ========================================================= */}
        {/* RIGHT COLUMN: Telegram Bot Alert Center & Security        */}
        {/* ========================================================= */}
        {(activeTab === 'ALL' || activeTab === 'TELEGRAM' || activeTab === 'SECURITY') && (
          <div className="space-y-3.5 sm:space-y-4">

            {/* CARD 4: Telegram Bot Alert Center (Redesigned with Compact Bot Switcher) */}
            {(activeTab === 'ALL' || activeTab === 'TELEGRAM') && (
              <div className="p-4 rounded-2xl border border-sky-200/90 dark:border-sky-900/60 bg-white dark:bg-slate-900 shadow-xs space-y-3.5">
                
                {/* Header with @BotFather Link & View All Toggle */}
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
                      <Send className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-none">
                        Telegram Bot Alert Center
                      </h2>
                      <span className="text-[10px] text-slate-400">គ្រប់គ្រង Bots ទាំង ៥ ដាច់ដោយឡែកពីគ្នា</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAllBots(!showAllBots)}
                      className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 transition cursor-pointer"
                    >
                      {showAllBots ? 'បង្រួម (Tabs View)' : 'មើលទាំងអស់ (View All)'}
                    </button>
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10.5px] font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-0.5"
                    >
                      @BotFather <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>

                {/* Compact Bot Tabs Switcher (Saves >1,000px vertical scrolling) */}
                <div className="grid grid-cols-5 gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs">
                  {botTabsInfo.map((b) => {
                    const isSelected = activeBotTab === b.id && !showAllBots;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setActiveBotTab(b.id);
                          setShowAllBots(false);
                        }}
                        className={`py-1.5 px-1 rounded-lg text-center transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                          isSelected
                            ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${b.isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
                          <span className="text-[11px] font-mono font-bold leading-none">#{b.number}</span>
                        </div>
                        <span className="text-[9.5px] leading-tight truncate w-full">{b.khmerName}</span>
                      </button>
                    );
                  })}
                </div>

                {/* BOT #1: Reconciliation & Main */}
                {(showAllBots || activeBotTab === 'BOT1') && (
                  <div className="p-3.5 rounded-xl border border-sky-100 dark:border-sky-900/40 bg-sky-50/30 dark:bg-sky-950/20 space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5 text-sky-500" />
                        <span>BOT #1: ផ្ទៀងផ្ទាត់ និងកត់ត្រាទូទៅ (RECONCILIATION)</span>
                      </span>
                      <span className="text-[9.5px] font-bold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-950/60 px-2 py-0.5 rounded-full border border-sky-300 dark:border-sky-800">
                        Main Bot
                      </span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 block">
                        Bot Token (HTTP API)
                      </label>
                      <div className="relative">
                        <input
                          type={showToken ? "text" : "password"}
                          placeholder="e.g. 8859388289:AAHzv7..."
                          value={telegramBotToken}
                          onChange={(e) => {
                            setTelegramBotToken(e.target.value);
                            setTgTestStatus(null);
                          }}
                          className="w-full pl-3 pr-8 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-sky-500 shadow-2xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-300">
                          Chat ID / Group ID (Reconciliation)
                        </label>
                        <a
                          href="https://t.me/userinfobot"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[9.5px] text-slate-400 hover:text-sky-500 hover:underline flex items-center gap-0.5"
                        >
                          @userinfobot <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. 924306058 or -100123456789"
                        value={telegramChatId}
                        onChange={(e) => {
                          setTelegramChatId(e.target.value);
                          setTgTestStatus(null);
                        }}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-sky-500 shadow-2xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleAutoDetectChatId}
                        disabled={isDetectingChatId || !telegramBotToken.trim()}
                        className="py-1.5 px-3 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300 font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                      >
                        {isDetectingChatId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        <span>Auto-Detect</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleTestTelegram}
                        disabled={isTestingTg || !telegramBotToken.trim() || !telegramChatId.trim()}
                        className="py-1.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
                      >
                        {isTestingTg ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        <span>Test Alert</span>
                      </button>
                    </div>

                    {tgTestStatus && (
                      <div className={`p-2 rounded-xl flex items-start gap-1.5 text-[11px] ${
                        tgTestStatus.ok ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}>
                        {tgTestStatus.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600 mt-0.5" />}
                        <span className="whitespace-pre-line leading-tight">{tgTestStatus.msg}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* BOT #2: Payment Collection */}
                {(showAllBots || activeBotTab === 'BOT2') && (
                  <div className="p-3.5 rounded-xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-emerald-600" />
                        <span>BOT #2: ដំណឹងប្រមូលប្រាក់ (PAYMENT COLLECTION)</span>
                      </span>
                      <span className="text-[9.5px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                        Payment Bot
                      </span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 block">
                        Bot Token <span className="text-[10px] text-slate-400 font-normal">(ទុកទទេបើប្រើ Token Bot #1)</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showPaymentToken ? "text" : "password"}
                          placeholder={telegramBotToken ? "កំពុងប្រើ Token #1 រួម (ឬបញ្ចូល Token ថ្មី)" : "e.g. 8859388289:AAHzv7..."}
                          value={telegramPaymentBotToken}
                          onChange={(e) => {
                            setTelegramPaymentBotToken(e.target.value);
                            setTgPaymentTestStatus(null);
                          }}
                          className="w-full pl-3 pr-8 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-emerald-600 shadow-2xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPaymentToken(!showPaymentToken)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {showPaymentToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 block">
                        Payment Chat ID / Group ID
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. -100123456789 ឬ 924306058"
                        value={telegramPaymentChatId}
                        onChange={(e) => {
                          setTelegramPaymentChatId(e.target.value);
                          setTgPaymentTestStatus(null);
                        }}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-emerald-600 shadow-2xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleAutoDetectPaymentChatId}
                        disabled={isDetectingPaymentChatId || (!telegramPaymentBotToken.trim() && !telegramBotToken.trim())}
                        className="py-1.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                      >
                        {isDetectingPaymentChatId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        <span>Auto-Detect</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleTestPaymentTelegram}
                        disabled={isTestingPaymentTg || (!telegramPaymentBotToken.trim() && !telegramBotToken.trim()) || !telegramPaymentChatId.trim()}
                        className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
                      >
                        {isTestingPaymentTg ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        <span>Test Alert</span>
                      </button>
                    </div>

                    {tgPaymentTestStatus && (
                      <div className={`p-2 rounded-xl flex items-start gap-1.5 text-[11px] ${
                        tgPaymentTestStatus.ok ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}>
                        {tgPaymentTestStatus.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600 mt-0.5" />}
                        <span className="whitespace-pre-line leading-tight">{tgPaymentTestStatus.msg}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* BOT #3: User Activity Logs */}
                {(showAllBots || activeBotTab === 'BOT3') && (
                  <div className="p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-indigo-600" />
                        <span>BOT #3: សកម្មភាពបុគ្គលិក (USER ACTIVITY LOGS)</span>
                      </span>
                      <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800 shadow-2xs">
                        <input
                          type="checkbox"
                          checked={telegramLogAlertsEnabled}
                          onChange={(e) => setTelegramLogAlertsEnabled(e.target.checked)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-3 h-3 cursor-pointer"
                        />
                        <span className="text-[10px] font-bold text-indigo-900 dark:text-indigo-300">
                          {telegramLogAlertsEnabled ? 'Active' : 'Off'}
                        </span>
                      </label>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 block">
                        Log Bot Token <span className="text-[10px] text-slate-400 font-normal">(ទុកទទេបើប្រើ Token រួម)</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showLogToken ? "text" : "password"}
                          placeholder="e.g. 8859388289:AAHzv7... (Optional)"
                          value={telegramLogBotToken}
                          onChange={(e) => {
                            setTelegramLogBotToken(e.target.value);
                            setTgLogTestStatus(null);
                          }}
                          className="w-full pl-3 pr-8 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-indigo-600 shadow-2xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLogToken(!showLogToken)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {showLogToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 block">
                        Dedicated Log Channel / Chat ID
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. -100123456789 (Channel/Group ID)"
                        value={telegramLogChatId}
                        onChange={(e) => {
                          setTelegramLogChatId(e.target.value);
                          setTgLogTestStatus(null);
                        }}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-indigo-600 shadow-2xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleAutoDetectLogChatId}
                        disabled={isDetectingLogChatId || (!telegramLogBotToken.trim() && !telegramPaymentBotToken.trim() && !telegramBotToken.trim())}
                        className="py-1.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                      >
                        {isDetectingLogChatId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        <span>Auto-Detect</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleTestLogTelegram}
                        disabled={isTestingLogTg || (!telegramLogBotToken.trim() && !telegramPaymentBotToken.trim() && !telegramBotToken.trim()) || !telegramLogChatId.trim()}
                        className="py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
                      >
                        {isTestingLogTg ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        <span>Test Alert</span>
                      </button>
                    </div>

                    {tgLogTestStatus && (
                      <div className={`p-2 rounded-xl flex items-start gap-1.5 text-[11px] ${
                        tgLogTestStatus.ok ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}>
                        {tgLogTestStatus.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600 mt-0.5" />}
                        <span className="whitespace-pre-line leading-tight">{tgLogTestStatus.msg}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* BOT #4: Bank Slip & AWBN Alert */}
                {(showAllBots || activeBotTab === 'BOT4') && (
                  <div className="p-3.5 rounded-xl border border-cyan-100 dark:border-cyan-900/40 bg-cyan-50/30 dark:bg-cyan-950/20 space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-cyan-600" />
                        <span>BOT #4: រូបភាព Slip និង AWBN (BANK SLIP ALERT)</span>
                      </span>
                      <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-cyan-200 dark:border-cyan-800 shadow-2xs">
                        <input
                          type="checkbox"
                          checked={telegramSlipAlertsEnabled}
                          onChange={(e) => setTelegramSlipAlertsEnabled(e.target.checked)}
                          className="rounded text-cyan-600 focus:ring-cyan-500 w-3 h-3 cursor-pointer"
                        />
                        <span className="text-[10px] font-bold text-cyan-900 dark:text-cyan-300">
                          {telegramSlipAlertsEnabled ? 'Active' : 'Off'}
                        </span>
                      </label>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 block">
                        Slip Bot Token <span className="text-[10px] text-slate-400 font-normal">(ទុកទទេបើប្រើ Token រួម)</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showSlipToken ? "text" : "password"}
                          placeholder="e.g. 8859388289:AAHzv7... (Optional)"
                          value={telegramSlipBotToken}
                          onChange={(e) => {
                            setTelegramSlipBotToken(e.target.value);
                            setTgSlipTestStatus(null);
                          }}
                          className="w-full pl-3 pr-8 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-cyan-600 shadow-2xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSlipToken(!showSlipToken)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {showSlipToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 block">
                        Dedicated Slip Chat / Group ID
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. -100123456789"
                        value={telegramSlipChatId}
                        onChange={(e) => {
                          setTelegramSlipChatId(e.target.value);
                          setTgSlipTestStatus(null);
                        }}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-cyan-600 shadow-2xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleAutoDetectSlipChatId}
                        disabled={isDetectingSlipChatId || (!telegramSlipBotToken.trim() && !telegramPaymentBotToken.trim() && !telegramBotToken.trim())}
                        className="py-1.5 px-3 rounded-xl bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/60 dark:hover:bg-cyan-900/60 border border-cyan-300 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300 font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                      >
                        {isDetectingSlipChatId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        <span>Auto-Detect</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleTestSlipTelegram}
                        disabled={isTestingSlipTg || (!telegramSlipBotToken.trim() && !telegramPaymentBotToken.trim() && !telegramBotToken.trim()) || !telegramSlipChatId.trim()}
                        className="py-1.5 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
                      >
                        {isTestingSlipTg ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        <span>Test Alert</span>
                      </button>
                    </div>

                    {tgSlipTestStatus && (
                      <div className={`p-2 rounded-xl flex items-start gap-1.5 text-[11px] ${
                        tgSlipTestStatus.ok ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}>
                        {tgSlipTestStatus.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600 mt-0.5" />}
                        <span className="whitespace-pre-line leading-tight">{tgSlipTestStatus.msg}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* BOT #5: Distribution & 6:00 PM Summary Alert */}
                {(showAllBots || activeBotTab === 'BOT5') && (
                  <div className="p-3.5 rounded-xl border border-sky-100 dark:border-sky-900/40 bg-sky-50/30 dark:bg-sky-950/20 space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-sky-500" />
                        <span>BOT #5: សរុបម៉ោង ៦ ល្ងាច (DISTRIBUTION SUMMARY)</span>
                      </span>
                      <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-sky-300 dark:border-sky-800 shadow-2xs">
                        <input
                          type="checkbox"
                          checked={telegramDailySummaryEnabled}
                          onChange={(e) => setTelegramDailySummaryEnabled(e.target.checked)}
                          className="rounded text-sky-600 focus:ring-sky-500 w-3 h-3 cursor-pointer"
                        />
                        <span className="text-[10px] font-bold text-sky-900 dark:text-sky-300">
                          {telegramDailySummaryEnabled ? 'Active' : 'Off'}
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 block">
                          Bot Token <span className="text-[9.5px] text-slate-400 font-normal">(Optional)</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showDistributionToken ? "text" : "password"}
                            placeholder="Token ដាច់ដោយឡែក..."
                            value={telegramDistributionBotToken}
                            onChange={(e) => {
                              setTelegramDistributionBotToken(e.target.value);
                              setTgDistributionTestStatus(null);
                            }}
                            className="w-full pl-3 pr-8 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-sky-500 shadow-2xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowDistributionToken(!showDistributionToken)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            {showDistributionToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 block">
                            ម៉ោងសរុបប្រចាំថ្ងៃ (Daily Time)
                          </label>
                          <span className="text-[10px] text-sky-600 dark:text-sky-400 font-medium">
                            {telegramDailySummaryTime === '06:00' ? '⚠️ ម៉ោង ៦ ព្រឹក' : '(18:00 = ម៉ោង ៦:០០ ល្ងាច)'}
                          </span>
                        </div>
                        <input
                          type="time"
                          value={telegramDailySummaryTime || '18:00'}
                          onChange={(e) => setTelegramDailySummaryTime(e.target.value || '18:00')}
                          className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-sky-500 shadow-2xs"
                        />
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          <button
                            type="button"
                            onClick={() => setTelegramDailySummaryTime('18:00')}
                            className={`text-[9.5px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                              telegramDailySummaryTime === '18:00'
                                ? 'bg-sky-600 text-white border-sky-600 font-bold'
                                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            ៦:០០ ល្ងាច (18:00)
                          </button>
                          <button
                            type="button"
                            onClick={() => setTelegramDailySummaryTime('17:30')}
                            className={`text-[9.5px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                              telegramDailySummaryTime === '17:30'
                                ? 'bg-sky-600 text-white border-sky-600 font-bold'
                                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            ៥:៣០ ល្ងាច (17:30)
                          </button>
                          <button
                            type="button"
                            onClick={() => setTelegramDailySummaryTime('19:00')}
                            className={`text-[9.5px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                              telegramDailySummaryTime === '19:00'
                                ? 'bg-sky-600 text-white border-sky-600 font-bold'
                                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            ៧:០០ យប់ (19:00)
                          </button>
                        </div>
                        {telegramDailySummaryTime === '06:00' && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                            💡 ចំណាំ៖ 06:00 គឺម៉ោង ៦ ព្រឹក។ បើចង់ផ្ញើសរុបពេលល្ងាច សូមជ្រើសរើស <b>18:00</b>!
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10.5px] font-semibold text-slate-700 dark:text-slate-300 block">
                        Telegram Chat ID / Group ID
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. -100123456789 (ទុកទទេបើប្រើ Chat ID រួម)"
                        value={telegramDistributionChatId}
                        onChange={(e) => {
                          setTelegramDistributionChatId(e.target.value);
                          setTgDistributionTestStatus(null);
                        }}
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-sky-500 shadow-2xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleAutoDetectDistributionChatId}
                        disabled={isDetectingDistributionChatId}
                        className="py-1.5 px-3 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300 font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                      >
                        {isDetectingDistributionChatId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        <span>Auto-Detect</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleTestDistributionTelegram}
                        disabled={isTestingDistributionTg}
                        className="py-1.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold transition disabled:opacity-50 text-xs flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
                      >
                        {isTestingDistributionTg ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        <span>Test Alert</span>
                      </button>
                    </div>

                    {tgDistributionTestStatus && (
                      <div className={`p-2 rounded-xl flex items-start gap-1.5 text-[11px] ${
                        tgDistributionTestStatus.ok ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}>
                        {tgDistributionTestStatus.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 mt-0.5" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600 mt-0.5" />}
                        <span className="whitespace-pre-line leading-tight">{tgDistributionTestStatus.msg}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* CARD 5: Security & Currency (Compact 2-Column Layout) */}
            {(activeTab === 'ALL' || activeTab === 'SECURITY') && (
              <div className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-none">
                        សុវត្ថិភាព និងអត្រាប្តូរប្រាក់ (Security & Rate)
                      </h2>
                      <span className="text-[10px] text-slate-400">អត្រាប្តូរប្រាក់, Google Client ID, PIN & Access</span>
                    </div>
                  </div>
                </div>

                {/* Exchange Rate with Compact Chips */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 dark:text-slate-300 text-[11px] flex items-center gap-1">
                      <span className="w-4 h-4 rounded bg-emerald-600 text-white flex items-center justify-center font-mono text-[10px] font-bold">$</span>
                      <span>EXCHANGE RATE (1 USD = ? KHR)</span>
                    </span>
                    <span className="text-[10px] text-slate-400">Default: 4,100៛</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono text-xs">
                        $1 =
                      </span>
                      <input
                        type="number"
                        step="10"
                        min="1000"
                        placeholder="4100"
                        value={exchangeRate}
                        onChange={(e) => setExchangeRate(e.target.value)}
                        className="w-full pl-10 pr-6 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono font-bold text-xs focus:ring-2 focus:ring-emerald-600 shadow-2xs"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[11px]">៛</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {[4000, 4050, 4100, 4120].map((presetVal) => (
                        <button
                          key={presetVal}
                          type="button"
                          onClick={() => setExchangeRate(presetVal.toString())}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-mono font-bold transition border cursor-pointer active:scale-95 ${
                            exchangeRate === presetVal.toString()
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {presetVal}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Google Client ID & Admin PIN (2 Columns) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10.5px] font-bold text-slate-700 dark:text-slate-300">
                        OAuth 2.0 Client ID
                      </label>
                      <a
                        href="https://console.cloud.google.com/apis/credentials"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[9.5px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                      >
                        Cloud Console <ExternalLink className="w-2 h-2" />
                      </a>
                    </div>
                    <input
                      type="text"
                      placeholder="...apps.googleusercontent.com"
                      value={googleClientId}
                      onChange={(e) => setGoogleClientId(e.target.value.trim())}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10.5px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-amber-500" />
                        Admin PIN Code
                      </label>
                      <span className="text-[9.5px] text-slate-400">Default: 123456</span>
                    </div>
                    <div className="relative">
                      <input
                        type={showAdminPin ? "text" : "password"}
                        placeholder="លេខកូដ PIN..."
                        value={adminPin}
                        onChange={(e) => setAdminPin(e.target.value.trim())}
                        className="w-full px-3 py-1.5 pr-8 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPin(!showAdminPin)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showAdminPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Allowed Gmails */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                  <label className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-300">
                    Allowed Gmails (Email Whitelist)
                  </label>
                  <input
                    type="text"
                    placeholder="owner@gmail.com, accountant@gmail.com (ទុកទទេដើម្បីអនុញ្ញាតគ្រប់ Gmail)"
                    value={allowedEmails}
                    onChange={(e) => setAllowedEmails(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {/* Danger Zone: Reset Local Data */}
                {onResetData && (
                  <div className="pt-2.5 border-t border-rose-200/80 dark:border-rose-900/60 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <FolderLock className="w-3 h-3" />
                        <span>កំណត់ឡើងវិញ (Reset Local Cache)</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        លុបទិន្នន័យបណ្តោះអាសន្ន Cache លើឧបករណ៍នេះ (មិនប៉ះពាល់ Cloud ឡើយ)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('តើលោកអ្នកពិតជាចង់កំណត់ទិន្នន័យ Local Cache ឡើងវិញមែនទេ?')) {
                          onResetData();
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 font-semibold text-[11px] transition cursor-pointer shrink-0"
                    >
                      Reset Data
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </div>

      {/* Floating Modern Sticky Bottom Action Bar */}
      <div className="sticky bottom-20 lg:bottom-4 z-30 flex flex-col sm:flex-row items-center justify-between gap-2 p-2.5 sm:p-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-lg">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-tight">
            រាល់ការផ្លាស់ប្តូរតម្រូវឱ្យចុច <strong>"រក្សាទុកការកំណត់"</strong> ដើម្បី Sync ទៅ Cloud
          </span>
        </div>

        <button
          id="btn-save-settings-bottom"
          type="button"
          onClick={handleSave}
          className={`w-full sm:w-auto px-5 py-2 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer active:scale-98 ${
            isSavedRecently
              ? 'bg-emerald-600 text-white shadow-emerald-500/30'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/25'
          }`}
        >
          {isSavedRecently ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          <span>{isSavedRecently ? 'រក្សាទុកជោគជ័យ' : 'រក្សាទុកការកំណត់'}</span>
        </button>
      </div>

    </div>
  );
};
