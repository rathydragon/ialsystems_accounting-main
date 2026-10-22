import React, { useState, useEffect, useCallback, useRef } from 'react';
import { parseGvizDataRecords } from './utils/sheetDataParser';
import { Sidebar } from './components/Sidebar';
import { LoginView } from './components/LoginView';
// import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppSettings, AuthUser, UserPermission, UserRole, CollectionBatch, CollectionItem, Payer, NavView, DatabaseRecord, isNavView } from './types';
import { INITIAL_DATABASE_RECORDS } from './data/initialData';
import { CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react';
import {
  subscribeToBatches,
  saveBatch,
  deleteBatch,
  deleteAllBatches,
  subscribeToMedicineBatches,
  saveMedicineBatch,
  deleteMedicineBatch,
  deleteAllMedicineBatches,
  subscribeToCodBatches,
  saveCodBatch,
  deleteCodBatch,
  deleteAllCodBatches,
  restoreBatch,
  restoreMedicineBatch,
  subscribeToDeletedBatches
} from './services/batchService';
import {
  subscribeToPermissions,
  savePermission,
  deletePermission,
  syncAllPermissions,
  syncAllPermissionsToGoogleSheets,
  fetchPermissionsFromGoogleSheets,
  savePermissionToGoogleSheets,
  deletePermissionFromGoogleSheets,
  fetchPermissions,
  isMasterAdmin,
  MASTER_ADMIN_EMAIL,
  IAL_ACCOUNTING_EMAIL,
  DEFAULT_MASTER_ADMIN,
  DEFAULT_IAL_ACCOUNTING,
  DEFAULT_USERS,
  resolveOperator,
  canUserAccessPage,
  ALL_CONFIGURABLE_NAV_PAGES,
  getDefaultAllowedPages
} from './services/userPermissionService';
import { sendTelegramNotification, formatBatchTelegramMessage, normalizeDailySummaryTime } from './services/telegramService';
import { logUserActivity } from './services/activityLogService';
import { formatToStandardDateTime, getCurrentStandardDateTime } from './utils/dateFormatter';
import { getProxiedGasUrl } from './utils/gasProxy';
import {
  saveListName,
  deleteListName,
  fetchListNames,
  subscribeToListNames
} from './services/localDbService';
import { fetchAllMasterData, fetchMasterDataVersion, saveSettingsToMaster } from './services/mysqlMasterService';
import { applyServerDistributionReports } from './services/distributionReportService';
import { clearAuthSession, getAuthToken } from './services/apiClient';
import { saveListCache } from './utils/safeStorage';

// Helper to safely convert any value to trimmed string (handling numbers/null/undefined safely)
const safeTrim = (v: any): string => (v !== null && v !== undefined ? String(v).trim() : '');

// Helper to safely import dynamic chunks and automatically handle stale deployment chunks
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T } | any>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    const pageKey = `chunk_reload_${window.location.pathname}`;
    try {
      const mod = await factory();
      // A suppressed vite:preloadError resolves the import to undefined → treat as a stale chunk
      if (!mod || !mod.default) throw new Error('Failed to fetch dynamically imported module (empty module)');
      return mod;
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      const isChunkError =
        errMsg.includes('Failed to fetch dynamically imported module') ||
        errMsg.includes('Importing a module script failed') ||
        errMsg.includes('Unable to preload') ||
        err?.name === 'ChunkLoadError' ||
        errMsg.includes('dynamically imported module') ||
        (err instanceof TypeError && errMsg.includes('Cannot read properties of undefined'));

      if (isChunkError) {
        const lastReload = sessionStorage.getItem(pageKey);
        const now = Date.now();
        if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
          sessionStorage.setItem(pageKey, String(now));
          if ('caches' in window) {
            try {
              const keys = await caches.keys();
              await Promise.all(keys.map(k => caches.delete(k)));
            } catch {}
          }
          const searchParams = new URLSearchParams(window.location.search);
          searchParams.set('_v', now.toString());
          window.location.href = window.location.pathname + '?' + searchParams.toString() + window.location.hash;
          return new Promise(() => {});
        }
      }
      throw err;
    }
  });
}

// Code-split modals and pages using lazyWithRetry
const UserManagementPage = lazyWithRetry(() => import('./components/UserManagementPage').then(m => ({ default: m.UserManagementPage })));
const PaymentCollectionPage = lazyWithRetry(() => import('./components/PaymentCollectionPage').then(m => ({ default: m.PaymentCollectionPage })));
const PayerManagementPage = lazyWithRetry(() => import('./components/PayerManagementPage').then(m => ({ default: m.PayerManagementPage })));
const DataManagementPage = lazyWithRetry(() => import('./components/DataManagementPage').then(m => ({ default: m.DataManagementPage })));
const DataBMPage = lazyWithRetry(() => import('./components/DataBMPage').then(m => ({ default: m.DataBMPage })));
const FollowUpBMPage = lazyWithRetry(() => import('./components/FollowUpBMPage').then(m => ({ default: m.FollowUpBMPage })));
const SokimexPostpaidPage = lazyWithRetry(() => import('./components/SokimexPostpaidPage').then(m => ({ default: m.SokimexPostpaidPage })));
const BankSlipsPage = lazyWithRetry(() => import('./components/BankSlipsPage').then(m => ({ default: m.BankSlipsPage })));
const SettingsPage = lazyWithRetry(() => import('./components/SettingsPage').then(m => ({ default: m.SettingsPage })));
const SettingsModal = lazyWithRetry(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const SetupGuideModal = lazyWithRetry(() => import('./components/SetupGuideModal').then(m => ({ default: m.SetupGuideModal })));
const CodeViewerModal = lazyWithRetry(() => import('./components/CodeViewerModal').then(m => ({ default: m.CodeViewerModal })));
const TelegramPreviewModal = lazyWithRetry(() => import('./components/TelegramPreviewModal').then(m => ({ default: m.TelegramPreviewModal })));
const DataReportPage = lazyWithRetry(() => import('./components/DataReportPage').then(m => ({ default: m.DataReportPage })));
const MeterialOfficePage = lazyWithRetry(() => import('./components/MeterialOfficePage').then(m => ({ default: m.MeterialOfficePage })));
const DistributionReportPage = lazyWithRetry(() => import('./components/DistributionReportPage').then(m => ({ default: m.DistributionReportPage })));
const WarehouseManagementPage = lazyWithRetry(() => import('./components/WarehouseManagementPage').then(m => ({ default: m.WarehouseManagementPage })));
const IaleTrackingPage = lazyWithRetry(() => import('./components/IaleTrackingPage').then(m => ({ default: m.IaleTrackingPage })));
const TelegramBookingPage = lazyWithRetry(() => import('./components/TelegramBookingPage').then(m => ({ default: m.TelegramBookingPage })));
const CustomersPage = lazyWithRetry(() => import('./components/CustomersPage').then(m => ({ default: m.CustomersPage })));

const STORAGE_KEY_SETTINGS = 'accounting_app_settings_v2';
const STORAGE_KEY_AUTH = 'accounting_app_auth_user_v2';
const STORAGE_KEY_PERMISSIONS = 'accounting_app_user_permissions_v2';
const STORAGE_KEY_BATCHES = 'accounting_app_saved_batches_v1';
const STORAGE_KEY_MEDICINE_BATCHES = 'accounting_medicine_batches_v1';
const STORAGE_KEY_COD_BATCHES = 'accounting_cod_batches_v1';
const STORAGE_KEY_PAYERS = 'accounting_app_payers_v3';
const STORAGE_KEY_DATABASE_RECORDS = 'accounting_app_database_records_v2';

// Keys we've already warned about — the cache write is retried on every save, so only log once per key
const quotaWarnedKeys = new Set<string>();

export function safeLocalStorageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError' || err?.code === 22) {
      if (!quotaWarnedKeys.has(key)) {
        quotaWarnedKeys.add(key);
        console.warn(`LocalStorage quota exceeded saving ${key}. Operating in safe memory fallback.`);
      }
      // Drop the stale copy so the next load doesn't read outdated cache; Hostinger remains the source of truth.
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    } else {
      console.warn(`LocalStorage error:`, err);
    }
  }
}

// Helper to filter out legacy dummy mock payers permanently
const isDummyMockPayer = (p: Payer): boolean => {
  if (!p) return false;
  const name = String(p.name || '').toLowerCase();
  const phone = String(p.phone || '').replace(/\s/g, '');
  return (
    name.includes('rider sokha') ||
    name.includes('heng ly') ||
    name.includes('tk branch') ||
    name.includes('j&t express') ||
    name.includes('វិបុល') ||
    name.includes('វិចិត្រ') ||
    phone === '012345678' ||
    phone === '098765432' ||
    phone === '077112233' ||
    phone === '015999888'
  );
};

const INITIAL_PAYERS: Payer[] = [];

export { MASTER_ADMIN_EMAIL, isMasterAdmin };

