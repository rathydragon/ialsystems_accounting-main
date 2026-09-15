import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { UserManagementPage } from './components/UserManagementPage';
import { PaymentCollectionPage } from './components/PaymentCollectionPage';
import { PayerManagementPage } from './components/PayerManagementPage';
import { TelegramPreviewModal } from './components/TelegramPreviewModal';
import { SetupGuideModal } from './components/SetupGuideModal';
import { CodeViewerModal } from './components/CodeViewerModal';
import { SettingsModal } from './components/SettingsModal';
import { LoginView } from './components/LoginView';
import { DataManagementPage } from './components/DataManagementPage';
import { AppSettings, AuthUser, UserPermission, UserRole, CollectionBatch, Payer, NavView, DatabaseRecord } from './types';
import { INITIAL_DATABASE_RECORDS } from './data/initialData';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

const STORAGE_KEY_SETTINGS = 'accounting_app_settings_v2';
const STORAGE_KEY_AUTH = 'accounting_app_auth_user_v2';
const STORAGE_KEY_PERMISSIONS = 'accounting_app_user_permissions_v2';
const STORAGE_KEY_BATCHES = 'accounting_app_saved_batches_v1';
const STORAGE_KEY_PAYERS = 'accounting_app_payers_v1';
const STORAGE_KEY_DATABASE_RECORDS = 'accounting_app_database_records_v2';

const INITIAL_PAYERS: Payer[] = [
  {
    id: 'PAY-001',
    name: 'វិចិត្រ (Rider Sokha)',
    phone: '012 345 678',
    category: 'RIDER',
    area: 'ភ្នំពេញ - សែនសុខ',
    status: 'ACTIVE',
    notes: 'ដឹកជញ្ជូនរហ័សប្រចាំតំបន់',
    totalBatches: 12,
    totalUSD: 850.50,
    totalKHR: 1200000,
    createdAt: new Date().toISOString()
  },
  {
    id: 'PAY-002',
    name: 'ក្រុមហ៊ុន ហេងលី (Heng Ly Co)',
    phone: '098 765 432',
    category: 'CUSTOMER',
    area: 'ភ្នំពេញ - ទួលគោក',
    status: 'ACTIVE',
    notes: 'អតិថិជនប្រចាំខែ',
    totalBatches: 5,
    totalUSD: 1420.00,
    totalKHR: 0,
    createdAt: new Date().toISOString()
  },
  {
    id: 'PAY-003',
    name: 'សាខា បឹងកក់ (TK Branch)',
    phone: '077 112 233',
    category: 'BRANCH',
    area: 'ភ្នំពេញ - បឹងកក់',
    status: 'ACTIVE',
    notes: 'បញ្ជូនសាច់ប្រាក់រៀងរាល់ល្ងាច',
    totalBatches: 24,
    totalUSD: 3100.00,
    totalKHR: 4500000,
    createdAt: new Date().toISOString()
  },
  {
    id: 'PAY-004',
    name: 'ដៃគូ ដឹកជញ្ជូន ជេអិនធី (J&T Express)',
    phone: '015 999 888',
    category: 'PARTNER',
    area: 'ទូទាំងប្រទេស',
    status: 'ACTIVE',
    notes: 'ប្រគល់ប្រាក់ COD ប្រចាំសប្តាហ៍',
    totalBatches: 8,
    totalUSD: 2450.00,
    totalKHR: 3200000,
    createdAt: new Date().toISOString()
  }
];

