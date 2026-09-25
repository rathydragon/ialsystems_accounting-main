import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { UserManagementPage } from './components/UserManagementPage';
import { PaymentCollectionPage } from './components/PaymentCollectionPage';
import { PayerManagementPage } from './components/PayerManagementPage';
import { LoginView } from './components/LoginView';
import { DataManagementPage } from './components/DataManagementPage';
import { DataBMPage } from './components/DataBMPage';
import { SokimexPostpaidPage } from './components/SokimexPostpaidPage';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { MobileBottomNav } from './components/MobileBottomNav';
import { AppSettings, AuthUser, UserPermission, UserRole, CollectionBatch, CollectionItem, Payer, NavView, DatabaseRecord } from './types';
import { INITIAL_DATABASE_RECORDS } from './data/initialData';
import { CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react';
import {
  subscribeToBatches,
  saveBatchToFirestore,
  deleteBatchFromFirestore,
  deleteAllBatchesFromFirestore,
  subscribeToMedicineBatches,
  saveMedicineBatchToFirestore,
  deleteMedicineBatchFromFirestore,
  deleteAllMedicineBatchesFromFirestore
} from './services/batchFirestoreService';
import {
  subscribeToPermissions,
  savePermissionToFirestore,
  deletePermissionFromFirestore,
  syncAllPermissionsToFirestore,
  isMasterAdmin,
  MASTER_ADMIN_EMAIL,
  IAL_ACCOUNTING_EMAIL,
  DEFAULT_MASTER_ADMIN,
  DEFAULT_IAL_ACCOUNTING,
  DEFAULT_USERS,
  resolveOperator
} from './services/userPermissionService';
import { sendTelegramNotification, formatBatchTelegramMessage } from './services/telegramService';
import { logUserActivity } from './services/activityLogService';
import { formatToStandardDateTime, getCurrentStandardDateTime } from './utils/dateFormatter';

// Code-split modals and pages using React.lazy
const SettingsPage = React.lazy(() => import('./components/SettingsPage').then(m => ({ default: m.SettingsPage })));
const SettingsModal = React.lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const SetupGuideModal = React.lazy(() => import('./components/SetupGuideModal').then(m => ({ default: m.SetupGuideModal })));
const CodeViewerModal = React.lazy(() => import('./components/CodeViewerModal').then(m => ({ default: m.CodeViewerModal })));
const TelegramPreviewModal = React.lazy(() => import('./components/TelegramPreviewModal').then(m => ({ default: m.TelegramPreviewModal })));

const STORAGE_KEY_SETTINGS = 'accounting_app_settings_v2';
const STORAGE_KEY_AUTH = 'accounting_app_auth_user_v2';
const STORAGE_KEY_PERMISSIONS = 'accounting_app_user_permissions_v2';
const STORAGE_KEY_BATCHES = 'accounting_app_saved_batches_v1';
const STORAGE_KEY_MEDICINE_BATCHES = 'accounting_medicine_batches_v1';
const STORAGE_KEY_PAYERS = 'accounting_app_payers_v3';
const STORAGE_KEY_DATABASE_RECORDS = 'accounting_app_database_records_v2';

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

  // 2. View Navigation State (Persistent across page refresh via localStorage & URL hash)
  const [currentView, setCurrentView] = useState<NavView>(() => {
    // Check URL Hash first (e.g. #data, #data_bm, #sokimex_postpaid, #payers, #permissions, #collection, #settings)
    const hash = window.location.hash.replace('#', '').toUpperCase();
    if (hash === 'COLLECTION' || hash === 'PAYERS' || hash === 'DATA' || hash === 'DATA_BM' || hash === 'SOKIMEX_POSTPAID' || hash === 'PERMISSIONS' || hash === 'SETTINGS') {
      return hash as NavView;
    }
    // Check localStorage
    const saved = localStorage.getItem('accounting_current_view');
    if (saved === 'COLLECTION' || saved === 'PAYERS' || saved === 'DATA' || saved === 'DATA_BM' || saved === 'SOKIMEX_POSTPAID' || saved === 'PERMISSIONS' || saved === 'SETTINGS') {
      return saved as NavView;
    }
    return 'COLLECTION';
  });

  const handleNavigate = (view: NavView) => {
    if ((view === 'PERMISSIONS' || view === 'SETTINGS') && currentUser?.role !== 'ADMIN') {
      showToast('ទាមទារសិទ្ធិ Admin ដើម្បីចូលទៅកាន់ផ្នែកនេះ!', 'error');
      return;
    }
    setCurrentView(view);
    localStorage.setItem('accounting_current_view', view);
    window.history.replaceState(null, '', `#${view.toLowerCase()}`);
  };

  // Sync with browser Back / Forward buttons & direct hash navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').toUpperCase();
      if (hash === 'COLLECTION' || hash === 'PAYERS' || hash === 'DATA' || hash === 'DATA_BM' || hash === 'SOKIMEX_POSTPAID' || hash === 'PERMISSIONS' || hash === 'SETTINGS') {
        if ((hash === 'PERMISSIONS' || hash === 'SETTINGS') && currentUser?.role !== 'ADMIN') {
          setCurrentView('COLLECTION');
          return;
        }
        setCurrentView(hash as NavView);
        localStorage.setItem('accounting_current_view', hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentUser?.role]);

  // Ensure non-admin cannot stay on PERMISSIONS or SETTINGS page
  useEffect(() => {
    if ((currentView === 'PERMISSIONS' || currentView === 'SETTINGS') && currentUser && currentUser.role !== 'ADMIN') {
      setCurrentView('COLLECTION');
      localStorage.setItem('accounting_current_view', 'COLLECTION');
      window.history.replaceState(null, '', '#collection');
      showToast('ទាមទារសិទ្ធិ Admin ដើម្បីចូលទៅកាន់ផ្នែកនេះ!', 'info');
    }
  }, [currentView, currentUser]);

  // Ensure currentView is always synced to localStorage and URL Hash
  useEffect(() => {
    localStorage.setItem('accounting_current_view', currentView);
    window.history.replaceState(null, '', `#${currentView.toLowerCase()}`);
  }, [currentView]);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('accounting_sidebar_collapsed') === 'true';
  });

  const handleToggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('accounting_sidebar_collapsed', String(next));
      return next;
    });
  };

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
    localStorage.setItem(STORAGE_KEY_PERMISSIONS, JSON.stringify(updated));
  };
  // 1. Settings State
  const CURRENT_DEFAULT_WEBAPP = (import.meta as any).env?.VITE_GOOGLE_WEBAPP_URL || 'https://script.google.com/macros/s/AKfycbwzhP5p7TjJwyvzL-lHKIGfwiZDex0MEO27n74NOP1nKxfurlLRyfuC6s2OiVSamhmmgw/exec';
  const CURRENT_DEFAULT_GOOGLE_CLIENT_ID = '594375780266-3pu9am9mgelmd08f0fkc06n3m2gho1bn.apps.googleusercontent.com';
  const CURRENT_DEFAULT_ADMIN_PIN = '123456';
  const CURRENT_DEFAULT_FIREBASE_PROJECT_ID = 'ialexpress';
  const CURRENT_DEFAULT_FIREBASE_API_KEY = 'AIzaSyBNXqK2paVb4pvMfxhCXTD6Xj5kna7ZY6I';
  const CURRENT_DEFAULT_FIREBASE_APP_ID = '1:494989224946:web:590a34eace464d1a82d96b';
  const CURRENT_DEFAULT_TELEGRAM_BOT_TOKEN = '8859388289:AAHzv7moxa3Z6-u57sc4YReerEIx5CEAtqg';
  const CURRENT_DEFAULT_TELEGRAM_CHAT_ID = '924306058';
  const CURRENT_DEFAULT_TELEGRAM_PAYMENT_BOT_TOKEN = '8859388289:AAHzv7moxa3Z6-u57sc4YReerEIx5CEAtqg';
  const CURRENT_DEFAULT_TELEGRAM_PAYMENT_CHAT_ID = '924306058';

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
    const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const defaults: AppSettings = {
      webAppUrl: CURRENT_DEFAULT_WEBAPP,
      telegramBotToken: (import.meta as any).env?.VITE_TELEGRAM_BOT_TOKEN || CURRENT_DEFAULT_TELEGRAM_BOT_TOKEN,
      telegramChatId: (import.meta as any).env?.VITE_TELEGRAM_CHAT_ID || CURRENT_DEFAULT_TELEGRAM_CHAT_ID,
      telegramPaymentBotToken: (import.meta as any).env?.VITE_TELEGRAM_PAYMENT_BOT_TOKEN || CURRENT_DEFAULT_TELEGRAM_PAYMENT_BOT_TOKEN,
      telegramPaymentChatId: (import.meta as any).env?.VITE_TELEGRAM_PAYMENT_CHAT_ID || CURRENT_DEFAULT_TELEGRAM_PAYMENT_CHAT_ID,
      spreadsheetId: '18prsAT5KK6EwPPJFEX7gcldPJPrvXGD0FJ7eE1ceI-k',
      driveFolderId: '1nsWC8MZaGFz0HGOxwCqzKyRU0IB5kM5w',
      darkMode: prefersDark,
      demoMode: false,
      exchangeRate: 4100,
      googleClientId: (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || CURRENT_DEFAULT_GOOGLE_CLIENT_ID,
      allowedEmails: '',
      adminPin: (import.meta as any).env?.VITE_ADMIN_PIN || CURRENT_DEFAULT_ADMIN_PIN,
      firebaseApiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || CURRENT_DEFAULT_FIREBASE_API_KEY,
      firebaseProjectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || CURRENT_DEFAULT_FIREBASE_PROJECT_ID,
      firebaseAppId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || CURRENT_DEFAULT_FIREBASE_APP_ID,
      firebaseAuthDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || `${CURRENT_DEFAULT_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      firebaseStorageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || `${CURRENT_DEFAULT_FIREBASE_PROJECT_ID}.appspot.com`,
      firebaseMessagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      dataBmSheetUrl: (import.meta as any).env?.VITE_DATA_BM_SHEET_URL || localStorage.getItem('accounting_data_bm_sheet_url') || 'https://docs.google.com/spreadsheets/d/1C-CYb14ZM146RiD87yjS_rxGmWk1hiB4jkoTDT6O-I8/edit#gid=764804833',
      dataBmSheetName: (import.meta as any).env?.VITE_DATA_BM_SHEET_NAME || localStorage.getItem('accounting_data_bm_sheet_name') || 'Sort_pending',
      sokimexSheetUrl: (import.meta as any).env?.VITE_SOKIMEX_SHEET_URL || localStorage.getItem('accounting_sokimex_sheet_url') || '',
      sokimexSheetName: (import.meta as any).env?.VITE_SOKIMEX_SHEET_NAME || localStorage.getItem('accounting_sokimex_sheet_name') || ''
    };
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const isLegacyUrl = !parsed.webAppUrl || 
          parsed.webAppUrl.includes('AKfycbxKLXGOZ9aHp8bCK2Ki_WatxqxASqgqzycGmBS6cX6xT0WuCa3PnP2AKBVwR0Dx-bQ') ||
          parsed.webAppUrl.includes('AKfycbw9-otiVdPLM3q6D3TnGsG_857KJxQxIbgNrtKOBO-pWSdQBLiIMg4ukE2GoUudnuLrGA') ||
          parsed.webAppUrl.includes('AKfycbxtZF2JGEOFkUM8W8SpAWn_V3yrDCrHf5t089O37kxtjxXporTSNTryLWy0e0nXmBtAcg') ||
          parsed.webAppUrl.includes('AKfycbxM-yx-sP1l4dAT9vBXixWlLLm7Ib8CZl6b_JJq2dHthbh-aRQaIFQC6ZUpYxBVBuyuiw') ||
          parsed.webAppUrl.includes('AKfycbwyK1BfioR6DX2HZUgmk5b-ryp6ZEV-XJQb7AohYLoiSvZfqQ0gex1x1QDefaKF3ELVwQ') ||
          parsed.webAppUrl.includes('AKfycbwQnGyJlO5dYaP8BfBTFHHReqqgb6jY8s5zLUZmHwD3CJGxSSyo0AlDuWaEpOkEwpDDBA') ||
          parsed.webAppUrl.includes('AKfycbxJiu1Cs6kPhXFmjOz3xsdQuvoS7Bde83mOgMF63zEKHjbrv6EYrPkFzDvl_Fg-nxs_6w') ||
          parsed.webAppUrl.includes('AKfycbxQfcoz61kx-rZlyIi3zisSGLvny0NSqjwGjOlIwg4z8cbNEER8gHrHuR4VTiMNL1HDGg') ||
          parsed.webAppUrl.includes('AKfycbwk24BLJcr00Fe3BkNvLalTmPoJE4gltYhw0w-9Um1Ht9MKrw14nVD5hTukUzMn7-ldmA');
        const effectiveUrl = (parsed.webAppUrl && parsed.webAppUrl.trim() && !isLegacyUrl)
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
          driveFolderId: parsed.driveFolderId?.trim() ? parsed.driveFolderId : defaults.driveFolderId,
          googleClientId: effectiveClientId,
          adminPin: effectiveAdminPin,
          telegramBotToken: (parsed.telegramBotToken && parsed.telegramBotToken.trim()) ? parsed.telegramBotToken.trim() : defaults.telegramBotToken,
          telegramChatId: (parsed.telegramChatId && parsed.telegramChatId.trim()) ? parsed.telegramChatId.trim() : defaults.telegramChatId,
          telegramPaymentBotToken: (parsed.telegramPaymentBotToken && parsed.telegramPaymentBotToken.trim()) ? parsed.telegramPaymentBotToken.trim() : defaults.telegramPaymentBotToken,
          telegramPaymentChatId: (parsed.telegramPaymentChatId && parsed.telegramPaymentChatId.trim()) ? parsed.telegramPaymentChatId.trim() : defaults.telegramPaymentChatId,
          firebaseApiKey: (parsed.firebaseApiKey && parsed.firebaseApiKey.trim()) ? parsed.firebaseApiKey.trim() : defaults.firebaseApiKey,
          firebaseProjectId: (parsed.firebaseProjectId && parsed.firebaseProjectId.trim()) ? parsed.firebaseProjectId.trim() : defaults.firebaseProjectId,
          firebaseAppId: (parsed.firebaseAppId && parsed.firebaseAppId.trim()) ? parsed.firebaseAppId.trim() : defaults.firebaseAppId,
          firebaseAuthDomain: (parsed.firebaseAuthDomain && parsed.firebaseAuthDomain.trim()) ? parsed.firebaseAuthDomain.trim() : defaults.firebaseAuthDomain,
          firebaseStorageBucket: (parsed.firebaseStorageBucket && parsed.firebaseStorageBucket.trim()) ? parsed.firebaseStorageBucket.trim() : defaults.firebaseStorageBucket,
          firebaseMessagingSenderId: (parsed.firebaseMessagingSenderId && parsed.firebaseMessagingSenderId.trim()) ? parsed.firebaseMessagingSenderId.trim() : defaults.firebaseMessagingSenderId,
          dataBmSheetUrl: (parsed.dataBmSheetUrl && parsed.dataBmSheetUrl.trim()) ? parsed.dataBmSheetUrl.trim() : (localStorage.getItem('accounting_data_bm_sheet_url') || defaults.dataBmSheetUrl),
          dataBmSheetName: (parsed.dataBmSheetName && parsed.dataBmSheetName.trim()) ? parsed.dataBmSheetName.trim() : (localStorage.getItem('accounting_data_bm_sheet_name') || defaults.dataBmSheetName)
        };
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(migrated));
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
      const masterPerm = permissions.find(p => isMasterAdmin(p.email)) || DEFAULT_MASTER_ADMIN;
      permToSave = { ...masterPerm, name: opInfo.name, role: 'ADMIN', status: 'ACTIVE', lastLogin: new Date().toISOString() };
      const updatedPermissions = permissions.some(p => isMasterAdmin(p.email))
        ? permissions.map(p => isMasterAdmin(p.email) ? permToSave! : p)
        : [permToSave, ...permissions];
      savePermissions(updatedPermissions);
    } else if (userEmail === IAL_ACCOUNTING_EMAIL) {
      user.name = 'IAL Accounting';
      const ialPerm = permissions.find(p => p.email.toLowerCase().trim() === IAL_ACCOUNTING_EMAIL) || DEFAULT_IAL_ACCOUNTING;
      user.role = ialPerm.role;
      permToSave = { ...ialPerm, name: 'IAL Accounting', status: 'ACTIVE', lastLogin: new Date().toISOString() };
      const updatedPermissions = permissions.some(p => p.email.toLowerCase().trim() === IAL_ACCOUNTING_EMAIL)
        ? permissions.map(p => p.email.toLowerCase().trim() === IAL_ACCOUNTING_EMAIL ? permToSave! : p)
        : [...permissions, permToSave];
      savePermissions(updatedPermissions);
    } else if (existing) {
      user.role = existing.role;
      // Update last login
      permToSave = { ...existing, lastLogin: new Date().toISOString(), name: opInfo.name };
      const updatedPermissions = permissions.map(p =>
        p.id === existing.id ? permToSave! : p
      );
      savePermissions(updatedPermissions);
    }

    // 1. Sync to Firebase Firestore immediately so newly logged in user appears on all devices!
    if (permToSave) {
      savePermissionToFirestore(permToSave).catch(err => console.warn('Firestore perm login save error:', err));
      if (settings.webAppUrl?.trim()) {
        fetch(settings.webAppUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'save_permission',
            permission: permToSave,
            user: user.email
          }),
          mode: 'no-cors'
        }).catch(err => console.warn('Google Sheets perm login save error:', err));
      }
    }

    setCurrentUser(user);
    localStorage.removeItem('LOGGED_OUT_EXPLICITLY');
    localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(user));
    showToast(`ស្វាគមន៍ការចូលប្រើប្រព័ន្ធ, ${user.name}! (${user.role})`, 'success');

    // 2. Audit Trail: Log user login activity
    logUserActivity({
      operator: opInfo.name,
      operatorEmail: opInfo.email,
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
      // Ensure Master Admin is present in Firestore
      const masterInList = permissions.some(p => isMasterAdmin(p.email));
      if (!masterInList) {
        savePermissionToFirestore(DEFAULT_MASTER_ADMIN).catch(() => {});
      }
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
        action: 'LOGOUT',
        description: `បានចាកចេញពីប្រព័ន្ធ`
      }).catch(err => console.warn('Log logout activity error:', err));
    }
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEY_AUTH);
    localStorage.setItem('LOGGED_OUT_EXPLICITLY', 'true');
    showToast('បានចាកចេញពីប្រព័ន្ធដោយជោគជ័យ!', 'info');
  };

  // User Permissions Management Handlers (Admin Only)
  const handleAddUser = (newUser: Omit<UserPermission, 'id' | 'createdAt'>): boolean => {
    if (currentUser?.role !== 'ADMIN') {
      showToast('មានតែ Admin ទើបអាចបន្ថែមអ្នកប្រើប្រាស់បាន!', 'error');
      return false;
    }
    const isMaster = isMasterAdmin(newUser.email);
    const perm: UserPermission = {
      id: isMaster ? 'u-master-admin' : 'u-' + Date.now(),
      ...newUser,
      role: isMaster ? 'ADMIN' : newUser.role,
      createdAt: new Date().toISOString()
    };
    const updated = [perm, ...permissions.filter(p => p.email.toLowerCase() !== newUser.email.toLowerCase())];
    savePermissions(updated);

    // 1. Sync to Firestore (Real-time sub-second sync across all devices)
    savePermissionToFirestore(perm).catch(err => console.warn('Firestore perm save warning:', err));

    // 2. Sync to Google Sheets Tab "Permissions" in background
    if (settings.webAppUrl?.trim()) {
      fetch(settings.webAppUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'save_permission',
          permission: perm,
          user: currentUser?.email
        }),
        mode: 'no-cors'
      }).catch(err => console.warn('Google Sheets perm save warning:', err));
    }

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
        updatedTarget = { ...u, role: newRole };
        return updatedTarget;
      }
      return u;
    });
    savePermissions(updated);

    // Sync to Firestore & Google Sheets
    if (updatedTarget) {
      savePermissionToFirestore(updatedTarget).catch(err => console.warn('Firestore perm update warning:', err));
      if (settings.webAppUrl?.trim()) {
        fetch(settings.webAppUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'save_permission',
            permission: updatedTarget,
            user: currentUser?.email
          }),
          mode: 'no-cors'
        }).catch(err => console.warn('Google Sheets perm update warning:', err));
      }
    }

    // If updated current user, update currentUser state as well
    if (targetUser && currentUser && targetUser.email.toLowerCase() === currentUser.email.toLowerCase()) {
      const updatedCurrent: AuthUser = { ...currentUser, role: newRole };
      setCurrentUser(updatedCurrent);
      localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(updatedCurrent));
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
        updatedTarget = { ...u, status: nextStatus };
        return updatedTarget;
      }
      return u;
    });
    savePermissions(updated);

    // Sync to Firestore & Google Sheets
    if (updatedTarget) {
      savePermissionToFirestore(updatedTarget).catch(err => console.warn('Firestore perm status warning:', err));
      if (settings.webAppUrl?.trim()) {
        fetch(settings.webAppUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'save_permission',
            permission: updatedTarget,
            user: currentUser?.email
          }),
          mode: 'no-cors'
        }).catch(err => console.warn('Google Sheets perm status warning:', err));
      }
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
      deletePermissionFromFirestore(targetEmail, targetUser?.id || id).catch(err => console.warn('Firestore perm delete warning:', err));
      if (settings.webAppUrl?.trim()) {
        fetch(settings.webAppUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'delete_permission',
            email: targetEmail,
            id: targetUser?.id || id,
            user: currentUser?.email
          }),
          mode: 'no-cors'
        }).catch(err => console.warn('Google Sheets perm delete warning:', err));
      }
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

  const handleSyncFirebasePermissions = async () => {
    if (currentUser?.role !== 'ADMIN') {
      showToast('មានតែ Admin ទើបអាច Sync សិទ្ធិទៅកាន់ Firebase បាន!', 'error');
      return;
    }
    try {
      const res = await syncAllPermissionsToFirestore(permissions);
      if (res.rootSuccess) {
        showToast(`🎉 បាន Sync អ្នកប្រើប្រាស់ទាំង ${res.count} នាក់ទៅកាន់ Firebase (Permissions Table) ដោយជោគជ័យ!`, 'success');
      } else if (res.subSuccess) {
        showToast(`✓ បានរក្សាទុកក្នុង Firebase (Batches Data)! សូមពិនិត្យបើក Rules ក្នុង Firebase Console ដើម្បីបង្ហាញជា Table ដាច់ដោយឡែក។`, 'info');
      } else {
        showToast('⚠️ មិនអាច Sync ទៅកាន់ Firebase បានឡើយ សូមពិនិត្យ Rules!', 'error');
      }
    } catch (err: any) {
      showToast(`⚠️ កំហុសពេល Sync៖ ${err?.message || 'Error'}`, 'error');
    }
  };

  // Auto-sync permissions to Firestore in background
  useEffect(() => {
    if (permissions && permissions.length > 0) {
      syncAllPermissionsToFirestore(permissions).catch(() => {});
    }
  }, [permissions.length]);

  // Real-time synchronization with Firebase Firestore for Permissions
  useEffect(() => {
    const unsubscribe = subscribeToPermissions(
      (firestorePerms) => {
        if (Array.isArray(firestorePerms) && firestorePerms.length > 0) {
          setPermissions(firestorePerms);
          localStorage.setItem(STORAGE_KEY_PERMISSIONS, JSON.stringify(firestorePerms));

          // If current logged in user role was changed on another device, update active session instantly
          if (currentUser) {
            const myPerm = firestorePerms.find(p => p.email.toLowerCase() === currentUser.email.toLowerCase());
            if (myPerm) {
              if (myPerm.status === 'SUSPENDED') {
                handleLogout();
                showToast('គណនីរបស់អ្នកត្រូវបានផ្អាកដោយ Admin!', 'error');
              } else {
                let needsUpdate = false;
                const updatedMe = { ...currentUser };
                if (myPerm.role !== currentUser.role) {
                  updatedMe.role = myPerm.role;
                  needsUpdate = true;
                  showToast(`សិទ្ធិគណនីត្រូវបានផ្លាស់ប្តូរទៅជា ${myPerm.role}!`, 'info');
                }
                const correctName = currentUser.email.toLowerCase().trim() === IAL_ACCOUNTING_EMAIL
                  ? 'IAL Accounting'
                  : (myPerm.name || currentUser.name);
                if (correctName && currentUser.name !== correctName) {
                  updatedMe.name = correctName;
                  needsUpdate = true;
                }
                if (needsUpdate) {
                  setCurrentUser(updatedMe);
                  localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(updatedMe));
                }
              }
            }
          }
        }
      },
      (err) => {
        console.warn('Firestore permissions subscription warning:', err);
      }
    );
    return () => unsubscribe();
  }, [settings.firebaseProjectId, settings.firebaseApiKey, currentUser?.email]);

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

    const localOnly = prevBatches.filter(p => {
      const key = p.batchNumber || p.id;
      return key && !serverMap.has(key) && !p.syncedToGoogle;
    });

    return [...localOnly, ...merged];
  };

  // Real-time synchronization with Firebase Firestore for Batches & Collection Items
  useEffect(() => {
    const unsubscribe = subscribeToBatches(
      (firestoreBatches) => {
        if (Array.isArray(firestoreBatches)) {
          setSavedBatches(prev => {
            const merged = mergeBatchesWithExisting(firestoreBatches, prev);
            localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(merged));
            return merged;
          });
        }
      },
      (err) => {
        console.warn('Firestore subscription warning:', err);
      }
    );
    return () => unsubscribe();
  }, [settings.firebaseProjectId, settings.firebaseApiKey]);

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

  // Real-time synchronization with Firebase Firestore for Medicine Batches
  useEffect(() => {
    const unsubscribe = subscribeToMedicineBatches(
      (firestoreBatches) => {
        if (Array.isArray(firestoreBatches)) {
          setMedicineBatches(prev => {
            const merged = mergeBatchesWithExisting(firestoreBatches, prev);
            localStorage.setItem(STORAGE_KEY_MEDICINE_BATCHES, JSON.stringify(merged));
            return merged;
          });
        }
      },
      (err) => {
        console.warn('Medicine Firestore subscription warning:', err);
      }
    );
    return () => unsubscribe();
  }, [settings.firebaseProjectId, settings.firebaseApiKey]);

  const handleCommitBatch = async (batchData: Omit<CollectionBatch, 'id' | 'createdAt'>): Promise<boolean> => {
    if (currentUser?.role === 'VIEWER') {
      showToast('សិទ្ធិមើលប៉ុណ្ណោះ (Viewer) មិនអាចកត់ត្រាទិន្នន័យបានឡើយ!', 'error');
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
      id: 'batch-' + Date.now(),
      createdAt: getCurrentStandardDateTime(),
      syncedToGoogle: false,
      items: (batchData.items || []).map(it => ({
        ...it,
        date: formatToStandardDateTime(it.date),
        createdAt: formatToStandardDateTime(it.createdAt)
      }))
    };

    // 1. Instant local persistence & UI update (0ms latency)
    setSavedBatches(prev => {
      const updated = [newBatch, ...prev];
      localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(updated));
      return updated;
    });

    showToast(`បានរក្សាទុកកញ្ចប់ ${newBatch.batchNumber} សរុប ${newBatch.totalItems} ប្រតិបត្តិការ!`, 'success');

    // Audit Trail: Log batch commit activity
    logUserActivity({
      operator: operatorName,
      operatorEmail: operatorEmail,
      action: 'COMMIT_BATCH',
      description: `បានកត់ត្រាកញ្ចប់ ${newBatch.batchNumber} (${newBatch.totalItems} ប្រតិបត្តិការ, USD: $${newBatch.totalUSD.toFixed(2)}, KHR: ${newBatch.totalKHR.toLocaleString()}៛)`,
      batchNumber: newBatch.batchNumber,
      metadata: {
        totalItems: newBatch.totalItems,
        totalUSD: newBatch.totalUSD,
        totalKHR: newBatch.totalKHR,
        reconciliation: newBatch.reconciliation
      }
    }).catch(err => console.warn('Log commit activity error:', err));

    // 2. High-speed asynchronous background sync (Non-blocking)
    (async () => {
      const tasks: Promise<any>[] = [];

      // A. Parallel Telegram Notification (Via secure Backend Proxy or Direct fallback)
      const payToken = (settings.telegramPaymentBotToken?.trim() || settings.telegramBotToken?.trim() || '');
      const payChatId = (settings.telegramPaymentChatId?.trim() || settings.telegramChatId?.trim() || '');

      if ((settings.webAppUrl?.trim() || payToken) && payChatId) {
        const text = formatBatchTelegramMessage(newBatch, false);

        tasks.push(
          sendTelegramNotification({
            webAppUrl: settings.webAppUrl,
            botToken: payToken,
            chatId: payChatId,
            text: text,
            parseMode: 'Markdown',
            botType: 'PAYMENT'
          }).catch(err => console.warn('Telegram batch notification warning:', err))
        );
      }

      // B. Real-time Firebase Firestore Sync (Fast 0ms Concurrency)
      tasks.push(
        saveBatchToFirestore(newBatch).then((saved) => {
          if (saved) {
            setSavedBatches(prev => {
              const updated = prev.map(b => (b.id === newBatch.id || b.batchNumber === newBatch.batchNumber) ? { ...b, syncedToGoogle: true } : b);
              localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(updated));
              return updated;
            });
          }
        }).catch(err => {
          console.warn('Firebase Firestore batch sync error:', err);
        })
      );

      // C. Automatic Asynchronous Background Sync to Google Sheets (Non-blocking)
      if (settings.webAppUrl?.trim()) {
        tasks.push(
          fetch(settings.webAppUrl.trim(), {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'save_collection_batch',
              batch: newBatch,
              user: operatorEmail || currentUser?.email,
              skipTelegram: true
            }),
            mode: 'no-cors',
            signal: AbortSignal.timeout(15000)
          }).catch(err => {
            console.warn('Auto background sync to Google Sheets warning:', err);
          })
        );
      }

      await Promise.allSettled(tasks);
    })();

    return true;
  };

  const handleDeleteBatch = async (id: string, batchNumber?: string): Promise<boolean> => {
    if (currentUser?.role === 'VIEWER') {
      showToast('សិទ្ធិមើលប៉ុណ្ណោះ (Viewer) មិនអាចលុបទិន្នន័យបានឡើយ!', 'error');
      return false;
    }
    const targetBatch = savedBatches.find(b => b.id === id || (batchNumber && b.batchNumber === batchNumber));
    const targetBatchNumber = batchNumber || targetBatch?.batchNumber || id;

    // 1. Remove immediately from local state & localStorage (Instant 0ms update)
    const updated = savedBatches.filter(b => b.id !== id && b.batchNumber !== targetBatchNumber);
    setSavedBatches(updated);
    localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(updated));
    showToast(`បានលុបកញ្ចប់ ${targetBatchNumber} រួចរាល់!`, 'success');

    // Audit Trail: Log delete batch activity
    logUserActivity({
      operator: resolveOperator(currentUser, permissions).name,
      operatorEmail: resolveOperator(currentUser, permissions).email,
      action: 'DELETE_BATCH',
      description: `បានលុបកញ្ចប់ ${targetBatchNumber}`,
      batchNumber: targetBatchNumber
    }).catch(err => console.warn('Log delete batch error:', err));

    // 2. Asynchronously delete from Firebase Firestore in background without blocking UI
    deleteBatchFromFirestore(targetBatchNumber).catch(err => {
      console.warn('Firebase background batch deletion warning:', err);
    });

    // 3. Also delete from Google Sheets in background (Dual POST + GET for maximum reliability)
    if (settings.webAppUrl?.trim()) {
      const url = settings.webAppUrl.trim();
      fetch(url, {
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
      fetch(`${url}${url.includes('?') ? '&' : '?'}action=delete_batch&batchNumber=${encodeURIComponent(targetBatchNumber)}&id=${encodeURIComponent(id)}&t=${Date.now()}`, {
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
    // 1. Remove immediately from local state & localStorage (Instant 0ms update)
    setSavedBatches([]);
    localStorage.removeItem(STORAGE_KEY_BATCHES);
    showToast('បានសម្អាតកញ្ចប់ទាំងអស់ចេញពីប្រព័ន្ធរួចរាល់!', 'success');

    // Audit Trail: Log delete all batches activity
    logUserActivity({
      operator: resolveOperator(currentUser, permissions).name,
      operatorEmail: resolveOperator(currentUser, permissions).email,
      action: 'DELETE_ALL_BATCHES',
      description: `បានសម្អាតកញ្ចប់ទាំងអស់ចេញពីប្រព័ន្ធ`
    }).catch(err => console.warn('Log delete all batches error:', err));

    // 2. Asynchronously delete all batches from Firebase Firestore in background without blocking UI
    deleteAllBatchesFromFirestore().catch(err => {
      console.warn('Firebase background delete-all warning:', err);
    });

    // 3. Also delete all batches from Google Sheets in background (Dual POST + GET)
    if (settings.webAppUrl?.trim()) {
      const url = settings.webAppUrl.trim();
      fetch(url, {
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
      fetch(`${url}${url.includes('?') ? '&' : '?'}action=delete_all_batches&t=${Date.now()}`, {
        mode: 'no-cors'
      }).catch(() => { });
    }

    return true;
  };

  const handleResendTelegramBatch = async (batch: CollectionBatch): Promise<{ success: boolean; message: string }> => {
    const payToken = settings.telegramPaymentBotToken?.trim() || settings.telegramBotToken?.trim() || '';
    const payChatId = settings.telegramPaymentChatId?.trim() || settings.telegramChatId?.trim() || '';

    if (!payToken && !settings.webAppUrl?.trim()) {
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

    try {
      const res = await sendTelegramNotification({
        webAppUrl: settings.webAppUrl,
        botToken: payToken,
        chatId: payChatId,
        text: text,
        parseMode: 'Markdown',
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
      id: 'med-batch-' + Date.now(),
      createdAt: getCurrentStandardDateTime(),
      syncedToGoogle: false,
      items: (batchData.items || []).map(it => ({
        ...it,
        date: formatToStandardDateTime(it.date),
        createdAt: formatToStandardDateTime(it.createdAt)
      }))
    };

    setMedicineBatches(prev => {
      const updated = [newBatch, ...prev];
      localStorage.setItem(STORAGE_KEY_MEDICINE_BATCHES, JSON.stringify(updated));
      return updated;
    });

    showToast(`បានរក្សាទុកកញ្ចប់ថ្នាំពេទ្យ ${newBatch.batchNumber} សរុប ${newBatch.totalItems} ប្រតិបត្តិការ!`, 'success');

    logUserActivity({
      operator: operatorName,
      operatorEmail: operatorEmail,
      action: 'COMMIT_MEDICINE_BATCH',
      description: `បានកត់ត្រាកញ្ចប់ថ្នាំពេទ្យ ${newBatch.batchNumber} (${newBatch.totalItems} ប្រតិបត្តិការ, USD: $${newBatch.totalUSD.toFixed(2)}, KHR: ${newBatch.totalKHR.toLocaleString()}៛)`,
      batchNumber: newBatch.batchNumber,
      metadata: {
        totalItems: newBatch.totalItems,
        totalUSD: newBatch.totalUSD,
        totalKHR: newBatch.totalKHR,
        reconciliation: newBatch.reconciliation
      }
    }).catch(err => console.warn('Log commit medicine activity error:', err));

    (async () => {
      // 1. Telegram Notification
      const payToken = (settings.telegramPaymentBotToken?.trim() || settings.telegramBotToken?.trim() || '');
      const payChatId = (settings.telegramPaymentChatId?.trim() || settings.telegramChatId?.trim() || '');

      if ((settings.webAppUrl?.trim() || payToken) && payChatId) {
        const text = formatBatchTelegramMessage(newBatch, false, 'MEDICINE');
        sendTelegramNotification({
          webAppUrl: settings.webAppUrl,
          botToken: payToken,
          chatId: payChatId,
          text: text,
          parseMode: 'Markdown',
          botType: 'PAYMENT'
        }).catch(err => console.warn('Telegram medicine batch notification warning:', err));
      }

      // 2. Firestore Sync
      saveMedicineBatchToFirestore(newBatch).then((saved) => {
        if (saved) {
          setMedicineBatches(prev => {
            const updated = prev.map(b => (b.id === newBatch.id || b.batchNumber === newBatch.batchNumber) ? { ...b, syncedToGoogle: true } : b);
            localStorage.setItem(STORAGE_KEY_MEDICINE_BATCHES, JSON.stringify(updated));
            return updated;
          });
        }
      }).catch(err => console.warn('Firebase Firestore medicine batch sync error:', err));

      // 3. Automatic Asynchronous Background Sync to Google Sheets (Medicine_Batches & Medicine_Items)
      if (settings.webAppUrl?.trim()) {
        fetch(settings.webAppUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'save_medicine_batch',
            batch: newBatch,
            user: operatorEmail || currentUser?.email,
            skipTelegram: true
          }),
          mode: 'no-cors',
          signal: AbortSignal.timeout(15000)
        }).catch(err => {
          console.warn('Auto background sync medicine batch to Google Sheets warning:', err);
        });
      }
    })();

    return true;
  };

  const handleDeleteMedicineBatch = async (batchIdOrNumber: string): Promise<boolean> => {
    if (currentUser?.role === 'VIEWER') {
      showToast('សិទ្ធិមើលប៉ុណ្ណោះ (Viewer) មិនអាចលុបទិន្នន័យបានឡើយ!', 'error');
      return false;
    }
    const target = medicineBatches.find(b => b.id === batchIdOrNumber || b.batchNumber === batchIdOrNumber);
    const targetBatchNumber = target ? target.batchNumber : batchIdOrNumber;

    setMedicineBatches(prev => {
      const updated = prev.filter(b => b.id !== batchIdOrNumber && b.batchNumber !== batchIdOrNumber);
      localStorage.setItem(STORAGE_KEY_MEDICINE_BATCHES, JSON.stringify(updated));
      return updated;
    });

    showToast(`បានលុបកញ្ចប់ថ្នាំពេទ្យ ${targetBatchNumber} រួចរាល់!`, 'info');

    // Delete from Firestore
    deleteMedicineBatchFromFirestore(batchIdOrNumber).catch(err => console.warn('Delete medicine batch error:', err));

    // Also delete from Google Sheets in background
    if (settings.webAppUrl?.trim()) {
      const url = settings.webAppUrl.trim();
      fetch(url, {
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

      fetch(`${url}${url.includes('?') ? '&' : '?'}action=delete_medicine_batch&batchNumber=${encodeURIComponent(targetBatchNumber)}&id=${encodeURIComponent(batchIdOrNumber)}&t=${Date.now()}`, {
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
    setMedicineBatches([]);
    localStorage.removeItem(STORAGE_KEY_MEDICINE_BATCHES);
    showToast('បានសម្អាតកញ្ចប់ថ្នាំពេទ្យទាំងអស់ចេញពីប្រព័ន្ធរួចរាល់!', 'success');
    deleteAllMedicineBatchesFromFirestore().catch(err => console.warn('Delete all medicine batches error:', err));

    // Also delete from Google Sheets in background
    if (settings.webAppUrl?.trim()) {
      const url = settings.webAppUrl.trim();
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete_all_medicine_batches',
          user: currentUser?.email
        }),
        mode: 'no-cors'
      }).catch(() => { });

      fetch(`${url}${url.includes('?') ? '&' : '?'}action=delete_all_medicine_batches&t=${Date.now()}`, {
        mode: 'no-cors'
      }).catch(() => { });
    }

    return true;
  };

  const handleResendMedicineTelegramBatch = async (batch: CollectionBatch): Promise<{ success: boolean; message: string }> => {
    const payToken = settings.telegramPaymentBotToken?.trim() || settings.telegramBotToken?.trim() || '';
    const payChatId = settings.telegramPaymentChatId?.trim() || settings.telegramChatId?.trim() || '';

    if (!payToken && !settings.webAppUrl?.trim()) {
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
    try {
      const res = await sendTelegramNotification({
        webAppUrl: settings.webAppUrl,
        botToken: payToken,
        chatId: payChatId,
        text: text,
        parseMode: 'Markdown',
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
          localStorage.setItem(STORAGE_KEY_PAYERS, JSON.stringify(cleaned));
          return cleaned;
        }
      } catch (e) { }
    }
    return [];
  });

  const savePayersLocally = (updated: Payer[]) => {
    const cleaned = Array.isArray(updated) ? updated.filter(p => !isDummyMockPayer(p)) : [];
    setPayers(cleaned);
    localStorage.setItem(STORAGE_KEY_PAYERS, JSON.stringify(cleaned));
  };

  // 5. Database Records State (Google Sheets "Data" tab)
  const [databaseRecords, setDatabaseRecords] = useState<DatabaseRecord[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_DATABASE_RECORDS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) { }
    }
    return INITIAL_DATABASE_RECORDS;
  });

  const saveDatabaseRecords = (recs: DatabaseRecord[]) => {
    setDatabaseRecords(recs);
    localStorage.setItem(STORAGE_KEY_DATABASE_RECORDS, JSON.stringify(recs));
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

    if (settings.webAppUrl?.trim()) {
      try {
        fetch(settings.webAppUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'save_payer',
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

    if (updatedPayer && settings.webAppUrl?.trim()) {
      try {
        fetch(settings.webAppUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'save_payer',
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

    if (settings.webAppUrl?.trim()) {
      try {
        fetch(settings.webAppUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'delete_payer',
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

      // 1. Fetch fresh payers directly from Google Sheets
      const res = await fetch(`${settings.webAppUrl.trim()}?action=get_payers&t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.status === 'success' && Array.isArray(data.data) && data.data.length > 0) {
          savePayersLocally(data.data);
          showToast(`ធ្វើសមកាលកម្មជោគជ័យ! ទទួលបាន ${data.data.length} នាក់ពី Google Sheets`, 'success');
          return true;
        }
      }

      // 2. Backup: only send non-dummy payers to Google Sheets if valid
      const validPayers = payers.filter(p => !isDummyMockPayer(p));
      if (validPayers.length > 0) {
        await fetch(settings.webAppUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'sync_payers',
            payers: validPayers,
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
      showToast('កំពុងទាញយកសិទ្ធិអ្នកប្រើប្រាស់ពី Google Sheets...', 'info');
      const res = await fetch(`${settings.webAppUrl.trim()}?action=get_permissions&t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.status === 'success' && Array.isArray(data.data)) {
          for (const perm of data.data) {
            if (perm.email) {
              await savePermissionToFirestore(perm);
            }
          }
          showToast(`បាន Sync សិទ្ធិអ្នកប្រើប្រាស់ពី Google Sheets (${data.data.length}) ជោគជ័យ!`, 'success');
          return true;
        }
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

    // 0. Auto-fetch global App Settings from Google Sheets "Settings" tab (ធានាមិនបាត់បង់ទិន្នន័យលើ Vercel)
    fetch(`${settings.webAppUrl.trim()}?action=get_settings&t=${Date.now()}`)
      .then(res => res.json())
      .then(resData => {
        if (resData && resData.status === 'success' && resData.data && typeof resData.data === 'object') {
          const s = resData.data;
          setSettings(prev => {
            const merged: AppSettings = {
              ...prev,
              spreadsheetId: (s.spreadsheetId && s.spreadsheetId.trim()) ? s.spreadsheetId.trim() : prev.spreadsheetId,
              driveFolderId: (s.driveFolderId && s.driveFolderId.trim()) ? s.driveFolderId.trim() : prev.driveFolderId,
              exchangeRate: s.exchangeRate ? Number(s.exchangeRate) : prev.exchangeRate,
              googleClientId: (s.googleClientId && s.googleClientId.trim()) ? s.googleClientId.trim() : prev.googleClientId,
              allowedEmails: s.allowedEmails !== undefined ? s.allowedEmails : prev.allowedEmails,
              adminPin: (s.adminPin && s.adminPin.trim()) ? s.adminPin.trim() : prev.adminPin,
              telegramBotToken: (s.telegramBotToken && s.telegramBotToken.trim()) ? s.telegramBotToken.trim() : prev.telegramBotToken,
              telegramChatId: (s.telegramChatId && s.telegramChatId.trim()) ? s.telegramChatId.trim() : prev.telegramChatId,
              telegramPaymentBotToken: (s.telegramPaymentBotToken && s.telegramPaymentBotToken.trim()) ? s.telegramPaymentBotToken.trim() : prev.telegramPaymentBotToken,
              telegramPaymentChatId: (s.telegramPaymentChatId && s.telegramPaymentChatId.trim()) ? s.telegramPaymentChatId.trim() : prev.telegramPaymentChatId,
              dataBmSheetUrl: (s.dataBmSheetUrl && s.dataBmSheetUrl.trim()) ? s.dataBmSheetUrl.trim() : prev.dataBmSheetUrl,
              dataBmSheetName: (s.dataBmSheetName && s.dataBmSheetName.trim()) ? s.dataBmSheetName.trim() : prev.dataBmSheetName,
              sokimexSheetUrl: (s.sokimexSheetUrl && s.sokimexSheetUrl.trim()) ? s.sokimexSheetUrl.trim() : prev.sokimexSheetUrl,
              sokimexSheetName: (s.sokimexSheetName && s.sokimexSheetName.trim()) ? s.sokimexSheetName.trim() : prev.sokimexSheetName
            };
            if (s.dataBmSheetUrl && s.dataBmSheetUrl.trim()) {
              localStorage.setItem('accounting_data_bm_sheet_url', s.dataBmSheetUrl.trim());
            }
            if (s.dataBmSheetName && s.dataBmSheetName.trim()) {
              localStorage.setItem('accounting_data_bm_sheet_name', s.dataBmSheetName.trim());
            }
            if (s.sokimexSheetUrl && s.sokimexSheetUrl.trim()) {
              localStorage.setItem('accounting_sokimex_sheet_url', s.sokimexSheetUrl.trim());
            }
            if (s.sokimexSheetName && s.sokimexSheetName.trim()) {
              localStorage.setItem('accounting_sokimex_sheet_name', s.sokimexSheetName.trim());
            }
            localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(merged));
            return merged;
          });
        }
      })
      .catch(err => console.warn('Could not auto-fetch settings from Google Sheets:', err));

    // 1. Fetch Payers
    fetch(`${settings.webAppUrl.trim()}?action=get_payers&t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.status === 'success' && Array.isArray(data.data)) {
          savePayersLocally(data.data);
        }
      })
      .catch(err => console.warn('Could not auto-fetch payers from Google Sheets:', err));
  }, [settings.webAppUrl]);

  // Auto-fetch latest Data tab (Master Barcodes) from Google Sheets on load/settings change
  useEffect(() => {
    if (!settings.spreadsheetId?.trim()) return;

    const fetchSheetData = async () => {
      try {
        const sheetId = settings.spreadsheetId.trim();
        const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=Data&t=${Date.now()}`;
        const res = await fetch(gvizUrl);
        const text = await res.text();

        if (text.includes('google.visualization.Query.setResponse')) {
          const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
          const data = JSON.parse(jsonStr);
          if (data && data.table && Array.isArray(data.table.rows)) {
            const parsed: DatabaseRecord[] = [];
            data.table.rows.forEach((row: any, idx: number) => {
              const c = row.c || [];
              const barcode = c[0]?.v !== undefined && c[0]?.v !== null ? String(c[0]?.v).trim() : '';
              if (!barcode) return;
              const payment = c[1]?.v !== undefined && c[1]?.v !== null ? String(c[1]?.v).trim() : 'CASH';
              let usd = Number(c[2]?.v) || 0;
              let khm = Number(c[3]?.v) || 0;

              // Smart Currency Auto-Correction (e.g. 2.5 in KHM -> USD, 15000 in USD -> KHM)
              if (khm > 0 && khm < 100 && usd === 0) {
                usd = khm;
                khm = 0;
              } else if (usd >= 500 && usd % 100 === 0 && khm === 0) {
                khm = usd;
                khm = 0;
              }
              let dateVal = c[4]?.f || '';
              if (!dateVal && typeof c[4]?.v === 'string' && c[4]?.v.startsWith('Date(')) {
                const parts = c[4].v.replace('Date(', '').replace(')', '').split(',');
                if (parts.length >= 3) {
                  const y = parts[0].trim();
                  const m = Number(parts[1].trim()) + 1;
                  const d = parts[2].trim();
                  dateVal = `${d}-${m}-${y}`;
                }
              }
              if (!dateVal && c[4]?.v !== undefined && c[4]?.v !== null) {
                dateVal = String(c[4].v);
              }

              parsed.push({
                id: `row-${idx + 1}-${barcode}`,
                barcode,
                payment,
                usd,
                khm,
                date: String(dateVal)
              });
            });

            if (parsed.length > 0) {
              saveDatabaseRecords(parsed);
            }
          }
        }
      } catch (err) {
        console.warn('Auto-fetch Google Sheet Data warning:', err);
      }
    };

    fetchSheetData();
  }, [settings.spreadsheetId]);

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
              const parsed: DatabaseRecord[] = [];
              data.table.rows.forEach((row: any, idx: number) => {
                const c = row.c || [];
                const barcode = c[0]?.v !== undefined && c[0]?.v !== null ? String(c[0]?.v).trim() : '';
                if (!barcode) return;
                const payment = c[1]?.v !== undefined && c[1]?.v !== null ? String(c[1]?.v).trim() : 'CASH';
                let usd = Number(c[2]?.v) || 0;
                let khm = Number(c[3]?.v) || 0;

                // Smart Currency Auto-Correction (e.g. 2.5 in KHM -> USD, 15000 in USD -> KHM)
                if (khm > 0 && khm < 100 && usd === 0) {
                  usd = khm;
                  khm = 0;
                } else if (usd >= 500 && usd % 100 === 0 && khm === 0) {
                  khm = usd;
                  khm = 0;
                }
                let dateVal = c[4]?.f || '';
                if (!dateVal && typeof c[4]?.v === 'string' && c[4]?.v.startsWith('Date(')) {
                  const parts = c[4].v.replace('Date(', '').replace(')', '').split(',');
                  if (parts.length >= 3) {
                    const y = parts[0].trim();
                    const m = Number(parts[1].trim()) + 1;
                    const d = parts[2].trim();
                    dateVal = `${d}-${m}-${y}`;
                  }
                }
                if (!dateVal && c[4]?.v !== undefined && c[4]?.v !== null) {
                  dateVal = String(c[4].v);
                }

                parsed.push({
                  id: `row-${idx + 1}-${barcode}`,
                  barcode,
                  payment,
                  usd,
                  khm,
                  date: String(dateVal)
                });
              });

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
                  localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(updated));
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
          const allRes = await fetch(`${settings.webAppUrl.trim()}?action=get_all_data&t=${Date.now()}`);
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
          fetch(`${settings.webAppUrl.trim()}?action=get_payers&t=${Date.now()}`)
            .then(r => r.ok ? r.json() : null)
            .then(pData => {
              if (pData && pData.status === 'success' && Array.isArray(pData.data) && pData.data.length > 0) {
                savePayersLocally(pData.data);
                successCount += pData.data.length;
              }
            }).catch(() => { }),
          fetch(`${settings.webAppUrl.trim()}?action=get_data&t=${Date.now()}`)
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

  // Direct Google Sheets Ultra-Fast Bulk Sync for Payers (Batches are handled by Firebase Firestore)
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
      await fetch(settings.webAppUrl.trim(), {
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

  // Direct Sync: Push all batches & items from Firebase/Local to Google Sheets
  const handleSyncFirebaseToGoogleSheets = async (silent: boolean = false): Promise<boolean> => {
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

      await fetch(settings.webAppUrl.trim(), {
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

  // Direct Sync: Push all medicine batches & items from Firebase/Local to Google Sheets (Medicine_Batches & Medicine_Items)
  const handleSyncMedicineFirebaseToGoogleSheets = async (silent: boolean = false): Promise<boolean> => {
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

      await fetch(settings.webAppUrl.trim(), {
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
      await fetch(settings.webAppUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'update_columns',
          user: currentUser?.email
        }),
        mode: 'no-cors'
      });

      // 2. Also send GET request as backup
      fetch(`${settings.webAppUrl.trim()}?action=update_columns&t=${Date.now()}`).catch(() => { });

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
    if (currentUser?.role !== 'ADMIN') {
      showToast('មានតែ Admin ទើបអាចកែប្រែការកំណត់ប្រព័ន្ធ (Settings) បាន!', 'error');
      return;
    }
    let mergedSettings: AppSettings = { ...settings, ...newSettings };
    setSettings(prev => {
      mergedSettings = { ...prev, ...newSettings };
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(mergedSettings));
      return mergedSettings;
    });

    const targetUrl = newSettings.webAppUrl?.trim() || settings.webAppUrl?.trim();
    if (targetUrl) {
      showToast('កំពុងរក្សាទុក និង Sync ការកំណត់ទៅ Google Sheets...', 'info');
      (async () => {
        try {
          const payload = {
            action: 'save_settings',
            settings: {
              spreadsheetId: mergedSettings.spreadsheetId,
              driveFolderId: mergedSettings.driveFolderId,
              exchangeRate: mergedSettings.exchangeRate,
              googleClientId: mergedSettings.googleClientId,
              allowedEmails: mergedSettings.allowedEmails,
              adminPin: mergedSettings.adminPin,
              telegramBotToken: mergedSettings.telegramBotToken,
              telegramChatId: mergedSettings.telegramChatId,
              telegramPaymentBotToken: mergedSettings.telegramPaymentBotToken,
              telegramPaymentChatId: mergedSettings.telegramPaymentChatId,
              dataBmSheetUrl: mergedSettings.dataBmSheetUrl,
              dataBmSheetName: mergedSettings.dataBmSheetName,
              sokimexSheetUrl: mergedSettings.sokimexSheetUrl,
              sokimexSheetName: mergedSettings.sokimexSheetName
            },
            user: currentUser?.email
          };

          await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
            mode: 'no-cors'
          });

          // Backup GET request
          fetch(`${targetUrl}?action=save_settings&settings=${encodeURIComponent(JSON.stringify(payload.settings))}&t=${Date.now()}`).catch(() => { });

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
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(newSettings));

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

  // Toast Helper
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors flex flex-col lg:flex-row font-sans">

      {/* Left Sidebar Navigation */}
      <Sidebar
        settings={settings}
        user={currentUser}
        currentView={currentView}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        onOpenSettings={() => handleNavigate('SETTINGS')}
        onOpenTelegramPreview={() => setIsTelegramPreviewOpen(true)}
        onToggleTheme={handleToggleTheme}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
      />

      {/* Main Workspace Area */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[260px]'
        }`}>
        <main className={`flex-1 w-full transition-all duration-200 ${
          currentView === 'SOKIMEX_POSTPAID' || currentView === 'DATA_BM'
            ? 'px-2 sm:px-4 lg:px-5 py-2 sm:py-4 pb-24 lg:pb-6'
            : 'px-3 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-3 sm:py-6 pb-28 lg:pb-6'
        }`}>
          {currentView === 'PERMISSIONS' ? (
            <UserManagementPage
              users={permissions}
              currentUser={currentUser}
              webAppUrl={settings.webAppUrl}
              onAddUser={handleAddUser}
              onUpdateRole={handleUpdateRole}
              onToggleStatus={handleToggleStatus}
              onDeleteUser={handleDeleteUser}
              onSyncGooglePermissions={handleSyncGooglePermissions}
              onSyncFirebasePermissions={handleSyncFirebasePermissions}
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
          ) : currentView === 'SOKIMEX_POSTPAID' ? (
            <SokimexPostpaidPage
              currentUser={currentUser}
              settings={settings}
              onUpdateSettings={handleSaveSettings}
              onShowToast={showToast}
            />
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
              onSyncFirebaseToGoogleSheets={handleSyncFirebaseToGoogleSheets}
              onResendTelegramBatch={handleResendTelegramBatch}
              settings={settings}
              medicineBatches={medicineBatches}
              onCommitMedicineBatch={handleCommitMedicineBatch}
              onDeleteMedicineBatch={handleDeleteMedicineBatch}
              onDeleteAllMedicineBatches={handleDeleteAllMedicineBatches}
              onResendMedicineTelegramBatch={handleResendMedicineTelegramBatch}
              onSyncMedicineFirebaseToGoogleSheets={handleSyncMedicineFirebaseToGoogleSheets}
            />
          )}
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

        {isTelegramPreviewOpen && (
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
      />

      {/* Progressive Web App (PWA) Install Prompt */}
      <PWAInstallPrompt />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-5 right-5 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className={`px-4 py-3 rounded-2xl shadow-xl border text-xs font-semibold flex items-center gap-2 ${toast.type === 'success'
            ? 'bg-emerald-600 text-white border-emerald-500'
            : toast.type === 'error'
              ? 'bg-rose-600 text-white border-rose-500'
              : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-700 dark:border-slate-200'
            }`}>
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 shrink-0" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

    </div>
  );
}