export default function App() {
  // 1. Authenticated User State (Google Account Login)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_AUTH);
    if (saved) {
      try {
        const user = JSON.parse(saved);
        if (user && user.email) {
          const now = Date.now();
          // Check if session has expired (either explicit sessionExpiresAt or older than 12 hours)
          if (user.sessionExpiresAt && now > user.sessionExpiresAt) {
            localStorage.removeItem(STORAGE_KEY_AUTH);
            return null;
          }
          // Sessions created before server-issued JWTs (e.g. client-only Google login)
          // cannot call any /api/* endpoint: require a fresh login.
          if (!getAuthToken()) {
            localStorage.removeItem(STORAGE_KEY_AUTH);
            return null;
          }
          const emailClean = user.email.toLowerCase().trim();
          if (isMasterAdmin(emailClean)) {
            user.role = 'ADMIN';
            user.name = user.name && !user.name.toLowerCase().includes('ial') ? user.name : 'KEUN RATHY';
          } else if (emailClean === IAL_ACCOUNTING_EMAIL) {
            user.name = 'IAL Accounting';
          } else if (user.name && (user.name.toLowerCase() === 'keun rathy' || user.name.toLowerCase() === 'rathy kim')) {
            // Clean any shared-device name leak
            user.name = emailClean.split('@')[0];
          }
        }
        return user;
      } catch (e) { }
    }
    return null;
  });

  // 2. User Permissions State (Guarantees rathykim34@gmail.com is permanent Master Admin)
  const [permissions, setPermissions] = useState<UserPermission[]>(() => {
    let list: UserPermission[] = [];
    const saved = localStorage.getItem(STORAGE_KEY_PERMISSIONS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) list = parsed;
      } catch (e) { }
    }
    // Ensure rathykim34@gmail.com is always present and permanently ADMIN & ACTIVE
    const masterIdx = list.findIndex(u => isMasterAdmin(u.email));
    if (masterIdx >= 0) {
      list[masterIdx] = {
        ...list[masterIdx],
        name: list[masterIdx].name || 'KEUN RATHY',
        role: 'ADMIN',
        status: 'ACTIVE'
      };
    } else {
      list = [DEFAULT_MASTER_ADMIN, ...list];
    }
    // Ensure ialexpress2023@gmail.com is always present with official name "IAL Accounting"
    const ialIdx = list.findIndex(u => u.email.toLowerCase().trim() === IAL_ACCOUNTING_EMAIL);
    if (ialIdx >= 0) {
      list[ialIdx] = {
        ...list[ialIdx],
        name: 'IAL Accounting',
        status: 'ACTIVE'
      };
    } else {
      list.push(DEFAULT_IAL_ACCOUNTING);
    }
    return list;
  });

  const savePermissions = (updated: UserPermission[]) => {
    setPermissions(updated);
    safeLocalStorageSet(STORAGE_KEY_PERMISSIONS, JSON.stringify(updated));
    syncAllPermissions(updated).catch(() => {});
  };

  // Synchronize permissions across Wi-Fi devices from local server API
  useEffect(() => {
    fetchPermissions().then(fetched => {
      if (Array.isArray(fetched) && fetched.length > 0) {
        setPermissions(fetched);
        safeLocalStorageSet(STORAGE_KEY_PERMISSIONS, JSON.stringify(fetched));
      }
    }).catch(() => {});
  }, []);

  // 2. View Navigation State (Persistent across page refresh via localStorage & URL hash)
  const [currentView, setCurrentView] = useState<NavView>(() => {
    // Check URL Hash first (e.g. #data, #tg_booking)
    const hash = window.location.hash.replace('#', '').toUpperCase();
    if (isNavView(hash)) {
      return hash;
    }
    // Check localStorage
    const saved = (localStorage.getItem('accounting_current_view') || '').toUpperCase();
    if (isNavView(saved)) {
      return saved;
    }
    return 'COLLECTION';
  });

  const handleNavigate = (view: NavView) => {
    if (!canUserAccessPage(view, currentUser, permissions)) {
      showToast('⚠️ លោកអ្នកគ្មានសិទ្ធិចូលមើលទំព័រនេះឡើយ! សូមទាក់ទង Admin។', 'error');
      return;
    }
    setCurrentView(view);
    safeLocalStorageSet('accounting_current_view', view);
    window.history.replaceState(null, '', `#${view.toLowerCase()}`);
  };

  // Sync with browser Back / Forward buttons & direct hash navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').toUpperCase();
      if (isNavView(hash)) {
        const targetView = hash;
        if (!canUserAccessPage(targetView, currentUser, permissions)) {
          const fallback = ALL_CONFIGURABLE_NAV_PAGES.find(p => canUserAccessPage(p, currentUser, permissions)) || 'COLLECTION';
          setCurrentView(fallback);
          safeLocalStorageSet('accounting_current_view', fallback);
          window.history.replaceState(null, '', `#${fallback.toLowerCase()}`);
          return;
        }
        setCurrentView(targetView);
        safeLocalStorageSet('accounting_current_view', hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentUser, permissions]);

  // Ensure current user is permitted on currentView; if not, automatically redirect to first accessible page!
  useEffect(() => {
    if (currentUser && !canUserAccessPage(currentView, currentUser, permissions)) {
      const fallback = ALL_CONFIGURABLE_NAV_PAGES.find(p => canUserAccessPage(p, currentUser, permissions)) || 'COLLECTION';
      setCurrentView(fallback);
      safeLocalStorageSet('accounting_current_view', fallback);
      window.history.replaceState(null, '', `#${fallback.toLowerCase()}`);
      showToast('⚠️ ផ្ទេរទៅកាន់ទំព័រដែលអាចចូលមើលបាន ព្រោះអ្នកគ្មានសិទ្ធិលើទំព័រមុននេះ!', 'info');
    }
  }, [currentView, currentUser?.email, currentUser?.role, (currentUser?.allowedPages || []).join(','), permissions]);

  // Ensure currentView is always synced to localStorage and URL Hash
  useEffect(() => {
    safeLocalStorageSet('accounting_current_view', currentView);
    window.history.replaceState(null, '', `#${currentView.toLowerCase()}`);
  }, [currentView]);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('accounting_sidebar_collapsed') === 'true';
  });

  const handleToggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      safeLocalStorageSet('accounting_sidebar_collapsed', String(next));
      return next;
    });
  };
  // 1. Settings State
  const CURRENT_DEFAULT_WEBAPP = (import.meta as any).env?.VITE_GOOGLE_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbxWDKd5u7G82MttghlrfJrfxcEjQ73CyEJzN9zlZiRv_gekhAoxK7JMjo-0yj-Y7XY4SA/exec';
  const CURRENT_DEFAULT_GOOGLE_CLIENT_ID = '594375780266-3pu9am9mgelmd08f0fkc06n3m2gho1bn.apps.googleusercontent.com';
  const CURRENT_DEFAULT_ADMIN_PIN = '';

  // Secrets (bot tokens, API keys) must never come from VITE_* env vars: those are
  // inlined into the public JS bundle. Bot tokens live in the backend env instead
  // (TELEGRAM_*_BOT_TOKEN, used by /api/telegram-alert).
  const CURRENT_DEFAULT_TELEGRAM_BOT_TOKEN = '';
  const CURRENT_DEFAULT_TELEGRAM_CHAT_ID = '';
  const CURRENT_DEFAULT_TELEGRAM_PAYMENT_BOT_TOKEN = '';
  const CURRENT_DEFAULT_TELEGRAM_PAYMENT_CHAT_ID = '';

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
    const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const defaults: AppSettings = {
      webAppUrl: CURRENT_DEFAULT_WEBAPP,
      telegramBotToken: CURRENT_DEFAULT_TELEGRAM_BOT_TOKEN,
      telegramChatId: (import.meta as any).env?.VITE_TELEGRAM_CHAT_ID || CURRENT_DEFAULT_TELEGRAM_CHAT_ID,
      telegramPaymentBotToken: CURRENT_DEFAULT_TELEGRAM_PAYMENT_BOT_TOKEN,
      telegramPaymentChatId: (import.meta as any).env?.VITE_TELEGRAM_PAYMENT_CHAT_ID || CURRENT_DEFAULT_TELEGRAM_PAYMENT_CHAT_ID,
      telegramSlipBotToken: '',
      telegramSlipChatId: (import.meta as any).env?.VITE_TELEGRAM_SLIP_CHAT_ID || '-1003741239268',
      telegramSlipAlertsEnabled: true,
      telegramDistributionBotToken: '',
      telegramDistributionChatId: (import.meta as any).env?.VITE_TELEGRAM_DISTRIBUTION_CHAT_ID || '-1004483558665',
      telegramDailySummaryEnabled: true,
      telegramDailySummaryTime: '18:00',
      spreadsheetId: '18prsAT5KK6EwPPJFEX7gcldPJPrvXGD0FJ7eE1ceI-k',
      driveFolderId: '1nsWC8MZaGFz0HGOxwCqzKyRU0IB5kM5w',
      darkMode: prefersDark,
      demoMode: false,
      exchangeRate: 4100,
      googleClientId: (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || CURRENT_DEFAULT_GOOGLE_CLIENT_ID,
      allowedEmails: '',
      adminPin: CURRENT_DEFAULT_ADMIN_PIN,

      dataBmSheetUrl: (import.meta as any).env?.VITE_DATA_BM_SHEET_URL || localStorage.getItem('accounting_data_bm_sheet_url') || 'https://docs.google.com/spreadsheets/d/1C-CYb14ZM146RiD87yjS_rxGmWk1hiB4jkoTDT6O-I8/edit#gid=764804833',
      dataBmSheetName: (import.meta as any).env?.VITE_DATA_BM_SHEET_NAME || localStorage.getItem('accounting_data_bm_sheet_name') || 'Sort_pending',
      followupBmSheetUrl: (import.meta as any).env?.VITE_FOLLOWUP_BM_SHEET_URL || localStorage.getItem('accounting_followup_bm_sheet_url')?.replace('1C-CYb14ZM146RiD87yjS_rxGmWk1hib4jkoTDT6O-I8', '1C-CYb14ZM146RiD87yjS_rxGmWk1hiB4jkoTDT6O-I8') || 'https://docs.google.com/spreadsheets/d/1C-CYb14ZM146RiD87yjS_rxGmWk1hiB4jkoTDT6O-I8/edit?gid=0#gid=0',
      followupBmSheetName: (import.meta as any).env?.VITE_FOLLOWUP_BM_SHEET_NAME || localStorage.getItem('accounting_followup_bm_sheet_name') || 'Data_BM',
      sokimexSheetUrl: (import.meta as any).env?.VITE_SOKIMEX_SHEET_URL || localStorage.getItem('accounting_sokimex_sheet_url') || 'https://docs.google.com/spreadsheets/d/1OQFwNcbajxsKLu6-y-Bi7tQaXQIn08lPfAog8LnwmXE/edit?gid=1104637417#gid=1104637417',
      sokimexSheetName: (import.meta as any).env?.VITE_SOKIMEX_SHEET_NAME || localStorage.getItem('accounting_sokimex_sheet_name') || 'Data_Sokimic',
      dataReportSheetUrl: (import.meta as any).env?.VITE_DATA_REPORT_SHEET_URL || localStorage.getItem('accounting_data_report_sheet_url') || '1yiKxEP7LnvIK2UjhrpnnI4YI4tMbMOFe8hF4dmSSKn8',
      dataReportSheetName: (import.meta as any).env?.VITE_DATA_REPORT_SHEET_NAME || localStorage.getItem('accounting_data_report_sheet_name') || 'DATA',
      meterialOfficeSheetUrl: (import.meta as any).env?.VITE_METERIAL_OFFICE_SHEET_URL || localStorage.getItem('accounting_meterial_office_sheet_url') || 'https://docs.google.com/spreadsheets/d/1gOjRT40t9RVIIym0Y-Pv_jz0VSkt--icUDrtti-Ljd8/edit?gid=0#gid=0',
      meterialOfficeSheetName: (import.meta as any).env?.VITE_METERIAL_OFFICE_SHEET_NAME || localStorage.getItem('accounting_meterial_office_sheet_name') || 'Truck_Tuk Tuk',
      geminiApiKey: localStorage.getItem('ial_gemini_api_key') || '',
      postgresBackupAutoEnabled: true,
      postgresBackupMode: 'DAILY_TIME',
      postgresBackupTime: '18:00',
      postgresBackupIntervalHours: 1,
      postgresBackupIntervalMinutes: 0
    };
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const OLD_DEFAULT_WEBAPP = 'https://script.google.com/macros/s/AKfycbxJfGBTd2iGI3cf2xaIs19p1Oha6QxbS5Rquu0NH7ZAbzrTMUdimG_LE3DynlEU6pQReA/exec';
        const PREV_DEFAULT_WEBAPP = 'https://script.google.com/macros/s/AKfycbw0C-jQBibG1-Z--3ZoQ15mQVhUKf73mJgvNzcDsE8Cdy7MpZ0kA4Gv0OfXGBYan0rXXg/exec';
        const PREV_V2_DEFAULT_WEBAPP = 'https://script.google.com/macros/s/AKfycbzLT1Yymc5zMv4lwldSQ0ft_LxcSbfdenvMzzQICKRb1gHGLGQFeCPis2tj3lwb3gPEXg/exec';
        const PREV_V3_DEFAULT_WEBAPP = 'https://script.google.com/macros/s/AKfycbxpbFtdZgdXUUWU6DJiU5uxiQSEat4t6wSVOy3xKsuBM13giEm1j54MmjsOjowJ6jc5cA/exec';
        const PREV_V4_DEFAULT_WEBAPP = 'https://script.google.com/macros/s/AKfycbw2LXj5geGy_GNMQ-YhvHeQTcsoGHMS3dcoxvTCX6dZesG1FHtYNLku9jMG3HtYiH138Q/exec';
        const PREV_V5_DEFAULT_WEBAPP = 'https://script.google.com/macros/s/AKfycbygSQiOEQX0ip8yb3wcw7Rctjv884tm6BGluiUkkSdxySMfdjtXwvAWS-NEky-HaBr0vQ/exec';
        const PREV_V6_DEFAULT_WEBAPP = 'https://script.google.com/macros/s/AKfycbxSYmPsF37ycoH9jnEmrK1xBZR9U1zhimCvzWNeedeAkMrjLykCAwW6nuRXVhIEjSq0gw/exec';
        const PREV_V7_DEFAULT_WEBAPP = 'https://script.google.com/macros/s/AKfycbz9GbgPEUiOY0i82VO2WahnXW89K5yO1g7hZlNiYIeD2zKXyEwimkUTBNDAflo0bKrXYA/exec';
        const PREV_V8_DEFAULT_WEBAPP = 'https://script.google.com/macros/s/AKfycbws4AAj2sTC2rDPRk4gBKsEsHUX80Qf1BJ1kf7Lyhgo_MbtoJAvmDmjBBCQlgu41PJFIQ/exec';
        const effectiveUrl = (
          parsed.webAppUrl &&
          parsed.webAppUrl.trim().startsWith('https://script.google.com/macros/s/') &&
          parsed.webAppUrl.trim() !== OLD_DEFAULT_WEBAPP &&
          parsed.webAppUrl.trim() !== PREV_DEFAULT_WEBAPP &&
          parsed.webAppUrl.trim() !== PREV_V2_DEFAULT_WEBAPP &&
          parsed.webAppUrl.trim() !== PREV_V3_DEFAULT_WEBAPP &&
          parsed.webAppUrl.trim() !== PREV_V4_DEFAULT_WEBAPP &&
          parsed.webAppUrl.trim() !== PREV_V5_DEFAULT_WEBAPP &&
          parsed.webAppUrl.trim() !== PREV_V6_DEFAULT_WEBAPP &&
          parsed.webAppUrl.trim() !== PREV_V7_DEFAULT_WEBAPP &&
          parsed.webAppUrl.trim() !== PREV_V8_DEFAULT_WEBAPP
        )
          ? parsed.webAppUrl.trim()
          : CURRENT_DEFAULT_WEBAPP;
        const effectiveSheetId = (parsed.spreadsheetId && parsed.spreadsheetId !== '1SOAJ0-ipwJ6iSvEzMGqwny7ofbKTjsdnVdvz8eYLtnw')
          ? parsed.spreadsheetId.trim()
          : '18prsAT5KK6EwPPJFEX7gcldPJPrvXGD0FJ7eE1ceI-k';
        const effectiveClientId = (parsed.googleClientId && parsed.googleClientId.trim())
          ? parsed.googleClientId.trim()
          : defaults.googleClientId;
        const effectiveAdminPin = (parsed.adminPin && parsed.adminPin.trim())
          ? parsed.adminPin.trim()
          : defaults.adminPin;
        const migrated: AppSettings = {
          ...defaults,
          ...parsed,
          webAppUrl: effectiveUrl,
          spreadsheetId: effectiveSheetId,
          driveFolderId: safeTrim(parsed.driveFolderId) || defaults.driveFolderId,
          googleClientId: effectiveClientId,
          adminPin: effectiveAdminPin,
          telegramBotToken: safeTrim(parsed.telegramBotToken) || defaults.telegramBotToken,
          telegramChatId: safeTrim(parsed.telegramChatId) || defaults.telegramChatId,
          telegramPaymentBotToken: safeTrim(parsed.telegramPaymentBotToken) || defaults.telegramPaymentBotToken,
          telegramPaymentChatId: safeTrim(parsed.telegramPaymentChatId) || defaults.telegramPaymentChatId,
          telegramSlipBotToken: safeTrim(parsed.telegramSlipBotToken) || defaults.telegramSlipBotToken,
          telegramSlipChatId: safeTrim(parsed.telegramSlipChatId) || defaults.telegramSlipChatId,
          telegramSlipAlertsEnabled: parsed.telegramSlipAlertsEnabled !== undefined ? parsed.telegramSlipAlertsEnabled : defaults.telegramSlipAlertsEnabled,
          telegramDistributionBotToken: safeTrim(parsed.telegramDistributionBotToken) || (defaults.telegramDistributionBotToken || ''),
          telegramDistributionChatId: safeTrim(parsed.telegramDistributionChatId) || (defaults.telegramDistributionChatId || ''),
          telegramDailySummaryEnabled: parsed.telegramDailySummaryEnabled !== undefined ? parsed.telegramDailySummaryEnabled : (defaults.telegramDailySummaryEnabled !== false),
          telegramDailySummaryTime: normalizeDailySummaryTime(parsed.telegramDailySummaryTime),

          dataBmSheetUrl: (parsed.dataBmSheetUrl && parsed.dataBmSheetUrl.trim()) ? parsed.dataBmSheetUrl.trim() : (localStorage.getItem('accounting_data_bm_sheet_url') || defaults.dataBmSheetUrl),
          dataBmSheetName: (parsed.dataBmSheetName && parsed.dataBmSheetName.trim()) ? parsed.dataBmSheetName.trim() : (localStorage.getItem('accounting_data_bm_sheet_name') || defaults.dataBmSheetName),
          followupBmSheetUrl: (parsed.followupBmSheetUrl && parsed.followupBmSheetUrl.trim()) ? parsed.followupBmSheetUrl.trim() : (localStorage.getItem('accounting_followup_bm_sheet_url') || defaults.followupBmSheetUrl),
          followupBmSheetName: (parsed.followupBmSheetName && parsed.followupBmSheetName.trim()) ? parsed.followupBmSheetName.trim() : (localStorage.getItem('accounting_followup_bm_sheet_name') || defaults.followupBmSheetName),
          sokimexSheetUrl: (parsed.sokimexSheetUrl && parsed.sokimexSheetUrl.trim()) ? parsed.sokimexSheetUrl.trim() : (localStorage.getItem('accounting_sokimex_sheet_url') || defaults.sokimexSheetUrl),
          sokimexSheetName: (parsed.sokimexSheetName && parsed.sokimexSheetName.trim()) ? parsed.sokimexSheetName.trim() : (localStorage.getItem('accounting_sokimex_sheet_name') || defaults.sokimexSheetName),
          dataReportSheetUrl: (parsed.dataReportSheetUrl && parsed.dataReportSheetUrl.trim()) ? parsed.dataReportSheetUrl.trim() : (localStorage.getItem('accounting_data_report_sheet_url') || defaults.dataReportSheetUrl),
          dataReportSheetName: (parsed.dataReportSheetName && parsed.dataReportSheetName.trim()) ? parsed.dataReportSheetName.trim() : (localStorage.getItem('accounting_data_report_sheet_name') || defaults.dataReportSheetName),
          meterialOfficeSheetUrl: (parsed.meterialOfficeSheetUrl && parsed.meterialOfficeSheetUrl.trim()) ? parsed.meterialOfficeSheetUrl.trim() : (localStorage.getItem('accounting_meterial_office_sheet_url') || defaults.meterialOfficeSheetUrl),
          meterialOfficeSheetName: (parsed.meterialOfficeSheetName && parsed.meterialOfficeSheetName.trim()) ? parsed.meterialOfficeSheetName.trim() : (localStorage.getItem('accounting_meterial_office_sheet_name') || defaults.meterialOfficeSheetName),
          geminiApiKey: (parsed.geminiApiKey && parsed.geminiApiKey.trim()) ? parsed.geminiApiKey.trim() : (localStorage.getItem('ial_gemini_api_key') || defaults.geminiApiKey || ''),
          postgresBackupAutoEnabled: parsed.postgresBackupAutoEnabled !== undefined ? parsed.postgresBackupAutoEnabled : true,
          postgresBackupMode: parsed.postgresBackupMode || 'DAILY_TIME',
          postgresBackupTime: (parsed.postgresBackupTime && parsed.postgresBackupTime.trim()) ? parsed.postgresBackupTime.trim() : '18:00',
          postgresBackupIntervalHours: parsed.postgresBackupIntervalHours !== undefined ? Number(parsed.postgresBackupIntervalHours) : 1,
          postgresBackupIntervalMinutes: parsed.postgresBackupIntervalMinutes !== undefined ? Number(parsed.postgresBackupIntervalMinutes) : 0
        };
        safeLocalStorageSet(STORAGE_KEY_SETTINGS, JSON.stringify(migrated));
        return migrated;
      } catch (e) { }
    }
    return defaults;
  });


  const handleLoginSuccess = (user: AuthUser) => {
    const userEmail = user.email.toLowerCase().trim();
    const isMaster = isMasterAdmin(userEmail);
    const existing = permissions.find(p => p.email.toLowerCase() === userEmail);
    // Strict Whitelist Enforcement: Block any user not in permissions (unless Master Admin)
    if (!isMaster && !existing) {
      showToast(`⚠️ គណនី ${user.email} មិនទាន់ត្រូវបាន Admin បន្ថែមក្នុងប្រព័ន្ធកំណត់សិទ្ធិឡើយ!`, 'error');
      return;
    }

    if (existing && existing.status === 'SUSPENDED') {
      showToast('⚠️ គណនីរបស់អ្នកត្រូវបានផ្អាកការប្រើប្រាស់ (Account Suspended)!', 'error');
      return;
    }

    // Strict Operator Resolution based on actual authenticated login email
    const opInfo = resolveOperator({ email: user.email, name: user.name }, permissions);
    user.name = opInfo.name;

    let permToSave: UserPermission | null = null;

    if (isMaster) {
      // Master Admin has permanent full ADMIN role
      user.role = 'ADMIN';
      user.viewOnlyOwn = false;
      user.canCreate = true;
      user.canEdit = true;
      user.canDelete = true;
      user.allowedPages = [...ALL_CONFIGURABLE_NAV_PAGES];
      const masterPerm = permissions.find(p => isMasterAdmin(p.email)) || DEFAULT_MASTER_ADMIN;
      permToSave = { ...masterPerm, name: opInfo.name, role: 'ADMIN', status: 'ACTIVE', viewOnlyOwn: false, canCreate: true, canEdit: true, canDelete: true, allowedPages: [...ALL_CONFIGURABLE_NAV_PAGES], lastLogin: new Date().toISOString() };
      const updatedPermissions = permissions.some(p => isMasterAdmin(p.email))
        ? permissions.map(p => isMasterAdmin(p.email) ? permToSave! : p)
        : [permToSave, ...permissions];
      savePermissions(updatedPermissions);
    } else if (userEmail === IAL_ACCOUNTING_EMAIL) {
      user.name = 'IAL Accounting';
      const ialPerm = permissions.find(p => p.email.toLowerCase().trim() === IAL_ACCOUNTING_EMAIL) || DEFAULT_IAL_ACCOUNTING;
      user.role = ialPerm.role;
      user.viewOnlyOwn = isMaster ? false : Boolean(ialPerm.viewOnlyOwn);
      user.canCreate = ialPerm.canCreate !== undefined ? ialPerm.canCreate : true;
      user.canEdit = ialPerm.canEdit !== undefined ? ialPerm.canEdit : true;
      user.canDelete = ialPerm.canDelete !== undefined ? ialPerm.canDelete : true;
      user.allowedPages = ialPerm.allowedPages || [...ALL_CONFIGURABLE_NAV_PAGES];
      permToSave = { ...ialPerm, name: 'IAL Accounting', status: 'ACTIVE', allowedPages: user.allowedPages, lastLogin: new Date().toISOString() };
      const updatedPermissions = permissions.some(p => p.email.toLowerCase().trim() === IAL_ACCOUNTING_EMAIL)
        ? permissions.map(p => p.email.toLowerCase().trim() === IAL_ACCOUNTING_EMAIL ? permToSave! : p)
        : [...permissions, permToSave];
      savePermissions(updatedPermissions);
    } else if (existing) {
      user.role = existing.role;
      user.viewOnlyOwn = isMaster ? false : Boolean(existing.viewOnlyOwn);
      user.canCreate = existing.canCreate;
      user.canEdit = existing.canEdit;
      user.canDelete = existing.canDelete;
      user.allowedPages = Array.isArray(existing.allowedPages) ? existing.allowedPages : getDefaultAllowedPages(existing.role);
      // Update last login
      permToSave = { ...existing, lastLogin: new Date().toISOString(), name: opInfo.name, allowedPages: user.allowedPages };
      const updatedPermissions = permissions.map(p =>
        p.id === existing.id ? permToSave! : p
      );
      savePermissions(updatedPermissions);
    }

    // 1. Sync to local database and Google Sheets (Backup) immediately!
    if (permToSave) {
      savePermission(permToSave).catch(err => console.warn('Database perm login save error:', err));
      savePermissionToGoogleSheets(permToSave, settings.webAppUrl, user.email).catch(err => console.warn('Google Sheets perm login save error:', err));
    }

    setCurrentUser(user);
    localStorage.removeItem('LOGGED_OUT_EXPLICITLY');
    safeLocalStorageSet(STORAGE_KEY_AUTH, JSON.stringify(user));
    showToast(`ស្វាគមន៍ការចូលប្រើប្រព័ន្ធ, ${user.name}! (${user.role})`, 'success');

    // 2. Audit Trail: Log user login activity
    logUserActivity({
      operator: opInfo.name,
      operatorEmail: opInfo.email,
      userName: opInfo.name,
      userEmail: opInfo.email,
      userRole: user.role,
      action: 'LOGIN',
      description: `បានចូលប្រើប្រាស់ប្រព័ន្ធ (Role: ${user.role})`
    }).catch(err => console.warn('Log login activity error:', err));
  };

  // Strict Whitelist Startup Check: If cached user is not in permissions and not Master Admin, force logout
  useEffect(() => {
    if (!currentUser || !currentUser.email) return;
    const userEmail = currentUser.email.toLowerCase().trim();
    const isMaster = isMasterAdmin(userEmail);

    if (isMaster) {
      return;
    }

    // If non-master user is cached in browser session but not found in permissions or suspended:
    if (permissions.length > 0) {
      const existing = permissions.find(p => p.email.toLowerCase().trim() === userEmail);
      if (!existing) {
        handleLogout();
        showToast('⚠️ គណនីរបស់អ្នកពុំទាន់មានក្នុងបញ្ជីសិទ្ធិឡើយ សូមទាក់ទង Admin!', 'error');
      } else if (existing.status === 'SUSPENDED') {
        handleLogout();
        showToast('⚠️ គណនីរបស់អ្នកត្រូវបានផ្អាកដោយ Admin!', 'error');
      }
    }
  }, [currentUser?.email, permissions]);

  const handleLogout = () => {
    if (currentUser) {
      const opInfo = resolveOperator(currentUser, permissions);
      logUserActivity({
        operator: opInfo.name,
        operatorEmail: opInfo.email,
        userName: opInfo.name,
        userEmail: opInfo.email,
        userRole: currentUser?.role || (isMasterAdmin(opInfo.email) ? 'ADMIN' : 'VIEWER'),
        action: 'LOGOUT',
        description: `បានចាកចេញពីប្រព័ន្ធ`
      }).catch(err => console.warn('Log logout activity error:', err));
    }
    setCurrentUser(null);
    clearAuthSession();
    showToast('បានចាកចេញពីប្រព័ន្ធដោយជោគជ័យ!', 'info');
  };

  // Listen for session expiry from API interceptor
  useEffect(() => {
    const handleExpired = () => {
      setCurrentUser(null);
      clearAuthSession();
      showToast('Session របស់អ្នកបានផុតកំណត់ហើយ សូមចូលប្រព័ន្ធម្តងទៀត', 'warning');
    };
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  // Session Inactivity & Auto-Logout Security Watchdog (Auto-logout after 8 hours inactivity or 12 hours max)
  useEffect(() => {
    if (!currentUser) return;

    let lastActive = Date.now();
    const updateActivity = () => {
      lastActive = Date.now();
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(evt => window.addEventListener(evt, updateActivity, { passive: true }));

    // Check interval every 2 minutes
    const interval = setInterval(() => {
      const now = Date.now();
      const INACTIVITY_TIMEOUT = 8 * 60 * 60 * 1000; // 8 hours of inactivity
      const isExpired = currentUser.sessionExpiresAt && now > currentUser.sessionExpiresAt;
      const isInactive = now - lastActive > INACTIVITY_TIMEOUT;

      if (isExpired || isInactive) {
        handleLogout();
        showToast('🔒 សុវត្ថិភាព៖ Session របស់អ្នកបានផុតកំណត់ដោយសារអសកម្មភាពយូរ! សូម Login ម្ដងទៀត។', 'info');
      }
    }, 2 * 60 * 1000);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, updateActivity));
      clearInterval(interval);
    };
  }, [currentUser]);

  // User Permissions Management Handlers (Admin Only)
  const handleAddUser = (newUser: Omit<UserPermission, 'id' | 'createdAt'>): boolean => {
    if (currentUser?.role !== 'ADMIN') {
      showToast('មានតែ Admin ទើបអាចបន្ថែមអ្នកប្រើប្រាស់បាន!', 'error');
      return false;
    }
    const isMaster = isMasterAdmin(newUser.email);
    const role = isMaster ? 'ADMIN' : newUser.role;
    const perm: UserPermission = {
      id: isMaster ? 'u-master-admin' : 'u-' + Date.now(),
      ...newUser,
      role: role,
      viewOnlyOwn: isMaster ? false : Boolean(newUser.viewOnlyOwn),
      canCreate: isMaster ? true : (newUser.canCreate !== undefined ? newUser.canCreate : (role !== 'VIEWER')),
      canEdit: isMaster ? true : (newUser.canEdit !== undefined ? newUser.canEdit : ['ADMIN', 'OWNER', 'GENERAL_MANAGER', 'MANAGER', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS_OPT'].includes(role)),
      canDelete: isMaster ? true : (newUser.canDelete !== undefined ? newUser.canDelete : ['ADMIN', 'OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT_MANAGER'].includes(role)),
      allowedPages: isMaster ? [...ALL_CONFIGURABLE_NAV_PAGES] : (Array.isArray(newUser.allowedPages) ? newUser.allowedPages : getDefaultAllowedPages(role)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = [perm, ...permissions.filter(p => p.email.toLowerCase() !== newUser.email.toLowerCase())];
    savePermissions(updated);

    // 1. Sync to Database
    savePermission(perm).catch(err => console.warn('Database perm save warning:', err));

    // 2. Auto-sync to Google Sheets Tab "Permissions" (Backup - Complete 13 Columns)
    savePermissionToGoogleSheets(perm, settings.webAppUrl, currentUser?.email).catch(err => console.warn('Google Sheets perm save warning:', err));

    showToast(`បានបន្ថែមអ្នកប្រើប្រាស់ ${newUser.email} ដោយជោគជ័យ!`, 'success');

    // Audit Trail: Log add user activity
    logUserActivity({
      operator: resolveOperator(currentUser, permissions).name,
      operatorEmail: resolveOperator(currentUser, permissions).email,
      action: 'ADD_USER',
      targetUserEmail: newUser.email,
      targetUserRole: newUser.role,
      description: `បានបន្ថែមអ្នកប្រើប្រាស់ថ្មី ${newUser.email} (Role: ${newUser.role})`
    }).catch(err => console.warn('Log add user error:', err));

    return true;
  };

  const handleUpdateRole = (id: string, newRole: UserRole) => {
    if (currentUser?.role !== 'ADMIN') {
      showToast('មានតែ Admin ទើបអាចកែប្រែកម្រិតសិទ្ធិ (Role) បាន!', 'error');
      return;
    }
    const targetUser = permissions.find(u => u.id === id || u.email.toLowerCase().trim() === id.toLowerCase().trim());
    if (targetUser && isMasterAdmin(targetUser.email)) {
      showToast('គណនី rathykim34@gmail.com គឺជា Master Admin មិនអាចកែប្រែសិទ្ធិបានដាច់ខាត!', 'error');
      return;
    }
    const targetEmail = targetUser?.email.toLowerCase().trim() || id.toLowerCase().trim();
    let updatedTarget: UserPermission | null = null;
    const updated = permissions.map(u => {
      if (u.id === id || u.email.toLowerCase().trim() === targetEmail) {
        updatedTarget = { ...u, role: newRole, updatedAt: new Date().toISOString() };
        return updatedTarget;
      }
      return u;
    });
    savePermissions(updated);

    // Sync to Database & Google Sheets (Backup)
    if (updatedTarget) {
      savePermission(updatedTarget).catch(err => console.warn('Database perm update warning:', err));
      savePermissionToGoogleSheets(updatedTarget, settings.webAppUrl, currentUser?.email).catch(err => console.warn('Google Sheets perm update warning:', err));
    }

    // If updated current user, update currentUser state as well
    if (targetUser && currentUser && targetUser.email.toLowerCase() === currentUser.email.toLowerCase()) {
      const updatedCurrent: AuthUser = { ...currentUser, role: newRole };
      setCurrentUser(updatedCurrent);
      safeLocalStorageSet(STORAGE_KEY_AUTH, JSON.stringify(updatedCurrent));
    }
    showToast('បានកែប្រែកម្រិតសិទ្ធិ (Role) រួចរាល់!', 'success');

    // Audit Trail: Log role update activity
    logUserActivity({
      operator: resolveOperator(currentUser, permissions).name,
      operatorEmail: resolveOperator(currentUser, permissions).email,
      action: 'UPDATE_ROLE',
      targetUserEmail: targetUser?.email || id,
      targetUserRole: newRole,
      description: `បានប្តូរសិទ្ធិ ${targetUser?.email || id} ទៅជា ${newRole}`
    }).catch(err => console.warn('Log update role error:', err));
  };

  const handleToggleStatus = (id: string) => {
    if (currentUser?.role !== 'ADMIN') {
      showToast('មានតែ Admin ទើបអាចប្តូរស្ថានភាពគណនីបាន!', 'error');
      return;
    }
    const targetUser = permissions.find(u => u.id === id || u.email.toLowerCase().trim() === id.toLowerCase().trim());
    if (targetUser && isMasterAdmin(targetUser.email)) {
      showToast('គណនី rathykim34@gmail.com គឺជា Master Admin មិនអាចផ្អាកដំណើរការបានដាច់ខាត!', 'error');
      return;
    }
    const targetEmail = targetUser?.email.toLowerCase().trim() || id.toLowerCase().trim();
    let updatedTarget: UserPermission | null = null;
    const updated = permissions.map(u => {
      if (u.id === id || u.email.toLowerCase().trim() === targetEmail) {
        const nextStatus: 'ACTIVE' | 'SUSPENDED' = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
        updatedTarget = { ...u, status: nextStatus, updatedAt: new Date().toISOString() };
        return updatedTarget;
      }
      return u;
    });
    savePermissions(updated);

    // Sync to Database & Google Sheets (Backup)
    if (updatedTarget) {
      savePermission(updatedTarget).catch(err => console.warn('Database perm status warning:', err));
      savePermissionToGoogleSheets(updatedTarget, settings.webAppUrl, currentUser?.email).catch(err => console.warn('Google Sheets perm status warning:', err));
    }
    showToast('បានប្តូរស្ថានភាពគណនីរួចរាល់!', 'info');

    // Audit Trail: Log status toggle activity
    logUserActivity({
      operator: resolveOperator(currentUser, permissions).name,
      operatorEmail: resolveOperator(currentUser, permissions).email,
      action: 'CHANGE_STATUS',
      targetUserEmail: targetUser?.email || id,
      description: `បានប្តូរស្ថានភាព ${targetUser?.email || id} ទៅជា ${targetUser?.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'}`
    }).catch(err => console.warn('Log toggle status error:', err));
  };

  const handleToggleViewOnlyOwn = (id: string) => {
    if (currentUser?.role !== 'ADMIN') {
      showToast('មានតែ Admin ទើបអាចប្តូរសិទ្ធិមើលទិន្នន័យបាន!', 'error');
      return;
    }
    const targetUser = permissions.find(u => u.id === id || u.email.toLowerCase().trim() === id.toLowerCase().trim());
    if (targetUser && isMasterAdmin(targetUser.email)) {
      showToast('គណនី Master Admin មើលឃើញទិន្នន័យទាំងអស់ជាអចិន្ត្រៃយ៍!', 'info');
      return;
    }
    const targetEmail = targetUser?.email.toLowerCase().trim() || id.toLowerCase().trim();
    let updatedTarget: UserPermission | null = null;
    const updated = permissions.map(u => {
      if (u.id === id || u.email.toLowerCase().trim() === targetEmail) {
        updatedTarget = { ...u, viewOnlyOwn: !u.viewOnlyOwn, updatedAt: new Date().toISOString() };
        return updatedTarget;
      }
      return u;
    });
    savePermissions(updated);

    // Sync to Database & Google Sheets (Backup)
    if (updatedTarget) {
      savePermission(updatedTarget).catch(err => console.warn('Database perm viewOnlyOwn warning:', err));
      savePermissionToGoogleSheets(updatedTarget, settings.webAppUrl, currentUser?.email).catch(err => console.warn('Google Sheets perm viewOnlyOwn warning:', err));

      if (currentUser && ((updatedTarget as UserPermission).email.toLowerCase().trim() === currentUser.email.toLowerCase().trim() || (updatedTarget as UserPermission).id === currentUser.id)) {
        const updatedMe: AuthUser = { ...currentUser, viewOnlyOwn: (updatedTarget as UserPermission).viewOnlyOwn };
        setCurrentUser(updatedMe);
        safeLocalStorageSet(STORAGE_KEY_AUTH, JSON.stringify(updatedMe));
      }
    }
    showToast(`បានប្តូរសិទ្ធិមើលទិន្នន័យ៖ ${updatedTarget?.viewOnlyOwn ? 'មើលតែរបស់ខ្លួនឯង (Own Only)' : 'មើលទិន្នន័យទាំងអស់ (All Data)'}`, 'success');
  };

  const handleDeleteUser = (id: string, email?: string) => {
    if (currentUser?.role !== 'ADMIN') {
      showToast('មានតែ Admin ទើបអាចលុបអ្នកប្រើប្រាស់បាន!', 'error');
      return;
    }
    const targetUser = permissions.find(u => u.id === id || (email && u.email.toLowerCase().trim() === email.toLowerCase().trim()));
    const targetEmail = (email || targetUser?.email || '').toLowerCase().trim();

    if (isMasterAdmin(targetEmail)) {
      showToast('គណនី rathykim34@gmail.com គឺជា Master Admin មិនអាចលុបចេញបានដាច់ខាត!', 'error');
      return;
    }

    const updated = permissions.filter(u => {
      const matchId = u.id === id || (targetUser && u.id === targetUser.id);
      const matchEmail = Boolean(targetEmail && u.email.toLowerCase().trim() === targetEmail);
      return !matchId && !matchEmail;
    });
    savePermissions(updated);

    if (targetEmail || id) {
      deletePermission(targetEmail).catch(err => console.warn('Database perm delete warning:', err));
      deletePermissionFromGoogleSheets(targetEmail, settings.webAppUrl, currentUser?.email, targetUser?.id || id).catch(err => console.warn('Google Sheets perm delete warning:', err));
    }
    showToast(`បានលុបគណនី ${targetEmail || id} ចេញពីប្រព័ន្ធរួចរាល់!`, 'info');

    // Audit Trail: Log delete user activity
    logUserActivity({
      operator: resolveOperator(currentUser, permissions).name,
      operatorEmail: resolveOperator(currentUser, permissions).email,
      action: 'DELETE_USER',
      targetUserEmail: targetEmail || id,
      description: `បានលុបអ្នកប្រើប្រាស់ ${targetEmail || id}`
    }).catch(err => console.warn('Log delete user error:', err));
  };

  const handleEditUser = (updatedUser: UserPermission) => {
    if (currentUser?.role !== 'ADMIN') {
      showToast('មានតែ Admin ទើបអាចកែប្រែព័ត៌មានអ្នកប្រើប្រាស់បាន!', 'error');
      return;
    }
    const targetEmail = updatedUser.email.toLowerCase().trim();
    const isMaster = isMasterAdmin(targetEmail);
    if (isMaster) {
      updatedUser.role = 'ADMIN';
      updatedUser.status = 'ACTIVE';
      updatedUser.viewOnlyOwn = false;
      updatedUser.canCreate = true;
      updatedUser.canEdit = true;
      updatedUser.canDelete = true;
      updatedUser.allowedPages = [...ALL_CONFIGURABLE_NAV_PAGES];
    }
    updatedUser.updatedAt = new Date().toISOString();

    const updated = permissions.map(u => {
      if (u.id === updatedUser.id || u.email.toLowerCase().trim() === targetEmail) {
        return {
          ...u,
          ...updatedUser,
          name: updatedUser.name?.trim() || u.name,
          role: isMaster ? 'ADMIN' : updatedUser.role,
          status: isMaster ? 'ACTIVE' : updatedUser.status,
          viewOnlyOwn: isMaster ? false : updatedUser.viewOnlyOwn,
          canCreate: isMaster ? true : updatedUser.canCreate,
          canEdit: isMaster ? true : updatedUser.canEdit,
          canDelete: isMaster ? true : updatedUser.canDelete,
          allowedPages: isMaster ? [...ALL_CONFIGURABLE_NAV_PAGES] : updatedUser.allowedPages,
          updatedAt: updatedUser.updatedAt
        };
      }
      return u;
    });
    savePermissions(updated);

    savePermission(updatedUser).catch(err => console.warn('Database perm edit warning:', err));
    savePermissionToGoogleSheets(updatedUser, settings.webAppUrl, currentUser?.email).catch(err => console.warn('Google Sheets perm edit warning:', err));

    // If updated current user, update currentUser state as well
    if (currentUser && targetEmail === currentUser.email.toLowerCase().trim()) {
      const updatedCurrent: AuthUser = {
        ...currentUser,
        name: updatedUser.name || currentUser.name,
        role: updatedUser.role,
        viewOnlyOwn: isMaster ? false : Boolean(updatedUser.viewOnlyOwn),
        canCreate: isMaster ? true : updatedUser.canCreate,
        canEdit: isMaster ? true : updatedUser.canEdit,
        canDelete: isMaster ? true : updatedUser.canDelete,
        allowedPages: isMaster ? [...ALL_CONFIGURABLE_NAV_PAGES] : updatedUser.allowedPages
      };
      setCurrentUser(updatedCurrent);
      safeLocalStorageSet(STORAGE_KEY_AUTH, JSON.stringify(updatedCurrent));
    }

    showToast(`បានកែប្រែព័ត៌មានអ្នកប្រើប្រាស់ ${updatedUser.name || updatedUser.email} រួចរាល់!`, 'success');

    // Audit Trail: Log user edit activity
    logUserActivity({
      operator: resolveOperator(currentUser, permissions).name,
      operatorEmail: resolveOperator(currentUser, permissions).email,
      action: 'UPDATE_ROLE',
      targetUserEmail: updatedUser.email,
      targetUserRole: updatedUser.role,
      description: `បានកែប្រែព័ត៌មានអ្នកប្រើប្រាស់ ${updatedUser.email} (ឈ្មោះ: ${updatedUser.name}, Role: ${updatedUser.role})`
    }).catch(err => console.warn('Log edit user error:', err));
  };

  // ⚡ AUTO-SYNC: Automatically push latest permissions to both Database and Google Sheets (All 13 Columns)
  const lastSyncedHashRef = React.useRef<string>('');
  useEffect(() => {
    if (!permissions || permissions.length === 0) return;

    const currentHash = JSON.stringify(permissions.map(p => ({
      email: p.email,
      role: p.role,
      status: p.status,
      viewOnlyOwn: p.viewOnlyOwn,
      canCreate: p.canCreate,
      canEdit: p.canEdit,
      canDelete: p.canDelete,
      allowedPages: p.allowedPages,
      allowedLocations: p.allowedLocations
    })));

    if (currentHash === lastSyncedHashRef.current) return;

    const timer = setTimeout(() => {
      lastSyncedHashRef.current = currentHash;
      // 1. Primary: Auto-sync to Database
      syncAllPermissions(permissions).catch(() => {});
      // 2. Backup: Auto-sync to Google Sheets with complete 13 columns
      if (settings.webAppUrl?.trim()) {
        syncAllPermissionsToGoogleSheets(permissions, settings.webAppUrl, currentUser?.email).catch(() => {});
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [permissions, settings.webAppUrl]);

  // ⚡ BACKUP SEED: Only if local cache has no data, check Google Sheets as emergency fallback
  useEffect(() => {
    if (!settings.webAppUrl?.trim()) return;

    // Only run if permissions has no non-default users (disaster recovery seed only)
    if (permissions.length <= 2) {
      fetchPermissionsFromGoogleSheets(settings.webAppUrl).then(sheetPerms => {
        if (sheetPerms && sheetPerms.length > 2) {
          setPermissions(prev => {
            if (prev.length <= 2) {
              safeLocalStorageSet(STORAGE_KEY_PERMISSIONS, JSON.stringify(sheetPerms));
              // Also populate database immediately
              syncAllPermissions(sheetPerms).catch(() => {});
              return sheetPerms;
            }
            return prev;
          });
        }
      }).catch(() => {});
    }
  }, [settings.webAppUrl]);

  // ⚡ PRIMARY DATABASE: Real-time synchronization with local database (user_permissions)
  useEffect(() => {
    // 1. Initial fetch from Database
    fetchPermissions().then(dbPerms => {
      if (Array.isArray(dbPerms) && dbPerms.length > 0) {
        setPermissions(dbPerms);
        safeLocalStorageSet(STORAGE_KEY_PERMISSIONS, JSON.stringify(dbPerms));
      }
    }).catch(err => console.warn('Database initial permissions load warning:', err));

    // 2. Real-time subscription to permissions changes
    const unsubscribe = subscribeToPermissions((freshPerms) => {
      if (Array.isArray(freshPerms) && freshPerms.length > 0) {
        setPermissions(freshPerms);
        safeLocalStorageSet(STORAGE_KEY_PERMISSIONS, JSON.stringify(freshPerms));
      }
    });

    return () => unsubscribe();
  }, []);

  // 🚀 MASTER DATABASE REAL-TIME SYNC: Continuous live synchronization with Hostinger Remote MySQL Master
  const isSyncingMasterRef = useRef(false);

  const areBatchesIdentical = (a: CollectionBatch[], b: CollectionBatch[]) => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const itemA = a[i];
      const itemB = b[i];
      if (
        itemA.id !== itemB.id ||
        itemA.batchNumber !== itemB.batchNumber ||
        itemA.totalItems !== itemB.totalItems ||
        itemA.totalUSD !== itemB.totalUSD ||
        itemA.totalKHR !== itemB.totalKHR ||
        itemA.createdAt !== itemB.createdAt
      ) {
        return false;
      }
    }
    return true;
  };

  /** Returns true when fresh master data was downloaded and applied. */
  const syncMasterData = useCallback(async (silent: boolean = true): Promise<boolean> => {
    if (isSyncingMasterRef.current) return false;
    isSyncingMasterRef.current = true;
    let applied = false;
    try {
      const master = await fetchAllMasterData();
      if (master && master.ok) {
        applied = true;
        // 1. Authoritative Batches Sync (General, Medicine, COD)
        if (Array.isArray(master.batches)) {
          setSavedBatches(prev => {
            if (areBatchesIdentical(prev, master.batches)) return prev;
            safeLocalStorageSet(STORAGE_KEY_BATCHES, JSON.stringify(master.batches));
            return master.batches;
          });
        }
        if (Array.isArray(master.medicineBatches)) {
          setMedicineBatches(prev => {
            if (areBatchesIdentical(prev, master.medicineBatches)) return prev;
            safeLocalStorageSet(STORAGE_KEY_MEDICINE_BATCHES, JSON.stringify(master.medicineBatches));
            return master.medicineBatches;
          });
        }
        if (Array.isArray(master.codBatches)) {
          setCodBatches(prev => {
            if (areBatchesIdentical(prev, master.codBatches)) return prev;
            safeLocalStorageSet(STORAGE_KEY_COD_BATCHES, JSON.stringify(master.codBatches));
            return master.codBatches;
          });
        }

        // 2. Payers & Permissions
        if (Array.isArray(master.payers) && master.payers.length > 0) {
          savePayersLocally(master.payers);
        }
        if (Array.isArray(master.permissions) && master.permissions.length > 0) {
          setPermissions(prev => {
            if (JSON.stringify(prev) === JSON.stringify(master.permissions)) return prev;
            safeLocalStorageSet(STORAGE_KEY_PERMISSIONS, JSON.stringify(master.permissions));
            return master.permissions;
          });
        }

        // 3. System Settings
        if (master.settings && typeof master.settings === 'object' && Object.keys(master.settings).length > 0) {
          setSettings(prev => {
            const cleanMaster: any = { ...master.settings };
            delete cleanMaster.darkMode;
            // The Apps Script URL comes from the build (VITE_GOOGLE_WEBAPP_URL), never from the DB:
            // a stale DB row kept pointing every browser at an old deployment running old code
            delete cleanMaster.webAppUrl;
            // Ensure IDs and tokens are strings
            if (cleanMaster.telegramPaymentChatId !== undefined) cleanMaster.telegramPaymentChatId = safeTrim(cleanMaster.telegramPaymentChatId);
            if (cleanMaster.telegramChatId !== undefined) cleanMaster.telegramChatId = safeTrim(cleanMaster.telegramChatId);
            if (cleanMaster.telegramBotToken !== undefined) cleanMaster.telegramBotToken = safeTrim(cleanMaster.telegramBotToken);
            if (cleanMaster.telegramPaymentBotToken !== undefined) cleanMaster.telegramPaymentBotToken = safeTrim(cleanMaster.telegramPaymentBotToken);
            if (cleanMaster.telegramSlipChatId !== undefined) cleanMaster.telegramSlipChatId = safeTrim(cleanMaster.telegramSlipChatId);
            if (cleanMaster.telegramSlipBotToken !== undefined) cleanMaster.telegramSlipBotToken = safeTrim(cleanMaster.telegramSlipBotToken);
            if (cleanMaster.telegramDistributionChatId !== undefined) cleanMaster.telegramDistributionChatId = safeTrim(cleanMaster.telegramDistributionChatId);
            if (cleanMaster.telegramDistributionBotToken !== undefined) cleanMaster.telegramDistributionBotToken = safeTrim(cleanMaster.telegramDistributionBotToken);
            if (cleanMaster.telegramLogChatId !== undefined) cleanMaster.telegramLogChatId = safeTrim(cleanMaster.telegramLogChatId);
            if (cleanMaster.telegramLogBotToken !== undefined) cleanMaster.telegramLogBotToken = safeTrim(cleanMaster.telegramLogBotToken);
            const updated = { ...prev, ...cleanMaster };
            if (JSON.stringify(prev) !== JSON.stringify(updated)) {
              safeLocalStorageSet(STORAGE_KEY_SETTINGS, JSON.stringify(updated));
              return updated;
            }
            return prev;
          });
        }

        // 3.5 Bank Slips from MySQL Master
        if (Array.isArray(master.bankSlips)) {
          try {
            safeLocalStorageSet('accounting_bank_slips_v1', JSON.stringify(master.bankSlips));
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('ial_bank_slips_updated', { detail: master.bankSlips }));
            }
          } catch {}
        }

        // 4. Warehouse Scans from MySQL Master
        if (Array.isArray(master.warehouseScans)) {
          try {
            const sorted = [...master.warehouseScans].sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            saveListCache('ial_warehouse_scans_data_v1', sorted, 5000);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('ial_warehouse_scans_updated', { detail: sorted }));
            }
          } catch {}
        }

        // 5. Distribution Reports from MySQL Master (authoritative — an empty list is valid, e.g. after deleting the last report)
        if (Array.isArray(master.distributionReports)) {
          try {
            const synced = applyServerDistributionReports(master.distributionReports);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('ial_distribution_reports_updated', { detail: synced }));
            }
          } catch {}
        }

        if (!silent) {
          showToast('✓ បានធ្វើបច្ចុប្បន្នភាពទិន្នន័យពី Master Database ដោយជោគជ័យ!', 'success');
        }
      }
    } catch (err) {
      console.warn('[App.tsx] Real-time master MySQL sync warning:', err);
      if (!silent) {
        showToast('⚠️ មិនអាចទាញទិន្នន័យពី Master Database: ' + ((err as any)?.message || 'Network error'), 'error');
      }
    } finally {
      isSyncingMasterRef.current = false;
    }
    return applied;
  }, []);

  // 🔄 Live polling: every 4s ask for a tiny version fingerprint (1 query) and download the full
  // master data (~17 queries, ~0.5MB) only when it changed, plus a full refresh every 60s as a safety net.
  const masterVersionRef = useRef<string | null>(null);
  const lastFullMasterSyncRef = useRef(0);
  const pollMasterData = useCallback(async () => {
    if (isSyncingMasterRef.current) return;
    const version = await fetchMasterDataVersion();
    const due = Date.now() - lastFullMasterSyncRef.current > 60000;
    if (version !== null && version === masterVersionRef.current && !due) return;
    if (await syncMasterData(true)) {
      lastFullMasterSyncRef.current = Date.now();
      masterVersionRef.current = version; // read before the download, so a change during it is caught next poll
    }
  }, [syncMasterData]);

  useEffect(() => {
    // Initial fetch
    pollMasterData();

    // Continuous Live Polling every 4 seconds when tab is active
    const pollInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        pollMasterData();
      }
    }, 4000);

    // Revalidate immediately on focus or tab visibility change
    const handleRevalidate = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        pollMasterData();
      }
    };

    window.addEventListener('focus', handleRevalidate);
    document.addEventListener('visibilitychange', handleRevalidate);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleRevalidate);
      document.removeEventListener('visibilitychange', handleRevalidate);
    };
  }, [pollMasterData]);

  // ⚡ REACTIVE SYNC: Keep active currentUser permissions (role, allowedPages, actions) instantly synced with permissions
  useEffect(() => {
    if (!currentUser?.email || !permissions || permissions.length === 0) return;
    const cleanEmail = currentUser.email.toLowerCase().trim();
    const isMaster = isMasterAdmin(cleanEmail);
    const myPerm = permissions.find(p => p.email.toLowerCase().trim() === cleanEmail);
    if (myPerm) {
      if (myPerm.status === 'SUSPENDED' && !isMaster) {
        handleLogout();
        showToast('⚠️ គណនីរបស់អ្នកត្រូវបានផ្អាកការប្រើប្រាស់ (Account Suspended)!', 'error');
        return;
      }

      const targetRole = isMaster ? 'ADMIN' : myPerm.role;
      const targetAllowedPages = isMaster
        ? [...ALL_CONFIGURABLE_NAV_PAGES]
        : (Array.isArray(myPerm.allowedPages)
            ? myPerm.allowedPages
            : getDefaultAllowedPages(targetRole));
      const targetViewOnlyOwn = isMaster ? false : Boolean(myPerm.viewOnlyOwn);
      const targetCanCreate = isMaster ? true : (myPerm.canCreate !== undefined ? myPerm.canCreate : (targetRole !== 'VIEWER'));
      const targetCanEdit = isMaster ? true : (myPerm.canEdit !== undefined ? myPerm.canEdit : ['ADMIN', 'OWNER', 'GENERAL_MANAGER', 'MANAGER', 'ACCOUNTANT_MANAGER', 'ACCOUNTANT', 'CS_TEAMS_OPT'].includes(targetRole));
      const targetCanDelete = isMaster ? true : (myPerm.canDelete !== undefined ? myPerm.canDelete : ['ADMIN', 'OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT_MANAGER'].includes(targetRole));

      const hasDiff =
        currentUser.role !== targetRole ||
        Boolean(currentUser.viewOnlyOwn) !== targetViewOnlyOwn ||
        currentUser.canCreate !== targetCanCreate ||
        currentUser.canEdit !== targetCanEdit ||
        currentUser.canDelete !== targetCanDelete ||
        JSON.stringify(currentUser.allowedPages || []) !== JSON.stringify(targetAllowedPages);

      if (hasDiff) {
        const updatedMe: AuthUser = {
          ...currentUser,
          role: targetRole,
          viewOnlyOwn: targetViewOnlyOwn,
          canCreate: targetCanCreate,
          canEdit: targetCanEdit,
          canDelete: targetCanDelete,
          allowedPages: targetAllowedPages
        };
        setCurrentUser(updatedMe);
        safeLocalStorageSet(STORAGE_KEY_AUTH, JSON.stringify(updatedMe));
      }
    }
  }, [permissions, currentUser?.email]);

  // 3. Payment Collection Batches State
  const [savedBatches, setSavedBatches] = useState<CollectionBatch[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_BATCHES);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { }
    }
    return [];
  });

  // Helper to merge incoming batches from server while preserving existing local items
  const mergeBatchesWithExisting = (serverBatches: CollectionBatch[], prevBatches: CollectionBatch[]): CollectionBatch[] => {
    if (!Array.isArray(serverBatches)) return prevBatches;
    const serverMap = new Map<string, CollectionBatch>();
    const merged = serverBatches.map(sb => {
      const key = sb.batchNumber || sb.id;
      if (key) serverMap.set(key, sb);
      const existing = prevBatches.find(p => (p.batchNumber && p.batchNumber === sb.batchNumber) || (p.id && p.id === sb.id));
      const serverHasItems = Array.isArray(sb.items) && sb.items.length > 0;
      const existingHasItems = existing && Array.isArray(existing.items) && existing.items.length > 0;
      return {
        ...sb,
        items: serverHasItems ? sb.items : (existingHasItems ? existing.items : (sb.items || []))
      };
    });

    // Do NOT resurrect batches that were deleted on the server.
    // Only preserve batches if they are explicitly marked unsaved local drafts.
    const localOnly = prevBatches.filter(p => {
      const key = p.batchNumber || p.id;
      const isDraft = (p as any).isDraft === true || (p.id && p.id.startsWith('draft-'));
      return Boolean(key && !serverMap.has(key) && isDraft);
    });

    return [...localOnly, ...merged];
  };

  // Real-time synchronization for Batches & Collection Items
  useEffect(() => {
    const unsubscribe = subscribeToBatches(
      (remoteBatches) => {
        if (Array.isArray(remoteBatches)) {
          setSavedBatches(prev => {
            const merged = mergeBatchesWithExisting(remoteBatches, prev);
            safeLocalStorageSet(STORAGE_KEY_BATCHES, JSON.stringify(merged));
            return merged;
          });
        }
      },
      (err) => {
        console.warn('Batches subscription warning:', err);
      }
    );
    return () => unsubscribe();
  }, []);

  // 3.1 Medicine Collection Batches State (Dedicated isolated batches for ថ្នាំពេទ្យ)
  const [medicineBatches, setMedicineBatches] = useState<CollectionBatch[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_MEDICINE_BATCHES);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { }
    }
    return [];
  });

  // Real-time synchronization for Medicine Batches
  useEffect(() => {
    const unsubscribe = subscribeToMedicineBatches(
      (remoteBatches) => {
        if (Array.isArray(remoteBatches)) {
          setMedicineBatches(prev => {
            const merged = mergeBatchesWithExisting(remoteBatches, prev);
            safeLocalStorageSet(STORAGE_KEY_MEDICINE_BATCHES, JSON.stringify(merged));
            return merged;
          });
        }
      },
      (err) => {
        console.warn('Medicine Batches subscription warning:', err);
      }
    );
    return () => unsubscribe();
  }, []);

  // 3.2 COD Collection Batches State (Dedicated isolated batches for ទទួលប្រាក់ COD)
  const [codBatches, setCodBatches] = useState<CollectionBatch[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_COD_BATCHES);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { }
    }
    return [];
  });

  // Real-time synchronization for COD Batches
  useEffect(() => {
    const unsubscribe = subscribeToCodBatches(
      (remoteBatches) => {
        if (Array.isArray(remoteBatches)) {
          setCodBatches(prev => {
            const merged = mergeBatchesWithExisting(remoteBatches, prev);
            safeLocalStorageSet(STORAGE_KEY_COD_BATCHES, JSON.stringify(merged));
            return merged;
          });
        }
      },
      (err) => {
        console.warn('COD Batches subscription warning:', err);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleCommitBatch = async (batchData: Omit<CollectionBatch, 'id' | 'createdAt'>): Promise<boolean> => {
    const isMaster = isMasterAdmin(currentUser?.email);
    const myPerm = permissions.find(p => p.email.toLowerCase().trim() === currentUser?.email?.toLowerCase().trim());
    const canCreate = isMaster || (myPerm?.canCreate !== undefined ? Boolean(myPerm.canCreate) : (currentUser?.canCreate !== undefined ? Boolean(currentUser.canCreate) : currentUser?.role !== 'VIEWER'));

    if (!canCreate || currentUser?.role === 'VIEWER') {
      showToast('⚠️ គណនីរបស់អ្នកគ្មានសិទ្ធិកត់ត្រា/បញ្ចូលទិន្នន័យឡើយ (No Create Permission)!', 'error');
      return false;
    }
    // Strict Operator Resolution based on actual authenticated login email
    const opInfo = resolveOperator(currentUser, permissions);
    const operatorName = opInfo.name !== 'Unknown' ? opInfo.name : (batchData.operator || 'Unknown');
    const operatorEmail = opInfo.email || batchData.operatorEmail || '';

    const newBatch: CollectionBatch = {
      ...batchData,
      operator: operatorName,
      operatorEmail: operatorEmail,
      id: batchData.batchNumber || ('batch-' + Date.now()),
      createdAt: getCurrentStandardDateTime(),
      syncedToGoogle: false,
      items: (batchData.items || []).map(it => ({
        ...it,
        date: formatToStandardDateTime(it.date),
        createdAt: formatToStandardDateTime(it.createdAt)
      }))
    };

    // 1. Authoritative Primary Database write (Hostinger MariaDB Master)
    try {
      await saveBatch(newBatch);
    } catch (saveErr: any) {
      showToast(`❌ ${saveErr?.message || 'បរាជ័យក្នុងការរក្សាទុកកញ្ចប់ទៅកាន់ Hostinger MariaDB Master!'}`, 'error');
      return false;
    }

    // 2. Only after Hostinger commits: update state & localStorage
    setSavedBatches(prev => {
      const updated = [newBatch, ...prev.filter(b => b.id !== newBatch.id && b.batchNumber !== newBatch.batchNumber)];
      safeLocalStorageSet(STORAGE_KEY_BATCHES, JSON.stringify(updated));
      return updated;
    });

    showToast(`✓ បានរក្សាទុកកញ្ចប់ ${newBatch.batchNumber} សរុប ${newBatch.totalItems} ប្រតិបត្តិការ ក្នុង Master Database ជោគជ័យ!`, 'success');

    // Audit Trail: Log batch commit activity
    logUserActivity({
      operator: operatorName,
      operatorEmail: operatorEmail,
      userName: operatorName,
      userEmail: operatorEmail,
      userRole: currentUser?.role || (isMasterAdmin(operatorEmail) ? 'ADMIN' : 'VIEWER'),
      action: 'COMMIT_BATCH',
      description: `បានកត់ត្រាកញ្ចប់ ${newBatch.batchNumber} (${newBatch.totalItems} ប្រតិបត្តិការ, USD: $${newBatch.totalUSD.toFixed(2)}, KHR: ${newBatch.totalKHR.toLocaleString()}៛)`,
      batchNumber: newBatch.batchNumber,
      amountUSD: newBatch.totalUSD,
      amountKHR: newBatch.totalKHR,
      itemsCount: newBatch.totalItems,
      metadata: {
        totalItems: newBatch.totalItems,
        totalUSD: newBatch.totalUSD,
        totalKHR: newBatch.totalKHR,
        reconciliation: newBatch.reconciliation
      }
    }).catch(err => console.warn('Log commit activity error:', err));

    // 3. High-speed asynchronous background notifications & backup mirrors
    (async () => {
      const tasks: Promise<any>[] = [];

      // A. Parallel Telegram Notification (Via secure Backend Proxy or Direct fallback)
      const payToken = (safeTrim(settings.telegramPaymentBotToken) || safeTrim(settings.telegramBotToken));
      const payChatId = (safeTrim(settings.telegramPaymentChatId) || safeTrim(settings.telegramChatId));

      if ((safeTrim(settings.webAppUrl) || payToken) && payChatId) {
        const text = formatBatchTelegramMessage(newBatch, false);

        tasks.push(
          sendTelegramNotification({
            webAppUrl: settings.webAppUrl,
            botToken: payToken,
            chatId: payChatId,
            text: text,
            parseMode: 'HTML',
            botType: 'PAYMENT'
          }).catch(err => console.warn('Telegram batch notification warning:', err))
        );
      }

      // Background Google Sheets mirror is already handled authoritatively by Hostinger MariaDB Master triggerBackgroundSyncToGoogle
      await Promise.allSettled(tasks);
    })();

    return true;
  };

  const handleDeleteBatch = async (id: string, batchNumber?: string): Promise<boolean> => {
    const isMaster = isMasterAdmin(currentUser?.email);
    const myPerm = permissions.find(p => p.email.toLowerCase().trim() === currentUser?.email?.toLowerCase().trim());
    const canDelete = isMaster || (myPerm?.canDelete !== undefined ? Boolean(myPerm.canDelete) : (currentUser?.canDelete !== undefined ? Boolean(currentUser.canDelete) : ['ADMIN', 'OWNER', 'GENERAL_MANAGER', 'ACCOUNTANT_MANAGER'].includes(currentUser?.role || '')));

    if (!canDelete || currentUser?.role === 'VIEWER') {
      showToast('⚠️ គណនីរបស់អ្នកគ្មានសិទ្ធិលុបទិន្នន័យឡើយ (No Delete Permission)!', 'error');
      return false;
    }
    const targetBatch = savedBatches.find(b => b.id === id || (batchNumber && b.batchNumber === batchNumber));
    const targetBatchNumber = batchNumber || targetBatch?.batchNumber || id;

    // 1. Authoritative Primary Database delete (Hostinger MariaDB Master)
    try {
      await deleteBatch(targetBatchNumber);
    } catch (delErr: any) {
      showToast(`❌ ${delErr?.message || 'បរាជ័យក្នុងការលុបកញ្ចប់ពី Hostinger MariaDB Master!'}`, 'error');
      return false;
    }

    // 2. Only after Hostinger confirms: remove from local state & localStorage
    const updated = savedBatches.filter(b => b.id !== id && b.batchNumber !== targetBatchNumber);
    setSavedBatches(updated);
    safeLocalStorageSet(STORAGE_KEY_BATCHES, JSON.stringify(updated));
    showToast(`✓ បានលុបកញ្ចប់ ${targetBatchNumber} ពី Master Database រួចរាល់!`, 'success');

    // Audit Trail: Log delete batch activity
    logUserActivity({
      operator: resolveOperator(currentUser, permissions).name,
      operatorEmail: resolveOperator(currentUser, permissions).email,
      action: 'DELETE_BATCH',
      description: `បានលុបកញ្ចប់ ${targetBatchNumber}`,
      batchNumber: targetBatchNumber
    }).catch(err => console.warn('Log delete batch error:', err));

    // 3. Also delete from Google Sheets in background (Backup 1 Mirror)
    if (settings.webAppUrl?.trim()) {
      const url = settings.webAppUrl.trim();
      fetch(getProxiedGasUrl(url), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete_batch',
          batchNumber: targetBatchNumber,
          id: id,
          user: currentUser?.email
        }),
        mode: 'no-cors'
      }).catch(() => { });

      // GET fallback for instant Google Apps Script execution
      fetch(getProxiedGasUrl(`${url}${url.includes('?') ? '&' : '?'}action=delete_batch&batchNumber=${encodeURIComponent(targetBatchNumber)}&id=${encodeURIComponent(id)}&t=${Date.now()}`), {
        mode: 'no-cors'
      }).catch(() => { });
    }

    return true;
  };

  const handleDeleteAllBatches = async (): Promise<boolean> => {
    if (currentUser?.role !== 'ADMIN') {
      showToast('មានតែ Admin ទើបអាចលុបទិន្នន័យទាំងអស់បាន!', 'error');
      return false;
    }
    try {
      await deleteAllBatches();
    } catch (delErr: any) {
      showToast(`❌ ${delErr?.message || 'បរាជ័យក្នុងការលុបកញ្ចប់ពី Hostinger MariaDB Master!'}`, 'error');
      return false;
    }

    // 1. Remove from local state & localStorage
    setSavedBatches([]);
    localStorage.removeItem(STORAGE_KEY_BATCHES);
    showToast('✓ បានសម្អាតកញ្ចប់ទាំងអស់ចេញពី Master Database រួចរាល់!', 'success');

    // Audit Trail: Log delete all batches activity
    logUserActivity({
      operator: resolveOperator(currentUser, permissions).name,
      operatorEmail: resolveOperator(currentUser, permissions).email,
      action: 'DELETE_ALL_BATCHES',
      description: `បានសម្អាតកញ្ចប់ទាំងអស់ចេញពីប្រព័ន្ធ`
    }).catch(err => console.warn('Log delete all batches error:', err));

    // 3. Also delete all batches from Google Sheets in background (Dual POST + GET)
    if (settings.webAppUrl?.trim()) {
      const url = settings.webAppUrl.trim();
      fetch(getProxiedGasUrl(url), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete_all_batches',
          user: currentUser?.email
        }),
        mode: 'no-cors'
      }).catch(err => {
        console.warn('Google Sheets background delete-all warning:', err);
      });

      // GET fallback
      fetch(getProxiedGasUrl(`${url}${url.includes('?') ? '&' : '?'}action=delete_all_batches&t=${Date.now()}`), {
        mode: 'no-cors'
      }).catch(() => { });
    }

    return true;
  };

  const handleResendTelegramBatch = async (batch: CollectionBatch): Promise<{ success: boolean; message: string }> => {
    try {
      const payToken = safeTrim(settings.telegramPaymentBotToken) || safeTrim(settings.telegramBotToken);
      const payChatId = safeTrim(settings.telegramPaymentChatId) || safeTrim(settings.telegramChatId);

      if (!payToken && !safeTrim(settings.webAppUrl)) {
        const msg = 'សូមកំណត់ Telegram Bot Token ឬ Web App URL ក្នុង Settings ជាមុនសិន!';
        showToast(msg, 'error');
        return { success: false, message: msg };
      }
      if (!payChatId) {
        const msg = 'សូមកំណត់ Telegram Chat ID ក្នុង Settings ជាមុនសិន!';
        showToast(msg, 'error');
        return { success: false, message: msg };
      }

      const text = formatBatchTelegramMessage(batch, true);

      const res = await sendTelegramNotification({
        webAppUrl: settings.webAppUrl,
        botToken: payToken,
        chatId: payChatId,
        text: text,
        parseMode: 'HTML',
        botType: 'PAYMENT'
      });

      if (res.success) {
        showToast(`🎉 បានផ្ញើកញ្ចប់ ${batch.batchNumber} ទៅកាន់ Telegram ដោយជោគជ័យ!`, 'success');

        // Audit Trail: Log resend telegram activity
        logUserActivity({
          operator: resolveOperator(currentUser, permissions).name,
          operatorEmail: resolveOperator(currentUser, permissions).email,
          action: 'RESEND_TELEGRAM',
          description: `បានផ្ញើកញ្ចប់ ${batch.batchNumber} ទៅ Telegram សារជាថ្មី`,
          batchNumber: batch.batchNumber
        }).catch(err => console.warn('Log resend telegram error:', err));

        return { success: true, message: 'Sent successfully' };
      } else {
        showToast(`⚠️ ផ្ញើមិនបានសម្រេច៖ ${res.message || 'Telegram API Error'}`, 'error');
        return { success: false, message: res.message || 'Telegram API Error' };
      }
    } catch (err: any) {
      showToast(`⚠️ កំហុសពេលផ្ញើ៖ ${err.message || 'Network error'}`, 'error');
      return { success: false, message: err.message || 'Network error' };
    }
  };

  // Medicine Batch Handlers
  const handleCommitMedicineBatch = async (batchData: Omit<CollectionBatch, 'id' | 'createdAt'>): Promise<boolean> => {
    if (currentUser?.role === 'VIEWER') {
      showToast('សិទ្ធិមើលប៉ុណ្ណោះ (Viewer) មិនអាចកត់ត្រាទិន្នន័យបានឡើយ!', 'error');
      return false;
    }
    const opInfo = resolveOperator(currentUser, permissions);
    const operatorName = opInfo.name !== 'Unknown' ? opInfo.name : (batchData.operator || 'Unknown');
    const operatorEmail = opInfo.email || batchData.operatorEmail || '';

    const newBatch: CollectionBatch = {
      ...batchData,
      operator: operatorName,
      operatorEmail: operatorEmail,
      id: batchData.batchNumber || ('med-batch-' + Date.now()),
      createdAt: getCurrentStandardDateTime(),
      syncedToGoogle: false,
      items: (batchData.items || []).map(it => ({
        ...it,
        date: formatToStandardDateTime(it.date),
        createdAt: formatToStandardDateTime(it.createdAt)
      }))
    };

    // 1. Authoritative Primary Database write (Hostinger MariaDB Master)
    try {
      await saveMedicineBatch(newBatch);
    } catch (saveErr: any) {
      showToast(`❌ ${saveErr?.message || 'បរាជ័យក្នុងការរក្សាទុកកញ្ចប់ថ្នាំពេទ្យទៅកាន់ Hostinger MariaDB Master!'}`, 'error');
      return false;
    }

    // 2. Only after Hostinger commits: update state & localStorage
    setMedicineBatches(prev => {
      const updated = [newBatch, ...prev.filter(b => b.id !== newBatch.id && b.batchNumber !== newBatch.batchNumber)];
      safeLocalStorageSet(STORAGE_KEY_MEDICINE_BATCHES, JSON.stringify(updated));
      return updated;
    });

    showToast(`✓ បានរក្សាទុកកញ្ចប់ថ្នាំពេទ្យ ${newBatch.batchNumber} សរុប ${newBatch.totalItems} ប្រតិបត្តិការ ក្នុង Master Database ជោគជ័យ!`, 'success');

    // Audit Trail: Log commit medicine activity
    logUserActivity({
      operator: operatorName,
      operatorEmail: operatorEmail,
      userName: operatorName,
      userEmail: operatorEmail,
      userRole: currentUser?.role || (isMasterAdmin(operatorEmail) ? 'ADMIN' : 'VIEWER'),
      action: 'COMMIT_MEDICINE_BATCH',
      description: `បានកត់ត្រាកញ្ចប់ថ្នាំពេទ្យ ${newBatch.batchNumber} (${newBatch.totalItems} ប្រតិបត្តិការ, USD: $${newBatch.totalUSD.toFixed(2)}, KHR: ${newBatch.totalKHR.toLocaleString()}៛)`,
      batchNumber: newBatch.batchNumber,
      amountUSD: newBatch.totalUSD,
      amountKHR: newBatch.totalKHR,
      itemsCount: newBatch.totalItems,
      metadata: {
        totalItems: newBatch.totalItems,
        totalUSD: newBatch.totalUSD,
        totalKHR: newBatch.totalKHR,
        reconciliation: newBatch.reconciliation
      }
    }).catch(err => console.warn('Log commit medicine activity error:', err));

    // 3. Background Telegram & Google Sheets sync
    (async () => {
      // Telegram Notification
      const payToken = (safeTrim(settings.telegramPaymentBotToken) || safeTrim(settings.telegramBotToken));
      const payChatId = (safeTrim(settings.telegramPaymentChatId) || safeTrim(settings.telegramChatId));

      if ((safeTrim(settings.webAppUrl) || payToken) && payChatId) {
        const text = formatBatchTelegramMessage(newBatch, false, 'MEDICINE');
        sendTelegramNotification({
          webAppUrl: settings.webAppUrl,
          botToken: payToken,
          chatId: payChatId,
          text: text,
          parseMode: 'HTML',
          botType: 'PAYMENT'
        }).catch(err => console.warn('Telegram medicine batch notification warning:', err));
      }
      // Background Google Sheets mirror is already handled authoritatively by Hostinger MariaDB Master triggerBackgroundSyncToGoogle
    })();

    return true;
  };

  const handleDeleteMedicineBatch = async (batchIdOrNumber: string, batchNumber?: string): Promise<boolean> => {
    if (currentUser?.role === 'VIEWER') {
      showToast('សិទ្ធិមើលប៉ុណ្ណោះ (Viewer) មិនអាចលុបទិន្នន័យបានឡើយ!', 'error');
      return false;
    }
    const target = medicineBatches.find(b => b.id === batchIdOrNumber || b.batchNumber === batchIdOrNumber || (batchNumber && (b.id === batchNumber || b.batchNumber === batchNumber)));
    const targetBatchNumber = batchNumber || target?.batchNumber || batchIdOrNumber;

    // 1. Authoritative Primary Database delete (Hostinger MariaDB Master)
    try {
      await deleteMedicineBatch(targetBatchNumber);
    } catch (delErr: any) {
      showToast(`❌ ${delErr?.message || 'បរាជ័យក្នុងការលុបកញ្ចប់ថ្នាំពេទ្យពី Hostinger MariaDB Master!'}`, 'error');
      return false;
    }

    // 2. Only after Hostinger confirms: remove from state & localStorage
    setMedicineBatches(prev => {
      const updated = prev.filter(b => b.id !== batchIdOrNumber && b.id !== targetBatchNumber && b.batchNumber !== targetBatchNumber && b.batchNumber !== batchIdOrNumber);
      safeLocalStorageSet(STORAGE_KEY_MEDICINE_BATCHES, JSON.stringify(updated));
      return updated;
    });

    showToast(`✓ បានលុបកញ្ចប់ថ្នាំពេទ្យ ${targetBatchNumber} ពី Master Database រួចរាល់!`, 'info');

    // Also delete from Google Sheets in background
    if (settings.webAppUrl?.trim()) {
      const url = settings.webAppUrl.trim();
      fetch(getProxiedGasUrl(url), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete_medicine_batch',
          batchNumber: targetBatchNumber,
          id: batchIdOrNumber,
          user: currentUser?.email
        }),
        mode: 'no-cors'
      }).catch(() => { });

      fetch(getProxiedGasUrl(`${url}${url.includes('?') ? '&' : '?'}action=delete_medicine_batch&batchNumber=${encodeURIComponent(targetBatchNumber)}&id=${encodeURIComponent(batchIdOrNumber)}&t=${Date.now()}`), {
        mode: 'no-cors'
      }).catch(() => { });
    }

    return true;
  };

  const handleDeleteAllMedicineBatches = async (): Promise<boolean> => {
    if (currentUser?.role !== 'ADMIN') {
      showToast('មានតែ Admin ទើបអាចលុបទិន្នន័យទាំងអស់បាន!', 'error');
      return false;
    }
    try {
      await deleteAllMedicineBatches();
    } catch (delErr: any) {
      showToast(`❌ ${delErr?.message || 'បរាជ័យក្នុងការលុបកញ្ចប់ថ្នាំពេទ្យពី Hostinger MariaDB Master!'}`, 'error');
      return false;
    }

    setMedicineBatches([]);
    localStorage.removeItem(STORAGE_KEY_MEDICINE_BATCHES);
    showToast('✓ បានសម្អាតកញ្ចប់ថ្នាំពេទ្យទាំងអស់ចេញពី Master Database រួចរាល់!', 'success');

    // Also delete from Google Sheets in background
    if (settings.webAppUrl?.trim()) {
      const url = settings.webAppUrl.trim();
      fetch(getProxiedGasUrl(url), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete_all_medicine_batches',
          user: currentUser?.email
        }),
        mode: 'no-cors'
      }).catch(() => { });

      fetch(getProxiedGasUrl(`${url}${url.includes('?') ? '&' : '?'}action=delete_all_medicine_batches&t=${Date.now()}`), {
        mode: 'no-cors'
      }).catch(() => { });
    }

    return true;
  };

  const handleResendMedicineTelegramBatch = async (batch: CollectionBatch): Promise<{ success: boolean; message: string }> => {
    try {
      const payToken = safeTrim(settings.telegramPaymentBotToken) || safeTrim(settings.telegramBotToken);
      const payChatId = safeTrim(settings.telegramPaymentChatId) || safeTrim(settings.telegramChatId);

      if (!payToken && !safeTrim(settings.webAppUrl)) {
        const msg = 'សូមកំណត់ Telegram Bot Token ឬ Web App URL ក្នុង Settings ជាមុនសិន!';
        showToast(msg, 'error');
        return { success: false, message: msg };
      }
      if (!payChatId) {
        const msg = 'សូមកំណត់ Telegram Chat ID ក្នុង Settings ជាមុនសិន!';
        showToast(msg, 'error');
        return { success: false, message: msg };
      }

      const text = formatBatchTelegramMessage(batch, true, 'MEDICINE');
      const res = await sendTelegramNotification({
        webAppUrl: settings.webAppUrl,
        botToken: payToken,
        chatId: payChatId,
        text: text,
        parseMode: 'HTML',
        botType: 'PAYMENT'
      });
      if (res.success) {
        showToast(`🎉 បានផ្ញើកញ្ចប់ថ្នាំពេទ្យ ${batch.batchNumber} ទៅកាន់ Telegram ដោយជោគជ័យ!`, 'success');
        return { success: true, message: 'Sent successfully' };
      } else {
        const msg = res.message || 'Telegram API Error';
        showToast(`⚠️ ផ្ញើមិនបានសម្រេច៖ ${msg}`, 'error');
        return { success: false, message: msg };
      }
    } catch (err: any) {
      const msg = err.message || 'Network error';
      showToast(`⚠️ កំហុសពេលផ្ញើ៖ ${msg}`, 'error');
      return { success: false, message: msg };
    }
  };

  // COD Batch Handlers
  const handleCommitCodBatch = async (batchData: Omit<CollectionBatch, 'id' | 'createdAt'>): Promise<boolean> => {
    if (currentUser?.role === 'VIEWER') {
      showToast('សិទ្ធិមើលប៉ុណ្ណោះ (Viewer) មិនអាចកត់ត្រាទិន្នន័យបានឡើយ!', 'error');
      return false;
    }
    const opInfo = resolveOperator(currentUser, permissions);
    const operatorName = opInfo.name !== 'Unknown' ? opInfo.name : (batchData.operator || 'Unknown');
    const operatorEmail = opInfo.email || batchData.operatorEmail || '';

    const newBatch: CollectionBatch = {
      ...batchData,
      operator: operatorName,
      operatorEmail: operatorEmail,
      id: batchData.batchNumber || ('cod-batch-' + Date.now()),
      createdAt: getCurrentStandardDateTime(),
      syncedToGoogle: false,
      items: (batchData.items || []).map(it => ({
        ...it,
        paymentMethod: 'COD',
        date: formatToStandardDateTime(it.date),
        createdAt: formatToStandardDateTime(it.createdAt)
      }))
    };

    // 1. Authoritative Primary Database write (Hostinger MariaDB Master tbl_cod_collections)
    try {
      await saveCodBatch(newBatch);
    } catch (saveErr: any) {
      showToast(`❌ ${saveErr?.message || 'បរាជ័យក្នុងការរក្សាទុកកញ្ចប់ COD ទៅកាន់ Hostinger MariaDB Master!'}`, 'error');
      return false;
    }

    // 2. Only after Hostinger commits: update state & localStorage
    setCodBatches(prev => {
      const updated = [newBatch, ...prev.filter(b => b.id !== newBatch.id && b.batchNumber !== newBatch.batchNumber)];
      safeLocalStorageSet(STORAGE_KEY_COD_BATCHES, JSON.stringify(updated));
      return updated;
    });

    showToast(`✓ បានរក្សាទុកកញ្ចប់ COD ${newBatch.batchNumber} សរុប ${newBatch.totalItems} ប្រតិបត្តិការ ក្នុង Master Database ជោគជ័យ!`, 'success');

    // Audit Trail: Log commit COD activity
    logUserActivity({
      operator: operatorName,
      operatorEmail: operatorEmail,
      userName: operatorName,
      userEmail: operatorEmail,
      userRole: currentUser?.role || (isMasterAdmin(operatorEmail) ? 'ADMIN' : 'VIEWER'),
      action: 'COMMIT_COD_BATCH',
      description: `បានកត់ត្រាកញ្ចប់ COD ${newBatch.batchNumber} (${newBatch.totalItems} ប្រតិបត្តិការ, USD: $${newBatch.totalUSD.toFixed(2)}, KHR: ${newBatch.totalKHR.toLocaleString()}៛)`,
      batchNumber: newBatch.batchNumber,
      amountUSD: newBatch.totalUSD,
      amountKHR: newBatch.totalKHR,
      itemsCount: newBatch.totalItems,
      metadata: {
        totalItems: newBatch.totalItems,
        totalUSD: newBatch.totalUSD,
        totalKHR: newBatch.totalKHR,
        reconciliation: newBatch.reconciliation
      }
    }).catch(err => console.warn('Log commit COD activity error:', err));

    // 3. Background Telegram & Google Sheets sync
    (async () => {
      const payToken = (safeTrim(settings.telegramPaymentBotToken) || safeTrim(settings.telegramBotToken));
      const payChatId = (safeTrim(settings.telegramPaymentChatId) || safeTrim(settings.telegramChatId));

      if ((safeTrim(settings.webAppUrl) || payToken) && payChatId) {
        const text = formatBatchTelegramMessage(newBatch, false, 'COD');
        sendTelegramNotification({
          webAppUrl: settings.webAppUrl,
          botToken: payToken,
          chatId: payChatId,
          text: text,
          parseMode: 'HTML',
          botType: 'PAYMENT'
        }).catch(err => console.warn('Telegram COD batch notification warning:', err));
      }
    })();

    return true;
  };

  const handleDeleteCodBatch = async (batchIdOrNumber: string, batchNumber?: string): Promise<boolean> => {
    if (currentUser?.role === 'VIEWER') {
      showToast('សិទ្ធិមើលប៉ុណ្ណោះ (Viewer) មិនអាចលុបទិន្នន័យបានឡើយ!', 'error');
      return false;
    }
    const target = codBatches.find(b => b.id === batchIdOrNumber || b.batchNumber === batchIdOrNumber || (batchNumber && (b.id === batchNumber || b.batchNumber === batchNumber)));
    const targetBatchNumber = batchNumber || target?.batchNumber || batchIdOrNumber;

    // 1. Authoritative Primary Database delete (Hostinger MariaDB Master)
    try {
      await deleteCodBatch(targetBatchNumber);
    } catch (delErr: any) {
      showToast(`❌ ${delErr?.message || 'បរាជ័យក្នុងការលុបកញ្ចប់ COD ពី Hostinger MariaDB Master!'}`, 'error');
      return false;
    }

    // 2. Only after Hostinger confirms: remove from state & localStorage
    setCodBatches(prev => {
      const updated = prev.filter(b => b.id !== batchIdOrNumber && b.id !== targetBatchNumber && b.batchNumber !== targetBatchNumber && b.batchNumber !== batchIdOrNumber);
      safeLocalStorageSet(STORAGE_KEY_COD_BATCHES, JSON.stringify(updated));
      return updated;
    });

    showToast(`✓ បានលុបកញ្ចប់ COD ${targetBatchNumber} ពី Master Database រួចរាល់!`, 'info');

    // Also delete from Google Sheets in background
    if (settings.webAppUrl?.trim()) {
      const url = settings.webAppUrl.trim();
      fetch(getProxiedGasUrl(url), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete_cod_batch',
          batchNumber: targetBatchNumber,
          id: batchIdOrNumber,
          user: currentUser?.email
        }),
        mode: 'no-cors'
      }).catch(() => { });

      fetch(getProxiedGasUrl(`${url}${url.includes('?') ? '&' : '?'}action=delete_cod_batch&batchNumber=${encodeURIComponent(targetBatchNumber)}&id=${encodeURIComponent(batchIdOrNumber)}&t=${Date.now()}`), {
        mode: 'no-cors'
      }).catch(() => { });
    }

    return true;
  };

  const handleDeleteAllCodBatches = async (): Promise<boolean> => {
    if (currentUser?.role !== 'ADMIN') {
      showToast('មានតែ Admin ទើបអាចលុបទិន្នន័យទាំងអស់បាន!', 'error');
      return false;
    }
    try {
      await deleteAllCodBatches();
    } catch (delErr: any) {
      showToast(`❌ ${delErr?.message || 'បរាជ័យក្នុងការលុបកញ្ចប់ COD ពី Hostinger MariaDB Master!'}`, 'error');
      return false;
    }

    setCodBatches([]);
    localStorage.removeItem(STORAGE_KEY_COD_BATCHES);
    showToast('✓ បានសម្អាតកញ្ចប់ COD ទាំងអស់ចេញពី Master Database រួចរាល់!', 'success');

    // Also delete from Google Sheets in background
    if (settings.webAppUrl?.trim()) {
      const url = settings.webAppUrl.trim();
      fetch(getProxiedGasUrl(url), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete_all_cod_batches',
          user: currentUser?.email
        }),
        mode: 'no-cors'
      }).catch(() => { });

      fetch(getProxiedGasUrl(`${url}${url.includes('?') ? '&' : '?'}action=delete_all_cod_batches&t=${Date.now()}`), {
        mode: 'no-cors'
      }).catch(() => { });
    }

    return true;
  };

  const handleResendCodTelegramBatch = async (batch: CollectionBatch): Promise<{ success: boolean; message: string }> => {
    try {
      const payToken = safeTrim(settings.telegramPaymentBotToken) || safeTrim(settings.telegramBotToken);
      const payChatId = safeTrim(settings.telegramPaymentChatId) || safeTrim(settings.telegramChatId);

      if (!payToken && !safeTrim(settings.webAppUrl)) {
        const msg = 'សូមកំណត់ Telegram Bot Token ឬ Web App URL ក្នុង Settings ជាមុនសិន!';
        showToast(msg, 'error');
        return { success: false, message: msg };
      }
      if (!payChatId) {
        const msg = 'សូមកំណត់ Telegram Chat ID ក្នុង Settings ជាមុនសិន!';
        showToast(msg, 'error');
        return { success: false, message: msg };
      }

      const text = formatBatchTelegramMessage(batch, true, 'COD');
      const res = await sendTelegramNotification({
        webAppUrl: settings.webAppUrl,
        botToken: payToken,
        chatId: payChatId,
        text: text,
        parseMode: 'HTML',
        botType: 'PAYMENT'
      });
      if (res.success) {
        showToast(`🎉 បានផ្ញើកញ្ចប់ COD ${batch.batchNumber} ទៅកាន់ Telegram ដោយជោគជ័យ!`, 'success');
        return { success: true, message: 'Sent successfully' };
      } else {
        const msg = res.message || 'Telegram API Error';
        showToast(`⚠️ ផ្ញើមិនបានសម្រេច៖ ${msg}`, 'error');
        return { success: false, message: msg };
      }
    } catch (err: any) {
      const msg = err.message || 'Network error';
      showToast(`⚠️ កំហុសពេលផ្ញើ៖ ${msg}`, 'error');
      return { success: false, message: msg };
    }
  };

  const handleSyncCodBatchesToGoogleSheets = async (silent = false): Promise<boolean> => {
    if (!settings.webAppUrl?.trim()) {
      if (!silent) showToast('សូមភ្ជាប់ Google Sheets Web App URL ក្នុងការកំណត់ជាមុនសិន!', 'error');
      return false;
    }
    try {
      const sanitizedBatches = codBatches.map(b => ({
        ...b,
        date: formatToStandardDateTime(b.date),
        createdAt: formatToStandardDateTime(b.createdAt),
        items: (b.items || []).map(it => ({
          ...it,
          date: formatToStandardDateTime(it.date),
          createdAt: formatToStandardDateTime(it.createdAt || b.createdAt)
        }))
      }));

      await fetch(getProxiedGasUrl(settings.webAppUrl.trim()), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'bulk_save_cod_batches',
          batches: sanitizedBatches,
          user: currentUser?.email
        }),
        mode: 'no-cors'
      });

      if (!silent) showToast(`✅ បានទាញទិន្នន័យ ${codBatches.length} កញ្ចប់ COD ចូល Google Sheets ជោគជ័យ!`, 'success');
      return true;
    } catch (e: any) {
      if (!silent) showToast('សមកាលកម្ម COD ទៅ Google Sheets មិនជោគជ័យ: ' + (e?.message || 'Network error'), 'error');
      return false;
    }
  };

  // 4. Payers / Remitters State (អ្នកប្រគល់ប្រាក់ - រក្សាទុកគ្រប់ ៧៨ នាក់ពី Database)
  const [payers, setPayers] = useState<Payer[]>(() => {
    let saved = localStorage.getItem(STORAGE_KEY_PAYERS);
    if (!saved) {
      saved = localStorage.getItem('accounting_app_payers_v1');
    }
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Immediately purge legacy dummy mock data
          const cleaned = parsed.filter(p => !isDummyMockPayer(p));
          safeLocalStorageSet(STORAGE_KEY_PAYERS, JSON.stringify(cleaned));
          return cleaned;
        }
      } catch (e) { }
    }
    return [];
  });

  const savePayersLocally = (updated: Payer[]) => {
    const cleaned = Array.isArray(updated) ? updated.filter(p => !isDummyMockPayer(p)) : [];
    setPayers(cleaned);
    safeLocalStorageSet(STORAGE_KEY_PAYERS, JSON.stringify(cleaned));
  };

  // 5. Database Records State (Google Sheets "Data" tab)
  // Kept in memory only: the full record list is larger than the browser's ~5MB localStorage limit,
  // and it is always re-fetched from Hostinger (the source of truth) anyway.
  const [databaseRecords, setDatabaseRecords] = useState<DatabaseRecord[]>(() => {
    try { localStorage.removeItem(STORAGE_KEY_DATABASE_RECORDS); } catch { /* ignore */ } // free space from the old cache
    return INITIAL_DATABASE_RECORDS;
  });

  const saveDatabaseRecords = (recs: DatabaseRecord[]) => {
    const json = JSON.stringify(recs);
    // Live polling re-fetches the same rows most of the time; skip the re-render when nothing changed
    setDatabaseRecords(prev => (JSON.stringify(prev) === json ? prev : recs));
  };

  const handleAddPayer = async (newPayerData: Omit<Payer, 'id' | 'createdAt'>): Promise<boolean> => {
    if (currentUser?.role === 'VIEWER') {
      showToast('សិទ្ធិមើលប៉ុណ្ណោះ (Viewer) មិនអាចបន្ថែមអ្នកប្រគល់ប្រាក់បានទេ!', 'error');
      return false;
    }
    const newPayer: Payer = {
      ...newPayerData,
      id: 'PAY-' + Math.floor(100 + Math.random() * 900),
      createdAt: new Date().toISOString()
    };
    const updated = [newPayer, ...payers];
    savePayersLocally(updated);

    // Save to Database (table: list_name)
    saveListName(newPayer).catch(() => {});

    if (settings.webAppUrl?.trim()) {
      try {
        fetch(getProxiedGasUrl(settings.webAppUrl.trim()), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'save_list_name',
            legacyAction: 'save_payer',
            payer: newPayer,
            user: currentUser?.email
          }),
          mode: 'no-cors'
        }).catch(() => { });
      } catch (e) { }
    }

    showToast(`បានចុះឈ្មោះអ្នកប្រគល់ប្រាក់ "${newPayer.name}" ជោគជ័យ!`, 'success');
    return true;
  };

  const handleUpdatePayer = async (id: string, updatedData: Partial<Payer>): Promise<boolean> => {
    if (currentUser?.role === 'VIEWER') {
      showToast('សិទ្ធិមើលប៉ុណ្ណោះ (Viewer) មិនអាចកែប្រែទិន្នន័យបានទេ!', 'error');
      return false;
    }
    let updatedPayer: Payer | null = null;
    const updated = payers.map(p => {
      if (p.id === id) {
        updatedPayer = { ...p, ...updatedData, updatedAt: new Date().toISOString() };
        return updatedPayer;
      }
      return p;
    });
    savePayersLocally(updated);

    if (updatedPayer) {
      // Update Database (table: list_name)
      saveListName(updatedPayer).catch(() => {});
    }

    if (updatedPayer && settings.webAppUrl?.trim()) {
      try {
        fetch(getProxiedGasUrl(settings.webAppUrl.trim()), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'save_list_name',
            legacyAction: 'save_payer',
            payer: updatedPayer,
            user: currentUser?.email
          }),
          mode: 'no-cors'
        }).catch(() => { });
      } catch (e) { }
    }

    showToast('បានកែប្រែព័ត៌មានអ្នកប្រគល់ប្រាក់រួចរាល់!', 'success');
    return true;
  };

  const handleDeletePayer = async (id: string): Promise<boolean> => {
    if (currentUser?.role === 'VIEWER') {
      showToast('សិទ្ធិមើលប៉ុណ្ណោះ (Viewer) មិនអាចលុបទិន្នន័យបានទេ!', 'error');
      return false;
    }
    const target = payers.find(p => p.id === id);
    const updated = payers.filter(p => p.id !== id);
    savePayersLocally(updated);

    // Delete from Database (table: list_name)
    deleteListName(id).catch(() => {});

    if (settings.webAppUrl?.trim()) {
      try {
        fetch(getProxiedGasUrl(settings.webAppUrl.trim()), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'delete_list_name',
            legacyAction: 'delete_payer',
            id: id,
            name: target?.name,
            user: currentUser?.email
          }),
          mode: 'no-cors'
        }).catch(() => { });
      } catch (e) { }
    }

    showToast('បានលុបអ្នកប្រគល់ប្រាក់ចេញពីបញ្ជី!', 'info');
    return true;
  };

  const handleSyncGooglePayers = async (): Promise<boolean> => {
    if (!settings.webAppUrl?.trim()) {
      showToast('សូមភ្ជាប់ Google Sheets Web App URL ជាមុនសិន!', 'error');
      return false;
    }
    try {
      showToast('កំពុងទាញយកទិន្នន័យ ៧៨ នាក់ពី Google Sheets...', 'info');

      // 1. Fetch fresh list_name directly from Google Sheets
      const res = await fetch(getProxiedGasUrl(`${settings.webAppUrl.trim()}?action=get_list_name&t=${Date.now()}`));
      if (res.ok) {
        const data = await res.json();
        if (data && data.status === 'success' && Array.isArray(data.data) && data.data.length > 0) {
          savePayersLocally(data.data);
          showToast(`ធ្វើសមកាលកម្មជោគជ័យ! ទទួលបាន ${data.data.length} នាក់ពី Google Sheets`, 'success');
          return true;
        }
      }

      // Fallback: try get_payers
      const fallbackRes = await fetch(getProxiedGasUrl(`${settings.webAppUrl.trim()}?action=get_payers&t=${Date.now()}`));
      if (fallbackRes.ok) {
        const data = await fallbackRes.json();
        if (data && data.status === 'success' && Array.isArray(data.data) && data.data.length > 0) {
          savePayersLocally(data.data);
          showToast(`ធ្វើសមកាលកម្មជោគជ័យ! ទទួលបាន ${data.data.length} នាក់ពី Google Sheets`, 'success');
          return true;
        }
      }

      // 2. Backup: send non-dummy payers to Google Sheets if valid
      const validPayers = payers.filter(p => !isDummyMockPayer(p));
      if (validPayers.length > 0) {
        await fetch(getProxiedGasUrl(settings.webAppUrl.trim()), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'sync_list_name',
            legacyAction: 'sync_payers',
            payers: validPayers,
            list_name: validPayers,
            user: currentUser?.email
          }),
          mode: 'no-cors'
        });
      }

      showToast('បានធ្វើសមកាលកម្មរួចរាល់!', 'success');
      return true;
    } catch (e: any) {
      showToast('សមកាលកម្មមិនជោគជ័យ: ' + (e?.message || 'Network error'), 'error');
      return false;
    }
  };

  const handleSyncGooglePermissions = async (): Promise<boolean> => {
    if (!settings.webAppUrl?.trim()) {
      showToast('សូមភ្ជាប់ Google Sheets Web App URL ជាមុនសិន!', 'error');
      return false;
    }
    try {
      showToast('កំពុងទាញយកសិទ្ធិអ្នកប្រើប្រាស់ពី Google Sheets (13 Columns)...', 'info');
      const sheetPerms = await fetchPermissionsFromGoogleSheets(settings.webAppUrl);
      if (sheetPerms && sheetPerms.length > 0) {
        const mergedList: UserPermission[] = [...permissions];
        for (const perm of sheetPerms) {
          if (perm.email) {
            const cleanEmail = perm.email.toLowerCase().trim();
            const idx = mergedList.findIndex(p => p.email.toLowerCase().trim() === cleanEmail);
            const isMaster = isMasterAdmin(cleanEmail);
            const existing = idx >= 0 ? mergedList[idx] : undefined;
            const merged: UserPermission = {
              ...existing,
              ...perm,
              name: isMaster ? 'KEUN RATHY' : (perm.name?.trim() || existing?.name || cleanEmail.split('@')[0]),
              role: isMaster ? 'ADMIN' : (perm.role || existing?.role || 'ACCOUNTANT'),
              status: isMaster ? 'ACTIVE' : (perm.status || existing?.status || 'ACTIVE'),
              allowedPages: isMaster
                ? [...ALL_CONFIGURABLE_NAV_PAGES]
                : (Array.isArray(perm.allowedPages)
                    ? perm.allowedPages
                    : (existing?.allowedPages || getDefaultAllowedPages(perm.role))),
              viewOnlyOwn: isMaster ? false : (perm.viewOnlyOwn !== undefined ? Boolean(perm.viewOnlyOwn) : (existing?.viewOnlyOwn ?? false)),
              canCreate: isMaster ? true : (perm.canCreate !== undefined ? Boolean(perm.canCreate) : (existing?.canCreate ?? true)),
              canEdit: isMaster ? true : (perm.canEdit !== undefined ? Boolean(perm.canEdit) : (existing?.canEdit ?? true)),
              canDelete: isMaster ? true : (perm.canDelete !== undefined ? Boolean(perm.canDelete) : (existing?.canDelete ?? false)),
              updatedAt: new Date().toISOString()
            };
            if (idx >= 0) {
              mergedList[idx] = merged;
            } else {
              mergedList.push(merged);
            }
            await savePermission(merged).catch(() => {});
          }
        }
        savePermissions(mergedList);
        showToast(`🎉 បាន Sync សិទ្ធិអ្នកប្រើប្រាស់ពី Google Sheets (${sheetPerms.length}) ជោគជ័យ!`, 'success');
        return true;
      }
      showToast('ពុំមានទិន្នន័យ Permissions ក្នុង Google Sheets នៅឡើយទេ', 'info');
      return false;
    } catch (e: any) {
      showToast('សមកាលកម្មសិទ្ធិមិនជោគជ័យ: ' + (e?.message || 'Network error'), 'error');
      return false;
    }
  };

  // Auto-fetch latest settings, payers & batches from Google Sheets on load
  useEffect(() => {
    if (!settings.webAppUrl?.trim()) return;

    const targetUrl = settings.webAppUrl?.trim() || CURRENT_DEFAULT_WEBAPP;
    const settingsUrl = getProxiedGasUrl(`${targetUrl}?action=get_settings`);

    // 0. Auto-fetch global App Settings from Google Sheets "Settings" tab (ធានាមិនបាត់បង់ទិន្នន័យលើ Vercel)
    fetch(settingsUrl)
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!text || text.trim().startsWith('<')) {
          throw new Error('Response is not valid JSON');
        }
        return JSON.parse(text);
      })
      .then(resData => {
        if (resData && resData.status === 'success' && resData.data && typeof resData.data === 'object') {
          const s = resData.data;
          setSettings(prev => {
            const merged: AppSettings = {
              ...prev,
              spreadsheetId: safeTrim(s.spreadsheetId) || prev.spreadsheetId,
              driveFolderId: safeTrim(s.driveFolderId) || prev.driveFolderId,
              exchangeRate: s.exchangeRate ? Number(s.exchangeRate) : prev.exchangeRate,
              googleClientId: safeTrim(s.googleClientId) || prev.googleClientId,
              allowedEmails: s.allowedEmails !== undefined ? s.allowedEmails : prev.allowedEmails,
              adminPin: safeTrim(s.adminPin) || prev.adminPin,
              telegramBotToken: safeTrim(s.telegramBotToken) || prev.telegramBotToken,
              telegramChatId: safeTrim(s.telegramChatId) || prev.telegramChatId,
              telegramPaymentBotToken: safeTrim(s.telegramPaymentBotToken) || prev.telegramPaymentBotToken,
              telegramPaymentChatId: safeTrim(s.telegramPaymentChatId) || prev.telegramPaymentChatId,
              telegramLogBotToken: safeTrim(s.telegramLogBotToken) || prev.telegramLogBotToken,
              telegramLogChatId: safeTrim(s.telegramLogChatId) || prev.telegramLogChatId,
              telegramLogAlertsEnabled: s.telegramLogAlertsEnabled !== undefined ? (String(s.telegramLogAlertsEnabled).toLowerCase() === 'true' || s.telegramLogAlertsEnabled === true) : prev.telegramLogAlertsEnabled,
              telegramSlipBotToken: safeTrim(s.telegramSlipBotToken) || prev.telegramSlipBotToken,
              telegramSlipChatId: safeTrim(s.telegramSlipChatId) || prev.telegramSlipChatId,
              telegramSlipAlertsEnabled: s.telegramSlipAlertsEnabled !== undefined ? (String(s.telegramSlipAlertsEnabled).toLowerCase() === 'true' || s.telegramSlipAlertsEnabled === true) : prev.telegramSlipAlertsEnabled,
              telegramDistributionBotToken: safeTrim(s.telegramDistributionBotToken) || prev.telegramDistributionBotToken,
              telegramDistributionChatId: safeTrim(s.telegramDistributionChatId) || prev.telegramDistributionChatId,
              telegramDailySummaryEnabled: s.telegramDailySummaryEnabled !== undefined ? (String(s.telegramDailySummaryEnabled).toLowerCase() === 'true' || s.telegramDailySummaryEnabled === true) : prev.telegramDailySummaryEnabled,
              telegramDailySummaryTime: normalizeDailySummaryTime(s.telegramDailySummaryTime || prev.telegramDailySummaryTime),
              postgresBackupAutoEnabled: s.postgresBackupAutoEnabled !== undefined ? (String(s.postgresBackupAutoEnabled).toLowerCase() === 'true' || s.postgresBackupAutoEnabled === true) : prev.postgresBackupAutoEnabled,
              postgresBackupMode: (s.postgresBackupMode === 'INTERVAL' || s.postgresBackupMode === 'DAILY_TIME') ? s.postgresBackupMode : prev.postgresBackupMode,
              postgresBackupTime: safeTrim(s.postgresBackupTime) || prev.postgresBackupTime,
              postgresBackupIntervalHours: s.postgresBackupIntervalHours !== undefined ? Number(s.postgresBackupIntervalHours) : prev.postgresBackupIntervalHours,
              postgresBackupIntervalMinutes: s.postgresBackupIntervalMinutes !== undefined ? Number(s.postgresBackupIntervalMinutes) : prev.postgresBackupIntervalMinutes,
              dataBmSheetUrl: safeTrim(s.dataBmSheetUrl) || prev.dataBmSheetUrl,
              dataBmSheetName: safeTrim(s.dataBmSheetName) || prev.dataBmSheetName,
              followupBmSheetUrl: safeTrim(s.followupBmSheetUrl) || prev.followupBmSheetUrl,
              followupBmSheetName: safeTrim(s.followupBmSheetName) || prev.followupBmSheetName,
              sokimexSheetUrl: safeTrim(s.sokimexSheetUrl) || prev.sokimexSheetUrl,
              sokimexSheetName: safeTrim(s.sokimexSheetName) || prev.sokimexSheetName,
              dataReportSheetUrl: safeTrim(s.dataReportSheetUrl) || prev.dataReportSheetUrl,
              dataReportSheetName: safeTrim(s.dataReportSheetName) || prev.dataReportSheetName,
              meterialOfficeSheetUrl: safeTrim(s.meterialOfficeSheetUrl) || prev.meterialOfficeSheetUrl,
              meterialOfficeSheetName: safeTrim(s.meterialOfficeSheetName) || prev.meterialOfficeSheetName,
              geminiApiKey: safeTrim(s.geminiApiKey) || (prev.geminiApiKey || localStorage.getItem('ial_gemini_api_key') || '')
            };
            if (safeTrim(s.geminiApiKey)) {
              safeLocalStorageSet('ial_gemini_api_key', safeTrim(s.geminiApiKey));
            }
            if (s.dataBmSheetUrl && s.dataBmSheetUrl.trim()) {
              safeLocalStorageSet('accounting_data_bm_sheet_url', s.dataBmSheetUrl.trim());
            }
            if (s.dataBmSheetName && s.dataBmSheetName.trim()) {
              safeLocalStorageSet('accounting_data_bm_sheet_name', s.dataBmSheetName.trim());
            }
            if (s.followupBmSheetUrl && s.followupBmSheetUrl.trim()) {
              safeLocalStorageSet('accounting_followup_bm_sheet_url', s.followupBmSheetUrl.trim());
            }
            if (s.followupBmSheetName && s.followupBmSheetName.trim()) {
              safeLocalStorageSet('accounting_followup_bm_sheet_name', s.followupBmSheetName.trim());
            }
            if (s.sokimexSheetUrl && s.sokimexSheetUrl.trim()) {
              safeLocalStorageSet('accounting_sokimex_sheet_url', s.sokimexSheetUrl.trim());
            }
            if (s.sokimexSheetName && s.sokimexSheetName.trim()) {
              safeLocalStorageSet('accounting_sokimex_sheet_name', s.sokimexSheetName.trim());
            }
            if (s.dataReportSheetUrl && s.dataReportSheetUrl.trim()) {
              safeLocalStorageSet('accounting_data_report_sheet_url', s.dataReportSheetUrl.trim());
            }
            if (s.dataReportSheetName && s.dataReportSheetName.trim()) {
              safeLocalStorageSet('accounting_data_report_sheet_name', s.dataReportSheetName.trim());
            }
            if (s.meterialOfficeSheetUrl && s.meterialOfficeSheetUrl.trim()) {
              safeLocalStorageSet('accounting_meterial_office_sheet_url', s.meterialOfficeSheetUrl.trim());
            }
            if (s.meterialOfficeSheetName && s.meterialOfficeSheetName.trim()) {
              safeLocalStorageSet('accounting_meterial_office_sheet_name', s.meterialOfficeSheetName.trim());
            }
            safeLocalStorageSet(STORAGE_KEY_SETTINGS, JSON.stringify(merged));
            return merged;
          });
        }
      })
      .catch(err => console.warn('Could not auto-fetch settings from Google Sheets:', err));

    // Auto-sync all Sheet configs from local Database (app_config)
    fetch(`/api/app-config?t=${Date.now()}`)
      .then(r => r.json())
      .then(res => {
        if (res && res.status === 'success' && res.data) {
          const cfg = res.data;
          setSettings(prev => {
            const updated = { ...prev };
            if (cfg.data_bm?.sheetUrl) {
              updated.dataBmSheetUrl = cfg.data_bm.sheetUrl;
              safeLocalStorageSet('accounting_data_bm_sheet_url', cfg.data_bm.sheetUrl);
            }
            if (cfg.data_bm?.sheetName) {
              updated.dataBmSheetName = cfg.data_bm.sheetName;
              safeLocalStorageSet('accounting_data_bm_sheet_name', cfg.data_bm.sheetName);
            }
            if (cfg.followup_bm?.sheetUrl) {
              updated.followupBmSheetUrl = cfg.followup_bm.sheetUrl;
              safeLocalStorageSet('accounting_followup_bm_sheet_url', cfg.followup_bm.sheetUrl);
            }
            if (cfg.followup_bm?.sheetName) {
              updated.followupBmSheetName = cfg.followup_bm.sheetName;
              safeLocalStorageSet('accounting_followup_bm_sheet_name', cfg.followup_bm.sheetName);
            }
            if (cfg.sokimex_postpaid?.sheetUrl) {
              updated.sokimexSheetUrl = cfg.sokimex_postpaid.sheetUrl;
              safeLocalStorageSet('accounting_sokimex_sheet_url', cfg.sokimex_postpaid.sheetUrl);
            }
            if (cfg.sokimex_postpaid?.sheetName) {
              updated.sokimexSheetName = cfg.sokimex_postpaid.sheetName;
              safeLocalStorageSet('accounting_sokimex_sheet_name', cfg.sokimex_postpaid.sheetName);
            }
            if (cfg.data_report?.sheetUrl) {
              updated.dataReportSheetUrl = cfg.data_report.sheetUrl;
              safeLocalStorageSet('accounting_data_report_sheet_url', cfg.data_report.sheetUrl);
            }
            if (cfg.data_report?.sheetName) {
              updated.dataReportSheetName = cfg.data_report.sheetName;
              safeLocalStorageSet('accounting_data_report_sheet_name', cfg.data_report.sheetName);
            }
            if (cfg.meterial_office?.sheetUrl) {
              updated.meterialOfficeSheetUrl = cfg.meterial_office.sheetUrl;
              safeLocalStorageSet('accounting_meterial_office_sheet_url', cfg.meterial_office.sheetUrl);
            }
            if (cfg.meterial_office?.sheetName) {
              updated.meterialOfficeSheetName = cfg.meterial_office.sheetName;
              safeLocalStorageSet('accounting_meterial_office_sheet_name', cfg.meterial_office.sheetName);
            }
            safeLocalStorageSet(STORAGE_KEY_SETTINGS, JSON.stringify(updated));
            return updated;
          });
        }
      })
      .catch(() => {});

    // 1. Fetch Payers (staggered slightly to avoid hammering Google Apps Script simultaneously)
    const payersTimer = setTimeout(() => {
      const payersUrl = getProxiedGasUrl(`${targetUrl}?action=get_payers`);
      fetch(payersUrl)
        .then(async res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          if (!text || text.trim().startsWith('<')) {
            throw new Error('Response is not valid JSON');
          }
          return JSON.parse(text);
        })
        .then(data => {
          if (data && data.status === 'success' && Array.isArray(data.data)) {
            savePayersLocally(data.data);
          }
        })
        .catch(err => console.debug('Could not auto-fetch payers from Google Sheets:', err));
    }, 400);

    return () => clearTimeout(payersTimer);
  }, [settings.webAppUrl]);

  // Auto-fetch latest Data tab (Master Barcodes) from Google Sheets on load/settings change,
  // and keep it live (poll + refetch on focus) while the Data page is open
  useEffect(() => {
    if (!settings.spreadsheetId?.trim()) return;

    let inFlight = false;
    const fetchSheetData = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const sheetId = settings.spreadsheetId.trim();
        const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Data&t=${Date.now()}`;
        const res = await fetch(gvizUrl);
        const text = await res.text();

        if (text.includes('google.visualization.Query.setResponse')) {
          const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
          const data = JSON.parse(jsonStr);
          if (data && data.table && Array.isArray(data.table.rows)) {
            const parsed: DatabaseRecord[] = parseGvizDataRecords(data.table);

            if (parsed.length > 0) {
              saveDatabaseRecords(parsed);
            }
          }
        }
      } catch (err) {
        console.warn('Auto-fetch Google Sheet Data warning:', err);
      } finally {
        inFlight = false;
      }
    };

    fetchSheetData();
    if (currentView !== 'DATA') return;

    const DATA_LIVE_POLL_MS = 10000;
    const revalidate = () => {
      if (document.visibilityState === 'visible') fetchSheetData();
    };
    const timer = setInterval(revalidate, DATA_LIVE_POLL_MS);
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
    };
  }, [settings.spreadsheetId, currentView]);

  // Direct Google Sheets Full Refresh (Parallel & Instant in seconds)
  const handleRefreshAllFromGoogleSheets = async (): Promise<boolean> => {
    const hasSheetId = !!settings.spreadsheetId?.trim();
    const hasWebApp = !!settings.webAppUrl?.trim();

    if (!hasSheetId && !hasWebApp) {
      showToast('សូមភ្ជាប់ Google Spreadsheet ID ឬ Web App URL ក្នុងការកំណត់!', 'error');
      return false;
    }

    try {
      showToast('កំពុងទាញយកទិន្នន័យពី Google Sheets (Fast Refresh)...', 'info');
      let successCount = 0;
      let isRestricted = false;

      // 1. Parallel Task 1: Fetch "Data" tab directly from Google Visualization API (GViz)
      const gvizPromise = (async () => {
        if (!hasSheetId) return;
        const sheetId = settings.spreadsheetId.trim();
        try {
          const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Data&t=${Date.now()}`;
          const res = await fetch(gvizUrl);
          const text = await res.text();

          if (text.includes('google.visualization.Query.setResponse')) {
            const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
            const data = JSON.parse(jsonStr);
            if (data && data.table && Array.isArray(data.table.rows)) {
              const parsed: DatabaseRecord[] = parseGvizDataRecords(data.table);

              if (parsed.length > 0) {
                saveDatabaseRecords(parsed);
                successCount += parsed.length;
              }
            }
          } else if (text.includes('<!DOCTYPE html>') || text.includes('accounts.google.com')) {
            isRestricted = true;
          }
        } catch (err) {
          console.warn('GViz fetch failed:', err);
        }
        // Also fetch Collection_Items via GViz in parallel to restore any batches missing items
        try {
          const itemsGvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Collection_Items&t=${Date.now()}`;
          const iRes = await fetch(itemsGvizUrl);
          const iText = await iRes.text();
          if (iText.includes('google.visualization.Query.setResponse')) {
            const iJsonStr = iText.substring(iText.indexOf('{'), iText.lastIndexOf('}') + 1);
            const iData = JSON.parse(iJsonStr);
            if (iData && iData.table && Array.isArray(iData.table.rows)) {
              const itemsByBatch: Record<string, CollectionItem[]> = {};
              iData.table.rows.forEach((row: any, idx: number) => {
                const c = row.c || [];
                const bNum = c[0]?.v !== undefined && c[0]?.v !== null ? String(c[0]?.v).trim() : '';
                if (!bNum) return;
                const tracking = c[1]?.v !== undefined && c[1]?.v !== null ? String(c[1]?.v).trim() : '';
                const name = c[2]?.v !== undefined && c[2]?.v !== null ? String(c[2]?.v).trim() : '';
                const paymentMethod = c[3]?.v !== undefined && c[3]?.v !== null ? String(c[3]?.v).trim() : 'CASH';
                const usd = Number(c[4]?.v) || 0;
                const khm = Number(c[5]?.v) || 0;
                const date = c[6]?.f || (c[6]?.v !== undefined && c[6]?.v !== null ? String(c[6]?.v) : '');

                if (!itemsByBatch[bNum]) itemsByBatch[bNum] = [];
                itemsByBatch[bNum].push({
                  id: `item-${idx + 1}-${tracking}`,
                  tracking,
                  name,
                  paymentMethod,
                  usd,
                  khm,
                  date,
                  createdAt: ''
                });
              });

              setSavedBatches(prev => {
                let changed = false;
                const updated = prev.map(b => {
                  if ((!b.items || b.items.length === 0) && itemsByBatch[b.batchNumber]) {
                    changed = true;
                    return { ...b, items: itemsByBatch[b.batchNumber] };
                  }
                  return b;
                });
                if (changed) {
                  safeLocalStorageSet(STORAGE_KEY_BATCHES, JSON.stringify(updated));
                  return updated;
                }
                return prev;
              });
            }
          }
        } catch (iErr) { }
      })();

      // 2. Parallel Task 2: Fetch from Google Apps Script Web App
      const webAppPromise = (async () => {
        if (!hasWebApp) return;
        try {
          // Attempt unified one-shot retrieval first
          const allRes = await fetch(getProxiedGasUrl(`${settings.webAppUrl.trim()}?action=get_all_data&t=${Date.now()}`));
          if (allRes.ok) {
            const allData = await allRes.json();
            if (allData && allData.status === 'success' && allData.data) {
              if (Array.isArray(allData.data.payers) && allData.data.payers.length > 0) {
                savePayersLocally(allData.data.payers);
                successCount += allData.data.payers.length;
              }
              return;
            }
          }
        } catch (e) { }

        // Concurrent fallback if script is running previous version
        await Promise.allSettled([
          fetch(getProxiedGasUrl(`${settings.webAppUrl.trim()}?action=get_payers&t=${Date.now()}`))
            .then(r => r.ok ? r.json() : null)
            .then(pData => {
              if (pData && pData.status === 'success' && Array.isArray(pData.data) && pData.data.length > 0) {
                savePayersLocally(pData.data);
                successCount += pData.data.length;
              }
            }).catch(() => { }),
          fetch(getProxiedGasUrl(`${settings.webAppUrl.trim()}?action=get_data&t=${Date.now()}`))
            .then(r => r.ok ? r.json() : null)
            .then(dData => {
              if (dData && dData.status === 'success' && Array.isArray(dData.data) && dData.data.length > 0) {
                saveDatabaseRecords(dData.data);
                successCount += dData.data.length;
              }
            }).catch(() => { })
        ]);
      })();

      // Run both GViz and Apps Script simultaneously!
      await Promise.allSettled([gvizPromise, webAppPromise]);

      if (successCount > 0) {
        showToast(`បានទាញយកទិន្នន័យពី Google Sheets ជោគជ័យ! (${successCount} ជួរ)`, 'success');
        return true;
      }

      if (isRestricted) {
        showToast('Google Sheet ស្ថិតក្នុងស្ថានភាព "មានកំណត់ (Restricted)"។ សូម Share ជា "អ្នកដែលមានតំណភ្ជាប់អាចមើលបាន"!', 'error');
        return false;
      }

      showToast('ពុំអាចទាញយកទិន្នន័យបានទេ សូមពិនិត្យមើលតំណភ្ជាប់ និងសិទ្ធិ Share ក្នុង Google Sheets!', 'error');
      return false;
    } catch (e: any) {
      showToast('មិនអាចទាញយកទិន្នន័យ: ' + (e?.message || 'Network error'), 'error');
      return false;
    }
  };

  // Direct Google Sheets Ultra-Fast Bulk Sync for Payers
  const handleSyncAllToGoogleSheets = async (): Promise<boolean> => {
    if (currentUser?.role === 'VIEWER') {
      showToast('សិទ្ធិមើលប៉ុណ្ណោះ (Viewer) មិនអាចធ្វើការ Sync ទៅ Google Sheets បានទេ!', 'error');
      return false;
    }
    if (!settings.webAppUrl?.trim()) {
      showToast('សូមភ្ជាប់ Google Sheets Web App URL ជាមុនសិន!', 'error');
      return false;
    }
    try {
      showToast('កំពុងសមកាលកម្មទិន្នន័យ Payers ទៅកាន់ Google Sheets...', 'info');

      // Primary Ultra-Fast Bulk Sync for Payers only
      await fetch(getProxiedGasUrl(settings.webAppUrl.trim()), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'sync_payers',
          payers: payers,
          user: currentUser?.email
        }),
        mode: 'no-cors'
      });

      showToast('សមកាលកម្មទិន្នន័យ Payers ទៅកាន់ Google Sheets ជោគជ័យ!', 'success');
      return true;
    } catch (e: any) {
      showToast('សមកាលកម្មមិនជោគជ័យ: ' + (e?.message || 'Network error'), 'error');
      return false;
    }
  };

  // Direct Sync: Push all batches & items from Local to Google Sheets
  const handleSyncBatchesToGoogleSheets = async (silent: boolean = false): Promise<boolean> => {
    if (currentUser?.role === 'VIEWER') {
      if (!silent) showToast('សិទ្ធិមើលប៉ុណ្ណោះ (Viewer) មិនអាចធ្វើការ Sync ទៅ Google Sheets បានទេ!', 'error');
      return false;
    }
    if (!settings.webAppUrl?.trim()) {
      if (!silent) showToast('សូមភ្ជាប់ Google Sheets Web App URL ក្នុងការកំណត់ជាមុនសិន!', 'error');
      return false;
    }
    if (!savedBatches || savedBatches.length === 0) {
      if (!silent) showToast('មិនមានកញ្ចប់ទិន្នន័យ (Batches) សម្រាប់ Sync ទៅ Google Sheets ទេ!', 'info');
      return false;
    }
    try {
      const totalItemsCount = savedBatches.reduce((acc, b) => acc + (Array.isArray(b.items) ? b.items.length : 0), 0);
      if (!silent) showToast(`កំពុងទាញទិន្នន័យ ${savedBatches.length} កញ្ចប់ (${totalItemsCount} មុខទំនិញ) ចូល Google Sheets...`, 'info');

      const sanitizedBatches = savedBatches.map(b => ({
        ...b,
        createdAt: formatToStandardDateTime(b.createdAt),
        items: (b.items || []).map(it => ({
          ...it,
          date: formatToStandardDateTime(it.date),
          createdAt: formatToStandardDateTime(it.createdAt || b.createdAt)
        }))
      }));

      await fetch(getProxiedGasUrl(settings.webAppUrl.trim()), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'bulk_save_batches',
          batches: sanitizedBatches,
          user: currentUser?.email
        }),
        mode: 'no-cors'
      });

      if (!silent) showToast(`បានទាញទិន្នន័យ ${savedBatches.length} កញ្ចប់ (${totalItemsCount} មុខទំនិញ) ចូល Google Sheets (Batches & Collection_Items) ជោគជ័យ!`, 'success');
      return true;
    } catch (e: any) {
      if (!silent) showToast('សមកាលកម្មទៅ Google Sheets មិនជោគជ័យ: ' + (e?.message || 'Network error'), 'error');
      return false;
    }
  };

  // Direct Sync: Push all medicine batches & items from Local to Google Sheets (Medicine_Batches & Medicine_Items)
  const handleSyncMedicineBatchesToGoogleSheets = async (silent: boolean = false): Promise<boolean> => {
    if (currentUser?.role === 'VIEWER') {
      if (!silent) showToast('សិទ្ធិមើលប៉ុណ្ណោះ (Viewer) មិនអាចធ្វើការ Sync ទៅ Google Sheets បានទេ!', 'error');
      return false;
    }
    if (!settings.webAppUrl?.trim()) {
      if (!silent) showToast('សូមភ្ជាប់ Google Sheets Web App URL ក្នុងការកំណត់ជាមុនសិន!', 'error');
      return false;
    }
    if (!medicineBatches || medicineBatches.length === 0) {
      if (!silent) showToast('មិនមានកញ្ចប់ថ្នាំពេទ្យ (Medicine Batches) សម្រាប់ Sync ទៅ Google Sheets ទេ!', 'info');
      return false;
    }
    try {
      const totalMedItems = medicineBatches.reduce((acc, b) => acc + (Array.isArray(b.items) ? b.items.length : 0), 0);
      if (!silent) showToast(`កំពុងទាញទិន្នន័យ ${medicineBatches.length} កញ្ចប់ថ្នាំពេទ្យ (${totalMedItems} មុខទំនិញ) ចូល Google Sheets...`, 'info');

      const sanitizedBatches = medicineBatches.map(b => ({
        ...b,
        createdAt: formatToStandardDateTime(b.createdAt),
        items: (b.items || []).map(it => ({
          ...it,
          date: formatToStandardDateTime(it.date),
          createdAt: formatToStandardDateTime(it.createdAt || b.createdAt)
        }))
      }));

      await fetch(getProxiedGasUrl(settings.webAppUrl.trim()), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'bulk_save_medicine_batches',
          batches: sanitizedBatches,
          user: currentUser?.email
        }),
        mode: 'no-cors'
      });

      if (!silent) showToast(`✅ បានទាញទិន្នន័យ ${medicineBatches.length} កញ្ចប់ថ្នាំពេទ្យ (${totalMedItems} មុខទំនិញ) ចូល Google Sheets (Medicine_Batches & Medicine_Items) ជោគជ័យ!`, 'success');
      return true;
    } catch (e: any) {
      if (!silent) showToast('សមកាលកម្មថ្នាំពេទ្យទៅ Google Sheets មិនជោគជ័យ: ' + (e?.message || 'Network error'), 'error');
      return false;
    }
  };

  // Direct Update of Google Sheet Column Headers to match UI
  const handleUpdateGoogleSheetColumns = async (): Promise<boolean> => {
    if (currentUser?.role !== 'ADMIN') {
      showToast('មានតែ Admin ទើបអាច Update Columns ក្នុង Google Sheets បាន!', 'error');
      return false;
    }
    if (!settings.webAppUrl?.trim()) {
      showToast('សូមភ្ជាប់ Google Sheets Web App URL ក្នុងការកំណត់ជាមុនសិន!', 'error');
      return false;
    }
    try {
      showToast('កំពុង Update Columns ក្នុង Google Sheets...', 'info');
      // 1. Send POST request
      await fetch(getProxiedGasUrl(settings.webAppUrl.trim()), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'update_columns',
          user: currentUser?.email
        }),
        mode: 'no-cors'
      });

      // 2. Also send GET request as backup
      fetch(getProxiedGasUrl(`${settings.webAppUrl.trim()}?action=update_columns&t=${Date.now()}`)).catch(() => { });

      // 3. Immediately populate all 13 columns for all permissions into Google Sheets
      if (permissions && permissions.length > 0) {
        syncAllPermissionsToGoogleSheets(permissions, settings.webAppUrl, currentUser?.email).catch(() => {});
      }

      showToast('បាន Update ក្បាលតារាង (Columns) ក្នុង Google Sheets ឱ្យត្រូវជាមួយ UI រួចរាល់!', 'success');
      return true;
    } catch (e: any) {
      showToast('ពុំអាច Update Columns បានទេ: ' + (e?.message || 'Network error'), 'error');
      return false;
    }
  };

  // 5. UI Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isCodeOpen, setIsCodeOpen] = useState(false);
  const [isTelegramPreviewOpen, setIsTelegramPreviewOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Sync theme with HTML class
  useEffect(() => {
    const root = document.documentElement;
    if (settings.darkMode) {
      root.classList.add('dark');
      document.body.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      document.body.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }, [settings.darkMode]);

  // Save Settings to LocalStorage & Sync to Google Sheets "Settings" tab (ធានារក្សាទុកជាប់រហូតលើ Vercel)
  const handleSaveSettings = (newSettings: Partial<AppSettings>) => {
    const isOnlyGeminiKeyUpdate = Object.keys(newSettings).length === 1 && 'geminiApiKey' in newSettings;
    if (currentUser?.role !== 'ADMIN' && !isOnlyGeminiKeyUpdate) {
      showToast('មានតែ Admin ទើបអាចកែប្រែការកំណត់ប្រព័ន្ធ (Settings) បាន!', 'error');
      return;
    }
    if (newSettings.geminiApiKey !== undefined) {
      if (newSettings.geminiApiKey && newSettings.geminiApiKey.trim()) {
        safeLocalStorageSet('ial_gemini_api_key', newSettings.geminiApiKey.trim());
      } else {
        localStorage.removeItem('ial_gemini_api_key');
      }
    }
    let mergedSettings: AppSettings = { ...settings, ...newSettings };
    setSettings(prev => {
      mergedSettings = { ...prev, ...newSettings };
      safeLocalStorageSet(STORAGE_KEY_SETTINGS, JSON.stringify(mergedSettings));
      return mergedSettings;
    });

    // 🚀 Sync to Hostinger Remote MySQL Master Database (Real-time Cloud Persistence)
    saveSettingsToMaster(mergedSettings).catch(err => {
      console.warn('MySQL Master save settings warning:', err);
    });

    const targetUrl = newSettings.webAppUrl?.trim() || settings.webAppUrl?.trim();
    // Sync backup schedule to local backend API
    fetch('/api/backup-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: mergedSettings.postgresBackupAutoEnabled !== false,
        mode: mergedSettings.postgresBackupMode || 'DAILY_TIME',
        time: mergedSettings.postgresBackupTime || '18:00',
        intervalHours: mergedSettings.postgresBackupIntervalHours !== undefined ? mergedSettings.postgresBackupIntervalHours : 1,
        intervalMinutes: mergedSettings.postgresBackupIntervalMinutes !== undefined ? mergedSettings.postgresBackupIntervalMinutes : 0
      })
    }).catch(() => {});

    if (targetUrl) {
      showToast('កំពុងរក្សាទុក និង Sync ការកំណត់ទៅ Google Sheets...', 'info');
      (async () => {
        try {
          const payload = {
            action: 'save_settings',
            settings: {
              spreadsheetId: mergedSettings.spreadsheetId || '',
              driveFolderId: mergedSettings.driveFolderId || '',
              exchangeRate: mergedSettings.exchangeRate || 4100,
              googleClientId: mergedSettings.googleClientId || '',
              allowedEmails: mergedSettings.allowedEmails || '',
              adminPin: mergedSettings.adminPin || '',
              telegramBotToken: mergedSettings.telegramBotToken || '',
              telegramChatId: mergedSettings.telegramChatId || '',
              telegramPaymentBotToken: mergedSettings.telegramPaymentBotToken || '',
              telegramPaymentChatId: mergedSettings.telegramPaymentChatId || '',
              telegramLogBotToken: mergedSettings.telegramLogBotToken || '',
              telegramLogChatId: mergedSettings.telegramLogChatId || '',
              telegramLogAlertsEnabled: mergedSettings.telegramLogAlertsEnabled ?? true,
              telegramSlipBotToken: mergedSettings.telegramSlipBotToken || '',
              telegramSlipChatId: mergedSettings.telegramSlipChatId || '',
              telegramSlipAlertsEnabled: mergedSettings.telegramSlipAlertsEnabled ?? true,
              telegramDistributionBotToken: mergedSettings.telegramDistributionBotToken || '',
              telegramDistributionChatId: mergedSettings.telegramDistributionChatId || '',
              telegramDailySummaryEnabled: mergedSettings.telegramDailySummaryEnabled ?? true,
              telegramDailySummaryTime: normalizeDailySummaryTime(mergedSettings.telegramDailySummaryTime),
              dataBmSheetUrl: mergedSettings.dataBmSheetUrl || '',
              dataBmSheetName: mergedSettings.dataBmSheetName || '',
              followupBmSheetUrl: mergedSettings.followupBmSheetUrl || '',
              followupBmSheetName: mergedSettings.followupBmSheetName || '',
              sokimexSheetUrl: mergedSettings.sokimexSheetUrl || '',
              sokimexSheetName: mergedSettings.sokimexSheetName || '',
              dataReportSheetUrl: mergedSettings.dataReportSheetUrl || '',
              dataReportSheetName: mergedSettings.dataReportSheetName || '',
              meterialOfficeSheetUrl: mergedSettings.meterialOfficeSheetUrl || '',
              meterialOfficeSheetName: mergedSettings.meterialOfficeSheetName || '',
              geminiApiKey: mergedSettings.geminiApiKey || '',
              postgresBackupAutoEnabled: mergedSettings.postgresBackupAutoEnabled !== false,
              postgresBackupMode: mergedSettings.postgresBackupMode || 'DAILY_TIME',
              postgresBackupTime: mergedSettings.postgresBackupTime || '18:00',
              postgresBackupIntervalHours: mergedSettings.postgresBackupIntervalHours !== undefined ? mergedSettings.postgresBackupIntervalHours : 1,
              postgresBackupIntervalMinutes: mergedSettings.postgresBackupIntervalMinutes !== undefined ? mergedSettings.postgresBackupIntervalMinutes : 0
            },
            user: currentUser?.email
          };

          await fetch(getProxiedGasUrl(targetUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
            mode: 'no-cors'
          });

          // Backup GET request
          fetch(getProxiedGasUrl(`${targetUrl}?action=save_settings&settings=${encodeURIComponent(JSON.stringify(payload.settings))}&t=${Date.now()}`)).catch(() => { });

          showToast('បានរក្សាទុក និង Sync ការកំណត់ទៅ Google Sheets ជោគជ័យ!', 'success');
        } catch (err: any) {
          console.warn('Could not save settings to Google Sheets:', err);
          showToast('បានរក្សាទុកក្នុង Browser ប៉ុន្តែពុំទាន់ Sync ទៅ Sheets', 'info');
        }
      })();
    } else {
      showToast('បានរក្សាទុកការកំណត់ជោគជ័យ!', 'success');
    }
  };

  const handleToggleTheme = () => {
    const updated = !settings.darkMode;
    const newSettings: AppSettings = { ...settings, darkMode: updated };
    setSettings(newSettings);
    safeLocalStorageSet(STORAGE_KEY_SETTINGS, JSON.stringify(newSettings));

    if (updated) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  };

  // Toast Helper - Memoized with useCallback and deferred update to prevent React setState-in-render warnings
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setTimeout(() => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 4000);
    }, 0);
  }, []);

  // Automated PostgreSQL Database Backup Scheduler
  useEffect(() => {
    if (settings.postgresBackupAutoEnabled === false) return;

    let isBackingUp = false;
    let lastClientRun = 0;

    const checkAutoBackupSchedule = async () => {
      if (isBackingUp) return;
      const now = new Date();
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const todayDateStr = now.toISOString().slice(0, 10);
      const mode = settings.postgresBackupMode || 'DAILY_TIME';

      let isDue = false;

      if (mode === 'INTERVAL') {
        const totalMinutes = ((settings.postgresBackupIntervalHours ?? 1) * 60) + (settings.postgresBackupIntervalMinutes ?? 0);
        const intervalMs = Math.max(totalMinutes, 1) * 60 * 1000;
        const lastBackupStr = localStorage.getItem('last_auto_pg_backup_time');
        const lastBackupTs = lastBackupStr ? parseInt(lastBackupStr, 10) : 0;
        const effectiveLast = Math.max(lastBackupTs, lastClientRun);
        if (Date.now() - effectiveLast >= intervalMs) {
          isDue = true;
        }
      } else {
        // DAILY_TIME mode
        const targetTime = settings.postgresBackupTime || '18:00';
        const [targetHour, targetMin] = targetTime.split(':').map((n: string) => parseInt(n, 10) || 0);
        const lastDailySent = localStorage.getItem('last_auto_pg_backup_date');

        const isTimeOrLater = currentHour > targetHour || (currentHour === targetHour && currentMin >= targetMin);
        if (isTimeOrLater && lastDailySent !== todayDateStr && (Date.now() - lastClientRun > 15 * 60 * 1000)) {
          isDue = true;
        }
      }

      if (!isDue) return;

      // Local PostgreSQL is strictly for local/LAN server; skip automatically on Vercel cloud
      if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
        return;
      }

      isBackingUp = true;
      lastClientRun = Date.now();
      try {
        const res = await fetch('/api/backup-postgres', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && (data.ok || data.status === 'success')) {
          safeLocalStorageSet('last_auto_pg_backup_date', todayDateStr);
          safeLocalStorageSet('last_auto_pg_backup_time', Date.now().toString());

          const destStr = Array.isArray(data.destinations) ? data.destinations.join(' & ') : 'PostgreSQL';
          const recCount = data.records || data.lastBackup?.totalRecords || '';

          const info = {
            ok: true,
            records: recCount,
            destinations: data.destinations || ['Local PostgreSQL'],
            collections: data.lastBackup?.collections,
            msg: `✓ បាន Backup ស្វ័យប្រវត្តិចូល ${destStr} ជោគជ័យ! (${recCount ? `${recCount} ឯកសារ` : ''})`,
            time: new Date().toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            isAuto: true
          };
          safeLocalStorageSet('last_pg_backup_info', JSON.stringify(info));
          showToast(`⚡ Backup ស្វ័យប្រវត្តជោគជ័យ៖ ${recCount} ឯកសារ ចូល ${destStr}`, 'success');
        }
      } catch (e) {
        console.warn('Auto backup background check failed:', e);
      } finally {
        isBackingUp = false;
      }
    };

    // Check every 35 seconds
    const intervalTimer = setInterval(checkAutoBackupSchedule, 35000);
    const initialTimer = setTimeout(checkAutoBackupSchedule, 4000);

    return () => {
      clearInterval(intervalTimer);
      clearTimeout(initialTimer);
    };
  }, [
    settings.postgresBackupAutoEnabled,
    settings.postgresBackupMode,
    settings.postgresBackupTime,
    settings.postgresBackupIntervalHours,
    settings.postgresBackupIntervalMinutes
  ]);

  if (!currentUser) {
    return (
      <div className={settings.darkMode ? 'dark' : ''}>
        <LoginView
          settings={settings}
          permissions={permissions}
          onUpdateSettings={handleSaveSettings}
          onLoginSuccess={handleLoginSuccess}
          onOpenGuide={() => setIsGuideOpen(true)}
          darkMode={settings.darkMode}
          onToggleDarkMode={handleToggleTheme}
        />

        {/* Setup Guide Modal */}
        <React.Suspense fallback={null}>
          {isGuideOpen && (
            <SetupGuideModal
              isOpen={isGuideOpen}
              onClose={() => setIsGuideOpen(false)}
            />
          )}
        </React.Suspense>

        {/* Toast Alerts */}
        {toast && (
          <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
            <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-xs font-semibold ${toast.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : toast.type === 'error'
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-slate-900 text-white border-slate-800'
              }`}>
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
              ) : toast.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-200 shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-blue-300 shrink-0" />
              )}
              <span>{toast.message}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors flex flex-col lg:flex-row font-sans w-full max-w-full overflow-x-hidden">

      {/* Left Sidebar Navigation */}
      <Sidebar
        settings={settings}
        user={currentUser}
        permissions={permissions}
        currentView={currentView}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        onOpenSettings={() => handleNavigate('SETTINGS')}
        onOpenTelegramPreview={() => {
          if (currentUser?.role === 'ADMIN' || (currentUser?.email && isMasterAdmin(currentUser.email))) {
            setIsTelegramPreviewOpen(true);
          } else {
            showToast('មានតែ Admin ទើបអាចចូលប្រើប្រាស់ Telegram Alert បាន!', 'error');
          }
        }}
        onToggleTheme={handleToggleTheme}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
      />

      {/* Main Workspace Area */}
      <div className={`flex-1 flex flex-col min-w-0 max-w-full overflow-x-clip transition-all duration-300 ${isSidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[280px]'
        }`}>
        <main className="flex-1 w-full max-w-full min-w-0 overflow-x-clip transition-all duration-200 px-2 sm:px-3 lg:px-4 py-2 sm:py-3 pb-24 lg:pb-6">
          <ErrorBoundary key={currentView}>
          <React.Suspense fallback={
            <div className="flex items-center justify-center p-16 text-slate-500 font-semibold text-xs gap-2.5">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span>កំពុងដំណើរការទិន្នន័យទំព័រ...</span>
            </div>
          }>
          {currentView === 'PERMISSIONS' ? (
            <UserManagementPage
              users={permissions}
              currentUser={currentUser}
              webAppUrl={settings.webAppUrl}
              onAddUser={handleAddUser}
              onUpdateRole={handleUpdateRole}
              onToggleStatus={handleToggleStatus}
              onToggleViewOnlyOwn={handleToggleViewOnlyOwn}
              onDeleteUser={handleDeleteUser}
              onEditUser={handleEditUser}
              onSyncGooglePermissions={handleSyncGooglePermissions}
              onRefreshMasterData={syncMasterData}
              payers={payers}
            />
          ) : currentView === 'SETTINGS' ? (
            <React.Suspense fallback={
              <div className="flex items-center justify-center p-12 text-slate-500 font-semibold text-xs gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>កំពុងដំណើរការទិន្នន័យការកំណត់...</span>
              </div>
            }>
              <SettingsPage
                settings={settings}
                user={currentUser}
                onSaveSettings={handleSaveSettings}
                onResetData={() => showToast('បានកំណត់ឡើងវិញនូវទិន្នន័យ Local', 'info')}
              />
            </React.Suspense>
          ) : currentView === 'PAYERS' ? (
            <PayerManagementPage
              payers={payers}
              currentUser={currentUser}
              settings={settings}
              onAddPayer={handleAddPayer}
              onUpdatePayer={handleUpdatePayer}
              onDeletePayer={handleDeletePayer}
              onSyncGoogleSheets={handleSyncGooglePayers}
              onRefreshMasterData={syncMasterData}
            />
          ) : currentView === 'DATA' ? (
            <DataManagementPage
              currentUser={currentUser}
              settings={settings}
              batches={savedBatches}
              payers={payers}
              records={databaseRecords}
              onRefreshFromGoogleSheets={handleRefreshAllFromGoogleSheets}
              onSyncToGoogleSheets={handleSyncAllToGoogleSheets}
              onUpdateGoogleSheetColumns={handleUpdateGoogleSheetColumns}
              onUpdateSettings={handleSaveSettings}
            />
          ) : currentView === 'DATA_BM' ? (
            <DataBMPage
              currentUser={currentUser}
              settings={settings}
              onUpdateSettings={handleSaveSettings}
              onShowToast={showToast}
            />
          ) : currentView === 'FOLLOWUP_BM' ? (
            <FollowUpBMPage
              currentUser={currentUser}
              settings={settings}
              onUpdateSettings={handleSaveSettings}
              onShowToast={showToast}
            />
          ) : currentView === 'SOKIMEX_POSTPAID' ? (
            <SokimexPostpaidPage
              currentUser={currentUser}
              settings={settings}
              onUpdateSettings={handleSaveSettings}
              onShowToast={showToast}
            />
          ) : currentView === 'BANK_SLIPS' ? (
            <BankSlipsPage
              currentUser={currentUser}
              permissions={permissions}
              settings={settings}
              onUpdateSettings={handleSaveSettings}
              onShowToast={showToast}
              onRefreshMasterData={syncMasterData}
            />
          ) : currentView === 'DATA_REPORT' ? (
            <React.Suspense fallback={
              <div className="flex items-center justify-center p-12 text-slate-500 font-semibold text-xs gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>កំពុងដំណើរការទំព័រ Data Report...</span>
              </div>
            }>
              <DataReportPage
                currentUser={currentUser}
                permissions={permissions}
                settings={settings}
                onUpdateSettings={handleSaveSettings}
                onShowToast={showToast}
              />
            </React.Suspense>
          ) : currentView === 'METERIAL_OFFICE' ? (
            <React.Suspense fallback={
              <div className="flex items-center justify-center p-12 text-slate-500 font-semibold text-xs gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-600" />
                <span>កំពុងដំណើរការទំព័រ Meterial_Office...</span>
              </div>
            }>
              <MeterialOfficePage
                currentUser={currentUser}
                permissions={permissions}
                settings={settings}
                onUpdateSettings={handleSaveSettings}
                onShowToast={showToast}
              />
            </React.Suspense>
          ) : currentView === 'DISTRIBUTION_REPORT' ? (
            <React.Suspense fallback={
              <div className="flex items-center justify-center p-12 text-slate-500 font-semibold text-xs gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                <span>កំពុងដំណើរការរបាយការណ៍ចែកចាយ...</span>
              </div>
            }>
              <DistributionReportPage
                currentUser={currentUser}
                permissions={permissions}
                settings={settings}
                onShowToast={showToast}
                onNavigateToDataReport={() => handleNavigate('DATA_REPORT')}
                onRefreshMasterData={syncMasterData}
              />
            </React.Suspense>
          ) : (currentView === 'WAREHOUSE' || currentView === 'SCAN_IN' || currentView === 'SCAN_OUT' || currentView === 'OUT_OF_DELIVERY' || currentView === 'HOLD_REMAINING' || currentView === 'ARRIVED_HUB' || currentView === 'RETURN_SHIPMENTS') ? (
            <React.Suspense fallback={
              <div className="flex items-center justify-center p-12 text-slate-500 font-semibold text-xs gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-600" />
                <span>កំពុងដំណើរការគ្រប់គ្រងឃ្លាំង (Warehouse)...</span>
              </div>
            }>
              <WarehouseManagementPage
                currentUser={currentUser}
                permissions={permissions}
                settings={settings}
                payers={payers}
                initialTab={
                  currentView === 'SCAN_OUT'
                    ? 'SCAN_OUT'
                    : currentView === 'OUT_OF_DELIVERY'
                    ? 'OUT_OF_DELIVERY'
                    : currentView === 'HOLD_REMAINING'
                    ? 'HOLD_REMAINING'
                    : currentView === 'ARRIVED_HUB'
                    ? 'ARRIVED_HUB'
                    : currentView === 'RETURN_SHIPMENTS'
                    ? 'RETURN_SHIPMENTS'
                    : 'SCAN_IN'
                }
                onTabChange={(tab) => {
                  setCurrentView(tab);
                  safeLocalStorageSet('accounting_current_view', tab);
                }}
                onShowToast={showToast}
                onRefreshMasterData={syncMasterData}
                onNavigateToDataReport={() => handleNavigate('DATA_REPORT')}
              />
            </React.Suspense>
          ) : currentView === 'IALE_TRACKING' ? (
            <React.Suspense fallback={
              <div className="flex items-center justify-center p-12 text-slate-500 font-semibold text-xs gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>កំពុងដំណើរការទំព័រ IALE Tracking API...</span>
              </div>
            }>
              <IaleTrackingPage
                currentUser={currentUser}
                onShowToast={showToast}
              />
            </React.Suspense>
          ) : currentView === 'TG_BOOKING' ? (
            <React.Suspense fallback={
              <div className="flex items-center justify-center p-12 text-slate-500 font-semibold text-xs gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>កំពុងដំណើរការទំព័រ Telegram Booking...</span>
              </div>
            }>
              <TelegramBookingPage
                currentUser={currentUser}
                payers={payers}
                onShowToast={showToast}
              />
            </React.Suspense>
          ) : currentView === 'CUSTOMERS' ? (
            <React.Suspense fallback={
              <div className="flex items-center justify-center p-12 text-slate-500 font-semibold text-xs gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span>កំពុងដំណើរការទំព័រ Customers...</span>
              </div>
            }>
              <CustomersPage
                currentUser={currentUser}
                onShowToast={showToast}
              />
            </React.Suspense>
          ) : (
            <PaymentCollectionPage
              currentUser={currentUser}
              permissions={permissions}
              exchangeRate={settings.exchangeRate}
              savedBatches={savedBatches}
              payers={payers}
              dataRecords={databaseRecords}
              onCommitBatch={handleCommitBatch}
              onDeleteBatch={handleDeleteBatch}
              onDeleteAllBatches={handleDeleteAllBatches}
              onUpdateGoogleSheetColumns={handleUpdateGoogleSheetColumns}
              onSyncBatchesToGoogleSheets={handleSyncBatchesToGoogleSheets}
              onResendTelegramBatch={handleResendTelegramBatch}
              settings={settings}
              medicineBatches={medicineBatches}
              onCommitMedicineBatch={handleCommitMedicineBatch}
              onDeleteMedicineBatch={handleDeleteMedicineBatch}
              onDeleteAllMedicineBatches={handleDeleteAllMedicineBatches}
              onResendMedicineTelegramBatch={handleResendMedicineTelegramBatch}
              onSyncMedicineBatchesToGoogleSheets={handleSyncMedicineBatchesToGoogleSheets}
              codBatches={codBatches}
              onCommitCodBatch={handleCommitCodBatch}
              onDeleteCodBatch={handleDeleteCodBatch}
              onDeleteAllCodBatches={handleDeleteAllCodBatches}
              onResendCodTelegramBatch={handleResendCodTelegramBatch}
              onSyncCodBatchesToGoogleSheets={handleSyncCodBatchesToGoogleSheets}
              onRefreshMasterData={syncMasterData}
            />
          )}
          </React.Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {/* Modals connected to Navbar - Lazy Loaded with Suspense */}
      <React.Suspense fallback={null}>
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            user={currentUser}
            onSaveSettings={handleSaveSettings}
            onResetData={() => showToast('Settings reset', 'info')}
          />
        )}

        {isGuideOpen && (
          <SetupGuideModal
            isOpen={isGuideOpen}
            onClose={() => setIsGuideOpen(false)}
            onOpenCode={() => {
              setIsGuideOpen(false);
              setIsCodeOpen(true);
            }}
          />
        )}

        {isCodeOpen && (
          <CodeViewerModal
            isOpen={isCodeOpen}
            onClose={() => setIsCodeOpen(false)}
          />
        )}

        {isTelegramPreviewOpen && (currentUser?.role === 'ADMIN' || (currentUser?.email && isMasterAdmin(currentUser.email))) && (
          <TelegramPreviewModal
            isOpen={isTelegramPreviewOpen}
            onClose={() => setIsTelegramPreviewOpen(false)}
            telegramChatId={settings.telegramChatId}
            webAppUrl={settings.webAppUrl}
          />
        )}
      </React.Suspense>

      {/* PWA Mobile Bottom Navigation Dock */}
      <MobileBottomNav
        currentView={currentView}
        onNavigate={handleNavigate}
        onOpenSettings={() => handleNavigate('SETTINGS')}
        user={currentUser}
        permissions={permissions}
        userRole={currentUser?.role}
      />

      {/* Progressive Web App (PWA) Install Prompt */}
      {/* <PWAInstallPrompt /> */}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 sm:top-5 left-1/2 -translate-x-1/2 sm:left-auto sm:right-5 sm:translate-x-0 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className={`px-4 py-2.5 rounded-2xl shadow-xl border text-xs font-semibold flex items-center gap-2 max-w-[92vw] sm:max-w-md ${toast.type === 'success'
            ? 'bg-emerald-600 text-white border-emerald-500'
            : toast.type === 'error'
              ? 'bg-rose-600 text-white border-rose-500'
              : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-700 dark:border-slate-200'
            }`}>
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 shrink-0" />}
            <span className="truncate">{toast.message}</span>
          </div>
        </div>
      )}

    </div>
  );
}