export default function App() {
  // 1. View Navigation State
  const [currentView, setCurrentView] = useState<NavView>('COLLECTION');
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

  // 2. User Permissions State (Loaded dynamically from Storage/Database, NO hardcoded emails)
  const [permissions, setPermissions] = useState<UserPermission[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PERMISSIONS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) { }
    }
    return [];
  });

  const savePermissions = (updated: UserPermission[]) => {
    setPermissions(updated);
    localStorage.setItem(STORAGE_KEY_PERMISSIONS, JSON.stringify(updated));
  };
  // 1. Settings State
  const CURRENT_DEFAULT_WEBAPP = 'https://script.google.com/macros/s/AKfycbz4hsF4zL7WzNzpa2i8K3_4Hz7z8LifY8PTQB4o41HNdXGUkPX0M2aGzKtJ_RmaVGNROw/exec';
  const CURRENT_DEFAULT_GOOGLE_CLIENT_ID = '594375780266-3pu9am9mgelmd08f0fkc06n3m2gho1bn.apps.googleusercontent.com';
  const CURRENT_DEFAULT_ADMIN_PIN = '123456';

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
    const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const defaults: AppSettings = {
      webAppUrl: CURRENT_DEFAULT_WEBAPP,
      telegramBotToken: '',
      telegramChatId: '',
      spreadsheetId: '18prsAT5KK6EwPPJFEX7gcldPJPrvXGD0FJ7eE1ceI-k',
      driveFolderId: '1nsWC8MZaGFz0HGOxwCqzKyRU0IB5kM5w',
      darkMode: prefersDark,
      demoMode: false,
      exchangeRate: 4100,
      googleClientId: (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || CURRENT_DEFAULT_GOOGLE_CLIENT_ID,
      allowedEmails: '',
      adminPin: (import.meta as any).env?.VITE_ADMIN_PIN || CURRENT_DEFAULT_ADMIN_PIN
    };
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure app uses the newly deployed WebApp URL containing delete actions
        const effectiveUrl = (parsed.webAppUrl && parsed.webAppUrl.includes('AKfycbz4hsF4zL7Wz')) 
          ? parsed.webAppUrl 
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
          adminPin: effectiveAdminPin
        };
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(migrated));
        return migrated;
      } catch (e) { }
    }
    return defaults;
  });

  // 2. Authenticated User State
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_AUTH);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) { }
    }
    return null;
  });

  const handleLoginSuccess = (user: AuthUser) => {
    const userEmail = user.email.toLowerCase().trim();
    const existing = permissions.find(p => p.email.toLowerCase() === userEmail);

    if (existing) {
      if (existing.status === 'SUSPENDED') {
        showToast('គណនីរបស់អ្នកត្រូវបានផ្អាកការប្រើប្រាស់ (Account Suspended)', 'error');
        return;
      }
      user.role = existing.role;
      // Update last login
      const updatedPermissions = permissions.map(p =>
        p.id === existing.id ? { ...p, lastLogin: new Date().toISOString() } : p
      );
      savePermissions(updatedPermissions);
    } else {
      // First person to log in becomes primary ADMIN, subsequent users default to VIEWER until upgraded by Admin
      const isFirstUser = permissions.length === 0;
      const defaultRole: UserRole = isFirstUser ? 'ADMIN' : 'VIEWER';
      user.role = defaultRole;
      const newPerm: UserPermission = {
        id: 'u-' + Date.now(),
        email: user.email,
        name: user.name,
        role: defaultRole,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      savePermissions([...permissions, newPerm]);
    }

    setCurrentUser(user);
    localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(user));
    showToast(`ស្វាគមន៍ការចូលប្រើប្រព័ន្ធ, ${user.name}! (${user.role})`, 'success');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEY_AUTH);
    showToast('បានចាកចេញពីប្រព័ន្ធដោយជោគជ័យ!', 'info');
  };

  // User Permissions Management Handlers
  const handleAddUser = (newUser: Omit<UserPermission, 'id' | 'createdAt'>): boolean => {
    const perm: UserPermission = {
      id: 'u-' + Date.now(),
      ...newUser,
      createdAt: new Date().toISOString()
    };
    const updated = [perm, ...permissions];
    savePermissions(updated);
    showToast(`បានបន្ថែមអ្នកប្រើប្រាស់ ${newUser.email} ដោយជោគជ័យ!`, 'success');
    return true;
  };

  const handleUpdateRole = (id: string, newRole: UserRole) => {
    const updated = permissions.map(u => u.id === id ? { ...u, role: newRole } : u);
    savePermissions(updated);

    // If updated current user, update currentUser state as well
    const targetUser = permissions.find(u => u.id === id);
    if (targetUser && currentUser && targetUser.email.toLowerCase() === currentUser.email.toLowerCase()) {
      const updatedCurrent: AuthUser = { ...currentUser, role: newRole };
      setCurrentUser(updatedCurrent);
      localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(updatedCurrent));
    }
    showToast('បានកែប្រែកម្រិតសិទ្ធិ (Role) រួចរាល់!', 'success');
  };

  const handleToggleStatus = (id: string) => {
    const updated = permissions.map(u => {
      if (u.id === id) {
        const nextStatus: 'ACTIVE' | 'SUSPENDED' = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
        return { ...u, status: nextStatus };
      }
      return u;
    });
    savePermissions(updated);
    showToast('បានប្តូរស្ថានភាពគណនីរួចរាល់!', 'info');
  };

  const handleDeleteUser = (id: string) => {
    const updated = permissions.filter(u => u.id !== id);
    savePermissions(updated);
    showToast('បានលុបអ្នកប្រើប្រាស់ចេញពីប្រព័ន្ធ!', 'info');
  };

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

  const handleCommitBatch = async (batchData: Omit<CollectionBatch, 'id' | 'createdAt'>): Promise<boolean> => {
    const newBatch: CollectionBatch = {
      ...batchData,
      id: 'batch-' + Date.now(),
      createdAt: new Date().toISOString(),
      syncedToGoogle: false
    };

    const updatedBatches = [newBatch, ...savedBatches];
    setSavedBatches(updatedBatches);
    localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(updatedBatches));

    // 1. Send Telegram Notification if configured
    if (settings.telegramBotToken?.trim() && settings.telegramChatId?.trim()) {
      try {
        const token = settings.telegramBotToken.trim();
        const chatId = settings.telegramChatId.trim();
        const tgUrl = `https://api.telegram.org/bot${token}/sendMessage`;
        const text = `📥 *ការទទួលប្រាក់សរុបថ្មី (New Batch Saved)*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `📦 *កញ្ចប់លេខ:* \`${newBatch.batchNumber}\`\n` +
          `👤 *អ្នកកត់ត្រា:* ${newBatch.operator}\n` +
          `🔢 *ចំនួនវិក្កយបត្រ:* ${newBatch.totalItems} ជួរ\n` +
          `💵 *សរុប USD:* $${newBatch.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
          `៛ *សរុប KHR:* ${newBatch.totalKHR.toLocaleString()} ៛\n` +
          (newBatch.notes ? `📝 *ចំណាំ:* ${newBatch.notes}\n` : '') +
          `⏰ *កាលបរិច្ឆេទ:* ${new Date(newBatch.createdAt).toLocaleString('km-KH')}\n` +
          `━━━━━━━━━━━━━━━━━━`;

        await fetch(tgUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown'
          })
        });
      } catch (err) {
        console.warn('Telegram batch notification warning:', err);
      }
    }

    // 2. Sync to Google Apps Script if webAppUrl is provided
    if (settings.webAppUrl?.trim()) {
      try {
        await fetch(settings.webAppUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'save_collection_batch',
            batch: newBatch,
            user: currentUser?.email
          }),
          mode: 'no-cors'
        });
        newBatch.syncedToGoogle = true;
      } catch (err) {
        console.warn('Google Sheet batch sync warning:', err);
      }
    }

    showToast(`បានរក្សាទុកកញ្ចប់ ${newBatch.batchNumber} សរុប ${newBatch.totalItems} ប្រតិបត្តិការ!`, 'success');
    return true;
  };

  const handleDeleteBatch = async (id: string, batchNumber?: string): Promise<boolean> => {
    const targetBatch = savedBatches.find(b => b.id === id || (batchNumber && b.batchNumber === batchNumber));
    const targetBatchNumber = batchNumber || targetBatch?.batchNumber || id;

    // 1. Remove immediately from local state & localStorage
    const updated = savedBatches.filter(b => b.id !== id && b.batchNumber !== targetBatchNumber);
    setSavedBatches(updated);
    localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(updated));

    // 2. If connected to Google Sheets Web App, delete from Google Sheets too!
    if (settings.webAppUrl?.trim()) {
      showToast(`កំពុងលុបកញ្ចប់ ${targetBatchNumber} ពី Google Sheets...`, 'info');
      try {
        await fetch(settings.webAppUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'delete_batch',
            batchNumber: targetBatchNumber,
            id: id,
            user: currentUser?.email
          }),
          mode: 'no-cors'
        });

        // Send backup GET request
        fetch(`${settings.webAppUrl.trim()}?action=delete_batch&batchNumber=${encodeURIComponent(targetBatchNumber)}&t=${Date.now()}`).catch(() => {});

        showToast(`បានលុបកញ្ចប់ ${targetBatchNumber} ចេញពីប្រព័ន្ធ និង Google Sheets រួចរាល់!`, 'success');
        return true;
      } catch (err: any) {
        showToast(`បានលុបកញ្ចប់ចេញពី UI ប៉ុន្តែពុំទាន់លុបពី Google Sheets: ${err?.message || ''}`, 'info');
        return false;
      }
    } else {
      showToast(`បានលុបកញ្ចប់ ${targetBatchNumber} ចេញពីប្រវត្តិ!`, 'success');
      return true;
    }
  };

  const handleDeleteAllBatches = async (): Promise<boolean> => {
    // 1. Remove immediately from local state & localStorage
    setSavedBatches([]);
    localStorage.removeItem(STORAGE_KEY_BATCHES);

    // 2. If connected to Google Sheets Web App, delete all from Google Sheets too!
    if (settings.webAppUrl?.trim()) {
      showToast('កំពុងលុបរាល់កញ្ចប់ទាំងអស់ពី Google Sheets...', 'info');
      try {
        await fetch(settings.webAppUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'delete_all_batches',
            user: currentUser?.email
          }),
          mode: 'no-cors'
        });

        // Send backup GET request
        fetch(`${settings.webAppUrl.trim()}?action=delete_all_batches&t=${Date.now()}`).catch(() => {});

        showToast('បានលុបរាល់កញ្ចប់ទាំងអស់ចេញពី UI និង Google Sheets រួចរាល់!', 'success');
        return true;
      } catch (err: any) {
        showToast(`បានលុបចេញពី UI ប៉ុន្តែពុំទាន់លុបពី Google Sheets: ${err?.message || ''}`, 'info');
        return false;
      }
    } else {
      showToast('បានលុបរាល់កញ្ចប់ទាំងអស់ចេញពីប្រព័ន្ធ!', 'success');
      return true;
    }
  };

  // 4. Payers / Remitters State (អ្នកប្រគល់ប្រាក់)
  const [payers, setPayers] = useState<Payer[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PAYERS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) { }
    }
    return INITIAL_PAYERS;
  });

  const savePayersLocally = (updated: Payer[]) => {
    setPayers(updated);
    localStorage.setItem(STORAGE_KEY_PAYERS, JSON.stringify(updated));
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
      showToast('កំពុងធ្វើសមកាលកម្មជាមួយ Google Sheets...', 'info');
      // 1. Send all local payers to Google Sheets
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

      // 2. Fetch fresh payers from Google Sheets
      const res = await fetch(`${settings.webAppUrl.trim()}?action=get_payers&t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.status === 'success' && Array.isArray(data.data) && data.data.length > 0) {
          savePayersLocally(data.data);
          showToast(`ធ្វើសមកាលកម្មជោគជ័យ! ទទួលបាន ${data.data.length} នាក់ពី Google Sheets`, 'success');
          return true;
        }
      }
      showToast('បានបញ្ជូនទិន្នន័យទៅ Google Sheets រួចរាល់!', 'success');
      return true;
    } catch (e: any) {
      showToast('សមកាលកម្មមិនជោគជ័យ: ' + (e?.message || 'Network error'), 'error');
      return false;
    }
  };

  // Auto-fetch latest payers & batches from Google Sheets on load
  useEffect(() => {
    if (!settings.webAppUrl?.trim()) return;

    // 1. Fetch Payers
    fetch(`${settings.webAppUrl.trim()}?action=get_payers&t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.status === 'success' && Array.isArray(data.data) && data.data.length > 0) {
          setPayers(data.data);
          localStorage.setItem(STORAGE_KEY_PAYERS, JSON.stringify(data.data));
        }
      })
      .catch(err => console.warn('Could not auto-fetch payers from Google Sheets:', err));

    // 2. Fetch Batches
    fetch(`${settings.webAppUrl.trim()}?action=get_batches&t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.status === 'success' && Array.isArray(data.data)) {
          setSavedBatches(data.data);
          localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(data.data));
        }
      })
      .catch(err => console.warn('Could not auto-fetch batches from Google Sheets:', err));
  }, [settings.webAppUrl]);

  // Auto-fetch latest Data tab from Google Sheets on load/settings change
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
                usd = 0;
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

  // Direct Google Sheets Full Refresh
  const handleRefreshAllFromGoogleSheets = async (): Promise<boolean> => {
    const hasSheetId = !!settings.spreadsheetId?.trim();
    const hasWebApp = !!settings.webAppUrl?.trim();

    if (!hasSheetId && !hasWebApp) {
      showToast('សូមភ្ជាប់ Google Spreadsheet ID ឬ Web App URL ក្នុងការកំណត់!', 'error');
      return false;
    }

    try {
      showToast('កំពុងទាញយកទិន្នន័យពី Google Sheets...', 'info');
      let successCount = 0;
      let isRestricted = false;

      // 1. Fetch "Data" tab directly from Google Visualization API (GViz)
      if (hasSheetId) {
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
                  usd = 0;
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
      }

      // 2. Fetch from Google Apps Script Web App (if provided)
      if (hasWebApp) {
        try {
          // Payers
          const pRes = await fetch(`${settings.webAppUrl.trim()}?action=get_payers&t=${Date.now()}`);
          if (pRes.ok) {
            const pData = await pRes.json();
            if (pData && pData.status === 'success' && Array.isArray(pData.data) && pData.data.length > 0) {
              savePayersLocally(pData.data);
              successCount += pData.data.length;
            }
          }

          // Batches
          const bRes = await fetch(`${settings.webAppUrl.trim()}?action=get_batches&t=${Date.now()}`);
          if (bRes.ok) {
            const bData = await bRes.json();
            if (bData && bData.status === 'success' && Array.isArray(bData.data)) {
              setSavedBatches(bData.data);
              localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(bData.data));
              successCount += bData.data.length;
            }
          }

          // Data tab
          const dRes = await fetch(`${settings.webAppUrl.trim()}?action=get_data&t=${Date.now()}`);
          if (dRes.ok) {
            const dData = await dRes.json();
            if (dData && dData.status === 'success' && Array.isArray(dData.data) && dData.data.length > 0) {
              saveDatabaseRecords(dData.data);
              successCount += dData.data.length;
            }
          }
        } catch (err) {
          console.warn('Apps Script fetch failed:', err);
        }
      }

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

  // Direct Google Sheets Full Sync
  const handleSyncAllToGoogleSheets = async (): Promise<boolean> => {
    if (!settings.webAppUrl?.trim()) {
      showToast('សូមភ្ជាប់ Google Sheets Web App URL ជាមុនសិន!', 'error');
      return false;
    }
    try {
      showToast('កំពុងសមកាលកម្មទិន្នន័យទាំងអស់ទៅ Google Sheets...', 'info');

      // 1. Sync Payers
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

      // 2. Sync Batches
      for (const batch of savedBatches) {
        await fetch(settings.webAppUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'save_collection_batch',
            batch: batch,
            user: currentUser?.email
          }),
          mode: 'no-cors'
        }).catch(() => {});
      }

      showToast('បានសមកាលកម្មទិន្នន័យទៅកាន់ Google Sheets រួចរាល់!', 'success');
      return true;
    } catch (e: any) {
      showToast('សមកាលកម្មមិនជោគជ័យ: ' + (e?.message || 'Network error'), 'error');
      return false;
    }
  };

  // Direct Update of Google Sheet Column Headers to match UI
  const handleUpdateGoogleSheetColumns = async (): Promise<boolean> => {
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
      fetch(`${settings.webAppUrl.trim()}?action=update_columns&t=${Date.now()}`).catch(() => {});

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

  // Save Settings to LocalStorage
  const handleSaveSettings = (newSettings: Partial<AppSettings>) => {
    setSettings(prev => {
      const merged: AppSettings = { ...prev, ...newSettings };
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(merged));
      return merged;
    });
    showToast('បានរក្សាទុកការកំណត់ជោគជ័យ!', 'success');
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
          onUpdateSettings={handleSaveSettings}
          onLoginSuccess={handleLoginSuccess}
          onOpenGuide={() => setIsGuideOpen(true)}
          darkMode={settings.darkMode}
          onToggleDarkMode={handleToggleTheme}
        />

        {/* Setup Guide Modal */}
        <SetupGuideModal
          isOpen={isGuideOpen}
          onClose={() => setIsGuideOpen(false)}
        />

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
        onNavigate={setCurrentView}
        onLogout={handleLogout}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenTelegramPreview={() => setIsTelegramPreviewOpen(true)}
        onToggleTheme={handleToggleTheme}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
      />

      {/* Main Workspace Area */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[260px]'
        }`}>
        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-6 transition-all duration-200">
          {currentView === 'PERMISSIONS' ? (
            <UserManagementPage
              users={permissions}
              currentUser={currentUser}
              onAddUser={handleAddUser}
              onUpdateRole={handleUpdateRole}
              onToggleStatus={handleToggleStatus}
              onDeleteUser={handleDeleteUser}
            />
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
          ) : (
            <PaymentCollectionPage
              currentUser={currentUser}
              exchangeRate={settings.exchangeRate}
              savedBatches={savedBatches}
              payers={payers}
              dataRecords={databaseRecords}
              onCommitBatch={handleCommitBatch}
              onDeleteBatch={handleDeleteBatch}
              onDeleteAllBatches={handleDeleteAllBatches}
              onUpdateGoogleSheetColumns={handleUpdateGoogleSheetColumns}
            />
          )}
        </main>
      </div>

      {/* Modals connected to Navbar */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        user={currentUser}
        onSaveSettings={handleSaveSettings}
        onResetData={() => showToast('Settings reset', 'info')}
      />

      <SetupGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onOpenCode={() => {
          setIsGuideOpen(false);
          setIsCodeOpen(true);
        }}
      />

      <CodeViewerModal
        isOpen={isCodeOpen}
        onClose={() => setIsCodeOpen(false)}
      />

      <TelegramPreviewModal
        isOpen={isTelegramPreviewOpen}
        onClose={() => setIsTelegramPreviewOpen(false)}
        telegramChatId={settings.telegramChatId}
        webAppUrl={settings.webAppUrl}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
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
